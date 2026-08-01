import { useState, useEffect, useRef } from "react";
import { supabase, messageUpload } from "../../lib/supabase";
import { useConfirm } from "./Confirm";
import { useDirty } from "./Dirty";
import FicheCampagne, { type EventStats } from "./FicheCampagne";
import AssistantNewsletter, { type Redaction } from "./AssistantNewsletter";

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

/* ── Personnalisation : {{prenom}} ──────────────────────────────────────────
   Miroir EXACT de send-newsletter/index.ts : si l'une des deux implémentations
   change, l'autre doit suivre, sinon l'aperçu ment sur ce qui sera envoyé. */
const JETON_PRENOM = "{{prenom}}";
const PRENOM_EXEMPLE = "Marie";           // prénom d'exemple affiché dans l'aperçu
const REPLI_DEFAUT = "à vous";            // repli proposé pour une nouvelle campagne

const contientJeton = (s: string) => /\{\{\s*prenom\s*\}\}/i.test(String(s || ""));

function normPrenom(v: string): string {
  const s = String(v || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s.toLocaleLowerCase("fr")
    .replace(/(^|[\s\-'\u2019])(\p{L})/gu, (_m, sep, c) => sep + c.toLocaleUpperCase("fr"));
}

function remplacerPrenom(s: string, prenom: string, repli: string): string {
  if (!String(s || "").includes("{{")) return String(s || "");
  const val = prenom ? normPrenom(prenom) : String(repli || "");
  return String(s)
    .replace(/\{\{\s*prenom\s*\}\}/gi, val)
    .replace(/ {2,}/g, " ")
    .replace(/[ \t]+([,.])/g, "$1")
    .trim();
}

function personnaliser(v: any, prenom: string, repli: string): any {
  if (typeof v === "string") return remplacerPrenom(v, prenom, repli);
  if (Array.isArray(v)) return v.map((x) => personnaliser(x, prenom, repli));
  if (v && typeof v === "object") {
    const o: any = {};
    for (const k of Object.keys(v)) o[k] = personnaliser(v[k], prenom, repli);
    return o;
  }
  return v;
}

// Insère {{prenom}} à la position du curseur d'un champ.
function insererJeton(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  appliquer: (valeur: string) => void,
) {
  if (!el) return;
  const d = el.selectionStart ?? el.value.length;
  const f = el.selectionEnd ?? d;
  appliquer(el.value.slice(0, d) + JETON_PRENOM + el.value.slice(f));
  const pos = d + JETON_PRENOM.length;
  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
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
function BlocsCanvas({ subject, content, restoName, logoUrl, avecPrenom, onBascule }: {
  subject: string; content: any; restoName: string; logoUrl: string;
  avecPrenom: boolean; onBascule: (v: boolean) => void;
}) {
  // La campagne n'affiche la bascule que si elle utilise réellement le jeton :
  // inutile d'encombrer l'aperçu d'un réglage sans effet.
  const perso = contientJeton(subject) || contientJeton(JSON.stringify(content || {}));
  const repli = String(content?.prenom_defaut ?? "");
  const prenomApercu = avecPrenom ? PRENOM_EXEMPLE : "";
  subject = remplacerPrenom(subject, prenomApercu, repli);
  content = personnaliser(content, prenomApercu, repli);
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

      {/* Bascule : la phrase doit tenir debout dans les deux cas. Beaucoup
          d'inscrits n'ont pas de prénom — le formulaire public ne l'exige pas. */}
      {perso && (
        <div className="nl-liens" style={{ justifyContent: "center", marginBottom: 12 }}>
          <button type="button" className={`nl-lien${avecPrenom ? " actif" : ""}`}
            onClick={() => onBascule(true)}>Avec prénom</button>
          <button type="button" className={`nl-lien${!avecPrenom ? " actif" : ""}`}
            onClick={() => onBascule(false)}>Sans prénom</button>
        </div>
      )}

      <div style={{ marginBottom: 18, maxWidth: 640, margin: "0 auto 18px" }}>
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

      <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(80,100,60,.12)", maxWidth: 640, margin: "0 auto" }}>
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
        {/* Le nom de la teinte quittait beaucoup de place pour une information
            que la pastille donne déjà. Il reste en infobulle et en libellé
            accessible : une couleur seule ne s'annonce pas à un lecteur
            d'écran, et la sélection ne peut pas reposer que sur la teinte. */}
        {TEINTES.map((t) => (
          <button key={t.cle} type="button" title={t.label} aria-label={t.label}
            aria-pressed={(valeur || defaut) === t.cle}
            className={`nl-teinte${(valeur || defaut) === t.cle ? " actif" : ""}`}
            onClick={() => onChange(t.cle)}>
            <span className="nl-pastille" style={{ background: t.css }} />
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
          <button type="button" className="nl-lien"
            onClick={() => insererJeton(refTexte.current, (v) => onChange({ texte: v }))}
            title="Insérer le prénom du destinataire">+ Prénom</button>
        </div>
        <textarea ref={refTexte} rows={4} value={val.texte || ""} onChange={(e) => onChange({ texte: e.target.value })} maxLength={2000}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); basculerGras(); }
          }}
          placeholder={"Votre texte…\n\nUne ligne vide sépare deux paragraphes."} />
        <span className="aide" style={{ fontSize: 11.5 }}>
          Entrée = retour à la ligne · Entrée deux fois = nouveau paragraphe ·
          {" "}<b>**gras**</b> pour mettre un passage en évidence ·
          {" "}<b>{"{{prenom}}"}</b> fonctionne aussi dans le titre.
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

function NouveauForm({ onSaved, initial, cibleUnique, step, setStep, welcome }: {
  onSaved: () => void;
  /* `content` porte aussi les blocs (tableau) : `any` plutôt que
     Record<string,string>, qui décrivait mal la réalité même avant. */
  initial?: { id?: string; template: string; segment: string; subject: string; content: any };
  /** Module Réservation désactivé : un seul ciblage possible, l'étape 2 est retirée. */
  cibleUnique: boolean;
  /* L'étape est portée par le parent : le fil « 1 · Contenu / 2 · Destinataires /
     3 · Envoi » vit dans l'en-tête de page, au-dessus de ce composant. */
  step: 1 | 2 | 3;
  setStep: (n: 1 | 2 | 3) => void;
  /* Mode « email de bienvenue » : le MÊME éditeur, avec deux différences —
     il n'y a ni destinataires (c'est déclenché par l'inscription) ni envoi
     (il part tout seul). L'étape 1 se termine donc par « Enregistrer », et le
     texte est écrit dans site_content plutôt que dans une campagne. */
  welcome?: boolean;
}) {
  const dirty = useDirty();
  // Éditeur ouvert = travail en cours : protège contre la perte (changement
  // d'onglet, fermeture navigateur). Nettoyé au démontage (sauvegarde ou sortie).
  useEffect(() => { dirty.set(true); return () => dirty.set(false); }, []); // eslint-disable-line
  const [template] = useState(initial?.template || "blocs");
  // Sans module Réservation, `customers` reste vide : tous les segments sauf
  // « optin » seraient à 0. On force le seul ciblage qui a du sens.
  const [segment, setSegment] = useState(cibleUnique ? "optin" : (initial?.segment || "optin"));
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  // Nombre de destinataires par segment (RPC : même logique que l'envoi réel)
  useEffect(() => {
    supabase.rpc("newsletter_segment_counts").then(({ data }) => {
      if (data) setCounts(data as Record<string, number>);
    });
  }, []);
  const [subject, setSubject] = useState(initial?.subject || "");
  // `prenom_defaut` est semé dès l'ouverture : une campagne qui utilise
  // {{prenom}} sans repli écrirait « Bonjour , » aux inscrits sans prénom.
  const [content, setContent] = useState<Record<string, any>>(
    { prenom_defaut: REPLI_DEFAUT, ...(initial?.content || {}) });
  // Aperçu : voir la campagne telle que la recevra un inscrit avec prénom
  // connu, ou telle que la recevra un inscrit sans prénom.
  const [avecPrenom, setAvecPrenom] = useState(true);
  const refSujet = useRef<HTMLInputElement | null>(null);
  const refPreheader = useRef<HTMLInputElement | null>(null);

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

  // ── Assistant de campagne ───────────────────────────────────────────────
  // L'assistant PROPOSE, ce composant DISPOSE : il applique l'objet ou la
  // rédaction complète dans l'état de l'éditeur, avec confirmation quand du
  // contenu serait écrasé. Le lien des boutons est le même que celui des
  // blocs neufs (page réservation du site).
  const confirmIa = useConfirm();
  // Visuels suggérés par l'assistant, bloc par bloc. Affichés en rappel sous le
  // panneau : l'assistant ne peut pas poser d'image lui-même (il n'a pas les
  // URL de la galerie), c'est au restaurateur de la choisir dans le bloc.
  const [photosIa, setPhotosIa] = useState<string[]>([]);
  function appliquerObjetIa(s: string) {
    setSubject(s.slice(0, 150));
    setPhotosIa([]);
    if (manqueEtape1) setManqueEtape1("");
  }
  async function appliquerRedactionIa(r: Redaction) {
    const aDuContenu = blocs.some((b) =>
      b.type === "deux_colonnes"
        ? b.colonnes.some((c) => c.titre || c.texte || c.image)
        : !!(b.titre || b.texte || b.image));
    if (aDuContenu || subject.trim()) {
      const ok = await confirmIa({
        titre: "Utiliser cette rédaction ?",
        message: "L'objet, l'aperçu et les blocs actuels seront remplacés par la proposition de l'assistant. Vous pourrez ensuite tout retoucher.",
        confirmer: "Remplacer",
      });
      if (!ok) return;
    }
    /* Suggestions de visuels : un bloc à deux colonnes en porte une par
       colonne, elles sont réunies sur la ligne du bloc. */
    setPhotosIa(r.blocs.map((b) =>
      "colonnes" in b && Array.isArray(b.colonnes)
        ? b.colonnes.map((c) => String(c.photo || "").trim()).filter(Boolean).join(" · ")
        : String((b as { photo?: string }).photo || "").trim()));
    const base = (import.meta.env.VITE_SITE_URL || "").replace(/\/+$/, "");
    const cta = base ? `${base}/#reserver` : "";
    if (r.objet) setSubject(r.objet.slice(0, 150));
    setContent((c: any) => ({
      ...c,
      preheader: (r.preheader || "").slice(0, 150),
      /* Le type vient de l'assistant : il choisit la pleine largeur par défaut
         et les deux colonnes quand il met deux choses en regard. Il était
         auparavant écrasé ici, ce qui rendait le format à deux colonnes
         inaccessible à l'assistant. */
      blocs: r.blocs.map((b) => {
        if ("colonnes" in b && Array.isArray(b.colonnes) && b.colonnes.length >= 2) {
          return {
            type: "deux_colonnes" as const,
            colonnes: [0, 1].map((i) => {
              const col = b.colonnes[i] || { texte: "" };
              return {
                ...(col.titre ? { titre: col.titre } : {}),
                texte: col.texte || "",
                ...(cta ? { cta_url: cta } : {}),
                ...(col.cta_label && cta ? { cta_label: col.cta_label } : {}),
              };
            }) as [Colonne, Colonne],
          };
        }
        const bl = b as { titre?: string; texte: string; cta_label?: string };
        return {
          type: "pleine_largeur" as const,
          ...(bl.titre ? { titre: bl.titre } : {}),
          texte: bl.texte,
          ...(cta ? { cta_url: cta } : {}),
          ...(bl.cta_label && cta ? { cta_label: bl.cta_label } : {}),
        };
      }),
    }));
    setManqueEtape1("");
  }
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

  /* Welcome : pas de campagne créée, pas de planification — un seul
     enregistrement dans site_content, relu à chaque inscription. */
  async function enregistrerWelcome() {
    if (!subject.trim()) { setManqueEtape1("Indiquez l'objet de l'email avant d'enregistrer."); return; }
    if (!blocs.length)   { setManqueEtape1("Ajoutez au moins un bloc de contenu avant d'enregistrer."); return; }
    setManqueEtape1(""); setBusy(true); setErreur("");
    const { error } = await supabase.from("site_content").upsert(
      { section_key: "welcome_email", content: { ...content, subject, blocs } },
      { onConflict: "section_key" });
    setBusy(false);
    if (error) { setErreur("Enregistrement impossible : " + error.message); return; }
    dirty.set(false);
    onSaved();
  }

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
        // L'envoi de test suit la bascule de l'aperçu : ce qu'on voit à l'écran
        // est exactement ce qui arrive dans la boîte de réception, prénom compris.
        body: JSON.stringify({
          campaign_id: id, override_email: email,
          override_name: avecPrenom ? PRENOM_EXEMPLE : "",
        }),
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
    <div className="nl-editeur">

      {/* Étape 1 : Composition libre par blocs */}
      {step === 1 && (
        <div className="news-editor-grid">
          <div>
            {/* Logo (une fois pour toutes les campagnes) */}
            {/* Le logo est un réglage de la maison, pas de la campagne : il
                s'annonce en tête, en pastille, et se change d'un lien. */}
            <div className="nl-logo-ligne">
              <span className="nl-logo-vignette">
                {logoUrl
                  ? <img src={logoUrl} alt="Logo" />
                  : <span>{(restoName || "?").trim().charAt(0).toUpperCase()}</span>}
              </span>
              <span className="nl-logo-txt">
                <b>Logo des newsletters</b>
                <span>Utilisé sur toutes les campagnes — à définir une seule fois.</span>
              </span>
              <label className="adm-vit-lien accent" style={{ cursor: upLoad ? "default" : "pointer", opacity: upLoad ? .6 : 1, whiteSpace: "nowrap" }}>
                {upLoad ? "Envoi…" : logoUrl ? "Changer" : "Ajouter"}
                <input type="file" accept="image/*" onChange={uploadLogo} disabled={upLoad} style={{ display: "none" }} />
              </label>
            </div>

            <AssistantNewsletter subject={subject}
              onObjet={appliquerObjetIa} onRedaction={appliquerRedactionIa} />

            {photosIa.some(Boolean) && (
              <div className="nl-ia-rappel">
                <b>Visuels suggérés</b>
                <ul>
                  {photosIa.map((p, i) => p ? <li key={i}>Bloc {i + 1} — {p}</li> : null)}
                </ul>
                <button type="button" className="adm-vit-lien" onClick={() => setPhotosIa([])}>Masquer</button>
              </div>
            )}

            <div className="champ">
              <div className="nl-outils">
                <label style={{ margin: 0 }}>Objet de l'email <span style={{ color: "var(--admin-accent)" }}>*</span></label>
                <button type="button" className="nl-lien"
                  onClick={() => insererJeton(refSujet.current, (v) => { setSubject(v); if (manqueEtape1) setManqueEtape1(""); })}
                  title="Insérer le prénom du destinataire">+ Prénom</button>
                {/* Au-delà d'environ 45 signes, la fin de l'objet est coupée
                    dans la liste des messages sur téléphone. */}
                <span className={`nl-compteur${subject.length > 45 ? " alerte" : ""}`}>
                  {subject.length} signe{subject.length > 1 ? "s" : ""}
                  {subject.length > 45 ? " — coupé sur mobile au-delà de ~45" : ""}
                </span>
              </div>
              <input ref={refSujet} value={subject} onChange={(e) => { setSubject(e.target.value); if (manqueEtape1) setManqueEtape1(""); }} placeholder="Ex. Notre nouvelle carte d'été est là 🌿" maxLength={150} />
            </div>
            <div className="champ">
              <div className="nl-outils">
                <label style={{ margin: 0 }}>Aperçu (preheader)</label>
                <button type="button" className="nl-lien"
                  onClick={() => insererJeton(refPreheader.current, (v) => setContent({ ...content, preheader: v }))}
                  title="Insérer le prénom du destinataire">+ Prénom</button>
                <span className={`nl-compteur${(content.preheader || "").length > 130 ? " alerte" : ""}`}>
                  {(content.preheader || "").length}/150
                </span>
              </div>
              <input ref={refPreheader} value={content.preheader || ""} onChange={(e) => setContent({ ...content, preheader: e.target.value })}
                placeholder="Le texte gris affiché après l'objet dans la boîte de réception" maxLength={150} />
            </div>
            {/* Repli : ce qui remplace {{prenom}} pour les inscrits dont on ne
                connaît pas le prénom — le formulaire public ne l'exige pas. */}
            {(contientJeton(subject) || contientJeton(JSON.stringify(content || {}))) && (
              <div className="champ">
                <label>Si le prénom est inconnu, écrire</label>
                <input value={content.prenom_defaut ?? ""} maxLength={40}
                  onChange={(e) => setContent({ ...content, prenom_defaut: e.target.value })}
                  placeholder={REPLI_DEFAUT} />
                <span className="aide" style={{ fontSize: 11.5 }}>
                  « Bonjour {"{{prenom}}"}, » devient « Bonjour {PRENOM_EXEMPLE}, » ou
                  {" "}« Bonjour {content.prenom_defaut || "…"}, ». Laissez vide pour supprimer
                  simplement le prénom : la ponctuation est recollée.
                </span>
              </div>
            )}

            {/* ── Éditeur de blocs ── */}
            <div>
              <div className="nl-contenu-tete">
                <h2>Contenu</h2>
                <span className="adm-vit-nb">{blocs.length} bloc{blocs.length > 1 ? "s" : ""}</span>
                <div className="nl-contenu-actions">
                  <button className="adm-vit-lien accent" onClick={() => ajouterBloc("pleine_largeur")}>+ Pleine largeur</button>
                  <button className="adm-vit-lien accent" onClick={() => ajouterBloc("deux_colonnes")}>+ 2 colonnes</button>
                </div>
              </div>

              {!blocs.length && (
                <div className="vide" style={{ padding: "24px 0" }}>
                  Aucun bloc. Ajoutez-en un pour commencer votre campagne.
                </div>
              )}

              {blocs.map((b, i) => (
                <div key={i} className="nl-bloc">
                  <div className="nl-bloc-tete">
                    <span className="nl-bloc-type">
                      Bloc — {b.type === "deux_colonnes" ? "deux colonnes" : "pleine largeur"}
                    </span>
                    <span className="nl-bloc-actions">
                      <button className="adm-vit-lien" onClick={() => deplacerBloc(i, -1)} disabled={i === 0} title="Monter" aria-label="Monter le bloc">↑</button>
                      <button className="adm-vit-lien" onClick={() => deplacerBloc(i, 1)} disabled={i === blocs.length - 1} title="Descendre" aria-label="Descendre le bloc">↓</button>
                      <button className="adm-vit-lien" onClick={() => dupliquerBloc(i)}>Dupliquer</button>
                      <button className="adm-vit-lien danger" onClick={() => supprimerBloc(i)}>Retirer</button>
                    </span>
                  </div>

                  {b.type === "pleine_largeur" ? (
                    // Même habillage que les colonnes (fond crème, coins arrondis) :
                    // les deux types de blocs se lisent ainsi de la même façon.
                    <div>
                      <ChampsBloc
                        val={b}
                        onChange={(champs) => majBloc(i, champs)}
                        onUpload={uploadImage}
                      />
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
                      {[0, 1].map((n) => (
                        <div key={n}>
                          <div className="nl-bloc-type" style={{ marginBottom: 10 }}>
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
            {erreur && <div className="err-inline" style={{ marginTop: 16 }}>{erreur}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 20 }}>
              {welcome ? (
                <>
                  <button className="btn btn-accent" onClick={enregistrerWelcome} disabled={busy}>
                    {busy ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <span className="form-pied-aide">
                    S'applique aux prochaines inscriptions ; les envois passés ne changent pas.
                  </span>
                </>
              ) : (
                <button className="btn btn-accent" onClick={() => {
                  if (!subject.trim()) { setManqueEtape1("Indiquez l'objet de l'email avant de continuer."); return; }
                  if (!blocs.length)   { setManqueEtape1("Ajoutez au moins un bloc de contenu avant de continuer."); return; }
                  setManqueEtape1("");
                  setStep(cibleUnique ? 3 : 2);
                }}>
                  Suivant →
                </button>
              )}
            </div>
          </div>

          <div>
            <BlocsCanvas subject={subject} content={content} restoName={restoName} logoUrl={logoUrl}
              avecPrenom={avecPrenom} onBascule={setAvecPrenom} />
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
            <b>Récap</b> — Template : {TEMPLATES[template]?.label} · {cibleUnique ? "Destinataires : tous les inscrits" : `Segment : ${SEGMENTS[segment]?.label}`}{counts ? ` (${counts[segment] ?? 0} destinataire${(counts[segment] ?? 0) > 1 ? "s" : ""})` : ""} · Objet : {subject}
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
            <button className="btn btn-ligne" onClick={() => setStep(cibleUnique ? 1 : 2)}>← Retour</button>
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
/* Email de bienvenue par défaut, au MÊME format qu'une campagne libre (objet,
   preheader, blocs) : c'est ce qui permet de l'éditer avec l'éditeur habituel.
   MIROIR OBLIGATOIRE de welcomeDefaut() dans
   supabase/functions/send-newsletter/index.ts — si les deux divergent, l'aperçu
   ment sur ce qui part réellement. */
export function welcomeDefaut(restoName: string) {
  const nom = restoName || "votre restaurant";
  const base = (import.meta.env.VITE_SITE_URL || "").replace(/\/+$/, "");
  return {
    subject: `Bienvenue chez ${nom} !`,
    content: {
      preheader: `Bienvenue chez ${nom} — vous faites désormais partie de nos proches.`,
      blocs: [{
        type: "pleine_largeur" as const,
        titre: `Bienvenue chez ${nom} !`,
        texte: "Bonjour {{prenom}},\n\nMerci de votre inscription. Vous faites maintenant partie de nos proches et serez les premiers informés de nos actualités, nouveaux menus et événements.",
        cta_label: "Découvrir le restaurant",
        cta_url: base,
      }],
    },
  };
}


export default function TabNewsletter() {
  const confirmDirty = useConfirm();
  const [campagnes, setCampagnes] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"liste" | "nouveau" | "welcome">("liste");
  /* L'étape de l'éditeur vit ici et non dans NouveauForm : le fil « 1 · Contenu /
     2 · Destinataires / 3 · Envoi » s'affiche dans l'en-tête de page. */
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [filtre, setFiltre] = useState<"toutes" | "draft" | "scheduled" | "sent">("toutes");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [filtreDossier, setFiltreDossier] = useState<string>("tous"); // "tous" | "__sans__" | nom de dossier
  const [menuOuvert, setMenuOuvert] = useState<string | null>(null);   // id de campagne dont le menu ⋯ est ouvert
  const [registreDossiers, setRegistreDossiers] = useState<string[]>([]); // dossiers déclarés (table), incl. vides
  /* Contenu de l'email de bienvenue, au même format qu'une campagne. Stocké
     dans site_content (« welcome_email ») et NON sur une ligne de campagne
     welcome : il en existe plusieurs en base et le scheduler en choisit une
     sans tri — l'édition ne serait pas fiable. */
  const [welcomeInit, setWelcomeInit] = useState<{ subject: string; content: any } | null>(null);
  const restoName = import.meta.env.VITE_RESTO_NAME || "";
  const [logoUrl, setLogoUrl] = useState(""); // logo newsletter, pour l'aperçu du Welcome
  // Offre « Essentiel + Newsletter » : module Réservation désactivé. Sans
  // réservations, `customers` n'est jamais alimentée et les cinq segments qui
  // en dépendent afficheraient tous 0 contact. On retire alors purement et
  // simplement l'étape de ciblage — l'assistant passe de trois étapes à deux.
  const [cibleUnique, setCibleUnique] = useState(false);
  useEffect(() => {
    supabase.from("feature_flags").select("enabled").eq("key", "reservation").maybeSingle()
      .then(({ data }) => { if (data && data.enabled === false) setCibleUnique(true); });
  }, []);
  useEffect(() => {
    supabase.from("site_content").select("content").eq("section_key", "newsletter_logo").maybeSingle()
      .then(({ data }) => { if (data?.content?.url) setLogoUrl(data.content.url); });
  }, []);
  // Pré-remplissage du formulaire : dupliquer (sans id) ou reprendre un brouillon (avec id)
  const [prefill, setPrefill] = useState<{ id?: string; template: string; segment: string; subject: string; content: Record<string, string> } | undefined>(undefined);
  const confirm = useConfirm();

  function dupliquer(c: Campaign) {
    setPrefill({ template: c.template, segment: c.segment, subject: c.subject, content: { ...c.content } });
    setStep(1);
    setMode("nouveau");
  }

  function reprendre(c: Campaign) {
    setPrefill({ id: c.id, template: c.template, segment: c.segment, subject: c.subject, content: { ...c.content } });
    setStep(1);
    setMode("nouveau");
  }

  // Événements par campagne (clics, bounces, plaintes, désabonnements — via
  // newsletter_events). Vide tant que le webhook Resend n'est pas en place ou
  // pour les campagnes antérieures : on n'affiche alors rien plutôt qu'un zéro
  // trompeur.
  const [stats, setStats] = useState<Record<string, EventStats>>({});
  // Campagne dont la fiche statistiques est ouverte, et date du premier
  // événement enregistré (logique de couverture — voir FicheCampagne).
  const [fiche, setFiche] = useState<Campaign | null>(null);
  const [premierEvt, setPremierEvt] = useState<string | null>(null);

  async function charger() {
    setLoading(true);
    const [{ data: camps }, { data: fold }, { data: ev }] = await Promise.all([
      supabase.from("newsletter_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("newsletter_folders").select("name").order("name"),
      supabase.rpc("newsletter_event_counts"),
    ]);
    setCampagnes(camps || []);
    setRegistreDossiers((fold || []).map((f: { name: string }) => f.name));
    const parCamp: Record<string, EventStats> = {};
    (ev || []).forEach((e: { campaign_id: string; clicks: number; bounces: number; complaints?: number; unsubscribes?: number }) => {
      parCamp[e.campaign_id] = {
        clicks: Number(e.clicks), bounces: Number(e.bounces),
        complaints: Number(e.complaints ?? 0), unsubscribes: Number(e.unsubscribes ?? 0),
      };
    });
    setStats(parCamp);
    setLoading(false);
  }

  useEffect(() => { charger(); }, []);

  // Premier événement enregistré — sert à distinguer « aucune donnée » (campagne
  // antérieure au webhook) de « zéro » (campagne suivie, personne n'a cliqué).
  useEffect(() => {
    supabase.from("newsletter_events").select("created_at").order("created_at").limit(1)
      .then(({ data }) => { if (data && data[0]) setPremierEvt(data[0].created_at); });
  }, []);

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
  /* Lecture au montage. Rien d'enregistré = on ouvre l'éditeur pré-rempli avec
     le message historique, pour que le restaurateur parte du texte qu'il envoie
     déjà plutôt que d'une page blanche. */
  async function chargerWelcome() {
    const { data } = await supabase.from("site_content").select("content")
      .eq("section_key", "welcome_email").maybeSingle();
    const c = (data?.content || {}) as any;
    const d = welcomeDefaut(restoName);
    const utile = Array.isArray(c?.blocs) && c.blocs.length > 0;
    setWelcomeInit(utile
      ? { subject: String(c.subject || d.subject), content: c }
      : { subject: d.subject, content: d.content });
  }

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
    <>
      {/* Deux en-têtes distincts : la liste des campagnes, ou l'éditeur. Dans
          l'éditeur, le fil des étapes remplace les boutons — c'est le repère
          dont on a besoin à cet endroit. */}
      <div className={`topbar adm-vit${mode !== "liste" ? " large" : ""}`}>
        <div>
          <span className="adm-vit-eyebrow">Newsletter</span>
          <h1>{mode === "welcome" ? "Email de bienvenue" : mode === "nouveau" ? "Nouvelle campagne" : "Campagnes"}</h1>
          <div className="sous">{mode === "welcome"
            ? "Envoyé automatiquement à chaque nouvelle inscription."
            : mode === "nouveau"
              ? "Composez avec des blocs — aucun format imposé : ajoutez, réordonnez, supprimez."
              : `Campagnes email — ${campagnesGrille.length} au total`}</div>
        </div>
        <div className="adm-vit-topbar-actions">
          {mode === "welcome" ? (
            <button className="adm-vit-lien" onClick={async () => {
              const ok = await confirmDirty({ titre: "Quitter l'email de bienvenue ?", message: "Les modifications non enregistrées seront perdues.", confirmer: "Quitter", annuler: "Rester", danger: true });
              if (!ok) return;
              setWelcomeInit(null); setMode("liste");
            }}>← Retour à la liste</button>
          ) : mode === "nouveau" ? (
            <>
              <div className="nl-fil">
                {/* L'étape 2 (ciblage) disparaît du fil quand elle est sautée :
                    les repères sont renumérotés pour ne pas afficher un « 3 »
                    orphelin. Ils sont cliquables vers l'arrière seulement — on
                    ne saute pas une étape qu'on n'a pas remplie. */}
                {(cibleUnique ? ([1, 3] as const) : ([1, 2, 3] as const)).map((n, i) => (
                  <button key={n} type="button"
                    className={`nl-fil-etape${step === n ? " actif" : ""}`}
                    disabled={n > step}
                    onClick={() => setStep(n)}>
                    {i + 1} · {n === 1 ? "Contenu" : n === 2 ? "Destinataires" : "Envoi"}
                  </button>
                ))}
              </div>
              <button className="adm-vit-lien" onClick={async () => {
                const ok = await confirmDirty({ titre: "Quitter la campagne ?", message: "Les modifications non sauvegardées en brouillon seront perdues.", confirmer: "Quitter", annuler: "Rester", danger: true });
                if (!ok) return;
                setPrefill(undefined); setStep(1); setMode("liste");
              }}>← Retour à la liste</button>
            </>
          ) : (
            <>
              <button className="adm-vit-lien" onClick={nouveauDossier}>+ Nouveau dossier</button>
              <button className="btn btn-accent" onClick={() => { setPrefill(undefined); setStep(1); setMode("nouveau"); }}>
                + Nouvelle campagne
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`contenu adm-vit${mode !== "liste" ? " large" : ""}`}>

        {/* Même éditeur que pour une campagne : mêmes blocs, même aperçu.
            Seul le pied de l'étape 1 change (« Enregistrer » au lieu de
            « Suivant »), et il n'y a ni étape 2 ni étape 3. */}
        {mode === "welcome" && welcomeInit && (
          <NouveauForm key="welcome" welcome
            initial={{ template: "blocs", segment: "optin", subject: welcomeInit.subject, content: welcomeInit.content }}
            cibleUnique={cibleUnique} step={1} setStep={() => { /* pas d'étapes ici */ }}
            onSaved={() => { setWelcomeInit(null); setMode("liste"); charger(); }} />
        )}

        {mode === "nouveau" && (
          <NouveauForm key={prefill?.id || (prefill ? "dup" : "neuf")} initial={prefill}
            cibleUnique={cibleUnique} step={step} setStep={setStep}
            onSaved={() => { setPrefill(undefined); setStep(1); setMode("liste"); charger(); }} />
        )}

        {mode === "liste" && (
          <>
            {/* Filtres d'état à gauche, dossiers à droite : deux façons de
                trancher la même liste, sur une seule ligne. */}
            <div className="nl-barre-filtres">
            <div className="filtres-resa">
              <button className={`puce-mini${filtre === "toutes" ? " active" : ""}`} onClick={() => setFiltre("toutes")}>
                Toutes{campagnesGrille.length > 0 ? ` · ${campagnesGrille.length}` : ""}
              </button>
              <button className={`puce-mini${filtre === "scheduled" ? " active" : ""}`} onClick={() => setFiltre("scheduled")}>
                Planifiées{nbScheduled > 0 ? ` · ${nbScheduled}` : ""}
              </button>
              <button className={`puce-mini${filtre === "draft" ? " active" : ""}`} onClick={() => setFiltre("draft")}>
                Brouillons{nbDraft > 0 ? ` · ${nbDraft}` : ""}
              </button>
              <button className={`puce-mini${filtre === "sent" ? " active" : ""}`} onClick={() => setFiltre("sent")}>
                Envoyées{nbSent > 0 ? ` · ${nbSent}` : ""}
              </button>
            </div>
            {dossiers.length > 0 && (
              <div className="nl-dossiers">
                <button className={`nl-doss-puce ${filtreDossier === "tous" ? "on" : ""}`} onClick={() => setFiltreDossier("tous")}>
                  Tous · {campagnes.length}
                </button>
                {dossiers.map((d) => (
                  <span key={d} className={`nl-doss-puce ${filtreDossier === d ? "on" : ""}`}>
                    <button className="nl-doss-nom" onClick={() => setFiltreDossier(d)}>{d} · {compteDossier(d)}</button>
                    <button className="nl-doss-x" aria-label={`Supprimer le dossier ${d}`} onClick={() => supprimerDossier(d)}>✕</button>
                  </span>
                ))}
                {nbSansDossier > 0 && (
                  <button className={`nl-doss-puce ${filtreDossier === "__sans__" ? "on" : ""}`} onClick={() => setFiltreDossier("__sans__")}>
                    Sans dossier · {nbSansDossier}
                  </button>
                )}
              </div>
            )}
            </div>

            {/* Le Welcome, email transactionnel envoyé à chaque inscription.
                Une seule ligne : c'est un réglage qui tourne tout seul, pas une
                campagne à gérer. Il s'annonce et s'efface. */}
            {welcomeLignes.length > 0 && (
              <div className="nl-trigger">
                <div className="nl-trigger-tete">
                  <span className="nl-trigger-pastille">Automatique</span>
                  <b className="nl-trigger-nom">Email de bienvenue</b>
                  <span className="nl-trigger-lbl">
                    envoyé à chaque nouvelle inscription — {welcomeEnvois} envoi{welcomeEnvois > 1 ? "s" : ""}
                    {welcomeDernier && `, dernier le ${fmtDatetime(welcomeDernier)}`}
                  </span>
                  <button className="adm-vit-lien accent" onClick={async () => {
                    await chargerWelcome();
                    setStep(1);
                    setMode("welcome");
                  }}>Modifier le message</button>
                </div>
              </div>
            )}

            {/* Filtre par période d'envoi/planification */}
            <div className="nl-periode">
              <span className="nl-periode-lab">Période</span>
              <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} aria-label="À partir du" />
              <span className="nl-periode-au">au</span>
              <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} aria-label="Jusqu'au" />
              {filtresDateActifs && (
                <button className="btn btn-mini btn-ligne" onClick={() => { setDateDebut(""); setDateFin(""); }}>
                  ✕ Réinitialiser
                </button>
              )}
            </div>

            {loading && <p className="vide">Chargement…</p>}

            {!loading && affichees.length === 0 && (
              <div className="bloc" style={{ textAlign: "center", padding: "36px 24px" }}>
                {campagnes.length === 0 ? (
                  <>
                    <div style={{ fontSize: 34, marginBottom: 10 }}>📮</div>
                    <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Aucune campagne pour l'instant</p>
                    <p className="vide" style={{ marginBottom: 16 }}>Annoncez un événement, une nouvelle carte ou une actualité à vos inscrits.</p>
                    <button className="btn btn-accent" onClick={() => { setPrefill(undefined); setStep(1); setMode("nouveau"); }}>
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
              /* Regroupement par état, comme la maquette : on lit d'abord ce
                 qui reste à faire (brouillons, planifiées), puis l'historique. */
              <>
                {(["draft", "scheduled", "sent", "failed"] as const).map((etat) => {
                  const lot = affichees.filter((c) => c.status === etat);
                  if (!lot.length) return null;
                  const titres: Record<string, string> = {
                    draft: "Brouillons", scheduled: "Planifiées",
                    sent: "Envoyées", failed: "En échec",
                  };
                  return (
                    <section className="nl-groupe" key={etat}>
                      <h2 className="nl-groupe-tete">{titres[etat]}
                        <span className="adm-vit-nb">{lot.length} campagne{lot.length > 1 ? "s" : ""}</span>
                      </h2>
                      {lot.map((c) => {
                        const st = STATUS_LABELS[c.status] || { label: c.status, cls: "" };
                        const cibles = c.recipients_count;
                        const dateLbl = c.status === "scheduled" && c.scheduled_at
                          ? <span className="nl-l-planif">→ {fmtDatetime(c.scheduled_at)}</span>
                          : <span>{fmtDatetime(c.sent_at || c.scheduled_at) || "—"}</span>;
                        const img = premiereImage(c.content);
                        return (
                          <div className="nl-l" key={c.id}>
                            <span className={`nl-l-vignette${img ? "" : " vide"}`}>
                              {img ? <img src={img} alt="" loading="lazy" />
                                   : <span aria-hidden="true">{(c.subject || "?").trim().charAt(0).toUpperCase()}</span>}
                            </span>

                            <span className="nl-l-ident">
                              <b title={c.subject}>{c.subject}</b>
                              <span className="nl-l-meta">
                                {cibles != null ? `${cibles} destinataire${cibles > 1 ? "s" : ""}` : "à envoyer"}
                                {!cibleUnique && ` · ${SEGMENTS[c.segment]?.label || c.segment}`}
                                {c.folder && ` · ${c.folder}`}
                                {/* Clics : personnes distinctes ayant cliqué au moins un lien
                                    (webhook Resend). Absent = pas de donnée, pas un zéro. */}
                                {c.status === "sent" && stats[c.id] != null && ` · ${stats[c.id].clicks} clic${stats[c.id].clicks > 1 ? "s" : ""}`}
                              </span>
                              {c.status === "sent" && c.sent_count != null && cibles != null && c.sent_count < cibles && (
                                <span className="nl-l-alerte">{c.sent_count} / {cibles} envoyés</span>
                              )}
                              {c.error_message && <span className="nl-l-alerte">{c.error_message.slice(0, 70)}</span>}
                            </span>

                            <span className={`nl-l-tag tag ${st.cls}`}>{st.label}</span>
                            <span className="nl-l-date">{dateLbl}</span>

                            <span className="nl-l-actions">
                              {c.status === "sent" && (
                                <button className="btn btn-mini btn-ligne" onClick={() => setFiche(c)}>Statistiques</button>
                              )}
                              {c.status === "draft" && (
                                <button className="btn btn-mini btn-ligne" onClick={() => reprendre(c)}>Reprendre</button>
                              )}
                              {c.status === "scheduled" && (
                                <button className="btn btn-mini btn-ligne" onClick={() => annuler(c)}>Annuler l'envoi</button>
                              )}
                              {TEMPLATES[c.template] && (
                                <button className="adm-vit-lien" onClick={() => dupliquer(c)}>Dupliquer</button>
                              )}
                              {/* Une campagne envoyée n'est pas supprimable : elle porte
                                  l'historique et les statistiques. Règle conservée. */}
                              {(c.status === "draft" || c.status === "failed") && (
                                <button className="adm-vit-lien danger" onClick={() => supprimer(c)}>Supprimer</button>
                              )}
                              {/* Le rangement en dossier reste au menu : il ouvre une
                                  liste variable, qui n'a pas sa place en ligne. */}
                              <span className="carte-menu">
                                <button className="nl-menu-btn" aria-label={`Autres actions pour ${c.subject}`}
                                  aria-haspopup="true" aria-expanded={menuOuvert === c.id}
                                  onClick={() => setMenuOuvert(menuOuvert === c.id ? null : c.id)}>⋯</button>
                                {menuOuvert === c.id && (
                                  <div className="nl-menu" role="menu">
                                    {c.status === "draft" && (
                                      <button role="menuitem" onClick={() => { setMenuOuvert(null); envoyer(c); }}>Envoyer maintenant</button>
                                    )}
                                    {dossiers.filter((d) => d !== c.folder).map((d) => (
                                      <button role="menuitem" key={d} onClick={() => deplacer(c, d)}>Ranger dans « {d} »</button>
                                    ))}
                                    <button role="menuitem" onClick={() => deplacerVersNouveau(c)}>Nouveau dossier…</button>
                                    {c.folder && (
                                      <button role="menuitem" onClick={() => deplacer(c, null)}>Retirer du dossier</button>
                                    )}
                                  </div>
                                )}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
              </>
            )}
          </>
        )}

        {fiche && (
          <FicheCampagne campagne={fiche} stats={stats[fiche.id]} premierEvt={premierEvt}
            onClose={() => setFiche(null)} />
        )}
      </div>
    </>
  );
}
