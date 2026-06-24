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
  const [idx, setIdx] = useState(0);
  const [perPage, setPerPage] = useState(3);
  const trackRef = useRef<HTMLDivElement>(null);
  const total = reviews.length;

  // Détecte le nombre de cartes visibles selon la largeur
  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      setPerPage(w <= 580 ? 1 : w <= 900 ? 2 : 3);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const pages = Math.max(1, Math.ceil(total / perPage));

  // Ramène l'index dans les bornes si perPage change
  useEffect(() => {
    setIdx((i) => Math.min(i, pages - 1));
  }, [pages]);

  // Auto-avance
  useEffect(() => {
    if (pages <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % pages), 6000);
    return () => clearInterval(t);
  }, [pages]);

  // Décalage : on translate d'un multiple de (100% / perPage) par carte visible
  // En pratique on translate la piste de idx * (largeur d'une carte + gap)
  // La carte fait calc((100% - gap*(perPage-1)) / perPage)
  // On utilise une translation en % de la piste entière
  const cardPct = 100 / perPage;           // % de la piste par carte
  const gapPx = perPage > 1 ? 20 : 0;     // gap en px entre cartes
  const translateX = `calc(-${idx * perPage * cardPct}% - ${idx * gapPx}px)`;

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
                className={`avis-point${i === idx ? " actif" : ""}`}
                onClick={() => setIdx(i)}
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
          style={{ transform: `translateX(${translateX})` }}
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
