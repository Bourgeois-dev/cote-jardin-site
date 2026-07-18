import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

/**
 * Toast unifié de l'admin — remplace les setMsg/setTimeout locaux des onglets.
 * Usage : const toast = useToast(); toast.ok("Enregistré"); toast.err("Échec…");
 * Durées homogènes : 2500 ms (succès), 5000 ms (erreur, plus long pour lire).
 */
type Toast = { id: number; type: "ok" | "err"; texte: string };
type ToastApi = { ok: (texte: string) => void; err: (texte: string) => void };

const ToastContext = createContext<ToastApi>({ ok: () => {}, err: () => {} });

export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const pousser = useCallback((type: "ok" | "err", texte: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, type, texte }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === "ok" ? 2500 : 5000);
  }, []);

  const api: ToastApi = {
    ok: (texte) => pousser("ok", texte),
    err: (texte) => pousser("err", texte),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "ok" ? "✓ " : "⚠ "}{t.texte}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
