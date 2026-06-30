import { useEffect, useState } from "react";

type Status = "loading" | "success" | "already" | "error" | "invalid";

export default function Desinscription() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!token || !UUID_RE.test(token)) {
      setStatus("invalid");
      return;
    }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-unsubscribe`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.already) setStatus("already");
        else if (d.ok)         setStatus("success");
        else                   setStatus("error");
      })
      .catch(() => setStatus("error"));
  }, []);

  const restoName = import.meta.env.VITE_RESTO_NAME || "le restaurant";

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--cream)", fontFamily: "var(--font-body)",
    }}>
      <div style={{
        maxWidth: 480, width: "100%", margin: "0 24px",
        background: "#fff", borderRadius: 16, padding: "48px 40px",
        boxShadow: "0 2px 12px rgba(0,0,0,.06)", textAlign: "center",
      }}>
        {status === "loading" && (
          <>
            <div style={{ fontSize: 36, marginBottom: 20 }}>⏳</div>
            <p style={{ color: "var(--ink-soft)", fontSize: 15 }}>Traitement en cours…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize: 36, marginBottom: 20 }}>✓</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink)", marginBottom: 14 }}>
              Désinscription confirmée
            </h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
              Vous ne recevrez plus de newsletter de la part de <strong>{restoName}</strong>.
              Vous pouvez vous réinscrire à tout moment depuis notre site.
            </p>
            <a href="/" style={{
              display: "inline-block", background: "var(--accent)", color: "#fff",
              padding: "12px 28px", borderRadius: 28, fontSize: 14, fontWeight: 700,
              textDecoration: "none",
            }}>
              Retour au site
            </a>
          </>
        )}

        {status === "already" && (
          <>
            <div style={{ fontSize: 36, marginBottom: 20 }}>ℹ️</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink)", marginBottom: 14 }}>
              Déjà désinscrit·e
            </h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
              Vous étiez déjà désinscrit·e de notre newsletter.
            </p>
            <a href="/" style={{
              display: "inline-block", background: "var(--accent)", color: "#fff",
              padding: "12px 28px", borderRadius: 28, fontSize: 14, fontWeight: 700,
              textDecoration: "none",
            }}>
              Retour au site
            </a>
          </>
        )}

        {(status === "error" || status === "invalid") && (
          <>
            <div style={{ fontSize: 36, marginBottom: 20 }}>⚠️</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink)", marginBottom: 14 }}>
              Lien invalide
            </h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
              Ce lien de désinscription est invalide ou a expiré.
              Si vous souhaitez vous désinscrire, contactez-nous directement.
            </p>
            <a href="/" style={{
              display: "inline-block", background: "var(--accent)", color: "#fff",
              padding: "12px 28px", borderRadius: 28, fontSize: 14, fontWeight: 700,
              textDecoration: "none",
            }}>
              Retour au site
            </a>
          </>
        )}
      </div>
    </div>
  );
}
