import { useEffect, useState } from "react";
import { useTable } from "../../hooks/useTable";
import { supabase } from "../../lib/supabase";
import type { Lead } from "../../lib/types";
import Chargement from "./Chargement";

/**
 * Suivi de la newsletter, servi dans DEUX contextes :
 *
 * - `TabTableauNewsletter` (export par défaut) — le tableau de bord complet de
 *   l'offre « Essentiel + Newsletter », monté par AdminApp à la place de
 *   TabTableau quand le module Réservation est coupé. Composant séparé, et non
 *   conditions dans TabTableau : cela évite de lancer les requêtes sur
 *   reservations, restaurant_tables et opening_hours pour un client dont ces
 *   tables sont vides par construction.
 *
 * - `BlocsNewsletter` avec `mode="complement"` — les mêmes indicateurs ajoutés
 *   à la suite du tableau de bord du service, pour les offres qui ont la
 *   réservation ET la newsletter. Un seul calcul, deux présentations : les
 *   chiffres ne peuvent pas diverger entre les deux offres.
 *
 * Tout est calculé à partir de deux sources : `leads` et `newsletter_campaigns`.
 */

const MOIS = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"];

interface Campagne {
  id: string;
  subject: string;
  status: string;
  sent_at: string | null;
  scheduled_at: string | null;
  recipients_count: number | null;
  sent_count: number | null;
}

/** Clé AAAA-MM en heure locale — surtout pas toISOString(), qui renvoie l'UTC. */
function moisLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Libellé lisible d'une source d'inscription. `leads.source` vaut "newsletter",
 * "reservation", ou "newsletter:<utm>" quand le visiteur arrive par un lien tracé.
 */
function libelleSource(source: string): string {
  const s = (source || "").trim();
  if (!s) return "Origine inconnue";
  if (s === "newsletter") return "Formulaire du site";
  if (s === "reservation") return "Formulaire de réservation";
  if (s.startsWith("newsletter:")) return s.slice("newsletter:".length).replace(/[-_]/g, " ");
  return s;
}

