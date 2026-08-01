import { useState } from "react";
import { appeler } from "./assistantApi";

/**
 * Assistant de bannière — panneau replié en tête de l'onglet « Bannière promo ».
 * Même moteur que l'assistant de campagne (edge function `assistant-newsletter`,
 * action "banniere"), autre format : la popup s'impose au visiteur à son
 * arrivée, elle doit tenir en deux secondes de lecture.
 *
 * L'assistant PROPOSE, le restaurateur DISPOSE : la proposition remonte au
 * parent via `onProposition`, qui confirme avant de remplacer un contenu
 * existant. L'image de la bannière n'est jamais touchée — l'assistant ne fait
 * que du texte.
 */

export interface PropositionBanniere {
  titre: string;
  sous_titre: string;
  cta_label: string;
}

export default function AssistantBanniere({ dateEvent, onProposition }: {
  /** Date de l'événement saisie dans le formulaire, si elle existe. */
  dateEvent?: string;
  onProposition: (p: PropositionBanniere) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [sujet, setSujet] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  const [propos, setPropos] = useState<PropositionBanniere[]>([]);

  /* Trois propositions plutôt qu'une : comparer deux formulations est plus
     utile que relancer jusqu'à tomber sur la bonne. Trois appels en parallèle
     sur la même edge function — elle ne sait produire qu'une réponse à la fois.
     Une seule réussite suffit à afficher quelque chose ; on n'échoue que si
     les trois tombent. */
  /* Carte blanche : ce qu'on envoie quand le champ est vide. L'edge function
     exige un sujet non vide — plutôt que de la modifier (et donc de la
     redéployer), on lui passe la consigne comme sujet. Elle dispose déjà de
     tout le contexte utile pour y répondre : la carte, l'ardoise, la saison,
     les fermetures à venir et les campagnes déjà envoyées sont lues en base à
     chaque appel. */
  /* 200 signes maximum : au-delà, l'edge function tronque (s(body?.sujet, 200))
     et la consigne serait coupée en plein milieu. */
  const CARTE_BLANCHE =
    "Choisis toi-même le sujet, d'après la carte, la saison et l'actualité de " +
    "la maison. Évite un thème déjà traité récemment. Une annonce concrète.";

  /* Le sujet est facultatif : c'est quand on manque d'idées qu'on ouvre cet
     assistant — exiger un sujet, c'est bloquer précisément à ce moment-là. */
  async function proposer() {
    if (busy) return;
    setBusy(true); setErreur(""); setPropos([]);
    const args = { sujet: sujet.trim() || CARTE_BLANCHE, date_event: dateEvent || "" };
    const res = await Promise.allSettled([
      appeler("banniere", args), appeler("banniere", args), appeler("banniere", args),
    ]);
    const ok = res
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .map((r) => ({ titre: r.value.titre || "", sous_titre: r.value.sous_titre || "", cta_label: r.value.cta_label || "" }))
      /* Deux appels identiques rendent parfois le même texte : on ne montre
         pas deux fois la même idée. */
      .filter((p, i, a) => a.findIndex((q) => q.titre === p.titre && q.sous_titre === p.sous_titre) === i);

    if (ok.length === 0) {
      const premier = res.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      const m = premier?.reason;
      setErreur(m instanceof Error ? m.message : "L'assistant n'a pas pu répondre — réessayez.");
    }
    setPropos(ok);
    setBusy(false);
  }

  return (
    <div className="nl-ia">
      <div className="nl-ia-tete">
        <span className="nl-ia-titre">Assistant de bannière</span>
        <span className="nl-ia-sous">Dites ce que vous annoncez, l'assistant propose des formulations.</span>
        <button type="button" className="adm-vit-lien" style={{ marginLeft: "auto" }}
          aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          {ouvert ? "Masquer" : "Ouvrir"}
        </button>
      </div>

      {ouvert && (
        <div className="nl-ia-corps">
          {/* Champ souligné plein cadre : c'est une phrase qu'on dicte, pas un
              réglage. Le bouton est posé dessous, aligné à droite. */}
          <div className="ia-saisie">
            <label className="ia-lab" htmlFor="ia-sujet">Ce que vous voulez annoncer · facultatif</label>
            <input id="ia-sujet" className="ia-champ" value={sujet} maxLength={200} disabled={busy}
              onChange={(e) => setSujet(e.target.value)}
              placeholder="Ex. soirée beaujolais le 20, menu de Noël, fermeture annuelle en août…"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); proposer(); } }} />
            <div className="ia-saisie-pied">
              <span className="ia-compteur">{sujet.length}/200</span>
              <button type="button" className="btn btn-accent" onClick={proposer} disabled={busy}>
                {busy ? "Recherche…" : "Proposer des idées"}
              </button>
            </div>
          </div>

          {erreur && <div className="nl-ia-err">{erreur}</div>}

          {propos.length > 0 && (
            <>
              <div className="ia-propos">
                {propos.map((p, i) => (
                  <div className="ia-propo" key={i}>
                    <b>{p.titre || "(sans titre)"}</b>
                    <span className="ia-propo-sous">{p.sous_titre}</span>
                    {p.cta_label && <span className="ia-propo-cta">Bouton : « {p.cta_label} »</span>}
                    <button type="button" className="adm-vit-lien accent" onClick={() => onProposition(p)}>
                      Utiliser ce texte
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="adm-vit-lien" onClick={proposer} disabled={busy}
                style={{ marginTop: 14 }}>
                D'autres idées
              </button>
            </>
          )}

          <div className="nl-ia-sous">
            Laissez le champ vide et l'assistant choisira lui-même, d'après votre carte et la saison.
            Le texte remplit les champs ci-dessous — vous pouvez tout retoucher, et l'image reste à choisir.
          </div>
        </div>
      )}
    </div>
  );
}
