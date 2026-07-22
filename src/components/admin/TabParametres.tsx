import { useEffect, useRef, useState } from "react";
import { supabase, fetchActive, fetchContent } from "../../lib/supabase";
import { useTable } from "../../hooks/useTable";
import { useConfirm } from "./Confirm";
import type { ReservationSettings, AdminUser } from "../../lib/types";
import { useToast } from "./Toast";
import { useDirty } from "./Dirty";

export default function TabParametres() {
  const toast = useToast();
  const confirm = useConfirm();
  const { rows: admins, reload: reloadAdmins, remove: removeAdmin } = useTable<AdminUser>("admin_users", "created_at");
  const [nouvEmail, setNouvEmail] = useState("");
  const [nouvLabel, setNouvLabel] = useState("");
  const [erreurAdmin, setErreurAdmin] = useState("");
  const [s, setS] = useState<ReservationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const dirty = useDirty();
  const sInitial = useRef<string>("");
  // Compare l'état du formulaire à sa version chargée/enregistrée
  useEffect(() => {
    if (!s) return;
    if (!sInitial.current) { sInitial.current = JSON.stringify(s); return; }
    dirty.set(JSON.stringify(s) !== sInitial.current);
  }, [s]); // eslint-disable-line
  useEffect(() => () => dirty.set(false), []); // eslint-disable-line
  const [newsletterOn, setNewsletterOn] = useState(true);

  useEffect(() => {
    fetchActive<ReservationSettings>("reservation_settings", "id").then((r) => { setS(r[0] || null); setLoading(false); });
    fetchContent("newsletter_enabled").then((c) => setNewsletterOn(c?.enabled ?? true));
  }, []);

  async function toggleNewsletter(v: boolean) {
    setNewsletterOn(v);
    await supabase.from("site_content").upsert({ section_key: "newsletter_enabled", content: { enabled: v } }, { onConflict: "section_key" });
  }

  async function save() {
    if (!s) return;
    await supabase.from("reservation_settings").update({ enabled: s.enabled, phone_threshold: s.phone_threshold, min_advance_hours: s.min_advance_hours, booking_horizon_days: s.booking_horizon_days, newsletter_optin: s.newsletter_optin, max_covers_per_slot: s.max_covers_per_slot || null, waitlist_enabled: s.waitlist_enabled, reminder_enabled: s.reminder_enabled, table_duration: s.table_duration || 90 }).eq("id", s.id);
    sInitial.current = JSON.stringify(s);
    dirty.set(false);
    toast.ok("Réglages enregistrés");
  }

  async function ajouterAdmin() {
    setErreurAdmin("");
    const email = nouvEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { setErreurAdmin("Adresse email invalide."); return; }
    const { error } = await supabase.from("admin_users").insert({ email, label: nouvLabel.trim() });
    if (error) {
      setErreurAdmin(error.code === "23505" ? "Cet email a déjà accès à l'administration." : "Échec de l'ajout.");
      return;
    }
    setNouvEmail(""); setNouvLabel(""); reloadAdmins();
  }

  async function supprimerAdmin(a: AdminUser) {
    if (admins.length <= 1) return; // garde-fou : on ne retire jamais le dernier admin
    const ok = await confirm({
      titre: "Retirer cet accès admin ?",
      message: `${a.label || a.email} ne pourra plus se connecter à l'administration. Le compte de connexion (Supabase Auth) n'est pas supprimé, seul l'accès admin l'est.`,
      confirmer: "Retirer",
      danger: true,
    });
    if (ok) await removeAdmin(a.id);
  }

  if (loading) return <div className="loading">Chargement…</div>;
  if (!s) return (
    <>
      <div className="topbar"><div><h1>Réservations & site</h1></div></div>
      <div className="contenu"><div className="bloc"><p>Aucun réglage de réservation trouvé. Contactez le support technique.</p></div></div>
    </>
  );
  return (
    <>
      <div className="topbar"><div><h1>Réservations & site</h1><div className="sous">Ce que voient vos clients sur le site public</div></div></div>
      <div className="contenu"><div className="bloc">
        <label className="ligne-toggle" style={{ paddingTop: 0 }}>
          <span className="lib"><b>Réservation en ligne sur le site</b><span>Affiche le widget de réservation aux visiteurs. Si désactivé, seul le bouton d'appel apparaît.</span></span>
          <span className="toggle"><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /><span className="piste" /></span>
        </label>
        {s.enabled && (
          <label className="ligne-toggle">
            <span className="lib"><b>Proposer l'inscription newsletter lors de la réservation</b><span>Ajoute une case facultative dans le formulaire de réservation.</span></span>
            <span className="toggle"><input type="checkbox" checked={s.newsletter_optin} onChange={(e) => setS({ ...s, newsletter_optin: e.target.checked })} /><span className="piste" /></span>
          </label>
        )}
        <label className="ligne-toggle">
          <span className="lib"><b>Bloc « Newsletter / actualités » sur le site</b><span>Affiche le formulaire d'inscription en bas du site public.</span></span>
          <span className="toggle"><input type="checkbox" checked={newsletterOn} onChange={(e) => toggleNewsletter(e.target.checked)} /><span className="piste" /></span>
        </label>
        <div className="grid2" style={{ marginTop: 18 }}>
          <div className="champ"><label>Seuil groupe (→ téléphone)</label><input type="number" value={s.phone_threshold} onChange={(e) => setS({ ...s, phone_threshold: Number(e.target.value) })} /></div>
          <div className="champ"><label>Délai minimum (heures)</label><input type="number" value={s.min_advance_hours} onChange={(e) => setS({ ...s, min_advance_hours: Number(e.target.value) })} /></div>
          <div className="champ"><label>Horizon de réservation (jours)</label><input type="number" min="1" value={s.booking_horizon_days} onChange={(e) => setS({ ...s, booking_horizon_days: Number(e.target.value) })} /><span className="champ-aide">Jusqu'à combien de jours à l'avance un client peut réserver.</span></div>
          <div className="champ"><label>Couverts max par créneau</label><input type="number" min="1" value={s.max_covers_per_slot || ""} placeholder="Illimité" onChange={(e) => setS({ ...s, max_covers_per_slot: e.target.value ? Number(e.target.value) : null })} /><span className="champ-aide">Limite le nombre total de couverts acceptés sur un même créneau horaire (toutes tables confondues). Laisser vide = pas de limite.</span></div>
          <div className="champ"><label>Durée d'occupation d'une table</label>
            <select value={s.table_duration || 90} onChange={(e) => setS({ ...s, table_duration: Number(e.target.value) })}>
              <option value={45}>45 minutes</option>
              <option value={60}>1 heure</option>
              <option value={75}>1 h 15</option>
              <option value={90}>1 h 30</option>
              <option value={105}>1 h 45</option>
              <option value={120}>2 heures</option>
              <option value={150}>2 h 30</option>
              <option value={180}>3 heures</option>
            </select>
            <span className="champ-aide">Combien de temps une table reste occupée par une réservation. Détermine quand elle redevient disponible — pour les réservations en ligne comme pour la rotation des tables dans le plan de service.</span>
          </div>
          <label className="ligne-toggle"><div className="lib"><b>Liste d'attente</b><span>Quand un créneau est complet, propose au client de s'inscrire sur la liste d'attente.</span></div><span className="toggle"><input type="checkbox" checked={s.waitlist_enabled || false} onChange={(e) => setS({ ...s, waitlist_enabled: e.target.checked })} /><span className="piste" /></span></label>
          <label className="ligne-toggle"><div className="lib"><b>Rappel J-1 automatique</b><span>Envoie un email de rappel la veille de chaque réservation (inclut un lien d'annulation).</span></div><span className="toggle"><input type="checkbox" checked={s.reminder_enabled !== false} onChange={(e) => setS({ ...s, reminder_enabled: e.target.checked })} /><span className="piste" /></span></label>
        </div>
        <div style={{ marginTop: 16 }}><button className="btn btn-accent" onClick={save}>Enregistrer</button></div>
      </div>

      <div className="bloc">
        <div className="bloc-tete"><div><h2>Comptes admin</h2><div className="desc">Les emails autorisés à se connecter à l'administration.</div></div></div>
        {admins.length > 0 && (
          <div className="liste-admins">
            {admins.map((a) => (
              <div key={a.id} className="ligne-admin">
                <div>
                  <b>{a.label || a.email}</b>
                  {a.label && <div className="sub-desc">{a.email}</div>}
                </div>
                <button className="btn btn-mini btn-danger" disabled={admins.length <= 1}
                  title={admins.length <= 1 ? "Impossible de retirer le dernier accès admin" : undefined}
                  onClick={() => supprimerAdmin(a)}>Retirer</button>
              </div>
            ))}
          </div>
        )}
        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="champ"><label>Email</label><input type="email" value={nouvEmail} onChange={(e) => setNouvEmail(e.target.value)} placeholder="prenom@email.com" /></div>
          <div className="champ"><label>Nom (optionnel)</label><input value={nouvLabel} onChange={(e) => setNouvLabel(e.target.value)} placeholder="Ex. Accueil, Marie…" /></div>
        </div>
        {erreurAdmin && <div className="err-inline">{erreurAdmin}</div>}
        <button className="btn btn-ligne" style={{ marginTop: 6 }} onClick={ajouterAdmin}>+ Ajouter un accès admin</button>
        <div className="hint" style={{ marginTop: 16 }}>
          💡 Ajouter un email ici ne crée pas le compte de connexion : la personne doit d'abord exister dans Supabase (Dashboard → Authentication → Users → Add user) avec ce même email. Cette liste détermine simplement qui, parmi les comptes existants, a accès à l'administration.
        </div>
      </div></div>
    </>
  );
}
