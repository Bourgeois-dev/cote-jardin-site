import { useRef, useState, useEffect } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase } from "../../lib/supabase";
import type { RestaurantTable, DiningArea, ReservationSettings } from "../../lib/types";
import { useConfirm } from "./Confirm";
import TableSVG from "./TableSVG";

const PLAN_H = 460;

// Taille du bloc table (plateau + chaises autour). Le plateau est plus petit
// que le bloc pour laisser la place aux chaises sur le pourtour.
function taille(capacity: number) {
  if (capacity <= 2) return 96;
  if (capacity <= 4) return 120;
  if (capacity <= 6) return 148;
  return 170;
}

export default function TabPlan() {
  const confirm = useConfirm();
  const { rows, loading, reload, update, remove } = useTable<RestaurantTable>("restaurant_tables", "label");
  const areas = useTable<DiningArea>("dining_areas", "position");
  const reglages = useTable<ReservationSettings>("reservation_settings", "id");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const planRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; ox: number; oy: number; moved: boolean } | null>(null);
  const [localPos, setLocalPos] = useState<Record<string, { x: number; y: number }>>({});
  const [zoneModal, setZoneModal] = useState<null | "create" | "rename">(null);
  const [zoneNom, setZoneNom] = useState("");

  useEffect(() => {
    if (!zoneId && areas.rows.length > 0) setZoneId(areas.rows[0].id);
  }, [areas.rows, zoneId]);

  const tablesZone = rows.filter((t) => t.area_id === zoneId);
  const sel = tablesZone.find((t) => t.id === selId) || null;
  const couvTotal = tablesZone.reduce((s, t) => s + (t.capacity || 0), 0);
  const zoneActive = areas.rows.find((a) => a.id === zoneId);

  function posOf(t: RestaurantTable) { return localPos[t.id] || { x: Number(t.pos_x) || 20, y: Number(t.pos_y) || 20 }; }

  function onPointerDown(e: React.PointerEvent, t: RestaurantTable) {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    dragState.current = { id: t.id, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
    el.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent, t: RestaurantTable) {
    const d = dragState.current;
    if (!d || d.id !== t.id) return;
    d.moved = true;
    const plan = planRef.current;
    if (!plan) return;
    const pr = plan.getBoundingClientRect();
    const size = taille(t.capacity);
    let x = e.clientX - pr.left - d.ox;
    let y = e.clientY - pr.top - d.oy;
    x = Math.max(0, Math.min(x, plan.clientWidth - size));
    y = Math.max(0, Math.min(y, plan.clientHeight - size));
    setLocalPos((p) => ({ ...p, [t.id]: { x: Math.round(x), y: Math.round(y) } }));
  }
  async function onPointerUp(t: RestaurantTable) {
    const d = dragState.current;
    if (!d || d.id !== t.id) return;
    dragState.current = null;
    if (d.moved) {
      const p = localPos[t.id];
      if (p) await supabase.from("restaurant_tables").update({ pos_x: p.x, pos_y: p.y }).eq("id", t.id);
    } else {
      setSelId((cur) => (cur === t.id ? null : t.id));
    }
  }

  async function ajouter() {
    if (!zoneId) { setErr("Créez d'abord une zone."); return; }
    const nums = rows.map((t) => parseInt((t.label || "").replace(/\D/g, "")) || 0);
    const n = Math.max(0, ...nums) + 1;
    const offset = tablesZone.length;
    const { data, error } = await supabase.from("restaurant_tables").insert({
      label: `T${n}`, capacity: 2, online_limit: 2, shape: "square",
      pos_x: 20 + (offset * 30) % 320, pos_y: 20 + (offset * 26) % 360, is_active: true, area_id: zoneId,
    }).select().single();
    if (error || !data) { setErr("Échec de l'ajout de la table."); return; }
    await reload();
    setSelId(data.id); // la nouvelle table est sélectionnée : elle passe au premier plan et est prête à configurer
  }

  async function majSel(champ: string, val: any) {
    if (!sel) return;
    const v = (champ === "capacity" || champ === "online_limit") ? Math.max(1, parseInt(val) || 1) : val;
    await update(sel.id, { [champ]: v });
  }

  async function supprimerSel() {
    if (!sel) return;
    if (!(await confirm({ titre: "Supprimer cette table ?", message: `« ${sel.label} » sera retirée. Les réservations liées devront être réaffectées.`, confirmer: "Supprimer", danger: true }))) return;
    const ok = await remove(sel.id);
    if (ok) setSelId(null); else setErr("Échec de la suppression.");
  }

  function ouvrirCreation() { setZoneNom(""); setZoneModal("create"); }
  function ouvrirRenommage() { if (!zoneActive) return; setZoneNom(zoneActive.name); setZoneModal("rename"); }

  async function validerZone() {
    const nom = zoneNom.trim();
    if (!nom) return;
    if (zoneModal === "create") {
      const pos = areas.rows.length;
      const { data, error } = await supabase.from("dining_areas").insert({ name: nom, position: pos }).select().single();
      if (!error && data) { await areas.reload(); setZoneId(data.id); setSelId(null); }
    } else if (zoneModal === "rename" && zoneActive) {
      await supabase.from("dining_areas").update({ name: nom }).eq("id", zoneActive.id);
      await areas.reload();
    }
    setZoneModal(null);
  }

  async function supprimerZone() {
    if (!zoneActive) return;
    if (tablesZone.length > 0) { setErr("Videz la zone de ses tables avant de la supprimer."); return; }
    if (areas.rows.length <= 1) { setErr("Il faut conserver au moins une zone."); return; }
    if (!(await confirm({ titre: "Supprimer cette zone ?", message: `« ${zoneActive.name} » sera supprimée.`, confirmer: "Supprimer", danger: true }))) return;
    await supabase.from("dining_areas").delete().eq("id", zoneActive.id);
    await areas.reload();
    setZoneId(areas.rows.find((a) => a.id !== zoneActive.id)?.id || null);
  }

  // Libellé lisible de la durée d'occupation (réglage « Réservations & site »)
  const dureeMin = reglages.rows[0]?.table_duration || 90;
  const dureeLisible = dureeMin % 60 === 0
    ? `${dureeMin / 60} h`
    : `${Math.floor(dureeMin / 60)} h ${String(dureeMin % 60).padStart(2, "0")}`;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Plan de salle</h1>
          <div className="sous">Disposez vos tables — glissez pour déplacer, cliquez pour configurer</div>
        </div>
        {areas.rows.length > 0 && (
          <div className="tp-nb-zones">
            <span className="tp-nb-zones-chiffre">{areas.rows.length}</span>
            <span className="tp-nb-zones-label">zone{areas.rows.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      <div className="contenu">
        {/* Onglets de zones */}
        <div className="tp-zones-barre">
          {areas.rows.map((a) => {
            const tables = rows.filter((t) => t.area_id === a.id);
            const couv = tables.reduce((s, t) => s + (t.capacity || 0), 0);
            return (
              <button key={a.id}
                className={`tp-zone-pill${a.id === zoneId ? " active" : ""}`}
                onClick={() => { setZoneId(a.id); setSelId(null); }}>
                {a.name}
                <span className="tp-zone-pill-count">{tables.length} · {couv}</span>
              </button>
            );
          })}
          <button className="tp-zone-add" onClick={ouvrirCreation}>+ Zone</button>
        </div>

        {/* Zone principale : canvas + panneau */}
        <div className="tp-zone-bloc">
          <div className="tp-zone-main">
            {/* En-tête de la zone */}
            <div className="tp-zone-entete">
              <div className="tp-zone-entete-gauche">
                <h2 className="tp-zone-nom">{zoneActive?.name || "—"}</h2>
                <span className="tp-zone-stats">{tablesZone.length} tables · {couvTotal} couverts</span>
              </div>
              <div className="tp-zone-entete-actions">
                {zoneActive && <button className="btn btn-ligne btn-mini" onClick={ouvrirRenommage}>Renommer</button>}
                {zoneActive && <button className="btn btn-ligne btn-mini" onClick={supprimerZone}>Supprimer la zone</button>}
                <button className="btn btn-accent" onClick={ajouter}>+ Ajouter une table</button>
              </div>
            </div>

            {err && <div className="err-inline" style={{ marginBottom: 8 }}>{err}</div>}

            {/* Canvas */}
            <div className="tp-plan" ref={planRef} style={{ height: PLAN_H }}>
              {loading ? (
                <div className="plan-vide">Chargement…</div>
              ) : tablesZone.length === 0 ? (
                <div className="plan-vide">Aucune table dans « {zoneActive?.name} ».<br />Cliquez sur « + Ajouter une table ».</div>
              ) : tablesZone.map((t) => {
                const p = posOf(t);
                const size = taille(t.capacity);
                const isRonde = t.shape === "round";
                return (
                  <div key={t.id}
                    className={`tp-table${isRonde ? " ronde" : " carree"}${t.id === selId ? " selectionnee" : ""}`}
                    style={{ left: p.x, top: p.y, width: size, height: size, touchAction: "none" }}
                    onPointerDown={(e) => onPointerDown(e, t)}
                    onPointerMove={(e) => onPointerMove(e, t)}
                    onPointerUp={() => onPointerUp(t)}>
                    <TableSVG size={size} capacity={t.capacity} round={isRonde} />
                    <span className="tp-table-texte">
                      <span className="tp-table-label">{t.label}</span>
                      <span className="tp-table-cap">{t.capacity} pers.</span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Pied de zone */}
            <div className="tp-zone-pied">
              <span><b>{tablesZone.length}</b> table{tablesZone.length > 1 ? "s" : ""}</span>
              <span className="tp-pied-sep">·</span>
              <span><b>{couvTotal}</b> couverts dans cette zone</span>
              <span className="tp-pied-note">Chaque réservation occupe une table {dureeLisible} — les services s'enchaînent automatiquement. Modifiable dans « Réservations &amp; site ».</span>
            </div>
          </div>

          {/* Panneau table sélectionnée */}
          {sel && (
            <div className="tp-panneau">
              <div className="tp-panneau-tete">
                <span className="tp-panneau-titre">Table {sel.label}</span>
                <span className="tp-panneau-zone-badge">{zoneActive?.name?.toUpperCase()}</span>
              </div>

              <div className="tp-panneau-section">
                <div className="tp-panneau-label">CAPACITÉ</div>
                <div className="tp-capacite-ctrl">
                  <button className="tp-cap-btn" onClick={() => majSel("capacity", sel.capacity - 1)} disabled={sel.capacity <= 1}>−</button>
                  <div className="tp-cap-val">
                    <span className="tp-cap-n">{sel.capacity}</span>
                    <span className="tp-cap-unit">couverts</span>
                  </div>
                  <button className="tp-cap-btn" onClick={() => majSel("capacity", sel.capacity + 1)}>+</button>
                </div>
              </div>

              <div className="tp-panneau-section">
                <div className="tp-panneau-label">FORME</div>
                <div className="tp-forme-toggle">
                  <button className={`tp-forme-btn${sel.shape !== "round" ? " active" : ""}`} onClick={() => majSel("shape", "square")}>Carrée</button>
                  <button className={`tp-forme-btn${sel.shape === "round" ? " active" : ""}`} onClick={() => majSel("shape", "round")}>Ronde</button>
                </div>
              </div>

              {areas.rows.length > 1 && (
                <div className="tp-panneau-section">
                  <div className="tp-panneau-label">ZONE</div>
                  <select className="tp-zone-select" value={sel.area_id || ""} onChange={(e) => majSel("area_id", e.target.value)}>
                    {areas.rows.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              <button className="tp-supprimer-btn" onClick={supprimerSel}>Supprimer la table</button>
            </div>
          )}
        </div>

        <div className="hint" style={{ marginTop: 12 }}>
          💡 Créez plusieurs zones (Salle, Terrasse, Étage…) pour organiser votre salle. La capacité de chaque table détermine les regroupements possibles.
        </div>
      </div>

      {zoneModal && (
        <div className="modal-backdrop" onClick={() => setZoneModal(null)}>
          <div className="modal-in" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 19, marginBottom: 6 }}>{zoneModal === "create" ? "Nouvelle zone" : "Renommer la zone"}</h2>
            <div className="desc" style={{ marginBottom: 16 }}>Ex. Salle, Terrasse, Étage, Jardin…</div>
            <div className="champ"><label>Nom de la zone</label>
              <input autoFocus value={zoneNom} onChange={(e) => setZoneNom(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") validerZone(); if (e.key === "Escape") setZoneModal(null); }}
                placeholder="Terrasse" /></div>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button className="btn btn-accent" onClick={validerZone} disabled={!zoneNom.trim()}>{zoneModal === "create" ? "Créer la zone" : "Renommer"}</button>
              <button className="btn btn-ligne" onClick={() => setZoneModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
