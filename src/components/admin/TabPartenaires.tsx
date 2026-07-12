import { useState, useEffect, useRef } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, fetchContent } from "../../lib/supabase";
import type { Partner } from "../../lib/types";
import { useConfirm } from "./Confirm";

const TYPES = ["Producteur", "Fournisseur", "Artisan", "Institution", "Presse", "Autre"];

export default function TabPartenaires() {
  const confirm = useConfirm();
  const { rows, insert, update, remove, reload } = useTable<Partner>("partners");
  const [edit, setEdit] = useState<Partial<Partner> | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => { fetchContent("partners_enabled").then((c) => setEnabled(c?.enabled ?? true)); }, []);
  async function toggleBloc(v: boolean) { setEnabled(v); await supabase.from("site_content").upsert({ section_key: "partners_enabled", content: { enabled: v } }, { onConflict: "section_key" }); }

  async function supprimer(p: Partner) {
    if (await confirm({ titre: "Supprimer ce partenaire ?", message: `« ${p.name} » sera retiré du site.`, confirmer: "Supprimer", danger: true })) remove(p.id);
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !edit) return;
    setErr(""); setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("partners").upload(path, file);
    if (error) { setErr("Erreur d'upload : " + error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("partners").getPublicUrl(path);
    setEdit({ ...edit, image_url: data.publicUrl });
    setUploading(false);
  }

  async function save() {
    if (!edit?.name?.trim()) return;
    const vals = {
      name: edit.name.trim(),
      description: edit.description || "",
      category: edit.category || "",
      image_url: edit.image_url || "",
      website: edit.website || "",
      location: edit.location || "",
      partner_type: edit.partner_type || "",
      featured: edit.featured ?? false,
    };
    if (edit.id) await update(edit.id, vals);
    else await insert({ ...vals, position: rows.length, is_active: true });
    setEdit(null);
  }

  // Drag & drop : réordonne et persiste "position"
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
    // Réindexe et persiste
    await Promise.all(ordered.map((r, i) => r.position === i ? null : supabase.from("partners").update({ position: i }).eq("id", r.id)));
    reload();
  }

  if (edit) {
    return (
      <>
        <div className="topbar"><div><h1>{edit.id ? "Modifier le partenaire" : "Nouveau partenaire"}</h1></div></div>
        <div className="contenu"><div className="bloc">
          <div className="grid2">
            <div className="champ"><label>Nom *</label><input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="champ"><label>Type de partenaire</label>
              <select value={edit.partner_type || ""} onChange={(e) => setEdit({ ...edit, partner_type: e.target.value })}>
                <option value="">— Aucun —</option>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid2">
            <div className="champ"><label>Catégorie (ex. Fruits &amp; légumes)</label><input value={edit.category || ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></div>
            <div className="champ"><label>Localité / distance (ex. Saumur · 8 km)</label><input value={edit.location || ""} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></div>
          </div>
          <div className="champ"><label>Site web / lien (optionnel)</label><input placeholder="https://…" value={edit.website || ""} onChange={(e) => setEdit({ ...edit, website: e.target.value })} /></div>
          <div className="champ"><label>Description</label><textarea rows={2} value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>

          <div className="champ"><label>Image</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {edit.image_url
                ? <img src={edit.image_url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
                : <div style={{ width: 72, height: 72, borderRadius: 8, background: "#eee", display: "grid", placeItems: "center", fontSize: 11, color: "#999" }}>—</div>}
              <input ref={fileRef} type="file" accept="image/*" onChange={uploadImage} style={{ display: "none" }} />
              <button className="btn btn-ligne" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Envoi…" : (edit.image_url ? "Remplacer" : "Choisir une image")}</button>
              {edit.image_url && <button className="btn btn-mini btn-danger" onClick={() => setEdit({ ...edit, image_url: "" })}>Retirer</button>}
            </div>
            {err && <div className="erreur" style={{ marginTop: 6 }}>{err}</div>}
          </div>

          <label className="ligne-toggle">
            <span className="lib"><b>Mettre en avant</b><span>Épinglé en tête du bloc</span></span>
            <span className="toggle"><input type="checkbox" checked={edit.featured ?? false} onChange={(e) => setEdit({ ...edit, featured: e.target.checked })} /><span className="piste" /></span>
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}><button className="btn btn-accent" onClick={save} disabled={uploading}>{edit.id ? "Enregistrer" : "Ajouter"}</button><button className="btn btn-ligne" onClick={() => setEdit(null)}>Annuler</button></div>
        </div></div>
      </>
    );
  }

  const ordered = [...rows].sort((a, b) => a.position - b.position);

  return (
    <>
      <div className="topbar"><div><h1>Partenaires</h1><div className="sous">Vos producteurs et fournisseurs</div></div></div>
      <div className="contenu">
        <div className="bloc">
          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Afficher le bloc « Partenaires » sur le site</b><span>{enabled ? "Visible" : "Masqué"}</span></span>
            <span className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => toggleBloc(e.target.checked)} /><span className="piste" /></span>
          </label>
        </div>
        <div className="bloc">
          <div className="bloc-tete"><div><h2>Vos partenaires</h2><div className="sous">Glissez-déposez pour réordonner</div></div><button className="btn btn-accent" onClick={() => setEdit({ name: "", description: "", category: "", image_url: "", website: "", location: "", partner_type: "", featured: false, is_active: true })}>+ Ajouter</button></div>
          <table><thead><tr><th style={{ width: 40 }}></th><th style={{ width: 56 }}>Visible</th><th style={{ width: 64 }}>Image</th><th>Nom</th><th>Type</th><th></th></tr></thead><tbody>
            {ordered.length ? ordered.map((p) => (
              <tr key={p.id}
                  draggable
                  onDragStart={() => { dragId.current = p.id; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(p.id)}
                  style={{ cursor: "grab" }}>
                <td className="drag-poignee" aria-hidden="true">⠿</td>
                <td><label className="toggle"><input type="checkbox" checked={p.is_active} onChange={(e) => update(p.id, { is_active: e.target.checked })} /><span className="piste" /></label></td>
                <td>{p.image_url ? <img src={p.image_url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} /> : <span style={{ color: "#bbb" }}>—</span>}</td>
                <td><b>{p.name}</b>{p.featured && <span className="pill-featured" style={{ marginLeft: 6, fontSize: 11 }}>★ En avant</span>}{p.description && <div className="sub-desc">{p.description.slice(0, 70)}</div>}</td>
                <td>{p.partner_type || "—"}</td>
                <td><div className="actions-ligne"><button className="btn btn-mini btn-ligne" onClick={() => setEdit({ ...p })}>Modifier</button><button className="btn btn-mini btn-danger" onClick={() => supprimer(p)}>Supprimer</button></div></td>
              </tr>
            )) : <tr><td colSpan={6} className="vide">Aucun partenaire.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
