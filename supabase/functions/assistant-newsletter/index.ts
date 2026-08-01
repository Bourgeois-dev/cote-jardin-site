import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Configuration ────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
// Modèle en secret, avec fallback dans le code — même mécanique qu'extraire-carte :
// le jour où le modèle évolue, changer le secret ASSISTANT_MODEL (par client) OU
// ce fallback (pour tous). Aucune autre partie du code ne mentionne le modèle.
const ASSISTANT_MODEL = Deno.env.get("ASSISTANT_MODEL") || "claude-haiku-4-5";
const RESTO_NAME    = Deno.env.get("RESTO_NAME") || "Le restaurant";
const TAGLINE       = Deno.env.get("TAGLINE") || "";
const RESTO_ADDRESS = Deno.env.get("RESTO_ADDRESS") || "";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

// Client service role : lit les données réelles du site (carte, ardoise,
// horaires…) pour donner du contexte à l'assistant. Lecture seule, uniquement
// APRÈS la vérification admin — un anonyme ne déclenche aucune requête.
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/* ── Assistant de campagne ────────────────────────────────────────────────────
   Trois actions, toutes en JSON strict :

   - "idees"   : propose 4 idées de campagnes — au moins deux calées sur le
                 calendrier à venir (Saint-Valentin, fête des mères, beaujolais
                 nouveau, saisons…), le reste en fonds de commerce (nouvelle
                 carte, coulisses, événement maison).
   - "objets"  : 5 variantes d'objet d'email à partir de l'objet ou du thème
                 en cours.
   - "rediger" : rédige une campagne complète (objet, aperçu, 1-2 blocs de
                 texte) prête à être injectée dans l'éditeur de blocs — le
                 restaurateur retouche ensuite librement.
   - "banniere" : rédige la popup d'accueil du site (titre, sous-titre,
                 libellé de bouton) — même moteur, autre format court.

   Le contexte du restaurant vient de DEUX sources :
   - les secrets (nom, tagline, adresse) — la configuration par client ;
   - les données réelles du site, lues en base à chaque appel (carte active,
     ardoise, offre à emporter, actualité affichée, jours de fermeture,
     fermetures exceptionnelles, photos disponibles, campagnes déjà envoyées)
     — c'est ce qui rend les propositions concrètes : l'assistant peut citer
     un vrai plat signature, éviter de proposer un envoi pendant les congés ou
     de resservir un thème traité le mois dernier ;
   - la voix du restaurant, saisie par le restaurateur dans les paramètres
     (site_content.assistant_voix) — la « forme » du texte, propre à chaque
     client, quand tout le reste est du « fond » identique.
   Le même code sert tous les clients, seules les données changent. */

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Contexte réel du restaurant, lu en base. Meilleur effort : si une lecture
 *  échoue, l'assistant reste simplement plus générique — jamais d'erreur.
 *  Plafonné (~2600 signes) pour borner le prompt quel que soit le client. */
