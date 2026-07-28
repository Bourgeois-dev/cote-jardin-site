// Bloc "Notre cuisine" — EXCEPTION figée au build (comme le hero et le menu de
// navigation). Son contenu n'est PAS éditable dans l'admin : il est défini une
// fois à la création du site via les variables VITE_STORY_* et figé au build.
// C'est un bloc unique, à l'image du restaurateur. Voir la règle d'or (CLAUDE.md).
//
// La MISE EN PAGE de ce bloc est propre à Côté Jardin (colonne texte + colonne
// image, cf. .histoire-texte-col / .histoire-img-col dans site.css). Le gabarit
// en propose une autre — c'est normal, voir le registre des compositions
// (GESTION-MULTI-CLIENTS.md, section 7).
export default function Histoire() {
  const title     = import.meta.env.VITE_STORY_TITLE     || "Notre histoire";
  const content   = import.meta.env.VITE_STORY_CONTENT   || "";
  const signature = import.meta.env.VITE_STORY_SIGNATURE || "";
  const eyebrow   = import.meta.env.VITE_STORY_EYEBROW   || "Notre cuisine";
  const valeurs   = (import.meta.env.VITE_STORY_VALEURS || "")
    .split("|").map((v: string) => v.trim()).filter(Boolean);
  const img = import.meta.env.VITE_STORY_IMAGE || "";

  return (
    <section className="histoire" id="histoire">
      <div className="histoire-texte-col">
        <p className="histoire-eyebrow">{eyebrow}</p>
        <h2 className="histoire-titre">{title}</h2>
        <div className="histoire-corps">
          {content.split("\n").map((p: string, i: number) =>
            p.trim() && <p key={i}>{p}</p>
          )}
        </div>
        {signature && <p className="histoire-signature">« {signature} »</p>}
        {valeurs.length > 0 && (
          <div className="histoire-valeurs">
            {valeurs.map((v: string, i: number) => (
              <span key={i} className="histoire-valeur">{v}</span>
            ))}
          </div>
        )}
      </div>
      <div className="histoire-img-col">
        {img && <img src={img} alt="" />}
      </div>
    </section>
  );
}
