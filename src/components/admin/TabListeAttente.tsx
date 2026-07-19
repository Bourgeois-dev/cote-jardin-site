import { useState, useEffect } from "react";
import { supabase, sendReservationEmail } from "../../lib/supabase";
import { useConfirm } from "./Confirm";

interface WaitlistEntry {
  id: string;
  date: string;
  time: string;
  covers: number;
  customer_name: string;
  email: string;
  phone: string;
  notes: string;
  notified: boolean;
  created_at: string;
}

const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export default function TabListeAttente() {
  const [liste, setListe] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<"toutes" | "en_attente" | "notifies">("en_attente");
  const confirm = useConfirm();

  async function charger() {
    setLoading(true);
    const { data } = await supabase
      .from("waitlist")
      .select("*")
      .order("date", { ascending: true })
      .order("time", { ascending: true });
    setListe(data || []);
    setLoading(false);
  }

  useEffect(() => { charger(); }, []);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("waitlist-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist" }, charger)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function notifier(entry: WaitlistEntry) {
    const ok = await confirm({
      titre: "Notifier ce client ?",
      message: `Un e-mail sera envoyé à ${entry.customer_name} pour l'informer qu'une place s'est libérée.`,
      confirmer: "Envoyer la notification",
    });
    if (!ok) return;
    if (entry.email) {
      await sendReservationEmail("waitlist_confirm", {
        customer_name: entry.customer_name,
        email: entry.email,
        date: entry.date,
        time: entry.time,
        covers: entry.covers,
      });
    }
    await supabase.from("waitlist").update({ notified: true }).eq("id", entry.id);
    charger();
  }

  async function supprimer(entry: WaitlistEntry) {
    const ok = await confirm({
      titre: "Supprimer cette demande ?",
      message: `La demande de ${entry.customer_name} sera retirée de la liste d'attente.`,
      confirmer: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    await supabase.from("waitlist").delete().eq("id", entry.id);
    charger();
  }

  const affichees = liste.filter((e) => {
    if (filtre === "en_attente") return !e.notified;
    if (filtre === "notifies")   return e.notified;
    return true;
  });

  const nbAttente = liste.filter((e) => !e.notified).length;

  return (
    <div className="contenu">
      <div className="topbar">
        <div>
          <h1>Liste d'attente</h1>
          <p className="sous">Clients en attente d'une place libérée</p>
        </div>
      </div>

      <div className="contenu" style={{ paddingTop: 20 }}>

        {/* Filtres */}
        <div className="filtres-resa" style={{ marginBottom: 20 }}>
          <button className={`puce-mini${filtre === "en_attente" ? " active" : ""}`} onClick={() => setFiltre("en_attente")}>
            En attente {nbAttente > 0 && <span className="ps-pip">{nbAttente}</span>}
          </button>
          <button className={`puce-mini${filtre === "notifies" ? " active" : ""}`} onClick={() => setFiltre("notifies")}>Notifiés</button>
          <button className={`puce-mini${filtre === "toutes" ? " active" : ""}`} onClick={() => setFiltre("toutes")}>Toutes</button>
        </div>

        {loading && <p className="vide">Chargement…</p>}

        {!loading && affichees.length === 0 && (
          <div className="bloc">
            <p className="vide">
              {filtre === "en_attente" ? "Aucune demande en attente." :
               filtre === "notifies"   ? "Aucun client notifié." :
               "Aucune demande."}
            </p>
          </div>
        )}

        {!loading && affichees.length > 0 && (
          <div className="bloc" style={{ padding: 0 }}>
            <table className="tbl-cartes">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Date · Heure</th>
                  <th>Couverts</th>
                  <th>Contact</th>
                  <th>Inscrit le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {affichees.map((e) => (
                  <tr key={e.id} style={{ opacity: e.notified ? 0.5 : 1 }}>
                    <td data-label="Client">
                      <b style={{ fontSize: 14 }}>{e.customer_name}</b>
                      {e.notified && (
                        <span className="tag t-ok" style={{ fontSize: 10, marginLeft: 8, padding: "2px 7px" }}>Notifié</span>
                      )}
                      {e.notes && <div className="sub-desc" style={{ marginTop: 2 }}>{e.notes}</div>}
                    </td>
                    <td data-label="Date · Heure" style={{ fontFamily: "monospace", fontSize: 13 }}>
                      {fmtDate(e.date)}<br />
                      <span style={{ color: "var(--ink-soft)" }}>{e.time.replace(":", "h")}</span>
                    </td>
                    <td data-label="Couverts" style={{ fontFamily: "monospace" }}>{e.covers}</td>
                    <td data-label="Contact" style={{ fontSize: 13 }}>
                      {e.phone && <div><a href={`tel:${e.phone}`} style={{ color: "var(--ink)", textDecoration: "none" }}>{e.phone}</a></div>}
                      {e.email && <div className="sub-desc"><a href={`mailto:${e.email}`} style={{ color: "var(--admin-accent)" }}>{e.email}</a></div>}
                    </td>
                    <td data-label="Inscrit le" className="sub-desc" style={{ fontSize: 12 }}>
                      {new Date(e.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="td-actions">
                      <div className="actions-ligne">
                        {!e.notified && (
                          <button className="btn btn-mini btn-ok" onClick={() => notifier(e)}
                            title={e.email ? "Envoyer un email de notification" : "Marquer comme notifié (pas d'email)"}>
                            {e.email ? "✉ Notifier" : "✓ Marquer"}
                          </button>
                        )}
                        <button className="btn btn-mini btn-danger" onClick={() => supprimer(e)}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Résumé */}
        {!loading && liste.length > 0 && (
          <p className="sub-desc" style={{ marginTop: 14, fontSize: 12 }}>
            {liste.length} demande{liste.length > 1 ? "s" : ""} au total —{" "}
            {nbAttente} en attente,{" "}
            {liste.length - nbAttente} notifié{liste.length - nbAttente > 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
