import { useEffect, useRef } from "react";

/**
 * Hero — Côté Jardin (sur mesure)
 * Bandeau panoramique pleine largeur, texte ancré en bas à gauche.
 * Structure : 1 seule image (VITE_HERO_IMAGE), voile dégradé encre, liseré or.
 * Boutons : Réserver (accent) + Voir les horaires (ghost crème).
 */
export default function Hero({
  onReserve,
  onHours,
  reserveLabel = "Réserver une table",
}: {
  onReserve: () => void;
  onHours: () => void;
  reserveLabel?: string;
}) {
  const name     = import.meta.env.VITE_RESTO_NAME    || "Côté Jardin";
  const tagline  = import.meta.env.VITE_RESTO_TAGLINE || "";
  const city     = import.meta.env.VITE_RESTO_CITY    || "";
  const image    = import.meta.env.VITE_HERO_IMAGE    || "";

  const heroRef = useRef<HTMLElement>(null);

  // Parallaxe léger au scroll (désactivé si prefers-reduced-motion)
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const el = heroRef.current;
    if (!el) return;
    const onScroll = () => {
      const shift = window.scrollY * 0.18;
      el.style.setProperty("--hero-parallax", `${shift}px`);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="cj-hero" ref={heroRef}>
      {/* Image de fond */}
      {image && (
        <div
          className="cj-hero-bg"
          style={{ backgroundImage: `url("${image}")` }}
          aria-hidden="true"
        />
      )}
      {!image && <div className="cj-hero-bg cj-hero-bg--placeholder" aria-hidden="true" />}

      {/* Voile dégradé */}
      <div className="cj-hero-voile" aria-hidden="true" />

      {/* Liseré or en bas */}
      <div className="cj-hero-lisere" aria-hidden="true" />

      {/* Contenu texte */}
      <div className="cj-hero-inner">
        {city && (
          <p className="cj-hero-eyebrow">
            <span className="cj-hero-trait" />
            {city}
            <span className="cj-hero-trait" />
          </p>
        )}
        {import.meta.env.VITE_RESTO_LOGO ? (
          <img className="cj-hero-logo" src={import.meta.env.VITE_RESTO_LOGO} alt={name} />
        ) : (
          <>
            <h1 className="cj-hero-titre">{name}</h1>
            {tagline && <p className="cj-hero-tagline">{tagline}</p>}
          </>
        )}
        <div className="cj-hero-cta">
          <button className="btn btn-accent" onClick={onReserve}>
            {reserveLabel}
          </button>
          <button className="cj-btn-horaires" onClick={onHours}>
            Voir les horaires
          </button>
        </div>
      </div>
    </section>
  );
}
