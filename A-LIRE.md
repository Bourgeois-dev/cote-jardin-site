# Newsletter — ciblage unique en offre « Essentiel + Newsletter » (29/07/2026)

Deux sujets dans ce paquet : la simplification de l'assistant de campagne pour les
clients sans module Réservation, et la remise à niveau de `schema.sql`.

Validateurs au vert (`check-fond.mjs` et `check-connexions.mjs`, 0 erreur).
`diff -rq` entre les trois espaces ne montre que les différences de **forme**
attendues (`Hero.tsx`, `Carte.tsx`, `Histoire.tsx`, `site.css`, `theme.css`,
`legal.generated.ts`). Les composants admin sont identiques partout.

---

## 1. Assistant de campagne : 3 étapes → 2 étapes

**Décision.** En offre « Essentiel + Newsletter », le module Réservation est
désactivé. Sans réservations, la table `customers` n'est jamais alimentée (elle
l'est par le trigger `attach_customer` sur `reservations`) : les cinq segments qui
en dépendent — VIP, Habitués, Venus une seule fois, Pas venus depuis 3 à 6 mois,
Pas venus depuis plus de 6 mois — afficheraient tous « 0 contact ».

Plutôt que de proposer une étape de ciblage à vide, l'étape 2 disparaît. Le
segment est fixé à `optin` et l'assistant passe de trois étapes à deux.

Le déclencheur est le flag `reservation` de la table `feature_flags`, déjà utilisé
par `AdminApp.tsx` pour masquer les onglets. Aucun réglage supplémentaire : le
comportement suit l'activation du module, comme le reste de l'admin.

**Ce qui change dans `TabNewsletter.tsx` (fond, identique CJ = AT = PK) :**
- lecture du flag `reservation` dans le composant parent, transmise à
  `NouveauForm` via la prop `cibleUnique` ;
- fil d'étapes renuméroté 1-2 (pas de pastille « 3 » orpheline) ;
- « Suivant » à l'étape 1 mène directement à la planification ;
- « Retour » à l'étape de planification revient à la composition ;
- récap : « Destinataires : tous les inscrits (N) » au lieu de « Segment : … » ;
- cartes de la liste : la mention du segment est retirée (elle serait constante).

Rien n'est fermé pour l'avenir : la colonne `segment`, `getRecipients()` et
`newsletter_segment_counts()` restent en place. Réintroduire un segment plus tard
ne coûtera qu'un rendu conditionnel de plus.

**Pour un client Essentiel :** basculer le flag `reservation` sur `false` depuis
l'onglet « Fonctionnalités » (compte `@latable-digitale.fr`). L'effet est pris au
prochain chargement de l'admin.

---

## 2. `schema.sql` — remise à niveau

### Ce qui n'était PAS un problème

La contrainte `chk_segment` et `newsletter_segment_counts()` ont été vérifiées
directement sur la base de production de Côté Jardin (`jdbxtygycrzqlyzqjpfg`) :
elles sont à jour et cohérentes avec `SEGMENTS` et `getRecipients()`. Le template
du kit l'était également. Le décalage venait d'un instantané périmé de
`schema.sql` conservé hors dépôt.

### `cancel_by_token()` manquait dans le template du kit — corrigé

La fonction existe en production, `src/pages/Annuler.tsx` l'appelle par RPC, et un
commentaire du template la mentionne — mais aucun `create function` ne la créait.
**Un client provisionné depuis le kit aurait eu une page d'annulation cassée dès
le premier lien envoyé dans un e-mail de confirmation.**

Portée depuis la production dans `provisioning/templates/schema.sql`, avec son
`grant execute on function public.cancel_by_token(uuid) to anon, authenticated;`.
Placée juste après `reserve_table`, dont elle est le pendant côté client.

> Aucune base existante à corriger : Côté Jardin l'a déjà, et c'est le seul client
> en production. Le correctif ne concerne que les **futurs** clients.

### Instantané CJ régénéré

