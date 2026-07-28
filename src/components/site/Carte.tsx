import type { MenuItem } from "../../lib/types";

interface CatMeta { moment?: string; intro?: string }

// Bloc "La carte". La MISE EN PAGE est propre à Côté Jardin (nom + description
// groupés à gauche, prix à droite — cf. .plat-gauche dans site.css). Le gabarit
// en propose une autre (ligne avec points de conduite, .plat-ligne/.plat-pts) :
// c'est normal, voir le registre des compositions (GESTION-MULTI-CLIENTS.md,
// section 7).
//
// ⚠️ DETTE CONNUE : le titre et l'eyebrow sont écrits en dur ci-dessous alors
// qu'ils sont propres au client. À passer en VITE_CARTE_TITRE / VITE_CARTE_EYEBROW,
// comme le fait déjà le bloc Histoire avec VITE_STORY_*.
export default function Carte({ menu, catMeta, menuFile }: {
  menu: MenuItem[];
  catMeta?: Record<string, CatMeta>;
  menuFile?: { url: string; name?: string } | null;
}) {
  const cats: string[] = [];
  menu.forEach((m) => { if (!cats.includes(m.category)) cats.push(m.category); });
  const meta = catMeta || {};

  return (
    <section className="carte" id="carte">
      <div className="wrap">
        <div className="carte-head">
          <span className="carte-eyebrow">La carte</span>
          <h2 className="carte-titre">Galettes, salades &amp; gourmandises</h2>
          {menuFile?.url && (
            <a className="carte-telecharger" href={menuFile.url} target="_blank" rel="noopener noreferrer" download>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              Télécharger la carte
            </a>
          )}
        </div>
        <div className="menu-cols">
          {cats.map((cat) => (
            <div className="cat" key={cat}>
              <h3>
                {cat}
                {meta[cat]?.moment && <span className="cat-moment">{meta[cat].moment}</span>}
              </h3>
              {meta[cat]?.intro && <div className="cat-intro">{meta[cat].intro}</div>}
              {menu.filter((m) => m.category === cat).map((m) => (
                <div className="plat" key={m.id}>
                  <div className="plat-gauche">
                    <span className="plat-nom">{m.name}</span>
                    {m.description && <div className="plat-desc">{m.description}</div>}
                  </div>
                  <span className="plat-prix">{m.price ? `${m.price} €` : ""}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
