// Bloc "Notre cuisine" — EXCEPTION figée au build (comme le hero et le menu de
// navigation). Son contenu n'est PAS éditable dans l'admin : il est défini une
// fois à la création du site via les variables VITE_STORY_* et figé au build.
// C'est un bloc unique, à l'image du restaurateur. Voir la règle d'or (CLAUDE.md).
export default function Histoire() {
  const title = import.meta.env.VITE_STORY_TITLE || "Notre histoire";
  const content = import.meta.env.VITE_STORY_CONTENT || "";
  const signature = import.meta.env.VITE_STORY_SIGNATURE || "";
  const eyebrow = import.meta.env.VITE_STORY_EYEBROW || "Notre cuisine";
  const valeurs = (import.meta.env.VITE_STORY_VALEURS || "")
    .split("|")
    .map((v: string) => v.trim())
    .filter(Boolean);
  const img = import.meta.env.VITE_STORY_IMAGE || "";
  return (
    <section className="histoire" id="histoire">
      <div className="histoire-wrap">
        <div className="histoire-tete">
          <div>
            <div className="histoire-eyebrow"><span>{eyebrow}</span><span className="histoire-num">01</span></div>
            <h2 className="histoire-titre">{title}</h2>
          </div>
          {signature && <p className="histoire-cit">« {signature} »</p>}
        </div>
        <div className="histoire-corps">
          <div className="histoire-visuel">
            <span className="histoire-cadre" />
            {img && <img src={img} alt="" />}
          </div>
          <div className="histoire-texte">
            {content.split("\n").map((p: string, i: number) => p.trim() && <p key={i}>{p}</p>)}
            {valeurs.length > 0 && (
              <div className="histoire-valeurs">
                {valeurs.map((v: string, i: number) => (
                  <span key={i} className="histoire-valeur">{v}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
