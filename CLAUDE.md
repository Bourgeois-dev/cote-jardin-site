# CLAUDE.md — Site vitrine restaurateur (gabarit)

Ce fichier est lu en priorité par Claude. Il décrit l'architecture du projet **et** le périmètre à respecter impérativement. À lire avant toute modification.

---

## ⚠️ Règle d'or (à ne jamais enfreindre)

> **Tout bloc affiché sur le site doit être éditable depuis l'admin. On ne crée jamais de nouveau bloc pour un client.**

> **Principe directeur : « blocs éditables identiques sur le FOND, uniques sur la FORME ».**
> Le **fond** ne change jamais d'un client à l'autre : la liste des blocs du site, la liste des onglets de l'admin, les champs de chaque formulaire (ex. la newsletter expose toujours Prénom, Nom et Email — Prénom/Nom facultatifs, Email obligatoire), et la correspondance bloc ↔ table. La **forme** est libre et propre à chaque client : la charte (`theme.css`), la mise en page / le style (CSS), et le contenu (textes, photos, qui viennent de la base). Vérifiable par `node scripts/check-fond.mjs` (voir GESTION-MULTI-CLIENTS.md, section 7).

Ce projet est un **gabarit dupliqué à l'identique** pour chaque restaurant. Le gabarit technique commun est `templates/app/` (le code copié tel quel pour chaque client) ; **Opaline** en est l'implémentation de référence — le client le plus complet, qui illustre l'ensemble des fonctionnalités du gabarit. Pour un nouveau client, on ne change que :