async function contexteDonnees(): Promise<string> {
  const lignes: string[] = [];
  try {
    const [plats, ardoise, takeawayFlag, emporter, promo, horaires, fermetures, envoyees, photos] = await Promise.all([
      db.from("menu_items").select("category,name").eq("is_active", true).order("category").order("position").limit(60),
      db.from("site_content").select("content").eq("section_key", "ardoise").maybeSingle(),
      db.from("site_content").select("content").eq("section_key", "takeaway_enabled").maybeSingle(),
      db.from("takeaway_items").select("name").eq("is_active", true).order("position").limit(8),
      db.from("promo_banner").select("title,subtitle,message,event_date").eq("is_active", true).limit(1).maybeSingle(),
      db.from("opening_hours").select("day_of_week,is_closed").order("day_of_week"),
      db.from("closure_periods").select("start_date,end_date,reason").gte("end_date", new Date().toISOString().slice(0, 10)).order("start_date").limit(4),
      // Campagnes déjà parties (hors welcome, qui est transactionnel) : évite
      // de reproposer un thème traité il y a trois semaines.
      db.from("newsletter_campaigns").select("subject,sent_at").eq("status", "sent").neq("template", "welcome")
        .not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(10),
      db.from("gallery_images").select("alt,caption").eq("is_active", true).order("position").limit(20),
    ]);

    // La carte active, groupée par catégorie (12 plats max par catégorie).
    if (plats.data?.length) {
      const parCat = new Map<string, string[]>();
      for (const p of plats.data) {
        const cat = String(p.category || "Autres").trim() || "Autres";
        if (!parCat.has(cat)) parCat.set(cat, []);
        const liste = parCat.get(cat)!;
        if (liste.length < 12) liste.push(String(p.name || "").trim());
      }
      const carte = [...parCat.entries()].map(([c, ns]) => `- ${c} : ${ns.join(" ; ")}`).join("\n");
      lignes.push(`La carte actuelle (sans les prix) :\n${carte}`);
    }

    // L'ardoise du moment (prix volontairement omis : il peut changer avant l'envoi).
    const ard = ardoise.data?.content as any;
    if (ard?.plat) lignes.push(`L'ardoise du moment : ${String(ard.plat)}${ard.note ? ` (${String(ard.note)})` : ""}.`);

    // Offre à emporter, si le module est actif.
    if ((takeawayFlag.data?.content as any)?.enabled === true && emporter.data?.length) {
      lignes.push(`Offre à emporter : ${emporter.data.map((x: any) => String(x.name || "").trim()).filter(Boolean).join(" ; ")}.`);
    }

    // Actualité / événement déjà affiché sur le site (bandeau promo).
    const pr = promo.data as any;
    if (pr) {
      const bouts = [pr.title, pr.subtitle, pr.message].map((v: any) => String(v || "").trim()).filter(Boolean).join(" — ");
      if (bouts) lignes.push(`Actualité affichée sur le site : ${bouts}${pr.event_date ? ` (date : ${pr.event_date})` : ""}.`);
    }

    // Jours de fermeture hebdomadaire — évite de proposer un « brunch du
    // dimanche » à un restaurant fermé le dimanche.
    const fermes = (horaires.data || []).filter((h: any) => h.is_closed).map((h: any) => JOURS[h.day_of_week] || "").filter(Boolean);
    if (fermes.length) lignes.push(`Jours de fermeture hebdomadaire : ${fermes.join(", ")}.`);

    // Fermetures exceptionnelles à venir (congés…) — matière à campagne
    // d'annonce, et périodes à éviter pour un envoi.
    if (fermetures.data?.length) {
      lignes.push("Fermetures exceptionnelles à venir : " + fermetures.data.map((f: any) =>
        `du ${f.start_date} au ${f.end_date}${f.reason ? ` (${String(f.reason)})` : ""}`).join(" ; ") + ".");
    }

    // Campagnes déjà envoyées : leurs objets, du plus récent au plus ancien.
    // Sert exclusivement à ne PAS se répéter (cf. règle du prompt).
    if (envoyees.data?.length) {
      lignes.push("Campagnes déjà envoyées (objet — date), de la plus récente à la plus ancienne : " +
        envoyees.data.map((c: any) => `« ${String(c.subject || "").trim()} » (${String(c.sent_at).slice(0, 10)})`).join(" ; ") + ".");
    }

    // Sujets photographiés disponibles dans la galerie — l'assistant ne pose
    // pas d'image lui-même, mais peut dire au restaurateur laquelle illustrer.
    if (photos.data?.length) {
      const sujets = [...new Set(photos.data
        .map((g: any) => String(g.caption || g.alt || "").trim())
        .filter((v: string) => v.length > 2))].slice(0, 12);
      if (sujets.length) lignes.push(`Photos disponibles dans la galerie du site : ${sujets.join(" ; ")}.`);
    }
  } catch (_e) { /* contexte best-effort */ }
  return lignes.join("\n").slice(0, 3400);
}

