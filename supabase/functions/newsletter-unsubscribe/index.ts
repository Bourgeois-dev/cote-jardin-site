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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { token } = await req.json();
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
      .update({ consent: false })
      .eq("unsubscribe_token", token);

    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), { headers: json });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: json });
  }
});
