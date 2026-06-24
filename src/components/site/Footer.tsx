import { Link } from "react-router-dom";
import type { OpeningHour, SocialLink } from "../../lib/types";
import { SOCIAL_SVG } from "./socialIcons";

const JOURS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];

export default function Footer({ hours, socials }: { hours: OpeningHour[]; socials: SocialLink[] }) {
  const name = import.meta.env.VITE_RESTO_NAME || "Restaurant";
  const addr = import.meta.env.VITE_RESTO_ADDRESS || "";
  const phone = import.meta.env.VITE_RESTO_PHONE || "";
  const actifs = socials.filter((s) => s.url && SOCIAL_SVG[s.platform]);
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <span className="brand">{name}</span>
            <p className="foot-desc">{import.meta.env.VITE_RESTO_SHORT || ""}</p>
            {actifs.length > 0 && (
              <div className="foot-socials">
                {actifs.map((s) => <a key={s.id} href={s.url} target="_blank" rel="noopener" aria-label={s.platform}>{SOCIAL_SVG[s.platform]}</a>)}
              </div>
            )}
          </div>
          <div>
            <h4>Informations</h4>
            <ul>
              {addr && <li>{addr}</li>}
              {phone && <li>{phone}</li>}
            </ul>
          </div>
          <div>
            <h4>Horaires</h4>
            <ul>
              {hours.slice().sort((a,b)=>a.day_of_week-b.day_of_week).map((h) => (
                <li key={h.id}>
                  {JOURS[h.day_of_week]} : {h.is_closed ? "Fermé" : [h.lunch_open && `${h.lunch_open}-${h.lunch_close}`, h.dinner_open && `${h.dinner_open}-${h.dinner_close}`].filter(Boolean).join(" / ")}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="foot-bas">
          <span>© {new Date().getFullYear()} {name}. Tous droits réservés.</span>
          <span className="foot-legal">
            <Link to="/mentions-legales">Mentions légales</Link>
            <Link to="/protection-des-donnees">Protection des données</Link>
          </span>
          <span>L'abus d'alcool est dangereux pour la santé.</span>
        </div>
      </div>
    </footer>
  );
}
