import { useState, useEffect } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, sendReservationEmail } from "../../lib/supabase";
import type { Reservation, RestaurantTable, DiningArea, OpeningHour, ReservationSettings } from "../../lib/types";
import { useConfirm } from "./Confirm";
import TableSVG from "./TableSVG";

const psTaille = (cap: number) => (cap <= 2 ? 108 : cap <= 4 ? 134 : 166);
const estMidi = (t: string) => (parseInt(String(t || "0").split(":")[0]) || 0) < 16;
const JOURS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const JOURS_C = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const MOIS_C = ["jan","fév","mar","avr","mai","juin","juil","août","sep","oct","nov","déc"];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function libelleDate(ds: string) {
  const d = new Date(ds + "T12:00:00");
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}
function libelleDateCourt(ds: string) {
  const d = new Date(ds + "T12:00:00");
  return `${JOURS_C[d.getDay()]}. ${d.getDate()} ${MOIS_C[d.getMonth()]}`;
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

export default function PlanService({ initialDate, initialService }: { initialDate?: string; initialService?: "midi" | "soir" } = {}) {
  const confirm = useConfirm();
  const dateMin = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0,10); })();
  const { rows: resa, reload, insert } = useTable<Reservation>("reservations", "date", true, { column: "date", op: "gte", value: dateMin });
  const { rows: tables } = useTable<RestaurantTable>("restaurant_tables", "label");
  const { rows: areas } = useTable<DiningArea>("dining_areas", "position");
  const { rows: hours } = useTable<OpeningHour>("opening_hours", "day_of_week");
  const { rows: reglages } = useTable<ReservationSettings>("reservation_settings", "id");
  const [date, setDate] = useState(initialDate || ymd(new Date()));
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [service, setService] = useState<"midi" | "soir">(initialService || "soir");
  const [filtreStatut, setFiltreStatut] = useState<"toutes" | "attente" | "confirme">("toutes");
  const [drag, setDrag] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [resaEclairee, setResaEclairee] = useState<string | null>(null);
  const [creneauActif, setCreneauActif] = useState<string | null>(null);
  const [infoAuto, setInfoAuto] = useState("");
  const VIDE = { p: "", n: "", phone: "", email: "", time: "", covers: 2, notes: "" };
  const [saisie, setSaisie] = useState<typeof VIDE | null>(null);
  const [erreurSaisie, setErreurSaisie] = useState("");
  const [avertSaisie, setAvertSaisie] = useState("");

  useEffect(() => { if (!zoneId && areas.length > 0) setZoneId(areas[0].id); }, [areas, zoneId]);
  // Si le service affiché n'existe pas ce jour-là (ex. mercredi soir chez CJ),
  // basculer automatiquement sur celui qui est ouvert.
  // Le bilan du placement automatique ne vaut que pour le service affiché.
  useEffect(() => { setInfoAuto(""); }, [date, service]);
  useEffect(() => {
    const h = hours.find((x) => x.day_of_week === new Date(date + "T12:00:00").getDay());
    if (!h || h.is_closed) return;
    if (service === "soir" && !h.dinner_open && h.lunch_open) setService("midi");
    else if (service === "midi" && !h.lunch_open && h.dinner_open) setService("soir");
  }, [date, hours, service]);

  function decalerJour(n: number) {
    const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); setDate(ymd(d));
  }

  const duService = resa.filter(
    (r) => r.date === date && r.status !== "annule" && (service === "midi" ? estMidi(r.time) : !estMidi(r.time))
  );
  const attenteJour = resa.filter((r) => r.date === date && r.status === "attente");
  // Durée d'occupation d'une table (minutes), réglable dans « Réservations & site ».
  // check_availability lit exactement le même réglage côté base : la
  // disponibilité affichée au client et la rotation dans le plan restent donc
  // toujours cohérentes.
  const DUREE_TABLE = reglages[0]?.table_duration || 90;
  const enMinutes = (h: string) => {
    const [a, b] = (h || "0:0").split(":").map(Number);
    return (a || 0) * 60 + (b || 0);
  };
  // Deux réservations se chevauchent si moins de DUREE_TABLE les sépare.
  const seChevauchent = (a: string, b: string) =>
    Math.abs(enMinutes(a) - enMinutes(b)) < DUREE_TABLE;

  const occupantes = duService.filter(
    (r) => r.status === "confirme" || r.status === "no_show" || r.source === "telephone"
  );

  // TOUTES les réservations de chaque table, dans l'ordre horaire. Une table peut
  // servir plusieurs fois dans un service (rotation) : il faut pouvoir les
  // afficher toutes, sinon la 2e réservation devient introuvable sur le plan.
  const tableServices: Record<string, Reservation[]> = {};
  occupantes.forEach((r) => {
    (r.table_ids || []).forEach((tid) => {
      (tableServices[tid] ||= []).push(r);
    });
  });
  Object.values(tableServices).forEach((l) => l.sort((a, b) => a.time.localeCompare(b.time)));

  // Réservation « principale » affichée sur la table : celle du créneau consulté
  // si un créneau est sélectionné, sinon la première du service.
  const tableOccupee: Record<string, Reservation> = {};
  Object.entries(tableServices).forEach(([tid, liste]) => {
    // Priorité à la réservation sélectionnée dans la liste : en cliquant sur
    // « Marc · 13:30 », la table doit afficher Marc et non le service précédent.
    const choisie =
      liste.find((r) => r.id === resaEclairee)
      || (creneauActif ? liste.find((r) => seChevauchent(r.time, creneauActif)) : undefined)
      || liste[0];
    if (choisie) tableOccupee[tid] = choisie;
  });

  // Conflits réels : deux réservations sur la même table à moins de 1h30.
  const conflits = new Set<string>();
  occupantes.forEach((r1, i) => {
    occupantes.slice(i + 1).forEach((r2) => {
      const communes = (r1.table_ids || []).filter((id) => (r2.table_ids || []).includes(id));
      if (communes.length && seChevauchent(r1.time, r2.time)) {
        communes.forEach((id) => conflits.add(id));
        conflits.add(`resa:${r1.id}`); conflits.add(`resa:${r2.id}`);
      }
    });
  });

  // Heure de libération d'une table (pour l'afficher sur le plan).
  const libereA = (r: Reservation) => {
    const m = enMinutes(r.time) + DUREE_TABLE;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  // Une table est-elle disponible pour la résa en cours de placement ?
  const librePour = (tableId: string, heure: string) =>
    !occupantes.some((r) => (r.table_ids || []).includes(tableId) && seChevauchent(r.time, heure));
  const capaciteResa = (r: Reservation) =>
    (r.table_ids || []).reduce((s, tid) => s + (tables.find((t) => t.id === tid)?.capacity || 0), 0);
  const estPlacee = (r: Reservation) => (r.table_ids?.length || 0) > 0 && capaciteResa(r) >= r.covers;

  async function setTables(reservationId: string, ids: string[]) {
    const { error } = await supabase.from("reservations").update({ table_ids: ids }).eq("id", reservationId);
    if (!error) reload();
  }
  // ── Placement automatique ────────────────────────────────────────────────
  // Attribue une table à chaque réservation non placée du service affiché.
  //
  // Stratégie : on traite d'abord les groupes les plus difficiles à caser (les
  // plus nombreux), puis les plus petits. Pour chacun, on retient la table
  // libre la plus « juste » — celle qui gaspille le moins de places — afin de
  // préserver les grandes tables pour les groupes suivants.
  //
  // La disponibilité tient compte de la rotation : une table libérée avant
  // l'heure visée (DUREE_TABLE) est réutilisable. Les tables déjà attribuées
  // manuellement ne sont jamais déplacées.
  async function placerAuto() {
    const aPlacer = duService
      .filter((r) => !estPlacee(r) && r.status !== "no_show" && r.status !== "annule")
      .sort((a, b) => b.covers - a.covers || a.time.localeCompare(b.time));
    if (aPlacer.length === 0) return;

    // Occupation simulée : on part du réel, et on ajoute au fur et à mesure les
    // attributions décidées, pour éviter de placer deux groupes au même endroit.
    const prises: Record<string, string[]> = {};
    occupantes.forEach((r) => {
      (r.table_ids || []).forEach((tid) => { (prises[tid] ||= []).push(r.time); });
    });
    const dispo = (tid: string, heure: string) =>
      !(prises[tid] || []).some((h) => seChevauchent(h, heure));

    const candidates = tables
      .filter((t) => t.is_active)
      .sort((a, b) => a.capacity - b.capacity);

    const decisions: { id: string; ids: string[] }[] = [];
    const nonPlaces: Reservation[] = [];

    for (const r of aPlacer) {
      const libres = candidates.filter((t) => dispo(t.id, r.time));

      // 1) Une seule table suffisamment grande, au plus juste.
      const seule = libres.find((t) => t.capacity >= r.covers);
      if (seule) {
        decisions.push({ id: r.id, ids: [seule.id] });
        (prises[seule.id] ||= []).push(r.time);
        continue;
      }

      // 2) Sinon regroupement : on prend les plus grandes d'abord pour limiter
      //    le nombre de tables mobilisées.
      const combinaison: string[] = [];
      let total = 0;
      for (const t of [...libres].sort((a, b) => b.capacity - a.capacity)) {
        combinaison.push(t.id);
        total += t.capacity;
        if (total >= r.covers) break;
      }
      if (total >= r.covers) {
        decisions.push({ id: r.id, ids: combinaison });
        combinaison.forEach((tid) => { (prises[tid] ||= []).push(r.time); });
      } else {
        nonPlaces.push(r);
      }
    }

    if (decisions.length === 0) {
      setInfoAuto("Aucune table disponible pour les réservations restantes.");
      return;
    }

    // Écriture groupée, puis un seul rechargement.
    for (const d of decisions) {
      await supabase.from("reservations").update({ table_ids: d.ids }).eq("id", d.id);
    }
    reload();

    const n = decisions.length;
    setInfoAuto(
      `${n} réservation${n > 1 ? "s" : ""} placée${n > 1 ? "s" : ""}` +
      (nonPlaces.length
        ? ` — ${nonPlaces.length} sans table disponible (${nonPlaces.map((r) => r.time).join(", ")}).`
        : ".")
    );
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
    const ok = await confirm({
      titre: "Annuler cette réservation ?",
      message: `${r.customer_name} — ${r.covers} cvt, ${r.time}`,
      confirmer: "Oui, annuler la réservation",
      annuler: "Retour",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("reservations").update({ status: "annule", table_ids: [] }).eq("id", r.id);
    // Notification waitlist : gérée par le trigger trg_waitlist_liberation.
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
    const r = resa.find((x) => x.id === drag);
    // On refuse le dépôt seulement si la table est occupée AU MÊME MOMENT.
    // Une table libérée avant l'heure visée (1h30 de service) reste attribuable :
    // c'est la rotation de table, courante sur un service chargé.
    if (r && !librePour(tableId, r.time)) {
      const occ = tableOccupee[tableId];
      if (!occ || occ.id !== drag) { setDrag(null); setSurvol(null); return; }
    }
    toggleTable(drag, tableId);
    setDrag(null); setSurvol(null);
  }

  // Services réellement ouverts ce jour-là (Côté Jardin ne sert pas le soir le
  // mercredi, par exemple). On ne doit pas proposer un service inexistant :
  // afficher « SOIR 0/60 » un jour de fermeture est trompeur.
  const hDuJour = hours.find((h) => h.day_of_week === new Date(date + "T12:00:00").getDay());
  const midiOuvert = !!(hDuJour && !hDuJour.is_closed && hDuJour.lunch_open);
  const soirOuvert = !!(hDuJour && !hDuJour.is_closed && hDuJour.dinner_open);

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
  // Répartition des arrivées par créneau : sur un service complet, savoir que
  // 12h30 concentre 18 couverts est plus utile que de lire les heures table
  // par table. Regroupe les réservations du service affiché par horaire.
  const creneaux = (() => {
    const m = new Map<string, { couv: number; resa: number }>();
    duService.filter(passeStatut).forEach((r) => {
      const c = m.get(r.time) || { couv: 0, resa: 0 };
      c.couv += r.covers; c.resa += 1;
      m.set(r.time, c);
    });
    return [...m.entries()]
      .map(([time, v]) => ({ time, ...v }))
      .sort((a, b) => a.time.localeCompare(b.time));
  })();
  const creneauMax = creneaux.reduce((m, c) => Math.max(m, c.couv), 0);

  const sansTable = duJourEntier
    .filter((r) => !estPlacee(r) && r.status !== "no_show" && passeStatut(r))
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  const placees = duService.filter((r) => estPlacee(r) && passeStatut(r));
  const nbAttente = attenteJour.length;

  const tablesZone = tables.filter((t) => t.is_active && t.area_id === zoneId);
  const tablesOccupees = tablesZone.filter((t) => !!tableOccupee[t.id]).length;
  const placesOccupees = tablesZone.filter((t) => !!tableOccupee[t.id]).reduce((s, t) => s + (t.capacity || 0), 0);
  const placesTotal = tablesZone.reduce((s, t) => s + (t.capacity || 0), 0);
  const pctSalle = placesTotal ? Math.round(placesOccupees / placesTotal * 100) : 0;

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

  // Mêmes pastilles pour les réservations non placées des AUTRES jours.
  // On réutilise estPlacee() : cohérence garantie avec la colonne « À placer »
  // et le KPI du tableau de bord.
  const joursAPlacer = Object.values(
    resa.filter((r) => !estPlacee(r) && r.status !== "annule" && r.status !== "no_show"
      && r.date !== date && new Date(r.date + "T12:00:00").getTime() >= aujMs)
      .reduce<Record<string, { date: string; n: number; svc: "midi" | "soir"; premier: string }>>((acc, r) => {
        const svc: "midi" | "soir" = estMidi(r.time) ? "midi" : "soir";
        const cur = acc[r.date];
        if (!cur) acc[r.date] = { date: r.date, n: 1, svc, premier: r.time };
        else { cur.n += 1; if (r.time < cur.premier) { cur.premier = r.time; cur.svc = svc; } }
        return acc;
      }, {})
  ).sort((a, b) => a.date.localeCompare(b.date));

  // Carte réservation (liste de gauche)
  function carteResa(r: Reservation, placee: boolean) {
    const tablesResa = (r.table_ids || []).map((tid) => tables.find((x) => x.id === tid)).filter(Boolean) as RestaurantTable[];
    const labels = tablesResa.map((x) => x.label).join(", ");
    const capa = capaciteResa(r);
    const manque = Math.max(0, r.covers - capa);
    const partiel = (r.table_ids?.length || 0) > 0 && !placee;
    const statutLabel = r.status === "attente" ? "En attente" : r.status === "confirme" ? "Confirmée" : r.status === "no_show" ? "Absent" : "Annulée";
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
        <div className="ps-resa-haut">
          <span className="ps-resa-heure">{r.time}</span>
          <span className="ps-resa-nom">{r.customer_name}</span>
          {!placee && <span className="ps-resa-glisser">Glisser →</span>}
        </div>
        <div className="ps-resa-bas">
          <span className="ps-resa-couv">{r.covers} couv.</span>
          <span className={`ps-badge-statut ${r.status}`}>{statutLabel}</span>
          {tablesResa.length > 0 && <span className="ps-badge-table">Table{tablesResa.length > 1 ? "s" : ""} {labels}</span>}
          {!placee && <span className="ps-badge-aplacer">À placer</span>}
          {r.phone && <span className="ps-resa-tel">{r.phone}</span>}
        </div>
        {r.status === "attente" && r.source === "site" && (
          <div className="ps-resa-recue">Demande reçue {depuisQuand(r.created_at)}</div>
        )}
        {partiel && <div className="ps-resa-manque">⚠ Il manque {manque} place{manque > 1 ? "s" : ""}</div>}
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

      {/* Barre de navigation date + bouton réservation */}
      <div className="ps-entete">
        <div>
          <div className="ps-sous-titre">Plan de service</div>
          <div className="ps-date-grande">
            {libelleDate(date)}
            {date === ymd(new Date()) && <span className="ps-badge-auj">Aujourd’hui</span>}
          </div>
        </div>
        <div className="ps-entete-droite">
          <div className="ps-nav-date">
            <button className="ps-fleche" onClick={() => decalerJour(-1)}>‹</button>
            <div className="ps-date-courante">{libelleDateCourt(date)}</div>
            <button className="ps-fleche" onClick={() => decalerJour(1)}>›</button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ps-date-input" />
          </div>
          <button className="ps-btn-resa" onClick={() => { setSaisie({ ...VIDE, time: service === "midi" ? "12:30" : "19:30" }); setErreurSaisie(""); setAvertSaisie(""); }}>+ Réservation</button>
        </div>
      </div>

      {/* Rappel jours en attente */}
      {joursAttente.length > 0 && (
        <div className="ps-attente-rappel">
          <span className="ps-attente-rappel-lab">En attente :</span>
          {joursAttente.map((j) => (
            <button key={j.date} className="ps-attente-jour" onClick={() => { setDate(j.date); setService(j.svc); }}>
              {libelleDateCourt(j.date)}<span className="ps-attente-jour-nb">{j.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Même mécanique pour les réservations non placées des autres jours */}
      {joursAPlacer.length > 0 && (
        <div className="ps-attente-rappel">
          <span className="ps-attente-rappel-lab">À placer :</span>
          {joursAPlacer.map((j) => (
            <button key={j.date} className="ps-attente-jour" onClick={() => { setDate(j.date); setService(j.svc); }}>
              {libelleDateCourt(j.date)}<span className="ps-attente-jour-nb">{j.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bandeau Midi / Soir — seuls les services réellement ouverts sont affichés */}
      <div className={`ps-services${midiOuvert && soirOuvert ? "" : " ps-services-solo"}`}>
        {midiOuvert && (
        <div className={`ps-service-bloc${service === "midi" ? " actif" : ""}`} onClick={() => setService("midi")}>
          <div className="ps-service-haut">
            <div className="ps-service-gauche">
              <span className="ps-service-nom">MIDI</span>
              <span className="ps-service-stats">{recap.midi.resa === 0 ? "Aucune réservation" : `${recap.midi.resa} résa · ${recap.midi.couv} couverts`}</span>
            </div>
            <span className="ps-service-dispo">{recap.midi.couv} / {capacite}</span>
          </div>
          <div className="ps-service-jauge"><div style={{ width: `${recap.midi.pct}%` }} /></div>
        </div>
        )}
        {soirOuvert && (
        <div className={`ps-service-bloc${service === "soir" ? " actif" : ""}`} onClick={() => setService("soir")}>
          <div className="ps-service-haut">
            <div className="ps-service-gauche">
              <span className="ps-service-nom">SOIR</span>
              <span className="ps-service-stats">{recap.soir.resa === 0 ? "Aucune réservation" : `${recap.soir.resa} résa · ${recap.soir.couv} couverts`}</span>
            </div>
            <span className="ps-service-dispo">{recap.soir.couv} / {capacite}</span>
          </div>
          <div className="ps-service-jauge"><div style={{ width: `${recap.soir.pct}%` }} /></div>
        </div>
        )}
        {!midiOuvert && !soirOuvert && (
          <div className="ps-service-ferme">Le restaurant est fermé ce jour-là.</div>
        )}
      </div>

      {/* Répartition des arrivées par créneau : lecture immédiate du rythme du
          service (où est le coup de feu), sans avoir à parcourir les tables. */}
      {creneaux.length > 0 && (
        <div className="ps-creneaux">
          <span className="ps-creneaux-titre">Arrivées</span>
          <div className="ps-creneaux-liste">
            {creneaux.map((c) => (
              <button key={c.time}
                className={`ps-creneau${creneauActif === c.time ? " actif" : ""}`}
                title={`${c.time} — ${c.couv} couverts sur ${c.resa} réservation${c.resa > 1 ? "s" : ""}`}
                onMouseEnter={() => setCreneauActif(c.time)}
                onMouseLeave={() => setCreneauActif(null)}
                onClick={() => setCreneauActif(creneauActif === c.time ? null : c.time)}>
                <span className="ps-creneau-ligne">
                  <span className="ps-creneau-h">{c.time}</span>
                  <span className="ps-creneau-couv">{c.couv}</span>
                </span>
                <span className="ps-creneau-barre">
                  <i style={{ width: `${creneauMax ? Math.max(8, Math.round(c.couv / creneauMax * 100)) : 0}%` }} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grille : liste (gauche) + plan (droite, large) */}
      <div className="ps-grid">

        {/* Colonne liste */}
        <div className="ps-col-liste">
          <div className="ps-filtres">
            <button className={`puce-mini${filtreStatut === "toutes" ? " active" : ""}`} onClick={() => setFiltreStatut("toutes")}>Toutes</button>
            <button className={`puce-mini${filtreStatut === "attente" ? " active" : ""}`} onClick={() => setFiltreStatut("attente")}>En attente{nbAttente > 0 && <span className="ps-pip">{nbAttente}</span>}</button>
            <button className={`puce-mini${filtreStatut === "confirme" ? " active" : ""}`} onClick={() => setFiltreStatut("confirme")}>Confirmées</button>
          </div>
          <div className="ps-liste">
            {saisie ? (
              <div className="ps-saisie">
                <div className="ps-saisie-tete">
                  <h3>Réservation téléphone</h3>
                  <button className="ps-saisie-fermer" onClick={() => { setSaisie(null); setErreurSaisie(""); setAvertSaisie(""); }}>✕</button>
                </div>
                <div className="ps-saisie-date">
                  <button type="button" className="ps-saisie-nav" onClick={() => decalerJour(-1)} aria-label="Jour précédent">‹</button>
                  <input type="date" min={dateMin} value={date} onChange={(e) => setDate(e.target.value)} className="ps-saisie-datefield" />
                  <button type="button" className="ps-saisie-nav" onClick={() => decalerJour(1)} aria-label="Jour suivant">›</button>
                </div>
                <div className="ps-saisie-row">
                  <div className="champ"><label>Prénom *</label><input value={saisie.p} onChange={(e) => setSaisie({ ...saisie, p: e.target.value })} /></div>
                  <div className="champ"><label>Nom</label><input value={saisie.n} onChange={(e) => setSaisie({ ...saisie, n: e.target.value })} /></div>
                </div>
                <div className="ps-saisie-row">
                  <div className="champ"><label>Téléphone *</label><input type="tel" value={saisie.phone} onChange={(e) => setSaisie({ ...saisie, phone: e.target.value })} /></div>
                  <div className="champ"><label>Email</label><input type="email" value={saisie.email} onChange={(e) => setSaisie({ ...saisie, email: e.target.value })} placeholder="Confirmation" /></div>
                </div>
                <div className="ps-saisie-row">
                  <div className="champ"><label>Heure *</label><input type="time" value={saisie.time} onChange={(e) => { setSaisie({ ...saisie, time: e.target.value }); setAvertSaisie(""); }} /></div>
                  <div className="champ"><label>Couverts</label><input type="number" min="1" value={saisie.covers} onChange={(e) => setSaisie({ ...saisie, covers: Number(e.target.value) })} /></div>
                </div>
                <div className="champ"><label>Notes</label><input value={saisie.notes} onChange={(e) => setSaisie({ ...saisie, notes: e.target.value })} placeholder="Allergies, occasion…" /></div>
                {erreurSaisie && <div className="err-inline">{erreurSaisie}</div>}
                {avertSaisie && <div className="avert-creneau">⚠️ {avertSaisie}<br /><span>Vérifiez ou enregistrez malgré tout.</span></div>}
                <button className="btn btn-accent" style={{ width: "100%", marginTop: 4 }} onClick={enregistrerSaisie}>{avertSaisie ? "Enregistrer malgré tout" : "Enregistrer"}</button>
              </div>
            ) : (
              <>
                {sansTable.length > 0 && (
                  <>
                    <div className="ps-liste-titre aplacer">
                      À placer <span className="ps-liste-nb">{sansTable.length}</span>
                      <button className="ps-auto-btn" onClick={placerAuto}
                        title="Attribue automatiquement la table la plus adaptée à chaque réservation non placée">
                        Placer automatiquement
                      </button>
                    </div>
                    {infoAuto && (
                      <div className="ps-auto-info" onClick={() => setInfoAuto("")}>{infoAuto}</div>
                    )}
                    {sansTable.map((r) => carteResa(r, false))}
                  </>
                )}
                {placees.length > 0 && (
                  <>
                    <div className="ps-liste-titre" style={{ marginTop: 14 }}>Placées <span className="ps-liste-nb">{placees.length}</span></div>
                    {placees.map((r) => carteResa(r, true))}
                  </>
                )}
                {sansTable.length === 0 && placees.length === 0 && <div className="ps-vide-mini">Aucune réservation pour ce service.</div>}
              </>
            )}
          </div>
        </div>

        {/* Colonne plan (large) */}
        <div className="ps-col-plan">
          {/* En-tête salle */}
          <div className="ps-salle-tete">
            <div className="ps-salle-gauche">
              {areas.length > 1 ? (
                <div className="zones-barre">
                  {areas.map((a) => (
                    <button key={a.id} className={`zone-onglet${a.id === zoneId ? " active" : ""}`} onClick={() => setZoneId(a.id)}>{a.name}</button>
                  ))}
                </div>
              ) : (
                <h2 className="ps-salle-nom">{areas.find((a) => a.id === zoneId)?.name || "Salle"}</h2>
              )}
              <span className="ps-salle-pill">{tablesZone.length} tables · {placesTotal} places</span>
            </div>
            <div className="ps-legende">
              <span><span className="ps-leg-dot occupee" /> Occupée</span>
              <span><span className="ps-leg-dot libre" /> Libre</span>
              <span><span className="ps-leg-dot eclairee" /> Sélection</span>
              {drag && <span className="ps-legende-rotation">Rotation possible</span>}
              {conflits.size > 0 && <span className="ps-legende-conflit">Chevauchement</span>}
            </div>
          </div>

          {/* Jauge globale salle */}
          <div className="ps-salle-jauge-row">
            <div className="ps-salle-jauge"><div style={{ width: `${pctSalle}%` }} /></div>
            <span className="ps-salle-compteur">{placesOccupees} / {placesTotal} places · {tablesOccupees}/{tablesZone.length} tables</span>
          </div>

          {/* Canvas plan */}
          <div className="ps-plan">
            {tablesZone.map((t) => {
              const occ = tableOccupee[t.id];
              const services = tableServices[t.id] || [];
              // Rotation : la table sert plusieurs fois dans ce service.
              const nbServices = services.length;
              const suivante = occ ? services.find((r) => r.time > occ.time) : undefined;
              // Taille par capacité : 2→petite, 3-4→moyenne, 5+→grande
              const tier = t.capacity <= 2 ? "t-petite" : t.capacity <= 4 ? "t-moyenne" : "t-grande";
              // La table s'illumine si N'IMPORTE laquelle de ses réservations est
              // sélectionnée (pas seulement celle affichée) : sur une table en
              // rotation, la 2e réservation doit rester localisable.
              const eclairee = !!resaEclairee && services.some((r) => r.id === resaEclairee);
              const dejaDessus = drag && occ?.id === drag;
              // Pendant un glisser-déposer, une table n'est « prise » que si elle
              // est occupée AU MÊME MOMENT (fenêtre de 1h30). Une table libérée
              // avant l'heure visée reste donc disponible : c'est ce qui permet
              // de faire tourner une table sur deux services rapprochés.
              const resaGlissee = drag ? resa.find((x) => x.id === drag) : null;
              const prise = !!(drag && resaGlissee && occ && occ.id !== drag
                && !librePour(t.id, resaGlissee.time));
              // Table libre à l'heure visée alors qu'elle est occupée plus tôt :
              // on la signale comme « rotation possible ».
              const rotation = !!(drag && resaGlissee && occ && occ.id !== drag
                && librePour(t.id, resaGlissee.time));
              const enConflit = conflits.has(t.id);
              return (
                <div key={t.id}
                  className={`ps-table ${tier}${t.shape === "round" ? " ronde" : " carree"}${occ ? " occupee" : " libre"}${survol === t.id ? " survol" : ""}${prise ? " trop-petit" : ""}${dejaDessus ? " retrait" : ""}${eclairee ? " eclairee" : ""}${creneauActif ? (occ && occ.time === creneauActif ? " creneau-vise" : " creneau-hors") : ""}${rotation ? " rotation" : ""}${enConflit ? " conflit" : ""}${nbServices > 1 ? " multi" : ""}${resaEclairee && services.some((r) => r.id === resaEclairee) ? " contient-eclairee" : ""}`}
                  style={{ left: t.pos_x, top: t.pos_y }}
                  onDragOver={(e) => { if (!prise) e.preventDefault(); setSurvol(t.id); }}
                  onDragLeave={() => setSurvol((s) => (s === t.id ? null : s))}
                  onDrop={() => onDrop(t.id)}
                  onClick={() => {
                    if (!services.length) return;
                    // Clics successifs : parcourt les services de la table, puis
                    // désélectionne — permet d'atteindre la 2e réservation.
                    const i = services.findIndex((r) => r.id === resaEclairee);
                    setResaEclairee(i < services.length - 1 ? services[i + 1].id : null);
                  }}
                  title={enConflit
                    ? `Conflit : deux réservations se chevauchent sur ${t.label}.`
                    : rotation && resaGlissee
                      ? `Rotation possible : ${t.label} se libère à ${libereA(occ!)}, avant ${resaGlissee.time}.`
                      : services.length
                        ? services.map((r) => `${r.customer_name} · ${r.time} → ${libereA(r)}`).join("\n")
                        : `${t.label} — libre`}>
                  <TableSVG size={psTaille(t.capacity)} capacity={t.capacity} round={t.shape === "round"} className="ps-svg" />
                  {nbServices > 1 && <span className="ps-table-multi" aria-label={`${nbServices} services`}>×{nbServices}</span>}
                  <div className="ps-table-contenu">
                  <div className="ps-table-tete">
                    <span className="ps-table-label">{t.label}</span>
                    <span className="ps-table-cap">{occ ? `${occ.covers} couv.` : `${t.capacity} pl.`}</span>
                  </div>
                  {occ ? (
                    <>
                      <div className="ps-table-client">{occ.customer_name.split(" ")[0]} · {occ.time}</div>
                      <div className="ps-table-jusqua">jusqu'à {libereA(occ)}</div>
                      {suivante && (
                        <div className="ps-table-suite">
                          puis {suivante.customer_name.split(" ")[0]} · {suivante.time}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="ps-table-libre">Libre</div>
                  )}
                  </div>
                </div>
              );
            })}
            {tablesZone.length === 0 && <div className="ps-vide-plan">Aucune table dans cette zone.</div>}
          </div>
          <div className="ps-aide">Cliquez une réservation pour localiser sa table — et inversement. Glissez une carte sur une table pour l'attribuer ; sur plusieurs tables pour un grand groupe.</div>
        </div>
      </div>
    </div>
  );
}
