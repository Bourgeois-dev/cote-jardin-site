import type { Partner } from "../../lib/types";

export default function Partenaires({ partners }: { partners: Partner[] }) {
  const cats: string[] = [];
  partners.forEach((p) => { if (p.category && !cats.includes(p.category)) cats.push(p.category); });
  return (
    <section className="partenaires" id="producteurs">
      <div className="prod-wrap">
        <div className="prod-tete">
          <div>
            <div className="prod-eyebrow"><span>Nos producteurs</span><span className="prod-num">03</span></div>
            <h2 className="prod-titre">Main dans la main</h2>
          </div>
          <p className="prod-intro">Le produit brut commence à la source. Voici les femmes et les hommes qui font notre cuisine.</p>
        </div>
        <div className="prod-grid">
          {(cats.length ? cats : ["Nos partenaires"]).map((cat) => (
            <div className="prod-card" key={cat}>
              <h3>{cat}</h3>
              {partners.filter((p) => (cats.length ? p.category === cat : true)).map((p) => (
                <div key={p.id} className="prod-item">
                  <b>{p.name}</b>
                  {p.description && <p>{p.description}</p>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
