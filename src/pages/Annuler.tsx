import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Page /annuler?token=xxx
 * Appelée depuis le lien d'annulation dans les emails (rappel J-1, confirmation).
 * Appelle cancel_by_token() côté Supabase (SECURITY DEFINER, accessible à anon).
 */
export default function Annuler() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [state, setState] = useState<"loading" | "ok" | "error" | "already" | "past" | "missing">("loading");

  useEffect(() => {
    if (!token) { setState("missing"); return; }
    supabase.rpc("cancel_by_token", { p_token: token }).then(({ data, error }) => {
      if (error || !data) { setState("error"); return; }
      if (data.error === "already_cancelled") { setState("already"); return; }
      if (data.error === "past_reservation")  { setState("past");    return; }
      if (data.error === "not_found")         { setState("error");   return; }
      setState("ok");
    });
  }, [token]);

  const name = import.meta.env.VITE_RESTO_NAME || "le restaurant";

  const msgs: Record<string, { titre: string; texte: string; couleur: string }> = {
    loading: { titre: "Annulation en cours…",          texte: "",                                                                  couleur: "var(--ink-soft)" },
    ok:      { titre: "Réservation annulée",            texte: `Votre réservation a bien été annulée. Nous espérons vous revoir bientôt chez ${name} !`, couleur: "var(--accent)" },
    already: { titre: "Déjà annulée",                  texte: "Cette réservation a déjà été annulée.",                            couleur: "var(--gold)" },
    past:    { titre: "Réservation passée",             texte: "Cette réservation est déjà passée, elle ne peut plus être annulée.", couleur: "var(--gold)" },
    error:   { titre: "Lien invalide",                  texte: "Ce lien d'annulation est invalide ou a déjà été utilisé.",         couleur: "var(--erreur)" },
    missing: { titre: "Lien manquant",                  texte: "Aucun token d'annulation trouvé dans l'URL.",                      couleur: "var(--erreur)" },
  };

  const m = msgs[state];

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", fontFamily: "var(--font-body)" }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <a href="/" style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink)", textDecoration: "none", display: "block", marginBottom: 48 }}>
          {name}
        </a>
        <div style={{ background: "#fff", border: "1px solid var(--line)", padding: "40px 32px", borderRadius: 4 }}>
          {state === "loading" ? (
            <p style={{ color: "var(--ink-soft)" }}>Annulation en cours…</p>
          ) : (
            <>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: m.couleur, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#fff", fontSize: 22 }}>
                {state === "ok" ? "✓" : "!"}
              </div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 400, color: "var(--ink)", marginBottom: 14 }}>{m.titre}</h1>
              <p style={{ color: "var(--ink-soft)", fontSize: 15, lineHeight: 1.65, marginBottom: 28 }}>{m.texte}</p>
              <a href="/" style={{ display: "inline-block", padding: "11px 28px", background: "var(--accent)", color: "#fff", borderRadius: 3, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
                Retour au site
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
