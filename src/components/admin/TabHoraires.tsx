import { useTable } from "../../hooks/useTable";
import { useState } from "react";
import type { OpeningHour, ClosurePeriod } from "../../lib/types";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function TabHoraires() {
  const oh = useTable<OpeningHour>("opening_hours", "day_of_week");
  const cp = useTable<ClosurePeriod>("closure_periods", "start_date");
  const [nc, setNc] = useState({ start_date: "", end_date: "", reason: "", service: "", note_interne: "", custom_message: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const jours = oh.rows.slice().sort((a, b) => a.day_of_week - b.day_of_week);

  async function setHeure(h: OpeningHour, champ: keyof OpeningHour, val: string) {
    const ok = await oh.update(h.id, { [champ]: val || null });
    if (ok) { setMsg("Horaires enregistrés ✓"); setTimeout(() => setMsg(""), 2000); }
    else setErr("Échec de l'enregistrement.");
  }
  async function toggleJour(h: OpeningHour, ouvert: boolean) {
    await oh.update(h.id, { is_closed: !ouvert });
  }
  async function addClosure() {
    if (!nc.start_date || !nc.end_date) { setErr("Renseignez les deux dates."); return; }
    const ok = await cp.insert({ ...nc, blocks_reservations: true, service: nc.service || null });
    if (ok) { setNc({ start_date: "", end_date: "", reason: "", service: "", note_interne: "", custom_message: "" }); setErr(""); }
    else setErr("Échec de l'ajout.");
  }

  return (
    <>
      <div className="topbar"><div><h1>Horaires</h1><div className="sous">Ouvertures et fermetures exceptionnelles</div></div></div>
      <div className="contenu">
        <div className="bloc">
          <div className="bloc-tete"><div><h2>Horaires d'ouverture</h2><div className="desc">Laissez un créneau vide si le restaurant n'ouvre pas à ce moment (ex. pas de service le midi).</div></div>{msg && <span className="ok-msg">{msg}</span>}</div>
          {err && <div className="login-err">{err}</div>}
          <table className="tab-horaires"><thead><tr>
            <th>Jour</th><th>Ouvert</th><th>Midi</th><th>Soir</th>
          </tr></thead><tbody>
            {jours.map((h) => (
              <tr key={h.id}>
                <td style={{ width: 100 }}><b>{JOURS[h.day_of_week]}</b></td>
                <td style={{ width: 70 }}>
                  <label className="toggle"><input type="checkbox" checked={!h.is_closed} onChange={(e) => toggleJour(h, e.target.checked)} /><span className="piste" /></label>
                </td>
                <td>
                  {h.is_closed ? <span className="sub-desc">—</span> : (
                    <div className="creneau-edit">
                      <input type="time" defaultValue={h.lunch_open || ""} onBlur={(e) => setHeure(h, "lunch_open", e.target.value)} />
                      <span>→</span>
                      <input type="time" defaultValue={h.lunch_close || ""} onBlur={(e) => setHeure(h, "lunch_close", e.target.value)} />
                    </div>
                  )}
                </td>
                <td>
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

        <div className="bloc">
          <div className="bloc-tete"><div><h2>Fermetures &amp; événements exceptionnels</h2><div className="desc">Fermetures totales, partielles (midi ou soir uniquement), ou événements privatifs. Le widget masque automatiquement les créneaux bloqués.</div></div></div>
          <table><thead><tr><th>Du</th><th>Au</th><th>Service</th><th>Motif</th><th>Note interne</th><th></th></tr></thead><tbody>
            {cp.rows.length ? cp.rows.map((cl) => (
              <tr key={cl.id}>
                <td>{cl.start_date}</td>
                <td>{cl.end_date}</td>
                <td>{cl.service === "midi" ? "Midi seul." : cl.service === "soir" ? "Soir seul." : "Toute la journée"}</td>
                <td>{cl.reason || "—"}</td>
                <td><span className="sub-desc">{cl.note_interne || "—"}</span></td>
                <td><button className="btn btn-mini btn-danger" onClick={() => cp.remove(cl.id)}>Supprimer</button></td>
              </tr>
            )) : <tr><td colSpan={6} className="vide">Aucune fermeture programmée.</td></tr>}
          </tbody></table>

          <div style={{ marginTop: 20, borderTop: "1px solid var(--ligne)", paddingTop: 18 }}>
            <div className="grid2">
              <div className="champ"><label>Date de début</label><input type="date" value={nc.start_date} onChange={(e) => setNc({ ...nc, start_date: e.target.value })} /></div>
              <div className="champ"><label>Date de fin</label><input type="date" value={nc.end_date} onChange={(e) => setNc({ ...nc, end_date: e.target.value })} /></div>
            </div>
            <div className="grid2">
              <div className="champ">
                <label>Service bloqué</label>
                <select value={nc.service} onChange={(e) => setNc({ ...nc, service: e.target.value })}>
                  <option value="">Toute la journée</option>
                  <option value="midi">Midi uniquement</option>
                  <option value="soir">Soir uniquement</option>
                </select>
              </div>
              <div className="champ"><label>Motif client (affiché sur le widget)</label><input value={nc.reason} onChange={(e) => setNc({ ...nc, reason: e.target.value })} placeholder="Congés d'été" /></div>
            </div>
            <div className="champ"><label>Message personnalisé sur le widget</label><input value={nc.custom_message} onChange={(e) => setNc({ ...nc, custom_message: e.target.value })} placeholder="Nous sommes complets ce soir — prochain créneau disponible le…" /></div>
            <div className="champ"><label>Note interne (non visible sur le site)</label><input value={nc.note_interne} onChange={(e) => setNc({ ...nc, note_interne: e.target.value })} placeholder="Séminaire entreprise, salle privée" /></div>
            <button className="btn btn-accent" onClick={addClosure}>Ajouter</button>
          </div>
        </div>
      </div>
    </>
  );
}
