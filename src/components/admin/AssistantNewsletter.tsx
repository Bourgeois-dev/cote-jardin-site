import { useState } from "react";
import { supabase } from "../../lib/supabase";

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
  blocs: { titre: string; texte: string; cta_label?: string }[];
}

interface Idee { theme: string; objet: string; angle: string; quand: string }

// Miroir local de l'aide de TabNewsletter : les edge functions gardées par
// is_admin() exigent le JWT de SESSION (la clé anon n'est pas un admin).
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

async function appeler(action: string, payload: Record<string, unknown>): Promise<any> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant-newsletter`;
  const res = await fetch(url, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.message || `Erreur ${res.status}`);
  return data;
}

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
        <span className="nl-ia-titre">✨ Assistant de campagne</span>
        <span className="nl-ia-sous">Idées, objets et rédaction — vous gardez la main sur tout.</span>
        <button type="button" className="nl-lien" style={{ marginLeft: "auto" }}
          aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          {ouvert ? "Masquer" : "Ouvrir"}
        </button>
      </div>

      {ouvert && (
        <div className="nl-ia-corps">
          <div className="nl-ia-ligne">
            <input value={notes} maxLength={200} disabled={!!busy}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Facultatif — une envie, un plat, un événement maison…"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); proposerIdees(); } }} />
            <button type="button" className="btn btn-mini btn-accent" onClick={proposerIdees} disabled={!!busy}>
              {busy === "idees" ? "Recherche…" : "Proposer des idées"}
            </button>
            <button type="button" className="btn btn-mini btn-ligne" onClick={variantesObjet}
              disabled={!!busy || (!subject.trim() && !notes.trim())}
              title={subject.trim() || notes.trim() ? "Reformuler l'objet en cours" : "Saisissez d'abord un objet ou quelques mots de contexte"}>
              {busy === "objets" ? "Recherche…" : "Variantes d'objet"}
            </button>
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
            L'assistant ne connaît ni votre carte ni vos dates : relisez et complétez avant d'envoyer.
          </div>
        </div>
      )}
    </div>
  );
}
