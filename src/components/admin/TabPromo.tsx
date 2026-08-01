import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useTable } from "../../hooks/useTable";
import type { PromoBanner } from "../../lib/types";
import { useToast } from "./Toast";
import { useConfirm } from "./Confirm";
import AssistantBanniere, { type PropositionBanniere } from "./AssistantBanniere";

function formatDate(d: string): string {
  if (!d) return "Événement";
  try { return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return "Événement"; }
}

export default function TabPromo() {
  const toast = useToast();
  const confirm = useConfirm();
  const { rows, loading, insert, update } = useTable<PromoBanner>("promo_banner", "id");
  const promo = rows[0];
  const [f, setF] = useState({ title: "", subtitle: "", cta_label: "", cta_url: "", event_date: "", image_url: "", is_active: false });
  const [busy, setBusy] = useState(false);
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

  // Applique une proposition de l'assistant. Confirmation si du texte existe
  // déjà : on ne remplace jamais le travail du restaurateur sans le lui dire.
  // L'image et le lien du bouton ne sont pas touchés — l'assistant ne fait que
  // du texte, et le lien est un choix technique (ancre, tel:…).
  async function appliquerIa(p: PropositionBanniere) {
    if (f.title.trim() || f.subtitle.trim()) {
      const ok = await confirm({
        titre: "Utiliser ce texte ?",
        message: "Le titre et le sous-titre actuels seront remplacés par la proposition de l'assistant. L'image et le lien du bouton sont conservés.",
        confirmer: "Remplacer",
      });
      if (!ok) return;
    }
    setF((prev) => ({
      ...prev,
      title: p.titre || prev.title,
      subtitle: p.sous_titre || prev.subtitle,
      cta_label: p.cta_label || prev.cta_label,
    }));
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
    toast.ok("Bannière enregistrée");
  }

  if (loading) return <div className="loading">Chargement…</div>;

  return (
    <>
      {/* Refonte Vitrine : toggle en en-tête ; l'usage (événement, menu
          spécial, fermeture) est dit dans le sous-titre — plus de bloc dédié. */}
      <div className="topbar adm-vit"><div><span className="adm-vit-eyebrow">Vitrine</span><h1>Bannière promo</h1><div className="sous">Popup affichée à l'arrivée sur le site quand elle est active — un événement, un menu spécial, une fermeture exceptionnelle.</div></div>
        <label className="adm-vit-visible">
          <span className="lib"><b>Popup active</b><span>{f.is_active ? "Active — la popup s'affiche à l'arrivée" : "Inactive — aucune popup ne s'affiche"}</span></span>
          <span className="toggle"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /><span className="piste" /></span>
        </label>
      </div>
      <div className="contenu adm-vit">
        <div className="bloc">
          <div className="promo-admin-grid">
            <div>
              <AssistantBanniere dateEvent={f.event_date} onProposition={appliquerIa} />

              <h2 style={{ marginBottom: 4 }}>Contenu de la bannière</h2>
              <div className="desc" style={{ marginBottom: 16 }}>Ces informations s'affichent dans la popup.</div>
              <div className="champ"><label>Titre</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Soirée Beaujolais Nouveau" /></div>
              <div className="champ"><label>Sous-titre</label><textarea rows={2} value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} placeholder="Dégustation & planche — places limitées" /></div>
              <div className="grid2">
                <div className="champ"><label>Texte du bouton</label><input value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} placeholder="Réserver ma place" /></div>
                <div className="champ"><label>Lien du bouton</label><input value={f.cta_url} onChange={(e) => setF({ ...f, cta_url: e.target.value })} placeholder="#contact ou tel:+33..." /></div>
              </div>
              {/* Maquette : date et image côte à côte — vignette carrée en
                  pointillés, liens Remplacer / Retirer à sa droite. */}
              <div className="grid2 adm-vit-promo-duo">
                <div className="champ">
                  <label>Date de l'événement · optionnelle</label>
                  <input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} />
                  <span className="aide" style={{ fontSize: 11.5 }}>Sans date, le badge affiche « Événement ».</span>
                </div>
                <div className="champ">
                  <label>Image</label>
                  <input ref={fileRef} type="file" accept="image/*" onChange={uploadImage} style={{ display: "none" }} />
                  <div className="adm-vit-media-mini">
                    {f.image_url ? (
                      <img className="adm-vit-vignette" src={f.image_url} alt="" onClick={() => fileRef.current?.click()} />
                    ) : (
                      <button type="button" className="adm-vit-photo-vide carre" onClick={() => fileRef.current?.click()} disabled={busy}>
                        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-4 4 3 4-4 5 5"/></svg>
                        <b>{busy ? "Envoi…" : "Visuel"}</b>
                        <span>cliquez pour choisir</span>
                      </button>
                    )}
                    <div className="adm-vit-media-liens col">
                      <button className="btn btn-mini btn-ligne" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Envoi…" : "Remplacer"}</button>
                      <button className="adm-vit-lien danger" onClick={() => setF({ ...f, image_url: "" })} disabled={!f.image_url}>Retirer</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-pied">
                <span className="form-pied-aide">La popup n'apparaît que si l'interrupteur ci-dessus est actif.</span>
                <button className="btn btn-accent" onClick={save} disabled={busy}>Enregistrer</button>
              </div>
            </div>

            <div className="apercu-col">
              <div className="eyebrow" style={{ marginBottom: 12 }}>Aperçu sur le site</div>
              <div className={`promo-apercu${f.is_active ? "" : " adm-vit-apercu-inactif"}`}>
                <div className={`promo-entete${f.image_url ? "" : " adm-vit-entete-vide"}`} style={f.image_url ? { backgroundImage: `url(${f.image_url})` } : undefined}>
                  <span className="promo-badge">{formatDate(f.event_date)}</span>
                  <span className="promo-fermer">×</span>
                  {!f.image_url && <span className="adm-vit-apercu-visuel"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-4 4 3 4-4 5 5"/></svg><b>Visuel de la bannière</b></span>}
                </div>
                <div className="promo-corps">
                  {f.title && <h3 className="promo-titre">{f.title}</h3>}
                  {f.subtitle && <p className="promo-sous">{f.subtitle}</p>}
                  {f.cta_label && <span className="btn btn-accent promo-cta">{f.cta_label}</span>}
                </div>
              </div>
              <div className="desc" style={{ textAlign: "center", marginTop: 10, fontStyle: "italic" }}>{f.is_active ? "Mise à jour en direct" : "Aperçu grisé — la popup est inactive."}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
