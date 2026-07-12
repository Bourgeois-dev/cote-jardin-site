import type { Partner } from "../../lib/types";

// Normalise une URL saisie sans protocole (ex. "moulin-sarre.fr" -> "https://moulin-sarre.fr")
function href(url: string): string {
  const u = (url || "").trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function Carte({ p }: { p: Partner }) {
  const lien = href(p.website);
  const initiales = p.name.split(/\s+/).slice(0, 2).map((m) => m[0]||"").join("").toUpperCase();

  const contenu = (
    <>
      <div className="pa-visuel">
        {p.image_url
          ? <img src={p.image_url} alt={p.name} loading="lazy" className="pa-img" />
          : <div className="pa-fallback" aria-hidden="true"><span>{initiales}</span></div>}
        {p.partner_type && <span className="pa-badge">{p.partner_type}</span>}
      </div>
      <div className="pa-corps">
        <div className="pa-tete">
          <b className="pa-nom">{p.name}</b>
          {lien && <span className="pa-lien-ico" aria-hidden="true">↗</span>}
        </div>
        {p.category && <span className="pa-cat">{p.category}</span>}
        {p.description && <p className="pa-desc">{p.description}</p>}
        {p.location && <span className="pa-loc">📍 {p.location}</span>}
      </div>
    </>
  );

  if (lien) {
    return (
      <a
        className={`pa-card${p.featured ? " pa-featured" : ""}`}
        href={lien}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visiter le site de ${p.name} (nouvelle fenêtre)`}
      >
        {contenu}
      </a>
    );
  }
  return <div className={`pa-card${p.featured ? " pa-featured" : ""}`}>{contenu}</div>;
}

export default function Partenaires({ partners }: { partners: Partner[] }) {
  // Actifs uniquement, dans l'ordre manuel défini en admin (position).
  // "featured" ne joue que sur le style visuel, pas sur le placement.
  const liste = partners
    .filter((p) => p.is_active)
    .sort((a, b) => a.position - b.position);

  if (!liste.length) return null;

  return (
    <section className="partenaires" id="producteurs">
      <div className="prod-wrap">
        <div className="prod-tete">
          <div>
            <div className="prod-eyebrow"><span>Nos producteurs</span><span className="prod-num">03</span></div>
            <h2 className="prod-titre">Main dans la main</h2>
          </div>
          <p className="prod-intro">Le produit brut commence à la source. Voici les femmes et les hommes qui font notre cuisine.</p>
        </div>
        <div className="pa-grid">
          {liste.map((p) => <Carte key={p.id} p={p} />)}
        </div>
      </div>
    </section>
  );
}
