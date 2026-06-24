import { useState, useEffect, useRef } from "react";
import type { Review } from "../../lib/types";

function Stars({ n }: { n: number }) {
  return (
    <div className="avis-etoiles">
      {[1,2,3,4,5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width="16" height="16"
          fill={i <= n ? "var(--accent)" : "none"}
          stroke="var(--accent)" strokeWidth="1.5">
          <path d="M12 2l2.9 6.3 6.8.8-5 4.6 1.3 6.7L12 17.8 5.9 20.4 7.2 13.7l-5-4.6 6.8-.8z"/>
        </svg>
      ))}
    </div>
  );
}

export default function Avis({ reviews }: { reviews: Review[] }) {
  const PER_PAGE = 3;
  const total = reviews.length;
  const pages = Math.ceil(total / PER_PAGE);
  const [page, setPage] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Auto-avance toutes les 6 s
  useEffect(() => {
    if (pages <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), 6000);
    return () => clearInterval(t);
  }, [pages]);

  // Décalage en % de la largeur de la piste
  const offset = page * 100;

  return (
    <section className="avis" id="avis">
      <div className="avis-tete">
        <div>
          <span className="eyebrow">Ils ont aimé</span>
          <h2>Ce qu'ils en disent</h2>
        </div>
        {pages > 1 && (
          <div className="avis-nav">
            {Array.from({ length: pages }).map((_, i) => (
              <button
                key={i}
                className={`avis-point${i === page ? " actif" : ""}`}
                onClick={() => setPage(i)}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="avis-track-wrap">
        <div
          ref={trackRef}
          className="avis-piste"
          style={{ transform: `translateX(calc(-${offset}% - ${page * 20}px))` }}
        >
          {reviews.map((r) => (
            <div className="avis-carte" key={r.id}>
              <div className="avis-carte-inner">
                <Stars n={r.rating} />
                <p className="avis-texte">« {r.content} »</p>
                <div className="avis-auteur">{r.author}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
