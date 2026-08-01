import { useState } from "react";
import { appeler } from "./assistantApi";

/**
 * Assistant de campagne — panneau replié en tête de l'étape « Contenu » de
 * l'éditeur de newsletter. Trois aides, dans l'ordre où on en a besoin :
 *
 *   1. « Proposer des idées » — 4 pistes de campagnes, dont des événements du
 *      calendrier à venir (Saint-Valentin, fête des mères, beaujolais
 *      nouveau…). Chaque idée peut fournir son objet, ou être rédigée entière.
 *   2. « Rédiger cette campagne » — objet + aperçu + blocs de texte injectés
 *      dans l'éditeur, que le restaurateur retouche ensuite librement.
 *   3. « Variantes d'objet » — 5 reformulations de l'objet en cours.
 *
 * Le composant ne touche JAMAIS l'état de l'éditeur directement : il remonte
 * les propositions via onObjet / onRedaction, et le parent décide (avec
 * confirmation si du contenu existe déjà). L'IA propose, le restaurateur
 * dispose — rien ne part jamais sans passer par l'aperçu et l'envoi normaux.
 *
 * Côté serveur : edge function `assistant-newsletter`, réservée aux admins
 * (is_admin), contexte du restaurant lu dans les secrets (RESTO_NAME…).
 */

export interface Redaction {
  objet: string;
  preheader: string;
  /** `photo` est une SUGGESTION de visuel, en toutes lettres : l'assistant ne
   *  pose jamais d'image lui-même (il n'en a pas les URL). Le restaurateur
   *  choisit le fichier dans l'éditeur ; le texte l'aide à savoir quoi mettre. */
  /** Deux formes possibles, comme dans l'éditeur : un bloc pleine largeur, ou
   *  un bloc à deux colonnes quand l'assistant met deux choses en regard
   *  (deux formules, deux soirées). Le type est décidé par l'assistant, plus
   *  forcé par l'interface. */
  blocs: ({
    type?: "pleine_largeur"; titre?: string; texte: string; cta_label?: string; photo?: string;
  } | {
    type: "deux_colonnes";
    colonnes: { titre?: string; texte: string; cta_label?: string; photo?: string }[];
  })[];
}

interface Idee { theme: string; objet: string; angle: string; quand: string; photo?: string }

export default function AssistantNewsletter({ subject, onObjet, onRedaction }: {
  /** Objet en cours dans l'éditeur — sert de base aux variantes. */
  subject: string;
  /** Applique un objet proposé (le parent nettoie ses éventuelles alertes). */
  onObjet: (s: string) => void;
  /** Applique une rédaction complète (le parent confirme avant de remplacer). */
  onRedaction: (r: Redaction) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [notes, setNotes] = useState("");
  // Une seule opération à la fois : "idees" | "objets" | "rediger:<index>"
  const [busy, setBusy] = useState<string | null>(null);
  const [idees, setIdees] = useState<Idee[]>([]);
  const [objets, setObjets] = useState<string[]>([]);
  const [erreur, setErreur] = useState("");

  async function lancer(cle: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(cle); setErreur("");
    try { await fn(); }
    catch (e) { setErreur(e instanceof Error ? e.message : "L'assistant n'a pas pu répondre — réessayez."); }
    setBusy(null);
  }

  const proposerIdees = () => lancer("idees", async () => {
    const r = await appeler("idees", { notes });
    setIdees(r.idees || []);
    setObjets([]);
  });

  const variantesObjet = () => lancer("objets", async () => {
    const r = await appeler("objets", { objet: subject, notes });
    setObjets(r.objets || []);
  });

  const rediger = (i: number) => lancer(`rediger:${i}`, async () => {
    const idee = idees[i];
    const r = await appeler("rediger", { theme: idee.theme, angle: idee.angle, notes });
    onRedaction({ objet: r.objet || idee.objet, preheader: r.preheader || "", blocs: r.blocs || [] });
  });

  return (
    <div className="nl-ia">
      <div className="nl-ia-tete">
        <span className="nl-ia-titre">Assistant de campagne</span>
        <span className="nl-ia-sous">Idées, objets et rédaction — vous gardez la main sur tout.</span>
        <button type="button" className="adm-vit-lien" style={{ marginLeft: "auto" }}
          aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          {ouvert ? "Masquer" : "Ouvrir"}
        </button>
      </div>

      {ouvert && (
        <div className="nl-ia-corps">
          {/* Même traitement que l'assistant de bannière : le champ occupe la
              pleine largeur, souligné, et les deux actions sont posées dessous.
              C'est une phrase qu'on dicte, pas un réglage coincé entre deux
              boutons. */}
          <div className="ia-saisie">
            <label className="ia-lab" htmlFor="ia-notes">Une envie, un plat, un événement · facultatif</label>
            <input id="ia-notes" className="ia-champ" value={notes} maxLength={200} disabled={!!busy}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex. la truffe arrive, soirée jazz le 14, menu de Saint-Valentin…"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); proposerIdees(); } }} />
            <div className="ia-saisie-pied">
              <span className="ia-compteur">{notes.length}/200</span>
              <span className="ia-actions">
                {/* « Variantes d'objet » reformule un objet existant : elle reste
                    inactive tant qu'il n'y a ni objet ni contexte à reformuler. */}
                <button type="button" className="adm-vit-lien" onClick={variantesObjet}
                  disabled={!!busy || (!subject.trim() && !notes.trim())}
                  title={subject.trim() || notes.trim() ? "Reformuler l'objet en cours" : "Saisissez d'abord un objet ou quelques mots de contexte"}>
                  {busy === "objets" ? "Recherche…" : "Variantes d'objet"}
                </button>
                <button type="button" className="btn btn-accent" onClick={proposerIdees} disabled={!!busy}>
                  {busy === "idees" ? "Recherche…" : "Proposer des idées"}
                </button>
              </span>
            </div>
          </div>

          {erreur && <div className="nl-ia-err">{erreur}</div>}

          {objets.length > 0 && (
            <div>
              <div className="nl-ia-sous" style={{ marginBottom: 6 }}>Cliquez pour utiliser un objet :</div>
              <div className="nl-ia-chips">
                {objets.map((o, i) => (
                  <button type="button" key={i} className="nl-ia-chip" onClick={() => onObjet(o)}>{o}</button>
                ))}
              </div>
            </div>
          )}

          {idees.map((idee, i) => (
            <div className="nl-ia-carte" key={i}>
              {idee.quand && <span className="nl-ia-quand">{idee.quand}</span>}
              <b>{idee.theme}</b>
              <div className="nl-ia-objet">Objet proposé : « {idee.objet} »</div>
              <div className="nl-ia-angle">{idee.angle}</div>
              {idee.photo && <div className="nl-ia-photo">📷 Visuel suggéré : {idee.photo}</div>}
              <div className="nl-ia-actions">
                <button type="button" className="btn btn-mini btn-accent" onClick={() => rediger(i)} disabled={!!busy}>
                  {busy === `rediger:${i}` ? "Rédaction…" : "Rédiger cette campagne"}
                </button>
                <button type="button" className="btn btn-mini btn-ligne" onClick={() => onObjet(idee.objet)} disabled={!!busy}>
                  Utiliser l'objet seul
                </button>
              </div>
            </div>
          ))}

          <div className="nl-ia-sous">
            L'assistant s'appuie sur votre carte, votre ardoise et vos campagnes passées — mais il peut se tromper : relisez avant d'envoyer. Les visuels restent à ajouter par vous dans les blocs.
          </div>
        </div>
      )}
    </div>
  );
}
