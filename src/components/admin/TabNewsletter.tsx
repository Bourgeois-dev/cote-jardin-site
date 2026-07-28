import { useState, useEffect, useRef } from "react";
import { supabase, messageUpload } from "../../lib/supabase";
import { useConfirm } from "./Confirm";
import { useDirty } from "./Dirty";

// Récupère les en-têtes d'appel aux edge functions AVEC le JWT de session admin.
// send-newsletter vérifie is_admin() sous l'identité de ce token : il FAUT donc
// envoyer le token de session (et non la clé anon, qui n'est pas un admin).
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

// ── Types ───────────────────────────────────────────────────────────────────
interface Campaign {
  id: string;
  template: string;
  segment: string;
  subject: string;
  content: Record<string, string>;
  scheduled_at: string | null;
  sent_at: string | null;
  status: string;
  recipients_count: number | null;
  sent_count: number;
  error_message: string | null;
  created_at: string;
  folder: string | null;
}

// ── Constantes ──────────────────────────────────────────────────────────────
// Welcome n'apparaît pas ici : il est déclenché automatiquement à l'inscription
// (voir Newsletter.tsx côté site), jamais envoyé manuellement depuis l'admin.
// Un seul type de campagne : le restaurateur compose librement avec des blocs.
// (Les anciens templates figés — evenementiel, nouveau_menu, vie_resto — ont été retirés :
//  ils n'étaient que des cas particuliers de ce système. Leur rendu reste dans l'edge
//  function pour que les campagnes archivées restent lisibles.)
const TEMPLATES: Record<string, { label: string; icon: string; desc: string }> = {
  blocs: { label: "Campagne libre", icon: "✍️", desc: "Composez votre message avec des blocs" },
};

// Types de blocs disponibles
type Colonne = { titre?: string; texte?: string; image?: string; image_alt?: string; cta_label?: string; cta_url?: string };
type Bloc =
  | { type: "pleine_largeur"; titre?: string; texte?: string; image?: string; image_alt?: string; cta_label?: string; cta_url?: string }
  | { type: "deux_colonnes"; colonnes: [Colonne, Colonne] };

function blocVide(type: "pleine_largeur" | "deux_colonnes"): Bloc {
  // Lien de réservation pré-rempli : c'est la destination attendue dans la
  // grande majorité des campagnes. Le LIBELLÉ reste vide — sans libellé, aucun
  // bouton n'est rendu dans l'email. Le restaurateur choisit donc d'afficher le
  // bouton en nommant simplement l'action, sans avoir à retrouver l'URL.
  const base = (import.meta.env.VITE_SITE_URL || "").replace(/\/+$/, "");
  const resa = base ? { cta_url: `${base}/#reserver` } : {};
  return type === "deux_colonnes"
    ? { type, colonnes: [{ ...resa }, { ...resa }] }
    : { type, ...resa };
}

// Segments de ciblage. Chacun correspond à une intention distincte : inutile de
// multiplier les tranches d'inactivité, le message de reconquête est le même.
// Toute modification ici doit être répercutée dans newsletter_segment_counts()
// (base) ET dans send-newsletter/index.ts (envoi réel) — les trois doivent
// rester cohérents, sinon le décompte annoncé ne correspond pas aux envois.
const SEGMENTS: Record<string, { label: string; desc: string }> = {
  optin:       { label: "Opt-in newsletter", desc: "Tous les inscrits — via le formulaire newsletter ou l'opt-in proposé à la réservation" },
  optin_vip:   { label: "VIP",               desc: "Inscrits newsletter marqués VIP dans le CRM" },
  habitues:    { label: "Habitués",          desc: "Inscrits venus au moins 3 fois — vos meilleurs clients" },
  une_visite:  { label: "Venus une seule fois", desc: "Ont testé le restaurant mais ne sont jamais revenus" },
  inactif_3_6: { label: "Pas venus depuis 3 à 6 mois", desc: "Absence notable — une relance peut suffire à les faire revenir" },
  inactif_7:   { label: "Pas venus depuis plus de 6 mois", desc: "Reconquête — dernière venue il y a 7 mois ou davantage" },
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Brouillon",  cls: "t-annule" },
  scheduled: { label: "Planifiée", cls: "t-attente" },
  sending:   { label: "En cours",  cls: "t-attente" },
  sent:      { label: "Envoyée",   cls: "t-ok" },
  failed:    { label: "Échec",     cls: "t-annule" },
};

function fmtDatetime(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Canvas de prévisualisation — Événementiel ───────────────────────────────
// Rendu fidèle (au pixel près dans la logique, simplifié en React/CSS pour
// l'écran) du template HTML envoyé par l'edge function send-newsletter.
// Renvoie l'URL de la première image trouvée dans les blocs d'une campagne
// (bloc pleine largeur -> .image ; bloc deux colonnes -> colonnes[].image),
// ou null si aucune. Utilisé pour la vignette d'aperçu sur les cartes.
function premiereImage(content: any): string | null {
  const blocs: any[] = Array.isArray(content?.blocs) ? content.blocs : [];
  for (const b of blocs) {
    if (b?.type === "deux_colonnes") {
      for (const col of (b.colonnes || [])) {
        if (col?.image) return col.image;
      }
    } else if (b?.image) {
      return b.image;
    }
  }
  return null;
}

/* ── Mise en forme d'un bloc : alignement, teintes de la charte, gras ───────
   Les teintes sont enregistrées de façon SYMBOLIQUE ('accent', 'encre'…) et non
   en hexadécimal. L'aperçu les résout en variables CSS du thème du site,
   l'edge function en couleurs réelles (secrets ACCENT_COLOR / ACCENT_DARK).
   Le restaurateur ne peut donc pas sortir de sa propre charte, et une campagne
   archivée suit la charte si celle-ci évolue. */
const TEINTES: { cle: string; label: string; css: string }[] = [
  { cle: "encre",        label: "Encre",        css: "#333333" },
  { cle: "accent",       label: "Accent",       css: "var(--accent, #5a7d4f)" },
  { cle: "accent_fonce", label: "Accent foncé", css: "var(--accent-dark, #41603a)" },
  { cle: "gris",         label: "Gris doux",    css: "#6b6358" },
];
const teinteCss = (v?: string, defaut = "encre") =>
  (TEINTES.find((t) => t.cle === (v || defaut)) || TEINTES[0]).css;

const ALIGNS: { cle: string; label: string; css: "left" | "center" | "right" }[] = [
  { cle: "gauche", label: "Gauche", css: "left" },
  { cle: "centre", label: "Centré", css: "center" },
  { cle: "droite", label: "Droite", css: "right" },
];
const alignCss = (v?: string) => (ALIGNS.find((a) => a.cle === (v || "gauche")) || ALIGNS[0]).css;

// Gras : **texte**. Rendu en fragments React et NON en HTML injecté — le texte
// saisi par le restaurateur n'est jamais interprété comme du balisage.
function fragmentsGras(ligne: string): React.ReactNode[] {
  return ligne.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean).map((m, i) =>
    /^\*\*[^*\n]+\*\*$/.test(m)
      ? <strong key={i}>{m.slice(2, -2)}</strong>
      : <span key={i}>{m}</span>
  );
}

