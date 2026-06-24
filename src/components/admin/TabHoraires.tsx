import { useTable } from "../../hooks/useTable";
import { useState } from "react";
import type { OpeningHour, ClosurePeriod } from "../../lib/types";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function TabHoraires() {
  const oh = useTable<OpeningHour>("opening_hours", "day_of_week");
  const cp = useTable<ClosurePeriod>("closure_periods", "start_date");
  const [nc, setNc] = useState({ start_date: "", end_date: "", reason: "" });
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
    const ok = await cp.insert({ ...nc, blocks_reservations: true });
    if (ok) { setNc({ start_date: "", end_date: "", reason: "" }); setErr(""); }
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
          <h2>Fermetures exceptionnelles</h2>
          <table><thead><tr><th>Du</th><th>Au</th><th>Motif</th><th></th></tr></thead><tbody>
            {cp.rows.length ? cp.rows.map((c) => (
              <tr key={c.id}><td>{c.start_date}</td><td>{c.end_date}</td><td>{c.reason || "—"}</td>
                <td><button className="btn btn-mini btn-danger" onClick={() => cp.remove(c.id)}>Supprimer</button></td></tr>
            )) : <tr><td colSpan={4} className="vide">Aucune fermeture programmée.</td></tr>}
          </tbody></table>
          <div className="grid2" style={{ marginTop: 14 }}>
            <div className="champ"><label>Date de début</label><input type="date" value={nc.start_date} onChange={(e) => setNc({ ...nc, start_date: e.target.value })} /></div>
            <div className="champ"><label>Date de fin</label><input type="date" value={nc.end_date} onChange={(e) => setNc({ ...nc, end_date: e.target.value })} /></div>
          </div>
          <div className="champ"><label>Motif (affiché au client)</label><input value={nc.reason} onChange={(e) => setNc({ ...nc, reason: e.target.value })} placeholder="Congés d'été" /></div>
          <button className="btn btn-accent" onClick={addClosure}>Ajouter une fermeture</button>
        </div>
      </div>
    </>
  );
}