/** Voix du restaurant — texte libre saisi dans Paramètres, stocké dans
 *  site_content.assistant_voix. C'est la « forme » de l'assistant : le seul
 *  réglage propre à chaque client. Plafonné à 600 signes : une consigne de
 *  ton, pas un second prompt (et pas un vecteur d'injection tentaculaire —
 *  seul un admin peut l'écrire, mais on borne quand même). */
async function voixRestaurant(): Promise<string> {
  try {
    const { data } = await db.from("site_content").select("content").eq("section_key", "assistant_voix").maybeSingle();
    return String((data?.content as any)?.texte || "").trim().slice(0, 600);
  } catch { return ""; }
}

const CONTEXTE_RESTO = `Le restaurant s'appelle « ${RESTO_NAME} »${TAGLINE ? `, sa signature : « ${TAGLINE} »` : ""}${RESTO_ADDRESS ? `, situé : ${RESTO_ADDRESS}` : ""}.`;

function reglesCommunes(donnees: string, voix: string): string {
  return `Tu es le conseiller marketing d'un restaurant français indépendant. Tu aides le restaurateur à écrire ses textes.
${CONTEXTE_RESTO}
${donnees ? `
CE QUE TU SAIS DE VRAI SUR LE RESTAURANT (données du site, à jour aujourd'hui) :
${donnees}
` : ""}${voix ? `
LA VOIX DE CE RESTAURANT (consigne du restaurateur, elle prime sur le ton par défaut) :
${voix}
` : ""}
Règles STRICTES :
- Français impeccable, ton chaleureux et sincère, vouvoiement des clients. Jamais de superlatifs creux ni de jargon marketing (« immanquable », « exceptionnel », « boostez »).
- Tu peux citer les plats, l'ardoise, l'offre à emporter, l'actualité et les fermetures listés ci-dessus : ce sont des données réelles. Appuie-toi dessus quand c'est pertinent (plat signature, produit de saison, annonce de congés).
- EN DEHORS de ces données, n'invente JAMAIS de faits précis : pas d'autres plats, pas de prix, pas de dates ou d'horaires non listés. Reste générique là où tu ne sais pas, le restaurateur complétera.
- Ne suggère jamais un moment d'envoi ou un événement pendant une fermeture exceptionnelle listée, ni une offre sur un jour de fermeture hebdomadaire.
- Si des campagnes déjà envoyées sont listées, ne propose JAMAIS un thème équivalent à l'une des trois plus récentes, et évite de réutiliser leurs tournures d'objet. Un même marronnier (Saint-Valentin, fête des mères…) peut revenir d'une ANNÉE sur l'autre, jamais à quelques semaines d'intervalle.
- Le jeton {{prenom}} sera remplacé par le prénom du destinataire : tu peux l'utiliser avec parcimonie (objet ou première ligne).
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises Markdown.`;
}

function promptIdees(dateFr: string, notes: string, donnees: string, voix: string): { system: string; user: string } {
  return {
    system: `${reglesCommunes(donnees, voix)}

Tâche : proposer exactement 4 idées de campagnes email.
- Au moins 2 idées calées sur le calendrier français À VENIR dans les 8 prochaines semaines par rapport à la date donnée (fêtes : Saint-Valentin, Pâques, fête des mères/pères, beaujolais nouveau, fête de la musique, chandeleur, Épiphanie, fêtes de fin d'année… ; ou saisons et produits de saison). Ne propose jamais un événement déjà passé.
- Les autres idées : fonds de commerce intemporels (nouvelle carte, coulisses et équipe, plat signature, remerciement des habitués…). Quand la carte réelle est fournie, ancre au moins une idée sur un plat ou un produit qui y figure vraiment.
Format : {"idees":[{"theme":"…","objet":"…","angle":"…","quand":"…","photo":"…"}]}
- "theme" : 3-6 mots. "objet" : un objet d'email prêt à l'emploi, 45 signes maximum. "angle" : 1-2 phrases, l'histoire à raconter. "quand" : le bon moment d'envoi (ex. "début février").
- "photo" : en quelques mots, le visuel à mettre dans la campagne (ex. "une photo du plat en gros plan", "la salle en soirée"). Si des photos de la galerie sont listées et que l'une convient, nomme-la. Sinon décris la photo à prendre. "" si l'image n'apporte rien.`,
    user: `Nous sommes le ${dateFr}.${notes ? `\nEnvie du restaurateur : ${notes}` : ""}\nPropose les 4 idées.`,
  };
}

function promptObjets(objet: string, theme: string, notes: string, donnees: string, voix: string): { system: string; user: string } {
  return {
    system: `${reglesCommunes(donnees, voix)}

Tâche : proposer exactement 5 variantes d'objet d'email pour la campagne décrite.
- 45 signes maximum chacune (au-delà, l'objet est coupé sur téléphone).
- Varie les registres : sobre, curieux, avec {{prenom}}, avec UN émoji discret (une ou deux variantes seulement).
- Pas de MAJUSCULES criardes, pas de points d'exclamation en rafale, pas de mots-spam (« gratuit », « promo exceptionnelle »).
Format : {"objets":["…","…","…","…","…"]}`,
    user: `${objet ? `Objet actuel : « ${objet} »` : ""}${theme ? `\nThème de la campagne : ${theme}` : ""}${notes ? `\nContexte : ${notes}` : ""}\nPropose les 5 variantes.`,
  };
}

function promptRediger(theme: string, angle: string, notes: string, dateFr: string, donnees: string, voix: string): { system: string; user: string } {
  return {
    system: `${reglesCommunes(donnees, voix)}

Tâche : rédiger une campagne email complète pour le thème donné.
Format : {"objet":"…","preheader":"…","blocs":[{"type":"pleine_largeur","titre":"…","texte":"…","cta_label":"…","photo":"…"}]}
- "objet" : 45 signes maximum.
- "preheader" : le résumé affiché après l'objet dans la boîte de réception, 100 signes maximum, qui complète l'objet sans le répéter.
- "blocs" : 1 ou 2 blocs. Chaque bloc : "titre" court (facultatif : "" si inutile), "texte" de 2 à 3 paragraphes COURTS séparés par une ligne vide (deux sauts de ligne \\n\\n), 400 signes maximum par bloc. Le premier texte peut commencer par « Bonjour {{prenom}}, ».
- "type" : "pleine_largeur" par défaut. C'est le format normal, celui d'un fil qu'on lit de haut en bas.
- Emploie "deux_colonnes" UNIQUEMENT quand le bloc met en regard DEUX choses de même nature, qu'on gagne à comparer d'un coup d'œil : deux formules, deux menus, deux soirées, deux dates. Jamais pour aérer une mise en page ni pour couper un texte suivi — deux colonnes se lisent mal sur téléphone, où beaucoup de messageries les empilent. Dans le doute, reste en pleine largeur.
- Un bloc "deux_colonnes" remplace "titre"/"texte" par : "colonnes":[{"titre":"…","texte":"…","cta_label":"…","photo":"…"},{…}] — exactement DEUX entrées, chacune avec un texte COURT (200 signes maximum, la colonne est étroite).
- "cta_label" : le libellé du bouton (ex. "Découvrir la carte", "Voir le plat du jour") — uniquement sur le dernier bloc, "" sur les autres. Le lien du bouton est géré par l'éditeur, ne fournis jamais d'URL.
- "photo" : en quelques mots, le visuel à placer dans ce bloc (nomme une photo de la galerie si l'une convient, sinon décris celle à prendre). "" si le bloc se passe d'image. Tu ne fournis JAMAIS d'URL d'image : le restaurateur choisit le fichier dans l'éditeur.
- Tu peux utiliser **gras** (double astérisque) avec parcimonie pour un mot ou deux.
- Écris des phrases qu'un restaurateur assumerait telles quelles, en laissant des tournures génériques là où un détail précis manquerait (jamais de crochets à compléter).`,
    user: `Nous sommes le ${dateFr}.\nThème : ${theme}${angle ? `\nAngle : ${angle}` : ""}${notes ? `\nPrécisions du restaurateur : ${notes}` : ""}\nRédige la campagne.`,
  };
}

/* Bannière promo — la popup d'accueil du site. Format très court : le
   visiteur la lit en deux secondes, avant d'avoir rien demandé. */
function promptBanniere(sujet: string, dateEvent: string, notes: string, dateFr: string, donnees: string, voix: string): { system: string; user: string } {
  return {
    system: `${reglesCommunes(donnees, voix)}

Tâche : rédiger la popup d'accueil du site (elle s'ouvre à l'arrivée du visiteur).
Format : {"titre":"…","sous_titre":"…","cta_label":"…"}
- "titre" : 40 signes maximum. L'accroche, lisible d'un coup d'œil.
- "sous_titre" : 110 signes maximum, une seule phrase qui donne l'information utile (ce que c'est, quand, ce qu'il faut faire).
- "cta_label" : le libellé du bouton, 25 signes maximum (ex. "Voir la carte", "Nous appeler"). Le lien est géré par l'interface, ne fournis jamais d'URL.
- Une popup s'impose au visiteur : sois bref, concret et courtois. Aucun {{prenom}} ici — le visiteur du site est anonyme.`,
    user: `Nous sommes le ${dateFr}.\nSujet de la bannière : ${sujet}${dateEvent ? `\nDate de l'événement : ${dateEvent}` : ""}${notes ? `\nPrécisions : ${notes}` : ""}\nRédige la popup.`,
  };
}

// ── Appel Anthropic + extraction du JSON ─────────────────────────────────────
async function appelerModele(system: string, user: string, maxTokens: number): Promise<any> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`api ${resp.status}: ${detail.slice(0, 200)}`);
  }
  const data = await resp.json();
  const texte = (data?.content || [])
    .filter((c: any) => c?.type === "text")
    .map((c: any) => c.text || "")
    .join("\n");
  // Le prompt exige du JSON pur, mais on retire d'éventuelles clôtures Markdown
  // par sécurité avant de parser.
  const propre = texte.replace(/```json|```/g, "").trim();
  return JSON.parse(propre);
}

