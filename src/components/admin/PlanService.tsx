import { useState, useEffect } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, sendReservationEmail } from "../../lib/supabase";
import type { Reservation, RestaurantTable, DiningArea, OpeningHour } from "../../lib/types";
import { useConfirm } from "./Confirm";

const PLAN_H = 520;
const estMidi = (t: string) => (parseInt(String(t || "0").split(":")[0]) || 0) < 16;
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function libelleDate(ds: string) {
  const d = new Date(ds + "T12:00:00");
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}
// "reçue il y a X" à partir de l'horodatage de création (created_at).
function depuisQuand(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  return `il y a ${j} j`;
}
// Vérifie si une date+heure tombe dans un créneau d'ouverture. Retourne un message si hors créneau, sinon "".
function horsCreneaux(dateStr: string, time: string, hours: OpeningHour[]): string {
  if (!dateStr || !time) return "";
  const d = new Date(dateStr + "T12:00:00");
  const h = hours.find((x) => x.day_of_week === d.getDay());
  const jour = JOURS[d.getDay()];
  if (!h || h.is_closed) return `Le restaurant est habituellement fermé le ${jour}.`;
  const [hh, mm] = time.split(":").map(Number);
  const mins = hh * 60 + (mm || 0);
  const dans = (o: string | null, c: string | null) => {
    if (!o || !c) return false;
    const [oh, om] = o.split(":").map(Number);
    const [ch, cm] = c.split(":").map(Number);
    return mins >= oh * 60 + om && mins <= ch * 60 + cm;
  };
  if (dans(h.lunch_open, h.lunch_close) || dans(h.dinner_open, h.dinner_close)) return "";
  const services: string[] = [];
  if (h.lunch_open) services.push(`midi ${h.lunch_open}–${h.lunch_close}`);
  if (h.dinner_open) services.push(`soir ${h.dinner_open}–${h.dinner_close}`);
  const dispo = services.length ? `Ce ${jour}, service : ${services.join(", ")}.` : `Aucun service le ${jour}.`;
  return `L'heure choisie est hors des créneaux d'ouverture. ${dispo}`;
}

