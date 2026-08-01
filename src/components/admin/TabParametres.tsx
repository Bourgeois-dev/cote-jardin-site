import { useEffect, useState } from "react";
import { supabase, fetchContent } from "../../lib/supabase";
import { useTable } from "../../hooks/useTable";
import { useConfirm } from "./Confirm";
import type { AdminUser } from "../../lib/types";
import { useToast } from "./Toast";

/**
 * TabParametres — « Site & accès ».
 *
 * Trois blocs : ce que le visiteur voit sur le site (bloc newsletter), la voix
 * du restaurant donnée à l'assistant IA, et les comptes autorisés à se
 * connecter à l'administration.
 *
 * Chaque réglage s'applique immédiatement : il n'y a plus d'enregistrement
 * d'un bloc depuis le retrait du module Réservation, qui portait seul un
 * formulaire à plusieurs champs.
 */
export default function TabParametres() {
  const toast = useToast();
  const confirm = useConfirm();
  const { rows: admins, reload: reloadAdmins, remove: removeAdmin } = useTable<AdminUser>("admin_users", "created_at");
  const [nouvEmail, setNouvEmail] = useState("");
  const [nouvLabel, setNouvLabel] = useState("");
  const [erreurAdmin, setErreurAdmin] = useState("");
  const [newsletterOn, setNewsletterOn] = useState(true);
  // Module Newsletter. Coupé, le bloc du site disparaît de cet onglet : il n'y
  // a plus d'onglet Newsletter ni d'onglet Contacts pour exploiter ce que le
  // formulaire récolterait. Même source que AdminApp.tsx (table feature_flags).
  const [newsletterFeature, setNewsletterFeature] = useState(true);
  // Voix du restaurant : consigne de ton donnée à l'assistant IA (onglets
  // Newsletter et Bannière promo). C'est de la « forme » — propre à chaque
  // client — stockée dans site_content, comme les autres réglages de contenu.
  const [voix, setVoix] = useState("");
  const [voixEnr, setVoixEnr] = useState("");
  const [voixBusy, setVoixBusy] = useState(false);

  useEffect(() => {
    fetchContent("newsletter_enabled").then((c) => setNewsletterOn(c?.enabled ?? true));
    fetchContent("assistant_voix").then((c) => {
      const v = String(c?.texte ?? "");
      setVoix(v); setVoixEnr(v);
    });
    supabase.from("feature_flags").select("key,enabled").eq("key", "newsletter")
      .then(({ data }) => {
        (data || []).forEach((f: { key: string; enabled: boolean }) => {
          if (f.enabled === false) setNewsletterFeature(false);
        });
      });
  }, []);

  async function toggleNewsletter(v: boolean) {
    setNewsletterOn(v);
    await supabase.from("site_content").upsert({ section_key: "newsletter_enabled", content: { enabled: v } }, { onConflict: "section_key" });
  }

  async function enregistrerVoix() {
    setVoixBusy(true);
    await supabase.from("site_content").upsert(
      { section_key: "assistant_voix", content: { texte: voix.trim().slice(0, 600) } },
      { onConflict: "section_key" });
    setVoixEnr(voix.trim().slice(0, 600));
    setVoixBusy(false);
    toast.ok("Voix enregistrée");
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

  return (
    <>
      <div className="topbar adm-vit"><div>
        <span className="adm-vit-eyebrow">Paramètres</span>
        <h1>Site &amp; accès</h1>
        <div className="sous">Blocs du site et accès à l'administration.</div>
      </div></div>

      {/* ── Ce que voit le visiteur ─────────────────────────────────── */}
      {/* Sans module Newsletter, la section n'aurait plus un seul
          interrupteur : on ne laisse pas un titre au-dessus du vide. */}
      {newsletterFeature && (
        <div className="contenu adm-vit"><div className="bloc">
          <div className="reglages-section">
            <div className="reglages-titre">Sur le site public</div>
            <div className="reglages-desc">Ce que le visiteur voit, ou non, sur le site.</div>
            <label className="ligne-toggle" style={{ paddingTop: 0 }}>
              <span className="lib"><b>Bloc « Newsletter / actualités »</b><span>Affiche le formulaire d'inscription en bas du site. Appliqué aussitôt, sans enregistrement.</span></span>
              <span className="toggle"><input type="checkbox" checked={newsletterOn} onChange={(e) => toggleNewsletter(e.target.checked)} /><span className="piste" /></span>
            </label>
          </div>
        </div></div>
      )}

      <div className="contenu adm-vit">
        {/* ── Voix du restaurant (assistant IA) ─────────────────────────── */}
        {/* La bannière promo est toujours présente, donc le bloc l'est aussi —
            mais le libellé s'adapte selon la présence de la newsletter. */}
        <div className="bloc">
          <div className="reglages-titre">Voix du restaurant</div>
          <div className="reglages-desc">
            Comment l'assistant doit écrire pour vous{newsletterFeature ? " (newsletter et bannière du site)" : " (bannière du site)"}.
            Décrivez votre façon de parler à vos clients : ce que vous dites, ce que vous ne diriez jamais.
          </div>
          <div className="champ">
            <textarea rows={4} value={voix} maxLength={600}
              onChange={(e) => setVoix(e.target.value)}
              placeholder="Ex. On vouvoie, ton simple et chaleureux, jamais de superlatifs. On parle des produits et des producteurs, jamais des prix. On signe « toute l'équipe »." />
            <span className="aide" style={{ fontSize: 11.5 }}>
              {voix.length}/600 — laissez vide pour le ton par défaut : chaleureux, sincère, vouvoiement.
            </span>
          </div>
          <div className="form-pied">
            <span className="form-pied-aide">L'assistant s'appuie déjà sur votre carte, votre ardoise et vos horaires : cette consigne ne concerne que le ton.</span>
            <button className="btn btn-accent" onClick={enregistrerVoix}
              disabled={voixBusy || voix.trim().slice(0, 600) === voixEnr}>
              {voixBusy ? "Enregistrement…" : "Enregistrer la voix"}
            </button>
          </div>
        </div>

        <div className="bloc">
          <div className="reglages-titre">Comptes admin</div>
          <div className="reglages-desc">Les e-mails autorisés à se connecter à l'administration.</div>
          {admins.length > 0 && (
            <div className="liste-admins">
              {/* Trois colonnes : nom, e-mail, action — le nom et l'adresse
                  étaient empilés, ce qui rendait la liste difficile à parcourir. */}
              {admins.map((a) => (
                <div key={a.id} className="ligne-admin">
                  <b className="adm-acces-nom">{a.label}</b>
                  <span className="adm-acces-mail">{a.email}</span>
                  <button className="adm-vit-lien danger" disabled={admins.length <= 1}
                    title={admins.length <= 1 ? "Impossible de retirer le dernier accès admin" : undefined}
                    onClick={() => supprimerAdmin(a)}>Retirer</button>
                </div>
              ))}
            </div>
          )}
          {/* Saisie et action sur une seule ligne, comme la maquette. */}
          <div className="adm-acces-ajout">
            <div className="champ"><label>Email</label><input type="email" value={nouvEmail} onChange={(e) => setNouvEmail(e.target.value)} placeholder="prenom@email.com" /></div>
            <div className="champ"><label>Nom · optionnel</label><input value={nouvLabel} onChange={(e) => setNouvLabel(e.target.value)} placeholder="Ex. Accueil, Marie…" /></div>
            <button className="adm-vit-lien accent" onClick={ajouterAdmin}>+ Ajouter un accès</button>
          </div>
          {erreurAdmin && <div className="err-inline">{erreurAdmin}</div>}
          <div className="adm-note">
            Ajouter un e-mail ici ne crée pas le compte de connexion : la personne doit d'abord exister dans Supabase (Dashboard → Authentication → Users → Add user) avec ce même e-mail. Cette liste détermine simplement qui, parmi les comptes existants, a accès à l'administration.
          </div>
        </div>
      </div>
    </>
  );
}
