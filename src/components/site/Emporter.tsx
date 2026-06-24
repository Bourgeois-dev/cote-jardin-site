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
          <h2 className="emporter-titre">Nos formules à emporter</h2>
          <p className="emporter-intro">
            Galettes, salades et crêpes préparées à la commande — à récupérer
            directement au restaurant. Appeler pour réserver votre commande.
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
