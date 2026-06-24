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
