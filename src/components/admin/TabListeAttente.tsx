import { useTable } from "../../hooks/useTable";
import { useConfirm } from "./Confirm";

interface WaitlistEntry {
  id: string; date: string; time: string; covers: number;
  customer_name: string; email: string; phone: string; notified: boolean; created_at: string;
}

function fmtDate(d: string) {
  try { return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); }
  catch { return d; }
}

export default function TabListeAttente() {
  const confirm = useConfirm();
  const { rows, remove } = useTable<WaitlistEntry>("waitlist", "created_at");

  async function supprimer(e: WaitlistEntry) {
    if (await confirm({ titre: "Retirer de la liste ?", message: `${e.customer_name} sera retiré de la liste d'attente.`, confirmer: "Retirer", danger: true }))
      remove(e.id);
  }

  const enAttente = rows.filter((r) => !r.notified);
  const notifies  = rows.filter((r) => r.notified);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Liste d'attente</h1>
          <div className="sous">{enAttente.length} client{enAttente.length > 1 ? "s" : ""} en attente de notification</div>
        </div>
      </div>
      <div className="contenu">
        <div className="bloc">
          <h2>En attente ({enAttente.length})</h2>
          <table><thead><tr>
            <th>Date</th><th>Heure</th><th>Couverts</th><th>Client</th><th>Email</th><th></th>
          </tr></thead><tbody>
            {enAttente.length ? enAttente.map((e) => (
              <tr key={e.id}>
                <td>{fmtDate(e.date)}</td>
                <td>{e.time.replace(":", "h")}</td>
                <td>{e.covers}</td>
                <td><b>{e.customer_name}</b><div className="sub-desc">{e.phone}</div></td>
                <td>{e.email}</td>
                <td><button className="btn btn-mini btn-danger" onClick={() => supprimer(e)}>Retirer</button></td>
              </tr>
            )) : <tr><td colSpan={6} className="vide">Aucun client en attente.</td></tr>}
          </tbody></table>
        </div>
        {notifies.length > 0 && (
          <div className="bloc">
            <h2>Notifiés ({notifies.length})</h2>
            <table><thead><tr>
              <th>Date</th><th>Heure</th><th>Couverts</th><th>Client</th><th></th>
            </tr></thead><tbody>
              {notifies.map((e) => (
                <tr key={e.id} style={{ opacity: 0.6 }}>
                  <td>{fmtDate(e.date)}</td>
                  <td>{e.time.replace(":", "h")}</td>
                  <td>{e.covers}</td>
                  <td><b>{e.customer_name}</b></td>
                  <td><button className="btn btn-mini btn-ligne" onClick={() => supprimer(e)}>Retirer</button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
      </div>
    </>
  );
}
