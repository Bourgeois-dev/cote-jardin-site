import { useState, useEffect } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, fetchContent } from "../../lib/supabase";
import type { TakeawayItem } from "../../lib/types";
import { useConfirm } from "./Confirm";
import Chargement from "./Chargement";

export default function TabEmporter() {
  const confirm = useConfirm();
  const { rows, loading, insert, update, remove } = useTable<TakeawayItem>("takeaway_items");
  const [edit, setEdit] = useState<Partial<TakeawayItem> | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    fetchContent("takeaway_enabled").then((c) => setEnabled(c?.enabled ?? false));
  }, []);

  async function toggleBloc(v: boolean) {
    setEnabled(v);
    await supabase
      .from("site_content")
      .upsert({ section_key: "takeaway_enabled", content: { enabled: v } }, { onConflict: "section_key" });
  }

  async function supprimer(item: TakeawayItem) {
    if (await confirm({ titre: "Supprimer cet article ?", message: `« ${item.name} » sera retiré du bloc.`, confirmer: "Supprimer", danger: true }))
      remove(item.id);
  }

  async function save() {
    if (!edit?.name?.trim()) return;
    const vals = {
      name: edit.name.trim(),
      description: edit.description || "",
      price: edit.price ?? null,
    };
    if (edit.id) await update(edit.id, vals);
    else await insert({ ...vals, position: rows.length + 1, is_active: true });
    setEdit(null);
  }

  if (edit) {
    return (
      <>
        <div className="topbar">
          <div><h1>{edit.id ? "Modifier l'article" : "Nouvel article"}</h1></div>
        </div>
        <div className="contenu">
        {loading && rows.length === 0 && <Chargement />}<div className="bloc">
          <div className="grid2">
            <div className="champ"><label>Nom *</label>
              <input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Galette complète" />
            </div>
            <div className="champ"><label>Prix (€)</label>
              <input type="number" step="0.50" value={edit.price ?? ""} onChange={(e) => setEdit({ ...edit, price: parseFloat(e.target.value) || undefined })} placeholder="9.50" />
            </div>
          </div>
          <div className="champ"><label>Description</label>
            <textarea rows={2} value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Jambon, œuf, emmental" />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn btn-accent" onClick={save}>{edit.id ? "Enregistrer" : "Ajouter"}</button>
            <button className="btn btn-ligne" onClick={() => setEdit(null)}>Annuler</button>
          </div>
        </div></div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div><h1>Plats à emporter</h1><div className="sous">Articles proposés dans le bloc « À emporter »</div></div>
      </div>
      <div className="contenu">
        <div className="bloc">
          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Afficher le bloc « À emporter » sur le site</b><span>{enabled ? "Visible" : "Masqué"}</span></span>
            <span className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => toggleBloc(e.target.checked)} /><span className="piste" /></span>
          </label>
        </div>
        <div className="bloc">
          <div className="bloc-tete">
            <div><h2>Articles</h2></div>
            <button className="btn btn-accent" onClick={() => setEdit({ name: "", description: "", is_active: true })}>+ Ajouter</button>
          </div>
          <table><thead><tr>
            <th style={{ width: 56 }}>Visible</th>
            <th>Article</th>
            <th style={{ width: 90 }}>Prix</th>
            <th></th>
          </tr></thead><tbody>
            {rows.length ? rows.map((item) => (
              <tr key={item.id}>
                <td><label className="toggle"><input type="checkbox" checked={item.is_active} onChange={(e) => update(item.id, { is_active: e.target.checked })} /><span className="piste" /></label></td>
                <td><b>{item.name}</b>{item.description && <div className="sub-desc">{item.description.slice(0, 70)}</div>}</td>
                <td>{item.price ? `${item.price} €` : "—"}</td>
                <td><div className="actions-ligne">
                  <button className="btn btn-mini btn-ligne" onClick={() => setEdit({ ...item })}>Modifier</button>
                  <button className="btn btn-mini btn-danger" onClick={() => supprimer(item)}>Supprimer</button>
                </div></td>
              </tr>
            )) : <tr><td colSpan={4} className="vide">Aucun article. Cliquez sur « Ajouter » pour commencer.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
