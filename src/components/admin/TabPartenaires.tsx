import { useState } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, fetchContent } from "../../lib/supabase";
import { useEffect } from "react";
import type { Partner } from "../../lib/types";
import { useConfirm } from "./Confirm";

export default function TabPartenaires() {
  const confirm = useConfirm();
  const { rows, insert, update, remove } = useTable<Partner>("partners");
  async function supprimer(p: Partner) {
    if (await confirm({ titre: "Supprimer ce partenaire ?", message: `« ${p.name} » sera retiré du site.`, confirmer: "Supprimer", danger: true })) remove(p.id);
  }
  const [edit, setEdit] = useState<Partial<Partner> | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => { fetchContent("partners_enabled").then((c) => setEnabled(c?.enabled ?? true)); }, []);
  async function toggleBloc(v: boolean) { setEnabled(v); await supabase.from("site_content").upsert({ section_key: "partners_enabled", content: { enabled: v } }, { onConflict: "section_key" }); }

  async function save() {
    if (!edit?.name?.trim()) return;
    const vals = { name: edit.name, description: edit.description || "", category: edit.category || "", logo_url: edit.logo_url || "" };
    if (edit.id) await update(edit.id, vals); else await insert({ ...vals, position: 99, is_active: true });
    setEdit(null);
  }

  if (edit) {
    return (
      <>
        <div className="topbar"><div><h1>{edit.id ? "Modifier le partenaire" : "Nouveau partenaire"}</h1></div></div>
        <div className="contenu"><div className="bloc">
          <div className="grid2">
            <div className="champ"><label>Nom *</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="champ"><label>Catégorie (ex. Fruits &amp; légumes)</label><input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></div>
          </div>
          <div className="champ"><label>Description</label><textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}><button className="btn btn-accent" onClick={save}>{edit.id ? "Enregistrer" : "Ajouter"}</button><button className="btn btn-ligne" onClick={() => setEdit(null)}>Annuler</button></div>
        </div></div>
      </>
    );
  }

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
          <div className="bloc-tete"><div><h2>Vos partenaires</h2></div><button className="btn btn-accent" onClick={() => setEdit({ name: "", description: "", category: "", is_active: true })}>+ Ajouter</button></div>
          <table><thead><tr><th style={{ width: 56 }}>Visible</th><th>Nom</th><th>Catégorie</th><th></th></tr></thead><tbody>
            {rows.length ? rows.map((p) => (
              <tr key={p.id}>
                <td><label className="toggle"><input type="checkbox" checked={p.is_active} onChange={(e) => update(p.id, { is_active: e.target.checked })} /><span className="piste" /></label></td>
                <td><b>{p.name}</b>{p.description && <div className="sub-desc">{p.description.slice(0, 70)}</div>}</td>
                <td>{p.category || "—"}</td>
                <td><div className="actions-ligne"><button className="btn btn-mini btn-ligne" onClick={() => setEdit({ ...p })}>Modifier</button><button className="btn btn-mini btn-danger" onClick={() => supprimer(p)}>Supprimer</button></div></td>
              </tr>
            )) : <tr><td colSpan={4} className="vide">Aucun partenaire.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
