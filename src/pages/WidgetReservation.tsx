import { useEffect, useState } from "react";
import { fetchActive } from "../lib/supabase";
import ReservationWidget from "../components/site/ReservationWidget";
import type { OpeningHour } from "../lib/types";
// Le style du widget (.panneau, .creno, .etapes…) vit dans admin.css — voir son
// sommaire, section 10. Chargé ici explicitement puisque cette page n'affiche
// jamais le reste du site (qui charge site.css mais pas admin.css).
import "./admin.css";

/**
 * Page "widget seul" — pour les clients qui gardent leur site existant et
 * veulent seulement intégrer le widget de réservation, via <iframe>.
 * Ne rend RIEN d'autre : pas de Navbar, pas de Footer, pas de hero.
 * Le widget est ouvert en permanence (pas de bouton "Réserver" à cliquer,
 * puisque la page entière EST le widget).
 */
export default function WidgetReservation() {
  const [hours, setHours] = useState<OpeningHour[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchActive<OpeningHour>("opening_hours", "day_of_week").then((h) => {
      setHours(h);
      setLoaded(true);
    });
  }, []);

  // Informe la page parente (le site du client) de la hauteur réelle du
  // contenu, pour qu'elle puisse ajuster la hauteur de l'iframe dynamiquement
  // (un simple <iframe height="600"> fixe ne suit pas un widget qui grandit
  // avec les étapes du formulaire).
  useEffect(() => {
    if (!loaded) return;
    const envoyerHauteur = () => {
      const h = document.body.scrollHeight;
      window.parent?.postMessage({ type: "latable-widget-height", height: h }, "*");
    };
    envoyerHauteur();
    const observer = new ResizeObserver(envoyerHauteur);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <div className="widget-seul">
      <ReservationWidget hours={hours} open={true} onClose={() => {}} masquerFermer />
    </div>
  );
}
