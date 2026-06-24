import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createHash } from "node:crypto";

const API_KEY = Deno.env.get("MAILCHIMP_API_KEY");
const LIST_ID = Deno.env.get("MAILCHIMP_LIST_ID");
const DC = Deno.env.get("MAILCHIMP_DC") || (API_KEY ? API_KEY.split("-")[1] : "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!API_KEY || !LIST_ID || !DC) {
      return new Response(JSON.stringify({ error: "Configuration Mailchimp incomplete" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const { email, first_name, last_name, source } = await req.json();
    if (!email || !/.+@.+\..+/.test(email)) {
      return new Response(JSON.stringify({ error: "Email invalide" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const emailLower = String(email).trim().toLowerCase();
    const hash = createHash("md5").update(emailLower).digest("hex");
    const url = `https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members/${hash}`;
    const body = {
      email_address: emailLower,
      status_if_new: "subscribed",
      merge_fields: { FNAME: first_name || "", LNAME: last_name || "" },
      tags: source ? [source] : [],
    };
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Authorization": `apikey ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Mailchimp", detail: data?.detail || data }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, id: data.id, status: data.status }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
