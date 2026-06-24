import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// Hook générique de CRUD sur une table, avec rechargement.
// realtime=true : recharge automatiquement quand la table change côté serveur.
export function useTable<T = any>(table: string, orderBy = "position", realtime = false) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  // Identifiant unique de canal, stable pour la durée de vie du composant
  const canalId = useRef(`rt-${table}-${Math.random().toString(36).slice(2)}`);

  const reload = useCallback(async () => {
    setLoading(true);
    let { data, error } = await supabase.from(table).select("*").order(orderBy, { ascending: true });
    // Repli : si la colonne de tri n'existe pas, on refait la requête sans tri
    if (error) {
      const res = await supabase.from(table).select("*");
      if (res.error) console.error(`load ${table}`, res.error);
      data = res.data;
    }
    setRows((data as T[]) || []);
    setLoading(false);
  }, [table, orderBy]);

  useEffect(() => { reload(); }, [reload]);

  // Abonnement temps réel : recharge sur tout changement (insert/update/delete)
  useEffect(() => {
    if (!realtime) return;
    const canal = supabase.channel(canalId.current);
    canal
      .on("postgres_changes", { event: "*", schema: "public", table }, () => { reload(); })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [table, realtime, reload]);

  const insert = async (vals: any) => { const { error } = await supabase.from(table).insert(vals); if (error) { console.error(error); return false; } await reload(); return true; };
  const update = async (id: string, vals: any) => { const { error } = await supabase.from(table).update(vals).eq("id", id); if (error) { console.error(error); return false; } await reload(); return true; };
  const remove = async (id: string) => { const { error } = await supabase.from(table).delete().eq("id", id); if (error) { console.error(error); return false; } await reload(); return true; };

  return { rows, loading, reload, insert, update, remove };
}
