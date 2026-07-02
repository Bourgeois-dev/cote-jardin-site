import { useEffect, useState } from "react";
import type { Review } from "../../lib/types";

function Stars({ n }: { n: number }) {
  return (
    <div className="avis-etoiles">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width="18" height="18" fill={i <= n ? "var(--accent)" : "none"} stroke="var(--accent)" strokeWidth="1.5">
          <path d="M12 2l2.9 6.3 6.8.8-5 4.6 1.3 6.7L12 17.8 5.9 20.4 7.2 13.7l-5-4.6 6.8-.8z" />
        </svg>
      ))}
    </div>
  );
}

// « Rivière d'avis » : défilement horizontal continu (pas de carrousel).
// - Pause au survol / focus, reprise au départ du curseur.
// - La liste est dupliquée pour une boucle sans couture (copie aria-hidden).
// - Repli en grille statique si prefers-reduced-motion ou moins de 3 avis.
export default function Avis({ reviews }: { reviews: Review[] }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const maj = () => setReduceMotion(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);

  const defilant = !reduceMotion && reviews.length >= 3;
  // Vitesse proportionnelle au nombre d'avis (~14s par carte), lente et lisible.
  const duree = Math.max(30, reviews.length * 14);
  const liste = defilant ? [...reviews, ...reviews] : reviews;

  return (
    <section className="avis" id="avis">
      <div className="avis-tete">
        <div>
          <span className="eyebrow">Ils ont aimé</span>
          <h2>Ce qu'ils en disent</h2>
        </div>
      </div>
      <div className={`avis-riviere${defilant ? " defilant" : ""}`}>
        <div className="avis-flux" style={defilant ? { animationDuration: `${duree}s` } : undefined}>
          {liste.map((r, i) => (
            <article className="avis-carte" key={`${r.id}-${i}`} aria-hidden={defilant && i >= reviews.length ? true : undefined}>
              <Stars n={r.rating} />
              <p className="avis-texte">« {r.content} »</p>
              <div className="avis-auteur">{r.author}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
