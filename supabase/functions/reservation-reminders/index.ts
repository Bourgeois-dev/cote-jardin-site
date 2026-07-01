import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("RESERVATION_FROM_EMAIL") || "onboarding@resend.dev";
const RESTO_NAME = Deno.env.get("RESTO_NAME") || "Le restaurant";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatDate(d: string) {
  try { return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); }
  catch { return d; }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${RESTO_NAME} <${FROM_EMAIL}>`, to: [to], subject, html }),
  });
  return res.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  let remindersSent = 0;
  let waitlistNotified = 0;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // ── 1. Rappels J-1 ──────────────────────────────────────────────────────
    const { data: settings } = await supabase
      .from("reservation_settings")
      .select("reminder_enabled")
      .single();

    if (settings?.reminder_enabled) {
      const { data: resas } = await supabase
        .from("reservations")
        .select("id, customer_name, email, date, time, covers, cancel_token")
        .eq("date", tomorrowStr)
        .eq("reminder_sent", false)
        .neq("status", "annule")
        .neq("email", "");

      for (const r of resas || []) {
        const cancelUrl = SITE_URL ? `${SITE_URL}/annuler?token=${r.cancel_token}` : null;
        const cancelBlock = cancelUrl
          ? `<p style="margin-top:18px;font-size:13px;color:#6B7280">Vous ne pouvez plus venir ? <a href="${cancelUrl}" style="color:#5a7d4f">Annuler ma r\u00e9servation</a></p>`
          : "";
        const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h1 style="font-size:20px;color:#1A2238">Rappel \u2014 votre r\u00e9servation demain</h1>
          <p style="color:#4A5066;font-size:15px">Bonjour ${r.customer_name},</p>
          <p style="color:#4A5066;font-size:15px">Nous vous rappelons votre r\u00e9servation chez <b>${RESTO_NAME}</b>&nbsp;:</p>
          <table style="margin:16px 0;font-size:15px">
            <tr><td style="padding:4px 16px 4px 0;color:#6B7280">Date</td><td><b>${formatDate(r.date)}</b></td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#6B7280">Heure</td><td><b>${r.time.replace(":","h")}</b></td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#6B7280">Couverts</td><td><b>${r.covers}</b></td></tr>
          </table>
          <p style="color:#4A5066;font-size:15px">Nous nous r\u00e9jouissons de vous accueillir !</p>
          ${cancelBlock}
          <p style="color:#6B7280;font-size:13px;margin-top:24px">${RESTO_NAME}</p>
        </div>`;
        const ok = await sendEmail(r.email, `Rappel \u2014 votre r\u00e9servation demain chez ${RESTO_NAME}`, html);
        if (ok) {
          await supabase.from("reservations").update({ reminder_sent: true }).eq("id", r.id);
          remindersSent++;
        }
      }
    }

    // ── 2. Notification liste d'attente (s\u00e9quentielle) ──────────────────────
    // On notifie UN SEUL inscrit \u00e0 la fois par cr\u00e9neau, dans l'ordre d'inscription.
    // L'inscrit a 2h pour r\u00e9server avant que le suivant soit notifi\u00e9 (via un 2e appel).
    if (body.notify_waitlist && body.date && body.time) {
      const { data: next } = await supabase
        .rpc("get_next_waitlist", { p_date: body.date, p_time: body.time });

      const w = next?.[0];
      if (w) {
        const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h1 style="font-size:20px;color:#1A2238">Une place s'est lib\u00e9r\u00e9e !</h1>
          <p style="color:#4A5066;font-size:15px">Bonjour ${w.customer_name},</p>
          <p style="color:#4A5066;font-size:15px">Bonne nouvelle ! Une place vient de se lib\u00e9rer pour le
            <b>${formatDate(w.date)}</b> \u00e0 <b>${(w.time as string).replace(":","h")}</b>
            chez <b>${RESTO_NAME}</b>.</p>
          <p style="color:#4A5066;font-size:15px">Vous avez <b>2 heures</b> pour r\u00e9server avant que nous
            contactions le prochain inscrit sur la liste.</p>
          ${SITE_URL ? `<p style="margin-top:18px"><a href="${SITE_URL}"
            style="background:#5a7d4f;color:#fff;padding:12px 24px;border-radius:4px;
            text-decoration:none;font-weight:600">R\u00e9server maintenant</a></p>` : ""}
          <p style="color:#6B7280;font-size:13px;margin-top:24px">${RESTO_NAME}</p>
        </div>`;

        const ok = await sendEmail(w.email,
          `Une place s'est lib\u00e9r\u00e9e chez ${RESTO_NAME} !`, html);

        if (ok) {
          // Marquer notif_sent_at (pas encore notified=true — il doit confirmer en r\u00e9servant)
          await supabase.from("waitlist")
            .update({ notif_sent_at: new Date().toISOString() })
            .eq("id", w.id);
          waitlistNotified++;
        }
      }
    }

    // ── 3. Expiration des notifications non suivies d'effet (apr\u00e8s 2h) ──────
    // Si l'inscrit notifi\u00e9 n'a pas r\u00e9serv\u00e9 dans les 2h, on le marque notified=true
    // (\u00e9pur\u00e9) pour que le prochain soit notifi\u00e9 au prochain appel.
    await supabase.from("waitlist")
      .update({ notified: true })
      .eq("notified", false)
      .not("notif_sent_at", "is", null)
      .lt("notif_sent_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

    return new Response(
      JSON.stringify({ ok: true, remindersSent, waitlistNotified }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
