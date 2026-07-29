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
    await supabase.from("reservation_settings").update({ enabled: s.enabled, phone_threshold: s.phone_threshold, min_advance_hours: s.min_advance_hours, booking_horizon_days: s.booking_horizon_days, newsletter_optin: s.newsletter_optin, max_covers_per_slot: s.max_covers_per_slot || null, waitlist_enabled: s.waitlist_enabled, reminder_enabled: s.reminder_enabled, table_duration: s.table_duration || 90, auto_confirm: s.auto_confirm, auto_confirm_same_day: s.auto_confirm_same_day, auto_confirm_block_noshow: s.auto_confirm_block_noshow ?? 1 }).eq("id", s.id);
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
      <div className="topbar"><div><h1>Réservations & site</h1><div className="sous">Widget de réservation, blocs du site et automatismes</div></div></div>
      <div className="contenu"><div className="bloc">
        {/* ── Ce que voit le visiteur ─────────────────────────────────── */}
        <div className="reglages-section">
          <div className="reglages-titre">Sur le site public</div>
          <div className="reglages-desc">Ce que le visiteur voit, ou non, sur le site.</div>

          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Réservation en ligne</b><span>Affiche le widget de réservation. Désactivé, seul le bouton d'appel apparaît.</span></span>
            <span className="toggle"><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /><span className="piste" /></span>
          </label>
          {/* Réglage imbriqué, et non voisin : il ne veut rien dire sans la
              réservation en ligne. Sa dépendance se lit maintenant à l'œil. */}
          {s.enabled && (
            <div className="sous-reglages">
              <label className="ligne-toggle">
                <span className="lib"><b>Proposer la newsletter pendant la réservation</b><span>Ajoute une case facultative dans le formulaire.</span></span>
                <span className="toggle"><input type="checkbox" checked={s.newsletter_optin} onChange={(e) => setS({ ...s, newsletter_optin: e.target.checked })} /><span className="piste" /></span>
              </label>
            </div>
          )}
          <label className="ligne-toggle">
            <span className="lib"><b>Bloc « Newsletter / actualités »</b><span>Affiche le formulaire d'inscription en bas du site. Appliqué aussitôt, sans enregistrement.</span></span>
            <span className="toggle"><input type="checkbox" checked={newsletterOn} onChange={(e) => toggleNewsletter(e.target.checked)} /><span className="piste" /></span>
          </label>
        </div>

        {/* ── Règles de prise de réservation ──────────────────────────── */}
        <div className="reglages-section">
          <div className="reglages-titre">Règles de réservation</div>
          <div className="reglages-desc">Ce que le widget accepte, et à quelles conditions.</div>
          {!s.enabled && (
            <div className="reglages-note">La réservation en ligne est désactivée : ces règles ne s'appliquent pas tant qu'elle reste éteinte. La durée d'occupation, elle, sert aussi au plan de service.</div>
          )}
          <div className="grid2">
            <div className="champ"><label>Horizon de réservation (jours)</label><input type="number" min="1" value={s.booking_horizon_days} onChange={(e) => setS({ ...s, booking_horizon_days: Number(e.target.value) })} /><span className="champ-aide">Jusqu'à combien de jours à l'avance un client peut réserver.</span></div>
            <div className="champ"><label>Délai minimum (heures)</label><input type="number" value={s.min_advance_hours} onChange={(e) => setS({ ...s, min_advance_hours: Number(e.target.value) })} /><span className="champ-aide">Combien de temps avant le service la réservation reste possible.</span></div>
            <div className="champ"><label>Seuil groupe (→ téléphone)</label><input type="number" value={s.phone_threshold} onChange={(e) => setS({ ...s, phone_threshold: Number(e.target.value) })} /><span className="champ-aide">À partir de ce nombre de couverts, le client est invité à appeler.</span></div>
            <div className="champ"><label>Couverts max par créneau</label><input type="number" min="1" value={s.max_covers_per_slot || ""} placeholder="Illimité" onChange={(e) => setS({ ...s, max_covers_per_slot: e.target.value ? Number(e.target.value) : null })} /><span className="champ-aide">Toutes tables confondues, sur un même horaire. Vide = pas de limite.</span></div>
          </div>
          <div className="champ champ-court" style={{ maxWidth: 280 }}><label>Durée d'occupation d'une table</label>
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
            <span className="champ-aide">Quand la table redevient disponible — pour le widget comme pour la rotation dans le plan de service.</span>
          </div>
        </div>

        {/* ── Confirmation ────────────────────────────────────────────── */}
        <div className="reglages-section">
          <div className="reglages-titre">Confirmation des réservations</div>
          <div className="reglages-desc">Une réservation en ligne arrive-t-elle confirmée, ou en attente de votre validation ?</div>
          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Confirmation automatique</b>
              <span>Le client reçoit une confirmation ferme au lieu d'un accusé de réception. La disponibilité est déjà vérifiée : horaires, fermetures, capacité et tables libres. Au-delà du seuil groupe, la réservation passe de toute façon par téléphone.</span>
            </span>
            <span className="toggle"><input type="checkbox" checked={!!s.auto_confirm} onChange={(e) => setS({ ...s, auto_confirm: e.target.checked })} /><span className="piste" /></span>
          </label>
          {s.auto_confirm && (
            <div className="sous-reglages">
              <label className="ligne-toggle">
                <span className="lib"><b>Confirmer aussi le jour même</b>
                  <span>Déconseillé si votre mise en place est déjà lancée le matin.</span>
                </span>
                <span className="toggle"><input type="checkbox" checked={!!s.auto_confirm_same_day} onChange={(e) => setS({ ...s, auto_confirm_same_day: e.target.checked })} /><span className="piste" /></span>
              </label>
              <div className="champ"><label>Repasser en validation manuelle à partir de … absences</label>
                <input type="number" min="0" max="10" value={s.auto_confirm_block_noshow ?? 1}
                  onChange={(e) => setS({ ...s, auto_confirm_block_noshow: Number(e.target.value) })} />
                <span className="champ-aide">Un client déjà absent sans prévenir repasse en validation manuelle. Il est reconnu par son e-mail ou son téléphone. 0 pour désactiver.</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Créneau complet, puis rappels ───────────────────────────── */}
        <div className="reglages-section">
          <div className="reglages-titre">Quand un créneau est complet</div>
          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Liste d'attente</b><span>Propose au client de s'inscrire ; il est prévenu si une table se libère.</span></span>
            <span className="toggle"><input type="checkbox" checked={s.waitlist_enabled || false} onChange={(e) => setS({ ...s, waitlist_enabled: e.target.checked })} /><span className="piste" /></span>
          </label>
        </div>

        <div className="reglages-section">
          <div className="reglages-titre">Rappels automatiques</div>
          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Rappel la veille</b><span>E-mail envoyé à J-1, avec un lien d'annulation — il fait baisser les absences.</span></span>
            <span className="toggle"><input type="checkbox" checked={s.reminder_enabled !== false} onChange={(e) => setS({ ...s, reminder_enabled: e.target.checked })} /><span className="piste" /></span>
          </label>
        </div>

        <div className="form-pied">
          <span className="form-pied-aide">Tout est enregistré d'un bloc, sauf « Bloc Newsletter / actualités » qui s'applique aussitôt.</span>
          <button className="btn btn-accent" onClick={save}>Enregistrer</button>
        </div>
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
