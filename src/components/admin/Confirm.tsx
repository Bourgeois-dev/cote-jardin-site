import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";

// "annuler" : libellé du bouton de fermeture. Indispensable quand l'action confirmée
// est elle-même une annulation (sinon deux boutons « Annuler » côte à côte).
// "saisie" : quand présent, la modale affiche un champ texte. Le hook résout
// alors avec la CHAÎNE saisie (ou false si annulé) au lieu d'un booléen.
type ChampSaisie = { label?: string; placeholder?: string; valeurInitiale?: string };
type ConfirmOptions = { titre: string; message?: string; confirmer?: string; annuler?: string; danger?: boolean; saisie?: ChampSaisie };
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean | string>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm() { return useContext(ConfirmContext); }

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<{ opts: ConfirmOptions; resolve: (v: boolean | string) => void } | null>(null);
  const [valeur, setValeur] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setValeur(opts.saisie?.valeurInitiale ?? "");
    return new Promise<boolean | string>((resolve) => setEtat({ opts, resolve }));
  }, []);

  // Focus automatique du champ à l'ouverture d'une modale de saisie.
  useEffect(() => {
    if (etat?.opts.saisie) { const id = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(id); }
  }, [etat]);

  function repondre(v: boolean) {
    // Modale de saisie : "confirmer" renvoie la chaîne (vide -> traité comme annulation
    // par l'appelant s'il le souhaite), "annuler" renvoie false.
    if (etat?.opts.saisie && v) etat.resolve(valeur.trim());
    else etat?.resolve(v);
    setEtat(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {etat && (
        <div className="modal-backdrop" onClick={() => repondre(false)}>
          <div className="modal-in" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 19, marginBottom: 8 }}>{etat.opts.titre}</h2>
            {etat.opts.message && <div className="desc" style={{ marginBottom: etat.opts.saisie ? 12 : 18 }}>{etat.opts.message}</div>}
            {etat.opts.saisie && (
              <div style={{ marginBottom: 18 }}>
                {etat.opts.saisie.label && <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>{etat.opts.saisie.label}</label>}
                <input
                  ref={inputRef}
                  type="text"
                  value={valeur}
                  placeholder={etat.opts.saisie.placeholder}
                  onChange={(e) => setValeur(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") repondre(true); }}
                  style={{ width: "100%", padding: "9px 12px", fontSize: 14, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)" }}
                />
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button className={`btn ${etat.opts.danger ? "btn-danger" : "btn-accent"}`} onClick={() => repondre(true)}>
                {etat.opts.confirmer || "Confirmer"}
              </button>
              <button className="btn btn-ligne" onClick={() => repondre(false)}>{etat.opts.annuler || "Annuler"}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
