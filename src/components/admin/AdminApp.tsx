import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import TabTableau from "./TabTableau";
import TabReservations from "./TabReservations";
import TabClients from "./TabClients";
import TabCarte from "./TabCarte";
import TabArdoise from "./TabArdoise";
import TabPromo from "./TabPromo";
import TabPlan from "./TabPlan";
import TabHoraires from "./TabHoraires";
import TabGalerie from "./TabGalerie";
import TabPartenaires from "./TabPartenaires";
import TabContacts from "./TabContacts";
import TabSocial from "./TabSocial";
import TabAvis from "./TabAvis";
import TabParametres from "./TabParametres";
import TabEmporter from "./TabEmporter";
import TabListeAttente from "./TabListeAttente";
import TabFeatures from "./TabFeatures";
import { ConfirmProvider } from "./Confirm";

const TABS: { key: string; label: string; comp: React.FC; groupe?: string }[] = [
  // — Service —
  { key: "tableau",      label: "Tableau de bord",   comp: TabTableau,      groupe: "Service" },
  { key: "reservations", label: "Réservations",       comp: TabReservations },
  { key: "liste-attente", label: "Liste d'attente",    comp: TabListeAttente },
  { key: "plan",         label: "Plan de salle",      comp: TabPlan },
  { key: "horaires",     label: "Horaires",           comp: TabHoraires },
  { key: "clients",      label: "Clients",            comp: TabClients },
  // — Vitrine —
  { key: "carte",        label: "La carte",           comp: TabCarte,        groupe: "Vitrine" },
  { key: "ardoise",      label: "Ardoise du jour",    comp: TabArdoise },
  { key: "galerie",      label: "Galerie",            comp: TabGalerie },
  { key: "avis",         label: "Avis clients",       comp: TabAvis },
  { key: "partenaires",  label: "Partenaires",        comp: TabPartenaires },
  { key: "social",       label: "Réseaux sociaux",    comp: TabSocial },
  { key: "promo",        label: "Bannière promo",     comp: TabPromo },
  { key: "emporter",     label: "À emporter",         comp: TabEmporter },
  // — Paramètres —
  { key: "contacts",     label: "Contacts",           comp: TabContacts,     groupe: "Paramètres" },
  { key: "parametres",   label: "Réservations & site",comp: TabParametres },
  { key: "features",     label: "Fonctionnalités",    comp: TabFeatures },
];

export default function AdminApp({ session }: { session: Session }) {
  const [active, setActive] = useState("tableau");
  const [nbAttente, setNbAttente] = useState(0);
  const [forceDate, setForceDate] = useState<string | undefined>();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  // isEditor calculé directement depuis la session (synchrone, fiable)
  const isEditor = true; // TEMP : visible pour debug — à restreindre après confirmation
  // Onglets masqués selon feature flags
  const FEATURE_MAP: Record<string, string> = {
    "reservations": "reservation", "liste-attente": "liste_attente",
    "clients": "crm", "partenaires": "partenaires",
    "emporter": "emporter", "promo": "banniere",
    "avis": "avis", "newsletter": "newsletter",
  };
  const TABS_VISIBLES = TABS.filter((t) => {
    const fk = FEATURE_MAP[t.key];
    if (!fk) return true; // pas de flag associé = toujours visible
    if (Object.keys(features).length === 0) return true; // flags pas encore chargés
    return features[fk] !== false;
  });
  const Current = TABS_VISIBLES.find((t) => t.key === active)?.comp || TabTableau;
  const siteUrl = import.meta.env.VITE_SITE_URL || "/";

  // Compteur de réservations en attente, mis à jour en temps réel
  // Charger les feature flags et détecter si éditeur LTD
  useEffect(() => {
    supabase.from("feature_flags").select("key,enabled")
      .then(({ data }) => {
        if (data) {
          const map: Record<string, boolean> = {};
          data.forEach((f: any) => { map[f.key] = f.enabled; });
          setFeatures(map);
        }
      });
  }, []);

  useEffect(() => {
    async function compter() {
      const { count } = await supabase
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .eq("status", "attente");
      setNbAttente(count || 0);
    }
    compter();
    const canal = supabase.channel("rt-attente-nav");
    canal
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => compter())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  return (
    <ConfirmProvider>
    <div className="app">
      <aside className="side">
        <div className="logo">{import.meta.env.VITE_RESTO_NAME || "Restaurant"}<small>Administration</small></div>
        <div className="side-marque">
          <svg className="side-marque-logo" viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="La Table Digitale">
            <rect x="4" y="33" width="8" height="22" rx="2.5" fill="#fff" />
            <rect x="15" y="11" width="8" height="44" rx="2.5" fill="#fff" opacity="0.65" />
            <rect x="26" y="20" width="8" height="35" rx="2.5" fill="#fff" />
            <rect x="37" y="41" width="8" height="14" rx="2.5" fill="#fff" />
            <rect x="4" y="55" width="41" height="4" rx="2" fill="#fff" />
            <rect x="20" y="59" width="9" height="30" rx="4.5" fill="#fff" />
            <text x="68" y="62" fontFamily="'Fraunces', Georgia, serif" fontWeight="700" fontSize="38" letterSpacing="-1" fill="#fff">La Table</text>
            <line x1="68" y1="74" x2="124" y2="74" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="127" cy="74" r="3" fill="#fff" opacity="0.65" />
            <line x1="130" y1="74" x2="268" y2="74" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
            <text x="68" y="90" fontFamily="'Space Mono', 'Courier New', monospace" fontSize="13" letterSpacing="4" fill="#fff">DIGITALE</text>
          </svg>
        </div>
        <nav>
          {TABS_VISIBLES.filter((t) => t.key !== "features" || isEditor).map((t) => (
            <div key={t.key}>
              {t.groupe && <div className="nav-groupe">{t.groupe}</div>}
              <button
                className={active === t.key ? "actif" : ""}
                onClick={() => setActive(t.key)}
                style={t.key === "features" ? { borderTop: "1px solid rgba(255,255,255,.1)", marginTop: 4, opacity: .7, fontSize: 12 } : undefined}
              >
                {t.key === "features" ? "⚙ Fonctionnalités" : t.label}
                {t.key === "reservations" && nbAttente > 0 && <span className="nav-pastille">{nbAttente}</span>}
              </button>
            </div>
          ))}
        </nav>
        <a className="voir-site" href={siteUrl} target="_blank" rel="noopener">↗ Voir le site</a>
        <div className="compte">
          <b>{session.user.email}</b>
          <button className="deco" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        </div>
      </aside>
      <main className="main">
        {active === "tableau"
          ? <TabTableau onNavigate={(tab, date) => { setActive(tab); setForceDate(date); }} />
          : active === "reservations"
          ? <TabReservations initialDate={forceDate} />
          : active === "features" && !isEditor
          ? <TabTableau onNavigate={(tab, date) => { setActive(tab); setForceDate(date); }} />
          : <Current />}
      </main>
    </div>
    </ConfirmProvider>
  );
}