export function BlocsNewsletter({ onNavigate, mode = "seul" }: {
  onNavigate?: (tab: string) => void;
  /** "seul" : le composant EST le tableau de bord. "complement" : il s'ajoute
   *  sous celui du service, et se coiffe alors d'un titre pour ne pas donner
   *  l'impression d'une rangée de cartes tombée du ciel au milieu de la page. */
  mode?: "seul" | "complement";
} = {}) {
  const { rows: leads, loading } = useTable<Lead>("leads", "created_at", true);
  const { rows: campagnes } = useTable<Campagne>("newsletter_campaigns", "created_at", true);
  // Clics et bounces par campagne (webhook Resend).
  const [clics, setClics] = useState<Record<string, number>>({});
  const [bounces, setBounces] = useState<Record<string, number>>({});
  // Date du tout premier événement enregistré : les campagnes envoyées AVANT
  // n'ont pas de données de délivrabilité — on affiche « — » plutôt qu'un
  // 100 % que rien n'étaye. (Une campagne récente sans le moindre événement
  // restera aussi à « — » : on préfère sous-afficher que surestimer.)
  const [premierEvt, setPremierEvt] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc("newsletter_event_counts").then(({ data }) => {
      const mc: Record<string, number> = {};
      const mb: Record<string, number> = {};
      (data || []).forEach((e: { campaign_id: string; clicks: number; bounces: number }) => {
        mc[e.campaign_id] = Number(e.clicks);
        mb[e.campaign_id] = Number(e.bounces);
      });
      setClics(mc); setBounces(mb);
    });
    supabase.from("newsletter_events").select("created_at").order("created_at").limit(1)
      .then(({ data }) => { if (data && data[0]) setPremierEvt(data[0].created_at); });
  }, []);

  const today = new Date();
  const inscrits = leads.filter((l) => l.consent === true);
  const desinscrits = leads.filter((l) => l.consent === false);

  // ── Croissance ────────────────────────────────────────────────────────────
  const moisCourant = moisLocal(today);
  const moisPrecedent = moisLocal(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const nouveauxCeMois = inscrits.filter((l) => moisLocal(new Date(l.created_at)) === moisCourant).length;
  const nouveauxMoisPrec = inscrits.filter((l) => moisLocal(new Date(l.created_at)) === moisPrecedent).length;
  const ecartMois = nouveauxCeMois - nouveauxMoisPrec;

  // 12 mois glissants, du plus ancien au plus récent
  const douzeMois = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
    return { cle: moisLocal(d), label: MOIS[d.getMonth()], annee: d.getFullYear() };
  });
  const parMois: Record<string, number> = {};
  douzeMois.forEach((m) => { parMois[m.cle] = 0; });
  inscrits.forEach((l) => {
    const k = moisLocal(new Date(l.created_at));
    if (k in parMois) parMois[k] += 1;
  });
  const maxMois = Math.max(1, ...douzeMois.map((m) => parMois[m.cle]));
  const totalDouzeMois = douzeMois.reduce((s, m) => s + parMois[m.cle], 0);

  // ── Désinscriptions sur 30 jours ──────────────────────────────────────────
  // Les désinscriptions antérieures à la colonne unsubscribed_at n'ont pas de
  // date : elles comptent dans le total, jamais dans la période.
  const d30 = new Date(today); d30.setDate(today.getDate() - 30);
  const desabo30 = desinscrits.filter((l) => l.unsubscribed_at && new Date(l.unsubscribed_at) >= d30).length;
  const desaboSansDate = desinscrits.filter((l) => !l.unsubscribed_at).length;
  // Base de calcul : ceux qui étaient inscrits il y a 30 jours.
  const baseDesabo = inscrits.length + desabo30;
  const tauxDesabo = baseDesabo ? Math.round((desabo30 / baseDesabo) * 1000) / 10 : 0;

  // ── Origine des inscriptions ──────────────────────────────────────────────
  const parSource = new Map<string, number>();
  inscrits.forEach((l) => {
    const k = libelleSource(l.source);
    parSource.set(k, (parSource.get(k) || 0) + 1);
  });
  const sources = [...parSource.entries()].sort((a, b) => b[1] - a[1]);
  const maxSource = Math.max(1, ...sources.map(([, n]) => n));

  // ── Campagnes ─────────────────────────────────────────────────────────────
  const envoyees = campagnes
    .filter((c) => c.status === "sent" && c.sent_at)
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
  const derniere = envoyees[0];
  const programmees = campagnes
    .filter((c) => c.status === "scheduled" && c.scheduled_at)
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  const prochaine = programmees[0];
  const brouillons = campagnes.filter((c) => c.status === "draft").length;
  const recentes = envoyees.slice(0, 5);

  const versNewsletter = () => onNavigate?.("newsletter");
  /** Carte cliquable : même comportement au clavier qu'à la souris. */
  const propsClic = (actif: boolean, titre: string) => actif ? {
    className: "stat stat-clic",
    onClick: versNewsletter,
    role: "button",
    tabIndex: 0,
    title: titre,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); versNewsletter(); }
    },
  } : { className: "stat" };

  // Cartes communes aux deux présentations.
  const cartes = (
    <>
          <div className="stat">
            <div className="lib">Inscrits</div>
            <div className="val">{inscrits.length}</div>
            <div className="det">contacts qui reçoivent vos campagnes</div>
          </div>
          <div className="stat">
            <div className="lib">Nouveaux ce mois-ci</div>
            <div className="val" style={{ color: nouveauxCeMois > 0 ? "var(--ok)" : "var(--ink)" }}>{nouveauxCeMois}</div>
            <div className="det">
              {nouveauxMoisPrec === 0 && nouveauxCeMois === 0
                ? "aucune inscription le mois dernier non plus"
                : ecartMois === 0
                ? "autant que le mois dernier"
                : `${ecartMois > 0 ? "+" : ""}${ecartMois} vs mois dernier`}
            </div>
          </div>
          <div {...propsClic(!!prochaine, "Voir les campagnes programmées")}>
            <div className="lib">Prochaine campagne</div>
            <div className="val" style={{ fontSize: 18 }}>{prochaine ? fmtDatetime(prochaine.scheduled_at) : "—"}</div>
            <div className="det">{prochaine ? "programmée →" : "aucune programmée"}</div>
          </div>
          <div {...propsClic(brouillons > 0, "Reprendre un brouillon")}>
            <div className="lib">Brouillons</div>
            <div className="val" style={{ color: brouillons > 0 ? "var(--attente)" : "var(--ink)" }}>{brouillons}</div>
            <div className="det">{brouillons > 0 ? "campagne(s) commencée(s) →" : "aucune campagne en cours"}</div>
          </div>
          <div className="stat">
            <div className="lib">Dernière campagne</div>
            <div className="val" style={{ fontSize: 18 }}>{derniere ? fmtDate(derniere.sent_at) : "—"}</div>
            <div className="det">
              {derniere
                ? `${derniere.sent_count ?? 0} destinataire${(derniere.sent_count ?? 0) > 1 ? "s" : ""}`
                : "aucun envoi pour l'instant"}
            </div>
          </div>
    </>
  );

  return (
    <>
        {/* Le chargement n'est signalé qu'en mode « seul » : en complément,
            le tableau de bord du service affiche déjà le sien. */}
        {mode === "seul" && loading && leads.length === 0 && <Chargement />}

        {mode === "seul" ? (
          <div className="cartes-stat cartes-stat-kpi">{cartes}</div>
        ) : (
          <div className="bloc">
            <div className="bloc-tete">
              <div>
                <h2>Newsletter</h2>
                <div className="desc">L'état de votre liste et de vos envois.</div>
              </div>
            </div>
            <div className="cartes-stat">{cartes}</div>
          </div>
        )}

        {/* Croissance de la liste — l'équivalent de « Cette semaine » côté service :
            la courbe qui dit si le site travaille pour vous. */}
        <div className="bloc">
          <div className="bloc-tete">
            <div>
              <h2>Croissance de la liste</h2>
              <div className="desc">Nouvelles inscriptions par mois, sur douze mois ({totalDouzeMois} au total sur la période).</div>
            </div>
          </div>
          {totalDouzeMois === 0 ? (
            <div className="vide">Aucune inscription sur les douze derniers mois.</div>
          ) : (
            <div className="crea-histo">
              {douzeMois.map((m) => {
                const n = parMois[m.cle];
                return (
                  <div key={m.cle} className="crea-col" title={`${m.label} ${m.annee} : ${n} inscription${n > 1 ? "s" : ""}`}>
                    <div className="crea-barre-zone">
                      {n > 0 && (
                        <div className="crea-barre" style={{ height: `${Math.round((n / maxMois) * 100)}%` }}>
                          <span className="crea-val">{n}</span>
                        </div>
                      )}
                    </div>
                    <div className="crea-h">{m.label}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Origine des inscriptions — remplace « Origine des réservations ». */}
        <div className="bloc">
          <div className="bloc-tete">
            <div>
              <h2>Origine des inscriptions</h2>
              <div className="desc">D'où viennent vos {inscrits.length} inscrit{inscrits.length > 1 ? "s" : ""}. Les liens tracés (QR code, réseaux sociaux) apparaissent séparément.</div>
            </div>
          </div>
          {sources.length === 0 ? (
            <div className="vide">Aucun inscrit pour le moment.</div>
          ) : (
            <div className="src-liste">
              {sources.map(([nom, n]) => (
                <div key={nom} className="src-ligne">
                  <div className="src-nom">{nom}</div>
                  <div className="canal-barre">
                    <div className="canal-seg canal-site" style={{ width: `${Math.round((n / maxSource) * 100)}%` }} />
                  </div>
                  <div className="src-nb">
                    <b>{n}</b>
                    <span className="sub-desc"> · {Math.round((n / inscrits.length) * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Santé de la liste */}
        <div className="bloc">
          <div className="bloc-tete">
            <div>
              <h2>Santé de la liste</h2>
              <div className="desc">Les désinscriptions sont normales ; c'est leur accélération qui alerte.</div>
            </div>
          </div>
          <div className="cartes-stat">
            <div className="stat">
              <div className="lib">Désinscriptions (30 j.)</div>
              <div className="val" style={{ color: tauxDesabo >= 2 ? "var(--annule)" : "var(--ink)" }}>{desabo30}</div>
              <div className="det">{tauxDesabo}% de la liste</div>
            </div>
            <div className="stat">
              <div className="lib">Désinscrits au total</div>
              <div className="val">{desinscrits.length}</div>
              <div className="det">
                {desaboSansDate > 0
                  ? `dont ${desaboSansDate} sans date connue`
                  : "depuis l'ouverture du site"}
              </div>
            </div>
            <div className="stat">
              <div className="lib">Campagnes envoyées</div>
              <div className="val">{envoyees.length}</div>
              <div className="det">depuis l'ouverture du site</div>
            </div>
          </div>
        </div>

        {/* Dernières campagnes */}
        <div className="bloc">
          <div className="bloc-tete">
            <div>
              <h2>Dernières campagnes</h2>
              <div className="desc">Les cinq derniers envois.</div>
            </div>
          </div>
          {recentes.length === 0 ? (
            <div className="vide">Aucune campagne envoyée pour le moment.</div>
          ) : (
            <table className="tbl-cartes">
                <thead>
                  <tr><th>Objet</th><th>Envoyée le</th><th>Destinataires</th><th>Délivrés</th><th>Clics</th></tr>
                </thead>
                <tbody>
                  {recentes.map((c) => {
                    const cibles = c.recipients_count ?? 0;
                    const envoyes = c.sent_count ?? 0;
                    const partiel = cibles > 0 && envoyes < cibles;
                    return (
                      <tr key={c.id}>
                        <td data-label="Objet">{c.subject}</td>
                        <td data-label="Envoyée le">{fmtDate(c.sent_at)}</td>
                        <td data-label="Destinataires">
                          {envoyes}
                          {partiel && (
                            <span className="sub-desc" style={{ color: "var(--annule)" }}> · {cibles - envoyes} en échec</span>
                          )}
                        </td>
                        <td data-label="Délivrés">
                          {(() => {
                            // Délivrés = acceptés par les serveurs destinataires
                            // (envoyés moins les échecs). Ne dit PAS boîte de
                            // réception vs spam — aucun signal n'existe pour ça.
                            // Couverte = la campagne a des événements (preuve
                            // directe que le webhook la suivait), OU elle est
                            // postérieure au premier événement enregistré. La
                            // seule date ne suffit pas : pour la toute première
                            // campagne post-webhook, le premier événement est un
                            // clic sur CETTE campagne — donc toujours après son
                            // envoi, et elle serait restée à « — » à tort.
                            const aDesEvenements = clics[c.id] != null || bounces[c.id] != null;
                            const couvert = aDesEvenements || (premierEvt && c.sent_at && c.sent_at >= premierEvt);
                            if (!couvert || envoyes === 0) return <span className="sub-desc">—</span>;
                            const del = Math.max(0, envoyes - (bounces[c.id] ?? 0));
                            return <>{del}<span className="sub-desc"> · {Math.round((del / envoyes) * 100)}%</span></>;
                          })()}
                        </td>
                        <td data-label="Clics">
                          {clics[c.id] != null
                            ? <>{clics[c.id]}{envoyes > 0 && <span className="sub-desc"> · {Math.round((clics[c.id] / envoyes) * 100)}%</span>}</>
                            : <span className="sub-desc">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
            </table>
          )}
        </div>
    </>
  );
}

/** Tableau de bord complet — offre « Essentiel + Newsletter ». */
export default function TabTableauNewsletter({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  return (
    <>
      <div className="topbar"><div>
        <h1>Tableau de bord</h1>
        <div className="sous">Votre liste de contacts et vos campagnes</div>
      </div></div>
      <div className="contenu">
        <BlocsNewsletter onNavigate={onNavigate} mode="seul" />
      </div>
    </>
  );
}
