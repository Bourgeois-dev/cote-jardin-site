import { useState, useEffect, useCallback } from "react";
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
import TabNewsletter from "./TabNewsletter";
import { ConfirmProvider, useConfirm } from "./Confirm";
import { ToastProvider } from "./Toast";
import { DirtyProvider, useDirty } from "./Dirty";

const TABS: { key: string; label: string; comp: React.FC; groupe?: string }[] = [
  // — Service —
  { key: "tableau",      label: "Tableau de bord",   comp: TabTableau,      groupe: "Service" },
  { key: "reservations", label: "Réservations",       comp: TabReservations },
  { key: "liste-attente", label: "Liste d'attente",    comp: TabListeAttente },
  { key: "plan",         label: "Plan de salle",      comp: TabPlan },
  { key: "horaires",     label: "Horaires",           comp: TabHoraires },
  { key: "clients",      label: "Clients",            comp: TabClients },
  { key: "newsletter",   label: "Newsletter",          comp: TabNewsletter },
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

/** Onglet initial : lu depuis le hash de l'URL (survit au refresh, lien partageable). */
function ongletInitial(): string {
  const h = window.location.hash.replace(/^#/, "");
  return TABS.some((t) => t.key === h) ? h : "tableau";
}

/**
 * AdminApp = couche providers. La logique vit dans AdminShell,
 * qui peut ainsi consommer useConfirm / useDirty.
 */
export default function AdminApp({ session }: { session: Session }) {
  return (
    <ConfirmProvider>
      <ToastProvider>
        <DirtyProvider>
          <AdminShell session={session} />
        </DirtyProvider>
      </ToastProvider>
    </ConfirmProvider>
  );
}

function AdminShell({ session }: { session: Session }) {
  const [active, setActive] = useState(ongletInitial);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nbAttente, setNbAttente] = useState(0);
  const [nbListeAttente, setNbListeAttente] = useState(0);
  const [nbNewsProg, setNbNewsProg] = useState(0);
  const [forceDate, setForceDate] = useState<string | undefined>();
  const [forceService, setForceService] = useState<"midi" | "soir" | undefined>();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const confirm = useConfirm();
  const dirty = useDirty();
  // isEditor calculé directement depuis la session (synchrone, fiable)
  const isEditor = (session.user.email || "").toLowerCase().includes("latable-digitale");
  // Onglets masqués selon feature flags
  const FEATURE_MAP: Record<string, string> = {
    "reservations": "reservation",
    "liste-attente": "liste_attente",
    "clients": "crm",
    "newsletter": "newsletter",
  };
  const TABS_VISIBLES = TABS.filter((t) => {
    const fk = FEATURE_MAP[t.key];
    if (!fk) return true; // pas de flag associé = toujours visible
    if (Object.keys(features).length === 0) return true; // flags pas encore chargés
    return features[fk] !== false;
  });
  const Current = TABS_VISIBLES.find((t) => t.key === active)?.comp || TabTableau;
  const siteUrl = import.meta.env.VITE_SITE_URL || "/";

  /** Navigation centralisée : garde "modifications non enregistrées" + sync du hash. */
  const naviguer = useCallback(async (key: string) => {
    if (key === active) return;
    if (dirty.get()) {
      const ok = await confirm({
        titre: "Modifications non enregistrées",
        message: "Si vous changez d'onglet maintenant, vos modifications seront perdues.",
        confirmer: "Quitter sans enregistrer",
        annuler: "Rester ici",
        danger: true,
      });
      if (!ok) {
        // Rétablir le hash si l'utilisateur a utilisé Précédent/Suivant
        if (window.location.hash.replace(/^#/, "") !== active) window.location.hash = active;
        return;
      }
      dirty.set(false);
    }
    setActive(key);
    if (window.location.hash.replace(/^#/, "") !== key) window.location.hash = key;
  }, [active, confirm, dirty]);

  // Tiroir mobile : Échap ferme, et on fige le scroll de fond quand il est ouvert
  useEffect(() => {
    if (!menuOpen) return;
    function surTouche(e: KeyboardEvent) { if (e.key === "Escape") setMenuOpen(false); }
    window.addEventListener("keydown", surTouche);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", surTouche); document.body.style.overflow = ""; };
  }, [menuOpen]);

  // Boutons Précédent/Suivant du navigateur
  useEffect(() => {
    function surHash() {
      const h = window.location.hash.replace(/^#/, "");
      if (TABS.some((t) => t.key === h) && h !== active) naviguer(h);
    }
    window.addEventListener("hashchange", surHash);
    return () => window.removeEventListener("hashchange", surHash);
  }, [active, naviguer]);

  // Poser le hash initial si absent (arrivée sur /gestion-a7x9k2 sans hash)
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#" + active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charger les feature flags
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

  // Compteurs de la sidebar (résa en attente, liste d'attente, newsletters programmées),
  // mis à jour en temps réel
  useEffect(() => {
    async function compter() {
      const [resa, liste, news] = await Promise.all([
        supabase.from("reservations").select("*", { count: "exact", head: true }).eq("status", "attente"),
        supabase.from("waitlist").select("*", { count: "exact", head: true })
          .eq("notified", false).gte("date", new Date().toISOString().slice(0, 10)),
        supabase.from("newsletter_campaigns").select("*", { count: "exact", head: true }).eq("status", "scheduled"),
      ]);
      setNbAttente(resa.count || 0);
      setNbListeAttente(liste.count || 0);
      setNbNewsProg(news.count || 0);
    }
    compter();
    const canal = supabase.channel("rt-attente-nav");
    canal
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => compter())
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist" }, () => compter())
      .on("postgres_changes", { event: "*", schema: "public", table: "newsletter_campaigns" }, () => compter())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  function pastille(key: string) {
    if (key === "reservations" && nbAttente > 0) return <span className="nav-pastille">{nbAttente}</span>;
    if (key === "liste-attente" && nbListeAttente > 0) return <span className="nav-pastille">{nbListeAttente}</span>;
    if (key === "newsletter" && nbNewsProg > 0) return <span className="nav-pastille sobre">{nbNewsProg}</span>;
    return null;
  }

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">{import.meta.env.VITE_RESTO_NAME || "Restaurant"}<small>Administration</small></div>
        <button className="mob-burger" aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          {menuOpen ? "✕" : "☰"}
        </button>
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
                onClick={() => naviguer(t.key)}
                style={t.key === "features" ? { borderTop: "1px solid rgba(255,255,255,.1)", marginTop: 4, opacity: .7, fontSize: 12 } : undefined}
              >
                {t.key === "features" ? "⚙ Fonctionnalités" : t.label}
                {pastille(t.key)}
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
          ? <TabTableau onNavigate={(tab, date, service) => { setForceDate(date); setForceService(service); naviguer(tab); }} />
          : active === "reservations"
          ? <TabReservations initialDate={forceDate} initialService={forceService} />
          : active === "features" && !isEditor
          ? <TabTableau onNavigate={(tab, date, service) => { setForceDate(date); setForceService(service); naviguer(tab); }} />
          : <Current />}
      </main>
      {/* Tiroir de navigation mobile (menu burger) */}
      {menuOpen && <div className="mob-drawer-fond" onClick={() => setMenuOpen(false)} />}
      <div className={`mob-drawer${menuOpen ? " ouvert" : ""}`} role="dialog" aria-modal="true" aria-label="Menu de navigation">
        <nav>
          {TABS_VISIBLES.filter((t) => t.key !== "features" || isEditor).map((t) => (
            <div key={t.key}>
              {t.groupe && <div className="nav-groupe">{t.groupe}</div>}
              <button
                className={active === t.key ? "actif" : ""}
                onClick={() => { setMenuOpen(false); naviguer(t.key); }}
              >
                {t.key === "features" ? "⚙ Fonctionnalités" : t.label}
                {pastille(t.key)}
              </button>
            </div>
          ))}
        </nav>
        <a className="voir-site" href={siteUrl} target="_blank" rel="noopener">↗ Voir le site</a>
        <div className="compte">
          <b>{session.user.email}</b>
          <button className="deco" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        </div>
      </div>

      {/* Barre d'accès rapide mobile : les 3 onglets du service en cours */}
      <nav className="quickbar" aria-label="Accès rapide">
        <button className={active === "tableau" ? "qb-btn actif" : "qb-btn"} onClick={() => naviguer("tableau")}>
          <span className="qb-ico" aria-hidden="true">◧</span>Tableau
        </button>
        <button className={active === "reservations" ? "qb-btn actif" : "qb-btn"} onClick={() => naviguer("reservations")}>
          <span className="qb-ico" aria-hidden="true">☰</span>Résa
          {nbAttente > 0 && <span className="qb-pastille">{nbAttente}</span>}
        </button>
        <button className={active === "plan" ? "qb-btn actif" : "qb-btn"} onClick={() => naviguer("plan")}>
          <span className="qb-ico" aria-hidden="true">⌗</span>Plan
        </button>
      </nav>
    </div>
  );
}
