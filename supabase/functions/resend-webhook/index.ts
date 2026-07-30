// resend-webhook — réception des événements Resend (clics, bounces, plaintes).
//
// Resend pousse un événement à chaque interaction ; on n'enregistre que ce qui
// se rattache à une campagne (tag campaign_id posé par send-newsletter). La
// table newsletter_events déduplique par (campaign_id, email, type) : on compte
// des personnes, pas des clics répétés.
//
// SÉCURITÉ — signature svix obligatoire. Resend signe chaque livraison
// (en-têtes svix-id / svix-timestamp / svix-signature, HMAC-SHA256 de
// "{id}.{timestamp}.{corps}" avec le secret whsec_…). Sans cette vérification,
// n'importe qui pourrait gonfler les statistiques en POST-ant sur l'URL.
// Le secret se trouve dans Resend → Webhooks → Signing Secret, à poser en
// secret Supabase : RESEND_WEBHOOK_SECRET.
//
// Déploiement : verify_jwt = false (Resend ne porte pas de JWT Supabase ; la
// signature svix EST l'authentification).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

/** Fenêtre de tolérance sur l'horodatage svix — borne le rejeu d'une livraison
 *  capturée. 5 minutes, la valeur recommandée par svix. */
const TOLERANCE_S = 300;

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function verifierSignature(req: Request, corps: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false; // pas de secret posé = webhook fermé
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig) return false;

  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > TOLERANCE_S) return false;

  const secret = b64ToBytes(WEBHOOK_SECRET.replace(/^whsec_/, ""));
  const cle = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const attendu = new Uint8Array(await crypto.subtle.sign("HMAC", cle,
    new TextEncoder().encode(`${id}.${ts}.${corps}`)));

  // L'en-tête peut lister plusieurs signatures « v1,<base64> » séparées par des
  // espaces (rotation de secret côté svix) : une seule doit correspondre.
  for (const partie of sig.split(" ")) {
    const [version, valeur] = partie.split(",");
    if (version !== "v1" || !valeur) continue;
    const recu = b64ToBytes(valeur);
    if (recu.length !== attendu.length) continue;
    // Comparaison à temps constant.
    let diff = 0;
    for (let i = 0; i < recu.length; i++) diff |= recu[i] ^ attendu[i];
    if (diff === 0) return true;
  }
  return false;
}

const TYPES: Record<string, string> = {
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const corps = await req.text();
  if (!(await verifierSignature(req, corps))) {
    return new Response(JSON.stringify({ error: "signature invalide" }), { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(corps); } catch { return new Response("bad json", { status: 400 }); }

  const type = TYPES[evt?.type];
  // Toujours 200 pour ce qu'on ignore volontairement : un autre statut pousse
  // Resend à réessayer, puis à désactiver le webhook après trop d'échecs.
  if (!type) return new Response(JSON.stringify({ ok: true, ignored: evt?.type }), { status: 200 });

  const data = evt.data || {};
  const campaignId = (data.tags?.campaign_id ?? "") as string;
  const email = String(Array.isArray(data.to) ? data.to[0] : data.to || "").toLowerCase().trim();
  // Événement sans tag : e-mail transactionnel (confirmation de réservation,
  // bienvenue…) ou test — hors campagne, rien à compter.
  if (!campaignId || !email) return new Response(JSON.stringify({ ok: true, ignored: "hors campagne" }), { status: 200 });

  const url = type === "clicked" ? String(data.click?.link || "").slice(0, 500) || null : null;

  // Doublon (même personne, même campagne, même type) : ignoré par la
  // contrainte, et c'est le comportement voulu.
  const { error } = await db.from("newsletter_events")
    .upsert({ campaign_id: campaignId, email, type, url },
            { onConflict: "campaign_id,email,type", ignoreDuplicates: true });

  if (error) {
    // 42P10/23503 : campagne inconnue (supprimée depuis) — rien à réessayer.
    if (error.code === "23503") return new Response(JSON.stringify({ ok: true, ignored: "campagne inconnue" }), { status: 200 });
    console.error("resend-webhook:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
