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
// Un seul type de campagne : le restaurateur compose librement avec des blocs.
// (Les anciens templates figés — evenementiel, nouveau_menu, vie_resto — ont été retirés :
//  ils n'étaient que des cas particuliers de ce système. Leur rendu reste dans l'edge
//  function pour que les campagnes archivées restent lisibles.)
const TEMPLATES: Record<string, { label: string; icon: string; desc: string }> = {
  blocs: { label: "Campagne libre", icon: "✍️", desc: "Composez votre message avec des blocs" },
};

// Types de blocs disponibles
type Colonne = { titre?: string; texte?: string; image?: string; cta_label?: string; cta_url?: string };
type Bloc =
  | { type: "pleine_largeur"; titre?: string; texte?: string; image?: string; cta_label?: string; cta_url?: string }
  | { type: "deux_colonnes"; colonnes: [Colonne, Colonne] };

function blocVide(type: "pleine_largeur" | "deux_colonnes"): Bloc {
  return type === "deux_colonnes"
    ? { type, colonnes: [{}, {}] }
    : { type };
}

// Welcome n'apparaît pas dans TEMPLATES (pas de formulaire, déclenché
// automatiquement) mais doit être nommé/filtrable dans la liste des campagnes.
const TYPE_DISPLAY: Record<string, { label: string; icon: string }> = {
  welcome: { label: "Bienvenue", icon: "💌" },
  ...Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, { label: t.label, icon: t.icon }])),
};

