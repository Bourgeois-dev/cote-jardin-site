import { useState, useEffect } from "react";
import type { Review } from "../../lib/types";

function Stars({ n }: { n: number }) {
  return (
    <div className="avis-etoiles">
      {[1,2,3,4,5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width="17" height="17"
          fill={i <= n ? "var(--accent)" : "none"}
          stroke="var(--accent)" strokeWidth="1.5">
          <path d="M12 2l2.9 6.3 6.8.8-5 4.6 1.3 6.7L12 17.8 5.9 20.4 7.2 13.7l-5-4.6 6.8-.8z"/>
        </svg>
      ))}
    </div>
  );
}

export default function Avis({ reviews }: { reviews: Review[] }) {
  const [idx, setIdx] = useState(0);
  const total = reviews.length;
  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % total), 5500);
    return () => clearInterval(t);
  }, [total]);

  return (
    <section className="avis" id="avis">
      <div className="wrap avis-inner">
        <span className="eyebrow">Ils ont aimé</span>
        <h2>Ce qu'ils en disent</h2>
        <div className="avis-carrousel">
          <div className="avis-piste" style={{ transform:`translateX(-${idx * 100}%)` }}>
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
        <div className="avis-nav">
          {reviews.map((_, i) => (
            <button key={i} className={`avis-point${i === idx ? " actif" : ""}`}
              onClick={() => setIdx(i)} aria-label={`Avis ${i + 1}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
