import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const SELF_URL         = Deno.env.get("SUPABASE_URL")!.replace("/rest/v1", "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Trouver les campagnes planifiées dont l'heure est passée
    const { data: due } = await db
      .from("newsletter_campaigns")
      .select("id, subject, template, segment")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ ok: true, triggered: 0 }), { headers: cors });
    }

    // Déclencher send-newsletter pour chaque campagne due
    const results = await Promise.all(
      due.map(async (c: any) => {
        const res = await fetch(
          `${SELF_URL}/functions/v1/send-newsletter`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaign_id: c.id }),
          }
        );
        return { id: c.id, ok: res.ok, status: res.status };
      })
    );

    return new Response(
      JSON.stringify({ ok: true, triggered: results.length, results }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
