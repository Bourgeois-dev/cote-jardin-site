import { useState } from "react";

export default function Navbar({ onReserve, reserveLabel = "Réserver", flags }: {
  onReserve: () => void;
  reserveLabel?: string;
  flags?: { ardoise?: boolean; takeaway?: boolean; partners?: boolean; newsletter?: boolean };
}) {
  const f = flags || {};
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="nav-header">
      <div className="wrap nav">
        <a className="brand" href="#" onClick={close}>{import.meta.env.VITE_RESTO_NAME || "Restaurant"}</a>

        {/* Desktop */}
        <ul className="nav-links">
          <li><a href="#histoire">Notre cuisine</a></li>
          {f.ardoise && <li><a href="#jour">Plat du jour</a></li>}
          <li><a href="#carte">La carte</a></li>
          {f.takeaway && <li><a href="#emporter">À emporter</a></li>}
          {f.partners && <li><a href="#producteurs">Producteurs</a></li>}
          <li><a href="#galerie">Galerie</a></li>
          {f.newsletter !== false && <li><a href="#contact">Contact</a></li>}
        </ul>

        <div className="nav-droite">
          <button className="btn btn-accent nav-resa" onClick={onReserve}>{reserveLabel}</button>
          {/* Burger mobile */}
          <button
            className={`nav-burger${open ? " ouvert" : ""}`}
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>

      {/* Menu mobile déroulant */}
      {open && (
        <nav className="nav-mobile" role="navigation">
          <ul>
            <li><a href="#histoire" onClick={close}>Notre cuisine</a></li>
            {f.ardoise && <li><a href="#jour" onClick={close}>Plat du jour</a></li>}
            <li><a href="#carte" onClick={close}>La carte</a></li>
            {f.takeaway && <li><a href="#emporter" onClick={close}>À emporter</a></li>}
            {f.partners && <li><a href="#producteurs" onClick={close}>Producteurs</a></li>}
            <li><a href="#galerie" onClick={close}>Galerie</a></li>
            {f.newsletter !== false && <li><a href="#contact" onClick={close}>Contact</a></li>}
          </ul>
          <button className="btn btn-accent nav-mobile-resa" onClick={() => { onReserve(); close(); }}>
            {reserveLabel}
          </button>
        </nav>
      )}
    </header>
  );
}
