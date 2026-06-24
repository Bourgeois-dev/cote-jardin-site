import { useEffect, useState } from "react";
import type { PromoBanner } from "../../lib/types";

function formatDate(d: string | null): string {
  if (!d) return "Événement";
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch { return "Événement"; }
}

export default function PromoPopup({ promo }: { promo: PromoBanner | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // S'affiche à l'arrivée, une fois, si la bannière est active
    if (promo && promo.is_active) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [promo]);

  if (!promo || !promo.is_active || !open) return null;

  const hasImage = !!promo.image_url;

  return (
    <div className="promo-backdrop" onClick={() => setOpen(false)}>
      <div className="promo-popup" onClick={(e) => e.stopPropagation()}>
        <div className="promo-entete" style={hasImage ? { backgroundImage: `url(${promo.image_url})` } : undefined}>
          <span className="promo-badge">{formatDate(promo.event_date)}</span>
          <button className="promo-fermer" onClick={() => setOpen(false)} aria-label="Fermer">×</button>
        </div>
        <div className="promo-corps">
          {promo.title && <h3 className="promo-titre">{promo.title}</h3>}
          {promo.subtitle && <p className="promo-sous">{promo.subtitle}</p>}
          {promo.message && !promo.subtitle && <p className="promo-sous">{promo.message}</p>}
          {promo.cta_label && (
            <a className="btn btn-accent promo-cta" href={promo.cta_url || "#contact"} onClick={() => setOpen(false)}>
              {promo.cta_label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
