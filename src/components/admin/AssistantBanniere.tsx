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
  const [propo, setPropo] = useState<PropositionBanniere | null>(null);

  async function rediger() {
    if (busy || !sujet.trim()) return;
    setBusy(true); setErreur(""); setPropo(null);
    try {
      const r = await appeler("banniere", { sujet: sujet.trim(), date_event: dateEvent || "" });
      setPropo({ titre: r.titre || "", sous_titre: r.sous_titre || "", cta_label: r.cta_label || "" });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'assistant n'a pas pu répondre — réessayez.");
    }
    setBusy(false);
  }

  return (
    <div className="nl-ia">
      <div className="nl-ia-tete">
        <span className="nl-ia-titre">✨ Assistant de bannière</span>
        <span className="nl-ia-sous">Dites ce que vous annoncez, l'assistant rédige la popup.</span>
        <button type="button" className="nl-lien" style={{ marginLeft: "auto" }}
          aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          {ouvert ? "Masquer" : "Ouvrir"}
        </button>
      </div>

      {ouvert && (
        <div className="nl-ia-corps">
          <div className="nl-ia-ligne">
            <input value={sujet} maxLength={200} disabled={busy}
              onChange={(e) => setSujet(e.target.value)}
              placeholder="Ex. soirée beaujolais le 20, menu de Noël, fermeture annuelle en août…"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rediger(); } }} />
            <button type="button" className="btn btn-mini btn-accent" onClick={rediger} disabled={busy || !sujet.trim()}>
              {busy ? "Rédaction…" : "Rédiger la bannière"}
            </button>
          </div>

          {erreur && <div className="nl-ia-err">{erreur}</div>}

          {propo && (
            <div className="nl-ia-carte">
              <b>{propo.titre || "(sans titre)"}</b>
              <div className="nl-ia-angle" style={{ marginTop: 4 }}>{propo.sous_titre}</div>
              {propo.cta_label && <div className="nl-ia-objet">Bouton : « {propo.cta_label} »</div>}
              <div className="nl-ia-actions">
                <button type="button" className="btn btn-mini btn-accent" onClick={() => onProposition(propo)}>
                  Utiliser ce texte
                </button>
                <button type="button" className="btn btn-mini btn-ligne" onClick={rediger} disabled={busy}>
                  Une autre proposition
                </button>
              </div>
            </div>
          )}

          <div className="nl-ia-sous">
            Le texte remplit les champs ci-dessous — vous pouvez tout retoucher, et l'image reste à choisir.
          </div>
        </div>
      )}
    </div>
  );
}
