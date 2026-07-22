import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { SocialLink } from "../../lib/types";
import { SOCIAL_SVG } from "./socialIcons";

// Lit ?utm_source=… dans l'URL, que le paramètre soit avant le hash
// (…/?utm_source=instagram#contact — format standard, recommandé) ou dans le
// hash (…/#contact?utm_source=instagram). Valeur nettoyée : [a-z0-9_-], 32 max.
function utmSource(): string {
  try {
    const h = window.location.hash;
    const dansHash = h.includes("?") ? h.slice(h.indexOf("?") + 1) : "";
    const v = new URLSearchParams(window.location.search).get("utm_source")
      || new URLSearchParams(dansHash).get("utm_source") || "";
    return v.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  } catch { return ""; }
}

export default function Newsletter({ socials }: { socials: SocialLink[] }) {
  const [sent, setSent] = useState(false);
  const [utm] = useState(utmSource);

  // Scroll vers la section quand l'URL cible #contact.
  // Deux raisons de le faire nous-mêmes plutôt que de compter sur l'ancre native :
  //  - la section est montée par React APRÈS le chargement initial, donc au
  //    moment où le navigateur traite le hash l'élément n'existe pas encore ;
  //  - avec le format #contact?utm_source=…, le hash ne correspond à aucun id.
  // On attend que l'élément soit réellement présent (max ~2 s) au lieu d'un
  // délai fixe, ce qui reste fiable même si les données du site sont lentes.
  useEffect(() => {
    const h = window.location.hash;
    if (h !== "#contact" && !h.startsWith("#contact?")) return;
    let annule = false;
    let essais = 0;
    const tick = () => {
      if (annule) return;
      const el = document.getElementById("contact");
      if (el) { el.scrollIntoView({ behavior: "smooth" }); return; }
      if (essais++ < 40) setTimeout(tick, 50);
    };
    tick();
    return () => { annule = true; };
  }, []);
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
      .upsert({ first_name: prenom, last_name: nom, email: email.trim().toLowerCase(), source: utm ? `newsletter:${utm}` : "newsletter", consent: true }, { onConflict: "email" });
    setBusy(false);
    if (error) {
      setErreur("Une erreur est survenue. Merci de réessayer dans un instant.");
      return;
    }
    setSent(true);
    // L'email de bienvenue est envoyé côté serveur par newsletter-scheduler
    // (il détecte les nouveaux leads consentis et déclenche l'envoi avec le
    // secret interne). Le site public ne déclenche plus aucun envoi d'email :
    // il se contente d'enregistrer le lead ci-dessus. Cela ferme la faille du
    // relais d'envoi ouvert (send-newsletter n'est plus appelable en anon).
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
              <p className="rgpd">Vos données sont traitées conformément au RGPD et jamais transmises à des tiers. Nos e-mails ne contiennent aucun pixel d'ouverture : nous ne savons pas si vous les lisez, seulement si vous cliquez sur un lien.</p>
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
