import { useState } from "react";
import { supabase } from "../../lib/supabase";

/**
 * ListeAttente — formulaire d'inscription sur liste d'attente.
 * Affiché dans le widget de réservation quand un créneau est complet
 * et que waitlist_enabled = true dans reservation_settings.
 */
export default function ListeAttente({
  date, time, covers, onClose,
}: {
  date: string; time: string; covers: number; onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function inscrire() {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setErr("Veuillez remplir tous les champs."); return;
    }
    setLoading(true); setErr("");
    const { error } = await supabase.from("waitlist").insert({
      date, time, covers,
      customer_name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
    });
    setLoading(false);
    if (error) { setErr("Une erreur est survenue. Veuillez réessayer."); return; }
    setDone(true);
  }

  const heure = time.replace(":", "h");

  if (done) {
    return (
      <div className="confirm-ok">
        <div className="rond">✓</div>
        <h3>Inscription enregistrée</h3>
        <p>Vous serez notifié par email dès qu'une place se libère pour le {heure}.</p>
        <button className="btn btn-accent" onClick={onClose}>Fermer</button>
      </div>
    );
  }

  return (
    <div>
      <h3>Créneau complet — liste d'attente</h3>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "8px 0 20px", lineHeight: 1.55 }}>
        Le créneau de {heure} pour {covers} couvert{covers > 1 ? "s" : ""} est complet.
        Inscrivez-vous sur la liste d'attente — nous vous contacterons si une place se libère.
      </p>
      {err && <div className="resa-erreur">{err}</div>}
      <div className="champ">
        <label>Nom *</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Prénom Nom" />
      </div>
      <div className="champ">
        <label>Email *</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="votre@email.fr" />
      </div>
      <div className="champ">
        <label>Téléphone *</label>
        <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="06 00 00 00 00" />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button className="btn btn-accent" onClick={inscrire} disabled={loading}>
          {loading ? "Inscription…" : "M'inscrire sur la liste"}
        </button>
        <button className="btn btn-ligne" onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}
