import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ConfirmOptions = { titre: string; message?: string; confirmer?: string; danger?: boolean };
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm() { return useContext(ConfirmContext); }

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => setEtat({ opts, resolve }));
  }, []);

  function repondre(v: boolean) {
    etat?.resolve(v);
    setEtat(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {etat && (
        <div className="modal-backdrop" onClick={() => repondre(false)}>
          <div className="modal-in" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 19, marginBottom: 8 }}>{etat.opts.titre}</h2>
            {etat.opts.message && <div className="desc" style={{ marginBottom: 18 }}>{etat.opts.message}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className={`btn ${etat.opts.danger ? "btn-danger" : "btn-accent"}`} onClick={() => repondre(true)}>
                {etat.opts.confirmer || "Confirmer"}
              </button>
              <button className="btn btn-ligne" onClick={() => repondre(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
