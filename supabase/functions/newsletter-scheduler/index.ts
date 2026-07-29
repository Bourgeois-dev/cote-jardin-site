import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET  = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
const SELF_URL         = Deno.env.get("SUPABASE_URL")!.replace("/rest/v1", "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // ── Tâche 1 : campagnes planifiées dont l'heure est passée ───────────────
    let campaigns = 0;
    const campaignResults: any[] = [];
    const { data: due } = await db
      .from("newsletter_campaigns")
      .select("id, subject, template, segment")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (due && due.length > 0) {
      const results = await Promise.all(
        due.map(async (c: any) => {
          const res = await fetch(`${SELF_URL}/functions/v1/send-newsletter`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": INTERNAL_SECRET,
            },
            body: JSON.stringify({ campaign_id: c.id }),
          });
          return { id: c.id, ok: res.ok, status: res.status };
        })
      );
      campaigns = results.length;
      campaignResults.push(...results);
    }

    // ── Tâche 2 : emails de bienvenue pour les nouveaux inscrits ─────────────
    // Le site public n'appelle plus send-newsletter : c'est ici qu'on envoie le
    // welcome, avec le secret interne. On ne traite que les leads consentis dont
    // le welcome n'a pas encore été envoyé. welcome_sent est posé AVANT l'appel
    // pour éviter tout double-envoi si deux passages se chevauchent.
    let welcomes = 0;
    const welcomeResults: any[] = [];

    // Une campagne "welcome" support : réutilisée à chaque envoi (créée si absente).
    async function campagneWelcomeId(): Promise<string | null> {
      const { data: exist } = await db
        .from("newsletter_campaigns")
        .select("id")
        .eq("template", "welcome")
        .eq("segment", "optin")
        .limit(1)
        .maybeSingle();
      if (exist?.id) return exist.id;
      const { data: created } = await db
        .from("newsletter_campaigns")
        .insert({
          template: "welcome", segment: "optin",
          subject: "Bienvenue !", content: {},
          status: "sent", sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      return created?.id ?? null;
    }

    const { data: nouveaux } = await db
      .from("leads")
      .select("id, email, first_name, last_name")
      .eq("consent", true)
      .eq("welcome_sent", false)
      .limit(50);

    if (nouveaux && nouveaux.length > 0) {
      const campId = await campagneWelcomeId();
      if (campId) {
        for (const l of nouveaux) {
          // marquer d'abord (anti double-envoi), puis envoyer
          const { error: markErr } = await db
            .from("leads").update({ welcome_sent: true }).eq("id", l.id);
          if (markErr) continue;
          try {
            const res = await fetch(`${SELF_URL}/functions/v1/send-newsletter`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Internal-Secret": INTERNAL_SECRET,
              },
              body: JSON.stringify({
                campaign_id: campId,
                override_email: l.email,
                override_name: `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim(),
              }),
            });
            welcomeResults.push({ email: l.email, ok: res.ok, status: res.status });
            // si l'envoi échoue franchement, on ré-ouvre pour un prochain passage
            if (!res.ok) {
              await db.from("leads").update({ welcome_sent: false }).eq("id", l.id);
            }
            welcomes++;
          } catch (_e) {
            await db.from("leads").update({ welcome_sent: false }).eq("id", l.id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, campaigns, welcomes, campaignResults, welcomeResults }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
