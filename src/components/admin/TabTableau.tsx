import { useState } from "react";
import { useTable } from "../../hooks/useTable";
import type { Reservation, Lead, RestaurantTable, OpeningHour, ReservationSettings } from "../../lib/types";

const JOURS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"];

// Un créneau réservé appartient au midi s'il commence avant 16h, sinon au soir
function estMidi(time: string): boolean {
  const h = parseInt(String(time || "0").split(":")[0]) || 0;
  return h < 16;
}

export default function TabTableau({ onNavigate }: { onNavigate?: (tab: string, date?: string) => void } = {}) {
  const { rows: resa } = useTable<Reservation>("reservations", "date", true);
  const { rows: leads } = useTable<Lead>("leads", "created_at");
  const { rows: tables } = useTable<RestaurantTable>("restaurant_tables", "label");
  const { rows: hours } = useTable<OpeningHour>("opening_hours", "day_of_week");
  const { rows: settingsRows } = useTable<ReservationSettings>("reservation_settings", "id");
  const horizon = Math.max(1, settingsRows[0]?.booking_horizon_days || 7);
  // Pagination de la disponibilité, 7 jours (une semaine) à la fois.
  const nbSemaines = Math.ceil(horizon / 7);
  const [semaine, setSemaine] = useState(0);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const capacite = tables.filter((t) => t.is_active).reduce((s, t) => s + (t.capacity || 0), 0);

  // Couverts réservés (hors annulés) pour une date + un service
  const couvertsLe = (dateStr: string, service: "midi" | "soir") =>
    resa
      .filter((r) => r.date === dateStr && r.status !== "annule" && (service === "midi" ? estMidi(r.time) : !estMidi(r.time)))
      .reduce((s, r) => s + (r.covers || 0), 0);

  const att = resa.filter((r) => r.status === "attente").length;
  const couvAujTotal = resa.filter((r) => r.date === todayStr && r.status !== "annule").reduce((s, r) => s + (r.covers || 0), 0);
  const nbResaAuj = resa.filter((r) => r.date === todayStr && r.status !== "annule").length;

  // Répartition par canal (historique complet, hors annulées)
  const actives = resa.filter((r) => r.status !== "annule");
  const nbTel = actives.filter((r) => r.source === "telephone").length;
  const nbSite = actives.length - nbTel;
  const pctTel = actives.length ? Math.round((nbTel / actives.length) * 100) : 0;
  const pctSite = actives.length ? 100 - pctTel : 0;

  // --- Indicateurs (30 derniers jours, sauf clients récurrents et affluence qui regardent tout l'historique) ---
  function ymd(d: Date) { return d.toISOString().slice(0, 10); }
  const d30 = new Date(today); d30.setDate(today.getDate() - 29);
  const d30Str = ymd(d30);
  const sumCovers = (l: Reservation[]) => l.reduce((s, r) => s + (r.covers || 0), 0);

  const periode = resa.filter((r) => r.date >= d30Str && r.date <= todayStr);
  const nbAnnulePeriode = periode.filter((r) => r.status === "annule").length;
  const tauxAnnulation = periode.length ? Math.round((nbAnnulePeriode / periode.length) * 100) : 0;
  const nbNoShowPeriode = periode.filter((r) => r.status === "no_show").length;
  const denomNoShow = periode.filter((r) => r.status === "confirme" || r.status === "no_show").length;
  const tauxNoShow = denomNoShow ? Math.round((nbNoShowPeriode / denomNoShow) * 100) : 0;
  const nonAnnulPeriode = periode.filter((r) => r.status !== "annule");
  const tailleMoyenne = nonAnnulPeriode.length ? sumCovers(nonAnnulPeriode) / nonAnnulPeriode.length : 0;

  const parTel = new Map<string, number>();
  resa.filter((r) => r.status !== "annule" && r.phone?.trim()).forEach((r) => {
    const k = r.phone.trim();
    parTel.set(k, (parTel.get(k) || 0) + 1);
  });
  const nbClientsUniques = parTel.size;
  const nbRecurrents = [...parTel.values()].filter((n) => n > 1).length;
  const tauxRecurrence = nbClientsUniques ? Math.round((nbRecurrents / nbClientsUniques) * 100) : 0;

  const JOURS_LONG = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  // Quand les clients réservent-ils EN LIGNE (heure de création de la demande) ?
  // Basé sur created_at — pertinent uniquement pour source='site' (une saisie
  // téléphone est horodatée au moment où le resto la tape, pas quand le client appelle).
  const resaEnLigne = resa.filter((r) => r.source === "site");
  const parHeureCrea = Array.from({ length: 24 }, () => 0);
  const parJourCrea = [0, 0, 0, 0, 0, 0, 0];
  resaEnLigne.forEach((r) => {
    if (!r.created_at) return;
    const d = new Date(r.created_at);
    parHeureCrea[d.getHours()] += 1;
    parJourCrea[d.getDay()] += 1;
  });
  const maxHeureCrea = Math.max(1, ...parHeureCrea);
  const heureTopIdx = parHeureCrea.indexOf(Math.max(...parHeureCrea));
  const heureTop = resaEnLigne.length > 0 ? `${heureTopIdx}h–${heureTopIdx + 1}h` : null;
  const maxJourCrea = Math.max(1, ...parJourCrea);
  const jourCreaTop = resaEnLigne.length > 0 && Math.max(...parJourCrea) > 0
    ? JOURS_LONG[parJourCrea.indexOf(Math.max(...parJourCrea))] : null;
  // Plage horaire à afficher : bornée aux heures réellement utilisées (avec 1h de
  // marge de chaque côté), au lieu d'un 0h–23h majoritairement vide. Plancher à
  // une fenêtre lisible même si tout est concentré sur une seule heure.
  const heuresActives = parHeureCrea.map((n, h) => (n > 0 ? h : -1)).filter((h) => h >= 0);
  let hMin = 8, hMax = 23;
  if (heuresActives.length > 0) {
    hMin = Math.max(0, Math.min(...heuresActives) - 1);
    hMax = Math.min(23, Math.max(...heuresActives) + 1);
    // garantir au moins 6 colonnes pour que les barres ne soient pas démesurées
    while (hMax - hMin < 5) { if (hMin > 0) hMin--; else if (hMax < 23) hMax++; else break; }
  }
  const plageHeures = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i);

  const couvParJour = [0, 0, 0, 0, 0, 0, 0];
  resa.filter((r) => r.status !== "annule").forEach((r) => {
    const d = new Date(r.date + "T12:00:00");
    couvParJour[d.getDay()] += r.covers || 0;
  });
  const maxCouvJour = Math.max(...couvParJour);
  const jourTop = maxCouvJour > 0 ? JOURS_LONG[couvParJour.indexOf(maxCouvJour)] : null;

  // Disponibilité par service, sur toute la fenêtre de réservation (horizon configuré)
  const jours = Array.from({ length: horizon }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const h = hours.find((x) => x.day_of_week === d.getDay());
    const ferme = !h || h.is_closed;
    const sertMidi = !ferme && !!h?.lunch_open;
    const sertSoir = !ferme && !!h?.dinner_open;
    const midiRes = couvertsLe(ds, "midi");
    const soirRes = couvertsLe(ds, "soir");
    return {
      d, ds, isToday: i === 0, ferme, sertMidi, sertSoir,
      midiRes, soirRes,
      midiDispo: Math.max(0, capacite - midiRes),
      soirDispo: Math.max(0, capacite - soirRes),
    };
  });

  // Jours de la semaine actuellement affichée (7 max), bornés à l'horizon.
  const debutSem = semaine * 7;
  const joursSemaine = jours.slice(debutSem, debutSem + 7);
  // Libellé de la plage affichée (ex. "22 – 28 juin").
  const plageLabel = joursSemaine.length
    ? (() => {
        const a = joursSemaine[0].d;
        const b = joursSemaine[joursSemaine.length - 1].d;
        const fin = `${b.getDate()} ${MOIS[b.getMonth()]}`;
        const debut = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MOIS[a.getMonth()]}`;
        return `${debut} – ${fin}`;
      })()
    : "";

  // Une mini-carte de service (midi ou soir) : places libres + jauge + état.
  function serviceCarte(titre: string, sert: boolean, res: number, dispo: number) {
    if (!sert) {
      return (
        <div className="svc svc-ferme">
          <div className="svc-titre">{titre}</div>
          <div className="svc-ferme-txt">Pas de service</div>
        </div>
      );
    }
    const pct = capacite ? Math.min(100, Math.round((res / capacite) * 100)) : 0;
    const complet = dispo === 0;
    const etat = complet ? "complet" : pct >= 75 ? "charge" : pct >= 40 ? "moyen" : "libre";
    const libelle = complet ? "Complet" : pct >= 75 ? "Presque complet" : pct >= 40 ? "Se remplit" : "Disponible";
    return (
      <div className={`svc svc-${etat}`}>
        <div className="svc-titre">{titre}</div>
        <div className="svc-places"><b>{dispo}</b><span>place{dispo > 1 ? "s" : ""} libre{dispo > 1 ? "s" : ""}</span></div>
        <div className="svc-jauge"><div className="svc-jauge-fill" style={{ width: `${pct}%` }} /></div>
        <div className="svc-bas"><span className="svc-etat">{libelle}</span><span className="svc-res">{res} rés.</span></div>
      </div>
    );
  }

  return (
    <>
      <div className="topbar"><div><h1>Tableau de bord</h1><div className="sous">Vue d'ensemble de votre activité</div></div></div>
      <div className="contenu">
        <div className="cartes-stat cartes-stat-kpi">
          <div className="stat"><div className="lib">Couverts aujourd'hui</div><div className="val">{couvAujTotal}</div><div className="det">{nbResaAuj} réservation(s)</div></div>
          <div className="stat"><div className="lib">Disponibles ce midi</div><div className="val" style={{ color: jours[0].midiDispo === 0 ? "var(--annule)" : "var(--ok)" }}>{jours[0].sertMidi ? jours[0].midiDispo : "—"}</div><div className="det">{jours[0].sertMidi ? `sur ${capacite} couverts` : "pas de service midi"}</div></div>
          <div className="stat"><div className="lib">Disponibles ce soir</div><div className="val" style={{ color: jours[0].soirDispo === 0 ? "var(--annule)" : "var(--ok)" }}>{jours[0].sertSoir ? jours[0].soirDispo : "—"}</div><div className="det">{jours[0].sertSoir ? `sur ${capacite} couverts` : "pas de service soir"}</div></div>
          <div className="stat"><div className="lib">À confirmer</div><div className="val" style={{ color: att > 0 ? "var(--attente)" : "var(--ink)" }}>{att}</div><div className="det">demandes en attente</div></div>
          <div className="stat"><div className="lib">Contacts récoltés</div><div className="val">{leads.length}</div><div className="det">newsletter + réservations</div></div>
        </div>

        {/* Vue semaine — 7 jours glissants depuis aujourd'hui */}
        <div className="bloc semaine-bloc">
          <div className="bloc-tete">
            <div><h2>Cette semaine</h2><div className="desc">Couverts réservés par jour et par service — cliquer sur un jour pour ouvrir le plan de service.</div></div>
          </div>
          <div className="semaine-grille">
            {jours.slice(0, 7).map((j) => {
              const pctMidi = capacite && j.sertMidi ? Math.min(100, Math.round((j.midiRes / capacite) * 100)) : 0;
              const pctSoir = capacite && j.sertSoir ? Math.min(100, Math.round((j.soirRes / capacite) * 100)) : 0;
              const etatMidi = !j.sertMidi ? "ferme" : pctMidi >= 100 ? "complet" : pctMidi >= 75 ? "charge" : pctMidi >= 40 ? "moyen" : "libre";
              const etatSoir = !j.sertSoir ? "ferme" : pctSoir >= 100 ? "complet" : pctSoir >= 75 ? "charge" : pctSoir >= 40 ? "moyen" : "libre";
              return (
                <div
                  key={j.ds}
                  className={`semaine-jour${j.isToday ? " semaine-jour-auj" : ""}${j.ferme ? " semaine-jour-ferme" : ""}`}
                  onClick={() => onNavigate?.("reservations", j.ds)}
                  title={`Voir le plan de service du ${j.d.getDate()} ${MOIS[j.d.getMonth()]}`}
                >
                  <div className="semaine-nom">{j.isToday ? "Auj." : JOURS[j.d.getDay()]}</div>
                  <div className="semaine-date">{j.d.getDate()} {MOIS[j.d.getMonth()]}</div>
                  {j.ferme ? (
                    <div className="semaine-ferme">Fermé</div>
                  ) : (
                    <div className="semaine-services">
                      <div className={`semaine-svc semaine-svc-${etatMidi}`}>
                        <span className="semaine-svc-label">Midi</span>
                        <div className="semaine-svc-jauge"><div style={{ width: `${pctMidi}%` }} /></div>
                        <span className="semaine-svc-val">{j.sertMidi ? `${j.midiRes}/${capacite}` : "—"}</span>
                      </div>
                      <div className={`semaine-svc semaine-svc-${etatSoir}`}>
                        <span className="semaine-svc-label">Soir</span>
                        <div className="semaine-svc-jauge"><div style={{ width: `${pctSoir}%` }} /></div>
                        <span className="semaine-svc-val">{j.sertSoir ? `${j.soirRes}/${capacite}` : "—"}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bloc">
          <div className="bloc-tete dispo-tete">
            <div><h2>Disponibilité par service</h2><div className="desc">Capacité : {capacite} couverts par service. Les places libres tiennent compte des réservations confirmées et en attente. Horizon modifiable dans « Réservations &amp; site ».</div></div>
            {capacite > 0 && nbSemaines > 1 && (
              <div className="dispo-nav">
                <button className="dispo-nav-btn" onClick={() => setSemaine((s) => Math.max(0, s - 1))} disabled={semaine === 0} aria-label="Semaine précédente">‹</button>
                <span className="dispo-nav-plage">{plageLabel}</span>
                <button className="dispo-nav-btn" onClick={() => setSemaine((s) => Math.min(nbSemaines - 1, s + 1))} disabled={semaine >= nbSemaines - 1} aria-label="Semaine suivante">›</button>
              </div>
            )}
          </div>
          {capacite === 0 ? (
            <div className="vide">Aucune table active. Configurez votre plan de salle pour voir la disponibilité.</div>
          ) : (
            <div className="dispo-jours">
              {joursSemaine.map((j) => (
                <div className={`jour-carte${j.isToday ? " jour-auj" : ""}`} key={j.ds}>
                  <div className="jour-entete">
                    <span className="jour-nom">{j.isToday ? "Aujourd'hui" : JOURS[j.d.getDay()]}</span>
                    <span className="jour-date">{j.isToday ? `${JOURS[j.d.getDay()]} ${j.d.getDate()} ${MOIS[j.d.getMonth()]}` : `${j.d.getDate()} ${MOIS[j.d.getMonth()]}`}</span>
                    {j.ferme && <span className="jour-ferme">Fermé</span>}
                  </div>
                  <div className="jour-services">
                    {serviceCarte("Midi", j.sertMidi, j.midiRes, j.midiDispo)}
                    {serviceCarte("Soir", j.sertSoir, j.soirRes, j.soirDispo)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bloc">
          <div className="bloc-tete"><div><h2>Indicateurs</h2><div className="desc">Sur les 30 derniers jours, sauf clients récurrents et jour le plus demandé (historique complet).</div></div></div>
          <div className="cartes-stat" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <div className="stat"><div className="lib">Taux d'annulation</div><div className="val" style={{ color: tauxAnnulation >= 20 ? "var(--annule)" : "var(--ink)" }}>{tauxAnnulation}%</div><div className="det">{nbAnnulePeriode} sur {periode.length} réservation(s)</div></div>
            <div className="stat"><div className="lib">Taux de no-show</div><div className="val" style={{ color: tauxNoShow >= 10 ? "var(--annule)" : "var(--ink)" }}>{tauxNoShow}%</div><div className="det">{nbNoShowPeriode} absence(s) constatée(s)</div></div>
            <div className="stat"><div className="lib">Taille de groupe moy.</div><div className="val">{tailleMoyenne.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</div><div className="det">couverts par réservation</div></div>
            <div className="stat"><div className="lib">Clients récurrents</div><div className="val">{tauxRecurrence}%</div><div className="det">{nbRecurrents} sur {nbClientsUniques} client(s)</div></div>
            <div className="stat"><div className="lib">Jour le plus demandé</div><div className="val" style={{ fontSize: jourTop ? undefined : 18 }}>{jourTop || "—"}</div><div className="det">{jourTop ? `${maxCouvJour} couverts cumulés` : "pas encore assez de données"}</div></div>
          </div>
        </div>

        <div className="bloc">
          <div className="bloc-tete"><div><h2>Origine des réservations</h2><div className="desc">Répartition sur l'ensemble des réservations ({actives.length} au total, hors annulées).</div></div></div>
          {actives.length === 0 ? (
            <div className="vide">Aucune réservation pour le moment.</div>
          ) : (
            <>
              <div className="canal-barre">
                <div className="canal-seg canal-site" style={{ width: `${pctSite}%` }} />
                <div className="canal-seg canal-tel" style={{ width: `${pctTel}%` }} />
              </div>
              <div className="canal-legende">
                <div><span className="canal-pastille canal-site" /> En ligne — <b>{pctSite}%</b> <span className="sub-desc">({nbSite})</span></div>
                <div><span className="canal-pastille canal-tel" /> Téléphone — <b>{pctTel}%</b> <span className="sub-desc">({nbTel})</span></div>
              </div>
            </>
          )}
        </div>

        <div className="bloc">
          <div className="bloc-tete"><div><h2>Quand vos clients réservent en ligne</h2><div className="desc">Heure à laquelle les demandes sont passées sur le site ({resaEnLigne.length} réservation{resaEnLigne.length > 1 ? "s" : ""} en ligne). Utile pour savoir quand votre site travaille pour vous.</div></div></div>
          {resaEnLigne.length === 0 ? (
            <div className="vide">Aucune réservation en ligne pour le moment.</div>
          ) : (
            <>
              <div className="crea-histo">
                {plageHeures.map((h) => {
                  const n = parHeureCrea[h];
                  return (
                    <div key={h} className="crea-col" title={`${h}h–${h + 1}h : ${n} réservation${n > 1 ? "s" : ""}`}>
                      <div className="crea-barre-zone">
                        {n > 0 && (
                          <div className="crea-barre" style={{ height: `${Math.round((n / maxHeureCrea) * 100)}%` }}>
                            <span className="crea-val">{n}</span>
                          </div>
                        )}
                      </div>
                      <div className="crea-h">{h}h</div>
                    </div>
                  );
                })}
              </div>
              <div className="crea-legende">
                {heureTop && <div><span className="sub-desc">Créneau le plus actif :</span> <b>{heureTop}</b></div>}
                {jourCreaTop && <div><span className="sub-desc">Jour où l'on réserve le plus :</span> <b>{jourCreaTop}</b></div>}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
