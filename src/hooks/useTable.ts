import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// Hook générique de CRUD sur une table, avec rechargement.
// realtime=true : recharge automatiquement quand la table change côté serveur.
// filter : objet { column, op, value } pour filtrer les résultats (ex. date >= ...)
export interface TableFilter { column: string; op: "gte" | "lte" | "eq" | "neq" | "gt" | "lt"; value: string | number | boolean }

export function useTable<T = any>(table: string, orderBy = "position", realtime = false, filter?: TableFilter) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const canalId = useRef(`rt-${table}-${Math.random().toString(36).slice(2)}`);

  const reload = useCallback(async () => {
    setLoading(true);
    let q = supabase.from(table).select("*");
    if (filter) q = (q as any)[filter.op](filter.column, filter.value);
    // `data` est réassigné plus bas en cas de repli, `error` non : on les
    // sépare pour que chacun ait la bonne déclaration (let / const).
    const premier = await q.order(orderBy, { ascending: true });
    let data = premier.data;
    if (premier.error) {
      let q2 = supabase.from(table).select("*");
      if (filter) q2 = (q2 as any)[filter.op](filter.column, filter.value);
      const res = await q2;
      if (res.error) console.error(`load ${table}`, res.error);
      data = res.data;
    }
    setRows((data as T[]) || []);
    setLoading(false);
  }, [table, orderBy, filter?.column, filter?.op, filter?.value]); // eslint-disable-line

  useEffect(() => { reload(); }, [reload]);

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
