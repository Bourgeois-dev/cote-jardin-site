import { useState, useEffect, useRef } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, fetchContent } from "../../lib/supabase";
import type { MenuItem } from "../../lib/types";
import { useConfirm } from "./Confirm";

const CAT_BASE = ["Entrées", "Plats", "Desserts", "Menus", "Boissons"];
const TYPES_OK = ["application/pdf", "image/png", "image/jpeg"];

export default function TabCarte() {
  const confirm = useConfirm();
  const { rows, insert, update, remove } = useTable<MenuItem>("menu_items");

  // Carte téléchargeable (fichier PDF/PNG/JPG) — stockée dans le bucket "menu",
  // son URL est mémorisée dans site_content (clé "menu_file").
  const [menuFile, setMenuFile] = useState<{ url: string; name: string } | null>(null);
  const [upLoad, setUpLoad] = useState(false);
  const [upErr, setUpErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const c = await fetchContent("menu_file");
      if (c?.url) setMenuFile({ url: c.url, name: c.name || "carte" });
    })();
  }, []);

  async function uploadCarte(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpErr("");
    if (!TYPES_OK.includes(file.type)) { setUpErr("Format accepté : PDF, PNG ou JPG."); return; }
    if (file.size > 10 * 1024 * 1024) { setUpErr("Fichier trop lourd (max 10 Mo)."); return; }
    setUpLoad(true);
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("menu").upload(path, file);
    if (error) { setUpErr("Erreur d'upload : " + error.message); setUpLoad(false); return; }
    const { data } = supabase.storage.from("menu").getPublicUrl(path);
    const meta = { url: data.publicUrl, name: file.name };
    await supabase.from("site_content").upsert({ section_key: "menu_file", content: meta }, { onConflict: "section_key" });
    setMenuFile(meta);
    setUpLoad(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function supprimerCarte() {
    if (!(await confirm({ titre: "Retirer la carte téléchargeable ?", message: "Le bouton de téléchargement disparaîtra du site.", confirmer: "Retirer", danger: true }))) return;
    await supabase.from("site_content").upsert({ section_key: "menu_file", content: {} }, { onConflict: "section_key" });
    setMenuFile(null);
  }

  async function supprimer(m: MenuItem) {
    if (await confirm({ titre: "Supprimer ce plat ?", message: `« ${m.name} » sera retiré de la carte.`, confirmer: "Supprimer", danger: true })) remove(m.id);
  }
  const [edit, setEdit] = useState<Partial<MenuItem> | null>(null);
  const [newCat, setNewCat] = useState(false);
  const [catText, setCatText] = useState("");

  const cats = Array.from(new Set([...CAT_BASE, ...rows.map((r) => r.category).filter(Boolean)]));

  function nouveau() { setEdit({ name: "", category: "Plats", description: "", price: 0, is_active: true }); setNewCat(false); setCatText(""); }
  function modifier(m: MenuItem) { setEdit({ ...m }); setNewCat(false); setCatText(""); }

  async function save() {
    if (!edit?.name?.trim()) return;
    let category = edit.category;
    if (newCat) { if (!catText.trim()) return; category = catText.trim(); }
    const vals = { name: edit.name, category, description: edit.description || "", price: edit.price || 0, is_active: edit.is_active !== false };
    if (edit.id) await update(edit.id, vals); else await insert({ ...vals, position: 99 });
    setEdit(null);
  }

  if (edit) {
    return (
      <>
        <div className="topbar"><div><h1>{edit.id ? "Modifier le plat" : "Nouveau plat"}</h1></div></div>
        <div className="contenu"><div className="bloc">
          <div className="grid2">
            <div className="champ"><label>Nom du plat *</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="champ"><label>Catégorie</label>
              <select value={newCat ? "__new__" : edit.category} onChange={(e) => { if (e.target.value === "__new__") { setNewCat(true); } else { setNewCat(false); setEdit({ ...edit, category: e.target.value }); } }}>
                {cats.map((c) => <option key={c}>{c}</option>)}
                <option value="__new__">+ Nouvelle catégorie…</option>
              </select>
              {newCat && <input style={{ marginTop: 8 }} placeholder="Nom de la nouvelle catégorie" value={catText} onChange={(e) => setCatText(e.target.value)} />}
            </div>
          </div>
          <div className="champ"><label>Description</label><textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          <div className="grid2">
            <div className="champ"><label>Prix (€)</label><input type="number" step="0.50" value={edit.price ?? ""} onChange={(e) => setEdit({ ...edit, price: parseFloat(e.target.value) })} /></div>
            <div className="champ" style={{ display: "flex", alignItems: "flex-end" }}>
              <label className="ligne-toggle" style={{ border: "none", padding: 0, width: "100%" }}><span className="lib"><b>Visible sur le site</b></span><span className="toggle"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /><span className="piste" /></span></label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}><button className="btn btn-accent" onClick={save}>{edit.id ? "Enregistrer" : "Ajouter"}</button><button className="btn btn-ligne" onClick={() => setEdit(null)}>Annuler</button></div>
        </div></div>
      </>
    );
  }

  return (
    <>
      <div className="topbar"><div><h1>La carte</h1><div className="sous">Vos plats, regroupés par catégorie</div></div></div>
      <div className="contenu"><div className="bloc">
        <div className="bloc-tete"><div><h2>Vos plats</h2></div><button className="btn btn-accent" onClick={nouveau}>+ Ajouter un plat</button></div>
        <table><thead><tr><th style={{ width: 56 }}>Visible</th><th>Plat</th><th>Catégorie</th><th>Prix</th><th></th></tr></thead><tbody>
          {rows.length ? rows.map((m) => (
            <tr key={m.id}>
              <td><label className="toggle"><input type="checkbox" checked={m.is_active} onChange={(e) => update(m.id, { is_active: e.target.checked })} /><span className="piste" /></label></td>
              <td><b style={m.is_active ? {} : { color: "var(--gris)" }}>{m.name}</b>{m.description && <div className="sub-desc">{m.description}</div>}</td>
              <td>{m.category}</td>
              <td>{m.price ? `${m.price} €` : "—"}</td>
              <td><div className="actions-ligne"><button className="btn btn-mini btn-ligne" onClick={() => modifier(m)}>Modifier</button><button className="btn btn-mini btn-danger" onClick={() => supprimer(m)}>Supprimer</button></div></td>
            </tr>
          )) : <tr><td colSpan={5} className="vide">Aucun plat. Ajoutez-en un.</td></tr>}
        </tbody></table>
      </div>

      <div className="bloc">
        <div className="bloc-tete"><div><h2>Carte à télécharger</h2><div className="desc">Mettez en ligne votre carte (PDF, PNG ou JPG). Un bouton « Télécharger la carte » apparaîtra sur le site, en plus de la carte ci-dessus.</div></div></div>
        {menuFile ? (
          <div className="menu-file-actuel">
            <div className="menu-file-info">
              <span className="menu-file-icone">📄</span>
              <div>
                <b>{menuFile.name}</b>
                <div className="sub-desc"><a href={menuFile.url} target="_blank" rel="noopener noreferrer">Voir le fichier en ligne</a></div>
              </div>
            </div>
            <div className="actions-ligne">
              <label className="btn btn-mini btn-ligne" style={{ cursor: "pointer" }}>Remplacer<input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={uploadCarte} style={{ display: "none" }} /></label>
              <button className="btn btn-mini btn-danger" onClick={supprimerCarte}>Retirer</button>
            </div>
          </div>
        ) : (
          <label className="btn btn-accent" style={{ cursor: "pointer", display: "inline-block" }}>
            {upLoad ? "Envoi en cours…" : "+ Mettre en ligne la carte"}
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={uploadCarte} style={{ display: "none" }} disabled={upLoad} />
          </label>
        )}
        {upErr && <div className="alerte" style={{ marginTop: 10 }}>{upErr}</div>}
      </div></div>
    </>
  );
}
