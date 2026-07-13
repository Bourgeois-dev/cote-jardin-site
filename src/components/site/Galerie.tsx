import { useState, useEffect, useCallback } from "react";
import type { GalleryImage } from "../../lib/types";

export default function Galerie({ images }: { images: GalleryImage[] }) {
  const visibles = images.filter((im) => im.is_active !== false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  const close = useCallback(() => setOpenIdx(null), []);
  const prev = useCallback(() => setOpenIdx((i) => (i === null ? i : (i - 1 + visibles.length) % visibles.length)), [visibles.length]);
  const next = useCallback(() => setOpenIdx((i) => (i === null ? i : (i + 1) % visibles.length)), [visibles.length]);

  // Navigation clavier + blocage du scroll de fond quand le lightbox est ouvert
  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [openIdx, close, prev, next]);

  if (!visibles.length) return null;
  const active = openIdx !== null ? visibles[openIdx] : null;

  return (
    <section className="galerie" id="galerie">
      <div className="galerie-head">
        <span className="galerie-eyebrow">En images</span>
        <h2 className="galerie-titre">Galerie</h2>
      </div>

      <div className="galerie-masonry">
        {visibles.map((im, i) => (
          <button
            type="button"
            className="galerie-cell"
            key={im.id}
            onClick={() => setOpenIdx(i)}
            aria-label={`Agrandir la photo${im.caption ? " : " + im.caption : ""}`}
          >
            <img
              src={im.url}
              alt={im.alt || im.caption || ""}
              loading="lazy"
              className={loaded[im.id] ? "chargee" : ""}
              onLoad={() => setLoaded((l) => ({ ...l, [im.id]: true }))}
            />
            {im.caption && <span className="galerie-legende">{im.caption}</span>}
          </button>
        ))}
      </div>

      {active && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo agrandie" onClick={close}>
          <button className="lightbox-fermer" onClick={close} aria-label="Fermer">×</button>
          {visibles.length > 1 && (
            <button className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Photo précédente">‹</button>
          )}
          <figure className="lightbox-contenu" onClick={(e) => e.stopPropagation()}>
            <img src={active.url} alt={active.alt || active.caption || ""} />
            {active.caption && <figcaption className="lightbox-legende">{active.caption}</figcaption>}
          </figure>
          {visibles.length > 1 && (
            <button className="lightbox-nav lightbox-suiv" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Photo suivante">›</button>
          )}
          {visibles.length > 1 && (
            <span className="lightbox-compteur">{(openIdx ?? 0) + 1} / {visibles.length}</span>
          )}
        </div>
      )}
    </section>
  );
}
