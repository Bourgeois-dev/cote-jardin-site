import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.warn("Supabase non configuré : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env");
}

export const supabase = createClient(url, anonKey);

// Helpers communs ------------------------------------------------------------
export async function fetchActive<T = any>(table: string, orderBy = "position"): Promise<T[]> {
  let { data, error } = await supabase.from(table).select("*").order(orderBy, { ascending: true });
  // Repli : si la colonne de tri n'existe pas sur cette table, on refait la requête sans tri
  if (error) {
    const res = await supabase.from(table).select("*");
    if (res.error) { console.error(`fetch ${table}`, res.error); return []; }
    data = res.data;
  }
  return (data as T[]) || [];
}

export async function fetchContent(sectionKey: string): Promise<any | null> {
  const { data, error } = await supabase
    .from("site_content").select("content").eq("section_key", sectionKey).maybeSingle();
  if (error) { console.error(`content ${sectionKey}`, error); return null; }
  return data?.content ?? null;
}

// Envoi d'un email de réservation via l'Edge Function (accusé de réception ou confirmation).
// N'interrompt jamais le flux : en cas d'échec, on logue sans bloquer l'utilisateur.
export async function notifyWaitlist(date: string, time: string) {
  try {
    await supabase.functions.invoke("reservation-reminders", {
      body: { notify_waitlist: true, date, time },
    });
  } catch { /* silencieux */ }
}

export async function sendReservationEmail(type: "accuse" | "confirmation" | "waitlist_confirm", reservation: any): Promise<void> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reservation-email`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type, reservation }),
    });
  } catch (e) {
    console.error("sendReservationEmail", e);
  }
}

/**
 * Traduit une erreur d'upload Supabase Storage en libellé humain.
 * Évite d'afficher le message technique brut au restaurateur.
 */
export function messageUpload(error: { message?: string; statusCode?: string | number } | null): string {
  const m = (error?.message || "").toLowerCase();
  const code = String((error as any)?.statusCode ?? "");
  if (m.includes("exceeded the maximum allowed size") || m.includes("too large") || code === "413")
    return "L'image est trop lourde. Réduisez sa taille (moins de 5 Mo) et réessayez.";
  if (m.includes("mime") || m.includes("content-type") || m.includes("not supported") || m.includes("invalid_mime"))
    return "Format de fichier non accepté. Utilisez une image JPG, PNG ou WebP.";
  if (m.includes("duplicate") || m.includes("already exists"))
    return "Un fichier du même nom existe déjà. Renommez l'image et réessayez.";
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("load failed"))
    return "Problème de connexion pendant l'envoi. Vérifiez votre réseau et réessayez.";
  if (m.includes("row-level security") || m.includes("unauthorized") || code === "403")
    return "Envoi refusé : votre session a peut-être expiré. Reconnectez-vous et réessayez.";
  return "L'envoi de l'image a échoué. Réessayez ; si le problème persiste, contactez La Table Digitale.";
}
