import type { GalleryImage } from "../../lib/types";

export default function Galerie({ images }: { images: GalleryImage[] }) {
  if (!images.length) return null;
  return (
    <section className="galerie" id="galerie">
      <div className="galerie-head">
        <span className="galerie-eyebrow">En images</span>
        <h2 className="galerie-titre">Galerie</h2>
      </div>
      <div className="galerie-grille">
        {images.map((im) => (
          <div className="galerie-cell" key={im.id}>
            <img src={im.url} alt={im.alt || ""} loading="lazy" />
          </div>
        ))}
      </div>
    </section>
  );
}
