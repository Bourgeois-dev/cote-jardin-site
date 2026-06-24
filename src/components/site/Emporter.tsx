import type { TakeawayItem } from "../../lib/types";

/**
 * Emporter — Bloc « Plats à emporter » (sur mesure Côté Jardin)
 * Éditable depuis l'onglet TabEmporter de l'admin.
 * Affiché uniquement si takeaway_enabled = true ET au moins 1 article actif.
 */
export default function Emporter({ items }: { items: TakeawayItem[] }) {
  if (!items.length) return null;
  return (
    <section className="emporter" id="emporter">
      <div className="emporter-inner">
        <div className="emporter-tete">
          <p className="emporter-eyebrow">À emporter</p>
          <h2 className="emporter-titre">Les plats à emporter continuent !</h2>
          <p className="emporter-intro">
            Chaque semaine, votre restaurant Côté Jardin vous propose de bons petits plats à emporter, élaborés à partir de produits frais et locaux ! Pour se faire plaisir à la maison comme au restaurant.
          </p>
          <a
            href={`tel:${(import.meta.env.VITE_RESTO_PHONE || "").replace(/\s/g, "")}`}
            className="emporter-tel"
          >
            {import.meta.env.VITE_RESTO_PHONE || ""}
          </a>
        </div>
        <div className="emporter-liste">
          {items.map((item) => (
            <div className="emporter-item" key={item.id}>
              <div className="emporter-item-gauche">
                <span className="emporter-nom">{item.name}</span>
                {item.description && (
                  <span className="emporter-desc">{item.description}</span>
                )}
              </div>
              {item.price && (
                <span className="emporter-prix">{item.price} €</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
