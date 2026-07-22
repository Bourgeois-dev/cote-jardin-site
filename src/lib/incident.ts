// Signalement d'incident vers le journal du studio (La Table Digitale).
//
// POURQUOI : quand une opération critique échoue côté visiteur (réservation,
// inscription newsletter...), l'erreur est aujourd'hui avalée silencieusement.
// Le restaurateur perd des réservations sans le savoir, et le studio l'apprend
// des semaines plus tard — ou jamais. Ce module remonte l'incident.
//
// CONFIDENTIALITÉ : on n'envoie QUE le message technique. Aucun nom, email,
// téléphone ni créneau. La fonction serveur nettoie en plus le message
// (emails, valeurs entre parenthèses, numéros) avant de l'enregistrer.
// L'isolation des données entre clients reste entière.
//
// NON BLOQUANT : toute erreur du signalement lui-même est ignorée. Un visiteur
// ne doit jamais subir une panne du journal.

const STUDIO_URL = "https://ewmwfmoowygdbgwpdcpp.supabase.co";
// Clé anon de la base studio. Publique par nature (elle est dans le bundle du
// site). Elle ne donne accès à RIEN d'autre que la fonction signaler_incident :
// la table `incidents` n'a aucune policy de lecture ni d'écriture pour anon.
const STUDIO_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3bXdmbW9vd3lnZGJnd3BkY3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NDgwNDgsImV4cCI6MjEwMDMyNDA0OH0.0Cka4eidKEwPAJGmvFNe8I0sG7bu8E5urj_4So-xd5w";

// Identifiant du client, injecté au build (VITE_CLIENT_SLUG dans .env).
const CLIENT = (import.meta.env.VITE_CLIENT_SLUG || "").trim();

type Contexte =
  | "reservation" | "newsletter" | "waitlist"
  | "annulation" | "desinscription" | "autre";

// Évite d'inonder le journal si une erreur se répète dans la même session
// (ex. visiteur qui réessaie 10 fois). Le serveur regroupe déjà par signature,
// ceci limite en plus le nombre d'appels réseau.
const dejaSignales = new Set<string>();

export function signalerIncident(contexte: Contexte, erreur: unknown): void {
  try {
    if (!CLIENT) return; // pas de slug configuré : on ne signale rien

    const e = erreur as { code?: string; message?: string; name?: string } | null;
    const code = String(e?.code || e?.name || "").slice(0, 40);
    const message = String(e?.message || erreur || "").slice(0, 300);
    if (!code && !message) return;

    const signature = `${contexte}|${code}|${message}`;
    if (dejaSignales.has(signature)) return;
    dejaSignales.add(signature);

    // keepalive : le signalement part même si la page se ferme dans la foulée.
    void fetch(`${STUDIO_URL}/rest/v1/rpc/signaler_incident`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: STUDIO_KEY,
        Authorization: `Bearer ${STUDIO_KEY}`,
      },
      body: JSON.stringify({
        p_client: CLIENT,
        p_contexte: contexte,
        p_code: code,
        p_message: message,
      }),
    }).catch(() => {});
  } catch {
    // Le journal ne doit jamais casser le site.
  }
}
