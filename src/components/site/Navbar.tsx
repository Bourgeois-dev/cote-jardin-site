export default function Navbar({ onReserve, reserveLabel = "Réserver", flags }: {
  onReserve: () => void;
  reserveLabel?: string;
  flags?: { ardoise?: boolean; takeaway?: boolean; partners?: boolean; newsletter?: boolean };
}) {
  const f = flags || {};
  return (
    <header className="nav-header">
      <div className="wrap nav">
        <a className="brand" href="#">{import.meta.env.VITE_RESTO_NAME || "Restaurant"}</a>
        <ul className="nav-links">
          <li><a href="#histoire">Notre cuisine</a></li>
          <li><a href="#carte">La carte</a></li>
          {f.ardoise && <li><a href="#jour">Plat du jour</a></li>}
          {f.takeaway && <li><a href="#emporter">À emporter</a></li>}
          {f.partners && <li><a href="#producteurs">Producteurs</a></li>}
          <li><a href="#galerie">Galerie</a></li>
          {f.newsletter !== false && <li><a href="#contact">Contact</a></li>}
        </ul>
        <button className="btn btn-accent" onClick={onReserve}>{reserveLabel}</button>
      </div>
    </header>
  );
}