// Bornage systématique de ce qui revient du modèle avant de le renvoyer au
// front : longueurs plafonnées, structures reconstruites champ par champ —
// jamais de passe-plat d'un objet arbitraire.
const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "config", message: "La clé API de l'assistant n'est pas configurée sur ce site." }, 500);
    }

    // ── Vérification admin ────────────────────────────────────────────────────
    // L'appel consomme de l'API payante : on n'autorise QUE les admins. Même
    // mécanique qu'extraire-carte : client Supabase portant le token de
    // l'appelant + is_admin().
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "auth", message: "Authentification requise." }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");
    if (adminErr || isAdmin !== true) {
      return json({ error: "forbidden", message: "Accès réservé à l'administration." }, 403);
    }

    // ── Entrées ───────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    const action = String(body?.action || "");
    const notes = s(body?.notes, 500);
    const dateFr = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    // Données réelles du site + voix — collectées une fois par appel, après le guard.
    const [donnees, voix] = await Promise.all([contexteDonnees(), voixRestaurant()]);

    if (action === "idees") {
      const p = promptIdees(dateFr, notes, donnees, voix);
      const r = await appelerModele(p.system, p.user, 900);
      const idees = (Array.isArray(r?.idees) ? r.idees : []).slice(0, 4).map((i: any) => ({
        theme: s(i?.theme, 80),
        objet: s(i?.objet, 90),
        angle: s(i?.angle, 300),
        quand: s(i?.quand, 60),
        photo: s(i?.photo, 120),
      })).filter((i: any) => i.theme && i.objet);
      if (idees.length === 0) return json({ error: "vide", message: "Aucune idée exploitable — réessayez." }, 502);
      return json({ idees });
    }

    if (action === "objets") {
      const objet = s(body?.objet, 150);
      const theme = s(body?.theme, 120);
      if (!objet && !theme && !notes) {
        return json({ error: "input", message: "Donnez un objet, un thème ou quelques mots de contexte." }, 400);
      }
      const p = promptObjets(objet, theme, notes, donnees, voix);
      const r = await appelerModele(p.system, p.user, 500);
      const objets = (Array.isArray(r?.objets) ? r.objets : []).slice(0, 5)
        .map((o: any) => s(o, 90)).filter(Boolean);
      if (objets.length === 0) return json({ error: "vide", message: "Aucune variante exploitable — réessayez." }, 502);
      return json({ objets });
    }

    if (action === "rediger") {
      const theme = s(body?.theme, 120);
      const angle = s(body?.angle, 300);
      if (!theme) return json({ error: "input", message: "Thème manquant." }, 400);
      const p = promptRediger(theme, angle, notes, dateFr, donnees, voix);
      const r = await appelerModele(p.system, p.user, 1300);
      /* Deux formes de bloc, bornées séparément. Un « deux_colonnes » n'est
         retenu que s'il porte bien DEUX colonnes ayant chacune du texte :
         une colonne vide donnerait un email bancal. À défaut, on le laisse
         retomber en pleine largeur plutôt que de rejeter la rédaction. */
      const blocs = (Array.isArray(r?.blocs) ? r.blocs : []).slice(0, 2).map((b: any) => {
        const cols = Array.isArray(b?.colonnes) ? b.colonnes : [];
        if (b?.type === "deux_colonnes" && cols.length >= 2) {
          const c = cols.slice(0, 2).map((x: any) => ({
            titre: s(x?.titre, 120),
            texte: s(x?.texte, 400),
            cta_label: s(x?.cta_label, 40),
            photo: s(x?.photo, 120),
          }));
          if (c[0].texte && c[1].texte) return { type: "deux_colonnes", colonnes: c };
        }
        return {
          type: "pleine_largeur",
          titre: s(b?.titre, 120),
          texte: s(b?.texte, 900),
          cta_label: s(b?.cta_label, 40),
          photo: s(b?.photo, 120),
        };
      }).filter((b: any) => b.type === "deux_colonnes" || b.texte);
      if (blocs.length === 0) return json({ error: "vide", message: "Rédaction inexploitable — réessayez." }, 502);
      return json({
        objet: s(r?.objet, 90),
        preheader: s(r?.preheader, 150),
        blocs,
      });
    }

    if (action === "banniere") {
      const sujet = s(body?.sujet, 200);
      const dateEvent = s(body?.date_event, 40);
      if (!sujet && !notes) {
        return json({ error: "input", message: "Dites en quelques mots ce que la bannière doit annoncer." }, 400);
      }
      const p = promptBanniere(sujet || notes, dateEvent, notes, dateFr, donnees, voix);
      const r = await appelerModele(p.system, p.user, 400);
      const titre = s(r?.titre, 80);
      const sousTitre = s(r?.sous_titre, 200);
      if (!titre && !sousTitre) return json({ error: "vide", message: "Rédaction inexploitable — réessayez." }, 502);
      return json({ titre, sous_titre: sousTitre, cta_label: s(r?.cta_label, 40) });
    }

    return json({ error: "input", message: "Action inconnue." }, 400);
  } catch (e) {
    const msg = String(e?.message || e);
    // JSON.parse en échec = réponse modèle malformée : 502 (réessayable),
    // pas 500 (bug de la fonction).
    const status = /JSON|api /.test(msg) ? 502 : 500;
    console.error("assistant-newsletter:", msg);
    return json({ error: "assistant", message: "L'assistant n'a pas pu répondre — réessayez dans un instant." }, status);
  }
});
