import type { OpeningHour } from "../../lib/types";

const JOURS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];

export default function HorairesModal({ hours, open, onClose }: { hours: OpeningHour[]; open: boolean; onClose: () => void }) {
  if (!open) return null;
  const phone = import.meta.env.VITE_RESTO_PHONE || "";
  const sorted = hours.slice().sort((a, b) => a.day_of_week - b.day_of_week);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-in" onClick={(e) => e.stopPropagation()}>
        <button className="fermer-x" onClick={onClose} aria-label="Fermer">×</button>
        <h3>Horaires d'ouverture</h3>
        {sorted.map((h) => (
          <div className="h-ligne" key={h.id}>
            <span>{JOURS[h.day_of_week]}</span>
            <span className={h.is_closed ? "ferme" : ""}>
              {h.is_closed ? "Fermé" : [h.lunch_open && `${h.lunch_open}-${h.lunch_close}`, h.dinner_open && `${h.dinner_open}-${h.dinner_close}`].filter(Boolean).join(" / ")}
            </span>
          </div>
        ))}
        {phone && <div className="modal-tel">Réservation par téléphone<b>{phone}</b></div>}
      </div>
    </div>
  );
}