`cote-jardin-site/supabase/migrations/00000000000001_schema.sql` datait du
18/07 et avait 400 lignes de retard sur le template (dossiers de newsletter,
segments habitués/une visite, `inscrire_newsletter`, `notifier_waitlist_si_liberee`…).

Régénéré depuis le template du kit, placeholders substitués
(`gerant@cote-jardin.fr`, `jdbxtygycrzqlyzqjpfg`), en-tête précisant qu'il s'agit
d'un instantané idempotent décrivant l'état cible — pas d'une migration
incrémentale qui s'empilerait avec les précédentes.

> ⚠️ Le fichier passe de 1079 à 1526 lignes. À relire dans GitHub Desktop avant de
> pousser. Aucune donnée n'est touchée : les seeds sont dans
> `00000000000002_seed.sql`, qui n'est pas modifié.

---

## 3. Restant à traiter — `rls_auto_enable()`

L'event trigger `ensure_rls` et sa fonction `rls_auto_enable()` tournent en
production chez Côté Jardin mais **n'existent dans aucun des deux fichiers de
schéma**. C'est un garde-fou qui active automatiquement la RLS sur toute table
créée : son absence du kit signifie qu'un futur client ne l'aura pas.

Non corrigé dans ce paquet — repéré en fin de session, et un garde-fou de sécurité
mérite d'être traité pour lui-même plutôt qu'en marge d'une livraison newsletter.

---

## Fichiers à remplacer

### maj-cote-jardin.zip → repo `cote-jardin-site`
- (modifié) `src/components/admin/TabNewsletter.tsx`
- (modifié) `supabase/migrations/00000000000001_schema.sql`
- (nouveau) `A-LIRE.md`

### maj-app-template.zip → repo `app-template`
- (modifié) `src/components/admin/TabNewsletter.tsx`

### maj-provisioning-kit.zip → repo `provisioning`
- (modifié) `provisioning/templates/app/src/components/admin/TabNewsletter.tsx`
- (modifié) `provisioning/templates/schema.sql`

Aucun autre fichier n'est touché. Aucune migration à rejouer sur une base existante.

---

# Correctif — masquage des onglets liés aux réservations (29/07/2026, second envoi)

Constat en production : basculer le flag `reservation` sur `false` laissait
visibles « Plan de salle », « Liste d'attente » et « Clients ».

Vérifications faites sur la base avant correction : le flag était bien enregistré
à `false`, et sous l'identité réelle de `gerant@cote-jardin.fr` (JWT simulé)
`is_admin()` renvoie `true` et la lecture de `feature_flags` retourne les 4 lignes.
Ni l'écriture ni la RLS n'étaient en cause.

## Deux causes distinctes

**« Plan de salle » — défaut.** La clé `plan` était absente de `FEATURE_MAP` dans
`AdminApp.tsx` : aucun flag ne lui était associé, l'onglet restait donc visible
quels que soient les réglages. Corrigé par `"plan": "reservation"` — un plan de
salle sans réservations ne sert à rien.

**« Liste d'attente » et « Clients » — combinaison incohérente.** Ces deux
modules ont leurs propres flags (`liste_attente`, `crm`), restés à `true`. Ce
n'était pas un bug, mais leurs tables sont alimentées par les réservations
(`waitlist` par le widget, `customers` par le trigger `attach_customer`) : sans
module Réservation, les deux onglets sont définitivement vides.

Plutôt que d'imposer au studio de penser à couper trois interrupteurs sans se
tromper, une table `DEPENDANCES` a été ajoutée dans `AdminApp.tsx` : couper
`reservation` masque aussi les onglets Liste d'attente et Clients. Aucune
combinaison de flags ne peut plus produire un onglet mort.

`TabFeatures.tsx` affiche désormais la raison sur les modules concernés
(« Sans effet : dépend du module Réservation en ligne, actuellement désactivé »),
pour que l'interrupteur ne paraisse pas cassé.

## Non traité volontairement

Le **Tableau de bord** reste visible et affichera un service vide chez un client
Essentiel. « **Réservations & site** » mêle réglages de réservation et réglages de
site : c'est une section à masquer, pas un onglet. Les deux demandent du travail
à l'intérieur des composants et méritent leur propre passe.

