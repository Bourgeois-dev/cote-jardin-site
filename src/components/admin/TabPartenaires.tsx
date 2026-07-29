import { useState, useEffect, useRef } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, fetchContent, messageUpload } from "../../lib/supabase";
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
    if (error) { setErr(messageUpload(error)); setUploading(false); return; }
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
        {/* Retour visible en topbar : « Annuler » tout en bas était la seule
            sortie d'un écran qui remplace la liste entière. */}
        <div className="topbar"><div><h1>{edit.id ? "Modifier le partenaire" : "Nouveau partenaire"}</h1><div className="sous">{edit.id ? edit.name : "Producteur, fournisseur ou artisan mis à l'honneur sur le site"}</div></div>
          <button className="btn btn-ligne" onClick={() => setEdit(null)}>← Retour à la liste</button></div>
        <div className="contenu"><div className="bloc"><div className="form-duo">
          <div>
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

          {/* Même composant média que l'ardoise et la bannière : vignette +
              actions, ou zone d'appel en pointillés. */}
          <div className="champ"><label>Image</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={uploadImage} style={{ display: "none" }} />
            {edit.image_url ? (
              <div className="media-champ">
                <img className="media-vignette" src={edit.image_url} alt="" />
                <div className="media-actions">
                  <button className="btn btn-mini btn-ligne" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Envoi…" : "Remplacer"}</button>
                  <button className="btn btn-mini btn-danger" onClick={() => setEdit({ ...edit, image_url: "" })}>Retirer</button>
                </div>
              </div>
            ) : (
              <button type="button" className="media-vide" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <b>{uploading ? "Envoi…" : "Choisir une image"}</b>
                <span>Affichée en bandeau sur la carte. Sans image, l'initiale du nom prend le relais.</span>
              </button>
            )}
            {err && <div className="erreur" style={{ marginTop: 6 }}>{err}</div>}
          </div>

          <label className="ligne-toggle">
            <span className="lib"><b>Mettre en avant</b><span>Épinglé en tête du bloc</span></span>
            <span className="toggle"><input type="checkbox" checked={edit.featured ?? false} onChange={(e) => setEdit({ ...edit, featured: e.target.checked })} /><span className="piste" /></span>
          </label>

          <div className="form-pied">
            <button className="btn btn-ligne" onClick={() => setEdit(null)}>Annuler</button>
            <button className="btn btn-accent" onClick={save} disabled={uploading}>{edit.id ? "Enregistrer" : "Ajouter le partenaire"}</button>
          </div>
          </div>
          {/* Aperçu en direct de la carte telle qu'elle apparaîtra dans la
              grille — même patron que l'avis, l'ardoise et la bannière. */}
          <div className="apercu-col">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Aperçu de la carte</div>
            <div className="adm-pa-carte" style={{ cursor: "default" }}>
              <div className="adm-pa-visuel">
                {edit.image_url
                  ? <img src={edit.image_url} alt="" />
                  : <span className="adm-pa-initiale" aria-hidden="true">{(edit.name || "?").trim().charAt(0).toUpperCase()}</span>}
                {edit.featured && <span className="ga-badge adm-pa-avant">★ En avant</span>}
              </div>
              <div className="adm-pa-corps" style={{ paddingBottom: 12 }}>
                <div className="adm-pa-nom"><b>{edit.name || "Nom du partenaire"}</b>{edit.partner_type && <span className="tag t-neutre">{edit.partner_type}</span>}</div>
                {edit.description && <div className="sub-desc adm-pa-desc">{edit.description}</div>}
                {(edit.category || edit.location) && <div className="sub-desc" style={{ marginTop: 4 }}>{[edit.category, edit.location].filter(Boolean).join(" · ")}</div>}
              </div>
            </div>
            <div className="apercu-note">Mise à jour en direct</div>
          </div>
        </div></div></div>
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
          <div className="bloc-tete"><div><h2>Vos partenaires</h2><div className="sous">Glissez-déposez pour réordonner</div></div></div>
          {/* Cartes plutôt que tableau : chaque partenaire est un petit
              portrait — image, nom, type — pas une ligne de données. Le badge
              numéroté rend l'ordre du site visible, comme dans la Galerie. */}
          <div className="adm-pa-grille">
            {ordered.map((p, i) => (
              <div className={`adm-pa-carte${p.is_active ? "" : " adm-pa-masque"}`} key={p.id}
                  draggable
                  onDragStart={() => { dragId.current = p.id; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(p.id)}>
                <div className="adm-pa-visuel">
                  {p.image_url
                    ? <img src={p.image_url} alt="" />
                    : <span className="adm-pa-initiale" aria-hidden="true">{(p.name || "?").trim().charAt(0).toUpperCase()}</span>}
                  <span className="ga-num">{i + 1}</span>
                  {p.featured && <span className="ga-badge adm-pa-avant">★ En avant</span>}
                  {!p.is_active && <span className="ga-badge">Masqué</span>}
                </div>
                <div className="adm-pa-corps">
                  <div className="adm-pa-nom"><b>{p.name}</b>{p.partner_type && <span className="tag t-neutre">{p.partner_type}</span>}</div>
                  {p.description && <div className="sub-desc adm-pa-desc">{p.description}</div>}
                </div>
                <div className="ga-actions">
                  <label className="toggle" title={p.is_active ? "Visible sur le site" : "Masqué"}><input type="checkbox" checked={p.is_active} onChange={(e) => update(p.id, { is_active: e.target.checked })} /><span className="piste" /></label>
                  <button className="btn btn-mini btn-ligne" onClick={() => setEdit({ ...p })}>Modifier</button>
                  <button className="carte-icone danger" onClick={() => supprimer(p)} title="Supprimer ce partenaire" aria-label={`Supprimer ${p.name}`}>✕</button>
                </div>
              </div>
            ))}
            <button type="button" className="ga-ajout" onClick={() => setEdit({ name: "", description: "", category: "", image_url: "", website: "", location: "", partner_type: "", featured: false, is_active: true })}>
              <b>+ Ajouter</b>
              <span>Producteur, fournisseur, artisan…</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
