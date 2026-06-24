import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useTable } from "../../hooks/useTable";
import type { Customer, Reservation } from "../../lib/types";
import { useConfirm } from "./Confirm";

const STATUT_LABEL: Record<string, string> = {
  attente: "En attente",
  confirme: "Confirmée",
  annule: "Annulée",
  no_show: "Absent",
};
const STATUT_TAG: Record<string, string> = {
  attente: "t-attente",
  confirme: "t-ok",
  annule: "t-annule",
  no_show: "t-noshow",
};

function frDate(d: string | null) {
  if (!d) return "—";
  const [y, m, j] = d.split("-");
  return `${j}/${m}/${y}`;
}

export default function TabClients() {
  const { rows: clients, loading, update, remove, reload } = useTable<Customer>("customers", "name", true);
  const confirm = useConfirm();

  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState<"name" | "last_visit" | "bookings_count">("last_visit");
  const [selId, setSelId] = useState<string | null>(null);
  const [histo, setHisto] = useState<Reservation[]>([]);
  const [histoLoad, setHistoLoad] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let r = clients.filter((c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
    );
    r = [...r].sort((a, b) => {
      if (tri === "name") return a.name.localeCompare(b.name);
      if (tri === "bookings_count") return b.bookings_count - a.bookings_count;
      // last_visit desc (nulls en bas)
      return (b.last_visit || "").localeCompare(a.last_visit || "");
    });
    return r;
  }, [clients, recherche, tri]);

  const sel = clients.find((c) => c.id === selId) || null;

  // Charge l'historique des réservations du client sélectionné
  useEffect(() => {
    if (!selId) { setHisto([]); return; }
    setHistoLoad(true);
    setNotesDraft(sel?.notes || "");
    (async () => {
      const { data } = await supabase
        .from("reservations")
        .select("*")
        .eq("customer_id", selId)
        .order("date", { ascending: false });
      setHisto((data as Reservation[]) || []);
      setHistoLoad(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  async function toggleVip() {
    if (!sel) return;
    await update(sel.id, { is_vip: !sel.is_vip });
  }
  async function saveNotes() {
    if (!sel) return;
    await update(sel.id, { notes: notesDraft });
  }
  async function supprimer() {
    if (!sel) return;
    const ok = await confirm({
      titre: "Supprimer cette fiche client ?",
      message: `La fiche de ${sel.name || "ce client"} sera supprimée. Ses réservations sont conservées mais ne seront plus rattachées à une fiche.`,
      danger: true,
      confirmer: "Supprimer",
    });
    if (!ok) return;
    await remove(sel.id);
    setSelId(null);
  }

  if (loading) return <div className="contenu"><p className="sub-desc">Chargement…</p></div>;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Clients</h1>
          <div className="sous">Historique et fiches — {clients.length} client(s)</div>
        </div>
      </div>
      <div className="contenu">

      <div className="clients-layout">
        {/* Colonne liste */}
        <div className="clients-liste">
          <input
            className="carnet-search"
            placeholder="Rechercher un nom, e-mail, téléphone…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <div className="clients-tri">
            <button className={`puce-mini ${tri === "last_visit" ? "active" : ""}`} onClick={() => setTri("last_visit")}>Récents</button>
            <button className={`puce-mini ${tri === "bookings_count" ? "active" : ""}`} onClick={() => setTri("bookings_count")}>Fidèles</button>
            <button className={`puce-mini ${tri === "name" ? "active" : ""}`} onClick={() => setTri("name")}>A→Z</button>
          </div>
          {liste.length === 0 && <p className="sub-desc" style={{ marginTop: 14 }}>Aucun client.</p>}
          <ul className="clients-items">
            {liste.map((c) => (
              <li key={c.id}>
                <button className={`client-item ${selId === c.id ? "actif" : ""}`} onClick={() => setSelId(c.id)}>
                  <div className="client-item-tete">
                    <span className="client-item-nom">{c.name || "Sans nom"}{c.is_vip && <span className="vip-pastille" title="VIP">★</span>}</span>
                    <span className="client-item-nb">{c.bookings_count} résa</span>
                  </div>
                  <div className="sub-desc">{c.email || c.phone || "—"} · dernière venue {frDate(c.last_visit)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Colonne fiche */}
        <div className="clients-fiche">
          {!sel && <div className="fiche-vide"><p className="sub-desc">Sélectionnez un client pour voir sa fiche.</p></div>}
          {sel && (
            <>
              <div className="fiche-tete">
                <div>
                  <h2 className="fiche-nom">{sel.name || "Sans nom"}</h2>
                  <div className="sub-desc">Client depuis {frDate(sel.created_at.slice(0, 10))}</div>
                </div>
                <button className={`btn btn-mini ${sel.is_vip ? "btn-accent" : "btn-ligne"}`} onClick={toggleVip}>
                  {sel.is_vip ? "★ VIP" : "Marquer VIP"}
                </button>
              </div>

              {/* Coordonnées */}
              <div className="fiche-coord">
                <div><span className="fiche-lab">E-mail</span><span>{sel.email || "—"}</span></div>
                <div><span className="fiche-lab">Téléphone</span><span>{sel.phone || "—"}</span></div>
              </div>

              {/* Statistiques */}
              <div className="fiche-stats">
                <div className="fiche-stat"><b>{sel.bookings_count}</b><span>Réservations</span></div>
                <div className="fiche-stat"><b>{sel.covers_total}</b><span>Couverts cumulés</span></div>
                <div className="fiche-stat"><b>{sel.no_show_count}</b><span>No-show</span></div>
                <div className="fiche-stat"><b>{sel.cancelled_count}</b><span>Annulations</span></div>
              </div>
              <div className="fiche-visites sub-desc">
                Première venue {frDate(sel.first_visit)} · Dernière venue {frDate(sel.last_visit)}
              </div>

              {/* Notes durables */}
              <div className="champ" style={{ marginTop: 18 }}>
                <label>Notes &amp; préférences</label>
                <textarea
                  rows={3}
                  placeholder="Allergies, préférences de table, contexte…"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                />
                <button className="btn btn-mini btn-ligne" style={{ marginTop: 8 }} onClick={saveNotes} disabled={notesDraft === (sel.notes || "")}>
                  Enregistrer les notes
                </button>
              </div>

              {/* Historique */}
              <h3 className="fiche-histo-titre">Historique des réservations</h3>
              {histoLoad && <p className="sub-desc">Chargement…</p>}
              {!histoLoad && histo.length === 0 && <p className="sub-desc">Aucune réservation.</p>}
              {!histoLoad && histo.length > 0 && (
                <table className="fiche-histo">
                  <thead>
                    <tr><th>Date</th><th>Heure</th><th>Couverts</th><th>Statut</th><th>Origine</th></tr>
                  </thead>
                  <tbody>
                    {histo.map((r) => (
                      <tr key={r.id}>
                        <td>{frDate(r.date)}</td>
                        <td>{r.time}</td>
                        <td>{r.covers}</td>
                        <td><span className={`tag ${STATUT_TAG[r.status] || ""}`}>{STATUT_LABEL[r.status] || r.status}</span></td>
                        <td><span className="sub-desc">{r.source === "telephone" ? "Téléphone" : "Site"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <button className="btn btn-mini btn-danger" style={{ marginTop: 20 }} onClick={supprimer}>
                Supprimer la fiche
              </button>
            </>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
