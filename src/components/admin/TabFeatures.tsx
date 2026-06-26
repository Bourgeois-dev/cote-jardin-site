import { useTable } from "../../hooks/useTable";

interface FeatureFlag {
  id: string; key: string; label: string;
  enabled: boolean; description: string;
}

/**
 * TabFeatures — Activation / désactivation des fonctionnalités
 * Visible UNIQUEMENT pour les comptes @latable-digitale.fr
 * Les changements sont pris en compte au prochain chargement de l'admin.
 */
export default function TabFeatures() {
  const { rows, update } = useTable<FeatureFlag>("feature_flags", "label");

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Fonctionnalités</h1>
          <div className="sous">Activation des modules par client — éditeur La Table Digitale uniquement</div>
        </div>
      </div>
      <div className="contenu">
        <div className="bloc">
          <div className="bloc-tete">
            <div>
              <h2>Modules actifs</h2>
              <div className="desc">
                Les modifications sont prises en compte au prochain chargement de l'interface
                par le restaurateur. Un module désactivé masque l'onglet correspondant.
              </div>
            </div>
          </div>
          {rows.map((f) => (
            <div className="ligne-toggle" key={f.id}>
              <div className="lib">
                <b>{f.label}</b>
                {f.description && <span>{f.description}</span>}
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={(e) => update(f.id, { enabled: e.target.checked })}
                />
                <span className="piste" />
              </label>
            </div>
          ))}
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