export default function PlanService() {
  const confirm = useConfirm();
  const { rows: resa, reload, insert } = useTable<Reservation>("reservations", "date", true);
  const { rows: tables } = useTable<RestaurantTable>("restaurant_tables", "label");
  const { rows: areas } = useTable<DiningArea>("dining_areas", "position");
  const { rows: hours } = useTable<OpeningHour>("opening_hours", "day_of_week");
  const [date, setDate] = useState(ymd(new Date()));
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [service, setService] = useState<"midi" | "soir">("midi");
  const [filtreStatut, setFiltreStatut] = useState<"toutes" | "attente" | "confirme">("toutes");
  const [drag, setDrag] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [resaEclairee, setResaEclairee] = useState<string | null>(null);
  // Panneau de saisie téléphone (recouvre la colonne de gauche)
  const VIDE = { p: "", n: "", phone: "", email: "", time: "", covers: 2, notes: "" };
  const [saisie, setSaisie] = useState<typeof VIDE | null>(null);
  const [erreurSaisie, setErreurSaisie] = useState("");
  const [avertSaisie, setAvertSaisie] = useState("");

  useEffect(() => { if (!zoneId && areas.length > 0) setZoneId(areas[0].id); }, [areas, zoneId]);

  function decalerJour(n: number) {
    const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); setDate(ymd(d));
  }
  const estAujourdhui = date === ymd(new Date());

  const duService = resa.filter(
    (r) => r.date === date && r.status !== "annule" && (service === "midi" ? estMidi(r.time) : !estMidi(r.time))
  );
  // Réservations en attente sur toute la journée (les deux services) — pour ne rien oublier
  const attenteJour = resa.filter((r) => r.date === date && r.status === "attente");
  // Une table est occupée si elle figure dans les table_ids d'une résa du service.
  // tableOccupee : table_id -> la réservation qui l'occupe.
  const tableOccupee: Record<string, Reservation> = {};
  duService.forEach((r) => { (r.table_ids || []).forEach((tid) => { tableOccupee[tid] = r; }); });

  // Capacité cumulée des tables d'une réservation.
  const capaciteResa = (r: Reservation) =>
    (r.table_ids || []).reduce((s, tid) => s + (tables.find((t) => t.id === tid)?.capacity || 0), 0);
  // Une résa est "complètement placée" si la somme des capacités couvre les couverts.
  const estPlacee = (r: Reservation) => (r.table_ids?.length || 0) > 0 && capaciteResa(r) >= r.covers;

  // Remplace la liste de tables d'une réservation.
  async function setTables(reservationId: string, ids: string[]) {
    const { error } = await supabase.from("reservations").update({ table_ids: ids }).eq("id", reservationId);
    if (!error) reload();
  }
  // Ajoute (ou retire si déjà présente) une table à une réservation.
  async function toggleTable(reservationId: string, tableId: string) {
    const r = resa.find((x) => x.id === reservationId);
    if (!r) return;
    const actuelles = r.table_ids || [];
    const ids = actuelles.includes(tableId)
      ? actuelles.filter((t) => t !== tableId)
      : [...actuelles, tableId];
    await setTables(reservationId, ids);
  }
  async function confirmer(r: Reservation) {
    const { error } = await supabase.from("reservations").update({ status: "confirme" }).eq("id", r.id);
    if (!error) { reload(); if (r.email) sendReservationEmail("confirmation", r); }
  }
  async function marquerNoShow(r: Reservation) {
    const ok = await confirm({
      titre: "Marquer cette réservation comme absente ?",
      message: `${r.customer_name} (${r.covers} couvert${r.covers > 1 ? "s" : ""}, ${r.time}) sera marqué·e absent·e.`,
      confirmer: "Marquer absent",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("reservations").update({ status: "no_show" }).eq("id", r.id);
    if (!error) reload();
  }
  async function annuler(r: Reservation) {
    const ok = await confirm({
      titre: "Annuler cette réservation ?",
      message: `La réservation de ${r.customer_name} (${r.covers} couvert${r.covers > 1 ? "s" : ""}, ${r.time}) sera annulée et ses tables libérées.`,
      confirmer: "Annuler la réservation",
      danger: true,
    });
    if (!ok) return;
    // Annulation : statut annulé + tables libérées (le trigger remet table_id à null).
    const { error } = await supabase.from("reservations").update({ status: "annule", table_ids: [] }).eq("id", r.id);
    if (!error) reload();
  }
  async function enregistrerSaisie() {
    if (!saisie) return;
    if (!saisie.p.trim() || !saisie.phone.trim() || !saisie.time) { setErreurSaisie("Prénom, téléphone et heure sont requis."); return; }
    // Vérification des créneaux : on avertit une première fois, puis on laisse forcer au clic suivant
    const probleme = horsCreneaux(date, saisie.time, hours);
    if (probleme && !avertSaisie) { setAvertSaisie(probleme); return; }
    const reservation: any = {
      customer_name: [saisie.p.trim(), saisie.n.trim()].filter(Boolean).join(" "),
      email: saisie.email.trim(), phone: saisie.phone.trim(),
      date, time: saisie.time, covers: saisie.covers,
      notes: saisie.notes, status: "confirme", source: "telephone",
    };
    const ok = await insert(reservation);
    if (ok) { if (saisie.email.trim()) sendReservationEmail("confirmation", reservation); setSaisie(null); setErreurSaisie(""); setAvertSaisie(""); reload(); }
    else setErreurSaisie("Échec de l'enregistrement.");
  }
  function onDrop(tableId: string) {
    if (!drag) return;
    // Si la table est déjà occupée par une AUTRE réservation, on refuse le drop.
    const occ = tableOccupee[tableId];
    if (occ && occ.id !== drag) { setDrag(null); setSurvol(null); return; }
    toggleTable(drag, tableId);
    setDrag(null); setSurvol(null);
  }

  // Réservations du jour entier (les deux services), hors annulées — pour ne rien oublier à placer
  const duJourEntier = resa.filter((r) => r.date === date && r.status !== "annule");
  const passeStatut = (r: Reservation) => filtreStatut === "toutes" || r.status === filtreStatut;

  // Récap couverts : capacité totale des tables actives (toutes zones), et couverts réservés par service
  const capacite = tables.filter((t) => t.is_active).reduce((s, t) => s + (t.capacity || 0), 0);
  const midiResa = duJourEntier.filter((r) => estMidi(r.time));
  const soirResa = duJourEntier.filter((r) => !estMidi(r.time));
  const couvMidi = midiResa.reduce((s, r) => s + r.covers, 0);
  const couvSoir = soirResa.reduce((s, r) => s + r.covers, 0);
  const recap = {
    midi: { resa: midiResa.length, couv: couvMidi, reste: Math.max(0, capacite - couvMidi) },
    soir: { resa: soirResa.length, couv: couvSoir, reste: Math.max(0, capacite - couvSoir) },
    jour: { resa: duJourEntier.length, couv: couvMidi + couvSoir },
  };

  // "À placer" : réservations de la journée pas (ou pas complètement) placées.
  // Une résa partiellement placée (tables insuffisantes) reste à placer.
  // "À placer" triées par ancienneté de la demande (la plus ancienne en attente
  // d'abord) pour aider à prioriser le traitement.
  const sansTable = duJourEntier
    .filter((r) => !estPlacee(r) && r.status !== "no_show" && passeStatut(r))
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  // "Placées" : réservations complètement placées du service affiché.
  const placees = duService.filter((r) => estPlacee(r) && passeStatut(r));
  const enAttenteActif = filtreStatut === "attente";
  const nbAttente = attenteJour.length;

  // Jours (>= aujourd'hui) ayant au moins une réservation en attente, hors jour
  // déjà affiché. Sert au bandeau de rappel : on voit d'un coup d'œil quels
  // jours ont des demandes à traiter, et un clic y saute directement (jour + service).
  const aujMs = new Date(ymd(new Date()) + "T12:00:00").getTime();
  const joursAttente = Object.values(
    resa
      .filter((r) => r.status === "attente" && r.date !== date && new Date(r.date + "T12:00:00").getTime() >= aujMs)
      .reduce<Record<string, { date: string; n: number; svc: "midi" | "soir"; premier: string }>>((acc, r) => {
        const svc: "midi" | "soir" = estMidi(r.time) ? "midi" : "soir";
        const cur = acc[r.date];
        // Service retenu = celui de la réservation la plus matinale du jour
        if (!cur) acc[r.date] = { date: r.date, n: 1, svc, premier: r.time };
        else {
          cur.n += 1;
          if (r.time < cur.premier) { cur.premier = r.time; cur.svc = svc; }
        }
        return acc;
      }, {})
  ).sort((a, b) => a.date.localeCompare(b.date));

  function carteResa(r: Reservation, placee: boolean) {
    const tablesResa = (r.table_ids || []).map((tid) => tables.find((x) => x.id === tid)).filter(Boolean) as RestaurantTable[];
    const labels = tablesResa.map((x) => x.label).join(", ");
    const capa = capaciteResa(r);
    const manque = Math.max(0, r.covers - capa);
    const partiel = (r.table_ids?.length || 0) > 0 && !placee; // a des tables mais pas assez
    return (
      <div key={r.id}
        className={`ps-resa ${placee ? "placee" : ""} ${partiel ? "partiel" : ""} ${drag === r.id ? "drag" : ""} ${resaEclairee === r.id ? "eclairee" : ""}`}
        draggable onDragStart={() => setDrag(r.id)} onDragEnd={() => { setDrag(null); setSurvol(null); }}
        onClick={() => {
          if (tablesResa.length === 0) return;
          setResaEclairee((cur) => {
            const allume = cur !== r.id;
            const prem = tablesResa[0];
            if (allume && prem?.area_id && prem.area_id !== zoneId) setZoneId(prem.area_id); // bascule sur la zone des tables
            return allume ? r.id : null;
          });
        }}
        style={tablesResa.length > 0 ? { cursor: "pointer" } : undefined}>
        <div className="ps-resa-tete">
          <b><span className={`ps-pastille ${r.status}`} title={r.status === "attente" ? "En attente" : r.status === "no_show" ? "Absent (no-show)" : r.status === "annule" ? "Annulée" : "Confirmée"} />{r.customer_name}</b>
          <span className="ps-heure">{(!placee || enAttenteActif) && <span className="ps-svc">{estMidi(r.time) ? "Midi" : "Soir"}</span>}{r.time}</span>
        </div>
        {r.status === "attente" && r.source === "site" && (
          <div className="ps-resa-recue">Demande reçue {depuisQuand(r.created_at)}</div>
        )}
        <div className="ps-resa-det">
          {r.covers} couvert(s)
          {tablesResa.length > 0 && <> · <b style={{ color: "var(--admin-accent)" }}>Table{tablesResa.length > 1 ? "s" : ""} {labels}</b></>}
          {r.phone && (
            <> · <span className="ps-tel">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {r.phone}
            </span></>
          )}
        </div>
        {partiel && <div className="ps-resa-manque">⚠ Il manque {manque} place{manque > 1 ? "s" : ""} — ajoutez une table (glissez-la ici).</div>}
        {r.status === "no_show" && <div className="ps-resa-noshow-tag">👻 Absent — n'est pas venu</div>}
        {r.notes && <div className="ps-resa-note">📝 {r.notes}</div>}
        <div className="ps-resa-actions">
          {r.status === "attente" && <button className="ps-confirmer" onClick={(e) => { e.stopPropagation(); confirmer(r); }}>✓ Confirmer</button>}
          {(r.status === "attente" || r.status === "confirme") && <button className="ps-noshow-btn" onClick={(e) => { e.stopPropagation(); marquerNoShow(r); }}>Marquer absent</button>}
          {(r.status === "attente" || r.status === "confirme") && <button className="ps-annuler-btn" onClick={(e) => { e.stopPropagation(); annuler(r); }}>Annuler</button>}
          {tablesResa.length > 0 && <button className="ps-detacher" onClick={(e) => { e.stopPropagation(); setTables(r.id, []); }}>Retirer {tablesResa.length > 1 ? "les tables" : "de la table"}</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="ps-wrap">
      <div className="ps-controls">
        <div className="ps-nav-date">
          <button className="ps-fleche" onClick={() => decalerJour(-1)} aria-label="Jour précédent">‹</button>
          <div className="ps-date-courante">{libelleDate(date)}</div>
          <button className="ps-fleche" onClick={() => decalerJour(1)} aria-label="Jour suivant">›</button>
          <button className={`puce ${estAujourdhui ? "active" : ""}`} onClick={() => setDate(ymd(new Date()))}>Auj.</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ps-date-input" />
        </div>
        <div className="ps-compte">
          <button className="btn btn-mini btn-accent" onClick={() => { setSaisie({ ...VIDE, time: service === "midi" ? "12:30" : "19:30" }); setErreurSaisie(""); setAvertSaisie(""); }}>+ Réservation téléphone</button>
        </div>
      </div>

      {joursAttente.length > 0 && (
        <div className="ps-attente-rappel">
          <span className="ps-attente-rappel-lab">En attente d'autres jours :</span>
          {joursAttente.map((j) => (
            <button key={j.date} className="ps-attente-jour" onClick={() => { setDate(j.date); setService(j.svc); }}>
              {libelleDate(j.date)}
              <span className="ps-attente-jour-nb">{j.n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ps-recap">
        <div className="ps-recap-bloc ps-recap-jour">
          <div className="ps-recap-lab">La journée</div>
          <div className="ps-recap-val"><b>{recap.jour.resa}</b> réservation(s) · <b>{recap.jour.couv}</b> couverts</div>
        </div>
        <div className={`ps-recap-bloc ps-recap-clic ${service === "midi" ? "actif" : ""}`} onClick={() => setService("midi")}>
          <div className="ps-recap-lab">Midi</div>
          <div className="ps-recap-val"><b>{recap.midi.resa}</b> résa · <b>{recap.midi.couv}</b> couverts · <span className="ps-reste">{recap.midi.reste} place(s) restante(s)</span></div>
        </div>
        <div className={`ps-recap-bloc ps-recap-clic ${service === "soir" ? "actif" : ""}`} onClick={() => setService("soir")}>
          <div className="ps-recap-lab">Soir</div>
          <div className="ps-recap-val"><b>{recap.soir.resa}</b> résa · <b>{recap.soir.couv}</b> couverts · <span className="ps-reste">{recap.soir.reste} place(s) restante(s)</span></div>
        </div>
      </div>

      <div className="ps-filtres">
        <button className={`puce-mini ${filtreStatut === "toutes" ? "active" : ""}`} onClick={() => setFiltreStatut("toutes")}>Toutes</button>
        <button className={`puce-mini ${filtreStatut === "attente" ? "active" : ""}`} onClick={() => setFiltreStatut("attente")}>En attente{nbAttente > 0 && <span className="ps-pip">{nbAttente}</span>}</button>
        <button className={`puce-mini ${filtreStatut === "confirme" ? "active" : ""}`} onClick={() => setFiltreStatut("confirme")}>Confirmées</button>
      </div>

      <div className="ps-grid">
        <div className="ps-liste">
          {saisie ? (
            <div className="ps-saisie">
              <div className="ps-saisie-tete">
                <h3>Réservation téléphone</h3>
                <button className="ps-saisie-fermer" onClick={() => { setSaisie(null); setErreurSaisie(""); setAvertSaisie(""); }} aria-label="Fermer">✕</button>
              </div>
              <div className="ps-saisie-date">{libelleDate(date)} · {service === "midi" ? "Midi" : "Soir"}</div>
              <div className="ps-saisie-row">
                <div className="champ"><label>Prénom *</label><input value={saisie.p} onChange={(e) => setSaisie({ ...saisie, p: e.target.value })} /></div>
                <div className="champ"><label>Nom</label><input value={saisie.n} onChange={(e) => setSaisie({ ...saisie, n: e.target.value })} /></div>
              </div>
              <div className="ps-saisie-row">
                <div className="champ"><label>Téléphone *</label><input type="tel" value={saisie.phone} onChange={(e) => setSaisie({ ...saisie, phone: e.target.value })} /></div>
                <div className="champ"><label>Email (optionnel)</label><input type="email" value={saisie.email} onChange={(e) => setSaisie({ ...saisie, email: e.target.value })} placeholder="Pour la confirmation" /></div>
              </div>
              <div className="ps-saisie-row">
                <div className="champ"><label>Heure *</label><input type="time" value={saisie.time} onChange={(e) => { setSaisie({ ...saisie, time: e.target.value }); setAvertSaisie(""); }} /></div>
                <div className="champ"><label>Couverts</label><input type="number" min="1" value={saisie.covers} onChange={(e) => setSaisie({ ...saisie, covers: Number(e.target.value) })} /></div>
              </div>
              <div className="champ"><label>Notes</label><input value={saisie.notes} onChange={(e) => setSaisie({ ...saisie, notes: e.target.value })} placeholder="Allergies, occasion…" /></div>
              {erreurSaisie && <div className="login-err">{erreurSaisie}</div>}
              {avertSaisie && <div className="avert-creneau">⚠️ {avertSaisie}<br /><span>Vérifiez l'heure, ou enregistrez malgré tout.</span></div>}
              <button className="btn btn-accent" style={{ width: "100%", marginTop: 4 }} onClick={enregistrerSaisie}>{avertSaisie ? "Enregistrer malgré tout" : "Enregistrer"}</button>
              <div className="ps-saisie-aide">La réservation est ajoutée en « à placer » — glissez-la ensuite sur une table.</div>
            </div>
          ) : (
            <>
              <div className="ps-liste-titre">À placer ({sansTable.length})</div>
              {sansTable.length === 0 && <div className="ps-vide-mini">Aucune réservation à placer.</div>}
              {sansTable.map((r) => carteResa(r, false))}
              {placees.length > 0 && <div className="ps-liste-titre" style={{ marginTop: 16 }}>Placées ({placees.length})</div>}
              {placees.map((r) => carteResa(r, true))}
            </>
          )}
        </div>

        <div className="ps-plan-wrap">
          {areas.length > 1 && (
            <div className="zones-barre" style={{ marginBottom: 10 }}>
              {areas.map((a) => (
                <button key={a.id} className={`zone-onglet ${a.id === zoneId ? "active" : ""}`} onClick={() => setZoneId(a.id)}>{a.name}</button>
              ))}
            </div>
          )}
          <div className="ps-plan" style={{ height: PLAN_H }}>
            {tables.filter((t) => t.is_active && t.area_id === zoneId).map((t) => {
              const occ = tableOccupee[t.id];
              const size = t.capacity > 4 ? 88 : 66;
              // Table éclairée si elle appartient à la réservation actuellement éclairée.
              const eclairee = resaEclairee && occ?.id === resaEclairee;
              // Glisser une résa déjà sur cette table = on la retirera (drop = toggle).
              const dejaDessus = drag && occ?.id === drag;
              // Occupée par une AUTRE réservation = drop interdit (visuel "indispo").
              const prise = occ && drag && occ.id !== drag;
              return (
                <div key={t.id}
                  className={`ps-table ${t.shape === "round" ? "ronde" : "carree"}${occ ? " occupee" : ""}${survol === t.id ? " survol" : ""}${prise ? " trop-petit" : ""}${dejaDessus ? " retrait" : ""}${eclairee ? " eclairee" : ""}`}
                  style={{ left: t.pos_x, top: t.pos_y, width: size, height: size }}
                  onDragOver={(e) => { if (!prise) e.preventDefault(); setSurvol(t.id); }}
                  onDragLeave={() => setSurvol((s) => (s === t.id ? null : s))}
                  onDrop={() => onDrop(t.id)}>
                  <span className="ps-table-label">{t.label}</span>
                  <span className="ps-table-cap">{occ ? occ.customer_name.split(" ")[0] : `${t.capacity} pl.`}</span>
                </div>
              );
            })}
            {tables.filter((t) => t.is_active && t.area_id === zoneId).length === 0 && <div className="ps-vide-plan">Aucune table dans cette zone.</div>}
          </div>
        </div>
      </div>
      <div className="ps-aide">Glissez une réservation vers une table pour l'attribuer. Pour un grand groupe, glissez-la sur plusieurs tables (elles s'additionnent). Reglisser sur une table déjà attribuée la retire.</div>
    </div>
  );
}
