import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = { ...cors, "Content-Type": "application/json" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITE_URL = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");

/* Cette fonction sert DEUX appelants aux formats différents :
   1. la page /desinscription du site — POST JSON { token } ;
   2. le bouton « Se désabonner » natif de Gmail/Yahoo (one-click, RFC 8058) —
      POST formulaire `List-Unsubscribe=One-Click` sur l'URL de l'en-tête
      List-Unsubscribe, token en query string.
   D'où la lecture du token : query string d'abord, corps JSON sinon.

   ⚠️ Un GET ne désinscrit JAMAIS. Les scanners d'antivirus et les aperçus de
   liens pré-chargent les URL en GET : désinscrire sur GET viderait la liste à
   chaque passage d'un scanner. Un humain qui ouvre l'URL en GET est redirigé
   vers la page de désinscription du site, qui confirme son choix en POST. */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const params = new URL(req.url).searchParams;
    const urlToken = params.get("token") || "";
    // Identifiant de campagne, posé par send-newsletter dans le lien du footer
    // et l'en-tête List-Unsubscribe. Sert uniquement aux statistiques : un
    // paramètre absent ou invalide n'empêche JAMAIS la désinscription.
    let campaignId = params.get("c") || "";

    if (req.method === "GET") {
      // Le paramètre de campagne suit vers la page du site, qui le renverra en POST.
      const q = urlToken
        ? `?token=${encodeURIComponent(urlToken)}${campaignId ? `&c=${encodeURIComponent(campaignId)}` : ""}`
        : "";
      const cible = SITE_URL ? `${SITE_URL}/desinscription${q}` : "";
      return cible
        ? new Response(null, { status: 302, headers: { ...cors, Location: cible } })
        : new Response(JSON.stringify({ error: "méthode non autorisée" }), { status: 405, headers: json });
    }

    let token = urlToken;
    if (!token) {
      // Corps JSON ({ token }) ou formulaire one-click — dans ce dernier cas le
      // corps ne contient pas le token, seulement List-Unsubscribe=One-Click.
      const body = await req.text();
      try {
        const parsed = JSON.parse(body);
        token = parsed?.token || "";
        if (!campaignId) campaignId = parsed?.campaign || "";
      } catch { /* formulaire one-click */ }
    }
    if (!token || !UUID_RE.test(token)) {
      return new Response(JSON.stringify({ error: "token invalide" }), { status: 400, headers: json });
    }
    // Chercher le lead par token
    const { data: lead } = await db
      .from("leads")
      .select("id, email, consent")
      .eq("unsubscribe_token", token)
      .maybeSingle();

    if (!lead) {
      return new Response(JSON.stringify({ error: "token introuvable" }), { status: 404, headers: json });
    }
    if (!lead.consent) {
      // Déjà désinscrit — on retourne OK sans erreur
      return new Response(JSON.stringify({ ok: true, already: true }), { headers: json });
    }
    // Désinscrire
    const { error } = await db
      .from("leads")
      .update({ consent: false, unsubscribed_at: new Date().toISOString() })
      .eq("unsubscribe_token", token);

    if (error) throw error;

    // Attribution du désabonnement à la campagne d'origine, pour les
    // statistiques (colonne « Désabos »). Meilleur effort : une campagne
    // supprimée depuis (FK) ou un identifiant invalide sont ignorés en
    // silence — la désinscription, elle, est déjà faite.
    if (campaignId && UUID_RE.test(campaignId)) {
      const email = String(lead.email || "").toLowerCase().trim();
      if (email) {
        await db.from("newsletter_events")
          .upsert({ campaign_id: campaignId, email, type: "unsubscribed" },
                  { onConflict: "campaign_id,email,type", ignoreDuplicates: true });
      }
    }
    return new Response(JSON.stringify({ ok: true }), { headers: json });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: json });
  }
});