1. **La charte** — couleurs, typographies, formes, ombres, icônes.
2. **La mise en page** — agencement et style visuel des blocs existants.
3. **Le contenu** — textes, plats, photos, horaires… (vient de la base du client ; remplir un bloc n'est pas en créer un).

Ce qui ne change **jamais** : la liste des blocs du site, la liste des onglets/champs de l'admin, et la correspondance 1:1 entre bloc affiché et zone éditable.

Si un bloc n'a pas de pendant éditable dans l'admin, **il ne doit pas exister sur le site** : le restaurateur doit pouvoir mettre à jour 100 % du contenu *évolutif* qu'il affiche. C'est ce qui rend la solution duplicable en série.

**Seules exceptions :** le hero, le menu de navigation et le bloc « Notre cuisine » (Histoire). Ils ne figurent pas dans l'admin et ne sont pas éditables — leur contenu est défini une fois à la création du site et figé au build. C'est admis parce qu'ils portent l'identité du restaurant (accroche, navigation, récit de la maison) plutôt qu'un contenu opérationnel destiné à changer souvent, contrairement à la carte, l'ardoise ou les horaires. Le bloc « Notre cuisine » est volontairement **unique et à l'image du restaurateur** : on s'autorise des libertés de composition dessus, comme pour le hero.

### Libertés permises
- **Hero** : libertés créatives **totales** sur la structure, la composition, la mise en page et le traitement visuel. C'est l'accroche qui porte l'identité du restaurant, **conçue sur mesure pour chaque client**. **Le hero ne figure pas dans l'admin : son contenu (texte d'accroche, visuel) est défini à la création du site et figé au build — le restaurateur ne le modifie pas.** Il n'affiche donc pas de contenu destiné à évoluer, ce qui est cohérent avec la règle d'or. **Le hero est propre à chaque client, dans sa STRUCTURE comme dans son CONTENU** : sa mise en page (une image plein écran, un split, un diaporama, une vidéo…), ses textes et ses images sont uniques. La structure « deux visages » (split 2 images + carte centrale) est celle d'**Opaline** (concept bistrot midi / gastro soir) — c'est un *exemple*, **pas un gabarit imposé** : un autre restaurant aura une tout autre structure de hero. **Ne jamais réutiliser le hero (structure, textes ou images) d'Opaline ou d'un autre restaurant comme valeur par défaut** — le hero se code spécifiquement pour le client (composant `Hero.tsx` adapté + variables `VITE_HERO_*` propres à sa structure). Partir de `clients/_modele.json` (vierge), jamais d'`opaline.json`.
- **Menu de navigation** : libertés sur le style et la disposition. Non éditable non plus — défini à la création.
- **Notre cuisine (Histoire)** : libertés de composition et de traitement visuel, comme le hero. Bloc figé au build via les variables `VITE_STORY_*` (titre, texte, signature, mots-clés, image, eyebrow) — **non éditable dans l'admin**. Pensé pour être unique et porter l'identité du restaurateur. Son contenu vient de `clients/<slug>.json` (champ `story`) et **ne doit jamais être hérité d'un autre client** : repartir du modèle vierge `clients/_modele.json`.

### Bloc sur mesure : uniquement à la demande du client
Un bloc hors de la liste standard n'est **pas créé de notre propre initiative**. Il ne peut l'être que sur **demande explicite du client**, et reste alors une exception tracée pour ce client. Même dans ce cas, la règle d'or tient : si le bloc affiche du contenu destiné à évoluer, il doit recevoir une zone éditable correspondante dans l'admin.

### Images de contenu : éditables, avec repli (jamais figées au build)
Toute **image qui fait partie du contenu évolutif d'un bloc** (et non de l'habillage identitaire) doit être **éditable depuis l'admin** — uploadée dans un bucket Storage et mémorisée en base — et non figée via une variable `VITE_*` au build. C'est une application directe de la règle d'or : le restaurateur doit pouvoir la changer lui-même.
- **Toujours prévoir un repli** : si aucune image n'est renseignée, le bloc reste lisible et soigné (image identitaire de repli, ou mise en page alternative sans image). Une image manquante ne doit jamais casser ou vider le bloc.
- Exemple : l'image du **Plat du jour** (ardoise) est uploadée dans l'onglet « Ardoise du jour » et stockée dans `site_content.ardoise.image`. Repli : si aucune image n'est renseignée, le bloc s'affiche en pleine largeur, texte centré, **sans visuel** — il ne réutilise jamais l'image d'un autre bloc (montrer une photo qui n'est pas le plat serait trompeur). *(L'image figée au build n'est admise que pour les exceptions identitaires : hero et « Notre cuisine ».)*

### Interdits explicites
- Pas de section sur-mesure ajoutée **sans demande du client** (ex. « Sur le pouce », bandeau défilant, bloc « Et aussi », logo SVG spécifique inventés en cours de route).
- Pas d'ajout de champ, d'onglet ou de table hors de la liste ci-dessous sans décision explicite de faire évoluer **le gabarit entier** (donc tous les clients).

---

## Périmètre verrouillé

### Blocs du site public
Barre de navigation · Hero · Histoire · Carte (menu par catégories) · Plat du jour (ardoise) · Galerie · Partenaires · Avis clients (carrousel) · Newsletter/actualités · Footer · Modale horaires · Widget de réservation.

> **Pages légales** : `/mentions-legales` et `/protection-des-donnees` (RGPD), liées depuis le footer. Leur contenu vient de `src/content/legal.generated.ts`, généré par le pipeline depuis le champ `legal` de la config client. Obligatoires pour un site collectant des données (newsletter, réservations).
> **Blocs désactivables depuis l'admin** : Partenaires (`partners_enabled`), Avis (`reviews_enabled`), Newsletter (`newsletter_enabled`), Ardoise (champ `enabled`). Les toggles Partenaires/Avis sont dans leurs onglets ; le toggle Newsletter est dans « Réservations & site ».

### Onglets de l'admin (`/gestion-a7x9k2`)
Les 14 onglets sont regroupés en 3 familles, avec un séparateur visuel dans le menu (champ `groupe` sur le premier onglet de chaque famille dans `AdminApp.tsx`) :
- **Service** : Tableau de bord · Réservations · Plan de salle · Horaires (+ fermetures exceptionnelles) · Clients

> Le **Tableau de bord** affiche la disponibilité par service (midi/soir) sur toute la durée de l'**horizon de réservation** (`reservation_settings.booking_horizon_days`, réglable dans « Réservations & site ») — pas un nombre de jours figé. Le tableau défile verticalement (en-tête collant) puisque l'horizon peut atteindre 60 jours ou plus. Ses statistiques (couverts du jour, disponibilité) sont en **temps réel** (`useTable("reservations", ..., true)`) : pensé pour rester ouvert sur un écran d'accueil, il se met à jour seul à l'arrivée d'une réservation, sans changer d'onglet.
- **Vitrine** : La carte · Ardoise du jour · Galerie · Avis clients · Partenaires · Réseaux sociaux · Bannière promo
- **Paramètres** : Contacts · Réservations & site

> Le bloc « Notre cuisine » (Histoire) **n'a plus d'onglet** : c'est une exception figée au build (variables `VITE_STORY_*`), au même titre que le hero. Il est unique et à l'image du restaurateur, défini à la création depuis `clients/<slug>.json` (champ `story`) — voir la règle d'or. L'image du **hero** comme celle de « Notre cuisine » sont figées au build (`VITE_HERO_IMAGE`, `VITE_STORY_IMAGE`).

---

## Architecture technique

### Stack
- **Front** : SPA React + TypeScript + Vite.
- **Back** : Supabase dédié par client (1 client = 1 repo + 1 projet Supabase). Isolation par projet, pas par tenant.
- **Auth admin** : Supabase Auth. L'accès admin est gardé par la fonction SQL `is_admin()`, qui vérifie l'appartenance de l'email connecté à la table `admin_users` (multi-admin : équipe, accueil, etc. — voir section dédiée plus bas).
- **Réinitialisation de mot de passe** (`src/pages/Admin.tsx`) : `resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })` envoie le lien. Le clic ramène une session de type recovery, détectée via `onAuthStateChange` (événement `PASSWORD_RECOVERY` — géré nativement par le client Supabase, `detectSessionInUrl` par défaut). **Sans écran dédié, l'app connecterait directement l'utilisateur sans jamais lui demander de nouveau mot de passe** : un état `recoveryMode` intercepte ce cas et affiche un formulaire « Nouveau mot de passe » avant `AdminApp`, qui appelle `supabase.auth.updateUser({ password })`. Le lien de récupération est à usage unique (`One-time token not found` si recliqué) : ne jamais déboguer en cliquant deux fois le même lien.

> **Piège à connaître, étape obligatoire pour chaque client** : le `redirectTo` envoyé par l'app est **ignoré** par Supabase si l'URL ne figure pas dans Authentication → URL Configuration → **Redirect URLs** du projet. Et le **Site URL** par défaut d'un nouveau projet Supabase est `http://localhost:3000` — tant qu'il n'est pas changé pour le vrai domaine du client, *tous* les liens d'email Auth (reset de mot de passe, confirmation) redirigent vers `localhost` et échouent silencieusement, quel que soit le code de l'app. Ce réglage vit dans le service Auth de Supabase, **pas dans la base de données** : aucune migration SQL ne peut le configurer, c'est une étape manuelle obligatoire dans le Dashboard pour chaque nouveau client (voir NOTES.md généré, section dédiée).
>
> **Second piège lié, même section** : le mailer par défaut de Supabase (utilisé pour les emails Auth — reset de mot de passe, confirmation) a une limite d'envoi très basse (quelques emails/heure), pensée pour les tests basiques. Tester le « mot de passe oublié » plusieurs fois de suite déclenche `429 over_email_send_rate_limit`, qui apparaît côté app comme un simple « Erreur lors de l'envoi. » sans plus de détail. Fortement recommandé : configurer un SMTP personnalisé (Project Settings → Authentication → SMTP Settings) avec le compte Resend déjà utilisé pour les emails de réservation — lève la limite et donne un expéditeur cohérent avec le reste. Comme pour les URLs de redirection, ce réglage n'est pas accessible via SQL/migration.
- **Emails** : edge function `reservation-email` (Supabase) qui relaie vers Resend, pour l'accusé de réception et la confirmation de réservation. Voir la section Réservation pour le détail.
- **Hébergement** : Netlify (build `npm run build`, sortie `dist`, variables `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).

### Routes
- `/` — site public.
- `/gestion-a7x9k2` — interface d'administration (chemin volontairement non deviné).

### Tables Supabase
`menu_items`, `gallery_images`, `site_content`, `leads`, `promo_banner`, `partners`, `social_links`, `opening_hours`, `layout_settings`, `reservation_settings`, `restaurant_tables`, `dining_areas`, `reservations`, `closure_periods`, `reviews`, `customers`.

Chaque table suit le même patron RLS : lecture publique (`anon`) sur les lignes actives, CRUD complet réservé à l'admin via `is_admin()`. La table `social_links` alimente les icônes de réseaux sociaux du footer (gérées dans l'onglet « Réseaux sociaux »). La table `reviews` alimente le carrousel d'avis affiché avant la newsletter (onglet « Avis clients », activable via le flag `reviews_enabled` de `site_content`).

> **Fiches client (CRM)** — onglet « Clients » (famille Service). La table `customers` historise chaque client : coordonnées, statut VIP, notes durables (allergies, préférences), et des compteurs **dérivés** (nb de réservations, couverts cumulés, no-shows, annulations, première/dernière venue). Ces compteurs ne sont jamais saisis à la main : un trigger SQL `SECURITY DEFINER` (`attach_customer` en BEFORE + `refresh_customer_counters` en AFTER sur `reservations`) rattache automatiquement chaque réservation à un client (recherche par e-mail, puis téléphone en repli ; crée la fiche si aucun match) et recalcule les compteurs à chaque insert/update/delete. Le widget public (`anon`) ne touche jamais `customers` directement — c'est le trigger, en `SECURITY DEFINER`, qui écrit pour lui ; `customers` est donc en RLS admin seule. La colonne `reservations.customer_id` porte le lien. Toute insertion de réservation (site ou téléphone) alimente le CRM sans code applicatif supplémentaire. Pour un client déjà en production, la migration `migrations/migration-customers.sql` crée la table, les triggers, et **backfille** l'historique existant.

> **Insertions publiques (`leads`, `reservations`) durcies, pas `with check (true)`** : un visiteur peut créer un lead ou une réservation sans compte (c'est le but), mais la policy `anon insert` vérifie désormais le contenu plutôt que d'accepter n'importe quoi — sinon n'importe qui peut forger une requête directe vers l'API REST (en dehors de l'app) et, par exemple, s'auto-confirmer une réservation ou squatter une table. Sur `leads` : format email valide + `source` limité à `('newsletter','reservation')`. Sur `reservations` : `status` forcé à `'attente'`, `source` forcé à `'site'` (la source `'telephone'` reste réservée à l'admin via la policy `admin all`), `table_id` doit être `null` (seul l'admin assigne une table), `covers > 0`, nom et téléphone non vides. Si une évolution future a besoin d'élargir ce que le public peut envoyer, mettre à jour le `WITH CHECK` en conséquence plutôt que de revenir à `true`.

`restaurant_tables` est éditée via un **plan de salle visuel** (onglet « Plan de salle ») : tables glissables à la souris/tactile, position persistée dans `pos_x`/`pos_y`, sélection au clic pour éditer nom/forme/capacité/zone. Les tables sont réparties en **zones** (`dining_areas` : Salle, Terrasse…), gérables depuis l'onglet (créer/renommer/supprimer) ; chaque table porte un `area_id`. Le Plan de service propose un sélecteur de zone pour l'attribution. `opening_hours` est éditable directement (champs heure midi/soir par jour, onglet « Horaires ») ; un créneau vide = pas de service à ce moment-là.

> **Piège de tri à connaître** : seules 5 tables ont une colonne `position` (`gallery_images`, `menu_items`, `partners`, `reviews`, `social_links`). Les helpers `fetchActive`/`useTable` trient par `position` par défaut **mais retombent sur une requête sans tri** si la colonne n'existe pas — ne jamais supposer qu'une table a `position`.

### Réservation
- Créneaux filtrés par `opening_hours` (jours fermés masqués) et par `closure_periods` (périodes de fermeture bloquées, avec message personnalisé).
- **Horodatage des demandes (`created_at`)** : exploité à deux endroits. Dans le Plan de service, les demandes en attente issues du site affichent « Demande reçue il y a X » et la liste « À placer » est triée par ancienneté (ordre d'arrivée). Dans le Tableau de bord, une section « Quand vos clients réservent en ligne » trace un histogramme des heures de création des réservations en ligne (+ créneau et jour les plus actifs). Ces deux usages ne concernent que `source='site'` (l'horodatage d'une saisie téléphone reflète le moment de la saisie, pas le choix du client). Aucune donnée nouvelle : `created_at` existe déjà sur `reservations`.
- **Attribution des tables (regroupement possible)** : une réservation peut occuper **plusieurs tables** (ex. 2+2 pour 4 couverts), pour rester cohérent avec la dispo en ligne. Modèle : colonne `reservations.table_ids uuid[]` (liste) ; `reservations.table_id` reste = première table (compat affichage/carnet), maintenu en phase par le trigger `sync_table_id`. Dans le Plan de service, glisser une réservation sur une table l'**ajoute** à ses tables ; reglisser sur une table déjà attribuée la **retire**. Une réservation n'est « placée » que si la somme des capacités de ses tables ≥ couverts ; sinon elle reste « à placer » avec l'indication des places manquantes. Pour un client déjà en production : `migrations/migration-regroupement-tables.sql` (après `migration-check-availability.sql`).
- Une réservation bloque ses tables 1h30. L'onglet Réservations offre deux vues : **Carnet** (vision multi-jours : recherche par nom/téléphone/email, filtres à venir/passées/toutes, tri par date, colonne Table(s), confirmer/annuler — lecture et suivi de l'historique, pas de saisie) et **Plan de service** (vue par défaut, par jour + service midi/soir, **bandeau récap** Jour/Midi/Soir avec couverts réservés et places restantes par service, réservations à gauche, plan de salle à droite, **attribution des tables par glisser-déposer (avec regroupement)**, sélecteur de zone, confirmation d'une réservation en attente via « ✓ Confirmer », **panneau de saisie téléphone intégré** qui recouvre la colonne de gauche tout en gardant le plan visible).
- Au-delà d'un seuil de couverts (`reservation_settings.phone_threshold`), bascule vers une réservation par téléphone. Deux autres réglages dans « Réservations & site » : `min_advance_hours` (délai minimum avant le créneau, défaut 2h) et `booking_horizon_days` (jusqu'à combien de jours à l'avance on peut réserver, défaut 60) — le widget borne le champ date entre aujourd'hui+délai et aujourd'hui+horizon.
- Activable/désactivable via `reservation_settings.enabled` (onglet « Réservations & site »). Quand c'est désactivé, le widget n'est pas monté et les boutons « Réserver » (nav, hero, bouton flottant) deviennent « Appeler » (lien `tel:`). Sans numéro renseigné, le bouton disparaît.
- L'admin peut aussi **saisir une réservation téléphonique**, uniquement depuis le **Plan de service** (bouton « + Réservation téléphone » → panneau intégré). Le panneau **vérifie le créneau d'ouverture** (jour fermé ou heure hors service) via `opening_hours` ; un avertissement s'affiche et il faut cliquer une seconde fois sur « Enregistrer malgré tout » pour forcer — le restaurateur reste maître, mais ne peut plus enregistrer hors créneau par inadvertance (l'heure pré-remplie suit le service affiché, ce qui peut être invalide si ce service est fermé ce jour-là, d'où l'utilité du contrôle). Créée directement en statut `confirme`, avec `source = 'telephone'` (les réservations du site ont `source = 'site'`). **Important** : la colonne `email` de `reservations` est NOT NULL — toujours envoyer une chaîne vide `""` plutôt que `null` quand l'email n'est pas renseigné, sous peine d'erreur Postgres à l'insertion. Email de confirmation envoyé seulement si une adresse est renseignée. Le tableau de bord et la disponibilité par service comptent toutes les réservations non annulées, quelle que soit leur origine.
- **Statut `no_show`** (« absent », client qui n'a pas honoré sa réservation) : 4e statut possible sur `reservations.status` (avec `attente`/`confirme`/`annule`), pas de contrainte CHECK en base donc aucune migration nécessaire pour l'ajouter. Bouton « Marquer absent » disponible dans le Plan de service et le Carnet, **avec confirmation obligatoire** (via `useConfirm()`/`Confirm.tsx`, comme toutes les actions destructrices de l'admin — jamais de `window.confirm`). Une réservation `no_show` sort automatiquement de « À placer » (personne ne viendra plus) mais reste visible si déjà placée (pour libérer la table).
- **Indicateurs** (section du tableau de bord) : taux d'annulation, taux de no-show, taille de groupe moyenne (30 derniers jours), taux de clients récurrents par téléphone et jour de la semaine le plus demandé (historique complet) — tous calculés côté client à partir des réservations déjà chargées, sans requête supplémentaire. **Pas de suivi du chiffre d'affaires** : volontairement hors périmètre du kit (retiré après test — la solution ne vise pas la gestion financière du restaurant, pas de caisse/POS connectée).
- **Temps réel & notification** : la table `reservations` est publiée dans `supabase_realtime`. Les vues de réservation (`useTable(..., realtime=true)`) se rafraîchissent seules quand une demande arrive. L'admin affiche une **pastille** sur l'onglet « Réservations » comptant les demandes en attente (mise à jour en direct). L'onglet a deux vues spécialisées : le **Plan de service** (vue par défaut, orientée jour J : un jour + service midi/soir, colonnes à parts égales, attribution des tables par glisser-déposer, sélecteur de zone, confirmation d'une réservation en attente directement sur sa carte via « ✓ Confirmer », bouton réservation téléphone) et le **Carnet** (vision multi-jours : recherche par nom/téléphone/email, filtres à venir/passées/toutes, tri par date, colonne Table, confirmer/annuler — c'est la mémoire et l'historique, là où le plan est centré sur le présent). Dans le Plan de service, le filtre « En attente » ignore le service midi/soir et liste toute la journée (anti-oubli).
- Opt-in newsletter possible à la réservation → alimente `leads`. Proposé seulement si `reservation_settings.newsletter_optin` est activé (toggle dans « Réservations & site », visible uniquement quand la réservation en ligne est active). Le formulaire newsletter refuse un e-mail déjà inscrit (contrainte d'unicité `leads.email`, message dédié côté site).
- **Emails de réservation** : edge function `reservation-email` (Supabase) qui appelle Resend. Deux envois — un accusé de réception au client à la création de la demande (depuis le widget), une confirmation quand l'admin passe la réservation à « confirmé » (onglet Réservations). La fonction est en `verify_jwt: false` (appelable par le widget public) et lit 3 secrets : `RESEND_API_KEY`, `RESERVATION_FROM_EMAIL`, `RESTO_NAME`. L'envoi n'interrompt jamais le flux : un échec d'email est logué sans bloquer l'utilisateur. Le code vit dans `supabase/functions/reservation-email/`.
- **CRM / Mailchimp** : edge function `mailchimp-sync` (Supabase, `verify_jwt: false`) qui pousse un contact dans une audience Mailchimp via l'API (upsert par hash MD5 de l'email, `status_if_new: subscribed` pour déclencher l'automation Welcome côté Mailchimp). Appelée par le helper `syncToMailchimp()` après chaque inscription newsletter et chaque opt-in à la réservation, en parallèle de l'insert dans `leads` (la table reste la source de vérité ; Mailchimp est le canal d'envoi). Lit 3 secrets : `MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID`, `MAILCHIMP_DC` (datacenter, ex. `us21` — sinon déduit du suffixe de la clé). L'email de bienvenue et les campagnes sont gérés dans Mailchimp, pas dans l'app. Code dans `supabase/functions/mailchimp-sync/`.

> **Mise en service des emails pour un nouveau client** (à faire une fois) : (1) déployer la fonction (`supabase functions deploy reservation-email --no-verify-jwt`, ou via le dashboard) ; (2) renseigner les 3 secrets dans Supabase → Edge Functions → Manage secrets ; (3) côté Resend, **vérifier le domaine d'envoi** — sans domaine vérifié, on ne peut écrire qu'à l'adresse du compte Resend (utiliser `onboarding@resend.dev` comme `RESERVATION_FROM_EMAIL` pour les tests). Le front appelle la fonction via `sendReservationEmail()` dans `src/lib/supabase.ts`, qui n'interrompt jamais l'utilisateur en cas d'échec.

### Storage
Buckets publics `gallery`, `partners` et `menu`, écriture réservée à l'admin. Le bucket `menu` héberge la **carte téléchargeable** (PDF/PNG/JPG) ; l'URL du fichier est mémorisée dans `site_content` (clé `menu_file`).

### Carte & catégories
Les plats (`menu_items`) portent un champ `category` en **texte libre**. L'onglet « La carte » regroupe les plats par catégorie dynamiquement. Au formulaire d'un plat, le menu déroulant propose les catégories standard + celles déjà utilisées, plus une option « + Nouvelle catégorie… » qui révèle un champ texte : le restaurateur peut donc créer une catégorie sans intervention. Une catégorie existe tant qu'au moins un plat la référence (pas de table dédiée). L'onglet propose aussi une section **« Carte à télécharger »** : upload d'un fichier (PDF/PNG/JPG, max 10 Mo) dans le bucket `menu`, dont l'URL est stockée dans `site_content` (clé `menu_file`). Quand un fichier est présent, le bloc Carte du site affiche un bouton « Télécharger la carte » — en plus de la carte structurée, sans la remplacer.

---

## Pipeline de provisioning (kit séparé)

> **Réplication d'un nouveau client et mise à jour multi-clients** : voir `GESTION-MULTI-CLIENTS.md` à la racine du kit — procédures détaillées, registre des clients actifs, et garde-fou de cohérence `app-template/` ↔ `templates/app/`.

Un nouveau client se génère depuis le kit de provisioning, pas à la main :

- `clients/<slug>.json` — **source de vérité unique** d'un client (nom, contact, thème, email admin, horaires, réservation, légal, déploiement).
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

L'onglet « Réservations & site » permet d'ajouter/retirer un accès admin (garde-fou : impossible de retirer le dernier admin restant, confirmation obligatoire avant suppression via `useConfirm()`). **Ajouter un email dans `admin_users` ne crée pas de compte de connexion** : la personne doit d'abord exister comme utilisateur Supabase Auth avec ce même email (Dashboard → Authentication → Users → Add user) — pas de création de compte depuis le front, ça demanderait la clé `service_role` qui ne doit jamais y figurer. `admin_users` est propagée à chaque nouveau client via `schema.sql` (placeholder `{{ADMIN_EMAIL}}`, substitué depuis `clients/<slug>.json`).

### Charte d'un client
Définie dans `clients/<slug>.json` → champ `theme`. L'accent (`accent`, `accentLight`, `accentDark`) est obligatoire ; les neutres (`ink`, `inkSoft`, `cream`, `cream2`, `line`, `gold`) et les polices (`fontDisplay`, `fontBody`, `fontsUrl`) sont optionnels et ont des valeurs par défaut. Le tout est rendu dans `src/theme.css` (bloc `:root`) par `new-client.mjs`. Le `templates/app/src/theme.css.tmpl` (à placeholders) sert de gabarit ; il est remplacé par le `theme.css` rendu à la génération — il ne doit jamais finir tel quel dans un client (sinon `var(--accent)` est invalide et les boutons s'affichent sans couleur).

**Règle : jamais de couleur en dur.** Tout code (site comme admin) doit utiliser les variables CSS (`var(--accent)`, `var(--encre)`, `var(--sable)`, `var(--attente)`, etc.), y compris dans les `style="..."` inline et les valeurs injectées en JS. Une couleur hexadécimale écrite en dur ne suit pas la charte du client lors d'une dérivation et réapparaît avec la teinte du gabarit d'origine — c'est un bug. Si une teinte manque, l'ajouter comme variable dans `:root` plutôt que de la coder en dur.

**Interface d'administration : palette neutre, identique pour tous les clients.** L'admin (`pages/admin.css`) ne suit **pas** l'accent du restaurant : elle utilise la palette du kit « La Table Digitale » (bordeaux `#7a1f24` + encre `#1d1a16`) via des variables dédiées `--admin-accent` / `--admin-accent-dark` / `--admin-accent-light` / `--admin-ink` (+ déclinaisons `--admin-accent-0XX`), définies en tête de `admin.css` sur `.app` et `.login-wrap`. Les fonds sombres (bandeau latéral, écran de login, encart ardoise) utilisent `--admin-ink` et non plus `var(--ink)` du client. Seul le nom du restaurant varie dans l'admin (`VITE_RESTO_NAME`). **Ne jamais réintroduire `var(--accent)` dans l'admin**, à une exception près : l'aperçu du bandeau promo (`.promo-apercu .promo-entete`) garde `var(--accent)` pour refléter fidèlement le rendu côté site. Le bloc public, lui, continue d'utiliser l'accent du client.

**Logo éditeur « La Table Digitale » dans l'admin.** Le bandeau latéral affiche, sous le titre « `<Nom du restaurant>` Administration », le **logo La Table Digitale** (marque de l'éditeur), en **blanc** sur le fond sombre du bandeau. C'est un élément **fixe et identique pour tous les clients** : le SVG est inline dans `AdminApp.tsx` (`.side-marque`). Chaque admin porte donc le nom du restaurateur **et** ce logo éditeur. Ne pas le retirer ni le rendre éditable — il identifie l'auteur de la solution, au même titre que la palette admin neutre.

---

## Avant de livrer une modification

1. Le changement reste-t-il dans le périmètre verrouillé ? Les seules libertés hors charte/mise en page sont le **hero**, le **menu de navigation** et le bloc **« Notre cuisine »** (tous trois figés au build, non éditables).
2. S'agit-il d'un bloc sur mesure ? Si oui, a-t-il été **explicitement demandé par le client** ? (sinon : ne pas le créer)
3. Tout bloc visible affichant du contenu évolutif a-t-il bien une zone éditable correspondante dans l'admin ? (seules exceptions admises : hero, menu de navigation et « Notre cuisine », non éditables par nature — figés au build)
4. La modification est-elle de la charte, de la mise en page ou du contenu — et non un nouveau bloc improvisé ?
