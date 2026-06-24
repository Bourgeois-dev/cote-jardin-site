import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useTable } from "../../hooks/useTable";
import type { PromoBanner } from "../../lib/types";

function formatDate(d: string): string {
  if (!d) return "Événement";
  try { return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return "Événement"; }
}

export default function TabPromo() {
  const { rows, loading, insert, update } = useTable<PromoBanner>("promo_banner", "id");
  const promo = rows[0];
  const [f, setF] = useState({ title: "", subtitle: "", cta_label: "", cta_url: "", event_date: "", image_url: "", is_active: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (promo) setF({
      title: promo.title || "", subtitle: promo.subtitle || promo.message || "",
      cta_label: promo.cta_label || "", cta_url: promo.cta_url || "",
      event_date: promo.event_date || "", image_url: promo.image_url || "", is_active: promo.is_active,
    });
  }, [promo]);

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const path = `promo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("gallery").upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from("gallery").getPublicUrl(path);
      setF((p) => ({ ...p, image_url: data.publicUrl }));
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function save() {
    setBusy(true);
    const vals = {
      title: f.title, subtitle: f.subtitle, message: f.subtitle,
      cta_label: f.cta_label, cta_url: f.cta_url,
      event_date: f.event_date || null, image_url: f.image_url, is_active: f.is_active,
    };
    if (promo) await update(promo.id, vals); else await insert(vals);
    setBusy(false);
    setMsg("Bannière enregistrée ✓"); setTimeout(() => setMsg(""), 2500);
  }

  if (loading) return <div className="loading">Chargement…</div>;

  return (
    <>
      <div className="topbar"><div><h1>Bannière promo</h1><div className="sous">Popup affichée à l'arrivée sur le site quand elle est active</div></div></div>
      <div className="contenu">
        <div className="bloc">
          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Afficher la popup sur le site</b><span>{f.is_active ? "Active — la popup s'affiche à l'arrivée" : "Inactive — aucune popup ne s'affiche"}</span></span>
            <span className="toggle"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /><span className="piste" /></span>
          </label>
          <div className="hint">💡 Pilote le champ <b>is_active</b> de la table <b>promo_banner</b>. Pratique pour annoncer un événement, un menu spécial ou une fermeture exceptionnelle.</div>
        </div>

        <div className="bloc">
          <div className="promo-admin-grid">
            <div>
              <h2 style={{ marginBottom: 4 }}>Contenu de la bannière</h2>
              <div className="desc" style={{ marginBottom: 16 }}>Ces informations s'affichent dans la popup.</div>
              <div className="champ"><label>Titre</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Soirée Beaujolais Nouveau" /></div>
              <div className="champ"><label>Sous-titre</label><textarea rows={2} value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} placeholder="Dégustation & planche — places limitées" /></div>
              <div className="grid2">
                <div className="champ"><label>Texte du bouton</label><input value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} placeholder="Réserver ma place" /></div>
                <div className="champ"><label>Lien du bouton</label><input value={f.cta_url} onChange={(e) => setF({ ...f, cta_url: e.target.value })} placeholder="#contact ou tel:+33..." /></div>
              </div>
              <div className="grid2">
                <div className="champ"><label>Date de l'événement (optionnel)</label><input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} /></div>
                <div className="champ"><label>Image</label>
                  <input ref={fileRef} type="file" accept="image/*" onChange={uploadImage} style={{ display: "none" }} />
                  <button className="btn btn-ligne" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Envoi…" : (f.image_url ? "Changer l'image" : "🖼 Choisir une image")}</button>
                </div>
              </div>
              <div className="desc">Sans date, le badge affiche simplement « Événement ».</div>
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
                <button className="btn btn-accent" onClick={save} disabled={busy}>Enregistrer</button>
                {msg && <span className="ok-msg">{msg}</span>}
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Aperçu sur le site</div>
              <div className="promo-apercu">
                <div className="promo-entete" style={f.image_url ? { backgroundImage: `url(${f.image_url})` } : undefined}>
                  <span className="promo-badge">{formatDate(f.event_date)}</span>
                  <span className="promo-fermer">×</span>
                </div>
                <div className="promo-corps">
                  {f.title && <h3 className="promo-titre">{f.title}</h3>}
                  {f.subtitle && <p className="promo-sous">{f.subtitle}</p>}
                  {f.cta_label && <span className="btn btn-accent promo-cta">{f.cta_label}</span>}
                </div>
              </div>
              <div className="desc" style={{ textAlign: "center", marginTop: 10 }}>Mise à jour en direct</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
