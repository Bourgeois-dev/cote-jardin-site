import { useRef, useState } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, messageUpload } from "../../lib/supabase";
import type { GalleryImage } from "../../lib/types";
import { useConfirm } from "./Confirm";
import Chargement from "./Chargement";

export default function TabGalerie() {
  const confirm = useConfirm();
  const { rows, loading, insert, update, remove, reload } = useTable<GalleryImage>("gallery_images");
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<GalleryImage | null>(null);
  const dragId = useRef<string | null>(null);

  const [upEnCours, setUpEnCours] = useState(0);

  // Plusieurs fichiers d'un coup : neuf photos ne doivent pas coûter neuf
  // allers-retours. Envoi séquentiel — le storage n'aime pas les rafales — et
  // en cas d'échec au milieu, ce qui est déjà passé reste acquis.
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files || []);
    if (!fichiers.length) return;
    setErr("");
    let pos = rows.length;
    let rate = "";
    setUpEnCours(fichiers.length);
    for (const file of fichiers) {
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error } = await supabase.storage.from("gallery").upload(path, file);
      if (error) { rate = messageUpload(error); break; }
      const { data } = supabase.storage.from("gallery").getPublicUrl(path);
      await insert({ url: data.publicUrl, alt: "", caption: "", position: pos++, is_active: true });
      setUpEnCours((n) => n - 1);
    }
    setUpEnCours(0);
    if (rate) setErr(rate);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function supprimer(g: GalleryImage) {
    if (await confirm({ titre: "Supprimer cette photo ?", confirmer: "Supprimer", danger: true })) remove(g.id);
  }

  // Drag & drop : réordonne et persiste position
  async function onDrop(cibleId: string) {
    const src = dragId.current;
    dragId.current = null;
    if (!src || src === cibleId) return;
    const ordered = [...rows].sort((a, b) => a.position - b.position);
    const from = ordered.findIndex((r) => r.id === src);
    const to = ordered.findIndex((r) => r.id === cibleId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    await Promise.all(ordered.map((r, i) => r.position === i ? null : supabase.from("gallery_images").update({ position: i }).eq("id", r.id)));
    reload();
  }

  async function saveEdit() {
    if (!edit) return;
    const legende = (edit.caption || "").trim();
    // Un seul champ pour le restaurateur : la légende. Le texte alternatif
    // (accessibilité / SEO) en est déduit — pour une photo de restaurant, une
    // bonne légende EST une bonne description. On ne remplace jamais un alt
    // existant par du vide : effacer la légende ne doit pas dégrader le SEO.
    await update(edit.id, { caption: legende, ...(legende ? { alt: legende } : {}) });
    setEdit(null);
  }

  const ordered = [...rows].sort((a, b) => a.position - b.position);

  return (
    <>
      {/* Refonte Vitrine : le bouton d'ajout vit dans l'en-tête de page ;
          l'intertitre « Vos photos » disparaît (redondant avec le titre). */}
      <div className="topbar adm-vit"><div><span className="adm-vit-eyebrow">Vitrine</span><h1>Galerie</h1><div className="sous">Les photos affichées sur le site, dans cet ordre — glissez-déposez pour réordonner.</div></div>
        <div className="adm-vit-topbar-actions">
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={upload} style={{ display: "none" }} />
          <button className="btn btn-accent" onClick={() => fileRef.current?.click()} disabled={upEnCours > 0}>{upEnCours > 0 ? `Envoi… (${upEnCours} restante${upEnCours > 1 ? "s" : ""})` : "+ Ajouter des photos"}</button>
        </div>
      </div>
      <div className="contenu adm-vit">
        {loading && rows.length === 0 && <Chargement />}<div className="bloc">
        {err && <div className="err-inline">{err}</div>}
        <div className="galerie-admin">
          {ordered.map((g, i) => (
            <div className={`ga-item${g.is_active ? "" : " ga-masquee"}`} key={g.id}
                 draggable
                 onDragStart={() => { dragId.current = g.id; }}
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={() => onDrop(g.id)}>
              <div className="ga-visuel">
                <img src={g.url} alt={g.alt || ""} />
                {/* L'ordre est LA fonction de cet écran : il doit se voir. */}
                <span className="ga-num">{i + 1}</span>
                {!g.is_active && <span className="ga-badge">Masquée</span>}
              </div>
              {/* La légende quitte la photo pour une ligne de saisie apparente
                  sous la tuile (maquette) : elle montre le texte s'il existe,
                  l'invite sinon — même modale d'édition qu'avant. L'ancienne
                  pastille « Légende manquante » devient inutile : la ligne
                  vide EST le rappel. */}
              <button type="button" className={`adm-vit-legende${g.caption ? " saisie" : ""}`} onClick={() => setEdit(g)} title="Modifier la légende — elle sert aussi de description pour l'accessibilité et le référencement">{g.caption || "Ajouter une légende"}</button>
              <div className="ga-actions">
                <label className="adm-vit-affiche" title={g.is_active ? "Visible sur le site" : "Masquée"}><span className="toggle"><input type="checkbox" checked={g.is_active} onChange={(e) => update(g.id, { is_active: e.target.checked })} /><span className="piste" /></span><span className="adm-vit-etat">{g.is_active ? "Affichée" : "Masquée"}</span></label>
                <button className="adm-vit-lien danger" onClick={() => supprimer(g)} aria-label="Supprimer cette photo">Retirer</button>
              </div>
            </div>
          ))}
          {/* La tuile d'ajout vit dans la grille : l'endroit où la photo
              arrivera est l'endroit où on clique pour l'ajouter. */}
          <button type="button" className="ga-ajout" onClick={() => fileRef.current?.click()} disabled={upEnCours > 0}>
            <b>{upEnCours > 0 ? "Envoi…" : "+ Ajouter"}</b>
            <span>JPG ou PNG · plusieurs fichiers possibles</span>
          </button>
        </div>
      </div></div>

      {edit && (
        <div className="modal-backdrop" onClick={() => setEdit(null)}>
          <div className="modal-in" onClick={(e) => e.stopPropagation()}>
            <h2>Légende de la photo</h2>
            <img src={edit.url} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, margin: "12px 0" }} />
            <div className="champ"><label>Légende (affichée sur le site)</label>
              <input value={edit.caption || ""} onChange={(e) => setEdit({ ...edit, caption: e.target.value })} placeholder="Ex. Notre terrasse en été" />
              <span className="aide">Sert aussi de description de l'image pour les lecteurs d'écran et le référencement.</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}><button className="btn btn-accent" onClick={saveEdit}>Enregistrer</button><button className="btn btn-ligne" onClick={() => setEdit(null)}>Annuler</button></div>
          </div>
        </div>
      )}
    </>
  );
}
