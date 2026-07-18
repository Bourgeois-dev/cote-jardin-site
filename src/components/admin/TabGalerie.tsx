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

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("gallery").upload(path, file);
    if (error) { setErr(messageUpload(error)); return; }
    const { data } = supabase.storage.from("gallery").getPublicUrl(path);
    await insert({ url: data.publicUrl, alt: "", caption: "", position: rows.length, is_active: true });
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
    await update(edit.id, { alt: edit.alt || "", caption: edit.caption || "" });
    setEdit(null);
  }

  const ordered = [...rows].sort((a, b) => a.position - b.position);

  return (
    <>
      <div className="topbar"><div><h1>Galerie</h1><div className="sous">Les photos affichées sur le site — glissez-déposez pour réordonner</div></div></div>
      <div className="contenu">
        {loading && rows.length === 0 && <Chargement />}<div className="bloc">
        <div className="bloc-tete"><div><h2>Vos photos</h2></div>
          <div><input ref={fileRef} type="file" accept="image/*" onChange={upload} style={{ display: "none" }} /><button className="btn btn-accent" onClick={() => fileRef.current?.click()}>+ Ajouter une photo</button></div>
        </div>
        {err && <div className="err-inline">{err}</div>}
        <div className="galerie-admin">
          {ordered.length ? ordered.map((g) => (
            <div className="ga-item" key={g.id}
                 draggable
                 onDragStart={() => { dragId.current = g.id; }}
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={() => onDrop(g.id)}
                 style={{ opacity: g.is_active ? 1 : 0.45, cursor: "grab" }}>
              <div className="ga-visuel">
                <img src={g.url} alt={g.alt || ""} />
                {g.caption && <div className="ga-legende">{g.caption}</div>}
              </div>
              <div className="ga-actions">
                <label className="toggle"><input type="checkbox" checked={g.is_active} onChange={(e) => update(g.id, { is_active: e.target.checked })} /><span className="piste" /></label>
                <button className="btn btn-mini btn-ligne" onClick={() => setEdit(g)}>Texte</button>
                <button className="btn btn-mini btn-danger" onClick={() => supprimer(g)}>×</button>
              </div>
            </div>
          )) : <div className="vide">Aucune photo.</div>}
        </div>
      </div></div>

      {edit && (
        <div className="modal-backdrop" onClick={() => setEdit(null)}>
          <div className="modal-in" onClick={(e) => e.stopPropagation()}>
            <h2>Texte de la photo</h2>
            <img src={edit.url} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, margin: "12px 0" }} />
            <div className="champ"><label>Légende (affichée sur le site)</label><input value={edit.caption || ""} onChange={(e) => setEdit({ ...edit, caption: e.target.value })} placeholder="Ex. Notre terrasse en été" /></div>
            <div className="champ"><label>Texte alternatif (accessibilité / SEO)</label><input value={edit.alt || ""} onChange={(e) => setEdit({ ...edit, alt: e.target.value })} placeholder="Description de l'image pour les lecteurs d'écran" /></div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}><button className="btn btn-accent" onClick={saveEdit}>Enregistrer</button><button className="btn btn-ligne" onClick={() => setEdit(null)}>Annuler</button></div>
          </div>
        </div>
      )}
    </>
  );
}
