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

export async function sendReservationEmail(type: "accuse" | "confirmation", reservation: any): Promise<void> {
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

// Synchronise un contact vers Mailchimp via l'Edge Function (ne bloque jamais en cas d'échec).
export async function syncToMailchimp(contact: { email: string; first_name?: string; last_name?: string; source?: string }): Promise<void> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mailchimp-sync`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(contact),
    });
  } catch (e) {
    console.error("syncToMailchimp", e);
  }
}
