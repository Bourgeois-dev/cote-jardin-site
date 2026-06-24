import { useEffect, useMemo, useState } from "react";
import { supabase, fetchActive, sendReservationEmail, syncToMailchimp } from "../../lib/supabase";
import type { OpeningHour, ClosurePeriod, ReservationSettings } from "../../lib/types";

const fmtFR = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

// Génère des créneaux toutes les 30 min entre open et close (format "HH:MM")
function slotsBetween(open: string | null, close: string | null): string[] {
  if (!open || !close) return [];
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  const out: string[] = [];
  let t = oh * 60 + om;
  const end = ch * 60 + cm;
  while (t <= end - 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
    t += 30;
  }
  return out;
}

export default function ReservationWidget({ hours, open, onClose }: { hours: OpeningHour[]; open: boolean; onClose: () => void }) {
  const [closures, setClosures] = useState<ClosurePeriod[]>([]);
  const [settings, setSettings] = useState<ReservationSettings | null>(null);
  const [step, setStep] = useState(1);
  const [date, setDate] = useState("");
  const [covers, setCovers] = useState(2);
  const [slot, setSlot] = useState<string | null>(null);
  // Disponibilité par créneau (clé = "HH:MM") : true = au moins une combinaison
  // de tables libres couvre le nombre de couverts. Calculé via la RPC check_availability.
  const [dispo, setDispo] = useState<Record<string, boolean>>({});
  const [dispoLoad, setDispoLoad] = useState(false);
  const [form, setForm] = useState({ p: "", n: "", e: "", t: "", notes: "" });
  const [consent, setConsent] = useState(false);
  const [newsletterOptin, setNewsletterOptin] = useState(false);
  const [done, setDone] = useState(false);

  const phone = import.meta.env.VITE_RESTO_PHONE || "";
  const phoneThreshold = settings?.phone_threshold ?? 8;
  const minAdvance = settings?.min_advance_hours ?? 2;
  const horizonDays = settings?.booking_horizon_days ?? 60;
  const proposeNewsletter = settings?.newsletter_optin ?? true;
  const maxDate = (() => { const d = new Date(); d.setDate(d.getDate() + horizonDays); return d.toISOString().slice(0, 10); })();

  useEffect(() => {
    (async () => {
      setClosures(await fetchActive<ClosurePeriod>("closure_periods", "start_date"));
      const s = await fetchActive<ReservationSettings>("reservation_settings");
      setSettings(s[0] || null);
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    // date par défaut : prochain jour ouvré
    const d = new Date();
    for (let i = 1; i <= 8; i++) {
      const c = new Date(d); c.setDate(d.getDate() + i);
      const h = hours.find((x) => x.day_of_week === c.getDay());
      if (h && !h.is_closed) { setDate(c.toISOString().slice(0, 10)); break; }
    }
    setStep(1); setSlot(null); setDone(false);
  }, [open, hours]);

  const dayInfo = useMemo(() => {
    if (!date) return null;
    const d = new Date(date + "T12:00:00");
    const h = hours.find((x) => x.day_of_week === d.getDay());
    const closed = !h || h.is_closed;
    const inClosure = closures.find((c) => date >= c.start_date && date <= c.end_date && c.blocks_reservations);
    return { d, h, closed, inClosure };
  }, [date, hours, closures]);

  const slots = useMemo(() => {
    if (!dayInfo || dayInfo.closed || dayInfo.inClosure || !dayInfo.h) return [];
    const today = new Date().toISOString().slice(0, 10);
    const isToday = date === today;
    const all = [...slotsBetween(dayInfo.h.lunch_open, dayInfo.h.lunch_close), ...slotsBetween(dayInfo.h.dinner_open, dayInfo.h.dinner_close)];
    return all.filter((s) => {
      if (!isToday) return true;
      const [h] = s.split(":").map(Number);
      return h - new Date().getHours() >= minAdvance;
    });
  }, [dayInfo, date, minAdvance]);

  // Interroge la disponibilité réelle (tables libres couvrant `covers`) pour chaque
  // créneau, dès qu'on affiche l'étape 2. Une RPC SECURITY DEFINER fait le calcul
  // côté base (règle d'occupation +/-90 min + regroupement de tables).
  useEffect(() => {
    if (step !== 2 || slots.length === 0) return;
    let annule = false;
    setDispoLoad(true);
    (async () => {
      const entrees = await Promise.all(
        slots.map(async (s) => {
          const { data, error } = await supabase.rpc("check_availability", {
            p_date: date, p_time: s, p_covers: covers,
          });
          return [s, error ? true : !!data] as const; // en cas d'erreur RPC, on n'empêche pas (repli permissif)
        })
      );
      if (annule) return;
      setDispo(Object.fromEntries(entrees));
      setDispoLoad(false);
    })();
    return () => { annule = true; };
  }, [step, slots, date, covers]);

  if (!open) return null;
  const groupe = covers > phoneThreshold;

  async function confirmer() {
    if (!form.p || !form.n || !form.e || !form.t || !consent) return;
    // Garde-fou : revérifier la disponibilité juste avant l'enregistrement
    // (une autre réservation a pu prendre la dernière table entre-temps).
    const { data: encoreDispo, error: errDispo } = await supabase.rpc("check_availability", {
      p_date: date, p_time: slot || "", p_covers: covers,
    });
    if (!errDispo && encoreDispo === false) {
      setDispo((d) => ({ ...d, [slot || ""]: false }));
      setStep(2);
      return;
    }
    const reservation = {
      customer_name: `${form.p} ${form.n}`, email: form.e, phone: form.t,
      date, time: slot || "", covers, notes: form.notes, status: "attente",
    };
    await supabase.from("reservations").insert(reservation);
    // Opt-in newsletter (si proposé et coché) → alimente leads, sans bloquer si déjà inscrit
    if (proposeNewsletter && newsletterOptin) {
      await supabase.from("leads").insert({
        first_name: form.p, last_name: form.n, email: form.e.trim().toLowerCase(), source: "reservation",
      });
      syncToMailchimp({ email: form.e.trim().toLowerCase(), first_name: form.p, last_name: form.n, source: "reservation" });
    }
    // Accusé de réception au client (n'interrompt pas le flux si l'email échoue)
    sendReservationEmail("accuse", reservation);
    setDone(true);
  }

  return (
    <div className="panneau ouvert" role="dialog" aria-label="Réserver une table">
      <button className="fermer-x" onClick={onClose} aria-label="Fermer">×</button>
      {done ? (
        <div className="confirm-ok">
          <div className="rond">✓</div>
          <h3>Réservation enregistrée</h3>
          <p>{fmtFR(new Date(date + "T12:00:00"))} à {slot?.replace(":", "h")} — {covers} couvert{covers > 1 ? "s" : ""}</p>
          <p className="rgpd">Votre demande sera confirmée par le restaurant.</p>
          <button className="btn btn-accent" onClick={onClose}>Fermer</button>
        </div>
      ) : (
        <>
          <h3>Réserver une table</h3>
          <div className="etapes"><i className="fait" /><i className={step >= 2 ? "fait" : ""} /><i className={step >= 3 ? "fait" : ""} /></div>

          {step === 1 && (
            <div>
              <div className="champ"><label>Date</label><input type="date" value={date} min={new Date().toISOString().slice(0, 10)} max={maxDate} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="champ"><label>Couverts</label>
                <select value={covers} onChange={(e) => setCovers(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {dayInfo?.closed && <div className="alerte">Le restaurant est fermé ce jour-là.</div>}
              {dayInfo?.inClosure && <div className="alerte">Fermeture exceptionnelle : {dayInfo.inClosure.reason || "le restaurant est fermé à cette date"}.</div>}
              {groupe && <div className="alerte"><b>Réservation par téléphone</b><br />Pour les groupes de plus de {phoneThreshold}, contactez-nous.{phone && <div style={{ marginTop: 10 }}><a className="btn btn-accent" href={`tel:${phone}`}>Appeler</a></div>}</div>}
              <div className="pan-actions"><button className="btn btn-accent" disabled={dayInfo?.closed || !!dayInfo?.inClosure || groupe || !date} onClick={() => setStep(2)}>Choisir un créneau</button></div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p style={{ fontWeight: 600 }}>{dayInfo && fmtFR(dayInfo.d)}</p>
              {dispoLoad && <div className="dispo-load">Recherche des disponibilités…</div>}
              <div className="creneaux">
                {slots.map((s) => {
                  const complet = dispo[s] === false;
                  return (
                    <button
                      key={s}
                      className={`creno${slot === s ? " choisi" : ""}${complet ? " complet" : ""}`}
                      disabled={complet}
                      title={complet ? "Plus de table disponible pour ce nombre de couverts" : undefined}
                      onClick={() => setSlot(s)}
                    >
                      {s.replace(":", "h")}
                      {complet && <span className="creno-complet">complet</span>}
                    </button>
                  );
                })}
              </div>
              {slots.length === 0 && <div className="alerte">Aucun créneau disponible pour cette date.</div>}
              {slots.length > 0 && !dispoLoad && slots.every((s) => dispo[s] === false) && (
                <div className="alerte">Aucune table disponible pour {covers} couvert{covers > 1 ? "s" : ""} ce jour-là. Essayez une autre date ou réduisez le nombre de couverts{phone && <>, ou appelez-nous au <a href={`tel:${phone}`}>{phone}</a></>}.</div>
              )}
              <div className="pan-actions"><button className="btn btn-ghost" onClick={() => setStep(1)}>Retour</button><button className="btn btn-accent" disabled={!slot || dispo[slot] === false} onClick={() => setStep(3)}>Continuer</button></div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="recap">{dayInfo && fmtFR(dayInfo.d)} · {slot?.replace(":", "h")} · {covers} couvert{covers > 1 ? "s" : ""}</div>
              <div className="news-grid2">
                <div className="champ"><label>Prénom *</label><input value={form.p} onChange={(e) => setForm({ ...form, p: e.target.value })} /></div>
                <div className="champ"><label>Nom *</label><input value={form.n} onChange={(e) => setForm({ ...form, n: e.target.value })} /></div>
              </div>
              <div className="champ"><label>Email *</label><input type="email" value={form.e} onChange={(e) => setForm({ ...form, e: e.target.value })} /></div>
              <div className="champ"><label>Téléphone *</label><input type="tel" value={form.t} onChange={(e) => setForm({ ...form, t: e.target.value })} /></div>
              <div className="champ"><label>Notes (allergies, occasion…)</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>J'accepte que mes données soient utilisées pour la gestion de ma réservation. *</span></label>
              {proposeNewsletter && (
                <label className="consent"><input type="checkbox" checked={newsletterOptin} onChange={(e) => setNewsletterOptin(e.target.checked)} /><span>Je souhaite aussi recevoir les actualités du restaurant par e-mail.</span></label>
              )}
              <div className="pan-actions"><button className="btn btn-ghost" onClick={() => setStep(2)}>Retour</button><button className="btn btn-accent" onClick={confirmer}>Confirmer</button></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
