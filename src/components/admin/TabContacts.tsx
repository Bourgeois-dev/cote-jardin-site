import { useTable } from "../../hooks/useTable";
import type { Lead } from "../../lib/types";

export default function TabContacts() {
  // Seuls les contacts opt-in newsletter (consent = true) apparaissent ici.
  // Les opt-out (désinscription via lien email) sont exclus de la liste.
  const { rows: allRows } = useTable<Lead>("leads", "created_at");
  const rows = allRows.filter((l) => l.consent === true);

  function exportCsv() {
    const head = "Prénom,Nom,Email,Source,Date\n";
    const body = rows.map((l) =>
      `${l.first_name || ""},${l.last_name || ""},${l.email},${l.source || ""},${new Date(l.created_at).toLocaleDateString("fr-FR")}`
    ).join("\n");
    const blob = new Blob([head + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "contacts.csv"; a.click();
  }

  return (
    <>
      <div className="topbar">
        <div><h1>Contacts</h1><div className="sous">Inscrits newsletter (opt-in actif)</div></div>
      </div>
      <div className="contenu"><div className="bloc">
        <div className="bloc-tete">
          <div><h2>{rows.length} contact{rows.length > 1 ? "s" : ""}</h2></div>
          <button className="btn btn-ligne" onClick={exportCsv}>Exporter en CSV</button>
        </div>
        <table><thead><tr><th>Nom</th><th>Email</th><th>Source</th><th>Date</th></tr></thead><tbody>
          {rows.length ? rows.map((l) => (
            <tr key={l.id}>
              <td>{l.first_name} {l.last_name}</td>
              <td>{l.email}</td>
              <td>{l.source === "reservation" ? "Réservation" : "Newsletter"}</td>
              <td>{new Date(l.created_at).toLocaleDateString("fr-FR")}</td>
            </tr>
          )) : <tr><td colSpan={4} className="vide">Aucun contact inscrit.</td></tr>}
        </tbody></table>
      </div></div>
    </>
  );
}
