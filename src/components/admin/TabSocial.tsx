import { useState } from "react";
import { useTable } from "../../hooks/useTable";
import type { SocialLink } from "../../lib/types";

const PLATEFORMES = [
  { key: "instagram", label: "Instagram", ph: "https://instagram.com/votre-compte" },
  { key: "facebook", label: "Facebook", ph: "https://facebook.com/votre-page" },
  { key: "tiktok", label: "TikTok", ph: "https://tiktok.com/@votre-compte" },
  { key: "x", label: "X (Twitter)", ph: "https://x.com/votre-compte" },
  { key: "linkedin", label: "LinkedIn", ph: "https://linkedin.com/company/..." },
  { key: "youtube", label: "YouTube", ph: "https://youtube.com/@votre-chaine" },
  { key: "tripadvisor", label: "Tripadvisor", ph: "https://tripadvisor.fr/Restaurant_Review-..." },
];

export default function TabSocial() {
  const { rows, insert, update } = useTable<SocialLink>("social_links");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const byKey: Record<string, SocialLink> = {};
  rows.forEach((r) => { byKey[r.platform] = r; });

  const val = (key: string) => (urls[key] !== undefined ? urls[key] : byKey[key]?.url || "");

  async function toggle(key: string, actif: boolean, pos: number) {
    const existing = byKey[key];
    if (existing) await update(existing.id, { is_active: actif });
    else if (actif) await insert({ platform: key, url: val(key), position: pos, is_active: true });
  }
  async function saveUrls() {
    for (const p of PLATEFORMES) {
      const existing = byKey[p.key];
      if (existing && urls[p.key] !== undefined) await update(existing.id, { url: urls[p.key] });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      <div className="topbar"><div><h1>Réseaux sociaux</h1><div className="sous">Liens affichés dans le pied de page</div></div></div>
      <div className="contenu"><div className="bloc">
        <div className="bloc-tete"><div><h2>Vos réseaux</h2><div className="desc">Activez un réseau et renseignez son lien. Les icônes actives apparaissent dans le footer.</div></div></div>
        {PLATEFORMES.map((p, i) => {
          const r = byKey[p.key];
          const actif = r ? r.is_active : false;
          return (
            <div className="ligne-toggle" key={p.key}>
              <div className="lib" style={{ flex: ".5" }}><b>{p.label}</b></div>
              <div style={{ flex: 2, margin: "0 14px" }}>
                <input value={val(p.key)} placeholder={p.ph} disabled={!actif} onChange={(e) => setUrls({ ...urls, [p.key]: e.target.value })} style={{ width: "100%" }} />
              </div>
              <label className="toggle"><input type="checkbox" checked={actif} onChange={(e) => toggle(p.key, e.target.checked, i)} /><span className="piste" /></label>
            </div>
          );
        })}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14 }}>
          <button className="btn btn-accent" onClick={saveUrls}>Enregistrer les liens</button>
          {saved && <span style={{ color: "var(--ok)", fontSize: 13, fontWeight: 600 }}>✓ Liens enregistrés</span>}
        </div>
      </div></div>
    </>
  );
}
