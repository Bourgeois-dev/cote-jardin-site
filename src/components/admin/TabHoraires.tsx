import { useTable } from "../../hooks/useTable";
import { useState } from "react";
import type { OpeningHour, ClosurePeriod } from "../../lib/types";
import { useToast } from "./Toast";
import Chargement from "./Chargement";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// Les dates arrivent en ISO (AAAA-MM-JJ) : les afficher telles quelles dans une
// interface française jure avec le reste de l'admin.
function frDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [a, m, j] = String(d).split("-");
  return j && m && a ? `${j}/${m}/${a}` : String(d);
}
// Une fermeture d'un seul jour n'a pas à s'écrire « du 12/08 au 12/08 ».
function frPeriode(debut: string, fin: string): string {
  return debut === fin ? frDate(debut) : `${frDate(debut)} → ${frDate(fin)}`;
}
const LIBELLE_SERVICE: Record<string, string> = {
  midi: "Midi seulement", soir: "Soir seulement", "": "Toute la journée",
};

export default function TabHoraires() {
  const toast = useToast();
  const oh = useTable<OpeningHour>("opening_hours", "day_of_week");
  const cp = useTable<ClosurePeriod>("closure_periods", "start_date");
  const [nc, setNc] = useState({ start_date: "", end_date: "", reason: "", service: "", note_interne: "" });
  const [err, setErr] = useState("");

  const jours = oh.rows.slice().sort((a, b) => a.day_of_week - b.day_of_week);

  async function setHeure(h: OpeningHour, champ: keyof OpeningHour, val: string) {
    const ok = await oh.update(h.id, { [champ]: val || null });
    if (ok) toast.ok("Horaires enregistrés");
    else setErr("Échec de l'enregistrement.");
  }
  async function toggleJour(h: OpeningHour, ouvert: boolean) {
    await oh.update(h.id, { is_closed: !ouvert });
  }
  async function addClosure() {
    if (!nc.start_date || !nc.end_date) { setErr("Renseignez les deux dates."); return; }
    const ok = await cp.insert({ ...nc, service: nc.service || null });
    if (ok) { setNc({ start_date: "", end_date: "", reason: "", service: "", note_interne: "" }); setErr(""); }
    else setErr("Échec de l'ajout.");
  }

  return (
    <>
      <div className="topbar"><div><h1>Horaires</h1><div className="sous">
        Ouvertures affichées sur le site et fermetures exceptionnelles
      </div></div></div>
      <div className="contenu">
        {oh.loading && oh.rows.length === 0 && <Chargement />}
        <div className="bloc">
          <div className="bloc-tete"><div><h2>Horaires d'ouverture</h2><div className="desc">Laissez un créneau vide si le restaurant n'ouvre pas à ce moment (ex. pas de service le midi).</div></div></div>
          {err && <div className="err-inline">{err}</div>}
          <table className="tab-horaires tbl-cartes"><thead><tr>
            <th>Jour</th><th>Ouvert</th><th>Midi</th><th>Soir</th>
          </tr></thead><tbody>
            {jours.map((h) => (
              <tr key={h.id}>
                <td data-label="Jour" style={{ width: 100 }}><b>{JOURS[h.day_of_week]}</b></td>
                <td data-label="Ouvert" style={{ width: 70 }}>
                  <label className="toggle"><input type="checkbox" checked={!h.is_closed} onChange={(e) => toggleJour(h, e.target.checked)} /><span className="piste" /></label>
                </td>
                <td data-label="Midi">
                  {h.is_closed ? <span className="sub-desc">—</span> : (
                    <div className="creneau-edit">
                      <input type="time" defaultValue={h.lunch_open || ""} onBlur={(e) => setHeure(h, "lunch_open", e.target.value)} />
                      <span>→</span>
                      <input type="time" defaultValue={h.lunch_close || ""} onBlur={(e) => setHeure(h, "lunch_close", e.target.value)} />
                    </div>
                  )}
                </td>
                <td data-label="Soir">
                  {h.is_closed ? <span className="sub-desc">—</span> : (
                    <div className="creneau-edit">
                      <input type="time" defaultValue={h.dinner_open || ""} onBlur={(e) => setHeure(h, "dinner_open", e.target.value)} />
                      <span>→</span>
                      <input type="time" defaultValue={h.dinner_close || ""} onBlur={(e) => setHeure(h, "dinner_close", e.target.value)} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody></table>
          <div className="hint">Les heures s'enregistrent automatiquement quand vous quittez le champ. Un créneau vide = pas de service à ce moment-là.</div>
        </div>

        {/* Fermetures exceptionnelles : mémo interne du restaurateur, repris
            par l'assistant IA quand il rédige une campagne ou une bannière
            (les fermetures à venir font partie de son contexte). */}
          <div className="bloc">
            <div className="bloc-tete"><div><h2>Fermetures &amp; événements exceptionnels</h2><div className="desc">Congés, jours fériés, privatisations. Notées ici, elles servent de mémo et sont reprises par l'assistant IA quand il rédige vos campagnes.</div></div></div>
            {/* Sans aucune fermeture, un en-tête de tableau seul flotte au-dessus
                du vide : on affiche un état vide franc à la place. */}
            {cp.rows.length === 0 ? (
              <div className="ferm-vide">
                Aucune fermeture programmée.
                <span>Congés, jour férié, privatisation : ajoutez-les ci-dessous pour les garder sous les yeux.</span>
              </div>
            ) : (
              <table className="tab-fermetures tbl-cartes"><thead><tr><th>Période</th><th>Service</th><th>Motif</th><th>Note interne</th><th></th></tr></thead><tbody>
                {cp.rows.map((cl) => (
                  <tr key={cl.id}>
                    <td data-label="Période"><b>{frPeriode(cl.start_date, cl.end_date)}</b></td>
                    <td data-label="Service"><span className="tag t-neutre">{LIBELLE_SERVICE[cl.service || ""]}</span></td>
                    <td data-label="Motif">{cl.reason || "—"}</td>
                    <td data-label="Note interne"><span className="sub-desc">{cl.note_interne || "—"}</span></td>
                    <td className="td-actions"><button className="btn btn-mini btn-danger" onClick={() => cp.remove(cl.id)}>Supprimer</button></td>
                  </tr>
                ))}
              </tbody></table>
            )}

            {/* Formulaire dans un panneau à part : sans conteneur, la pile de
                champs flottait sous le tableau sans qu'on sache où elle commence. */}
            <div className="ferm-form">
              <div className="ferm-form-titre">Ajouter une fermeture</div>
              <div className="ferm-dates">
                <div className="champ"><label>Du</label><input type="date" value={nc.start_date} onChange={(e) => setNc({ ...nc, start_date: e.target.value, end_date: nc.end_date && nc.end_date < e.target.value ? e.target.value : nc.end_date })} /></div>
                {/* `min` sur la date de fin : une période à l'envers est impossible
                    à saisir plutôt que refusée après coup. */}
                <div className="champ"><label>Au</label><input type="date" min={nc.start_date || undefined} value={nc.end_date} onChange={(e) => setNc({ ...nc, end_date: e.target.value })} /></div>
                <div className="champ">
                  <label>Service concerné</label>
                  <select value={nc.service} onChange={(e) => setNc({ ...nc, service: e.target.value })}>
                    <option value="">Toute la journée</option>
                    <option value="midi">Midi uniquement</option>
                    <option value="soir">Soir uniquement</option>
                  </select>
                </div>
              </div>

              <div className="grid2">
                <div className="champ"><label>Motif</label><input value={nc.reason} onChange={(e) => setNc({ ...nc, reason: e.target.value })} placeholder="Congés d'été" /></div>
                <div className="champ ferm-interne"><label>Note interne <span>— non visible sur le site</span></label><input value={nc.note_interne} onChange={(e) => setNc({ ...nc, note_interne: e.target.value })} placeholder="Séminaire entreprise, salle privée" /></div>
              </div>

              <div className="ferm-actions">
                <span className="ferm-aide">Une seule journée ? Indiquez la même date des deux côtés.</span>
                <button className="btn btn-accent" onClick={addClosure}>Ajouter la fermeture</button>
              </div>
            </div>
          </div>
      </div>
    </>
  );
}
