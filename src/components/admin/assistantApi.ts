import { supabase } from "../../lib/supabase";

/**
 * Accès à l'edge function `assistant-newsletter`, partagé par les deux
 * assistants de l'admin : celui des campagnes (onglet Newsletter) et celui de
 * la popup d'accueil (onglet Bannière promo).
 *
 * Module à part et non export d'un composant : la bannière existe chez TOUS
 * les clients, y compris ceux dont le module Newsletter est coupé. Faire
 * dépendre TabPromo de TabNewsletter/AssistantNewsletter embarquerait l'éditeur
 * de campagnes dans le bundle d'un client qui n'en a pas.
 */

/** En-têtes d'appel aux edge functions AVEC le JWT de session admin.
 *  `assistant-newsletter` vérifie is_admin() sous l'identité de ce token : il
 *  FAUT donc envoyer le token de session (la clé anon n'est pas un admin). */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

/** Appelle une action de l'assistant. Lève une Error portant le message
 *  utilisateur renvoyé par la fonction — les composants l'affichent tel quel. */
export async function appeler(action: string, payload: Record<string, unknown>): Promise<any> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant-newsletter`;
  const res = await fetch(url, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.message || `Erreur ${res.status}`);
  return data;
}
