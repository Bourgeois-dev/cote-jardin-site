import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useConfirm } from "./Confirm";

// ── Types ───────────────────────────────────────────────────────────────────
interface Campaign {
  id: string;
  template: string;
  segment: string;
  subject: string;
  content: Record<string, string>;
  scheduled_at: string | null;
  sent_at: string | null;
  status: string;
  recipients_count: number | null;
  sent_count: number;
  error_message: string | null;
  created_at: string;
}

// ── Constantes ──────────────────────────────────────────────────────────────
// Welcome n'apparaît pas ici : il est déclenché automatiquement à l'inscription
// (voir Newsletter.tsx côté site), jamais envoyé manuellement depuis l'admin.
const TEMPLATES: Record<string, { label: string; desc: string; icon: string; fields: { key: string; label: string; type?: string; required?: boolean }[] }> = {
  evenementiel: {
    label: "Événementiel", icon: "🎉",
    desc: "Annonce d'un événement : soirée thématique, animation, fête…",
    fields: [
      { key: "preheader", label: "Résumé court (aperçu dans la boîte mail)" },
      { key: "eyebrow", label: "Surtitre (ex. Soirée spéciale)" },
      { key: "titre", label: "Titre de l'événement", required: true },
      { key: "date_event", label: "Date de l'événement (ex. Samedi 12 juillet)" },
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "cta_label", label: "Bouton — texte (ex. Réserver ma table)" },
      { key: "cta_url", label: "Bouton — lien" },
    ],
  },
  nouveau_menu: {
    label: "Nouveau menu", icon: "🍽️",
    desc: "Annonce d'un changement de carte ou d'un nouveau plat à l'honneur.",
    fields: [
      { key: "titre", label: "Titre (ex. Notre nouvelle carte d'été)", required: true },
      { key: "intro", label: "Introduction", type: "textarea", required: true },
      { key: "plat_vedette", label: "Plat à l'honneur (optionnel)" },
      { key: "plat_description", label: "Description du plat" },
      { key: "cta_label", label: "Bouton — texte (ex. Voir la carte)" },
      { key: "cta_url", label: "Bouton — lien" },
    ],
  },
  vie_resto: {
    label: "Vie du restaurant", icon: "📰",
    desc: "Actualité libre : coulisses, producteurs, histoire, news.",
    fields: [
      { key: "eyebrow", label: "Surtitre (ex. Dans les coulisses)" },
      { key: "titre", label: "Titre", required: true },
      { key: "texte", label: "Contenu", type: "textarea", required: true },
      { key: "cta_label", label: "Bouton — texte (optionnel)" },
      { key: "cta_url", label: "Bouton — lien" },
    ],
  },
};

const SEGMENTS: Record<string, { label: string; desc: string }> = {
  tous:              { label: "Tous les contacts", desc: "Inscrits newsletter + clients avec email" },
  optin_reservation: { label: "Opt-in réservation", desc: "Clients ayant coché la newsletter lors d'une réservation" },
  clients:           { label: "Clients", desc: "Tous les clients avec un email connu" },
  fideles:           { label: "Clients fidèles", desc: "Clients avec 3 réservations ou plus" },
  vip:               { label: "VIP", desc: "Clients marqués VIP dans le CRM" },
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Brouillon",  cls: "t-annule" },
  scheduled: { label: "Planifiée", cls: "t-attente" },
  sending:   { label: "En cours",  cls: "t-attente" },
  sent:      { label: "Envoyée",   cls: "t-ok" },
  failed:    { label: "Échec",     cls: "t-annule" },
};

