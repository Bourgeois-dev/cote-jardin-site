import { useEffect, useState } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase, fetchContent } from "../../lib/supabase";
import type { Review } from "../../lib/types";
import { useConfirm } from "./Confirm";
import Chargement from "./Chargement";

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
  const { rows, loading, insert, update, remove } = useTable<Review>("reviews");
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
        <div className="topbar"><div><h1>{edit.id ? "Modifier l'avis" : "Nouvel avis"}</h1><div className="sous">{edit.id ? `Avis de ${edit.author}` : "Recopiez un avis reçu sur Google, TripAdvisor ou en salle"}</div></div>
          <button className="btn btn-ligne" onClick={() => setEdit(null)}>← Retour à la liste</button></div>
        <div className="contenu"><div className="bloc"><div className="form-duo">
          <div>
            <div className="grid2">
              <div className="champ"><label>Nom de l'auteur *</label><input value={edit.author} onChange={(e) => setEdit({ ...edit, author: e.target.value })} placeholder="Camille R." /><span className="aide">Tel qu'il apparaît sur l'avis d'origine — prénom et initiale suffisent.</span></div>
              <div className="champ"><label>Note</label><div style={{ paddingTop: 4 }}><Stars n={edit.rating || 5} onPick={(v) => setEdit({ ...edit, rating: v })} /></div></div>
            </div>
            <div className="champ"><label>Avis *</label>
              <textarea className="ta-confort" rows={9} value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} placeholder="Le texte de l'avis, tel qu'il a été écrit…" />
              <span className="aide">Le carrousel du site affiche l'avis en entier — inutile de le raccourcir.</span>
            </div>
            <div className="form-pied">
              <button className="btn btn-ligne" onClick={() => setEdit(null)}>Annuler</button>
              <button className="btn btn-accent" onClick={save}>{edit.id ? "Enregistrer" : "Ajouter l'avis"}</button>
            </div>
          </div>
          {/* Aperçu en direct — le patron de l'Ardoise et de la Bannière promo :
              on voit la carte se construire pendant qu'on tape. */}
          <div className="apercu-col">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Aperçu de la carte</div>
            <div className="adm-pa-carte adm-avis-carte" style={{ cursor: "default" }}>
              <div className="adm-avis-tete">
                <b>{edit.author || "Nom de l'auteur"}</b>
                <Stars n={edit.rating || 5} />
              </div>
              <blockquote className="adm-avis-texte" style={{ WebkitLineClamp: "unset" }}>{edit.content || "Le texte de l'avis apparaîtra ici…"}</blockquote>
            </div>
            <div className="apercu-note">Mise à jour en direct</div>
          </div>
        </div></div></div>
      </>
    );
  }

  return (
    <>
      <div className="topbar"><div><h1>Avis clients</h1><div className="sous">Carrousel affiché avant la newsletter</div></div></div>
      <div className="contenu">
        {loading && rows.length === 0 && <Chargement />}
        <div className="bloc">
          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Afficher le bloc « Avis clients » sur le site</b><span>{enabled ? `Visible — ${rows.filter((r) => r.is_active).length} avis` : "Masqué"}</span></span>
            <span className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => toggleBloc(e.target.checked)} /><span className="piste" /></span>
          </label>
        </div>
        <div className="bloc">
          <div className="bloc-tete"><div><h2>Vos avis</h2></div></div>
          {/* Un avis est une citation : la carte la montre presque entière
              (six lignes) au lieu de la tronquer à 90 caractères — c'est le
              texte qu'on vient relire ici, pas une métadonnée. */}
          <div className="adm-pa-grille adm-avis-grille">
            {rows.map((r) => (
              <div className={`adm-pa-carte adm-avis-carte${r.is_active ? "" : " adm-pa-masque"}`} key={r.id}>
                <div className="adm-avis-tete">
                  <b>{r.author}</b>
                  <Stars n={r.rating} />
                </div>
                <blockquote className="adm-avis-texte">{r.content}</blockquote>
                <div className="ga-actions">
                  <label className="toggle" title={r.is_active ? "Visible sur le site" : "Masqué"}><input type="checkbox" checked={r.is_active} onChange={(e) => update(r.id, { is_active: e.target.checked })} /><span className="piste" /></label>
                  <button className="btn btn-mini btn-ligne" onClick={() => setEdit({ ...r })}>Modifier</button>
                  <button className="carte-icone danger" onClick={() => supprimer(r)} title="Supprimer cet avis" aria-label={`Supprimer l'avis de ${r.author}`}>✕</button>
                </div>
              </div>
            ))}
            <button type="button" className="ga-ajout" onClick={() => setEdit({ author: "", rating: 5, content: "", is_active: true })}>
              <b>+ Ajouter un avis</b>
              <span>Recopié d'un avis Google, TripAdvisor…</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
