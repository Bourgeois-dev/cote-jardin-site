import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import type { Customer, Reservation } from "../../lib/types";
import { useConfirm } from "./Confirm";

const STATUT_LABEL: Record<string, string> = {
  attente: "En attente", confirme: "Confirmée", annule: "Annulée", no_show: "Absent",
};
const STATUT_TAG: Record<string, string> = {
  attente: "t-attente", confirme: "t-ok", annule: "t-annule", no_show: "t-noshow",
};

function frDate(d: string | null) {
  if (!d) return "—";
  const [y, m, j] = d.split("-");
  return `${j}/${m}/${y}`;
}
function badgeClient(c: Customer) {
  if (c.is_vip) return { label: "VIP", cls: "cli-badge cli-badge-vip" };
  if (c.bookings_count >= 5) return { label: "Fidèle", cls: "cli-badge cli-badge-fidele" };
  if (c.bookings_count <= 1) return { label: "Nouveau", cls: "cli-badge cli-badge-nouveau" };
  return null;
}

const PAGE = 50; // fiches chargées par défaut / par recherche

export default function TabClients() {
  const confirm = useConfirm();
  const [clients, setClients] = useState<Customer[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [premier, setPremier] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState<"last_visit" | "bookings_count" | "name">("last_visit");
  const [selId, setSelId] = useState<string | null>(null);
  const [histo, setHisto] = useState<Reservation[]>([]);
  const [histoLoad, setHistoLoad] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [prefInput, setPrefInput] = useState("");

  const ordreCol = tri === "name" ? "name" : tri === "bookings_count" ? "bookings_count" : "last_visit";
  const ordreAsc = tri === "name";

  // Chargement serveur : recherche (ilike) + tri + limite. Debounce sur la saisie.
  const chargerListe = useCallback(async (q: string) => {
    setLoading(true);
    let req = supabase.from("customers").select("*", { count: "exact" });
    const terme = q.trim();
    if (terme) {
      const like = `%${terme}%`;
      req = req.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
    }
    const { data, count } = await req.order(ordreCol, { ascending: ordreAsc, nullsFirst: false }).limit(PAGE);
    setClients((data as Customer[]) || []);
    setTotal(count ?? null);
    setLoading(false);
    setPremier(false);
  }, [ordreCol, ordreAsc]);

  useEffect(() => {
    const t = setTimeout(() => chargerListe(recherche), recherche ? 300 : 0);
    return () => clearTimeout(t);
  }, [recherche, chargerListe]);

  // Rafraîchit la liste + la fiche sélectionnée après une mutation
  async function refresh() { await chargerListe(recherche); }
  async function update(id: string, vals: Partial<Customer>) {
    const { error } = await supabase.from("customers").update(vals).eq("id", id);
    if (error) { console.error(error); return; }
    setClients((cs) => cs.map((c) => c.id === id ? { ...c, ...vals } as Customer : c));
  }
  async function remove(id: string) {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) { console.error(error); return; }
    await refresh();
  }

  // La liste est déjà triée et filtrée côté serveur.
  const liste = clients;
  const sel = clients.find((c) => c.id === selId) || null;

  useEffect(() => {
    if (!selId) { setHisto([]); return; }
    setHistoLoad(true);
    setNotesDraft(sel?.notes || "");
    (async () => {
      const { data } = await supabase.from("reservations").select("*").eq("customer_id", selId).order("date", { ascending: false });
      setHisto((data as Reservation[]) || []);
      setHistoLoad(false);
    })();
  }, [selId]);

  async function toggleVip() {
    if (!sel) return;
    await update(sel.id, { is_vip: !sel.is_vip });
  }
  async function saveNotes() {
    if (!sel) return;
    await update(sel.id, { notes: notesDraft });
    setNoteSaved(true); setTimeout(() => setNoteSaved(false), 2000);
  }
  async function addPref() {
    if (!sel || !prefInput.trim()) return;
    const prefs: string[] = sel.notes ? sel.notes.split("\n").filter(Boolean) : [];
    const newPrefs = [...prefs, prefInput.trim()].join("\n");
    await update(sel.id, { notes: newPrefs });
    setNotesDraft(newPrefs);
    setPrefInput("");
  }
  async function removePref(p: string) {
    if (!sel) return;
    const prefs = sel.notes ? sel.notes.split("\n").filter((x) => x !== p) : [];
    await update(sel.id, { notes: prefs.join("\n") });
    setNotesDraft(prefs.join("\n"));
  }
  async function supprimer() {
    if (!sel) return;
    const ok = await confirm({
      titre: "Supprimer cette fiche client ?",
      message: `La fiche de ${sel.name || "ce client"} sera supprimée. Ses réservations sont conservées.`,
      danger: true, confirmer: "Supprimer",
    });
    if (!ok) return;
    await remove(sel.id);
    setSelId(null);
  }

  if (premier) return <div className="contenu"><p className="sub-desc">Chargement…</p></div>;

  const prefs = sel?.notes ? sel.notes.split("\n").filter(Boolean) : [];

  return (
    <>
      <div className="topbar">
        <div><h1>Clients</h1><div className="sous">Historique et fiches — {total ?? clients.length} client(s)</div></div>
      </div>
      <div className="contenu cli-contenu">
        <div className="cli-layout">

          {/* ── Colonne liste ── */}
          <div className="cli-col-liste">
            <input className="carnet-search" placeholder="Rechercher un nom, e-mail, téléphone…"
              value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            <div className="clients-tri">
              <button className={`puce-mini${tri === "last_visit" ? " active" : ""}`} onClick={() => setTri("last_visit")}>Récents</button>
              <button className={`puce-mini${tri === "bookings_count" ? " active" : ""}`} onClick={() => setTri("bookings_count")}>Fidèles</button>
              <button className={`puce-mini${tri === "name" ? " active" : ""}`} onClick={() => setTri("name")}>A→Z</button>
            </div>
            {liste.length === 0 && <p className="sub-desc" style={{ marginTop: 14 }}>Aucun client.</p>}
            <ul className="cli-items">
              {liste.map((c) => {
                const badge = badgeClient(c);
                return (
                  <li key={c.id}>
                    <button className={`cli-item${selId === c.id ? " actif" : ""}`} onClick={() => setSelId(c.id)}>
                      <div className="cli-item-tete">
                        <span className="cli-item-nom">{c.name || "Sans nom"}{c.is_vip && <span className="vip-pastille" title="VIP">★</span>}</span>
                        <span className="cli-item-nb">{c.bookings_count} résa</span>
                      </div>
                      <div className="cli-item-det">{c.email || c.phone || "—"}</div>
                      <div className="cli-item-det">dernière venue {frDate(c.last_visit)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!loading && total !== null && total > clients.length && (
              <p className="sub-desc" style={{ marginTop: 10, fontSize: 12 }}>
                {clients.length} sur {total} affichés — précisez votre recherche pour trouver un client.
              </p>
            )}
          </div>

          {/* ── Colonne fiche ── */}
          <div className="cli-col-fiche">
            {!sel && (
              <div className="cli-fiche-vide">
                <p className="sub-desc">Sélectionnez un client pour voir sa fiche.</p>
              </div>
            )}
            {sel && (() => {
              const badge = badgeClient(sel);
              return (
                <div className="cli-fiche">
                  {/* En-tête nom + badge + VIP */}
                  <div className="cli-fiche-tete">
                    <div className="cli-fiche-tete-gauche">
                      <h2 className="cli-fiche-nom">{sel.name || "Sans nom"}{badge && <span className={badge.cls}>{badge.label}</span>}</h2>
                      <div className="sub-desc">Client depuis {frDate(sel.created_at?.slice(0, 10))}</div>
                    </div>
                    <button className={`btn btn-mini${sel.is_vip ? " btn-accent" : " btn-ligne"}`} onClick={toggleVip}>
                      {sel.is_vip ? "★ VIP" : "Marquer VIP"}
                    </button>
                  </div>

                  {/* Coordonnées */}
                  <div className="cli-coord">
                    <div><span className="fiche-lab">E-mail</span><a href={`mailto:${sel.email}`} className="cli-coord-val">{sel.email || "—"}</a></div>
                    <div><span className="fiche-lab">Téléphone</span><span className="cli-coord-val">{sel.phone || "—"}</span></div>
                  </div>

                  {/* Stats */}
                  <div className="cli-stats">
                    <div className="cli-stat"><b>{sel.bookings_count}</b><span>Réservations</span></div>
                    <div className="cli-stat"><b>{sel.covers_total}</b><span>Couverts cumulés</span></div>
                    <div className="cli-stat"><b>{sel.no_show_count}</b><span>No-show</span></div>
                    <div className="cli-stat"><b>{sel.cancelled_count}</b><span>Annulations</span></div>
                  </div>
                  <div className="sub-desc" style={{ margin: "10px 0 0", fontSize: 12 }}>
                    Première venue {frDate(sel.first_visit)} · Dernière venue {frDate(sel.last_visit)}
                  </div>

                  {/* Préférences & allergies (pills) */}
                  <div className="cli-section">
                    <div className="cli-section-titre">Préférences &amp; allergies</div>
                    <div className="cli-prefs">
                      {prefs.map((p) => (
                        <span key={p} className="cli-pref-pill">
                          {p}<button className="cli-pref-del" onClick={() => removePref(p)}>×</button>
                        </span>
                      ))}
                      <div className="cli-pref-add">
                        <input value={prefInput} onChange={(e) => setPrefInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addPref()}
                          placeholder="+ Préférence" className="cli-pref-input" />
                      </div>
                    </div>
                  </div>

                  {/* Notes libres */}
                  <div className="cli-section">
                    <div className="cli-section-titre">Notes</div>
                    <textarea className="cli-notes" rows={3}
                      placeholder="Contexte, demandes particulières..."
                      value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
                    <button className="cli-save-notes" onClick={saveNotes} disabled={notesDraft === (sel.notes || "")}>
                      {noteSaved ? "✓ Enregistré" : "Enregistrer les notes"}
                    </button>
                  </div>

                  {/* Historique */}
                  <div className="cli-section">
                    <div className="cli-section-titre">Historique des réservations</div>
                    {histoLoad && <p className="sub-desc">Chargement…</p>}
                    {!histoLoad && histo.length === 0 && <p className="sub-desc">Aucune réservation.</p>}
                    {!histoLoad && histo.length > 0 && (
                      <table className="fiche-histo">
                        <thead><tr><th>Date</th><th>Heure</th><th>Couverts</th><th>Statut</th><th>Origine</th></tr></thead>
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
                  </div>

                  {/* Supprimer */}
                  <button className="cli-supprimer" onClick={supprimer}>Supprimer la fiche</button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}
