/**
 * Indicateur de chargement homogène pour le fetch initial des onglets.
 * Évite l'écran blanc de 1-2 s sur connexion lente (mobile en service).
 */
export default function Chargement({ texte = "Chargement…" }: { texte?: string }) {
  return (
    <div className="chargement" role="status" aria-live="polite">
      <span className="chargement-rond" aria-hidden="true" />
      {texte}
    </div>
  );
}
