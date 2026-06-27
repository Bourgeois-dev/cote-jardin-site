import { useState, useEffect } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, sendReservationEmail } from "../../lib/supabase";
import type { Reservation, RestaurantTable, DiningArea, OpeningHour } from "../../lib/types";
import { useConfirm } from "./Confirm";

const PLAN_H = 520;
const estMidi = (t: string) => (parseInt(String(t || "0").split(":")[0]) || 0) < 16;
const JOURS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function libelleDate(ds: string) {
  const d = new Date(ds + "T12:00:00");
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}
function libelleDateCourt(ds: string) {
  const d = new Date(ds + "T12:00:00");
  return `${JOURS[d.getDay()].slice(0,3)[0].toUpperCase()}${JOURS[d.getDay()].slice(1,3)}. ${d.getDate()} ${MOIS[d.getMonth()].slice(0,3)}.`;
}
function depuisQuand(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}
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
  return `Hors créneaux. ${services.length ? `Ce ${jour} : ${services.join(", ")}.` : `Aucun service le ${jour}.`}`;
}

export default function PlanService({ initialDate }: { initialDate?: string } = {}) {
  const confirm = useConfirm();
  const dateMin = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0,10); })();
  const { rows: resa, reload, insert } = useTable<Reservation>("reservations", "date", true, { column: "date", op: "gte", value: dateMin });
  const { rows: tables } = useTable<RestaurantTable>("restaurant_tables", "label");
  const { rows: areas } = useTable<DiningArea>("dining_areas", "position");
  const { rows: hours } = useTable<OpeningHour>("opening_hours", "day_of_week");
  const [date, setDate] = useState(initialDate || ymd(new Date()));
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [service, setService] = useState<"midi" | "soir">("midi");
  const [filtreStatut, setFiltreStatut] = useState<"toutes" | "attente" | "confirme">("toutes");
  const [drag, setDrag] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [resaEclairee, setResaEclairee] = useState<string | null>(null);
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
  const attenteJour = resa.filter((r) => r.date === date && r.status === "attente");
  const tableOccupee: Record<string, Reservation> = {};
  duService.forEach((r) => { (r.table_ids || []).forEach((tid) => { tableOccupee[tid] = r; }); });
  const capaciteResa = (r: Reservation) =>
    (r.table_ids || []).reduce((s, tid) => s + (tables.find((t) => t.id === tid)?.capacity || 0), 0);
  const estPlacee = (r: Reservation) => (r.table_ids?.length || 0) > 0 && capaciteResa(r) >= r.covers;

  async function setTables(reservationId: string, ids: string[]) {
    const { error } = await supabase.from("reservations").update({ table_ids: ids }).eq("id", reservationId);
    if (!error) reload();
  }
  async function toggleTable(reservationId: string, tableId: string) {
    const r = resa.find((x) => x.id === reservationId);
    if (!r) return;
    const actuelles = r.table_ids || [];
    const ids = actuelles.includes(tableId) ? actuelles.filter((t) => t !== tableId) : [...actuelles, tableId];
    await setTables(reservationId, ids);
  }
  async function confirmer(r: Reservation) {
    const { error } = await supabase.from("reservations").update({ status: "confirme" }).eq("id", r.id);
    if (!error) { reload(); if (r.email) sendReservationEmail("confirmation", r); }
  }
  async function marquerNoShow(r: Reservation) {
    const ok = await confirm({ titre: "Marquer comme absent ?", message: `${r.customer_name} (${r.covers} cvt, ${r.time})`, confirmer: "Marquer absent", danger: true });
    if (!ok) return;
    const { error } = await supabase.from("reservations").update({ status: "no_show" }).eq("id", r.id);
    if (!error) reload();
  }
  async function annuler(r: Reservation) {
    const ok = await confirm({ titre: "Annuler cette réservation ?", message: `${r.customer_name} — ${r.covers} cvt, ${r.time}`, confirmer: "Annuler", danger: true });
    if (!ok) return;
    const { error } = await supabase.from("reservations").update({ status: "annule", table_ids: [] }).eq("id", r.id);
    if (!error) reload();
  }
  async function enregistrerSaisie() {
    if (!saisie) return;
    if (!saisie.p.trim() || !saisie.phone.trim() || !saisie.time) { setErreurSaisie("Prénom, téléphone et heure requis."); return; }
    const probleme = horsCreneaux(date, saisie.time, hours);
    if (probleme && !avertSaisie) { setAvertSaisie(probleme); return; }
    const reservation: any = {
      customer_name: [saisie.p.trim(), saisie.n.trim()].filter(Boolean).join(" "),
      email: saisie.email.trim(), phone: saisie.phone.trim(),
      date, time: saisie.time, covers: saisie.covers, notes: saisie.notes,
      status: "confirme", source: "telephone",
    };
    const ok = await insert(reservation);
    if (ok) { if (saisie.email.trim()) sendReservationEmail("confirmation", reservation); setSaisie(null); setErreurSaisie(""); setAvertSaisie(""); reload(); }
    else setErreurSaisie("Échec de l'enregistrement.");
  }
  function onDrop(tableId: string) {
    if (!drag) return;
    const occ = tableOccupee[tableId];
    if (occ && occ.id !== drag) { setDrag(null); setSurvol(null); return; }
    toggleTable(drag, tableId);
    setDrag(null); setSurvol(null);
  }

  const duJourEntier = resa.filter((r) => r.date === date && r.status !== "annule");
  const passeStatut = (r: Reservation) => filtreStatut === "toutes" || r.status === filtreStatut;
  const capacite = tables.filter((t) => t.is_active).reduce((s, t) => s + (t.capacity || 0), 0);
  const midiResa = duJourEntier.filter((r) => estMidi(r.time));
  const soirResa = duJourEntier.filter((r) => !estMidi(r.time));
  const couvMidi = midiResa.reduce((s, r) => s + r.covers, 0);
  const couvSoir = soirResa.reduce((s, r) => s + r.covers, 0);
  const recap = {
    midi: { resa: midiResa.length, couv: couvMidi, pct: capacite ? Math.min(100, Math.round(couvMidi / capacite * 100)) : 0 },
    soir: { resa: soirResa.length, couv: couvSoir, pct: capacite ? Math.min(100, Math.round(couvSoir / capacite * 100)) : 0 },
  };
  const sansTable = duJourEntier
    .filter((r) => !estPlacee(r) && r.status !== "no_show" && passeStatut(r))
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  const placees = duService.filter((r) => estPlacee(r) && passeStatut(r));
  const nbAttente = attenteJour.length;

  // Tables de la zone active
  const tablesZone = tables.filter((t) => t.is_active && t.area_id === zoneId);
  const tablesOccupees = tablesZone.filter((t) => !!tableOccupee[t.id]).length;
  const placesOccupees = tablesZone.filter((t) => !!tableOccupee[t.id]).reduce((s, t) => s + (t.capacity || 0), 0);
  const placesTotal = tablesZone.reduce((s, t) => s + (t.capacity || 0), 0);

  const aujMs = new Date(ymd(new Date()) + "T12:00:00").getTime();
  const joursAttente = Object.values(
    resa.filter((r) => r.status === "attente" && r.date !== date && new Date(r.date + "T12:00:00").getTime() >= aujMs)
      .reduce<Record<string, { date: string; n: number; svc: "midi" | "soir"; premier: string }>>((acc, r) => {
        const svc: "midi" | "soir" = estMidi(r.time) ? "midi" : "soir";
        const cur = acc[r.date];
        if (!cur) acc[r.date] = { date: r.date, n: 1, svc, premier: r.time };
        else { cur.n += 1; if (r.time < cur.premier) { cur.premier = r.time; cur.svc = svc; } }
        return acc;
      }, {})
  ).sort((a, b) => a.date.localeCompare(b.date));

  function carteResa(r: Reservation, placee: boolean) {
    const tablesResa = (r.table_ids || []).map((tid) => tables.find((x) => x.id === tid)).filter(Boolean) as RestaurantTable[];
    const labels = tablesResa.map((x) => x.label).join(", ");
    const capa = capaciteResa(r);
    const manque = Math.max(0, r.covers - capa);
    const partiel = (r.table_ids?.length || 0) > 0 && !placee;
    return (
      <div key={r.id}
        className={`ps-resa${placee ? " placee" : ""}${partiel ? " partiel" : ""}${drag === r.id ? " drag" : ""}${resaEclairee === r.id ? " eclairee" : ""}`}
        draggable onDragStart={() => setDrag(r.id)} onDragEnd={() => { setDrag(null); setSurvol(null); }}
        onClick={() => {
          if (tablesResa.length === 0) return;
          setResaEclairee((cur) => {
            const allume = cur !== r.id;
            const prem = tablesResa[0];
            if (allume && prem?.area_id && prem.area_id !== zoneId) setZoneId(prem.area_id);
            return allume ? r.id : null;
          });
        }}
        style={tablesResa.length > 0 ? { cursor: "pointer" } : undefined}>
        <div className="ps-resa-tete">
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className={`ps-pastille ${r.status}`} />
            <b>{r.customer_name}</b>
          </div>
          <span className="ps-heure">
            {(!placee || filtreStatut === "attente") && <span className="ps-svc">{estMidi(r.time) ? "Midi" : "Soir"}</span>}
            {r.time}
          </span>
        </div>
        {r.status === "attente" && r.source === "site" && (
          <div className="ps-resa-recue">Demande reçue {depuisQuand(r.created_at)}</div>
        )}
        <div className="ps-resa-det">
          <span>{r.covers} couvert{r.covers > 1 ? "s" : ""}</span>
          {tablesResa.length > 0 && <span style={{ color: "var(--admin-accent)", fontWeight: 600 }}>Table{tablesResa.length > 1 ? "s" : ""} {labels}</span>}
          {r.phone && (
            <span className="ps-tel">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {r.phone}
            </span>
          )}
        </div>
        {partiel && <div className="ps-resa-manque">⚠ Il manque {manque} place{manque > 1 ? "s" : ""}</div>}
        {r.status === "no_show" && <div className="ps-resa-noshow-tag">👻 Absent</div>}
        {r.notes && <div className="ps-resa-note">📝 {r.notes}</div>}
        <div className="ps-resa-actions">
          {r.status === "attente" && <button className="ps-confirmer" onClick={(e) => { e.stopPropagation(); confirmer(r); }}>✓ Confirmer</button>}
          {(r.status === "attente" || r.status === "confirme") && <button className="ps-noshow-btn" onClick={(e) => { e.stopPropagation(); marquerNoShow(r); }}>Absent</button>}
          {(r.status === "attente" || r.status === "confirme") && <button className="ps-annuler-btn" onClick={(e) => { e.stopPropagation(); annuler(r); }}>Annuler</button>}
          {tablesResa.length > 0 && <button className="ps-detacher" onClick={(e) => { e.stopPropagation(); setTables(r.id, []); }}>Retirer {tablesResa.length > 1 ? "tables" : "table"}</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="ps-wrap">

      {/* ── Topbar navigation + bouton réservation ── */}
      <div className="ps-topbar">
        <div className="ps-nav-date">
          <button className="ps-fleche" onClick={() => decalerJour(-1)}>‹</button>
          <div className="ps-date-courante">{libelleDateCourt(date)}</div>
          <button className="ps-fleche" onClick={() => decalerJour(1)}>›</button>
          {!estAujourdhui && <button className="puce" onClick={() => setDate(ymd(new Date()))}>Auj.</button>}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ps-date-input" />
        </div>
        <button className="btn btn-accent" onClick={() => { setSaisie({ ...VIDE, time: service === "midi" ? "12:30" : "19:30" }); setErreurSaisie(""); setAvertSaisie(""); }}>
          + Réservation
        </button>
      </div>

      {/* ── Bandeau rappel jours en attente ── */}
      {joursAttente.length > 0 && (
        <div className="ps-attente-rappel">
          <span className="ps-attente-rappel-lab">En attente :</span>
          {joursAttente.map((j) => (
            <button key={j.date} className="ps-attente-jour" onClick={() => { setDate(j.date); setService(j.svc); }}>
              {libelleDate(j.date)}<span className="ps-attente-jour-nb">{j.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Bandeau Midi / Soir (cliquable, style maquette) ── */}
      <div className="ps-services">
        <div className={`ps-service-bloc${service === "midi" ? " actif" : ""}`} onClick={() => setService("midi")}>
          <div className="ps-service-haut">
            <div className="ps-service-gauche">
              <span className="ps-service-nom">MIDI</span>
              <span className="ps-service-stats">{recap.midi.resa} résa · {recap.midi.couv} couverts</span>
            </div>
            <span className="ps-service-dispo">{capacite - recap.midi.couv} / {capacite}</span>
          </div>
          <div className="ps-service-jauge"><div style={{ width: `${recap.midi.pct}%` }} /></div>
        </div>
        <div className={`ps-service-bloc${service === "soir" ? " actif" : ""}`} onClick={() => setService("soir")}>
          <div className="ps-service-haut">
            <div className="ps-service-gauche">
              <span className="ps-service-nom">SOIR</span>
              <span className="ps-service-stats">{recap.soir.resa} résa · {recap.soir.couv} couverts</span>
            </div>
            <span className="ps-service-dispo">{capacite - recap.soir.couv} / {capacite}</span>
          </div>
          <div className="ps-service-jauge"><div style={{ width: `${recap.soir.pct}%` }} /></div>
        </div>
      </div>

      {/* ── Filtres statut ── */}
      <div className="ps-filtres">
        <button className={`puce-mini${filtreStatut === "toutes" ? " active" : ""}`} onClick={() => setFiltreStatut("toutes")}>Toutes</button>
        <button className={`puce-mini${filtreStatut === "attente" ? " active" : ""}`} onClick={() => setFiltreStatut("attente")}>
          En attente{nbAttente > 0 && <span className="ps-pip">{nbAttente}</span>}
        </button>
        <button className={`puce-mini${filtreStatut === "confirme" ? " active" : ""}`} onClick={() => setFiltreStatut("confirme")}>Confirmées</button>
      </div>

      {/* ── Grille liste + plan ── */}
      <div className="ps-grid">

        {/* Colonne liste */}
        <div className="ps-liste">
          {saisie ? (
            <div className="ps-saisie">
              <div className="ps-saisie-tete">
                <h3>Réservation téléphone</h3>
                <button className="ps-saisie-fermer" onClick={() => { setSaisie(null); setErreurSaisie(""); setAvertSaisie(""); }}>✕</button>
              </div>
              <div className="ps-saisie-date">{libelleDate(date)} · {service === "midi" ? "Midi" : "Soir"}</div>
              <div className="ps-saisie-row">
                <div className="champ"><label>Prénom *</label><input value={saisie.p} onChange={(e) => setSaisie({ ...saisie, p: e.target.value })} /></div>
                <div className="champ"><label>Nom</label><input value={saisie.n} onChange={(e) => setSaisie({ ...saisie, n: e.target.value })} /></div>
              </div>
              <div className="ps-saisie-row">
                <div className="champ"><label>Téléphone *</label><input type="tel" value={saisie.phone} onChange={(e) => setSaisie({ ...saisie, phone: e.target.value })} /></div>
                <div className="champ"><label>Email</label><input type="email" value={saisie.email} onChange={(e) => setSaisie({ ...saisie, email: e.target.value })} placeholder="Pour la confirmation" /></div>
              </div>
              <div className="ps-saisie-row">
                <div className="champ"><label>Heure *</label><input type="time" value={saisie.time} onChange={(e) => { setSaisie({ ...saisie, time: e.target.value }); setAvertSaisie(""); }} /></div>
                <div className="champ"><label>Couverts</label><input type="number" min="1" value={saisie.covers} onChange={(e) => setSaisie({ ...saisie, covers: Number(e.target.value) })} /></div>
              </div>
              <div className="champ"><label>Notes</label><input value={saisie.notes} onChange={(e) => setSaisie({ ...saisie, notes: e.target.value })} placeholder="Allergies, occasion…" /></div>
              {erreurSaisie && <div className="login-err">{erreurSaisie}</div>}
              {avertSaisie && <div className="avert-creneau">⚠️ {avertSaisie}<br /><span>Vérifiez ou enregistrez malgré tout.</span></div>}
              <button className="btn btn-accent" style={{ width: "100%", marginTop: 4 }} onClick={enregistrerSaisie}>{avertSaisie ? "Enregistrer malgré tout" : "Enregistrer"}</button>
              <div className="ps-saisie-aide">La réservation sera ajoutée en « à placer ».</div>
            </div>
          ) : (
            <>
              {sansTable.length > 0 && (
                <>
                  <div className="ps-liste-titre">À placer <span className="ps-liste-nb">{sansTable.length}</span></div>
                  {sansTable.map((r) => carteResa(r, false))}
                </>
              )}
              {placees.length > 0 && (
                <>
                  <div className="ps-liste-titre" style={{ marginTop: 14 }}>Placées <span className="ps-liste-nb">{placees.length}</span></div>
                  {placees.map((r) => carteResa(r, true))}
                </>
              )}
              {sansTable.length === 0 && placees.length === 0 && (
                <div className="ps-vide-mini">Aucune réservation pour ce service.</div>
              )}
            </>
          )}
        </div>

        {/* Colonne plan */}
        <div className="ps-plan-wrap">
          {/* Sélecteur de zone + bandeau capacité */}
          <div className="ps-plan-header">
            {areas.length > 1 ? (
              <div className="zones-barre">
                {areas.map((a) => (
                  <button key={a.id} className={`zone-onglet${a.id === zoneId ? " active" : ""}`} onClick={() => setZoneId(a.id)}>{a.name}</button>
                ))}
              </div>
            ) : (
              <div className="ps-zone-nom">{areas.find((a) => a.id === zoneId)?.name || "Salle"}</div>
            )}
            <div className="ps-plan-capacite">
              <span className="ps-capa-badge">{tablesOccupees}/{tablesZone.length} tables</span>
              <span className="ps-capa-badge">{placesOccupees}/{placesTotal} places</span>
            </div>
          </div>

          {/* Canvas plan de salle */}
          <div className="ps-plan" style={{ height: PLAN_H }}>
            {tablesZone.map((t) => {
              const occ = tableOccupee[t.id];
              const size = t.capacity > 4 ? 88 : 66;
              const eclairee = resaEclairee && occ?.id === resaEclairee;
              const dejaDessus = drag && occ?.id === drag;
              const prise = occ && drag && occ.id !== drag;
              return (
                <div key={t.id}
                  className={`ps-table${t.shape === "round" ? " ronde" : " carree"}${occ ? " occupee" : " libre"}${survol === t.id ? " survol" : ""}${prise ? " trop-petit" : ""}${dejaDessus ? " retrait" : ""}${eclairee ? " eclairee" : ""}`}
                  style={{ left: t.pos_x, top: t.pos_y, width: size, height: size }}
                  onDragOver={(e) => { if (!prise) e.preventDefault(); setSurvol(t.id); }}
                  onDragLeave={() => setSurvol((s) => (s === t.id ? null : s))}
                  onDrop={() => onDrop(t.id)}
                  onClick={() => {
                    if (occ) setResaEclairee((c) => c === occ.id ? null : occ.id);
                  }}>
                  <span className="ps-table-label">{t.label}</span>
                  {occ ? (
                    <span className="ps-table-client">
                      <span className="ps-table-nom">{occ.customer_name.split(" ")[0]}</span>
                      <span className="ps-table-time">{occ.time}</span>
                    </span>
                  ) : (
                    <span className="ps-table-cap ps-table-libre">Libre</span>
                  )}
                </div>
              );
            })}
            {tablesZone.length === 0 && <div className="ps-vide-plan">Aucune table dans cette zone.</div>}
          </div>
          <div className="ps-plan-legende">
            <span><span className="ps-leg-dot occupee" /> Occupée</span>
            <span><span className="ps-leg-dot libre" /> Libre</span>
            <span><span className="ps-leg-dot eclairee" /> Sélection</span>
          </div>
          <div className="ps-aide">Cliquez sur une réservation pour localiser sa table — et inversement. Glissez une carte sur une table pour l'attribuer ; sur plusieurs tables pour un grand groupe.</div>
        </div>
      </div>
    </div>
  );
}
