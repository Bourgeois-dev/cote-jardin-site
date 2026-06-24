export default function Navbar({ onReserve, reserveLabel = "Réserver" }: { onReserve: () => void; reserveLabel?: string }) {
  return (
    <header className="nav-header">
      <div className="wrap nav">
        <a className="brand" href="#">{import.meta.env.VITE_RESTO_NAME || "Restaurant"}</a>
        <ul className="nav-links">
          <li><a href="#histoire">Notre cuisine</a></li>
          <li><a href="#carte">La carte</a></li>
          <li><a href="#producteurs">Producteurs</a></li>
          <li><a href="#galerie">Galerie</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
        <button className="btn btn-accent" onClick={onReserve}>{reserveLabel}</button>
      </div>
    </header>
  );
}
