import { useState } from "react";
import { useTable } from "../../hooks/useTable";
import { sendReservationEmail, notifyWaitlist } from "../../lib/supabase";
import type { Reservation, RestaurantTable } from "../../lib/types";
import PlanService from "./PlanService";
import { useToast } from "./Toast";
import Chargement from "./Chargement";

const STATUTS: Record<string, string> = { attente: "t-attente", confirme: "t-ok", annule: "t-annule", no_show: "t-noshow" };
const LABELS: Record<string, string> = { attente: "En attente", confirme: "Confirmée", annule: "Annulée", no_show: "Absent" };

export default function TabReservations({ initialDate, initialService }: { initialDate?: string; initialService?: "midi" | "soir" } = {}) {
  const toast = useToast();
  // Fenêtre glissante : J-90 à aujourd'hui + futur — historique récent sans tout charger
  const dateMin90 = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0,10); })();
  const { rows, loading, update } = useTable<Reservation>("reservations", "date", true, { column: "date", op: "gte", value: dateMin90 });
  const { rows: tables } = useTable<RestaurantTable>("restaurant_tables", "label");
  const [sensTri, setSensTri] = useState<"asc" | "desc">("asc");
  const [filtre, setFiltre] = useState<"avenir" | "passees" | "toutes">("avenir");
  const [recherche, setRecherche] = useState("");
  const [vue, setVue] = useState<"liste" | "plan">("plan");

  // Tri + filtre appliqués côté client
  const todayStr = new Date().toISOString().slice(0, 10);
  const q = recherche.trim().toLowerCase();
  const affichees = rows
    .filter((r) => {
      if (filtre === "avenir") return r.date >= todayStr;
      if (filtre === "passees") return r.date < todayStr;
      return true;
    })
    .filter((r) => {
      if (!q) return true;
      return (r.customer_name || "").toLowerCase().includes(q)
        || (r.phone || "").toLowerCase().includes(q)
        || (r.email || "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const cmp = (a.date + a.time).localeCompare(b.date + b.time);
      return sensTri === "asc" ? cmp : -cmp;
    });

  async function confirmer(r: Reservation) {
    const ok = await update(r.id, { status: "confirme" });
    if (ok) {
      if (r.email) sendReservationEmail("confirmation", r);
      toast.ok(`Réservation de ${r.customer_name} confirmée${r.email ? " — e-mail envoyé" : ""}`);
    }
  }
  async function annuler(r: Reservation) { const ok = await update(r.id, { status: "annule" }); if (ok) notifyWaitlist(r.date, r.time); }

  return (
    <>
      <div className="topbar">
        <div><h1>Réservations</h1><div className="sous">{vue === "plan" ? "Plan de service — attribuez les tables" : "Carnet — toutes vos réservations"}</div></div>
        <div className="ps-services">
          <button className={`puce ${vue === "plan" ? "active" : ""}`} onClick={() => setVue("plan")}>Plan de service</button>
          <button className={`puce ${vue === "liste" ? "active" : ""}`} onClick={() => setVue("liste")}>Carnet</button>
        </div>
      </div>
      {vue === "plan" ? (
        <div className="contenu pleine"><PlanService initialDate={initialDate} initialService={initialService} /></div>
      ) : (
      <div className="contenu">
        {loading && rows.length === 0 && <Chargement />}<div className="bloc">
        <div className="bloc-tete">
          <div><h2>Le carnet</h2><div className="desc">Toutes vos réservations, passées et à venir</div></div>
        </div>
        <div className="carnet-barre">
          <input className="carnet-search" type="search" placeholder="Rechercher un client, un téléphone, un email…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          <div className="filtres-resa">
            <button className={`puce ${filtre === "avenir" ? "active" : ""}`} onClick={() => setFiltre("avenir")}>À venir</button>
            <button className={`puce ${filtre === "passees" ? "active" : ""}`} onClick={() => setFiltre("passees")}>Passées</button>
            <button className={`puce ${filtre === "toutes" ? "active" : ""}`} onClick={() => setFiltre("toutes")}>Toutes</button>
          </div>
        </div>
        {q && <div className="desc" style={{ marginBottom: 10 }}>{affichees.length} résultat(s) pour « {recherche} »</div>}
        <table><thead><tr><th className="th-tri" onClick={() => setSensTri(sensTri === "asc" ? "desc" : "asc")}>Date {sensTri === "asc" ? "↑" : "↓"}</th><th>Heure</th><th>Client</th><th>Couverts</th><th>Table</th><th>Origine</th><th>Statut</th><th></th></tr></thead><tbody>
          {affichees.length ? affichees.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</td>
              <td>{r.time}</td>
              <td><b>{r.customer_name}</b><div className="sub-desc">{r.phone}</div>{r.email && <div className="sub-desc">{r.email}</div>}</td>
              <td>{r.covers}</td>
              <td>{(r.table_ids?.length ?? 0) > 0 ? <b style={{ color: "var(--admin-accent)" }}>{r.table_ids.map((tid) => tables.find((t) => t.id === tid)?.label || "?").join(", ")}</b> : <span className="sub-desc">—</span>}</td>
              <td><span className="sub-desc">{r.source === "telephone" ? "Téléphone" : "Site web"}</span></td>
              <td><span className={`tag ${STATUTS[r.status] || ""}`}>{LABELS[r.status] || r.status}</span></td>
              <td><div className="actions-ligne">
                {r.status !== "confirme" && r.status !== "no_show" && <button className="btn btn-mini btn-ok" onClick={() => confirmer(r)}>Confirmer</button>}
                {r.status !== "annule" && <button className="btn btn-mini btn-danger" onClick={() => annuler(r)}>Annuler</button>}
              </div></td>
            </tr>
          )) : <tr><td colSpan={8} className="vide">{q ? "Aucun résultat pour cette recherche." : filtre === "avenir" ? "Aucune réservation à venir." : filtre === "passees" ? "Aucune réservation passée." : "Aucune réservation."}</td></tr>}
        </tbody></table>
      </div></div>
      )}
    </>
  );
}
