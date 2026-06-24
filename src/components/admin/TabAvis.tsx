import { useEffect, useState } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, fetchContent } from "../../lib/supabase";
import type { Review } from "../../lib/types";
import { useConfirm } from "./Confirm";

function Stars({ n, onPick }: { n: number; onPick?: (v: number) => void }) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} onClick={onPick ? () => onPick(i) : undefined} viewBox="0 0 24 24" width={onPick ? 26 : 14} height={onPick ? 26 : 14}
          fill={i <= n ? "var(--admin-accent)" : "none"} stroke="var(--admin-accent)" strokeWidth="1.5"
          style={{ display: "inline-block", verticalAlign: "middle", cursor: onPick ? "pointer" : "default" }}>
          <path d="M12 2l2.9 6.3 6.8.8-5 4.6 1.3 6.7L12 17.8 5.9 20.4 7.2 13.7l-5-4.6 6.8-.8z" />
        </svg>
      ))}
    </span>
  );
}

export default function TabAvis() {
  const confirm = useConfirm();
  const { rows, insert, update, remove } = useTable<Review>("reviews");
  async function supprimer(r: Review) {
    if (await confirm({ titre: "Supprimer cet avis ?", message: `L'avis de ${r.author} sera retiré du site.`, confirmer: "Supprimer", danger: true })) remove(r.id);
  }
  const [edit, setEdit] = useState<Partial<Review> | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => { fetchContent("reviews_enabled").then((c) => setEnabled(c?.enabled ?? true)); }, []);

  async function toggleBloc(v: boolean) { setEnabled(v); await supabase.from("site_content").upsert({ section_key: "reviews_enabled", content: { enabled: v } }, { onConflict: "section_key" }); }
  async function save() {
    if (!edit?.author?.trim() || !edit?.content?.trim()) return;
    const vals = { author: edit.author, rating: edit.rating || 5, content: edit.content };
    if (edit.id) await update(edit.id, vals); else await insert({ ...vals, position: 99, is_active: true });
    setEdit(null);
  }

  if (edit) {
    return (
      <>
        <div className="topbar"><div><h1>{edit.id ? "Modifier l'avis" : "Nouvel avis"}</h1></div></div>
        <div className="contenu"><div className="bloc">
          <div className="grid2">
            <div className="champ"><label>Nom de l'auteur *</label><input value={edit.author} onChange={(e) => setEdit({ ...edit, author: e.target.value })} placeholder="Camille R." /></div>
            <div className="champ"><label>Note</label><div style={{ paddingTop: 4 }}><Stars n={edit.rating || 5} onPick={(v) => setEdit({ ...edit, rating: v })} /></div></div>
          </div>
          <div className="champ"><label>Avis *</label><textarea rows={4} value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}><button className="btn btn-accent" onClick={save}>{edit.id ? "Enregistrer" : "Ajouter"}</button><button className="btn btn-ligne" onClick={() => setEdit(null)}>Annuler</button></div>
        </div></div>
      </>
    );
  }

  return (
    <>
      <div className="topbar"><div><h1>Avis clients</h1><div className="sous">Carrousel affiché avant la newsletter</div></div></div>
      <div className="contenu">
        <div className="bloc">
          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Afficher le bloc « Avis clients » sur le site</b><span>{enabled ? `Visible — ${rows.filter((r) => r.is_active).length} avis` : "Masqué"}</span></span>
            <span className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => toggleBloc(e.target.checked)} /><span className="piste" /></span>
          </label>
        </div>
        <div className="bloc">
          <div className="bloc-tete"><div><h2>Vos avis</h2></div><button className="btn btn-accent" onClick={() => setEdit({ author: "", rating: 5, content: "", is_active: true })}>+ Ajouter un avis</button></div>
          <table><thead><tr><th style={{ width: 56 }}>Visible</th><th>Auteur &amp; note</th><th>Avis</th><th></th></tr></thead><tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id}>
                <td><label className="toggle"><input type="checkbox" checked={r.is_active} onChange={(e) => update(r.id, { is_active: e.target.checked })} /><span className="piste" /></label></td>
                <td><b>{r.author}</b><br /><Stars n={r.rating} /></td>
                <td className="sub-desc">{r.content.slice(0, 90)}{r.content.length > 90 ? "…" : ""}</td>
                <td><div className="actions-ligne"><button className="btn btn-mini btn-ligne" onClick={() => setEdit({ ...r })}>Modifier</button><button className="btn btn-mini btn-danger" onClick={() => supprimer(r)}>Supprimer</button></div></td>
              </tr>
            )) : <tr><td colSpan={4} className="vide">Aucun avis.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
