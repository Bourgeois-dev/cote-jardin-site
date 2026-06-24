export default function Ardoise({ ardoise }: { ardoise: any }) {
  const plat = ardoise?.plat || "";
  const prix = ardoise?.prix || "";
  const label = ardoise?.label || "Le plat du jour";
  const note = ardoise?.note || "";
  // Image du plat : éditable depuis l'admin (ardoise.image). Si aucune image,
  // le bloc s'affiche proprement sans visuel (pas d'image d'un autre bloc).
  const img = ardoise?.image || "";
  if (!plat) return null;
  return (
    <section className={`ardoise${img ? "" : " ardoise-sans-img"}`} id="jour">
      <div className="ardoise-grid">
        <div className="ardoise-img" style={img ? { backgroundImage: `url("${img}")` } : undefined} />
        <div className="ardoise-txt">
          <div className="ardoise-lab"><span className="trait" />{label}</div>
          <h2 className="ardoise-pj">{plat}</h2>
          <div className="ardoise-meta">
            {prix && <span className="ardoise-px">{prix}</span>}
            {note && <><span className="ardoise-sep" /><span className="ardoise-note">{note}</span></>}
          </div>
        </div>
      </div>
    </section>
  );
}
