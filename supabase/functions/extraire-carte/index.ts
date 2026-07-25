import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Configuration ────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
// Modèle en secret, avec fallback dans le code. Le jour où le modèle évolue, il
// suffit de changer le secret EXTRACTION_MODEL (par client) OU ce fallback (pour
// tous). Aucune autre partie du code ne mentionne le modèle.
const EXTRACTION_MODEL = Deno.env.get("EXTRACTION_MODEL") || "claude-haiku-4-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Instructions d'extraction. Volontairement strictes : on ne veut QUE ce qui est
// écrit sur l'ardoise, jamais d'invention. Le modèle renvoie un JSON pur.
const PROMPT_SYSTEME = `Tu es un assistant qui lit la photo d'une ardoise ou d'une carte de restaurant et en extrait les plats de façon structurée.

Règles STRICTES :
- N'invente jamais un plat, un prix ou une description qui n'est pas visible sur l'image.
- Si un prix est illisible ou absent, mets price à null (ne devine pas).
- Si une description n'est pas écrite, mets description à "" (chaîne vide).
- Regroupe les plats par catégorie SEULEMENT si des intitulés de catégorie sont visibles sur l'ardoise (ex. "Entrées", "Plats", "Desserts", "Boissons"). Sinon, mets category à "" pour tous.
- Convertis les prix en nombre décimal (ex. "13,50 €" -> 13.5 ; "12€" -> 12). Utilise le point comme séparateur décimal.
- Corrige uniquement les fautes de frappe évidentes de lecture, sans reformuler.
- Ignore tout ce qui n'est pas un plat (horaires, adresse, "menu du jour" seul, décorations).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises Markdown, de la forme :
{"plats":[{"name":"...","category":"...","description":"...","price":12.5}, ...]}
Si aucune information exploitable, réponds {"plats":[]}.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "config", message: "La clé API d'analyse n'est pas configurée sur ce site." }, 500);
    }

    // ── Vérification admin ────────────────────────────────────────────────────
    // L'appel consomme de l'API payante : on n'autorise QUE les admins. On crée un
    // client Supabase portant le token de l'appelant et on appelle is_admin().
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "auth", message: "Authentification requise." }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");
    if (adminErr || isAdmin !== true) {
      return json({ error: "forbidden", message: "Accès réservé à l'administration." }, 403);
    }

    // ── Lecture de l'image ────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body?.image_base64 || !body?.media_type) {
      return json({ error: "input", message: "Image manquante." }, 400);
    }
    const mediaType: string = body.media_type;
    if (!["image/jpeg", "image/png", "image/webp"].includes(mediaType)) {
      return json({ error: "input", message: "Format d'image non supporté (JPEG, PNG ou WebP)." }, 400);
    }
    // Garde-fou taille : l'image base64 ne doit pas dépasser ~7 Mo (le front compresse déjà).
    if (typeof body.image_base64 !== "string" || body.image_base64.length > 7_000_000) {
      return json({ error: "input", message: "Image trop lourde. Réessayez avec une photo plus légère." }, 400);
    }

    // ── Appel à l'API Anthropic (vision) ──────────────────────────────────────
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        max_tokens: 2000,
        system: PROMPT_SYSTEME,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: body.image_base64 } },
            { type: "text", text: "Lis cette ardoise et renvoie les plats au format JSON demandé." },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      console.error("Anthropic error", resp.status, errTxt);
      // On ne fuite jamais les détails techniques au client.
      const msg = resp.status === 429
        ? "Service momentanément surchargé, réessayez dans un instant."
        : "L'analyse de l'image a échoué. Réessayez avec une photo plus nette.";
      return json({ error: "upstream", message: msg }, 502);
    }

    const data = await resp.json();
    const texte: string = (data?.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    // ── Parsing robuste du JSON ───────────────────────────────────────────────
    // Le modèle peut, malgré la consigne, entourer le JSON de texte ou de ```.
    // On extrait le premier objet {...} plausible.
    const plats = parsePlats(texte);
    if (plats === null) {
      return json({ error: "parse", message: "Lecture impossible. Essayez une photo plus nette et bien cadrée." }, 422);
    }

    return json({ plats }, 200);
  } catch (e) {
    console.error("extraire-carte fatal", e);
    return json({ error: "server", message: "Une erreur est survenue. Réessayez." }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Extrait et valide la liste de plats depuis la réponse texte du modèle.
// Renvoie un tableau (éventuellement vide) ou null si irrécupérable.
function parsePlats(texte: string): any[] | null {
  let brut = texte;
  // Retire d'éventuelles balises Markdown ```json ... ```
  const fence = brut.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) brut = fence[1].trim();
  // À défaut, isole le premier objet { ... }
  if (!brut.startsWith("{")) {
    const i = brut.indexOf("{");
    const j = brut.lastIndexOf("}");
    if (i >= 0 && j > i) brut = brut.slice(i, j + 1);
  }
  let obj: any;
  try { obj = JSON.parse(brut); } catch { return null; }
  if (!obj || !Array.isArray(obj.plats)) return null;

  // Nettoyage/validation de chaque plat. On borne les longueurs et on n'accepte
  // que des prix numériques positifs raisonnables.
  const out = obj.plats
    .map((p: any) => {
      const name = String(p?.name || "").trim().slice(0, 120);
      if (!name) return null;
      let price: number | null = null;
      if (p?.price !== null && p?.price !== undefined && p?.price !== "") {
        const n = typeof p.price === "number" ? p.price : parseFloat(String(p.price).replace(",", "."));
        if (!isNaN(n) && n >= 0 && n < 10000) price = Math.round(n * 100) / 100;
      }
      return {
        name,
        category: String(p?.category || "").trim().slice(0, 60),
        description: String(p?.description || "").trim().slice(0, 500),
        price,
      };
    })
    .filter(Boolean)
    .slice(0, 100); // borne de sécurité
  return out;
}
