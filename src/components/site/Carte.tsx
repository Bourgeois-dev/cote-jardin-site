import type { MenuItem } from "../../lib/types";

interface CatMeta { moment?: string; intro?: string }

export default function Carte({ menu, catMeta, menuFile }: { menu: MenuItem[]; catMeta?: Record<string, CatMeta>; menuFile?: { url: string; name?: string } | null }) {
  // Regroupe par catégorie en conservant l'ordre d'apparition
  const cats: string[] = [];
  menu.forEach((m) => { if (!cats.includes(m.category)) cats.push(m.category); });
  const meta = catMeta || {};
  return (
    <section className="carte" id="carte">
      <div className="wrap">
        <div className="carte-head">
          <div className="carte-eyebrow"><span>La carte</span><span className="carte-num">02</span></div>
          <h2 className="carte-titre">Le déjeuner &amp; le dîner</h2>
          {menuFile?.url && (
            <a className="carte-telecharger" href={menuFile.url} target="_blank" rel="noopener noreferrer" download>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                  <div className="plat-ligne">
                    <span className="plat-nom">{m.name}</span>
                    <span className="plat-pts" />
                    <span className="plat-prix">{m.price ? `${m.price} €` : ""}</span>
                  </div>
                  {m.description && <div className="plat-desc">{m.description}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
