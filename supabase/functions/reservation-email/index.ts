import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("RESERVATION_FROM_EMAIL") || "onboarding@resend.dev";
const RESTO_NAME = Deno.env.get("RESTO_NAME") || "Le restaurant";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(s: string): string {
  return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}
function formatDate(d: string): string {
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return d; }
}

function buildEmail(type: string, r: any): { subject: string; html: string } {
  const date = formatDate(r.date);
  const heure = String(r.time || "").replace(":", "h");
  const couverts = `${r.covers} couvert${r.covers > 1 ? "s" : ""}`;
  const nom = esc(r.customer_name);
  const recap = `<table style="margin:18px 0;font-size:15px;color:#1A2238"><tr><td style="padding:4px 16px 4px 0;color:#6B7280">Date</td><td><b>${esc(date)}</b></td></tr><tr><td style="padding:4px 16px 4px 0;color:#6B7280">Heure</td><td><b>${esc(heure)}</b></td></tr><tr><td style="padding:4px 16px 4px 0;color:#6B7280">Couverts</td><td><b>${esc(couverts)}</b></td></tr></table>`;

  if (type === "confirmation") {
    return {
      subject: `Votre réservation chez ${RESTO_NAME} est confirmée`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px"><h1 style="font-size:22px;color:#1A2238">Réservation confirmée ✓</h1><p style="color:#4A5066;font-size:15px">Bonjour ${nom},</p><p style="color:#4A5066;font-size:15px">Nous avons le plaisir de confirmer votre réservation chez <b>${esc(RESTO_NAME)}</b>.</p>${recap}<p style="color:#4A5066;font-size:15px">Nous nous réjouissons de vous accueillir. En cas d'empêchement, merci de nous prévenir.</p><p style="color:#6B7280;font-size:13px;margin-top:24px">${esc(RESTO_NAME)}</p></div>`,
    };
  }

  if (type === "waitlist_confirm") {
    return {
      subject: `Bonne nouvelle — Une place s'est libérée chez ${RESTO_NAME}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px"><h1 style="font-size:22px;color:#1A2238">Une place s'est libérée !</h1><p style="color:#4A5066;font-size:15px">Bonjour ${nom},</p><p style="color:#4A5066;font-size:15px">Bonne nouvelle ! Une place vient de se libérer pour le créneau que vous aviez demandé chez <b>${esc(RESTO_NAME)}</b>.</p>${recap}<p style="color:#4A5066;font-size:15px">Contactez-nous rapidement pour confirmer votre venue, cette place est disponible sous réserve.</p><p style="color:#6B7280;font-size:13px;margin-top:24px">${esc(RESTO_NAME)}</p></div>`,
    };
  }

  // type === "accuse" (défaut)
  return {
    subject: `Demande de réservation reçue — ${RESTO_NAME}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px"><h1 style="font-size:22px;color:#1A2238">Demande bien reçue</h1><p style="color:#4A5066;font-size:15px">Bonjour ${nom},</p><p style="color:#4A5066;font-size:15px">Nous avons bien reçu votre demande de réservation chez <b>${esc(RESTO_NAME)}</b>. Elle sera confirmée très prochainement par notre équipe.</p>${recap}<p style="color:#4A5066;font-size:15px">Vous recevrez un second e-mail dès que votre table sera confirmée.</p><p style="color:#6B7280;font-size:13px;margin-top:24px">${esc(RESTO_NAME)}</p></div>`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY manquante" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const body = await req.json();
    const { type, reservation } = body;
    if (!reservation || !reservation.customer_name) {
      return new Response(JSON.stringify({ error: "Données incomplètes" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    // Pour liste d'attente, l'email peut être absent — on n'envoie pas
    if (!reservation.email) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    const { subject, html } = buildEmail(type || "accuse", reservation);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${RESTO_NAME} <${FROM_EMAIL}>`, to: [reservation.email], subject, html }),
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Resend", detail: data }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, id: data.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