function fmtDatetime(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Canvas de prévisualisation — Événementiel ───────────────────────────────
// Rendu fidèle (au pixel près dans la logique, simplifié en React/CSS pour
// l'écran) du template HTML envoyé par l'edge function send-newsletter.
// Couleurs : variables admin par défaut, remplacées par la charte du client
// une fois ACCENT_COLOR/ACCENT_DARK configurés côté secrets (non visibles ici).
function EventCanvas({ subject, content, imageUrl, restoName }: {
  subject: string; content: Record<string, string>; imageUrl: string; restoName: string;
}) {
  const accent = "var(--admin-accent)";
  return (
    <div style={{
      background: "#ECEAE1", borderRadius: 14, padding: "24px 16px",
      position: "sticky", top: 90,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
        color: "var(--ink-soft)", marginBottom: 10, textAlign: "center" }}>
        Aperçu de l'email
      </div>

      <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(80,100,60,.12)", maxWidth: 500, margin: "0 auto" }}>
        {/* barre accent */}
        <div style={{ height: 5, background: accent }} />

        {/* logo / nom resto */}
        <div style={{ textAlign: "center", padding: "22px 30px 12px", borderBottom: "none" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)" }}>{restoName || "Votre restaurant"}</span>
        </div>

        {/* bandeau header */}
        <div style={{ background: accent, padding: "28px 34px 30px", textAlign: "center" }}>
          {content.eyebrow && (
            <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: "2.5px",
              textTransform: "uppercase", color: "rgba(255,255,255,.75)", marginBottom: 10 }}>
              {content.eyebrow}
            </div>
          )}
          <div style={{ fontFamily: "var(--font-display)", fontSize: 27, lineHeight: 1.3, color: "#fff", fontWeight: 400 }}>
            {content.titre || "Titre de l'événement"}
          </div>
        </div>

        {/* image */}
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: "100%", display: "block", aspectRatio: "600/320", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", aspectRatio: "600/320", background: "var(--cream)", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--ink-soft)", fontStyle: "italic" }}>
            Aucune image — l'email s'affichera sans photo
          </div>
        )}

        {/* corps */}
        <div style={{ padding: "28px 34px 6px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "#3A4A2C", marginBottom: 16 }}>
            Bonjour [Prénom],
          </div>
          {content.date_event && (
            <div style={{ display: "inline-block", background: "var(--cream)", padding: "7px 16px",
              borderRadius: 6, fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 16 }}>
              📅 {content.date_event}
            </div>
          )}
          <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "#4A4A45", whiteSpace: "pre-wrap" }}>
            {content.description || "La description de votre événement apparaîtra ici…"}
          </div>
        </div>

        {/* CTA */}
        {content.cta_label && (
          <div style={{ textAlign: "center", padding: "20px 34px 8px" }}>
            <span style={{ display: "inline-block", background: accent, color: "#fff", fontSize: 14,
              fontWeight: 700, padding: "12px 30px", borderRadius: 25 }}>
              {content.cta_label}
            </span>
          </div>
        )}

        {/* signature */}
        <div style={{ padding: "18px 34px 28px" }}>
          <div style={{ fontSize: 14, color: "#4A4A45" }}>À très bientôt,</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: accent, fontStyle: "italic", marginTop: 3 }}>
            {restoName || "Votre restaurant"}
          </div>
        </div>

        {/* footer */}
        <div style={{ background: "#F4F2EB", borderTop: "1px solid #E4E2D8", padding: "18px 34px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#9A9A8E" }}>Se désinscrire · Voir en ligne</div>
        </div>
      </div>

      <div style={{ marginTop: 18, padding: "0 8px", maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>
          Dans la boîte de réception
        </div>
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {subject || "Objet de l'email"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 3 }}>
            {content.preheader || "Le résumé court apparaîtra ici, juste après l'objet…"}
          </div>
        </div>
      </div>
    </div>
  );
}