// Couleurs : variables admin par défaut, remplacées par la charte du client
// une fois ACCENT_COLOR/ACCENT_DARK configurés côté secrets (non visibles ici).
// Aperçu unique : rend n'importe quelle composition de blocs.
// Reflète la structure réelle de l'email (600px, logo, blocs, footer).
function BlocsCanvas({ subject, content, restoName, logoUrl }: {
  subject: string; content: any; restoName: string; logoUrl: string;
}) {
  // L'aperçu doit refléter l'email réel : charte du SITE (secret ACCENT_COLOR côté edge),
  // et NON la charte de l'admin (--admin-accent, bordeaux) qui n'apparaît jamais dans un email.
  // Les teintes choisies bloc par bloc sont résolues par teinteCss() ci-dessus.
  const INK = "#333333";
  const blocs: any[] = Array.isArray(content.blocs) ? content.blocs : [];

  const Cta = ({ v }: { v: any }) =>
    v.cta_label ? (
      <div style={{ textAlign: alignCss(v.align), padding: "10px 0 2px" }}>
        <span style={{ display: "inline-block", background: teinteCss(v.cta_couleur, "accent"), color: "#fff", fontSize: 12,
          fontWeight: 700, padding: "9px 22px", borderRadius: 5 }}>{v.cta_label}</span>
      </div>
    ) : null;

  const Corps = ({ v, petit }: { v: any; petit?: boolean }) => (
    <>
      {/* padding 10px autour de l'image en 2 colonnes — reflète l'email réel */}
      {v.image && (
        <div style={{ padding: petit ? 10 : 0 }}>
          <img src={v.image} alt={v.image_alt || v.titre || ""} style={{ width: "100%", display: "block" }} />
        </div>
      )}
      <div style={{ padding: petit ? "12px 14px" : "18px 24px", textAlign: alignCss(v.align) }}>
        {v.titre && <div style={{ fontSize: petit ? 13 : 15, fontWeight: 700, color: teinteCss(v.couleur_titre), marginBottom: 6 }}>{v.titre}</div>}
        {/* Même règle que le rendu email : ligne vide = nouveau paragraphe,
            saut simple = retour à la ligne. L'aperçu doit être fidèle. */}
        {String(v.texte || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/)
          .filter((bloc: string) => bloc.trim())
          .map((bloc: string, i: number) => (
            <div key={i} style={{ fontSize: petit ? 11.5 : 13, lineHeight: 1.6, color: teinteCss(v.couleur_texte), marginBottom: 8 }}>
              {bloc.split("\n").filter((l: string) => l.trim()).map((l: string, j: number, arr: string[]) => (
                <span key={j}>{fragmentsGras(l)}{j < arr.length - 1 && <br />}</span>
              ))}
            </div>
          ))}
        <Cta v={v} />
      </div>
    </>
  );

  return (
    <div className="news-apercu">
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
        color: "var(--ink-soft)", marginBottom: 10, textAlign: "center" }}>
        Aperçu de l'email
      </div>

      <div style={{ marginBottom: 18, maxWidth: 500, margin: "0 auto 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>
          Dans la boîte de réception
        </div>
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {subject || "Objet de l'email"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 3 }}>
            {content.preheader || "Le résumé court apparaîtra ici, juste après l'objet…"}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(80,100,60,.12)", maxWidth: 500, margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: "20px 30px 10px" }} title="Dans l'email, le logo renvoie vers le site">
          {logoUrl
            ? <img src={logoUrl} alt={restoName} style={{ height: 44, maxWidth: 200, objectFit: "contain", margin: "0 auto", display: "block", cursor: "pointer" }} />
            : <span style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "var(--ink)" }}>{restoName || "Votre restaurant"}</span>}
        </div>

        {!blocs.length && (
          <div style={{ padding: "28px 24px", textAlign: "center", fontSize: 12, color: "var(--ink-soft)", fontStyle: "italic" }}>
            Ajoutez un bloc pour voir l'aperçu.
          </div>
        )}

        {blocs.map((b, i) =>
          b?.type === "deux_colonnes" ? (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#eee", margin: "10px 0" }}>
              {[0, 1].map((n) => (
                <div key={n} style={{ background: "#fff" }}><Corps v={b.colonnes?.[n] || {}} petit /></div>
              ))}
            </div>
          ) : (
            <div key={i}><Corps v={b} /></div>
          )
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #E4E2D8", margin: "14px 24px 0" }} />
        <div style={{ textAlign: "center", padding: "16px 24px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{restoName || "Votre restaurant"}</div>
          <div style={{ fontSize: 11, color: "#6b6358", marginTop: 4 }}>Adresse du restaurant</div>
          <div style={{ fontSize: 10, color: "#9a9189", marginTop: 14, lineHeight: 1.6 }}>
            Vous recevez cet e-mail car vous êtes inscrit à notre newsletter.<br />
            <span style={{ textDecoration: "underline" }}>Se désinscrire</span>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Compression d'image côté navigateur (aucune dépendance) ────────────────
// Objectif : que le restaurateur n'ait jamais à compresser lui-même.
// Un email fait 600px de large : au-delà de 1200px (rétina), c'est du poids inutile.
const MAX_IMG = 500 * 1024;        // 500 Ko
const LARGEUR_MAX = 1200;          // px

const ko = (o: number) => `${Math.round(o / 1024)} Ko`;

async function compresserImage(file: File): Promise<{ fichier: File; avant: number; apres: number; compresse: boolean }> {
  const avant = file.size;
  // Déjà léger et pas démesuré : on n'y touche pas (évite de dégrader inutilement).
  if (avant <= MAX_IMG) {
    const dims = await tailleImage(file).catch(() => null);
    if (!dims || dims.w <= LARGEUR_MAX) return { fichier: file, avant, apres: avant, compresse: false };
  }
  // Les formats animés/vectoriels ne passent pas par le canvas sans dégât.
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return { fichier: file, avant, apres: avant, compresse: false };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, LARGEUR_MAX / bitmap.width);
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { fichier: file, avant, apres: avant, compresse: false };
    // Fond blanc : un PNG transparent converti en JPEG aurait un fond noir.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    // Qualité dégressive jusqu'à passer sous la limite.
    for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
      if (!blob) break;
      if (blob.size <= MAX_IMG || q === 0.45) {
        const fichier = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        return { fichier, avant, apres: fichier.size, compresse: true };
      }
    }
  } catch {
    // Navigateur ou fichier récalcitrant : on renvoie l'original, la limite fera foi.
  }
  return { fichier: file, avant, apres: avant, compresse: false };
}

function tailleImage(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image illisible")); };
    img.src = url;
  });
}

/* Champs d'un bloc (ou d'une colonne) : titre, texte, image, CTA.
   Tout est optionnel — le restaurateur ne remplit que ce dont il a besoin. */
// Liens proposés sous le champ « Bouton — lien ».
// Dans une newsletter de restaurant, le bouton renvoie presque toujours vers le
// site : autant éviter au restaurateur de retenir ou recopier les URL.
// `#reserver` ouvre directement le formulaire de réservation (voir Site.tsx).
function liensSuggeres(): { label: string; url: string }[] {
  const base = (import.meta.env.VITE_SITE_URL || "").replace(/\/+$/, "");
  if (!base) return [];
  return [
    { label: "Réserver une table", url: `${base}/#reserver` },
    { label: "Voir la carte",      url: `${base}/#carte` },
    { label: "Plat du jour",       url: `${base}/#jour` },
    { label: "Galerie photos",     url: `${base}/#galerie` },
    { label: "Nous contacter",     url: `${base}/#contact` },
    { label: "Page d'accueil",     url: base },
  ];
}

