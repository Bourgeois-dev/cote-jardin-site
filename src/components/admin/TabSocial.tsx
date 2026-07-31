import { useState } from "react";
import { useTable } from "../../hooks/useTable";
import type { SocialLink } from "../../lib/types";
import Chargement from "./Chargement";
import { useToast } from "./Toast";
import { SOCIAL_SVG } from "../site/socialIcons";

// Les clés correspondent à celles de SOCIAL_SVG (composant du site) : le picto
// affiché ici est EXACTEMENT celui que verra le visiteur dans le footer.
const PLATEFORMES = [
  { key: "instagram", label: "Instagram", ph: "https://instagram.com/votre-compte" },
  { key: "facebook", label: "Facebook", ph: "https://facebook.com/votre-page" },
  { key: "tiktok", label: "TikTok", ph: "https://tiktok.com/@votre-compte" },
  { key: "x", label: "X (Twitter)", ph: "https://x.com/votre-compte" },
  { key: "linkedin", label: "LinkedIn", ph: "https://linkedin.com/company/..." },
  { key: "youtube", label: "YouTube", ph: "https://youtube.com/@votre-chaine" },
  { key: "tripadvisor", label: "Tripadvisor", ph: "https://tripadvisor.fr/Restaurant_Review-..." },
];

// Un réseau activé sans lien valable afficherait dans le footer une icône qui
// ne mène nulle part. On exige donc une URL absolue avant toute activation.
function urlValide(u: string): boolean {
  const v = u.trim();
  if (!v) return false;
  try {
    const p = new URL(v);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

export default function TabSocial() {
  const { rows, loading, insert, update } = useTable<SocialLink>("social_links");
  const toast = useToast();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const byKey: Record<string, SocialLink> = {};
  rows.forEach((r) => { byKey[r.platform] = r; });

  const val = (key: string) => (urls[key] !== undefined ? urls[key] : byKey[key]?.url || "");
  const poserErreur = (key: string, msg: string) => setErreurs((e) => ({ ...e, [key]: msg }));

  // Le champ reste saisissable même réseau éteint : on renseigne un lien
  // d'abord, on publie ensuite. L'inverse obligeait à activer un réseau vide.
  async function basculer(key: string, actif: boolean, pos: number) {
    const u = val(key).trim();
    if (actif && !urlValide(u)) {
      poserErreur(key, "Renseignez d'abord un lien commençant par https://");
      return;
    }
    poserErreur(key, "");
    const existant = byKey[key];
    const ok = existant
      ? await update(existant.id, { is_active: actif, url: u })
      : await insert({ platform: key, url: u, position: pos, is_active: actif });
    if (ok) toast.ok(actif ? "Réseau affiché dans le footer" : "Réseau retiré du footer");
    else toast.err("Échec de l'enregistrement.");
  }

  async function enregistrer() {
    setBusy(true);
    const invalides: string[] = [];
    let modifies = 0;
    for (const [i, p] of PLATEFORMES.entries()) {
      const saisi = urls[p.key];
      if (saisi === undefined) continue;              // champ jamais touché
      const u = saisi.trim();
      if (u && !urlValide(u)) { invalides.push(p.label); continue; }
      const existant = byKey[p.key];
      if (existant) {
        // Vider le lien d'un réseau actif l'éteint : sans ça, le footer
        // garderait une icône pointant vers le vide.
        await update(existant.id, { url: u, ...(u ? {} : { is_active: false }) });
        modifies++;
      } else if (u) {
        // La ligne n'existait pas : avant, la saisie était perdue en silence.
        await insert({ platform: p.key, url: u, position: i, is_active: false });
        modifies++;
      }
    }
    setBusy(false);
    setErreurs({});
    if (invalides.length) toast.err(`Lien invalide : ${invalides.join(", ")}`);
    else if (modifies) toast.ok(modifies > 1 ? "Liens enregistrés" : "Lien enregistré");
    else toast.ok("Aucune modification à enregistrer");
  }

  return (
    <>
      {/* Refonte Vitrine : la grille de cartes devient une liste — une ligne par
          réseau, pastille ronde / nom + état / lien / actions. L'énoncé qui
          servait d'intertitre remonte en sous-titre de page. */}
      <div className="topbar adm-vit"><div><span className="adm-vit-eyebrow">Vitrine</span><h1>Réseaux sociaux</h1><div className="sous">Renseignez un lien, puis activez le réseau : son icône apparaît dans le pied de page du site.</div></div></div>
      <div className="contenu adm-vit">
        {loading && rows.length === 0 && <Chargement />}
        <div className="bloc">
          <div className="rs-grille">
            {PLATEFORMES.map((p, i) => {
              const r = byKey[p.key];
              const actif = r ? r.is_active : false;
              const lien = val(p.key).trim();
              const err = erreurs[p.key];
              return (
                <div className={`rs-carte${actif ? " actif" : ""}`} key={p.key}>
                  <span className="rs-icone" aria-hidden="true">{SOCIAL_SVG[p.key]}</span>
                  <div className="rs-ident">
                    <span className="rs-nom">{p.label}</span>
                    <span className="rs-etat">{actif ? "Affiché" : "Non affiché"}</span>
                  </div>
                  <div className="rs-lien">
                    <input
                      className={err ? "rs-input err" : "rs-input"}
                      value={val(p.key)}
                      placeholder={p.ph}
                      aria-label={`Lien ${p.label}`}
                      onChange={(e) => { setUrls({ ...urls, [p.key]: e.target.value }); if (err) poserErreur(p.key, ""); }}
                    />
                    {/* Le message d'erreur reste sous le champ qu'il concerne. */}
                    {err && <span className="rs-err">{err}</span>}
                  </div>
                  <div className="rs-actions">
                    {/* Vérifier un lien d'un clic vaut mieux que le relire caractère par caractère. */}
                    {urlValide(lien) && <a className="rs-tester" href={lien} target="_blank" rel="noopener noreferrer">Tester ↗</a>}
                    <label className="toggle" title={actif ? "Masquer du footer" : "Afficher dans le footer"}>
                      <input type="checkbox" checked={actif} onChange={(e) => basculer(p.key, e.target.checked, i)} />
                      <span className="piste" />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="form-pied">
            <span className="form-pied-aide">L'interrupteur s'applique aussitôt ; les liens saisis demandent un enregistrement.</span>
            <button className="btn btn-accent" onClick={enregistrer} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les liens"}</button>
          </div>
        </div>
      </div>
    </>
  );
}
