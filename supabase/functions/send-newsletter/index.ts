import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL       = Deno.env.get("RESERVATION_FROM_EMAIL") || "onboarding@resend.dev";
const RESTO_NAME       = Deno.env.get("RESTO_NAME") || "Le restaurant";
const SITE_URL         = Deno.env.get("SITE_URL") || "#";
const ACCENT_COLOR     = Deno.env.get("ACCENT_COLOR") || "#84B266";
const ACCENT_DARK      = Deno.env.get("ACCENT_DARK") || "#84B266";
const INK              = "#333333";
const RESTO_ADDRESS    = Deno.env.get("RESTO_ADDRESS") || "";

const HERO_IMAGE_URL   = Deno.env.get("HERO_IMAGE_URL") || "";
const TAGLINE          = Deno.env.get("TAGLINE") || "";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(e: string): boolean { return EMAIL_RE.test(e.trim()); }

function esc(s: string): string {
  return String(s || "").replace(/[<>&"]/g, (c: string) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string)
  );
}

async function getLogoUrl(): Promise<string> {
  const { data } = await db.from("site_content").select("content").eq("section_key", "newsletter_logo").maybeSingle();
  return (data?.content as any)?.url || "";
}

async function getOptinRecipients(): Promise<{ email: string; name: string; token: string }[]> {
  const { data } = await db.from("leads").select("email,first_name,last_name,unsubscribe_token").eq("consent", true);
  const seen = new Set<string>();
  const out: { email: string; name: string; token: string }[] = [];
  (data || []).forEach((r: any) => {
    const e = (r.email || "").trim().toLowerCase();
    if (!e || seen.has(e) || !isValidEmail(e)) return;
    seen.add(e);
    out.push({ email: e, name: `${r.first_name||""} ${r.last_name||""}`.trim(), token: r.unsubscribe_token || "" });
  });
  return out;
}

async function getVipEmails(): Promise<Set<string>> {
  const { data } = await db.from("customers").select("email").eq("is_vip", true);
  const set = new Set<string>();
  (data || []).forEach((r: any) => { const e = (r.email||"").trim().toLowerCase(); if (e) set.add(e); });
  return set;
}

// Emails des clients absents depuis au moins minMois, et depuis moins de
// maxMois s'il est fourni. Sans maxMois, la tranche est OUVERTE (7 mois et
// plus) : personne ne sort du radar, quelle que soit l'ancienneté.
// Doit rester cohérent avec newsletter_segment_counts() côté base.
async function getInactifEmails(minMois: number, maxMois?: number): Promise<Set<string>> {
  const borneRecente = new Date();          // last_visit <= aujourd'hui - minMois
  borneRecente.setMonth(borneRecente.getMonth() - minMois);
  let q = db.from("customers")
    .select("email,last_visit")
    .not("last_visit", "is", null)
    .lte("last_visit", borneRecente.toISOString().slice(0, 10));
  if (maxMois !== undefined) {
    const borneAncienne = new Date();       // last_visit > aujourd'hui - maxMois
    borneAncienne.setMonth(borneAncienne.getMonth() - maxMois);
    q = q.gt("last_visit", borneAncienne.toISOString().slice(0, 10));
  }
  const { data } = await q;
  const set = new Set<string>();
  (data || []).forEach((r: any) => { const e = (r.email||"").trim().toLowerCase(); if (e) set.add(e); });
  return set;
}

// Emails des clients selon leur nombre de réservations honorées.
// (min, max) inclusifs ; max omis = pas de limite haute.
async function getParVisitesEmails(min: number, max?: number): Promise<Set<string>> {
  let q = db.from("customers").select("email,bookings_count").gte("bookings_count", min);
  if (max !== undefined) q = q.lte("bookings_count", max);
  const { data } = await q;
  const set = new Set<string>();
  (data || []).forEach((r: any) => { const e = (r.email||"").trim().toLowerCase(); if (e) set.add(e); });
  return set;
}

async function getRecipients(segment: string): Promise<{ email: string; name: string; token: string }[]> {
  const optin = await getOptinRecipients();
  if (segment === "optin") return optin;
  if (segment === "optin_vip") { const vip = await getVipEmails(); return optin.filter(r => vip.has(r.email)); }
  // Absence notable, relance encore facile (3 à 6 mois révolus)
  if (segment === "inactif_3_6") {
    const emails = await getInactifEmails(3, 7);
    return optin.filter(r => emails.has(r.email));
  }
  // Reconquête : 7 mois et plus, sans limite haute
  if (segment === "inactif_7") {
    const emails = await getInactifEmails(7);
    return optin.filter(r => emails.has(r.email));
  }
  // Habitués : 3 réservations honorées ou plus
  if (segment === "habitues") {
    const emails = await getParVisitesEmails(3);
    return optin.filter(r => emails.has(r.email));
  }
  // Ont testé une seule fois et ne sont pas revenus
  if (segment === "une_visite") {
    const emails = await getParVisitesEmails(1, 1);
    return optin.filter(r => emails.has(r.email));
  }
  return [];
}

// Footer avec uniquement le lien de désinscription (pas de lien miroir)
function footer(unsubscribeToken: string): string {
  const unsubUrl = unsubscribeToken
    ? `${SITE_URL}/desinscription?token=${esc(unsubscribeToken)}`
    : `${esc(SITE_URL)}/desinscription`;
  return `<tr><td class="px" style="padding:24px 44px 28px 44px;background-color:#F4F2EB;border-top:1px solid #E4E2D8;font-family:Arial,Helvetica,sans-serif;">
  <p style="margin:0 0 8px 0;font-size:13px;color:#7A7A70;text-align:center;"><strong style="color:${ACCENT_DARK};">${esc(RESTO_NAME)}</strong>${TAGLINE?` &mdash; ${esc(TAGLINE)}`:""}</p>
  <p style="margin:0 0 10px 0;font-size:12px;color:#9A9A8E;text-align:center;">Vous recevez cet email car vous \u00eates inscrit\u00b7e \u00e0 nos actualit\u00e9s.</p>
  <p style="margin:0;font-size:12px;color:#9A9A8E;text-align:center;">
    <a href="${unsubUrl}" style="color:#9A9A8E;text-decoration:underline;">Se d\u00e9sinscrire</a>
  </p>
</td></tr>`;
}

function layout({ preheader, title, headerBand, body, footerHtml, logoUrl, showLogo = true }: { preheader: string; title: string; headerBand: string; body: string; footerHtml: string; logoUrl: string; showLogo?: boolean }): string {
  const logoBlock = showLogo && logoUrl
    ? `<tr><td align="center" style="padding:32px 40px 18px 40px;background-color:#FFFFFF;"><img src="${esc(logoUrl)}" alt="${esc(RESTO_NAME)}" width="180" style="width:180px;max-width:180px;height:auto;display:block;margin:0 auto;"/></td></tr>`
    : `<tr><td align="center" style="padding:28px 40px 14px 40px;background-color:#FFFFFF;"><p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1d1a16;">${esc(RESTO_NAME)}</p></td></tr>`;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "https://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/><meta name="x-apple-disable-message-reformatting"/><meta name="color-scheme" content="light only"/><title>${esc(title)}</title>
<!--[if mso]><style>body,table,td,p,a{font-family:Georgia,'Times New Roman',serif!important;}</style><![endif]-->
<style>body{margin:0!important;padding:0!important;background-color:#ECEAE1;}table{border-collapse:collapse!important;}img{border:0;display:block;}a{text-decoration:none;}@media only screen and (max-width:620px){.email-container{width:100%!important;}.px{padding-left:26px!important;padding-right:26px!important;}.h1{font-size:27px!important;}.btn-a{display:block!important;}}</style></head>
<body style="margin:0;padding:0;background-color:#ECEAE1;">
<div style="display:none;font-size:1px;max-height:0;overflow:hidden;">${esc(preheader)}&#8199;&#8203;&#8199;&#8203;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ECEAE1;"><tr><td align="center" style="padding:28px 14px;">
<!--[if mso]><table align="center" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
<table role="presentation" class="email-container" align="center" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(80,100,60,.10);">
<tr><td height="6" style="height:6px;line-height:6px;font-size:6px;background-color:${ACCENT_COLOR};">&nbsp;</td></tr>
${logoBlock}${headerBand}${body}${footerHtml}</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

function ctaBtn(label: string, url: string): string {
  return `<tr><td align="center" class="px" style="padding:22px 44px 10px 44px;background-color:#FFFFFF;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(url)}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="60%" stroke="f" fillcolor="${ACCENT_COLOR}"><w:anchorlock/><center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="${esc(url)}" class="btn-a" style="background-color:${ACCENT_COLOR};color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;letter-spacing:.5px;line-height:50px;text-align:center;text-decoration:none;border-radius:28px;display:inline-block;padding:0 38px;">${label}</a><!--<![endif]--></td></tr>`;
}
function heroImage(alt: string, imageUrl?: string): string {
  const src = imageUrl || HERO_IMAGE_URL;
  if (!src) return "";
  return `<tr><td style="font-size:0;line-height:0;"><img src="${esc(src)}" alt="${esc(alt)}" width="600" style="width:100%;max-width:600px;height:auto;display:block;"/></td></tr>`;
}
function signoff(): string {
  return `<tr><td class="px" style="padding:20px 44px 40px 44px;background-color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0 0 4px 0;font-size:16px;color:#4A4A45;">\u00c0 tr\u00e8s bient\u00f4t,</p><p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${ACCENT_DARK};font-style:italic;">${esc(RESTO_NAME)}</p></td></tr>`;
}


/* ══════════════════════════════════════════════════════════════════════
   MOTEUR DE BLOCS — campagnes libres (template "blocs")
   Le restaurateur empile des blocs 1 ou 2 colonnes. Structure HTML email
   reprise du template maison : tables imbriquées + conditionnels MSO.
   ══════════════════════════════════════════════════════════════════════ */

// Bouton CTA (table imbriquée : seul rendu fiable sur Outlook)
function blocCta(label: string, url: string, largeur = 200): string {
  if (!label || !url) return "";
  return `<tr><td align="center" style="font-size:0; padding:14px 30px 4px 30px;">
    <table cellspacing="0" cellpadding="0"><tr>
      <td align="center" height="38" bgcolor="${ACCENT_COLOR}" style="border-radius:5px; display:block;">
        <table cellspacing="0" cellpadding="0" height="38" width="${largeur}" bgcolor="${ACCENT_COLOR}" style="width:${largeur}px;border-radius:5px;display:block;mso-cellspacing:0px;mso-padding-alt:0px 0px 0px 0px;"><tr>
          <td align="center" valign="middle" width="20" style="width:20px;"></td>
          <td align="center" valign="middle" width="100%" height="38" style="width:100%;height:38px;font-size:16px;font-family:Arial,Sans-Serif;color:#ffffff;text-decoration:none;text-align:center;">
            <a title="${esc(label)}" target="_blank" style="font-size:16px;font-family:Arial,Sans-Serif;color:#ffffff;text-decoration:none;display:block;" href="${esc(url)}"><strong>${esc(label)}</strong></a>
          </td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>`;
}

// Paragraphes : chaque saut de ligne devient un bloc de texte
function blocParas(texte: string, largeur: number): string {
  return String(texte || "").split(/\n+/).filter((t: string) => t.trim())
    .map((t: string) => `<div style="display:block; max-width:${largeur}px; text-align:left; width:100%; line-height:initial; padding:14px 0 0 0;">
      <font style="font-family:Arial,sans-serif; font-size:14px; line-height:22px; color:${INK}">${esc(t)}</font></div>`).join("");
}

// Bloc pleine largeur : image ? titre ? texte ? CTA ?
function blocPleineLargeur(b: any): string {
  // alt : champ dédié, repli sur le titre. Crucial en email — beaucoup de clients
  // bloquent les images par défaut, l'alt est alors tout ce que le lecteur voit.
  const img = b.image ? `<tr><td align="center" style="font-size:0; padding:0;">
    <img width="600" alt="${esc(b.image_alt || b.titre || "")}" style="display:block; line-height:0; max-width:100%; width:600px; height:auto;" border="0" src="${esc(b.image)}" /></td></tr>` : "";
  const titre = b.titre ? `<div style="display:block; max-width:560px; text-align:left; width:100%; line-height:initial;">
    <font style="font-family:Arial,sans-serif; font-size:16px; color:${INK}"><strong>${esc(b.titre)}</strong></font></div>` : "";
  const corps = (titre || b.texte) ? `<tr><td style="font-size:0; padding:30px 30px 20px 30px;" align="center">
    <!--[if (gte mso 9)|(IE)]><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td width="560" align="center" style="text-align:left;"><![endif]-->
    ${titre}${blocParas(b.texte, 560)}
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>` : "";
  return `<table border="0" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;"><tbody>
    ${img}${corps}${blocCta(b.cta_label, b.cta_url, 200)}
  </tbody></table>`;
}

// Une colonne d'un bloc 2 colonnes
function colonne(col: any): string {
  // padding 10px autour de l'image (demande client) — l'image ne colle ni au bord ni à sa voisine
  const img = col.image ? `<tr><td align="center" style="font-size:0; padding:10px;">
    <img width="280" alt="${esc(col.image_alt || col.titre || "")}" style="display:block; line-height:0; max-width:100%; width:100%; height:auto;" border="0" src="${esc(col.image)}" /></td></tr>` : "";
  const titre = col.titre ? `<div style="display:block; max-width:300px; text-align:left; width:100%; line-height:initial;">
    <font style="font-family:Arial,sans-serif; font-size:16px; color:${INK}"><strong>${esc(col.titre)}</strong></font></div>` : "";
  const corps = (titre || col.texte) ? `<tr><td style="font-size:0; padding:20px 30px 20px 30px;" align="center">
    <!--[if (gte mso 9)|(IE)]><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td width="300" align="center" style="text-align:left;"><![endif]-->
    ${titre}${blocParas(col.texte, 300)}
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>` : "";
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tbody>
    ${img}${corps}${blocCta(col.cta_label, col.cta_url, 180)}
  </tbody></table>`;
}

// Bloc 2 colonnes — structure du template maison :
// deux <td> côte à côte + class="stack-column" qui les empile sous 475px
// (media query définie dans layoutBlocs). Approche "hybride", contrôle explicite
// du point de bascule, plutôt qu'un stacking implicite par inline-block.
function blocDeuxColonnes(b: any): string {
  const g = b.colonnes?.[0] || {};
  const d = b.colonnes?.[1] || {};
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="max-width:600px; width:100%;">
    <tbody><tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" align="center" style="max-width:600px; width:100%;">
          <tbody><tr>
            <td width="300" align="center" valign="top" class="stack-column" style="padding:0;">${colonne(g)}</td>
            <td width="300" align="center" valign="top" class="stack-column" style="padding:0;">${colonne(d)}</td>
          </tr></tbody>
        </table>
      </td>
    </tr></tbody>
  </table>`;
}

// Assemble une campagne "blocs" complète
function renderBlocs(c: any, name: string, logoUrl: string, token: string): string {
  const blocs: any[] = Array.isArray(c.blocs) ? c.blocs : [];

  const corps = blocs.map((b) => b?.type === "deux_colonnes" ? blocDeuxColonnes(b) : blocPleineLargeur(b)).join("");

  return layoutBlocs({
    preheader: c.preheader || c.titre || RESTO_NAME,
    title: c.titre || RESTO_NAME,
    contenu: corps,
    logoUrl,
    token,
  });
}

// Enveloppe : logo, contenu, footer. Structure du template maison.
function layoutBlocs({ preheader, title, contenu, logoUrl, token }: { preheader: string; title: string; contenu: string; logoUrl: string; token: string }): string {
  // Le logo renvoie toujours vers le site du restaurateur.
  const logo = logoUrl ? `<table border="0" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;"><tbody><tr>
    <td align="center" style="font-size:0; padding:0;">
      <a href="${esc(SITE_URL)}" target="_blank" title="${esc(RESTO_NAME)}" style="text-decoration:none;">
        <img width="200" alt="${esc(RESTO_NAME)}" style="display:block; line-height:0; max-width:100%; width:200px; height:auto; border:0;" border="0" src="${esc(logoUrl)}" />
      </a>
    </td></tr></tbody></table>` : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style type="text/css">
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  table { border-collapse:collapse !important; }
  /* Empilement des colonnes sous 475px — seuil du template maison.
     Les deux <td class="stack-column"> passent en pleine largeur, l'un sous l'autre. */
  @media only screen and (max-width:475px) {
    .stack-column {
      display: inline-block !important;
      width: 100% !important;
      max-width: 100% !important;
    }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f4f2ec;">
<div style="display:none; font-size:1px; color:#f4f2ec; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">${esc(preheader)}</div>
<div style="background-color:#f4f2ec; padding:0;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f2ec;"><tbody><tr>
<td align="center" style="padding:20px 10px;">
  <table width="600" border="0" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff;"><tbody><tr>
    <td align="center" style="font-size:0; padding:10px 0;">
      ${logo}
      ${contenu}
      ${footerBlocs(token)}
    </td>
  </tr></tbody></table>
</td>
</tr></tbody></table>
</div>
</body></html>`;
}

// Footer — structure du template maison + mentions légales obligatoires
function footerBlocs(token: string): string {
  // La page /desinscription du site fait le POST vers l'edge function.
  // NE PAS pointer l'edge directement : elle attend un POST JSON, pas un GET.
  const unsubUrl = token
    ? `${SITE_URL}/desinscription?token=${esc(token)}`
    : `${esc(SITE_URL)}/desinscription`;
  return `<table border="0" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; margin-top:20px;"><tbody>
    <tr><td align="center" style="font-size:0; padding:0 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e4e2d8; font-size:0; line-height:0;">&nbsp;</td></tr></table>
    </td></tr>
    <tr><td align="center" style="padding:22px 30px 8px 30px;">
      <font style="font-family:Arial,sans-serif; font-size:15px; color:${INK}"><strong>${esc(RESTO_NAME)}</strong></font>
    </td></tr>
    <tr><td align="center" style="padding:0 30px 18px 30px;">
      <font style="font-family:Arial,sans-serif; font-size:13px; line-height:20px; color:#6b6358;">${esc(RESTO_ADDRESS)}</font>
    </td></tr>
    <tr><td align="center" style="padding:6px 30px 24px 30px;">
      <font style="font-family:Arial,sans-serif; font-size:11px; line-height:18px; color:#9a9189;">
        Vous recevez cet e-mail car vous êtes inscrit à notre newsletter.<br/>
        <a href="${unsubUrl}" style="color:#9a9189; text-decoration:underline;">Se désinscrire</a>
      </font>
    </td></tr>
  </tbody></table>`;
}


function renderTemplate(template: string, c: any, name: string, logoUrl: string, token: string): string {
  // Campagnes libres (nouveau système de blocs)
  if (template === "blocs") return renderBlocs(c, name, logoUrl, token);

  const ft = footer(token);
  const prenom = name.split(" ")[0] || "";

  if (template === "welcome") {
    const hb = `<tr><td align="center" style="padding:30px 44px 32px 44px;background-color:${ACCENT_COLOR};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="font-family:Georgia,serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.75);padding-bottom:10px;">Bienvenue</td></tr><tr><td align="center" class="h1" style="font-family:Georgia,serif;font-size:30px;line-height:38px;color:#FFFFFF;font-weight:normal;">Bienvenue chez ${esc(RESTO_NAME)}&nbsp;!</td></tr><tr><td align="center" style="padding-top:16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:0;border-top:1px solid rgba(255,255,255,.45);width:48px;">&nbsp;</td></tr></table></td></tr></table></td></tr>`;
    const b = `${heroImage("Photo")}<tr><td class="px" style="padding:36px 44px 6px 44px;background-color:#FFFFFF;font-family:Arial,sans-serif;">${prenom?`<p style="margin:0 0 20px 0;font-family:Georgia,serif;font-size:20px;color:#3A4A2C;">Bonjour ${esc(prenom)},</p>`:""}<p style="margin:0 0 18px 0;font-size:16px;line-height:26px;color:#4A4A45;">Merci de votre inscription. Vous faites maintenant partie de nos proches et serez les premiers informés de nos actualités, nouveaux menus et événements.</p>${c.message?`<p style="margin:0 0 8px 0;font-size:16px;line-height:26px;color:#4A4A45;">${esc(c.message)}</p>`:""}</td></tr>${ctaBtn("Découvrir le restaurant",SITE_URL)}${signoff()}`;
    return layout({ preheader: `Bienvenue chez ${RESTO_NAME} — vous faites désormais partie de nos proches.`, title: `Bienvenue chez ${RESTO_NAME}`, headerBand: hb, body: b, footerHtml: ft, logoUrl, showLogo: true });
  }
  if (template === "evenementiel") {
    const hb = `<tr><td align="center" style="padding:30px 44px 32px 44px;background-color:${ACCENT_COLOR};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${c.eyebrow?`<tr><td align="center" style="font-family:Georgia,serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.75);padding-bottom:10px;">${esc(c.eyebrow)}</td></tr>`:""}<tr><td align="center" class="h1" style="font-family:Georgia,serif;font-size:30px;line-height:38px;color:#FFFFFF;font-weight:normal;">${esc(c.titre||"Un événement")}</td></tr></table></td></tr>`;
    const b = `${heroImage(c.titre||"",c.image_url)}<tr><td class="px" style="padding:36px 44px 6px 44px;background-color:#FFFFFF;font-family:Arial,sans-serif;">${prenom?`<p style="margin:0 0 18px 0;font-family:Georgia,serif;font-size:20px;color:#3A4A2C;">Bonjour ${esc(prenom)},</p>`:""} ${c.date_event?`<p style="margin:0 0 18px 0;display:inline-block;background:#f3f0e7;padding:8px 18px;border-radius:6px;font-size:14px;font-weight:bold;color:#1d1a16;">\ud83d\udcc5 ${esc(c.date_event)}</p>`:""}<p style="margin:0 0 6px 0;font-size:16px;line-height:26px;color:#4A4A45;">${esc(c.description||"")}</p></td></tr>${c.cta_label&&c.cta_url?ctaBtn(c.cta_label,c.cta_url):""}${signoff()}`;
    return layout({ preheader: c.preheader||c.titre||RESTO_NAME, title: c.titre||RESTO_NAME, headerBand: hb, body: b, footerHtml: ft, logoUrl });
  }
  if (template === "nouveau_menu") {
    const hb = `<tr><td align="center" style="padding:30px 44px 32px 44px;background-color:${ACCENT_COLOR};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="font-family:Georgia,serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.75);padding-bottom:10px;">Nouvelle carte</td></tr><tr><td align="center" class="h1" style="font-family:Georgia,serif;font-size:30px;line-height:38px;color:#FFFFFF;font-weight:normal;">${esc(c.titre||"Notre nouvelle carte")}</td></tr>${c.sous_titre?`<tr><td align="center" style="padding-top:12px;font-family:Georgia,serif;font-size:15px;line-height:22px;color:rgba(255,255,255,.85);font-style:italic;">${esc(c.sous_titre)}</td></tr>`:""}</table></td></tr>`;
    // 1 à 3 plats empilés : image pleine largeur puis nom + description.
    // Repli sans image : simple filet séparateur (jamais l'image d'un autre plat).
    let plats = "";
    for (let i = 1; i <= 3; i++) {
      const nom = (c[`plat${i}_nom`] || "").trim();
      if (!nom) continue;
      const img = c[`plat${i}_image`] || "";
      const desc = c[`plat${i}_desc`] || "";
      if (img) {
        plats += `<tr><td style="font-size:0;line-height:0;padding-top:20px;"><img src="${esc(img)}" alt="${esc(nom)}" width="600" style="width:100%;max-width:600px;height:auto;display:block;"/></td></tr>`;
      } else if (plats) {
        plats += `<tr><td class="px" style="padding:22px 44px 0 44px;background-color:#FFFFFF;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="font-size:0;border-top:1px solid #E4E2D8;">&nbsp;</td></tr></table></td></tr>`;
      }
      plats += `<tr><td class="px" style="padding:${img?"16px":"14px"} 44px 4px 44px;background-color:#FFFFFF;font-family:Arial,sans-serif;"><p style="margin:0 0 5px 0;font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:26px;color:#3A4A2C;">${esc(nom)}</p>${desc?`<p style="margin:0;font-size:14px;line-height:22px;color:#6A6A60;">${esc(desc)}</p>`:""}</td></tr>`;
    }
    // Rétro-compatibilité : anciennes campagnes avec plat_vedette (encart)
    if (!plats && c.plat_vedette) {
      plats = `<tr><td class="px" style="padding:16px 44px 4px 44px;background-color:#FFFFFF;"><table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f0e7;border-radius:10px;"><tr><td style="padding:18px 22px;"><p style="margin:0 0 5px 0;font-size:11px;text-transform:uppercase;color:#9a9189;font-family:Arial,sans-serif;">À l'honneur</p><p style="margin:0 0 4px 0;font-family:Georgia,serif;font-size:18px;color:#1d1a16;">${esc(c.plat_vedette)}</p>${c.plat_description?`<p style="margin:0;font-size:13px;color:#6b6358;font-family:Arial,sans-serif;">${esc(c.plat_description)}</p>`:""}</td></tr></table></td></tr>`;
    }
    const citation = c.citation ? `<tr><td class="px" style="padding:22px 44px 4px 44px;background-color:#FFFFFF;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-left:3px solid ${ACCENT_COLOR};padding-left:20px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:24px;color:#5A6A4A;font-style:italic;">« ${esc(c.citation)} »</td></tr></table></td></tr>` : "";
    const b = `<tr><td class="px" style="padding:36px 44px 6px 44px;background-color:#FFFFFF;font-family:Arial,sans-serif;">${prenom?`<p style="margin:0 0 18px 0;font-family:Georgia,serif;font-size:20px;color:#3A4A2C;">Bonjour ${esc(prenom)},</p>`:""}<p style="margin:0;font-size:16px;line-height:26px;color:#4A4A45;">${esc(c.intro||"")}</p></td></tr>${plats}${citation}${c.cta_label&&c.cta_url?ctaBtn(c.cta_label,c.cta_url):ctaBtn(c.cta_label||"Voir la carte",c.cta_url||SITE_URL)}${signoff()}`;
    return layout({ preheader: c.preheader||c.titre||RESTO_NAME, title: c.titre||RESTO_NAME, headerBand: hb, body: b, footerHtml: ft, logoUrl });
  }
  // vie_resto (et repli pour tout template inconnu)
  const hb = `<tr><td align="center" style="padding:30px 44px 32px 44px;background-color:${ACCENT_COLOR};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="font-family:Georgia,serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.75);padding-bottom:10px;">${esc(c.eyebrow||"Vie du restaurant")}</td></tr><tr><td align="center" class="h1" style="font-family:Georgia,serif;font-size:30px;line-height:38px;color:#FFFFFF;font-weight:normal;">${esc(c.titre||"Actualité")}</td></tr></table></td></tr>`;
  // Texte multi-paragraphes : chaque saut de ligne devient un paragraphe
  const paras = String(c.texte||"").split(/\n+/).filter((p: string) => p.trim())
    .map((p: string) => `<p style="margin:0 0 18px 0;font-size:16px;line-height:26px;color:#4A4A45;">${esc(p)}</p>`).join("");
  const aRetenir = c.a_retenir ? `<tr><td class="px" style="padding:0 44px 8px 44px;background-color:#FFFFFF;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="background-color:#f3f0e7;border-radius:10px;padding:20px 22px;border-left:4px solid ${ACCENT_COLOR};"><p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${ACCENT_DARK};">À retenir</p><p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:24px;color:#3A4A2C;">${esc(c.a_retenir)}</p></td></tr></table></td></tr>` : "";
  const b = `${heroImage(c.titre||"",c.image_url)}<tr><td class="px" style="padding:36px 44px 6px 44px;background-color:#FFFFFF;font-family:Arial,sans-serif;">${prenom?`<p style="margin:0 0 18px 0;font-family:Georgia,serif;font-size:20px;color:#3A4A2C;">Bonjour ${esc(prenom)},</p>`:""}${paras}</td></tr>${aRetenir}${c.cta_label&&c.cta_url?ctaBtn(c.cta_label,c.cta_url):""}${signoff()}`;
  return layout({ preheader: c.preheader||c.titre||RESTO_NAME, title: c.titre||RESTO_NAME, headerBand: hb, body: b, footerHtml: ft, logoUrl });
}

async function sendBatch(emails: any[]): Promise<{ ok: boolean; errors: string[] }> {
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
  });
  if (!res.ok) { const d = await res.json(); return { ok: false, errors: [JSON.stringify(d)] }; }
  return { ok: true, errors: [] };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const { campaign_id, override_email, override_name } = body;
    if (!campaign_id) return new Response(JSON.stringify({ error: "campaign_id requis" }), { status: 400, headers: cors });

    // ── MODE TEST ────────────────────────────────────────────────────────────
    // Un test (override_email) ne doit AVOIR AUCUN effet de bord :
    //  - il n'altère pas le statut de la campagne (elle reste draft/scheduled et
    //    pourra être envoyée pour de vrai ensuite) ;
    //  - il fonctionne sur un brouillon (c'est justement le moment où on teste) ;
    //  - il n'est pas comptabilisé dans newsletter_sends (stats non faussées).
    const estTest = !!override_email;

    let camp: any;
    if (estTest) {
      if (!isValidEmail(override_email)) {
        return new Response(JSON.stringify({ error: "Adresse e-mail invalide" }), { status: 400, headers: cors });
      }
      const { data, error } = await db.from("newsletter_campaigns").select("*").eq("id", campaign_id).single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Campagne introuvable" }), { status: 404, headers: cors });
      }
      camp = data; // aucun changement de statut
    } else {
      const { data: updated, error: lockErr } = await db
        .from("newsletter_campaigns")
        .update({ status: "sending" })
        .eq("id", campaign_id)
        .in("status", ["scheduled", "sending"])
        .not("status", "eq", "sent")
        .select()
        .single();
      if (lockErr || !updated) {
        return new Response(JSON.stringify({ error: "Campagne introuvable ou d\u00e9j\u00e0 envoy\u00e9e" }), { status: 409, headers: cors });
      }
      camp = updated;
    }

    const logoUrl = await getLogoUrl();

    let recipients: { email: string; name: string; token: string }[];
    if (estTest) {
      // Token de désinscription réel si l'adresse est un lead connu, sinon vide
      // (le lien pointera alors vers la page de désinscription sans token).
      const { data: lead } = await db.from("leads").select("unsubscribe_token").eq("email", override_email.toLowerCase()).maybeSingle();
      recipients = [{ email: override_email, name: override_name || "", token: lead?.unsubscribe_token || "" }];
    } else {
      recipients = await getRecipients(camp.segment);
    }

    if (recipients.length === 0) {
      if (!estTest) {
        await db.from("newsletter_campaigns").update({ status: "sent", sent_at: new Date().toISOString(), recipients_count: 0, sent_count: 0 }).eq("id", campaign_id);
      }
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: cors });
    }

    let totalSent = 0;
    const sendErrors: string[] = [];
    const sendRecords: any[] = [];
    for (let i = 0; i < recipients.length; i += 100) {
      const batch = recipients.slice(i, i + 100);
      const emails = batch.map((r) => ({
        from: `${RESTO_NAME} <${FROM_EMAIL}>`,
        to: [r.email],
        subject: camp.subject,
        html: renderTemplate(camp.template, camp.content, r.name, logoUrl, r.token),
      }));
      const result = await sendBatch(emails);
      if (result.ok) { totalSent += batch.length; batch.forEach((r) => sendRecords.push({ campaign_id, email: r.email, name: r.name })); }
      else { sendErrors.push(...result.errors); batch.forEach((r) => sendRecords.push({ campaign_id, email: r.email, name: r.name, error: result.errors[0] })); }
      if (i + 100 < recipients.length) await new Promise((r) => setTimeout(r, 300));
    }
    // En mode test : aucune trace en base (ni stats d'envoi, ni changement de statut).
    // La campagne reste exactement dans l'état où elle était.
    if (!estTest) {
      if (sendRecords.length > 0) await db.from("newsletter_sends").insert(sendRecords);
      const finalStatus = sendErrors.length === 0 ? "sent" : (totalSent > 0 ? "sent" : "failed");
      await db.from("newsletter_campaigns").update({
        status: finalStatus, sent_at: new Date().toISOString(),
        recipients_count: recipients.length, sent_count: totalSent,
        error_message: sendErrors.length > 0 ? sendErrors.join(" | ") : null,
      }).eq("id", campaign_id);
    }
    if (estTest && sendErrors.length > 0) {
      return new Response(JSON.stringify({ error: sendErrors.join(" | ") }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, sent: totalSent, total: recipients.length, test: estTest }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
