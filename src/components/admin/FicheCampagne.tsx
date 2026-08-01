import { useEffect } from "react";

/**
 * Fiche statistiques d'une campagne envoyée — modale partagée entre l'onglet
 * Newsletter (bouton « Statistiques » sur chaque campagne envoyée) et le
 * tableau de bord newsletter (clic sur une ligne des dernières campagnes).
 *
 * Un seul endroit qui calcule et présente les KPI : objet, date d'envoi,
 * destinataires, délivrabilité, clics, bounces, désabonnements — en nombre ET
 * en pourcentage. Base commune de tous les pourcentages : les emails ENVOYÉS
 * (sent_count). C'est la base la plus honnête dont on dispose, et la même que
 * celle des tableaux — les chiffres ne peuvent pas diverger d'un écran à
 * l'autre.
 *
 * Couverture des données : les campagnes envoyées AVANT la mise en place du
 * webhook Resend n'ont pas d'événements — leurs KPI d'engagement s'affichent
 * « — » plutôt qu'un zéro que rien n'étaye. Même logique que le tableau de
 * bord : une campagne est couverte si elle a au moins un événement, OU si elle
 * est postérieure au premier événement enregistré.
 */

export interface EventStats {
  clicks: number;
  bounces: number;
  complaints: number;
  unsubscribes: number;
}

export interface CampagneFiche {
  id: string;
  subject: string;
  sent_at: string | null;
  recipients_count: number | null;
  sent_count: number | null;
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Pourcentage à une décimale, sans traîner de « .0 » inutile. */
function pct(n: number, base: number): string {
  if (base <= 0) return "0%";
  const v = Math.round((n / base) * 1000) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v}%`;
}

export default function FicheCampagne({ campagne, stats, premierEvt, onClose }: {
  campagne: CampagneFiche;
  /** Compteurs d'événements (RPC newsletter_event_counts) — undefined si la campagne n'a aucun événement. */
  stats?: EventStats;
  /** Date du tout premier événement enregistré, pour la logique de couverture. */
  premierEvt: string | null;
  onClose: () => void;
}) {
  // Échap ferme la fiche, comme toutes les modales de l'admin.
  useEffect(() => {
    const onEchap = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEchap);
    return () => document.removeEventListener("keydown", onEchap);
  }, [onClose]);

  const cibles = campagne.recipients_count ?? 0;
  const envoyes = campagne.sent_count ?? 0;
  const echecs = Math.max(0, cibles - envoyes);

  const couvert = !!stats || (!!premierEvt && !!campagne.sent_at && campagne.sent_at >= premierEvt);
  const bounces = stats?.bounces ?? 0;
  const clics = stats?.clicks ?? 0;
  const desabos = stats?.unsubscribes ?? 0;
  const plaintes = stats?.complaints ?? 0;
  const delivres = Math.max(0, envoyes - bounces);

  /** Une carte KPI : valeur, pourcentage, et « — » quand la donnée n'existe pas. */
  const carte = (lib: string, n: number, det: string, opts?: { absent?: boolean; couleur?: string }) => (
    <div className="stat">
      <div className="lib">{lib}</div>
      {opts?.absent
        ? <div className="val" style={{ color: "var(--ink-soft)" }}>—</div>
        : <div className="val" style={opts?.couleur ? { color: opts.couleur } : undefined}>{n}</div>}
      <div className="det">{opts?.absent ? "pas de donnée pour cette campagne" : det}</div>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-in" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 2 }}>{campagne.subject}</h2>
        <div className="desc" style={{ marginBottom: 18 }}>
          Envoyée le {fmtDatetime(campagne.sent_at)}
        </div>

        <div className="cartes-stat" style={{ gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 12 }}>
          {carte("Destinataires", envoyes,
            echecs > 0 ? `sur ${cibles} ciblés · ${echecs} en échec d'envoi` : "emails envoyés",
            { couleur: echecs > 0 ? "var(--attente)" : undefined })}
          {carte("Délivrabilité", delivres, `${pct(delivres, envoyes)} des envoyés acceptés`,
            { absent: !couvert || envoyes === 0 })}
          {carte("Clics", clics, `${pct(clics, envoyes)} · personnes ayant cliqué au moins un lien`,
            { absent: !couvert })}
          {carte("Bounces", bounces, `${pct(bounces, envoyes)} · adresses en erreur, exclues des prochains envois`,
            { absent: !couvert, couleur: bounces > 0 ? "var(--annule)" : undefined })}
          {carte("Désabonnements", desabos, `${pct(desabos, envoyes)} · depuis le lien de cette campagne`,
            { absent: !couvert, couleur: desabos > 0 ? "var(--attente)" : undefined })}
          {carte("Plaintes spam", plaintes, `${pct(plaintes, envoyes)} · signalements « indésirable »`,
            { absent: !couvert, couleur: plaintes > 0 ? "var(--annule)" : undefined })}
        </div>

        <p className="desc" style={{ fontSize: 12, marginBottom: 18 }}>
          Pourcentages calculés sur les {envoyes} email{envoyes > 1 ? "s" : ""} envoyé{envoyes > 1 ? "s" : ""}.
          {" "}La délivrabilité mesure l'acceptation par les serveurs destinataires — elle ne distingue pas
          boîte de réception et courrier indésirable.
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-ligne" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
