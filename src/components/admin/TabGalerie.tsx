import { useRef, useState } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase } from "../../lib/supabase";
import type { GalleryImage } from "../../lib/types";
import { useConfirm } from "./Confirm";

export default function TabGalerie() {
  const confirm = useConfirm();
  const { rows, insert, update, remove } = useTable<GalleryImage>("gallery_images");
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("gallery").upload(path, file);
    if (error) { setErr("Erreur d'upload : " + error.message); return; }
    const { data } = supabase.storage.from("gallery").getPublicUrl(path);
    await insert({ url: data.publicUrl, alt: "", position: 99, is_active: true });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function supprimer(g: GalleryImage) {
    if (await confirm({ titre: "Supprimer cette photo ?", confirmer: "Supprimer", danger: true })) remove(g.id);
  }

  return (
    <>
      <div className="topbar"><div><h1>Galerie</h1><div className="sous">Les photos affichées sur le site</div></div></div>
      <div className="contenu"><div className="bloc">
        <div className="bloc-tete"><div><h2>Vos photos</h2></div>
          <div><input ref={fileRef} type="file" accept="image/*" onChange={upload} style={{ display: "none" }} /><button className="btn btn-accent" onClick={() => fileRef.current?.click()}>+ Ajouter une photo</button></div>
        </div>
        {err && <div className="login-err">{err}</div>}
        <div className="galerie-admin">
          {rows.length ? rows.map((g) => (
            <div className="ga-item" key={g.id} style={{ opacity: g.is_active ? 1 : 0.45 }}>
              <img src={g.url} alt={g.alt || ""} />
              <div className="ga-actions">
                <label className="toggle"><input type="checkbox" checked={g.is_active} onChange={(e) => update(g.id, { is_active: e.target.checked })} /><span className="piste" /></label>
                <button className="btn btn-mini btn-danger" onClick={() => supprimer(g)}>×</button>
              </div>
            </div>
          )) : <div className="vide">Aucune photo.</div>}
        </div>
      </div></div>
    </>
  );
}
