import { useTable } from "../../hooks/useTable";
import { supabase } from "../../lib/supabase";
import Chargement from "./Chargement";

interface FeatureFlag {
  id: string; key: string; label: string;
  enabled: boolean; description: string;
}

/**
 * TabFeatures — Activation / désactivation des fonctionnalités
 * Visible UNIQUEMENT pour les comptes @latable-digitale.fr
 * Les changements sont pris en compte au prochain chargement de l'admin.
 */
// Modules alimentés par les réservations : sans le module Réservation, leurs
// tables restent vides. Doit rester synchronisé avec DEPENDANCES (AdminApp.tsx).
const DEPENDANCES: Record<string, string> = {
  liste_attente: "reservation",
  crm: "reservation",
};

export default function TabFeatures() {
  const { rows, loading, update } = useTable<FeatureFlag>("feature_flags", "label");
  const actifs: Record<string, boolean> = {};
  rows.forEach((f) => { actifs[f.key] = f.enabled; });

  /**
   * Bascule d'un module. Cas particulier de la newsletter : le bloc du site est
   * gouverné par site_content.newsletter_enabled, que le restaurateur règle
   * depuis « Réservations & site ». Or ce réglage disparaît avec le module. Sans
   * la propagation ci-dessous, on obtiendrait un formulaire toujours visible sur
   * le site, plus aucun onglet pour en exploiter les inscriptions, et personne
   * capable de l'éteindre. Le module est donc l'interrupteur maître.
   */
  async function basculer(f: FeatureFlag, val: boolean) {
    await update(f.id, { enabled: val });
    if (f.key === "newsletter") {
      await supabase.from("site_content")
        .upsert({ section_key: "newsletter_enabled", content: { enabled: val } }, { onConflict: "section_key" });
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Fonctionnalités</h1>
          <div className="sous">Activation des modules par client — éditeur La Table Digitale uniquement</div>
        </div>
      </div>
      <div className="contenu">
        {loading && rows.length === 0 && <Chargement />}
        <div className="bloc">
          <div className="bloc-tete">
            <div>
              <h2>Modules actifs</h2>
              <div className="desc">
                Ces réglages contrôlent quels <b>onglets sont visibles dans l'administration</b> du
                restaurateur — ils n'affectent pas l'affichage du site public (géré depuis
                « Réservations &amp; site »). Un module désactivé masque l'onglet correspondant,
                au prochain chargement de l'interface.
              </div>
            </div>
          </div>
          {rows.map((f) => {
            // Module dont le parent est coupé : l'onglet est masqué côté admin
            // quoi qu'affiche l'interrupteur. On le dit plutôt que de laisser
            // croire que le réglage est sans effet.
            const parent = DEPENDANCES[f.key];
            const neutralise = parent ? actifs[parent] === false : false;
            return (
              <div className="ligne-toggle" key={f.id}>
                <div className="lib">
                  <b>{f.label}</b>
                  {f.description && <span>{f.description}</span>}
                  {neutralise && (
                    <span style={{ color: "var(--admin-accent)" }}>
                      Sans effet : dépend du module « Réservation en ligne », actuellement désactivé.
                      L'onglet reste masqué.
                    </span>
                  )}
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) => basculer(f, e.target.checked)}
                  />
                  <span className="piste" />
                </label>
              </div>
            );
          })}
        </div>
        <div className="bloc" style={{ background: "rgba(122,31,36,.04)", border: "1px solid rgba(122,31,36,.15)" }}>
          <p style={{ fontSize: 13, color: "var(--admin-accent)", fontWeight: 600, marginBottom: 6 }}>
            ⚠️ Accès restreint
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            Cet onglet n'est visible que pour les comptes <code>@latable-digitale.fr</code>.
            Les restaurateurs ne peuvent pas modifier ces paramètres.
          </p>
        </div>
      </div>
    </>
  );
}