function NouveauForm({ onSaved }: { onSaved: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [template, setTemplate] = useState("");
  const [segment, setSegment] = useState("tous");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState<Record<string, string>>({});
  const [imageUrl, setImageUrl] = useState("");
  const [upLoad, setUpLoad] = useState(false);
  const [upErr, setUpErr] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [sendNow, setSendNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");

  const restoName = import.meta.env.VITE_RESTO_NAME || "";

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpErr("");
    if (!file.type.startsWith("image/")) { setUpErr("Choisissez une image (JPG ou PNG)."); return; }
    if (file.size > 10 * 1024 * 1024) { setUpErr("Image trop lourde (max 10 Mo)."); return; }
    setUpLoad(true);
    const path = `newsletter-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("gallery").upload(path, file);
    if (error) { setUpErr("Erreur d'upload : " + error.message); setUpLoad(false); return; }
    const { data } = supabase.storage.from("gallery").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUpLoad(false);
  }

  const tpl = template ? TEMPLATES[template] : null;
  const reqFields = tpl?.fields.filter((f) => f.required) || [];
  const canStep2 = !!template && !!subject && reqFields.every((f) => !!content[f.key]?.trim());
  const canSend  = sendNow || !!scheduledDate;

  async function sauvegarder(lancer: boolean) {
    if (!template || !subject) return;
    setBusy(true); setErreur("");

    let scheduled_at: string | null = null;
    if (sendNow) {
      scheduled_at = new Date().toISOString();
    } else if (scheduledDate) {
      scheduled_at = new Date(`${scheduledDate}T${scheduledTime || "09:00"}:00`).toISOString();
    }

    const finalContent = imageUrl ? { ...content, image_url: imageUrl } : content;

    const { data: camp, error } = await supabase
      .from("newsletter_campaigns")
      .insert({ template, segment, subject, content: finalContent, scheduled_at, status: scheduled_at ? "scheduled" : "draft" })
      .select()
      .single();

    if (error || !camp) { setBusy(false); setErreur("Erreur lors de la création."); return; }

    // Envoi immédiat
    if (sendNow && lancer) {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ campaign_id: camp.id }),
      });
    }

    setBusy(false);
    onSaved();
  }

  return (
    <div className="bloc" style={{ marginBottom: 28 }}>
      <div className="bloc-tete">
        <h2>Nouvelle campagne</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {([1,2,3] as const).map((n) => (
            <span key={n} style={{ width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
              background: step >= n ? "var(--admin-accent)" : "var(--line)", color: step >= n ? "#fff" : "var(--ink-soft)" }}>{n}</span>
          ))}
        </div>
      </div>

      {/* Étape 1 : Template + contenu */}
      {step === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: template === "evenementiel" ? "minmax(0,1fr) 560px" : "1fr", gap: 28 }}>
          <div>
            <p className="desc">Choisissez un type de newsletter et rédigez le contenu.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {Object.entries(TEMPLATES).map(([key, t]) => (
                <button key={key} onClick={() => setTemplate(key)} style={{
                  padding: "14px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "var(--font-body)",
                  border: template === key ? "2px solid var(--admin-accent)" : "1px solid var(--line)",
                  background: template === key ? "var(--a06)" : "#fff",
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>{t.desc}</div>
                </button>
              ))}
            </div>

            {tpl && (
              <div>
                <div className="champ">
                  <label>Objet de l'email <span style={{ color: "var(--admin-accent)" }}>*</span></label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. Notre nouvelle carte d'été est là 🌿" maxLength={150} />
                </div>

                {template === "evenementiel" && (
                  <div className="champ">
                    <label>Image de l'événement (optionnel)</label>
                    <input type="file" accept="image/*" onChange={uploadImage} disabled={upLoad} />
                    {upLoad && <span className="aide" style={{ fontSize: 12, color: "var(--ink-soft)" }}>Envoi en cours…</span>}
                    {upErr && <div className="alerte" style={{ marginTop: 6 }}>{upErr}</div>}
                    {imageUrl && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                        <img src={imageUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
                        <button className="btn btn-mini btn-ligne" onClick={() => setImageUrl("")}>Retirer</button>
                      </div>
                    )}
                  </div>
                )}

                {tpl.fields.map((f) => (
                  <div className="champ" key={f.key}>
                    <label>{f.label}{f.required && <span style={{ color: "var(--admin-accent)" }}> *</span>}</label>
                    {f.type === "textarea"
                      ? <textarea rows={3} value={content[f.key] || ""} onChange={(e) => setContent({ ...content, [f.key]: e.target.value })} maxLength={2000} />
                      : <input value={content[f.key] || ""} onChange={(e) => setContent({ ...content, [f.key]: e.target.value })} maxLength={f.key === "preheader" ? 150 : 200} />
                    }
                  </div>
                ))}
              </div>
            )}

            <div className="pan-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-accent" disabled={!canStep2} onClick={() => setStep(2)}>Suivant →</button>
            </div>
          </div>

          {template === "evenementiel" && (
            <EventCanvas subject={subject} content={content} imageUrl={imageUrl} restoName={restoName} />
          )}
        </div>
      )}

      {/* Étape 2 : Segment */}
      {step === 2 && (
        <div>
          <p className="desc">À qui envoyer cette campagne ?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {Object.entries(SEGMENTS).map(([key, s]) => (
              <button key={key} onClick={() => setSegment(key)} style={{
                padding: "12px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "var(--font-body)",
                border: segment === key ? "2px solid var(--admin-accent)" : "1px solid var(--line)",
                background: segment === key ? "var(--a06)" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-soft)", marginLeft: 10 }}>{s.desc}</span>
                </div>
                {segment === key && <span style={{ color: "var(--admin-accent)", fontWeight: 700 }}>✓</span>}
              </button>
            ))}
          </div>
          <div className="pan-actions">
            <button className="btn btn-ligne" onClick={() => setStep(1)}>← Retour</button>
            <button className="btn btn-accent" onClick={() => setStep(3)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Étape 3 : Planification */}
      {step === 3 && (
        <div>
          <p className="desc">Quand envoyer cette campagne ?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <button onClick={() => { setSendNow(true); setScheduledDate(""); }} style={{
              padding: "14px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "var(--font-body)",
              border: sendNow ? "2px solid var(--admin-accent)" : "1px solid var(--line)",
              background: sendNow ? "var(--a06)" : "#fff",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>⚡ Envoyer maintenant</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>La campagne sera envoyée immédiatement.</div>
            </button>

            <button onClick={() => setSendNow(false)} style={{
              padding: "14px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "var(--font-body)",
              border: !sendNow ? "2px solid var(--admin-accent)" : "1px solid var(--line)",
              background: !sendNow ? "var(--a06)" : "#fff",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>📅 Planifier</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>Choisissez une date et une heure d'envoi.</div>
            </button>
          </div>

          {!sendNow && (
            <div className="grid2">
              <div className="champ">
                <label>Date d'envoi</label>
                <input type="date" value={scheduledDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div className="champ">
                <label>Heure d'envoi</label>
                <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
            </div>
          )}

          <div style={{ background: "var(--cream)", borderRadius: 8, padding: "12px 16px", fontSize: 13, marginBottom: 20 }}>
            <b>Récap</b> — Template : {TEMPLATES[template]?.label} · Segment : {SEGMENTS[segment]?.label} · Objet : {subject}
          </div>

          {erreur && <div className="alerte">{erreur}</div>}

          <div className="pan-actions">
            <button className="btn btn-ligne" onClick={() => setStep(2)}>← Retour</button>
            <button className="btn btn-ligne" disabled={busy} onClick={() => sauvegarder(false)}>Sauvegarder en brouillon</button>
            <button className="btn btn-accent" disabled={busy || !canSend} onClick={() => sauvegarder(true)}>
              {busy ? "…" : sendNow ? "⚡ Envoyer" : "📅 Planifier"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet principal ────────────────────────────────────────────────────────
export default function TabNewsletter() {
  const [campagnes, setCampagnes] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"liste" | "nouveau">("liste");
  const [filtre, setFiltre] = useState<"toutes" | "draft" | "scheduled" | "sent">("toutes");
  const confirm = useConfirm();

  async function charger() {
    setLoading(true);
    const { data } = await supabase
      .from("newsletter_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setCampagnes(data || []);
    setLoading(false);
  }

  useEffect(() => { charger(); }, []);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("newsletter-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "newsletter_campaigns" }, charger)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function annuler(c: Campaign) {
    const ok = await confirm(`Annuler la campagne "${c.subject}" ?`);
    if (!ok) return;
    await supabase.from("newsletter_campaigns").update({ status: "draft", scheduled_at: null }).eq("id", c.id);
    charger();
  }

  async function supprimer(c: Campaign) {
    const ok = await confirm(`Supprimer définitivement la campagne "${c.subject}" ?`);
    if (!ok) return;
    await supabase.from("newsletter_campaigns").delete().eq("id", c.id);
    charger();
  }

  async function envoyer(c: Campaign) {
    const ok = await confirm(`Envoyer maintenant la campagne "${c.subject}" ?`);
    if (!ok) return;
    await supabase.from("newsletter_campaigns").update({ scheduled_at: new Date().toISOString(), status: "scheduled" }).eq("id", c.id);
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ campaign_id: c.id }),
    });
    charger();
  }

  const affichees = campagnes.filter((c) => filtre === "toutes" || c.status === filtre ||
    (filtre === "scheduled" && c.status === "scheduled"));

  const nbScheduled = campagnes.filter((c) => c.status === "scheduled").length;
  const nbDraft     = campagnes.filter((c) => c.status === "draft").length;

  return (
    <div className="contenu">
      <div className="topbar">
        <div>
          <h1>Newsletter</h1>
          <p className="sous">Campagnes email — {campagnes.length} au total</p>
        </div>
        <button className="btn btn-accent" onClick={() => setMode(mode === "nouveau" ? "liste" : "nouveau")}>
          {mode === "nouveau" ? "← Retour à la liste" : "+ Nouvelle campagne"}
        </button>
      </div>

      <div className="contenu" style={{ paddingTop: 20 }}>

        {mode === "nouveau" && (
          <NouveauForm onSaved={() => { setMode("liste"); charger(); }} />
        )}

        {mode === "liste" && (
          <>
            {/* Filtres */}
            <div className="filtres-resa" style={{ marginBottom: 20 }}>
              <button className={`puce-mini${filtre === "toutes" ? " active" : ""}`} onClick={() => setFiltre("toutes")}>Toutes</button>
              <button className={`puce-mini${filtre === "scheduled" ? " active" : ""}`} onClick={() => setFiltre("scheduled")}>
                Planifiées {nbScheduled > 0 && <span className="ps-pip">{nbScheduled}</span>}
              </button>
              <button className={`puce-mini${filtre === "draft" ? " active" : ""}`} onClick={() => setFiltre("draft")}>
                Brouillons {nbDraft > 0 && <span className="ps-pip">{nbDraft}</span>}
              </button>
              <button className={`puce-mini${filtre === "sent" ? " active" : ""}`} onClick={() => setFiltre("sent")}>Envoyées</button>
            </div>

            {loading && <p className="vide">Chargement…</p>}

            {!loading && affichees.length === 0 && (
              <div className="bloc">
                <p className="vide">Aucune campagne.{filtre === "toutes" ? " Créez votre première newsletter !" : ""}</p>
              </div>
            )}

            {!loading && affichees.length > 0 && (
              <div className="bloc" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Campagne</th>
                      <th>Segment</th>
                      <th>Planifiée</th>
                      <th>Envoyée</th>
                      <th>Résultat</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {affichees.map((c) => {
                      const st = STATUS_LABELS[c.status] || { label: c.status, cls: "" };
                      return (
                        <tr key={c.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 18 }}>{TEMPLATES[c.template]?.icon || "📧"}</span>
                              <div>
                                <b style={{ fontSize: 14 }}>{c.subject}</b>
                                <div className="sub-desc">{TEMPLATES[c.template]?.label || c.template}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: 13 }}>{SEGMENTS[c.segment]?.label || c.segment}</td>
                          <td style={{ fontSize: 13, color: "var(--ink-soft)" }}>{fmtDatetime(c.scheduled_at)}</td>
                          <td style={{ fontSize: 13, color: "var(--ink-soft)" }}>{fmtDatetime(c.sent_at)}</td>
                          <td>
                            <span className={`tag ${st.cls}`} style={{ fontSize: 11 }}>{st.label}</span>
                            {c.status === "sent" && c.sent_count != null && (
                              <div className="sub-desc" style={{ marginTop: 4, fontSize: 11 }}>
                                {c.sent_count} / {c.recipients_count ?? "?"} envoyés
                              </div>
                            )}
                            {c.error_message && (
                              <div style={{ fontSize: 11, color: "var(--annule)", marginTop: 2 }}>⚠ {c.error_message.slice(0, 60)}</div>
                            )}
                          </td>
                          <td>
                            <div className="actions-ligne">
                              {(c.status === "draft") && (
                                <button className="btn btn-mini btn-ok" onClick={() => envoyer(c)}>⚡ Envoyer</button>
                              )}
                              {c.status === "scheduled" && (
                                <button className="btn btn-mini btn-ligne" onClick={() => annuler(c)}>Annuler</button>
                              )}
                              {(c.status === "draft" || c.status === "failed") && (
                                <button className="btn btn-mini btn-danger" onClick={() => supprimer(c)}>Supprimer</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
