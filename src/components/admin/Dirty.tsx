import { createContext, useContext, useEffect, useRef, ReactNode } from "react";

/**
 * Suivi des modifications non enregistrées.
 * - Un onglet signale son état : const dirty = useDirty(); dirty.set(true/false);
 * - AdminApp consulte dirty.get() avant de changer d'onglet et demande confirmation.
 * - Le provider pose aussi un garde beforeunload (fermeture d'onglet navigateur).
 * Stocké dans une ref (pas un state) : consulter l'état ne re-rend rien.
 */
type DirtyApi = { set: (v: boolean) => void; get: () => boolean };

const DirtyContext = createContext<DirtyApi>({ set: () => {}, get: () => false });

export function useDirty() { return useContext(DirtyContext); }

export function DirtyProvider({ children }: { children: ReactNode }) {
  const ref = useRef(false);

  useEffect(() => {
    function garde(e: BeforeUnloadEvent) {
      if (ref.current) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", garde);
    return () => window.removeEventListener("beforeunload", garde);
  }, []);

  const api: DirtyApi = {
    set: (v) => { ref.current = v; },
    get: () => ref.current,
  };

  return <DirtyContext.Provider value={api}>{children}</DirtyContext.Provider>;
}
