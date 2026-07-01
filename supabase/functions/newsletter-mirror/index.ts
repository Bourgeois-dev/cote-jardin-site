import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESTO_NAME       = Deno.env.get("RESTO_NAME") || "Le restaurant";
const SITE_URL         = Deno.env.get("SITE_URL") || "#";
const ACCENT_COLOR     = Deno.env.get("ACCENT_COLOR") || "#84B266";
const ACCENT_DARK      = Deno.env.get("ACCENT_DARK") || "#84B266";
const HERO_IMAGE_URL   = Deno.env.get("HERO_IMAGE_URL") || "";
const TAGLINE          = Deno.env.get("TAGLINE") || "";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: string): string {
  return String(s || "").replace(/[<>&"]/g, (c: string) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string)
  );
}

async function getLogoUrl(): Promise<string> {
  const { data } = await db.from("site_content").select("content").eq("section_key", "newsletter_logo").maybeSingle();
  return (data?.content as any)?.url || "";
}

function ctaBtn(label: string, url: string): string {
  return `<tr><td align="center" style="padding:22px 44px 10px 44px;background-color:#FFFFFF;"><a href="${esc(url)}" style="background-color:${ACCENT_COLOR};color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;letter-spacing:.5px;line-height:50px;text-align:center;text-decoration:none;border-radius:28px;display:inline-block;padding:0 38px;">${label}</a></td></tr>`;
}
function heroImg(alt: string, src?: string): string {
  const url = src || HERO_IMAGE_URL;
  if (!url) return "";
  return `<tr><td style="font-size:0;line-height:0;"><img src="${esc(url)}" alt="${esc(alt)}" width="600" style="width:100%;max-width:600px;height:auto;display:block;"/></td></tr>`;
}
function signoff(): string {
  return `<tr><td style="padding:20px 44px 40px 44px;background-color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0 0 4px 0;font-size:16px;color:#4A4A45;">\u00c0 tr\u00e8s bient\u00f4t,</p><p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${ACCENT_DARK};font-style:italic;">${esc(RESTO_NAME)}</p></td></tr>`;
}
function footer(): string {
  return `<tr><td style="padding:24px 44px 28px 44px;background-color:#F4F2EB;border-top:1px solid #E4E2D8;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0 0 8px 0;font-size:13px;color:#7A7A70;text-align:center;"><strong style="color:${ACCENT_DARK};">${esc(RESTO_NAME)}</strong>${TAGLINE ? ` &mdash; ${esc(TAGLINE)}` : ""}</p><p style="margin:0;font-size:12px;color:#9A9A8E;text-align:center;">Vous recevez cet email car vous \u00eates inscrit\u00b7e \u00e0 nos actualit\u00e9s.</p></td></tr>`;
}

function buildHtml(title: string, logoUrl: string, headerBand: string, body: string): string {
  const logoBlock = logoUrl
    ? `<tr><td align="center" style="padding:32px 40px 18px 40px;background-color:#FFFFFF;"><img src="${esc(logoUrl)}" alt="${esc(RESTO_NAME)}" width="180" style="width:180px;max-width:180px;height:auto;display:block;margin:0 auto;"/></td></tr>`
    : `<tr><td align="center" style="padding:28px 40px 14px 40px;background-color:#FFFFFF;"><p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1d1a16;">${esc(RESTO_NAME)}</p></td></tr>`;
  return [
    `<!DOCTYPE html>`,
    `<html lang="fr">`,
    `<head>`,
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1.0">`,
    `<title>${esc(title)}</title>`,
    `<style>body{margin:0;padding:0;background-color:#ECEAE1;}table{border-collapse:collapse;}img{border:0;display:block;}a{text-decoration:none;}@media only screen and (max-width:620px){.ec{width:100%!important;}.px{padding-left:26px!important;padding-right:26px!important;}}</style>`,
    `</head>`,
    `<body style="margin:0;padding:0;background-color:#ECEAE1;">`,
    `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ECEAE1;"><tr><td align="center" style="padding:28px 14px;">`,
    `<table class="ec" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(80,100,60,.10);">`,
    `<tr><td height="6" style="height:6px;line-height:6px;font-size:6px;background-color:${ACCENT_COLOR};">&nbsp;</td></tr>`,
    logoBlock,
    headerBand,
    body,
    footer(),
    `</table></td></tr></table>`,
    `</body></html>`,
  ].join("\n");
}

function renderMirror(template: string, c: any, logoUrl: string): string {
  if (template === "welcome") {
    const hb = `<tr><td align="center" style="padding:30px 44px 32px 44px;background-color:${ACCENT_COLOR};"><p style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.75);">Bienvenue</p><p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;color:#FFFFFF;font-weight:normal;">Bienvenue chez ${esc(RESTO_NAME)}&nbsp;!</p></td></tr>`;
    const b = `${heroImg("Photo du restaurant")}<tr><td class="px" style="padding:36px 44px 6px 44px;background-color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0 0 18px 0;font-size:16px;line-height:26px;color:#4A4A45;">Merci de votre inscription. Vous faites maintenant partie de nos proches.</p>${c.message ? `<p style="margin:0 0 8px 0;font-size:16px;line-height:26px;color:#4A4A45;">${esc(c.message)}</p>` : ""}</td></tr>${ctaBtn("D\u00e9couvrir le restaurant", SITE_URL)}${signoff()}`;
    return buildHtml(`Bienvenue chez ${RESTO_NAME}`, logoUrl, hb, b);
  }
  if (template === "evenementiel") {
    const hb = `<tr><td align="center" style="padding:30px 44px 32px 44px;background-color:${ACCENT_COLOR};">${c.eyebrow ? `<p style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.75);">${esc(c.eyebrow)}</p>` : ""}<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;color:#FFFFFF;font-weight:normal;">${esc(c.titre || "Un \u00e9v\u00e9nement")}</p></td></tr>`;
    const b = `${heroImg(c.titre || "", c.image_url)}<tr><td class="px" style="padding:36px 44px 6px 44px;background-color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;">${c.date_event ? `<p style="margin:0 0 18px 0;display:inline-block;background:#f3f0e7;padding:8px 18px;border-radius:6px;font-size:14px;font-weight:bold;color:#1d1a16;">\ud83d\udcc5 ${esc(c.date_event)}</p>` : ""}<p style="margin:0 0 6px 0;font-size:16px;line-height:26px;color:#4A4A45;">${esc(c.description || "")}</p></td></tr>${c.cta_label && c.cta_url ? ctaBtn(c.cta_label, c.cta_url) : ""}${signoff()}`;
    return buildHtml(c.titre || RESTO_NAME, logoUrl, hb, b);
  }
  if (template === "nouveau_menu") {
    const hb = `<tr><td align="center" style="padding:30px 44px 32px 44px;background-color:${ACCENT_COLOR};"><p style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.75);">Nouveau menu</p><p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;color:#FFFFFF;font-weight:normal;">${esc(c.titre || "Notre nouvelle carte")}</p></td></tr>`;
    const b = `${heroImg(c.titre || "", c.image_url)}<tr><td class="px" style="padding:36px 44px 6px 44px;background-color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0 0 18px 0;font-size:16px;line-height:26px;color:#4A4A45;">${esc(c.intro || "")}</p>${c.plat_vedette ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:10px 0;background:#f3f0e7;border-radius:10px;"><tr><td style="padding:18px 22px;"><p style="margin:0 0 5px 0;font-size:11px;text-transform:uppercase;color:#9a9189;">\u00c0 l'honneur</p><p style="margin:0 0 4px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#1d1a16;">${esc(c.plat_vedette)}</p>${c.plat_description ? `<p style="margin:0;font-size:13px;color:#6b6358;">${esc(c.plat_description)}</p>` : ""}</td></tr></table>` : ""}</td></tr>${c.cta_label && c.cta_url ? ctaBtn(c.cta_label, c.cta_url) : ctaBtn("Voir la carte", SITE_URL)}${signoff()}`;
    return buildHtml(c.titre || RESTO_NAME, logoUrl, hb, b);
  }
  // vie_resto
  const hb = `<tr><td align="center" style="padding:30px 44px 32px 44px;background-color:${ACCENT_COLOR};">${c.eyebrow ? `<p style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.75);">${esc(c.eyebrow)}</p>` : ""}<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;color:#FFFFFF;font-weight:normal;">${esc(c.titre || "Actualit\u00e9")}</p></td></tr>`;
  const b = `${heroImg(c.titre || "", c.image_url)}<tr><td class="px" style="padding:36px 44px 6px 44px;background-color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0 0 6px 0;font-size:16px;line-height:26px;color:#4A4A45;">${esc(c.texte || "")}</p></td></tr>${c.cta_label && c.cta_url ? ctaBtn(c.cta_label, c.cta_url) : ""}${signoff()}`;
  return buildHtml(c.titre || RESTO_NAME, logoUrl, hb, b);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id || !UUID_RE.test(id)) {
    return new Response("<html><head><meta charset=UTF-8></head><body>Identifiant invalide.</body></html>",
      { status: 400, headers: new Headers({ "content-type": "text/html; charset=utf-8" }) });
  }

  const { data: camp } = await db
    .from("newsletter_campaigns")
    .select("template, content, subject")
    .eq("id", id)
    .maybeSingle();

  if (!camp) {
    return new Response("<html><head><meta charset=UTF-8></head><body>Newsletter introuvable.</body></html>",
      { status: 404, headers: new Headers({ "content-type": "text/html; charset=utf-8" }) });
  }

  const logoUrl = await getLogoUrl();
  const html = renderMirror(camp.template, camp.content as Record<string, string>, logoUrl);

  // Utiliser new Headers() et encoder en Uint8Array pour forcer text/html
  const headers = new Headers();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "public, max-age=3600");

  const body = new TextEncoder().encode(html);
  return new Response(body, { status: 200, headers });
});