const SEGMENTS: Record<string, { label: string; desc: string }> = {
  optin:       { label: "Opt-in newsletter", desc: "Tous les inscrits — via le formulaire newsletter ou l'opt-in proposé à la réservation" },
  optin_vip:   { label: "VIP",               desc: "Inscrits newsletter marqués VIP dans le CRM" },
  inactif_1_2: { label: "Pas venus depuis 1 à 2 mois", desc: "Inscrits dont la dernière venue remonte à 1 ou 2 mois" },
  inactif_3_4: { label: "Pas venus depuis 3 à 4 mois", desc: "Inscrits dont la dernière venue remonte à 3 ou 4 mois" },
  inactif_5_6: { label: "Pas venus depuis 5 à 6 mois", desc: "Inscrits dont la dernière venue remonte à 5 ou 6 mois" },
  jamais_venu: { label: "Jamais venus",                desc: "Inscrits newsletter sans aucune venue enregistrée" },
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
// Aperçu unique : rend n'importe quelle composition de blocs.
// Reflète la structure réelle de l'email (600px, logo, blocs, footer).
function BlocsCanvas({ subject, content, restoName, logoUrl }: {
  subject: string; content: any; restoName: string; logoUrl: string;
}) {
  // L'aperçu doit refléter l'email réel : charte du SITE (secret ACCENT_COLOR côté edge),
  // et NON la charte de l'admin (--admin-accent, bordeaux) qui n'apparaît jamais dans un email.
  const accent = "var(--accent, #5a7d4f)";
  const INK = "#333333";
  const blocs: any[] = Array.isArray(content.blocs) ? content.blocs : [];

  const Cta = ({ label }: { label?: string }) =>
    label ? (
      <div style={{ textAlign: "center", padding: "10px 0 2px" }}>
        <span style={{ display: "inline-block", background: accent, color: "#fff", fontSize: 12,
          fontWeight: 700, padding: "9px 22px", borderRadius: 5 }}>{label}</span>
      </div>
    ) : null;

  const Corps = ({ v, petit }: { v: any; petit?: boolean }) => (
    <>
      {/* padding 10px autour de l'image en 2 colonnes — reflète l'email réel */}
      {v.image && (
        <div style={{ padding: petit ? 10 : 0 }}>
          <img src={v.image} alt="" style={{ width: "100%", display: "block" }} />
        </div>
      )}
      <div style={{ padding: petit ? "12px 14px" : "18px 24px" }}>
        {v.titre && <div style={{ fontSize: petit ? 13 : 15, fontWeight: 700, color: INK, marginBottom: 6 }}>{v.titre}</div>}
        {String(v.texte || "").split(/\n+/).filter(Boolean).map((t: string, i: number) => (
          <div key={i} style={{ fontSize: petit ? 11.5 : 13, lineHeight: 1.6, color: INK, marginBottom: 8 }}>{t}</div>
        ))}
        <Cta label={v.cta_label} />
      </div>
    </>
  );

  return (
    <div style={{ background: "#ECEAE1", borderRadius: 14, padding: "24px 16px", position: "sticky", top: 90 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
        color: "var(--ink-soft)", marginBottom: 10, textAlign: "center" }}>
        Aperçu de l'email
      </div>

      <div style={{ marginBottom: 18, maxWidth: 500, margin: "0 auto 18px" }}>
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

      <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(80,100,60,.12)", maxWidth: 500, margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: "20px 30px 10px" }}>
          {logoUrl
            ? <img src={logoUrl} alt={restoName} style={{ height: 44, maxWidth: 200, objectFit: "contain", margin: "0 auto", display: "block" }} />
            : <span style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "var(--ink)" }}>{restoName || "Votre restaurant"}</span>}
        </div>

        {content.hero_image && <img src={content.hero_image} alt="" style={{ width: "100%", display: "block" }} />}

        {!blocs.length && (
          <div style={{ padding: "28px 24px", textAlign: "center", fontSize: 12, color: "var(--ink-soft)", fontStyle: "italic" }}>
            Ajoutez un bloc pour voir l'aperçu.
          </div>
        )}

        {blocs.map((b, i) =>
          b?.type === "deux_colonnes" ? (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#eee", margin: "10px 0" }}>
              {[0, 1].map((n) => (
                <div key={n} style={{ background: "#fff" }}><Corps v={b.colonnes?.[n] || {}} petit /></div>
              ))}
            </div>
          ) : (
            <div key={i}><Corps v={b} /></div>
          )
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #E4E2D8", margin: "14px 24px 0" }} />
        <div style={{ textAlign: "center", padding: "16px 24px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{restoName || "Votre restaurant"}</div>
          <div style={{ fontSize: 11, color: "#6b6358", marginTop: 4 }}>Adresse du restaurant</div>
          <div style={{ marginTop: 12 }}>
            <span style={{ display: "inline-block", background: accent, color: "#fff", fontSize: 12, fontWeight: 700, padding: "9px 22px", borderRadius: 5 }}>Voir le site</span>
          </div>
          <div style={{ fontSize: 10, color: "#9a9189", marginTop: 14, lineHeight: 1.6 }}>
            Vous recevez cet e-mail car vous êtes inscrit à notre newsletter.<br />
            <span style={{ textDecoration: "underline" }}>Se désinscrire</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Champs d'un bloc (ou d'une colonne) : titre, texte, image, CTA.
   Tout est optionnel — le restaurateur ne remplit que ce dont il a besoin. */
function ChampsBloc({ val, onChange, onUpload }: {
  val: { titre?: string; texte?: string; image?: string; cta_label?: string; cta_url?: string };
  onChange: (champs: Record<string, any>) => void;
  onUpload: (f: File) => Promise<string | null>;
}) {
  return (
    <>
      <div className="champ">
        <label>Titre</label>
        <input value={val.titre || ""} onChange={(e) => onChange({ titre: e.target.value })} maxLength={120} placeholder="Optionnel" />
      </div>
      <div className="champ">
        <label>Texte</label>
        <textarea rows={3} value={val.texte || ""} onChange={(e) => onChange({ texte: e.target.value })} maxLength={2000}
          placeholder="Un paragraphe par ligne" />
      </div>
      <div className="champ">
        <label>Image</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {val.image
            ? <img src={val.image} alt="" style={{ width: 56, height: 38, objectFit: "cover", borderRadius: 5 }} />
            : <div style={{ width: 56, height: 38, borderRadius: 5, background: "#eee", display: "grid", placeItems: "center", fontSize: 10, color: "#999" }}>—</div>}
          <label className="btn btn-ligne btn-mini" style={{ cursor: "pointer" }}>
            {val.image ? "Changer" : "Ajouter"}
            <input type="file" accept="image/*" style={{ display: "none" }}
              onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const u = await onUpload(f); if (u) onChange({ image: u }); }} />
          </label>
          {val.image && <button className="btn btn-mini btn-danger" onClick={() => onChange({ image: "" })}>×</button>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className="champ">
          <label>Bouton — libellé</label>
          <input value={val.cta_label || ""} onChange={(e) => onChange({ cta_label: e.target.value })} maxLength={40} placeholder="Ex. Réserver" />
        </div>
        <div className="champ">
          <label>Bouton — lien</label>
          <input value={val.cta_url || ""} onChange={(e) => onChange({ cta_url: e.target.value })} placeholder="https://…" />
        </div>
      </div>
    </>
  );
}

function NouveauForm({ onSaved, initial }: {
  onSaved: () => void;
  initial?: { id?: string; template: string; segment: string; subject: string; content: Record<string, string> };
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [template] = useState(initial?.template || "blocs");
  const [segment, setSegment] = useState(initial?.segment || "optin");
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  // Nombre de destinataires par segment (RPC : même logique que l'envoi réel)
  useEffect(() => {
    supabase.rpc("newsletter_segment_counts").then(({ data }) => {
      if (data) setCounts(data as Record<string, number>);
    });
  }, []);
  const [subject, setSubject] = useState(initial?.subject || "");
  const [content, setContent] = useState<Record<string, any>>(initial?.content || {});

  // ── Blocs de la campagne ────────────────────────────────────────────────
  const blocs: Bloc[] = Array.isArray(content.blocs) ? content.blocs : [];
  const setBlocs = (b: Bloc[]) => setContent((c: any) => ({ ...c, blocs: b }));

  function ajouterBloc(type: "pleine_largeur" | "deux_colonnes") {
    setBlocs([...blocs, blocVide(type)]);
  }
  function supprimerBloc(i: number) {
    setBlocs(blocs.filter((_, n) => n !== i));
  }
  function deplacerBloc(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocs.length) return;
    const copie = [...blocs];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    setBlocs(copie);
  }
  function majBloc(i: number, champs: Record<string, any>) {
    setBlocs(blocs.map((b, n) => n === i ? { ...b, ...champs } as Bloc : b));
  }
  function majColonne(i: number, col: 0 | 1, champs: Record<string, any>) {
    setBlocs(blocs.map((b, n) => {
      if (n !== i || b.type !== "deux_colonnes") return b;
      const colonnes = [...b.colonnes] as [Colonne, Colonne];
      colonnes[col] = { ...colonnes[col], ...champs };
      return { ...b, colonnes };
    }));
  }
  const [upLoad, setUpLoad] = useState(false);
  const [upErr, setUpErr] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [sendNow, setSendNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");

  const restoName = import.meta.env.VITE_RESTO_NAME || "";
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    supabase.from("site_content").select("content").eq("section_key", "newsletter_logo").maybeSingle()
      .then(({ data }) => { if (data?.content?.url) setLogoUrl(data.content.url); });
  }, []);

  async function uploadImage(file: File): Promise<string | null> {
    setUpErr("");
    if (!file.type.startsWith("image/")) { setUpErr("Choisissez une image (JPG ou PNG)."); return null; }
    if (file.size > 10 * 1024 * 1024) { setUpErr("Image trop lourde (max 10 Mo)."); return null; }
    setUpLoad(true);
    const path = `newsletter-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("gallery").upload(path, file);
    if (error) { setUpErr("Erreur d'upload : " + error.message); setUpLoad(false); return null; }
    const { data } = supabase.storage.from("gallery").getPublicUrl(path);
    setUpLoad(false);
    return data.publicUrl;
  }


  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpErr("");
    if (!file.type.startsWith("image/")) { setUpErr("Choisissez une image (JPG ou PNG)."); return; }
    if (file.size > 5 * 1024 * 1024) { setUpErr("Logo trop lourd (max 5 Mo)."); return; }
    setUpLoad(true);
    const path = `newsletter-logo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("gallery").upload(path, file);
    if (error) { setUpErr("Erreur d'upload : " + error.message); setUpLoad(false); return; }
    const { data } = supabase.storage.from("gallery").getPublicUrl(path);
    await supabase.from("site_content").upsert({ section_key: "newsletter_logo", content: { url: data.publicUrl } }, { onConflict: "section_key" });
    setLogoUrl(data.publicUrl);
    setUpLoad(false);
  }

  // Une campagne est valide si elle a un objet et au moins un bloc.
  const canStep2 = !!subject.trim() && blocs.length > 0;
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

    const finalContent = content;

    let camp: Campaign | null = null;
    let error: unknown = null;
    if (initial?.id) {
      // Reprise d'un brouillon existant : mise à jour de la ligne
      const res = await supabase
        .from("newsletter_campaigns")
        .update({ template, segment, subject, content: finalContent, scheduled_at, status: scheduled_at ? "scheduled" : "draft" })
        .eq("id", initial.id)
        .select()
        .single();
      camp = res.data; error = res.error;
    } else {
      const res = await supabase
        .from("newsletter_campaigns")
        .insert({ template, segment, subject, content: finalContent, scheduled_at, status: scheduled_at ? "scheduled" : "draft" })
        .select()
        .single();
      camp = res.data; error = res.error;
    }

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

      {/* Étape 1 : Composition libre par blocs */}
      {step === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 560px", gap: 28 }}>
          <div>
            <p className="desc">Composez votre campagne avec des blocs. Aucun format imposé : ajoutez, réordonnez, supprimez.</p>

            {/* Logo (une fois pour toutes les campagnes) */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--cream)",
              border: "1px solid var(--line)", borderRadius: 10, padding: "12px 16px", marginBottom: 18 }}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" style={{ height: 36, maxWidth: 120, objectFit: "contain" }} />
                : <span style={{ fontSize: 13, color: "var(--ink-soft)", fontStyle: "italic" }}>Aucun logo défini</span>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Logo des newsletters</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Utilisé sur toutes les campagnes — à définir une seule fois.</div>
              </div>
              <label className="btn btn-ligne btn-mini" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: upLoad ? "default" : "pointer", opacity: upLoad ? .6 : 1, whiteSpace: "nowrap" }}>
                📷 {logoUrl ? "Changer" : "Ajouter"}
                <input type="file" accept="image/*" onChange={uploadLogo} disabled={upLoad} style={{ display: "none" }} />
              </label>
            </div>

            <div className="champ">
              <label>Objet de l'email <span style={{ color: "var(--admin-accent)" }}>*</span></label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. Notre nouvelle carte d'été est là 🌿" maxLength={150} />
            </div>
            <div className="champ">
              <label>Aperçu (preheader)</label>
              <input value={content.preheader || ""} onChange={(e) => setContent({ ...content, preheader: e.target.value })}
                placeholder="Le texte gris affiché après l'objet dans la boîte de réception" maxLength={150} />
            </div>
            <div className="champ">
              <label>Image d'en-tête (optionnelle)</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {content.hero_image
                  ? <img src={content.hero_image} alt="" style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 6 }} />
                  : <div style={{ width: 72, height: 48, borderRadius: 6, background: "var(--cream)", display: "grid", placeItems: "center", fontSize: 11, color: "var(--ink-soft)" }}>—</div>}
                <label className="btn btn-ligne btn-mini" style={{ cursor: "pointer" }}>
                  {content.hero_image ? "Remplacer" : "Ajouter"}
                  <input type="file" accept="image/*" style={{ display: "none" }}
                    onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const u = await uploadImage(f); if (u) setContent({ ...content, hero_image: u }); }} />
                </label>
                {content.hero_image && <button className="btn btn-mini btn-danger" onClick={() => setContent({ ...content, hero_image: "" })}>Retirer</button>}
              </div>
            </div>

            {/* ── Éditeur de blocs ── */}
            <div style={{ marginTop: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <b style={{ fontSize: 14, color: "var(--ink)" }}>Contenu ({blocs.length} bloc{blocs.length > 1 ? "s" : ""})</b>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ligne btn-mini" onClick={() => ajouterBloc("pleine_largeur")}>+ Pleine largeur</button>
                  <button className="btn btn-ligne btn-mini" onClick={() => ajouterBloc("deux_colonnes")}>+ 2 colonnes</button>
                </div>
              </div>

              {!blocs.length && (
                <div className="vide" style={{ padding: "24px 0" }}>
                  Aucun bloc. Ajoutez-en un pour commencer votre campagne.
                </div>
              )}

              {blocs.map((b, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 12, background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <b style={{ fontSize: 13, color: "var(--ink)" }}>
                      {b.type === "deux_colonnes" ? "▭▭ Deux colonnes" : "▬ Pleine largeur"}
                    </b>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      <button className="btn btn-mini btn-ligne" onClick={() => deplacerBloc(i, -1)} disabled={i === 0} title="Monter">▲</button>
                      <button className="btn btn-mini btn-ligne" onClick={() => deplacerBloc(i, 1)} disabled={i === blocs.length - 1} title="Descendre">▼</button>
                      <button className="btn btn-mini btn-danger" onClick={() => supprimerBloc(i)} title="Supprimer">×</button>
                    </span>
                  </div>

                  {b.type === "pleine_largeur" ? (
                    <ChampsBloc
                      val={b}
                      onChange={(champs) => majBloc(i, champs)}
                      onUpload={uploadImage}
                    />
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[0, 1].map((n) => (
                        <div key={n} style={{ background: "var(--cream)", borderRadius: 8, padding: 10 }}>
                          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-soft)", marginBottom: 8 }}>
                            Colonne {n + 1}
                          </div>
                          <ChampsBloc
                            val={b.colonnes[n as 0 | 1]}
                            onChange={(champs) => majColonne(i, n as 0 | 1, champs)}
                            onUpload={uploadImage}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {upErr && <div className="login-err" style={{ marginTop: 10 }}>{upErr}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-accent" disabled={!subject.trim() || !blocs.length} onClick={() => setStep(2)}>
                Suivant →
              </button>
            </div>
          </div>

          <div>
            <BlocsCanvas subject={subject} content={content} restoName={restoName} logoUrl={logoUrl} />
          </div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <span className="seg-compteur">
                    {counts ? `${counts[key] ?? 0} contact${(counts[key] ?? 0) > 1 ? "s" : ""}` : "…"}
                  </span>
                  {segment === key && <span style={{ color: "var(--admin-accent)", fontWeight: 700 }}>✓</span>}
                </div>
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
            <b>Récap</b> — Template : {TEMPLATES[template]?.label} · Segment : {SEGMENTS[segment]?.label}{counts ? ` (${counts[segment] ?? 0} destinataire${(counts[segment] ?? 0) > 1 ? "s" : ""})` : ""} · Objet : {subject}
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
  const [filtreType, setFiltreType] = useState<string>("tous"); // "tous" | clé de TEMPLATES | "welcome"
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  // Pré-remplissage du formulaire : dupliquer (sans id) ou reprendre un brouillon (avec id)
  const [prefill, setPrefill] = useState<{ id?: string; template: string; segment: string; subject: string; content: Record<string, string> } | undefined>(undefined);
  const confirm = useConfirm();

  function dupliquer(c: Campaign) {
    setPrefill({ template: c.template, segment: c.segment, subject: c.subject, content: { ...c.content } });
    setMode("nouveau");
  }

  function reprendre(c: Campaign) {
    setPrefill({ id: c.id, template: c.template, segment: c.segment, subject: c.subject, content: { ...c.content } });
    setMode("nouveau");
  }

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

  // Date de référence d'une campagne pour le filtre par période :
  // envoyée → sent_at, planifiée → scheduled_at, brouillon → created_at.

function dateRef(c: Campaign): string {
    return c.sent_at || c.scheduled_at || c.created_at;
  }

  const affichees = campagnes.filter((c) => {
    if (filtre !== "toutes" && c.status !== filtre) return false;
    if (filtreType !== "tous" && c.template !== filtreType) return false;
    const ref = dateRef(c);
    if (dateDebut && ref && ref.slice(0, 10) < dateDebut) return false;
    if (dateFin && ref && ref.slice(0, 10) > dateFin) return false;
    return true;
  });

  const typesPresents = Array.from(new Set(campagnes.map((c) => c.template)));
  const filtresDateActifs = !!dateDebut || !!dateFin || filtreType !== "tous";

  const nbScheduled = campagnes.filter((c) => c.status === "scheduled").length;
  const nbDraft     = campagnes.filter((c) => c.status === "draft").length;
  const nbSent      = campagnes.filter((c) => c.status === "sent").length;

  return (
    <div className="contenu">
      <div className="topbar">
        <div>
          <h1>Newsletter</h1>
          <p className="sous">Campagnes email — {campagnes.length} au total</p>
        </div>
        <button className="btn btn-accent" onClick={() => { setPrefill(undefined); setMode(mode === "nouveau" ? "liste" : "nouveau"); }}>
          {mode === "nouveau" ? "← Retour à la liste" : "+ Nouvelle campagne"}
        </button>
      </div>

      <div className="contenu" style={{ paddingTop: 20 }}>

        {mode === "nouveau" && (
          <NouveauForm key={prefill?.id || (prefill ? "dup" : "neuf")} initial={prefill}
            onSaved={() => { setPrefill(undefined); setMode("liste"); charger(); }} />
        )}

        {mode === "liste" && (
          <>
            {/* Filtres */}
            <div className="filtres-resa" style={{ marginBottom: 20 }}>
              <button className={`puce-mini${filtre === "toutes" ? " active" : ""}`} onClick={() => setFiltre("toutes")}>
                Toutes{campagnes.length > 0 ? ` (${campagnes.length})` : ""}
              </button>
              <button className={`puce-mini${filtre === "scheduled" ? " active" : ""}`} onClick={() => setFiltre("scheduled")}>
                Planifiées {nbScheduled > 0 && <span className="ps-pip">{nbScheduled}</span>}
              </button>
              <button className={`puce-mini${filtre === "draft" ? " active" : ""}`} onClick={() => setFiltre("draft")}>
                Brouillons {nbDraft > 0 && <span className="ps-pip">{nbDraft}</span>}
              </button>
              <button className={`puce-mini${filtre === "sent" ? " active" : ""}`} onClick={() => setFiltre("sent")}>
                Envoyées{nbSent > 0 ? ` (${nbSent})` : ""}
              </button>
            </div>

            {/* Filtres secondaires : type de campagne + période d'envoi/planification */}
            {typesPresents.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                <select value={filtreType} onChange={(e) => setFiltreType(e.target.value)}
                  style={{ width: "auto", padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)" }}>
                  <option value="tous">Tous les types</option>
                  {typesPresents.map((t) => (
                    <option key={t} value={t}>{TYPE_DISPLAY[t]?.icon || "📧"} {TYPE_DISPLAY[t]?.label || t}</option>
                  ))}
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-soft)" }}>
                  du
                  <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)}
                    style={{ width: "auto", padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)" }} />
                  au
                  <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)}
                    style={{ width: "auto", padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)" }} />
                </div>
                {filtresDateActifs && (
                  <button className="btn btn-mini btn-ligne" onClick={() => { setFiltreType("tous"); setDateDebut(""); setDateFin(""); }}>
                    ✕ Réinitialiser
                  </button>
                )}
              </div>
            )}

            {loading && <p className="vide">Chargement…</p>}

            {!loading && affichees.length === 0 && (
              <div className="bloc" style={{ textAlign: "center", padding: "36px 24px" }}>
                {campagnes.length === 0 ? (
                  <>
                    <div style={{ fontSize: 34, marginBottom: 10 }}>📮</div>
                    <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Aucune campagne pour l'instant</p>
                    <p className="vide" style={{ marginBottom: 16 }}>Annoncez un événement, une nouvelle carte ou une actualité à vos inscrits.</p>
                    <button className="btn btn-accent" onClick={() => { setPrefill(undefined); setMode("nouveau"); }}>
                      + Créer ma première campagne
                    </button>
                  </>
                ) : (
                  <>
                    <p className="vide" style={{ marginBottom: filtresDateActifs ? 12 : 0 }}>Aucune campagne dans ce filtre.</p>
                    {filtresDateActifs && (
                      <button className="btn btn-mini btn-ligne" onClick={() => { setFiltreType("tous"); setDateDebut(""); setDateFin(""); }}>
                        ✕ Réinitialiser les filtres
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {!loading && affichees.length > 0 && (
              <div className="bloc" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Campagne</th>
                      <th>Segment</th>
                      <th>Envoi</th>
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
                              <span style={{ fontSize: 18 }}>{TYPE_DISPLAY[c.template]?.icon || "📧"}</span>
                              <div>
                                <b style={{ fontSize: 14 }}>{c.subject}</b>
                                <div className="sub-desc">{TYPE_DISPLAY[c.template]?.label || c.template}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: 13 }}>
                            {SEGMENTS[c.segment]?.label || c.segment}
                            {c.status === "sent" && c.recipients_count != null && (
                              <div className="sub-desc" style={{ fontSize: 11, marginTop: 2 }}>
                                {c.recipients_count} destinataire{c.recipients_count > 1 ? "s" : ""}
                              </div>
                            )}
                          </td>
                          {/* Une seule colonne : date d'envoi effective, ou envoi à venir mis en avant */}
                          <td style={{ fontSize: 13 }}>
                            {c.status === "scheduled" && c.scheduled_at ? (
                              <span style={{ color: "var(--admin-accent)", fontWeight: 700 }}>→ {fmtDatetime(c.scheduled_at)}</span>
                            ) : (
                              <span style={{ color: "var(--ink-soft)" }}>{fmtDatetime(c.sent_at || c.scheduled_at)}</span>
                            )}
                          </td>
                          <td>
                            <span className={`tag ${st.cls}`} style={{ fontSize: 11 }}>{st.label}</span>
                            {c.status === "sent" && c.sent_count != null && c.recipients_count != null && c.sent_count < c.recipients_count && (
                              <div style={{ fontSize: 11, color: "var(--annule)", marginTop: 4 }}>
                                ⚠ {c.sent_count} / {c.recipients_count} envoyés
                              </div>
                            )}
                            {c.error_message && (
                              <div style={{ fontSize: 11, color: "var(--annule)", marginTop: 2 }}>⚠ {c.error_message.slice(0, 60)}</div>
                            )}
                          </td>
                          <td>
                            <div className="actions-ligne">
                              {(c.status === "draft") && (
                                <>
                                  <button className="btn btn-mini btn-ligne" onClick={() => reprendre(c)}>✎ Reprendre</button>
                                  <button className="btn btn-mini btn-ok" onClick={() => envoyer(c)}>⚡ Envoyer</button>
                                </>
                              )}
                              {c.status === "scheduled" && (
                                <button className="btn btn-mini btn-ligne" onClick={() => annuler(c)}>Annuler l'envoi</button>
                              )}
                              {TEMPLATES[c.template] && (
                                <button className="btn btn-mini btn-ligne" onClick={() => dupliquer(c)}>⧉ Dupliquer</button>
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