// Rangée de pastilles pour choisir une teinte de la charte.
function ChoixTeinte({ label, valeur, defaut, onChange }: {
  label: string; valeur?: string; defaut: string; onChange: (cle: string) => void;
}) {
  return (
    <div className="nl-mef-groupe">
      <span className="nl-mef-lab">{label}</span>
      <div className="nl-liens" style={{ marginTop: 0 }}>
        {TEINTES.map((t) => (
          <button key={t.cle} type="button"
            className={`nl-lien${(valeur || defaut) === t.cle ? " actif" : ""}`}
            onClick={() => onChange(t.cle)}>
            <span className="nl-pastille" style={{ background: t.css }} />{t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChampsBloc({ val, onChange, onUpload }: {
  val: {
    titre?: string; texte?: string; image?: string; image_alt?: string;
    cta_label?: string; cta_url?: string;
    align?: string; couleur_titre?: string; couleur_texte?: string; cta_couleur?: string;
  };
  onChange: (champs: Record<string, any>) => void;
  onUpload: (f: File) => Promise<string | null>;
}) {
  // Le bouton « Gras » agit sur la sélection courante du textarea : on garde
  // donc une référence dessus. Le texte reste stocké en clair (**gras**), jamais
  // en HTML — c'est ce qui permet de l'échapper sans risque à l'envoi.
  const refTexte = useRef<HTMLTextAreaElement | null>(null);

  function basculerGras() {
    const ta = refTexte.current;
    if (!ta) return;
    const d = ta.selectionStart, f = ta.selectionEnd, t = ta.value;
    if (d === f) {
      // Rien de sélectionné : on pose les marqueurs et on place le curseur entre.
      onChange({ texte: t.slice(0, d) + "****" + t.slice(f) });
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(d + 2, d + 2); });
      return;
    }
    const sel = t.slice(d, f);
    const deja = /^\*\*[\s\S]+\*\*$/.test(sel);
    const remp = deja ? sel.slice(2, -2) : `**${sel}**`;
    onChange({ texte: t.slice(0, d) + remp + t.slice(f) });
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(d, d + remp.length); });
  }

  return (
    <>
      <div className="champ">
        <label>Image</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {val.image
            ? <img src={val.image} alt="" style={{ width: 56, height: 38, objectFit: "cover", borderRadius: 5 }} />
            : <div style={{ width: 56, height: 38, borderRadius: 5, background: "#eee", display: "grid", placeItems: "center", fontSize: 10, color: "#999" }}>—</div>}
          <label className="btn btn-ligne btn-mini" style={{ cursor: "pointer" }}>
            {val.image ? "Changer" : "Ajouter"}
            <input type="file" accept="image/*" style={{ display: "none" }}
              onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const u = await onUpload(f); if (u) onChange({ image: u }); }} />
          </label>
          {val.image && <button className="btn btn-mini btn-danger" onClick={() => onChange({ image: "", image_alt: "" })}>×</button>}
        </div>
      </div>
      {/* Texte alternatif : seulement si une image est chargée.
          Essentiel en email — de nombreux clients bloquent les images par défaut. */}
      {val.image && (
        <div className="champ">
          <label>Texte alternatif de l'image</label>
          <input value={val.image_alt || ""} onChange={(e) => onChange({ image_alt: e.target.value })} maxLength={125}
            placeholder="Ex. Planche de tapas maison" />
          <span className="aide" style={{ fontSize: 11.5 }}>
            Affiché si l'image ne se charge pas, et lu par les lecteurs d'écran. À défaut, le titre du bloc est utilisé.
          </span>
        </div>
      )}
      <div className="champ">
        <label>Titre</label>
        <input value={val.titre || ""} onChange={(e) => onChange({ titre: e.target.value })} maxLength={120} placeholder="Optionnel" />
      </div>
      <div className="champ">
        <div className="nl-outils">
          <label style={{ margin: 0 }}>Texte</label>
          <button type="button" className="nl-lien nl-gras" onClick={basculerGras}
            title="Mettre la sélection en gras (Ctrl+B)"><b>G</b></button>
        </div>
        <textarea ref={refTexte} rows={4} value={val.texte || ""} onChange={(e) => onChange({ texte: e.target.value })} maxLength={2000}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); basculerGras(); }
          }}
          placeholder={"Votre texte…\n\nUne ligne vide sépare deux paragraphes."} />
        <span className="aide" style={{ fontSize: 11.5 }}>
          Entrée = retour à la ligne · Entrée deux fois = nouveau paragraphe ·
          {" "}<b>**gras**</b> pour mettre un passage en évidence.
        </span>
      </div>

      {/* Mise en forme — alignement et teintes puisées dans la charte du site. */}
      <div className="nl-mef">
        <div className="nl-mef-groupe">
          <span className="nl-mef-lab">Alignement</span>
          <div className="nl-liens" style={{ marginTop: 0 }}>
            {ALIGNS.map((a) => (
              <button key={a.cle} type="button"
                className={`nl-lien${(val.align || "gauche") === a.cle ? " actif" : ""}`}
                onClick={() => onChange({ align: a.cle })}>{a.label}</button>
            ))}
          </div>
        </div>
        <ChoixTeinte label="Couleur du titre" valeur={val.couleur_titre} defaut="encre"
          onChange={(cle) => onChange({ couleur_titre: cle })} />
        <ChoixTeinte label="Couleur du texte" valeur={val.couleur_texte} defaut="encre"
          onChange={(cle) => onChange({ couleur_texte: cle })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className="champ">
          <label>Bouton — libellé</label>
          <input value={val.cta_label || ""} onChange={(e) => onChange({ cta_label: e.target.value })} maxLength={40} placeholder="Ex. Réserver" />
        </div>
        <div className="champ">
          <label>Bouton — lien</label>
          <input value={val.cta_url || ""} onChange={(e) => onChange({ cta_url: e.target.value })} placeholder="https://…" />
          {liensSuggeres().length > 0 && (
            <div className="nl-liens">
              {liensSuggeres().map((l) => (
                <button key={l.url} type="button"
                  className={`nl-lien${val.cta_url === l.url ? " actif" : ""}`}
                  title={l.url}
                  onClick={() => onChange({
                    cta_url: l.url,
                    // Le libellé n'est proposé que s'il est encore vide :
                    // on ne remplace jamais un texte déjà saisi.
                    ...(val.cta_label ? {} : { cta_label: l.label }),
                  })}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Couleur du bouton : proposée seulement s'il y a un bouton à colorer.
          Le libellé passe automatiquement en blanc ou en encre à l'envoi, selon
          la clarté du fond — pas de bouton illisible possible. */}
      {val.cta_label && (
        <div className="nl-mef">
          <ChoixTeinte label="Couleur du bouton" valeur={val.cta_couleur} defaut="accent"
            onChange={(cle) => onChange({ cta_couleur: cle })} />
        </div>
      )}
    </>
  );
}

function NouveauForm({ onSaved, initial }: {
  onSaved: () => void;
  initial?: { id?: string; template: string; segment: string; subject: string; content: Record<string, string> };
}) {
  const dirty = useDirty();
  // Éditeur ouvert = travail en cours : protège contre la perte (changement
  // d'onglet, fermeture navigateur). Nettoyé au démontage (sauvegarde ou sortie).
  useEffect(() => { dirty.set(true); return () => dirty.set(false); }, []); // eslint-disable-line
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [template] = useState(initial?.template || "blocs");
  const [segment, setSegment] = useState(initial?.segment || "optin");
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  // Nombre de destinataires par segment (RPC : même logique que l'envoi réel)
  useEffect(() => {
    supabase.rpc("newsletter_segment_counts").then(({ data }) => {
      if (data) setCounts(data as Record<string, number>);
    });
  }, []);
  const [subject, setSubject] = useState(initial?.subject || "");
  const [content, setContent] = useState<Record<string, any>>(initial?.content || {});

  // ── Blocs de la campagne ────────────────────────────────────────────────
  const blocs: Bloc[] = Array.isArray(content.blocs) ? content.blocs : [];
  const setBlocs = (b: Bloc[]) => setContent((c: any) => ({ ...c, blocs: b }));

  function ajouterBloc(type: "pleine_largeur" | "deux_colonnes") {
    setBlocs([...blocs, blocVide(type)]);
    setManqueEtape1("");
  }
  function supprimerBloc(i: number) {
    setBlocs(blocs.filter((_, n) => n !== i));
  }
  // Copie profonde : sans elle, les deux blocs partageraient le même tableau
  // `colonnes` et se modifieraient l'un l'autre.
  function dupliquerBloc(i: number) {
    const copie = JSON.parse(JSON.stringify(blocs[i]));
    setBlocs([...blocs.slice(0, i + 1), copie, ...blocs.slice(i + 1)]);
  }
  function deplacerBloc(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocs.length) return;
    const copie = [...blocs];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    setBlocs(copie);
  }
  function majBloc(i: number, champs: Record<string, any>) {
    setBlocs(blocs.map((b, n) => n === i ? { ...b, ...champs } as Bloc : b));
  }
  function majColonne(i: number, col: 0 | 1, champs: Record<string, any>) {
    setBlocs(blocs.map((b, n) => {
      if (n !== i || b.type !== "deux_colonnes") return b;
      const colonnes = [...b.colonnes] as [Colonne, Colonne];
      colonnes[col] = { ...colonnes[col], ...champs };
      return { ...b, colonnes };
    }));
  }
  const [upLoad, setUpLoad] = useState(false);
  const [upErr, setUpErr] = useState("");
  const [upInfo, setUpInfo] = useState("");  // retour positif : image optimisée
  const [manqueEtape1, setManqueEtape1] = useState("");  // ce qui bloque le passage à l'étape 2
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [sendNow, setSendNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  // Envoi de test : adresse cible + retour utilisateur
  // campId mémorise la campagne créée lors d'un 1er test, pour qu'un 2e test
  // la mette à jour au lieu de créer un doublon.
  const [campId, setCampId] = useState<string | undefined>(initial?.id);
  const [testEmail, setTestEmail] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [testBusy, setTestBusy] = useState(false);

  const restoName = import.meta.env.VITE_RESTO_NAME || "";
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    supabase.from("site_content").select("content").eq("section_key", "newsletter_logo").maybeSingle()
      .then(({ data }) => { if (data?.content?.url) setLogoUrl(data.content.url); });
  }, []);

  async function uploadImage(file: File): Promise<string | null> {
    setUpErr(""); setUpInfo("");
    if (!file.type.startsWith("image/")) { setUpErr("Choisissez une image (JPG ou PNG)."); return null; }
    // Garde-fou : au-delà, même la compression ne sauverait pas (et le canvas ramerait).
    if (file.size > 15 * 1024 * 1024) { setUpErr("Image trop lourde (max 15 Mo)."); return null; }

    setUpLoad(true);
    // Compression automatique : le restaurateur n'a pas à s'en occuper.
    const { fichier, avant, apres, compresse } = await compresserImage(file);
    if (fichier.size > MAX_IMG) {
      setUpErr(`Image encore trop lourde après compression (${ko(fichier.size)}, max ${ko(MAX_IMG)}). Essayez une image moins détaillée.`);
      setUpLoad(false);
      return null;
    }

    const ext = fichier.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "img");
    const path = `newsletter-${Date.now()}-${file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
    const { error } = await supabase.storage.from("gallery").upload(path, fichier);
    if (error) { setUpErr(messageUpload(error)); setUpLoad(false); return null; }
    const { data } = supabase.storage.from("gallery").getPublicUrl(path);
    setUpLoad(false);
    if (compresse) setUpInfo(`Image optimisée : ${ko(avant)} → ${ko(apres)}.`);
    else setUpInfo("");
    return data.publicUrl;
  }


  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpErr("");
    if (!file.type.startsWith("image/")) { setUpErr("Choisissez une image (JPG ou PNG)."); return; }
    if (file.size > 5 * 1024 * 1024) { setUpErr("Logo trop lourd (max 5 Mo)."); return; }
    setUpLoad(true);
    const path = `newsletter-logo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("gallery").upload(path, file);
    if (error) { setUpErr(messageUpload(error)); setUpLoad(false); return; }
    const { data } = supabase.storage.from("gallery").getPublicUrl(path);
    await supabase.from("site_content").upsert({ section_key: "newsletter_logo", content: { url: data.publicUrl } }, { onConflict: "section_key" });
    setLogoUrl(data.publicUrl);
    setUpLoad(false);
  }

  // Validation de l'étape 1 : voir le message explicite au clic sur « Suivant ».
  const canSend  = sendNow || !!scheduledDate;

  async function sauvegarder(lancer: boolean) {
    if (!template || !subject) return;
    setBusy(true); setErreur("");

    let scheduled_at: string | null = null;
    if (sendNow) {
      scheduled_at = new Date().toISOString();
    } else if (scheduledDate) {
      scheduled_at = new Date(`${scheduledDate}T${scheduledTime || "09:00"}:00`).toISOString();
    }

    const finalContent = content;

    let camp: Campaign | null = null;
    let error: unknown = null;
    if (initial?.id) {
      // Reprise d'un brouillon existant : mise à jour de la ligne
      const res = await supabase
        .from("newsletter_campaigns")
        .update({ template, segment, subject, content: finalContent, scheduled_at, status: scheduled_at ? "scheduled" : "draft" })
        .eq("id", initial.id)
        .select()
        .single();
      camp = res.data; error = res.error;
    } else {
      const res = await supabase
        .from("newsletter_campaigns")
        .insert({ template, segment, subject, content: finalContent, scheduled_at, status: scheduled_at ? "scheduled" : "draft" })
        .select()
        .single();
      camp = res.data; error = res.error;
    }

    if (error || !camp) { setBusy(false); setErreur("Erreur lors de la création."); return; }

    // Envoi immédiat
    if (sendNow && lancer) {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`;
      await fetch(url, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ campaign_id: camp.id }),
      });
    }

    setBusy(false);
    onSaved();
  }

  // Envoi d'un test à une adresse précise.
  // La campagne est d'abord sauvegardée en brouillon (il faut un campaign_id),
  // puis l'edge l'envoie en mode test : aucun effet de bord (statut inchangé,
  // pas de comptabilisation dans les stats).
  async function envoyerTest() {
    const email = testEmail.trim();
    if (!email) { setTestMsg("Indiquez une adresse e-mail."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setTestMsg("Adresse e-mail invalide."); return; }
    if (!subject.trim() || !blocs.length) { setTestMsg("Un objet et au moins un bloc sont nécessaires."); return; }

    setTestBusy(true); setTestMsg("");
    try {
      // 1. Sauvegarder (création ou mise à jour) pour disposer d'un campaign_id
      let id = campId;
      if (id) {
        await supabase.from("newsletter_campaigns")
          .update({ template, segment, subject, content })
          .eq("id", id);
      } else {
        const { data, error } = await supabase.from("newsletter_campaigns")
          .insert({ template, segment, subject, content, status: "draft" })
          .select("id").single();
        if (error || !data) { setTestMsg("Impossible de sauvegarder la campagne."); setTestBusy(false); return; }
        id = data.id;
        setCampId(id);
      }

      // 2. Envoyer le test
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`;
      const res = await fetch(url, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ campaign_id: id, override_email: email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setTestMsg(`Échec de l'envoi : ${json.error || res.status}`);
      } else {
        setTestMsg(`Test envoyé à ${email}.`);
      }
    } catch (e) {
      setTestMsg("Erreur réseau lors de l'envoi du test.");
    }
    setTestBusy(false);
  }

  return (
    <div className="bloc" style={{ marginBottom: 28 }}>
      <div className="bloc-tete">
        <h2>Nouvelle campagne</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {([1,2,3] as const).map((n) => (
            <span key={n} style={{ width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
              background: step >= n ? "var(--admin-accent)" : "var(--line)", color: step >= n ? "#fff" : "var(--ink-soft)" }}>{n}</span>
          ))}
        </div>
      </div>

      {/* Étape 1 : Composition libre par blocs */}
      {step === 1 && (
        <div className="news-editor-grid">
          <div>
            <p className="desc">Composez votre campagne avec des blocs. Aucun format imposé : ajoutez, réordonnez, supprimez.</p>

            {/* Logo (une fois pour toutes les campagnes) */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--cream)",
              border: "1px solid var(--line)", borderRadius: 10, padding: "12px 16px", marginBottom: 18 }}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" style={{ height: 36, maxWidth: 120, objectFit: "contain" }} />
                : <span style={{ fontSize: 13, color: "var(--ink-soft)", fontStyle: "italic" }}>Aucun logo défini</span>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Logo des newsletters</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Utilisé sur toutes les campagnes — à définir une seule fois.</div>
              </div>
              <label className="btn btn-ligne btn-mini" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: upLoad ? "default" : "pointer", opacity: upLoad ? .6 : 1, whiteSpace: "nowrap" }}>
                📷 {logoUrl ? "Changer" : "Ajouter"}
                <input type="file" accept="image/*" onChange={uploadLogo} disabled={upLoad} style={{ display: "none" }} />
              </label>
            </div>

            <div className="champ">
              <label>Objet de l'email <span style={{ color: "var(--admin-accent)" }}>*</span></label>
              <input value={subject} onChange={(e) => { setSubject(e.target.value); if (manqueEtape1) setManqueEtape1(""); }} placeholder="Ex. Notre nouvelle carte d'été est là 🌿" maxLength={150} />
            </div>
            <div className="champ">
              <label>Aperçu (preheader)</label>
              <input value={content.preheader || ""} onChange={(e) => setContent({ ...content, preheader: e.target.value })}
                placeholder="Le texte gris affiché après l'objet dans la boîte de réception" maxLength={150} />
            </div>

            {/* ── Éditeur de blocs ── */}
            <div style={{ marginTop: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <b style={{ fontSize: 14, color: "var(--ink)" }}>Contenu ({blocs.length} bloc{blocs.length > 1 ? "s" : ""})</b>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ligne btn-mini" onClick={() => ajouterBloc("pleine_largeur")}>+ Pleine largeur</button>
                  <button className="btn btn-ligne btn-mini" onClick={() => ajouterBloc("deux_colonnes")}>+ 2 colonnes</button>
                </div>
              </div>

              {!blocs.length && (
                <div className="vide" style={{ padding: "24px 0" }}>
                  Aucun bloc. Ajoutez-en un pour commencer votre campagne.
                </div>
              )}

              {blocs.map((b, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 12, background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <b style={{ fontSize: 13, color: "var(--ink)" }}>
                      {b.type === "deux_colonnes" ? "▭▭ Deux colonnes" : "▬ Pleine largeur"}
                    </b>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      <button className="btn btn-mini btn-ligne" onClick={() => deplacerBloc(i, -1)} disabled={i === 0} title="Monter">▲</button>
                      <button className="btn btn-mini btn-ligne" onClick={() => deplacerBloc(i, 1)} disabled={i === blocs.length - 1} title="Descendre">▼</button>
                      <button className="btn btn-mini btn-ligne" onClick={() => dupliquerBloc(i)} title="Dupliquer ce bloc">⧉</button>
                      <button className="btn btn-mini btn-danger" onClick={() => supprimerBloc(i)} title="Supprimer">×</button>
                    </span>
                  </div>

                  {b.type === "pleine_largeur" ? (
                    // Même habillage que les colonnes (fond crème, coins arrondis) :
                    // les deux types de blocs se lisent ainsi de la même façon.
                    <div style={{ background: "var(--cream)", borderRadius: 8, padding: 10 }}>
                      <ChampsBloc
                        val={b}
                        onChange={(champs) => majBloc(i, champs)}
                        onUpload={uploadImage}
                      />
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[0, 1].map((n) => (
                        <div key={n} style={{ background: "var(--cream)", borderRadius: 8, padding: 10 }}>
                          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-soft)", marginBottom: 8 }}>
                            Colonne {n + 1}
                          </div>
                          <ChampsBloc
                            val={b.colonnes[n as 0 | 1]}
                            onChange={(champs) => majColonne(i, n as 0 | 1, champs)}
                            onUpload={uploadImage}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {upErr && <div className="err-inline" style={{ marginTop: 10 }}>{upErr}</div>}
            {!upErr && upInfo && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ok, #3E7D5A)" }}>{upInfo}</div>
            )}

            {/* Le bouton reste actif : un bouton grisé sans explication est une impasse.
                Au clic, on dit précisément ce qui manque. */}
            {manqueEtape1 && (
              <div className="err-inline" style={{ marginTop: 16 }}>{manqueEtape1}</div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-accent" onClick={() => {
                if (!subject.trim()) { setManqueEtape1("Indiquez l'objet de l'email avant de continuer."); return; }
                if (!blocs.length)   { setManqueEtape1("Ajoutez au moins un bloc de contenu avant de continuer."); return; }
                setManqueEtape1("");
                setStep(2);
              }}>
                Suivant →
              </button>
            </div>
          </div>

          <div>
            <BlocsCanvas subject={subject} content={content} restoName={restoName} logoUrl={logoUrl} />
          </div>
        </div>
      )}

      {/* Étape 2 : Segment */}
      {step === 2 && (
        <div>
          <p className="desc">À qui envoyer cette campagne ?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {Object.entries(SEGMENTS).map(([key, s]) => (
              <button key={key} onClick={() => setSegment(key)} style={{
                padding: "12px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "var(--font-body)",
                border: segment === key ? "2px solid var(--admin-accent)" : "1px solid var(--line)",
                background: segment === key ? "var(--a06)" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-soft)", marginLeft: 10 }}>{s.desc}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <span className="seg-compteur">
                    {counts ? `${counts[key] ?? 0} contact${(counts[key] ?? 0) > 1 ? "s" : ""}` : "…"}
                  </span>
                  {segment === key && <span style={{ color: "var(--admin-accent)", fontWeight: 700 }}>✓</span>}
                </div>
              </button>
            ))}
          </div>
          <div className="pan-actions">
            <button className="btn btn-ligne" onClick={() => setStep(1)}>← Retour</button>
            <button className="btn btn-accent" onClick={() => setStep(3)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Étape 3 : Planification */}
      {step === 3 && (
        <div>
          <p className="desc">Quand envoyer cette campagne ?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <button onClick={() => { setSendNow(true); setScheduledDate(""); }} style={{
              padding: "14px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "var(--font-body)",
              border: sendNow ? "2px solid var(--admin-accent)" : "1px solid var(--line)",
              background: sendNow ? "var(--a06)" : "#fff",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>⚡ Envoyer maintenant</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>La campagne sera envoyée immédiatement.</div>
            </button>

            <button onClick={() => setSendNow(false)} style={{
              padding: "14px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "var(--font-body)",
              border: !sendNow ? "2px solid var(--admin-accent)" : "1px solid var(--line)",
              background: !sendNow ? "var(--a06)" : "#fff",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>📅 Planifier</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>Choisissez une date et une heure d'envoi.</div>
            </button>
          </div>

          {!sendNow && (
            <div className="grid2">
              <div className="champ">
                <label>Date d'envoi</label>
                <input type="date" value={scheduledDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div className="champ">
                <label>Heure d'envoi</label>
                <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
            </div>
          )}

          <div style={{ background: "var(--cream)", borderRadius: 8, padding: "12px 16px", fontSize: 13, marginBottom: 20 }}>
            <b>Récap</b> — Template : {TEMPLATES[template]?.label} · Segment : {SEGMENTS[segment]?.label}{counts ? ` (${counts[segment] ?? 0} destinataire${(counts[segment] ?? 0) > 1 ? "s" : ""})` : ""} · Objet : {subject}
          </div>

          {erreur && <div className="alerte">{erreur}</div>}

          {/* Envoi de test — HORS de .pan-actions : ce conteneur est un flex dont les
              .btn ont flex:1, ils s'étireraient à la hauteur de ce bloc. */}
          <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10,
            padding: "14px 16px", marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
              Envoyer un test
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* .champ : indispensable, c'est lui qui porte le style des inputs de l'admin */}
              <div className="champ" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => { setTestEmail(e.target.value); setTestMsg(""); }}
                  placeholder="votre@email.fr"
                />
              </div>
              <button className="btn btn-ligne" disabled={testBusy} onClick={envoyerTest}
                style={{ whiteSpace: "nowrap" }}>
                {testBusy ? "Envoi…" : "Envoyer le test"}
              </button>
            </div>
            {testMsg && (
              <div style={{ marginTop: 8, fontSize: 12.5,
                color: testMsg.startsWith("Test envoyé") ? "var(--ok, #3E7D5A)" : "var(--erreur, #B5503C)" }}>
                {testMsg}
              </div>
            )}
            <div className="aide" style={{ fontSize: 11.5, marginTop: 6 }}>
              L'e-mail part à cette seule adresse. La campagne n'est pas envoyée et reste modifiable.
            </div>
          </div>

          <div className="pan-actions">
            <button className="btn btn-ligne" onClick={() => setStep(2)}>← Retour</button>
            <button className="btn btn-ligne" disabled={busy} onClick={() => sauvegarder(false)}>Sauvegarder en brouillon</button>
            <button className="btn btn-accent" disabled={busy} onClick={() => {
              if (!canSend) { setErreur("Choisissez une date d'envoi, ou sélectionnez « Envoyer maintenant »."); return; }
              setErreur("");
              sauvegarder(true);
            }}>
              {busy ? "…" : sendNow ? "⚡ Envoyer" : "📅 Planifier"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet principal ────────────────────────────────────────────────────────

// Aperçu fidèle de l'email de bienvenue (transactionnel, codé dans l'edge function
// send-newsletter, template "welcome"). Reflète sa structure : bandeau accent,
// salutation, texte d'accueil, bouton, signature. Seul c.message est variable.
function ApercuWelcome({ restoName, logoUrl }: { restoName: string; logoUrl: string }) {
  const accent = "var(--accent, #5a7d4f)";
  const INK = "#4A4A45";
  const nom = restoName || "votre restaurant";
  return (
    <div className="welcome-apercu">
      <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(80,100,60,.12)", maxWidth: 500, margin: "0 auto" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", padding: "20px 30px 6px" }}>
          {logoUrl
            ? <img src={logoUrl} alt={nom} style={{ height: 40, maxWidth: 180, objectFit: "contain", margin: "0 auto", display: "block" }} />
            : <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink)" }}>{nom}</span>}
        </div>
        {/* Bandeau accent */}
        <div style={{ background: accent, color: "#fff", textAlign: "center", padding: "26px 30px" }}>
          <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", opacity: .8, marginBottom: 8 }}>Bienvenue</div>
          <div style={{ fontFamily: "var(--font-display, Georgia, serif)", fontSize: 24, lineHeight: 1.2 }}>Bienvenue chez {nom} !</div>
        </div>
        {/* Corps */}
        <div style={{ padding: "26px 30px 6px" }}>
          <p style={{ fontFamily: "var(--font-display, Georgia, serif)", fontSize: 18, color: "#3A4A2C", margin: "0 0 16px" }}>Bonjour [Prénom],</p>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: INK, margin: 0 }}>
            Merci de votre inscription. Vous faites maintenant partie de nos proches et serez les premiers informés de nos actualités, nouveaux menus et événements.
          </p>
        </div>
        {/* Bouton */}
        <div style={{ textAlign: "center", padding: "20px 30px 6px" }}>
          <span style={{ display: "inline-block", background: accent, color: "#fff", fontSize: 14, fontWeight: 700, padding: "12px 34px", borderRadius: 28 }}>Découvrir le restaurant</span>
        </div>
        {/* Signature */}
        <div style={{ padding: "16px 30px 32px" }}>
          <p style={{ fontSize: 14, color: INK, margin: "0 0 4px" }}>À très bientôt,</p>
          <p style={{ fontFamily: "var(--font-display, Georgia, serif)", fontSize: 16, fontStyle: "italic", color: "#3A4A2C", margin: 0 }}>{nom}</p>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", textAlign: "center", marginTop: 12, fontStyle: "italic" }}>
        [Prénom] est remplacé par le prénom de l'inscrit s'il est connu. Ce message n'est pas modifiable ici.
      </div>
    </div>
  );
}

export default function TabNewsletter() {
  const confirmDirty = useConfirm();
  const [campagnes, setCampagnes] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"liste" | "nouveau">("liste");
  const [filtre, setFiltre] = useState<"toutes" | "draft" | "scheduled" | "sent">("toutes");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [filtreDossier, setFiltreDossier] = useState<string>("tous"); // "tous" | "__sans__" | nom de dossier
  const [menuOuvert, setMenuOuvert] = useState<string | null>(null);   // id de campagne dont le menu ⋯ est ouvert
  const [registreDossiers, setRegistreDossiers] = useState<string[]>([]); // dossiers déclarés (table), incl. vides
  const [welcomeOuvert, setWelcomeOuvert] = useState(false); // accordéon d'aperçu de l'email de bienvenue
  const restoName = import.meta.env.VITE_RESTO_NAME || "";
  const [logoUrl, setLogoUrl] = useState(""); // logo newsletter, pour l'aperçu du Welcome
  useEffect(() => {
    supabase.from("site_content").select("content").eq("section_key", "newsletter_logo").maybeSingle()
      .then(({ data }) => { if (data?.content?.url) setLogoUrl(data.content.url); });
  }, []);
  // Pré-remplissage du formulaire : dupliquer (sans id) ou reprendre un brouillon (avec id)
  const [prefill, setPrefill] = useState<{ id?: string; template: string; segment: string; subject: string; content: Record<string, string> } | undefined>(undefined);
  const confirm = useConfirm();

  function dupliquer(c: Campaign) {
    setPrefill({ template: c.template, segment: c.segment, subject: c.subject, content: { ...c.content } });
    setMode("nouveau");
  }

  function reprendre(c: Campaign) {
    setPrefill({ id: c.id, template: c.template, segment: c.segment, subject: c.subject, content: { ...c.content } });
    setMode("nouveau");
  }

  async function charger() {
    setLoading(true);
    const [{ data: camps }, { data: fold }] = await Promise.all([
      supabase.from("newsletter_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("newsletter_folders").select("name").order("name"),
    ]);
    setCampagnes(camps || []);
    setRegistreDossiers((fold || []).map((f: { name: string }) => f.name));
    setLoading(false);
  }

  useEffect(() => { charger(); }, []);

  // Ferme le menu ⋯ au clic extérieur ou touche Échap.
  useEffect(() => {
    if (!menuOuvert) return;
    const onClic = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".carte-menu")) setMenuOuvert(null);
    };
    const onEchap = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOuvert(null); };
    document.addEventListener("mousedown", onClic);
    document.addEventListener("keydown", onEchap);
    return () => { document.removeEventListener("mousedown", onClic); document.removeEventListener("keydown", onEchap); };
  }, [menuOuvert]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("newsletter-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "newsletter_campaigns" }, charger)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function annuler(c: Campaign) {
    const ok = await confirm({
      titre: "Annuler l'envoi programmé ?",
      message: `« ${c.subject} » repassera en brouillon et ne sera pas envoyée.`,
      confirmer: "Oui, repasser en brouillon",
      annuler: "Retour",
      danger: true,
    });
    if (!ok) return;
    await supabase.from("newsletter_campaigns").update({ status: "draft", scheduled_at: null }).eq("id", c.id);
    charger();
  }

  async function supprimer(c: Campaign) {
    const ok = await confirm({
      titre: "Supprimer cette campagne ?",
      message: `« ${c.subject} » sera définitivement supprimée.`,
      confirmer: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    await supabase.from("newsletter_campaigns").delete().eq("id", c.id);
    charger();
  }

  // Range une campagne dans un dossier (ou l'en retire si dossier vide).
  async function deplacer(c: Campaign, dossier: string | null) {
    await supabase.from("newsletter_campaigns").update({ folder: dossier || null }).eq("id", c.id);
    setMenuOuvert(null);
    charger();
  }

  // Crée un dossier à la volée (modale stylée) et y range la campagne.
  async function deplacerVersNouveau(c: Campaign) {
    setMenuOuvert(null);
    const nom = await confirm({
      titre: "Nouveau dossier",
      confirmer: "Créer et ranger",
      saisie: { label: "Nom du dossier", placeholder: "ex. Événements, Menus, Promotions", valeurInitiale: c.folder || "" },
    });
    if (typeof nom !== "string" || !nom.trim()) return;
    await declarerDossier(nom.trim());
    await deplacer(c, nom.trim());
  }

  // Déclare un dossier dans le registre (idempotent) → permet les dossiers vides.
  async function declarerDossier(nom: string) {
    await supabase.from("newsletter_folders").upsert({ name: nom }, { onConflict: "name" });
  }

  // Crée un dossier vide depuis le bandeau (modale stylée).
  async function nouveauDossier() {
    const nom = await confirm({
      titre: "Nouveau dossier",
      message: "Créez un dossier pour y ranger vos campagnes ensuite.",
      confirmer: "Créer le dossier",
      saisie: { label: "Nom du dossier", placeholder: "ex. Événements, Menus, Promotions" },
    });
    if (typeof nom !== "string" || !nom.trim()) return;
    await declarerDossier(nom.trim());
    setFiltreDossier(nom.trim());
    charger();
  }

  // Supprime un dossier du registre (les campagnes qui y étaient repassent « sans dossier »).
  async function supprimerDossier(nom: string) {
    const ok = await confirm({
      titre: "Supprimer ce dossier ?",
      message: `Le dossier « ${nom} » sera supprimé. Les campagnes qu'il contient ne seront pas supprimées : elles repasseront « sans dossier ».`,
      confirmer: "Supprimer le dossier",
      danger: true,
    });
    if (!ok) return;
    await supabase.from("newsletter_folders").delete().eq("name", nom);
    await supabase.from("newsletter_campaigns").update({ folder: null }).eq("folder", nom);
    if (filtreDossier === nom) setFiltreDossier("tous");
    charger();
  }

  async function envoyer(c: Campaign) {
    const ok = await confirm({
      titre: "Envoyer maintenant ?",
      message: `« ${c.subject} » partira immédiatement aux destinataires du segment.`,
      confirmer: "Envoyer",
    });
    if (!ok) return;
    await supabase.from("newsletter_campaigns").update({ scheduled_at: new Date().toISOString(), status: "scheduled" }).eq("id", c.id);
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`;
    await fetch(url, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ campaign_id: c.id }),
    });
    charger();
  }

  // Date de référence d'une campagne pour le filtre par période :
  // envoyée → sent_at, planifiée → scheduled_at, brouillon → created_at.

function dateRef(c: Campaign): string {
    return c.sent_at || c.scheduled_at || c.created_at;
  }

  // Le Welcome est un email transactionnel (déclenché à l'inscription), présenté à
  // part dans la section « Automatisation ». On l'exclut donc de la grille des campagnes.
  const campagnesGrille = campagnes.filter((c) => c.template !== "welcome");
  // Stats agrégées du Welcome : chaque inscription crée une ligne welcome → le nombre
  // de lignes (et la somme des sent_count) donne le nombre d'envois.
  const welcomeLignes = campagnes.filter((c) => c.template === "welcome");
  const welcomeEnvois = welcomeLignes.reduce((n, c) => n + (c.sent_count || 0), 0) || welcomeLignes.length;
  const welcomeDernier = welcomeLignes.map((c) => c.sent_at).filter(Boolean).sort().slice(-1)[0] || null;

  const affichees = campagnesGrille.filter((c) => {
    if (filtre !== "toutes" && c.status !== filtre) return false;
    if (filtreDossier === "__sans__" && c.folder) return false;
    if (filtreDossier !== "tous" && filtreDossier !== "__sans__" && c.folder !== filtreDossier) return false;
    const ref = dateRef(c);
    if (dateDebut && ref && ref.slice(0, 10) < dateDebut) return false;
    if (dateFin && ref && ref.slice(0, 10) > dateFin) return false;
    return true;
  });

  // Liste des dossiers = union du registre (table, inclut les vides) et des dossiers
  // réellement portés par des campagnes. Triée alphabétiquement (FR).
  const dossiers = Array.from(new Set([
    ...registreDossiers,
    ...(campagnesGrille.map((c) => c.folder).filter(Boolean) as string[]),
  ])).sort((a, b) => a.localeCompare(b, "fr"));
  const nbSansDossier = campagnesGrille.filter((c) => !c.folder).length;
  const compteDossier = (nom: string) => campagnesGrille.filter((c) => c.folder === nom).length;

  const filtresDateActifs = !!dateDebut || !!dateFin;

  const nbScheduled = campagnesGrille.filter((c) => c.status === "scheduled").length;
  const nbDraft     = campagnesGrille.filter((c) => c.status === "draft").length;
  const nbSent      = campagnesGrille.filter((c) => c.status === "sent").length;

  return (
    <div className="contenu">
      <div className="topbar">
        <div>
          <h1>Newsletter</h1>
          <p className="sous">Campagnes email — {campagnesGrille.length} au total</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {mode === "liste" && (
            <button className="btn btn-ligne" onClick={nouveauDossier}>📁 + Nouveau dossier</button>
          )}
          <button className="btn btn-accent" onClick={async () => {
            if (mode === "nouveau") {
              const ok = await confirmDirty({ titre: "Quitter la campagne ?", message: "Les modifications non sauvegardées en brouillon seront perdues.", confirmer: "Quitter", annuler: "Rester", danger: true });
              if (!ok) return;
            }
            setPrefill(undefined); setMode(mode === "nouveau" ? "liste" : "nouveau");
          }}>
            {mode === "nouveau" ? "← Retour à la liste" : "+ Nouvelle campagne"}
          </button>
        </div>
      </div>

      <div className="contenu" style={{ paddingTop: 20 }}>

        {mode === "nouveau" && (
          <NouveauForm key={prefill?.id || (prefill ? "dup" : "neuf")} initial={prefill}
            onSaved={() => { setPrefill(undefined); setMode("liste"); charger(); }} />
        )}

        {mode === "liste" && (
          <>
            {/* Filtres */}
            <div className="filtres-resa" style={{ marginBottom: 20 }}>
              <button className={`puce-mini${filtre === "toutes" ? " active" : ""}`} onClick={() => setFiltre("toutes")}>
                Toutes{campagnesGrille.length > 0 ? ` (${campagnesGrille.length})` : ""}
              </button>
              <button className={`puce-mini${filtre === "scheduled" ? " active" : ""}`} onClick={() => setFiltre("scheduled")}>
                Planifiées {nbScheduled > 0 && <span className="ps-pip">{nbScheduled}</span>}
              </button>
              <button className={`puce-mini${filtre === "draft" ? " active" : ""}`} onClick={() => setFiltre("draft")}>
                Brouillons {nbDraft > 0 && <span className="ps-pip">{nbDraft}</span>}
              </button>
              <button className={`puce-mini${filtre === "sent" ? " active" : ""}`} onClick={() => setFiltre("sent")}>
                Envoyées{nbSent > 0 ? ` (${nbSent})` : ""}
              </button>
            </div>

            {/* Section « Automatisation » : le Welcome, email transactionnel envoyé
                automatiquement à chaque inscription. Présenté à part, avec compteur
                agrégé et aperçu complet déroulant. */}
            {welcomeLignes.length > 0 && (
              <div className="nl-trigger">
                <div className="nl-trigger-tete">
                  <div className="nl-trigger-info">
                    <span className="nl-trigger-pastille">⚡ Automatique</span>
                    <div>
                      <b>Email de bienvenue</b>
                      <div className="sub-desc">Envoyé automatiquement à chaque nouvelle inscription à la newsletter.</div>
                    </div>
                  </div>
                  <div className="nl-trigger-stat">
                    <span className="nl-trigger-nb">{welcomeEnvois}</span>
                    <span className="nl-trigger-lbl">
                      envoi{welcomeEnvois > 1 ? "s" : ""}
                      {welcomeDernier && <span className="sub-desc"> · dernier {fmtDatetime(welcomeDernier)}</span>}
                    </span>
                  </div>
                  <button className="btn btn-mini btn-ligne" onClick={() => setWelcomeOuvert((v) => !v)}>
                    {welcomeOuvert ? "▲ Masquer l'aperçu" : "▼ Voir l'aperçu"}
                  </button>
                </div>
                {welcomeOuvert && (
                  <div className="nl-trigger-apercu">
                    <ApercuWelcome restoName={restoName} logoUrl={logoUrl} />
                  </div>
                )}
              </div>
            )}

            {/* Filtre par période d'envoi/planification */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-soft)" }}>
                du
                <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)}
                  style={{ width: "auto", padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)" }} />
                au
                <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)}
                  style={{ width: "auto", padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)" }} />
              </div>
              {filtresDateActifs && (
                <button className="btn btn-mini btn-ligne" onClick={() => { setDateDebut(""); setDateFin(""); }}>
                  ✕ Réinitialiser
                </button>
              )}
            </div>

            {/* Barre de dossiers : n'apparaît que si au moins un dossier existe */}
            {dossiers.length > 0 && (
              <div className="nl-dossiers">
                <button className={`nl-doss-puce ${filtreDossier === "tous" ? "on" : ""}`} onClick={() => setFiltreDossier("tous")}>
                  Tous <span className="ps-pip">{campagnes.length}</span>
                </button>
                {dossiers.map((d) => (
                  <span key={d} className={`nl-doss-puce ${filtreDossier === d ? "on" : ""}`}>
                    <button className="nl-doss-nom" onClick={() => setFiltreDossier(d)}>
                      📁 {d} <span className="ps-pip">{compteDossier(d)}</span>
                    </button>
                    <button className="nl-doss-x" aria-label={`Supprimer le dossier ${d}`} onClick={() => supprimerDossier(d)}>✕</button>
                  </span>
                ))}
                {nbSansDossier > 0 && (
                  <button className={`nl-doss-puce ${filtreDossier === "__sans__" ? "on" : ""}`} onClick={() => setFiltreDossier("__sans__")}>
                    Sans dossier <span className="ps-pip">{nbSansDossier}</span>
                  </button>
                )}
              </div>
            )}

            {loading && <p className="vide">Chargement…</p>}

            {!loading && affichees.length === 0 && (
              <div className="bloc" style={{ textAlign: "center", padding: "36px 24px" }}>
                {campagnes.length === 0 ? (
                  <>
                    <div style={{ fontSize: 34, marginBottom: 10 }}>📮</div>
                    <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Aucune campagne pour l'instant</p>
                    <p className="vide" style={{ marginBottom: 16 }}>Annoncez un événement, une nouvelle carte ou une actualité à vos inscrits.</p>
                    <button className="btn btn-accent" onClick={() => { setPrefill(undefined); setMode("nouveau"); }}>
                      + Créer ma première campagne
                    </button>
                  </>
                ) : (
                  <>
                    <p className="vide" style={{ marginBottom: filtresDateActifs ? 12 : 0 }}>Aucune campagne dans ce filtre.</p>
                    {filtresDateActifs && (
                      <button className="btn btn-mini btn-ligne" onClick={() => { setDateDebut(""); setDateFin(""); }}>
                        ✕ Réinitialiser les filtres
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {!loading && affichees.length > 0 && (
              <div className="nl-grille">
                {affichees.map((c) => {
                  const st = STATUS_LABELS[c.status] || { label: c.status, cls: "" };
                  const cibles = c.recipients_count;
                  // Date de référence lisible selon le statut.
                  const dateLbl = c.status === "scheduled" && c.scheduled_at
                    ? <span style={{ color: "var(--admin-accent)", fontWeight: 700 }}>→ {fmtDatetime(c.scheduled_at)}</span>
                    : <span>{fmtDatetime(c.sent_at || c.scheduled_at) || "—"}</span>;
                  const img = premiereImage(c.content);
                  return (
                    <div className="nl-carte" key={c.id}>
                      {/* Vignette : première image du contenu, ou placeholder discret */}
                      <div className={`nl-carte-vignette ${img ? "" : "vide"}`}>
                        {img ? <img src={img} alt="" loading="lazy" /> : <span>Pas d'image</span>}
                      </div>
                      {/* En-tête : objet + menu ⋯ */}
                      <div className="nl-carte-tete">
                        <div className="nl-carte-titre">
                          <b title={c.subject}>{c.subject}</b>
                        </div>
                        <div className="carte-menu">
                          <button className="nl-menu-btn" aria-label="Actions" aria-haspopup="true"
                            aria-expanded={menuOuvert === c.id}
                            onClick={() => setMenuOuvert(menuOuvert === c.id ? null : c.id)}>⋯</button>
                          {menuOuvert === c.id && (
                            <div className="nl-menu" role="menu">
                              {c.status === "draft" && (
                                <>
                                  <button role="menuitem" onClick={() => { setMenuOuvert(null); reprendre(c); }}>✎ Reprendre</button>
                                  <button role="menuitem" onClick={() => { setMenuOuvert(null); envoyer(c); }}>⚡ Envoyer</button>
                                </>
                              )}
                              {c.status === "scheduled" && (
                                <button role="menuitem" onClick={() => { setMenuOuvert(null); annuler(c); }}>Annuler l'envoi</button>
                              )}
                              {TEMPLATES[c.template] && (
                                <button role="menuitem" onClick={() => { setMenuOuvert(null); dupliquer(c); }}>⧉ Dupliquer</button>
                              )}
                              <div className="nl-menu-sep" />
                              {dossiers.filter((d) => d !== c.folder).map((d) => (
                                <button role="menuitem" key={d} onClick={() => deplacer(c, d)}>📁 Ranger dans « {d} »</button>
                              ))}
                              <button role="menuitem" onClick={() => deplacerVersNouveau(c)}>📁＋ Nouveau dossier…</button>
                              {c.folder && (
                                <button role="menuitem" onClick={() => deplacer(c, null)}>↩ Retirer du dossier</button>
                              )}
                              {(c.status === "draft" || c.status === "failed") && (
                                <>
                                  <div className="nl-menu-sep" />
                                  <button role="menuitem" className="danger" onClick={() => { setMenuOuvert(null); supprimer(c); }}>Supprimer</button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Ciblage mis en avant */}
                      <div className="nl-carte-cible">
                        <span className="nl-cible-nb">{cibles != null ? cibles : "—"}</span>
                        <span className="nl-cible-lbl">
                          {cibles != null ? `destinataire${cibles > 1 ? "s" : ""}` : "à envoyer"}
                          <span className="sub-desc"> · {SEGMENTS[c.segment]?.label || c.segment}</span>
                        </span>
                      </div>

                      {/* Pied : statut + date + dossier */}
                      <div className="nl-carte-pied">
                        <span className={`tag ${st.cls}`}>{st.label}</span>
                        <span className="nl-carte-date">{dateLbl}</span>
                      </div>
                      {c.folder && <span className="nl-carte-dossier">📁 {c.folder}</span>}
                      {c.status === "sent" && c.sent_count != null && cibles != null && c.sent_count < cibles && (
                        <div className="nl-carte-alerte">⚠ {c.sent_count} / {cibles} envoyés</div>
                      )}
                      {c.error_message && (
                        <div className="nl-carte-alerte">⚠ {c.error_message.slice(0, 60)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
