# CLAUDE.md — Site vitrine restaurateur (gabarit)

Ce fichier est lu en priorité par Claude. Il décrit l'architecture du projet **et** le périmètre à respecter impérativement. À lire avant toute modification.

---

## ⚠️ Règle d'or (à ne jamais enfreindre)

> **Tout bloc affiché sur le site doit être éditable depuis l'admin. On ne crée jamais de nouveau bloc pour un client.**

> **Principe directeur : « blocs éditables identiques sur le FOND, uniques sur la FORME ».**
> Le **fond** ne change jamais d'un client à l'autre : la liste des blocs du site, la liste des onglets de l'admin, les champs de chaque formulaire (ex. la newsletter expose toujours Prénom, Nom et Email — Prénom/Nom facultatifs, Email obligatoire), et la correspondance bloc ↔ table. La **forme** est libre et propre à chaque client : la charte (`theme.css`), **le CSS des composants du site (`site.css`) — unique pour chaque restaurateur, comme la composition visuelle des blocs**, et le contenu (textes, photos, qui viennent de la base). Vérifiable par `node scripts/check-fond.mjs` (voir GESTION-MULTI-CLIENTS.md, section 7).

Ce projet est un **gabarit dupliqué à l'identique** pour chaque restaurant. Le gabarit technique commun est `templates/app/` (le code copié tel quel pour chaque client) ; **Côté Jardin** en est l'implémentation de référence — le client le plus complet et le plus à jour, qui illustre l'ensemble des fonctionnalités du gabarit. Pour un nouveau client, on ne change que :

