import { Fragment } from "react";
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
// Modules dépendant d'un autre module. Vide depuis le retrait de la
// réservation en ligne : la constante est conservée parce que le rendu s'en
// sert et qu'un futur module optionnel s'y raccrochera naturellement.
// Doit rester synchronisé avec AdminApp.tsx.
const DEPENDANCES: Record<string, string> = {};

// Ordre d'affichage des modules de premier niveau. Sans cela, useTable trie
// par libellé, et l'ordre change dès qu'on renomme un module.
const ORDRE = ["newsletter"];

function Ligne({ f, onBascule }: { f: FeatureFlag; onBascule: (f: FeatureFlag, v: boolean) => void }) {
  return (
    <div className="ligne-toggle">
      <div className="lib">
        <b>{f.label}</b>
        {f.description && <span>{f.description}</span>}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={f.enabled} onChange={(e) => onBascule(f, e.target.checked)} />
        <span className="piste" />
      </label>
    </div>
  );
}

export default function TabFeatures() {
  const { rows, loading, update } = useTable<FeatureFlag>("feature_flags", "label");
  // Modules de premier niveau, puis leurs dépendants. Tout module inconnu de
  // ORDRE et sans parent est ajouté à la fin plutôt que d'être perdu.
  const parents = [
    ...ORDRE.map((k) => rows.find((r) => r.key === k)).filter((r): r is FeatureFlag => !!r),
    ...rows.filter((r) => !DEPENDANCES[r.key] && !ORDRE.includes(r.key)),
  ];
  const enfantsDe = (k: string) => rows.filter((r) => DEPENDANCES[r.key] === k);

  /**
   * Bascule d'un module. Cas particulier de la newsletter : le bloc du site est
   * gouverné par site_content.newsletter_enabled, que le restaurateur règle
   * depuis « Site & accès ». Or ce réglage disparaît avec le module. Sans la
   * propagation ci-dessous, on obtiendrait un formulaire toujours visible sur
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
                « Site &amp; accès »). Un module désactivé masque l'onglet correspondant,
                au prochain chargement de l'interface. Les modules encadrés dépendent de
                celui qui les précède : couper le parent les coupe avec lui.
              </div>
            </div>
          </div>
          {/* Les dépendants sont imbriqués sous leur parent, et disparaissent
              avec lui : un interrupteur qu'on ne peut pas voir vaut mieux qu'un
              interrupteur qui n'a aucun effet. */}
          {parents.map((f) => {
            const enfants = enfantsDe(f.key);
            return (
              <Fragment key={f.id}>
                <Ligne f={f} onBascule={basculer} />
                {f.enabled && enfants.length > 0 && (
                  <div className="sous-reglages">
                    {enfants.map((c) => <Ligne key={c.id} f={c} onBascule={basculer} />)}
                  </div>
                )}
              </Fragment>
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