## Fichiers à remplacer (ce second envoi)

### maj-cote-jardin.zip → repo `cote-jardin-site`
- (modifié) `src/components/admin/AdminApp.tsx`
- (modifié) `src/components/admin/TabFeatures.tsx`

### maj-app-template.zip → repo `app-template`
- (modifié) `src/components/admin/AdminApp.tsx`
- (modifié) `src/components/admin/TabFeatures.tsx`

### maj-provisioning-kit.zip → repo `provisioning`
- (modifié) `provisioning/templates/app/src/components/admin/AdminApp.tsx`
- (modifié) `provisioning/templates/app/src/components/admin/TabFeatures.tsx`

> Les fichiers du premier envoi (TabNewsletter.tsx, schema.sql) sont inclus dans
> ces mêmes zips — ils remplacent intégralement le paquet précédent.

---

# Onglet « Réservations & site » adapté à l'offre Essentiel (29/07/2026, troisième envoi)

Quand le flag `reservation` est sur `false`, l'onglet ne montre plus que ce qui a
un sens sans réservation en ligne.

## Ce qui disparaît

- le bloc « Réservation en ligne » de la section *Sur le site public*, et son
  réglage imbriqué « Proposer la newsletter pendant la réservation » ;
- la section entière **Règles de réservation** (horizon, délai minimum, seuil
  groupe, couverts max, durée d'occupation) ;
- la section entière **Confirmation des réservations** ;
- la section **Quand un créneau est complet** (liste d'attente) ;
- la section **Rappels automatiques** (rappel J-1) ;
- le pied de formulaire et son bouton **Enregistrer** — plus rien à enregistrer
  d'un bloc, le seul réglage restant (« Bloc Newsletter / actualités ») s'applique
  aussitôt.

## Ce qui reste

Le toggle « Bloc Newsletter / actualités » et le bloc **Comptes admin**.

## Renommage

Un onglet intitulé « Réservations & site » chez un client qui n'a pas la
réservation était incohérent. Quand le module est coupé :

- le libellé dans la navigation (barre latérale **et** tiroir mobile) devient
  « Site & accès » ;
- le titre de page suit, avec le sous-titre « Blocs du site et accès à
  l'administration ».

## Détail

Le garde `if (!s) return <alerte support technique>` ne se déclenche plus quand le
module est coupé : sans réservation, l'absence de ligne `reservation_settings`
n'a rien d'anormal et ne doit pas afficher un message d'erreur au restaurateur.

## Fichiers à remplacer (ce troisième envoi)

### maj-cote-jardin.zip → repo `cote-jardin-site`
- (modifié) `src/components/admin/AdminApp.tsx`
- (modifié) `src/components/admin/TabParametres.tsx`

### maj-app-template.zip → repo `app-template`
- (modifié) `src/components/admin/AdminApp.tsx`
- (modifié) `src/components/admin/TabParametres.tsx`

### maj-provisioning-kit.zip → repo `provisioning`
- (modifié) `provisioning/templates/app/src/components/admin/AdminApp.tsx`
- (modifié) `provisioning/templates/app/src/components/admin/TabParametres.tsx`

> Les zips contiennent l'intégralité des trois envois. Ils remplacent les paquets
> précédents.

---

# Tableau de bord newsletter (29/07/2026, quatrième envoi)

En offre Essentiel, le tableau de bord du service n'avait plus rien à montrer.
Un composant distinct est monté à sa place, entièrement tourné vers la liste et
les campagnes.

## Nouveau composant `TabTableauNewsletter.tsx`

Composant séparé plutôt que conditions dans `TabTableau` : cela évite de lancer
les requêtes sur `reservations`, `restaurant_tables` et `opening_hours` pour un
client dont ces tables sont vides par construction. Tout est calculé depuis
`leads` et `newsletter_campaigns`.

**Cartes du haut** — Inscrits · Nouveaux ce mois-ci (avec écart vs mois
précédent) · Prochaine campagne programmée (cliquable) · Brouillons (cliquable) ·
Dernière campagne envoyée.

**Blocs** — Croissance de la liste (douze mois glissants, histogramme) · Origine
des inscriptions (`leads.source`, les liens tracés `newsletter:<utm>` apparaissent
séparément) · Santé de la liste (désinscriptions 30 j., total, campagnes
envoyées) · Dernières campagnes (cinq derniers envois, avec signalement des
échecs quand `sent_count < recipients_count`).

`AdminApp.tsx` choisit lequel monter. Un garde a été ajouté : tant que les flags
ne sont pas lus, aucun des deux n'est affiché — sans quoi un client Essentiel
verrait passer une fraction de seconde de « Couverts aujourd'hui ».

## `leads.unsubscribed_at`

Sans cette colonne, les désinscriptions n'étaient comptables qu'en volume total.

- **Appliqué en production sur Côté Jardin** (migration `leads_unsubscribed_at` :
  colonne + index partiel). Additive et réversible, aucune donnée touchée.
- Ajoutée au template du kit et à l'instantané CJ.
- `newsletter-unsubscribe/index.ts` renseigne désormais la date en même temps
  qu'il passe `consent` à `false`.
- Les désinscriptions antérieures restent à `null` : elles comptent dans le total
  mais jamais dans la période. Le tableau de bord le dit explicitement
  (« dont N sans date connue ») plutôt que de laisser croire à une liste saine.

> ⚠️ L'edge function `newsletter-unsubscribe` doit être redéployée, sinon la
> colonne restera vide. Tant qu'elle ne l'est pas, rien ne casse : la
> désinscription continue de fonctionner, seule la date manque.

## Fichiers à remplacer (ce quatrième envoi)

### maj-cote-jardin.zip → repo `cote-jardin-site`
- (nouveau)  `src/components/admin/TabTableauNewsletter.tsx`
- (modifié)  `src/components/admin/AdminApp.tsx`
- (modifié)  `src/lib/types.ts`
- (modifié)  `src/pages/admin.css`
- (modifié)  `supabase/functions/newsletter-unsubscribe/index.ts`
- (modifié)  `supabase/migrations/00000000000001_schema.sql`

### maj-app-template.zip → repo `app-template`
- (nouveau)  `src/components/admin/TabTableauNewsletter.tsx`
- (modifiés) `src/components/admin/AdminApp.tsx`, `src/lib/types.ts`,
  `src/pages/admin.css`, `supabase/functions/newsletter-unsubscribe/index.ts`

### maj-provisioning-kit.zip → repo `provisioning`
- (nouveau)  `provisioning/templates/app/src/components/admin/TabTableauNewsletter.tsx`
- (modifiés) `provisioning/templates/app/src/components/admin/AdminApp.tsx`,
  `.../src/lib/types.ts`, `.../src/pages/admin.css`,
  `.../supabase/functions/newsletter-unsubscribe/index.ts`,
  `provisioning/templates/schema.sql`

> Les zips contiennent l'intégralité des quatre envois.

---

# `rls_auto_enable()` / event trigger `ensure_rls` (29/07/2026, cinquième envoi)

## Ce que la vérification a montré

`ensure_rls` n'est pas une fonction maison : c'est l'option Supabase
« Auto-enable RLS for new tables » (Dashboard → Authentication), documentée par
Supabase et **opt-in**. Un projet neuf ne l'a pas — elle a donc bien été cochée à
la main sur Côté Jardin à un moment, et un futur client ne l'aurait pas eue.

Deuxième point vérifié, parce qu'il décidait de la solution : le rôle `postgres`
de l'éditeur SQL n'est pas superutilisateur (`usesuper = false`), ce qui interdit
normalement `create event trigger`. Sonde exécutée en production (event trigger
temporaire créé à partir de la fonction existante, puis supprimé) : **la création
passe**. Supabase autorise donc l'opération malgré l'absence de superuser.

Conclusion : l'objet peut vivre dans `schema.sql`, et n'a pas à dépendre d'une
case cochée dans le dashboard client par client.

## Ce qui a été fait

- `rls_auto_enable()` et `ensure_rls` ajoutés **en tête** des deux fichiers de
  schéma, avant la première table — l'event trigger n'agit que sur les tables
  créées après son installation.
- Rejouable : `create or replace` pour la fonction, `drop event trigger if
  exists` puis `create` pour le trigger (les event triggers n'acceptent pas
  `if not exists`).
- **Appliqué et testé en production sur Côté Jardin.** Test de bout en bout :
  création d'une table jetable `ztest_rls_ltd` → `relrowsecurity = true`
  automatiquement, puis suppression. Contrôle final : table de test absente,
  `ensure_rls` présent, fonction présente, et **0 table du schéma `public` sans
  RLS** sur les 23.
- `SETUP-NOUVEAU-CLIENT.md` : encadré ajouté en section 10 — plus rien à cocher
  dans le dashboard, avec la requête de vérification après provisioning.

## Portée réelle

Le schéma active déjà la RLS table par table ; le trigger ne change donc rien à
l'état actuel. Il couvre ce qui viendra plus tard : migration à chaud, table de
travail, table créée depuis le dashboard. C'est un filet, pas un correctif — une
table oubliée sera inaccessible plutôt qu'ouverte en grand.

## Fichiers à remplacer (ce cinquième envoi)

### maj-cote-jardin.zip → repo `cote-jardin-site`
- (modifié) `supabase/migrations/00000000000001_schema.sql`

### maj-provisioning-kit.zip → repo `provisioning`
- (modifié) `provisioning/templates/schema.sql`
- (modifié) `provisioning/SETUP-NOUVEAU-CLIENT.md`

> `app-template` n'est pas concerné (pas de schéma, pas de doc de provisioning).
> Les zips contiennent l'intégralité des cinq envois.

---

# Fermetures exceptionnelles masquées en offre Essentiel (29/07/2026, sixième envoi)

Le bloc « Fermetures & événements exceptionnels » de l'onglet Horaires restait
visible sans le module Réservation.

Vérifié avant de trancher : `closure_periods` n'est lue que par
`ReservationWidget.tsx` et par la fonction `check_availability()`. Aucun bloc du
site public ne l'affiche. Sans réservation, la section est donc **sans effet
observable** — un restaurateur pouvait y saisir des congés en croyant qu'ils
s'afficheraient quelque part.

## Ce qui change dans `TabHoraires.tsx`

- le bloc « Fermetures & événements exceptionnels » disparaît entièrement quand
  `reservation` est sur `false` ;
- le sous-titre de l'onglet passe de « Ouvertures et fermetures exceptionnelles »
  à « Horaires d'ouverture affichés sur le site » ;
- les horaires d'ouverture, eux, restent : ils sont affichés sur le site public,
  indépendamment de toute réservation.

> Note : `useTable("closure_periods")` continue de s'exécuter (on ne peut pas
> conditionner un hook React). La requête revient vide et n'a aucun coût visible ;
> la corriger imposerait de découper le composant, ce qui n'en vaut pas le prix.

## Balayage des autres onglets

J'ai passé en revue les onglets qui restent visibles en offre Essentiel. Il ne
reste que deux traces, toutes deux sans conséquence :

- **Ardoise/Promo** : le champ « Texte du bouton » propose `Réserver ma place`
  comme *placeholder*. Simple suggestion grisée, le restaurateur saisit son propre
  libellé. À changer si tu veux, mais rien ne casse.
- **Contacts** : la table de correspondance des sources traduit `reservation` en
  « Réservation ». Comportement correct — cette source n'apparaît simplement
  jamais chez un client sans réservation.

Aucun autre onglet ne mentionne la réservation. À ma connaissance, le tour est
complet.

## Fichiers à remplacer (ce sixième envoi)

- (modifié) `src/components/admin/TabHoraires.tsx` — dans les trois espaces
  (`cote-jardin-site/`, `app-template/`, `provisioning/templates/app/`).

> Les zips contiennent l'intégralité des six envois.