1. **La charte** — couleurs, typographies, formes, ombres, icônes.
2. **La mise en page** — agencement et style visuel des blocs existants.
3. **Le contenu** — textes, plats, photos, horaires… (vient de la base du client ; remplir un bloc n'est pas en créer un).

Ce qui ne change **jamais** : la liste des blocs du site, la liste des onglets/champs de l'admin, et la correspondance 1:1 entre bloc affiché et zone éditable.

Si un bloc n'a pas de pendant éditable dans l'admin, **il ne doit pas exister sur le site** : le restaurateur doit pouvoir mettre à jour 100 % du contenu *évolutif* qu'il affiche. C'est ce qui rend la solution duplicable en série.

**Seules exceptions :** le hero, le menu de navigation et le bloc « Notre cuisine » (Histoire). Ils ne figurent pas dans l'admin et ne sont pas éditables — leur contenu est défini une fois à la création du site et figé au build. C'est admis parce qu'ils portent l'identité du restaurant (accroche, navigation, récit de la maison) plutôt qu'un contenu opérationnel destiné à changer souvent, contrairement à la carte, l'ardoise ou les horaires. Le bloc « Notre cuisine » est volontairement **unique et à l'image du restaurateur** : on s'autorise des libertés de composition dessus, comme pour le hero.

### Libertés permises
- **Hero** : libertés créatives **totales** sur la structure, la composition, la mise en page et le traitement visuel. C'est l'accroche qui porte l'identité du restaurant, **conçue sur mesure pour chaque client**. **Le hero ne figure pas dans l'admin : son contenu (texte d'accroche, visuel) est défini à la création du site et figé au build — le restaurateur ne le modifie pas.** Il n'affiche donc pas de contenu destiné à évoluer, ce qui est cohérent avec la règle d'or. **Le hero est propre à chaque client, dans sa STRUCTURE comme dans son CONTENU** : sa mise en page (une image plein écran, un split, un diaporama, une vidéo…), ses textes et ses images sont uniques. Par exemple, une structure « deux visages » (split 2 images + carte centrale) convient à un concept bistrot midi / gastro soir — mais ce n'est qu'un *exemple*, **pas un gabarit imposé** : un autre restaurant aura une tout autre structure de hero. **Ne jamais réutiliser le hero (structure, textes ou images) d'un autre restaurant comme valeur par défaut** — le hero se code spécifiquement pour le client (composant `Hero.tsx` adapté + variables `VITE_HERO_*` propres à sa structure). Partir de `clients/_modele.json` (vierge), jamais d'une config client existante.
- **Menu de navigation** : libertés sur le style et la disposition. Non éditable — défini à la création.
  Les **liens affichés** sont conditionnels : un lien ne doit apparaître que si le bloc correspondant
  est actif et a du contenu. Règle par lien (calculée dans `Site.tsx`, passée à `Navbar` via la prop `flags`) :
  - *Plat du jour* → visible si `ardoise.enabled !== false` ET `ardoise.plat` non vide
  - *À emporter* → visible si `takeaway_enabled = true` ET au moins 1 article actif
  - *Producteurs* → visible si `partners_enabled = true` ET au moins 1 partenaire actif
  - *Contact* → visible si `newsletter_enabled !== false` (le bloc Newsletter héberge les infos de contact)
  - *Notre cuisine, La carte, Galerie* → toujours visibles (blocs non désactivables)
  Ne jamais coder un lien en dur dans `Navbar.tsx` sans sa condition correspondante.
  **L'ordre des liens doit toujours refléter l'ordre de défilement des blocs sur le site** — ne jamais
  réorganiser sans vérifier l'ordre dans `Site.tsx`.

  **Comportement mobile (≤ 860px)** : les liens sont masqués et remplacés par un bouton burger
  (3 traits → croix à l'ouverture, état `open` en React). Le menu déroulant (`.nav-mobile`)
  s'affiche sous la navbar : liens en liste verticale séparés par des filets, bouton d'appel
  pleine largeur en bas. Un clic sur un lien ou le bouton ferme le menu. Le bouton d'appel
  desktop (`.nav-resa`, nom de classe conservé pour ne pas casser les `site.css` déjà
  livrés) reste visible en mobile à côté du burger. Ne jamais supprimer le burger
  pour revenir à `display:none` sur les liens — le restaurateur doit toujours pouvoir naviguer
  depuis son téléphone.
- **Notre cuisine (Histoire)** : libertés de composition et de traitement visuel, comme le hero. Bloc figé au build via les variables `VITE_STORY_*` (titre, texte, signature, mots-clés, image, eyebrow) — **non éditable dans l'admin**. Pensé pour être unique et porter l'identité du restaurateur. Son contenu vient de `clients/<slug>.json` (champ `story`) et **ne doit jamais être hérité d'un autre client** : repartir du modèle vierge `clients/_modele.json`.

### Bloc sur mesure : uniquement à la demande du client
Un bloc hors de la liste standard n'est **pas créé de notre propre initiative**. Il ne peut l'être que sur **demande explicite du client**, et reste alors une exception tracée pour ce client. Même dans ce cas, la règle d'or tient : si le bloc affiche du contenu destiné à évoluer, il doit recevoir une zone éditable correspondante dans l'admin.

### Images de contenu : éditables, avec repli (jamais figées au build)
Toute **image qui fait partie du contenu évolutif d'un bloc** (et non de l'habillage identitaire) doit être **éditable depuis l'admin** — uploadée dans un bucket Storage et mémorisée en base — et non figée via une variable `VITE_*` au build. C'est une application directe de la règle d'or : le restaurateur doit pouvoir la changer lui-même.
- **Toujours prévoir un repli** : si aucune image n'est renseignée, le bloc reste lisible et soigné (image identitaire de repli, ou mise en page alternative sans image). Une image manquante ne doit jamais casser ou vider le bloc.
- Exemple : l'image du **Plat du jour** (ardoise) est uploadée dans l'onglet « Ardoise du jour » et stockée dans `site_content.ardoise.image`. Repli : si aucune image n'est renseignée, le bloc s'affiche en pleine largeur, texte centré, **sans visuel** — il ne réutilise jamais l'image d'un autre bloc (montrer une photo qui n'est pas le plat serait trompeur). *(L'image figée au build n'est admise que pour les exceptions identitaires : hero et « Notre cuisine ».)*
  > **Alt de l'ardoise** : le texte alternatif de l'image n'est **pas** un champ de l'UI (le restaurateur n'a pas à le remplir). Il est dérivé automatiquement du nom du plat au moment de l'enregistrement (`image_alt = plat` si une image est présente). Le composant site `Ardoise.tsx` utilise `image_alt || plat` en secours.

### Interdits explicites
- Pas de section sur-mesure ajoutée **sans demande du client** (ex. « Sur le pouce », bandeau défilant, bloc « Et aussi », logo SVG spécifique inventés en cours de route).
- Pas d'ajout de champ, d'onglet ou de table hors de la liste ci-dessous sans décision explicite de faire évoluer **le gabarit entier** (donc tous les clients).

---

## Périmètre verrouillé

### Blocs du site public
Barre de navigation · Hero · Histoire · Carte (menu par catégories) · Plat du jour (ardoise) · À emporter · Galerie · Partenaires · Avis clients (carrousel) · Newsletter/actualités · Footer · Modale horaires · Popup promo.

> **Pages légales** : `/mentions-legales` et `/protection-des-donnees` (RGPD), liées depuis le footer. Leur contenu vient de `src/content/legal.generated.ts`, généré par le pipeline depuis le champ `legal` de la config client. Obligatoires pour un site collectant des données (inscriptions newsletter).
> **Blocs désactivables depuis l'admin** : Partenaires (`partners_enabled`), Avis (`reviews_enabled`), Newsletter (`newsletter_enabled`), Ardoise (champ `enabled`). Les toggles Partenaires/Avis sont dans leurs onglets ; le toggle Newsletter est dans « Site & accès ».

### Onglets de l'admin (`/gestion-a7x9k2`)
Les 14 onglets sont regroupés en 3 familles, avec un séparateur visuel dans le menu (champ `groupe` sur le premier onglet de chaque famille dans `AdminApp.tsx`) :
- **Pilotage** : Tableau de bord · Newsletter · Horaires (+ fermetures exceptionnelles)

> Le **Tableau de bord** est celui de la newsletter (`TabTableau.tsx`) : cartes d'indicateurs (inscrits actifs, désabonnés, campagnes envoyées, dernier envoi), courbe de croissance de la liste sur douze mois, origine des inscriptions (formulaire du site et liens tracés UTM) et historique des campagnes avec fiche statistiques. Il est **masqué quand le module Newsletter est coupé** (offre Essentiel seule) : il n'aurait alors rien à montrer. Tout est calculé depuis deux tables, `leads` et `newsletter_campaigns` — aucune autre requête.
- **Vitrine** : La carte · Ardoise du jour · Galerie · Avis clients · Partenaires · Réseaux sociaux · Bannière promo · À emporter
- **Paramètres** : Contacts · Site & accès · **Fonctionnalités** *(éditeur LTD uniquement)*
- **Éditeur LTD uniquement — onglet « Fonctionnalités »** (table `feature_flags`) : visible uniquement pour les comptes `@latable-digitale.fr`, détecté via `session.user.email` synchrone — jamais `getUser()` async qui cause un flash false. Permet d'activer/désactiver dynamiquement les onglets admin par client, sans redéploiement. **Un seul module depuis le retrait de la réservation : `newsletter`**, qui gouverne les onglets Tableau de bord, Newsletter et Contacts (voir `FEATURE_MAP` dans `AdminApp.tsx`) ainsi que le bloc newsletter du site (`site_content.newsletter_enabled`, propagé par `TabFeatures`). La RLS n'autorise l'écriture que pour les emails `@latable-digitale.fr`.

> Le bloc « Notre cuisine » (Histoire) **n'a plus d'onglet** : c'est une exception figée au build (variables `VITE_STORY_*`), au même titre que le hero. Il est unique et à l'image du restaurateur, défini à la création depuis `clients/<slug>.json` (champ `story`) — voir la règle d'or. L'image du **hero** comme celle de « Notre cuisine » sont figées au build (`VITE_HERO_IMAGE`, `VITE_STORY_IMAGE`).

---

## Architecture technique

### Stack
- **Front** : SPA React + TypeScript + Vite.
- **Back** : Supabase dédié par client (1 client = 1 repo + 1 projet Supabase). Isolation par projet, pas par tenant.
- **Auth admin** : Supabase Auth. L'accès admin est gardé par la fonction SQL `is_admin()`, qui vérifie l'appartenance de l'email connecté à la table `admin_users` (multi-admin : équipe, accueil, etc. — voir section dédiée plus bas).
- **Réinitialisation de mot de passe** (`src/pages/Admin.tsx`) : `resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })` envoie le lien. Le clic ramène une session de type recovery, détectée de deux façons complémentaires : (1) l'événement `PASSWORD_RECOVERY` de `onAuthStateChange`, et (2) **la présence de `type=recovery` dans l'URL** (hash ou query) lue au montage. La détection par URL est indispensable : l'événement peut être émis avant l'abonnement (race condition) et donc manqué, ce qui reconnectait l'utilisateur sans jamais afficher le formulaire — corrigé juillet 2026 **Sans écran dédié, l'app connecterait directement l'utilisateur sans jamais lui demander de nouveau mot de passe** : un état `recoveryMode` intercepte ce cas et affiche un formulaire « Nouveau mot de passe » avant `AdminApp`, qui appelle `supabase.auth.updateUser({ password })`. Le lien de récupération est à usage unique (`One-time token not found` si recliqué) : ne jamais déboguer en cliquant deux fois le même lien.

> **Piège à connaître, étape obligatoire pour chaque client** : le `redirectTo` envoyé par l'app est **ignoré** par Supabase si l'URL ne figure pas dans Authentication → URL Configuration → **Redirect URLs** du projet. Et le **Site URL** par défaut d'un nouveau projet Supabase est `http://localhost:3000` — tant qu'il n'est pas changé pour le vrai domaine du client, *tous* les liens d'email Auth (reset de mot de passe, confirmation) redirigent vers `localhost` et échouent silencieusement, quel que soit le code de l'app. Ce réglage vit dans le service Auth de Supabase, **pas dans la base de données** : aucune migration SQL ne peut le configurer, c'est une étape manuelle obligatoire dans le Dashboard pour chaque nouveau client (voir NOTES.md généré, section dédiée).
>
> **Second piège lié, même section** : le mailer par défaut de Supabase (utilisé pour les emails Auth — reset de mot de passe, confirmation) a une limite d'envoi très basse (quelques emails/heure), pensée pour les tests basiques. Tester le « mot de passe oublié » plusieurs fois de suite déclenche `429 over_email_send_rate_limit`, qui apparaît côté app comme un simple « Erreur lors de l'envoi. » sans plus de détail. Fortement recommandé : configurer un SMTP personnalisé (Project Settings → Authentication → SMTP Settings) avec le compte Resend déjà utilisé pour les emails de réservation — lève la limite et donne un expéditeur cohérent avec le reste. Comme pour les URLs de redirection, ce réglage n'est pas accessible via SQL/migration.
- **Emails** : edge function `send-newsletter` (Supabase) qui relaie vers Resend, pour les campagnes et l'email de bienvenue. Voir la section Newsletter pour le détail.
- **Hébergement** : Netlify (build `npm run build`, sortie `dist`, variables `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).

### Routes
- `/` — site public.
- `/gestion-a7x9k2` — interface d'administration (chemin volontairement non deviné).

### Tables Supabase
`menu_items`, `gallery_images`, `site_content`, `leads`, `promo_banner`, `partners`, `social_links`, `opening_hours`, `layout_settings`, `closure_periods`, `reviews`, `takeaway_items`, `feature_flags`, `admin_users`, `newsletter_campaigns`, `newsletter_sends`, `newsletter_events`, `newsletter_folders`.

Chaque table suit le même patron RLS : lecture publique (`anon`) sur les lignes actives, CRUD complet réservé à l'admin via `is_admin()`. La table `social_links` alimente les icônes de réseaux sociaux du footer (gérées dans l'onglet « Réseaux sociaux »). La table `reviews` alimente le carrousel d'avis affiché avant la newsletter (onglet « Avis clients », activable via le flag `reviews_enabled` de `site_content`).




> **Insertion publique de `leads` durcie, pas `with check (true)`** : un visiteur peut s'inscrire à la newsletter sans compte (c'est le but), mais la policy `anon insert` vérifie le contenu plutôt que d'accepter n'importe quoi — sinon n'importe qui peut forger une requête directe vers l'API REST, en dehors de l'app. Format d'e-mail contrôlé, et `source` contrainte à `newsletter` ou au motif tracé `newsletter:<slug>` (`[a-z0-9_-]{1,32}`) : l'anon ne peut pas écrire de texte libre. L'inscription passe de préférence par la fonction RPC `inscrire_newsletter_statut()`, car un upsert PostgREST échoue pour le rôle anon sans policy SELECT.

> **Piège de tri à connaître** : seules 5 tables ont une colonne `position` (`gallery_images`, `menu_items`, `partners`, `reviews`, `social_links`). Les helpers `fetchActive`/`useTable` trient par `position` par défaut **mais retombent sur une requête sans tri** si la colonne n'existe pas — ne jamais supposer qu'une table a `position`.

### Newsletter

- **Newsletter intégrée, sans outil tiers** : `leads` est la source de vérité unique (pas de synchronisation externe). Cinq edge functions dédiées : `send-newsletter` (envoi d'une campagne ou de l'email de bienvenue, verrou atomique anti-double-envoi), `newsletter-scheduler` (déclenche les campagnes planifiées échues, via pg_cron chaque minute, et envoie l'email de bienvenue côté serveur), `newsletter-unsubscribe` (désinscription par token, `leads.unsubscribe_token` → `consent=false` ; GET affiche une page de confirmation, seul POST désabonne — les scanners d'URL ne doivent pas désinscrire), `resend-webhook` (clics, bounces, plaintes → `newsletter_events`) et `assistant-newsletter` (rédaction assistée par IA). L'éditeur de campagne est un **éditeur de blocs libres** (pleine largeur / deux colonnes) avec aperçu en direct. **Vue de l'onglet** : les campagnes s'affichent en **grille de cartes** (objet, nb de destinataires, date, statut, menu ⋯) et peuvent être rangées dans des **dossiers** (colonne `newsletter_campaigns.folder` + table `newsletter_folders`, RLS `is_admin()`). L'**email de bienvenue** (template `welcome`, transactionnel) est présenté **à part** dans une section « Automatisation / Trigger » en haut de l'onglet, et **exclu de la grille** et des compteurs.
- **Assistant en deux étapes** : « 1 · Contenu » puis « 2 · Envoi ». Il n'y a **pas d'étape de ciblage** : depuis le retrait du CRM, il n'existe qu'un segment, `optin` (tous les inscrits consentants, hors adresses en bounce).
- **Trois miroirs obligatoires.** Le segment et la façon de compter ses destinataires sont écrits à trois endroits qui doivent rester cohérents, sinon le nombre affiché dans l'admin ne correspond pas aux envois réels : (1) `newsletter_segment_counts()` en base, (2) `getRecipients()` dans `send-newsletter/index.ts`, (3) la constante `SEGMENTS` dans `TabNewsletter.tsx`. Même règle pour la fonction `personnaliser()` (`{{prenom}}`), qui doit être un miroir exact entre l'aperçu (`TabNewsletter.tsx`) et l'envoi (`send-newsletter/index.ts`).
- **Garde d'accès de `send-newsletter`** : triple contrôle — JWT admin via `getUser` + lookup `admin_users`, OU header `X-Internal-Secret` (appel depuis `newsletter-scheduler`), sinon 403. Ne jamais en faire un relais d'e-mail ouvert.
- **Secret d'expédition** : `NEWSLETTER_FROM_EMAIL`, avec repli sur l'ancien `RESERVATION_FROM_EMAIL` pour les projets déjà déployés. Secrets et détail des fonctions : `supabase/functions/README.md`.
  > **Historique** : une intégration Mailchimp (`mailchimp-sync`) a existé mais a été retirée du gabarit (juillet 2026) au profit de ce système intégré — plus simple à dupliquer par client, sans compte tiers ni abonnement récurrent.

> **Mise en service des emails pour un nouveau client** (à faire une fois) : (1) déployer les fonctions (`supabase functions deploy send-newsletter --no-verify-jwt`, puis `newsletter-scheduler`, `newsletter-unsubscribe`, `resend-webhook`, `assistant-newsletter`, `extraire-carte` — ou via le dashboard) ; (2) renseigner les 3 secrets dans Supabase → Edge Functions → Manage secrets ; (3) côté Resend, **vérifier le domaine d'envoi** — sans domaine vérifié, on ne peut écrire qu'à l'adresse du compte Resend (utiliser `onboarding@resend.dev` comme `RESERVATION_FROM_EMAIL` pour les tests). Le front appelle la fonction via `sendReservationEmail()` dans `src/lib/supabase.ts`, qui n'interrompt jamais l'utilisateur en cas d'échec.

### Storage
Buckets publics `gallery`, `partners` et `menu`, écriture réservée à l'admin. Le bucket `menu` héberge la **carte téléchargeable** (PDF/PNG/JPG) ; l'URL du fichier est mémorisée dans `site_content` (clé `menu_file`).

### Carte & catégories
Les plats (`menu_items`) portent un champ `category` en **texte libre**. L'onglet « La carte » regroupe les plats par catégorie dynamiquement. Au formulaire d'un plat, le menu déroulant propose les catégories standard + celles déjà utilisées, plus une option « + Nouvelle catégorie… » qui révèle un champ texte : le restaurateur peut donc créer une catégorie sans intervention. Une catégorie existe tant qu'au moins un plat la référence (pas de table dédiée). L'onglet propose aussi une section **« Carte à télécharger »** : upload d'un fichier (PDF/PNG/JPG, max 10 Mo) dans le bucket `menu`, dont l'URL est stockée dans `site_content` (clé `menu_file`). Quand un fichier est présent, le bloc Carte du site affiche un bouton « Télécharger la carte » — en plus de la carte structurée, sans la remplacer.

> **Scan d'ardoise par IA (onglet « La carte »)** — Un bouton « 📷 Scanner une ardoise » permet au restaurateur de photographier son ardoise / sa carte : l'IA (Claude, vision) lit les plats, prix et descriptions, puis un **écran de validation** permet de relire/corriger/décocher avant insertion. Architecture : le composant `ScanArdoise.tsx` **compresse** la photo dans le navigateur (max 1568 px, JPEG 0.82 — maîtrise coût et vitesse) puis appelle l'edge function `extraire-carte` avec le **token de session admin**. L'edge function vérifie `is_admin()` (l'appel consomme de l'API payante), appelle l'API Anthropic en vision et renvoie un JSON `{plats:[{name,category,description,price}]}` — elle **n'écrit jamais en base**. C'est le front qui insère les plats validés, donc la RLS `is_admin()` de `menu_items` protège l'écriture. Les plats extraits sont insérés **masqués** (`is_active=false`) : le restaurateur les rend visibles après vérification, ce qui garantit qu'aucune lecture IA non relue n'apparaît sur le site. **Modèle IA** : lu depuis le secret `EXTRACTION_MODEL` (fallback `claude-haiku-4-5` dans le code) — changer de modèle = éditer un secret, sans redéploiement ni propagation. **Secret requis par client** : `ANTHROPIC_API_KEY` (voir SETUP-NOUVEAU-CLIENT.md). Sans clé, le bouton dégrade proprement (« clé non configurée »), aucun plantage. **Coût** : ~1 centime par photo (Haiku 4.5) ; usage moyen restaurateur ≈ 0,17 €/mois — négligeable. Le code vit dans `supabase/functions/extraire-carte/`.

---

## Pipeline de provisioning (kit séparé)

> **Réplication d'un nouveau client et mise à jour multi-clients** : voir `GESTION-MULTI-CLIENTS.md` à la racine du kit — procédures détaillées, registre des clients actifs, et garde-fou de cohérence `app-template/` ↔ `templates/app/`.

Un nouveau client se génère depuis le kit de provisioning, pas à la main :

- `clients/<slug>.json` — **source de vérité unique** d'un client (nom, contact, thème, email admin, horaires, légal, déploiement).
- `templates/app/` — **gabarit React complet** (site + admin) copié tel quel dans chaque client. C'est l'ossature commune ; on n'y touche que pour faire évoluer **tous** les clients.
- `scripts/new-client.mjs` — copie `templates/app/` dans `dist/<slug>/` puis écrit par-dessus les fichiers spécifiques au client : `src/theme.css` (palette rendue), `index.html` SEO, `public/robots.txt` + `public/sitemap.xml`, migrations SQL, mentions légales, `.env.example`, `deploy.sh`, `NOTES.md`. La sortie est une **app React buildable** (`npm install && npm run build`), pas un simple jeu d'assets.

### SEO (`index.html`, généré par `renderIndexHtml`)
Le JSON-LD (`schema.org/Restaurant`) inclut désormais, en plus de l'adresse/géoloc/cuisine/gamme de prix déjà présentes :
- **`openingHoursSpecification`** — généré automatiquement depuis `cfg.openingHours` (même parseur `parseSlots`/`dayNum` que le seed SQL, donc toujours synchronisé). Une entrée par service ouvert (midi/soir séparés), jours fermés omis. Aucune saisie supplémentaire requise.
- **`image`** — optionnel, depuis `cfg.seoImage` (URL absolue). Omis si absent du JSON client.
- **`sameAs`** — optionnel, depuis `cfg.social` (tableau d'URLs Instagram/Facebook/etc.). Omis si absent.
- **`acceptsReservations`** — depuis `cfg.reservation.enabled`.

> **Piège à connaître** : `seoImage` et `social` sont des **instantanés figés au build**, comme le hero. Si le restaurateur change ses réseaux sociaux depuis l'admin (onglet « Réseaux sociaux », qui édite la table `social_links`), le JSON-LD de `index.html` ne se met **pas** à jour automatiquement — il faudrait régénérer et redéployer le site. Le footer du site, lui, lit `social_links` en direct et reste toujours à jour ; seul le JSON-LD statique est concerné par ce piège.

`public/robots.txt` et `public/sitemap.xml` sont générés à partir de `templates/robots.txt`/`templates/sitemap.xml` (placeholder `{{DOMAIN}}`). Le sitemap liste les 3 routes statiques du site (`/`, `/mentions-legales`, `/protection-des-donnees`). Vite copie tout le contenu de `public/` à la racine de `dist/` au build, donc ces fichiers sont servis automatiquement sans configuration supplémentaire.
- `scripts/update-client.mjs` — propage les évolutions du gabarit vers les repos clients existants.
- `scripts/setup-demo.sh` / `.ps1` — provisionne un projet Supabase de démo (schéma + seed + compte admin).

**Important** : le premier compte admin (`admin_users`) est injecté au schéma depuis `clients/<slug>.json` (champ `admin.email`), et doit correspondre au compte créé dans Supabase Auth pour ce client (sinon le RLS bloque tout le CRUD au premier lancement). Une fois ce premier accès en place, d'autres comptes admin peuvent être ajoutés **directement depuis l'admin** (onglet « Réservations & site » → section « Comptes admin »), sans intervention technique — voir la section *Comptes admin (multi-admin)* ci-dessous.

### Comptes admin (multi-admin)
La table `admin_users` (`email`, `label`) liste les emails autorisés à se connecter à l'administration. `is_admin()` (SECURITY DEFINER) vérifie que l'email Supabase Auth connecté figure dans cette table — elle bypasse sa propre RLS en interne, donc pas de blocage circulaire. RLS sur `admin_users` : seuls les admins déjà reconnus peuvent lire/écrire la liste (`for all to authenticated using (is_admin())`), aucun accès anonyme.

L'onglet « Site & accès » permet d'ajouter/retirer un accès admin (garde-fou : impossible de retirer le dernier admin restant, confirmation obligatoire avant suppression via `useConfirm()`). **Ajouter un email dans `admin_users` ne crée pas de compte de connexion** : la personne doit d'abord exister comme utilisateur Supabase Auth avec ce même email (Dashboard → Authentication → Users → Add user) — pas de création de compte depuis le front, ça demanderait la clé `service_role` qui ne doit jamais y figurer. `admin_users` est propagée à chaque nouveau client via `schema.sql`, qui insère **deux admins par défaut** : le restaurateur (placeholder `{{ADMIN_EMAIL}}`, substitué depuis `clients/<slug>.json`) et le studio (`admin@latable-digitale.fr`, `bourgeois.v92@gmail.com`). ⚠️ Un email présent dans `admin_users` sans compte Auth correspondant donne un admin **vide sans erreur** : `is_admin()` renvoie `false` silencieusement (constaté en prod, juillet 2026).

### Charte d'un client
Définie dans `clients/<slug>.json` → champ `theme`. L'accent (`accent`, `accentLight`, `accentDark`) est obligatoire ; les neutres (`ink`, `inkSoft`, `cream`, `cream2`, `line`, `gold`) et les polices (`fontDisplay`, `fontBody`, `fontsUrl`) sont optionnels et ont des valeurs par défaut. Le tout est rendu dans `src/theme.css` (bloc `:root`) par `new-client.mjs`. Le `templates/app/src/theme.css.tmpl` (à placeholders) sert de gabarit ; il est remplacé par le `theme.css` rendu à la génération — il ne doit jamais finir tel quel dans un client (sinon `var(--accent)` est invalide et les boutons s'affichent sans couleur).

**Règle : jamais de couleur en dur.** Tout code (site comme admin) doit utiliser les variables CSS (`var(--accent)`, `var(--encre)`, `var(--sable)`, `var(--attente)`, etc.), y compris dans les `style="..."` inline et les valeurs injectées en JS. Une couleur hexadécimale écrite en dur ne suit pas la charte du client lors d'une dérivation et réapparaît avec la teinte du gabarit d'origine — c'est un bug. Si une teinte manque, l'ajouter comme variable dans `:root` plutôt que de la coder en dur.

**Interface d'administration : palette neutre, identique pour tous les clients.** L'admin (`pages/admin.css`) ne suit **pas** l'accent du restaurant : elle utilise la palette du kit « La Table Digitale » (bordeaux `#7a1f24` + encre `#1d1a16`) via des variables dédiées `--admin-accent` / `--admin-accent-dark` / `--admin-accent-light` / `--admin-ink` (+ déclinaisons `--admin-accent-0XX`), définies en tête de `admin.css` sur `.app` et `.login-wrap`. Les fonds sombres (bandeau latéral, écran de login, encart ardoise) utilisent `--admin-ink` et non plus `var(--ink)` du client. Seul le nom du restaurant varie dans l'admin (`VITE_RESTO_NAME`). **Ne jamais réintroduire `var(--accent)` dans l'admin**, à une exception près : l'aperçu du bandeau promo (`.promo-apercu .promo-entete`) garde `var(--accent)` pour refléter fidèlement le rendu côté site. Le bloc public, lui, continue d'utiliser l'accent du client.

**`admin.css` — architecture modulaire, préfixes stricts.** Le fichier est organisé en sections numérotées avec préfixes de classe garantissant qu'un changement dans un onglet ne casse pas les autres : `02` layout (`.app .side .main`), `03` composants partagés (`.bloc .stat .toggle .btn`), `04` login (`.login-*`), `05` tableau de bord, `06` horaires (`.tab-horaires .ferm-*`), `07` autres onglets, `08` habillage éditorial (`.adm-vit`), `09` newsletter (`.nl-*`), et le bloc mobile ≤820px regroupé en fin de fichier. Les sections `06` plan de service (`.ps-*`), `07` plan de salle (`.tp-*`), `09` CRM (`.cli-*`) et `10` widget de réservation ont été **retirées** avec le module Réservation. Les classes propres à l'admin doivent être préfixées `adm-` pour éviter les collisions avec `site.css` (la collision `.pa-visuel` a servi de leçon).

**Logo éditeur « La Table Digitale » dans l'admin.** Le bandeau latéral affiche, sous le titre « `<Nom du restaurant>` Administration », le **logo La Table Digitale** (marque de l'éditeur), en **blanc** sur le fond sombre du bandeau. C'est un élément **fixe et identique pour tous les clients** : le SVG est inline dans `AdminApp.tsx` (`.side-marque`). Chaque admin porte donc le nom du restaurateur **et** ce logo éditeur. Ne pas le retirer ni le rendre éditable — il identifie l'auteur de la solution, au même titre que la palette admin neutre.

---

## Avant de livrer une modification

1. Le changement reste-t-il dans le périmètre verrouillé ? Les seules libertés hors charte/mise en page sont le **hero**, le **menu de navigation** et le bloc **« Notre cuisine »** (tous trois figés au build, non éditables).
2. S'agit-il d'un bloc sur mesure ? Si oui, a-t-il été **explicitement demandé par le client** ? (sinon : ne pas le créer)
3. Tout bloc visible affichant du contenu évolutif a-t-il bien une zone éditable correspondante dans l'admin ? (seules exceptions admises : hero, menu de navigation et « Notre cuisine », non éditables par nature — figés au build)
4. La modification est-elle de la charte, de la mise en page ou du contenu — et non un nouveau bloc improvisé ?
