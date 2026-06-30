import { useState } from "react";
import { supabase, syncToMailchimp } from "../../lib/supabase";
import type { SocialLink } from "../../lib/types";
import { SOCIAL_SVG } from "./socialIcons";

export default function Newsletter({ socials }: { socials: SocialLink[] }) {
  const [sent, setSent] = useState(false);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  const phone = import.meta.env.VITE_RESTO_PHONE || "";
  const restoName = import.meta.env.VITE_RESTO_NAME || "notre restaurant";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !consent) return;
    setBusy(true); setErreur("");
    const { error } = await supabase
      .from("leads")
      .upsert({ first_name: prenom, last_name: nom, email: email.trim().toLowerCase(), source: "newsletter", consent: true }, { onConflict: "email" });
    setBusy(false);
    if (error) {
      setErreur("Une erreur est survenue. Merci de réessayer dans un instant.");
      return;
    }
    setSent(true);
    syncToMailchimp({ email: email.trim().toLowerCase(), first_name: prenom, last_name: nom, source: "newsletter" });
    // Email de bienvenue automatique via send-newsletter (template welcome)
    try {
      const welcomeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`;
      // Créer une campagne welcome temporaire et l'envoyer
      const { data: camp } = await supabase.from("newsletter_campaigns").insert({
        template: "welcome", segment: "optin", subject: `Bienvenue chez ${import.meta.env.VITE_RESTO_NAME || "nous"} !`,
        content: {}, scheduled_at: new Date().toISOString(), status: "sending",
      }).select().single();
      if (camp) {
        // Override : envoyer uniquement à cet email
        await fetch(welcomeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ campaign_id: camp.id, override_email: email.trim().toLowerCase(), override_name: `${prenom} ${nom}`.trim() }),
        });
      }
    } catch { /* silencieux */ }
  }
  const actifs = socials.filter((s) => s.url && SOCIAL_SVG[s.platform]);

  return (
    <section className="news" id="contact">
      <div className="news-wrap">
        <div className="news-gauche">
          <span className="news-eyebrow">Restez informé</span>
          <h2 className="news-titre">Nos actualités</h2>
          <p className="news-baseline">Formules du midi qui changent, soirées en séquences, fermetures : recevez les nouvelles de la maison, sans excès.</p>
          {phone && (
            <div className="news-tel">
              <span className="news-tel-lab">Par téléphone</span>
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="news-tel-num">{phone}</a>
            </div>
          )}
          {actifs.length > 0 && (
            <div className="news-socials">
              {actifs.map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noopener" aria-label={s.platform} className="news-social-ic">{SOCIAL_SVG[s.platform]}</a>
              ))}
              <span className="news-social-lab">Suivez-nous</span>
            </div>
          )}
        </div>

        <div className="news-carte">
          {!sent ? (
            <form onSubmit={submit}>
              <div className="news-grid2">
                <div className="champ"><label>Prénom</label><input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Marie" /></div>
                <div className="champ"><label>Nom</label><input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Durand" /></div>
              </div>
              <div className="champ"><label>Adresse e-mail *</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marie.durand@email.com" /></div>
              <label className="consent"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>J'accepte de recevoir les actualités du restaurant par e-mail. Désinscription possible à tout moment. *</span></label>
              {erreur && <div className="news-erreur">{erreur}</div>}
              <button className="btn btn-accent" type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "Envoi…" : "S'inscrire"}</button>
              <p className="rgpd">Vos données sont traitées conformément au RGPD et jamais transmises à des tiers.</p>
            </form>
          ) : (
            <div className="news-merci">
              <div className="news-merci-titre">Merci !</div>
              <p>Vous êtes inscrit·e aux actualités de {restoName}.<br />À très bientôt à table.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
