import { useState } from "react";
import { appeler } from "./assistantApi";

/**
 * Assistant de bannière — panneau replié en tête de l'onglet « Bannière promo ».
 * Même moteur que l'assistant de campagne (edge function `assistant-newsletter`),
 * autre format : la popup s'impose au visiteur à son arrivée, elle doit tenir en
 * deux secondes de lecture.
 *
 * Deux chemins, comme dans l'assistant de campagne :
 *
 *   1. « Proposer des idées » — SANS RIEN SAISIR. L'assistant lit la carte,
 *      l'ardoise, les horaires et les fermetures à venir, et propose des sujets
 *      d'annonce. C'était le manque : le restaurateur qui ouvre le panneau sans
 *      idée précise se retrouvait devant un champ vide et un bouton inerte.
 *   2. « Rédiger la bannière » — quand le sujet est déjà connu, on le dicte et
 *      l'assistant écrit directement titre, sous-titre et libellé de bouton.
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

/** Une piste d'annonce renvoyée par l'action "idees" (partagée avec les campagnes). */
interface Idee { theme: string; angle: string; quand: string }

export default function AssistantBanniere({ dateEvent, onProposition }: {
  /** Date de l'événement saisie dans le formulaire, si elle existe. */
  dateEvent?: string;
  onProposition: (p: PropositionBanniere) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [sujet, setSujet] = useState("");
  // Une seule opération à la fois : "idees" | "banniere" | "idee:<index>"
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState("");
  const [idees, setIdees] = useState<Idee[]>([]);
  const [propo, setPropo] = useState<PropositionBanniere | null>(null);

  async function lancer(cle: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(cle); setErreur("");
    try { await fn(); }
    catch (e) { setErreur(e instanceof Error ? e.message : "L'assistant n'a pas pu répondre — réessayez."); }
    setBusy(null);
  }

  /** Idées d'annonce. Le champ n'est qu'un indice facultatif : vide, l'assistant
   *  part de la carte et du calendrier du restaurant. */
  const proposerIdees = () => lancer("idees", async () => {
    const r = await appeler("idees", { notes: sujet.trim() });
    setIdees((r.idees || []).map((i: Idee) => ({ theme: i.theme, angle: i.angle, quand: i.quand })));
    setPropo(null);
  });

  /** Rédaction directe, à partir du sujet dicté. */
  const rediger = () => lancer("banniere", async () => {
    const r = await appeler("banniere", { sujet: sujet.trim(), date_event: dateEvent || "" });
    setPropo({ titre: r.titre || "", sous_titre: r.sous_titre || "", cta_label: r.cta_label || "" });
    setIdees([]);
  });

  /** Rédaction à partir d'une idée retenue : le thème et l'angle deviennent le sujet. */
  const redigerIdee = (i: number) => lancer(`idee:${i}`, async () => {
    const idee = idees[i];
    const r = await appeler("banniere", {
      sujet: [idee.theme, idee.angle].filter(Boolean).join(" — "),
      date_event: dateEvent || "",
    });
    setPropo({ titre: r.titre || "", sous_titre: r.sous_titre || "", cta_label: r.cta_label || "" });
    setIdees([]);
  });

  return (
    <div className="nl-ia">
      <div className="nl-ia-tete">
        <span className="nl-ia-titre">Assistant de bannière</span>
        <span className="nl-ia-sous">Des idées d'annonce, ou la rédaction directe — vous gardez la main.</span>
        <button type="button" className="adm-vit-lien" style={{ marginLeft: "auto" }}
          aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          {ouvert ? "Masquer" : "Ouvrir"}
        </button>
      </div>

      {ouvert && (
        <div className="nl-ia-corps">
          {/* Même traitement que l'assistant de campagne : le champ occupe la
              pleine largeur, souligné, et les deux actions sont posées dessous.
              C'est une phrase qu'on dicte, pas un réglage coincé entre deux
              boutons. */}
          <div className="ia-saisie">
            <label className="ia-lab" htmlFor="ia-banniere">Ce que vous annoncez · facultatif</label>
            <input id="ia-banniere" className="ia-champ" value={sujet} maxLength={200} disabled={!!busy}
              onChange={(e) => setSujet(e.target.value)}
              placeholder="Ex. soirée beaujolais le 20, menu de Noël, fermeture annuelle en août…"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sujet.trim() ? rediger() : proposerIdees(); } }} />
            <div className="ia-saisie-pied">
              <span className="ia-compteur">{sujet.length}/200</span>
              <span className="ia-actions">
                {/* « Rédiger » exige un sujet : sans lui, l'assistant écrirait une
                    annonce sur rien. « Proposer des idées » n'en a jamais besoin. */}
                <button type="button" className="adm-vit-lien" onClick={rediger}
                  disabled={!!busy || !sujet.trim()}
                  title={sujet.trim() ? "Rédiger la popup sur ce sujet" : "Dites d'abord ce que la bannière doit annoncer"}>
                  {busy === "banniere" ? "Rédaction…" : "Rédiger la bannière"}
                </button>
                <button type="button" className="btn btn-accent" onClick={proposerIdees} disabled={!!busy}>
                  {busy === "idees" ? "Recherche…" : "Proposer des idées"}
                </button>
              </span>
            </div>
          </div>

          {erreur && <div className="nl-ia-err">{erreur}</div>}

          {idees.length > 0 && (
            <div className="ia-propos">
              {idees.map((idee, i) => (
                <div className="ia-propo" key={i}>
                  {idee.quand && <span className="nl-ia-quand">{idee.quand}</span>}
                  <b>{idee.theme}</b>
                  <div className="ia-propo-sous">{idee.angle}</div>
                  <button type="button" className="adm-vit-lien accent"
                    onClick={() => redigerIdee(i)} disabled={!!busy}>
                    {busy === `idee:${i}` ? "Rédaction…" : "Rédiger cette bannière"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {propo && (
            <div className="ia-propos">
              <div className="ia-propo">
                <b>{propo.titre || "(sans titre)"}</b>
                <div className="ia-propo-sous">{propo.sous_titre}</div>
                {propo.cta_label && <div className="ia-propo-cta">Bouton : « {propo.cta_label} »</div>}
                <div className="nl-ia-actions">
                  <button type="button" className="btn btn-mini btn-accent" onClick={() => onProposition(propo)}>
                    Utiliser ce texte
                  </button>
                  <button type="button" className="btn btn-mini btn-ligne"
                    onClick={sujet.trim() ? rediger : proposerIdees} disabled={!!busy}>
                    Une autre proposition
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="nl-ia-sous">
            L'assistant s'appuie sur votre carte, votre ardoise et vos fermetures à venir — mais il peut se tromper : relisez avant d'activer. Le texte remplit les champs ci-dessous, l'image reste à choisir.
          </div>
        </div>
      )}
    </div>
  );
}
