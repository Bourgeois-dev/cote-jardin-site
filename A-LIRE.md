# Retrait du module Réservation — Côté Jardin

Repositionnement de l'offre : La Table Digitale ne propose plus que **Essentiel**
et **Essentiel + Newsletter**. Tout ce qui relève de la réservation en ligne, du
plan de salle, de la liste d'attente et du CRM clients est retiré du produit.

---

## ⚠️ Ordre d'exécution — à respecter

1. **Exporter les données** de production avant toute chose (voir §3).
2. **Pousser le code** (GitHub Desktop) et attendre que Netlify ait fini.
3. **Appliquer la migration SQL** seulement ensuite.
4. **Supprimer les edge functions** et les crons dans le dashboard Supabase.

Faire la migration avant le déploiement casserait le site en production :
l'ancien bundle interroge encore `reservations` et `reservation_settings`.

---

## 1. Fichiers à SUPPRIMER

À faire à la main dans le repo (GitHub Desktop détectera la suppression) :

```
src/components/admin/TabReservations.tsx
src/components/admin/TabPlan.tsx
src/components/admin/TabListeAttente.tsx
src/components/admin/TabClients.tsx
src/components/admin/PlanService.tsx
src/components/admin/TableSVG.tsx
src/components/site/ReservationWidget.tsx
src/pages/WidgetReservation.tsx
src/pages/Annuler.tsx
supabase/functions/reservation-email/          (le dossier entier)
supabase/functions/reservation-reminders/      (le dossier entier)
```

## 2. Fichiers à REMPLACER

### Renommage

`src/components/admin/TabTableauNewsletter.tsx` → **`src/components/admin/TabTableau.tsx`**

L'ancien `TabTableau.tsx` (tableau de bord du service) est écrasé : le fichier
fourni contient le tableau de bord newsletter, seul restant.

### Modifiés

```
src/main.tsx
src/components/admin/AdminApp.tsx
src/components/admin/TabTableau.tsx           ← ex TabTableauNewsletter
src/components/admin/TabParametres.tsx
src/components/admin/TabFeatures.tsx
src/components/admin/TabHoraires.tsx
src/components/admin/TabContacts.tsx
src/components/admin/TabNewsletter.tsx
src/components/site/Navbar.tsx
src/components/site/Hero.tsx
src/pages/Site.tsx
src/pages/ProtectionDonnees.tsx
src/pages/admin.css
src/site.css
src/lib/types.ts
src/lib/supabase.ts
src/lib/incident.ts
supabase/functions/send-newsletter/index.ts
supabase/functions/assistant-newsletter/index.ts
supabase/functions/resend-webhook/index.ts
supabase/functions/README.md
supabase/migrations/00000000000001_schema.sql
supabase/migrations/00000000000002_seed.sql
CLAUDE.md
```

---

## 3. Migration de la base — DESTRUCTIF

Fichier : `provisioning/migrations/migration-retrait-reservation.sql` (kit).

**Avant de l'appliquer**, exporter ce qui doit être conservé. La migration
supprime les réservations passées, les fiches clients et la liste d'attente.

```sql
\copy (select * from public.reservations) to 'reservations.csv' csv header
\copy (select * from public.customers)    to 'customers.csv'    csv header
\copy (select * from public.waitlist)     to 'waitlist.csv'     csv header
```

Puis essayer d'abord en transaction ouverte :

```sql
begin;
-- coller le contenu de migration-retrait-reservation.sql
-- vérifier le résultat
rollback;   -- ou commit; si tout est conforme
```

Les contacts newsletter (`leads`) ne sont **pas** touchés.

### Ce que fait la migration

| Étape | Effet |
|---|---|
| 1 | Désinscrit les jobs pg_cron `rappel-j1` et `waitlist-relance-horaire` |
| 2 | Retire `reservations` et `waitlist` de `supabase_realtime` |
| 3 | Supprime 11 fonctions et 4 triggers |
| 4 | Supprime 6 tables (`reservations`, `waitlist`, `customers`, `restaurant_tables`, `dining_areas`, `reservation_settings`) |
| 5 | Retire `blocks_reservations` et `custom_message` de `closure_periods` |
| 6 | Requalifie `leads.source = 'reservation'` en `'newsletter'` + recrée les policies anon |
| 7 | Réécrit `inscrire_newsletter_statut()` sans la source `reservation` |
| 8 | Réécrit `newsletter_segment_counts()` : un seul segment `optin` |
| 9 | Supprime les feature flags `reservation`, `liste_attente`, `crm` |
| 10 | Ramène les campagnes historiques au segment `optin` |

---

## 4. Actions manuelles dans Supabase

- **Edge Functions** → supprimer `reservation-email` et `reservation-reminders`.
- **Database → Cron jobs** → vérifier que `rappel-j1` et
  `waitlist-relance-horaire` ont bien disparu (l'étape 1 de la migration s'en
  charge, mais un job créé sous un autre nom survivrait).
- **Secrets** : `NEWSLETTER_FROM_EMAIL` remplace `RESERVATION_FROM_EMAIL`.
  **Rien à faire dans l'immédiat** — `send-newsletter` lit le nouveau nom et
  retombe sur l'ancien s'il est absent. Renommer le secret quand ce sera commode.
- **Redéployer** `send-newsletter`, `assistant-newsletter` et `resend-webhook` :
  les edge functions ne partent pas avec un push GitHub.

---

## 5. Ce qui change pour le restaurateur

### Navigation de l'admin — 14 onglets, 3 familles

- **Pilotage** : Tableau de bord · Newsletter · Horaires
- **Vitrine** : La carte · Ardoise du jour · Galerie · Avis clients ·
  Partenaires · Réseaux sociaux · Bannière promo · À emporter
- **Paramètres** : Contacts · Site & accès · Fonctionnalités *(éditeur LTD)*

La barre d'accès rapide mobile passe de « Tableau · Résa · Plan » à
**« Tableau · Lettre · Carte »**.

### Onglet « Réservations & site » → « Site & accès »

Il ne reste que trois blocs : l'interrupteur du bloc newsletter du site, la voix
du restaurant (assistant IA) et les comptes admin. Plus de bouton
« Enregistrer » global : chaque réglage s'applique immédiatement.

### Onglet Horaires

La section « Fermetures & événements exceptionnels » **reste**, mais change de
rôle : ce n'est plus ce qui bloque les créneaux du widget, c'est un mémo interne
repris par l'assistant IA quand il rédige une campagne. Le champ « Message
personnalisé » (destiné au widget) et la colonne `blocks_reservations`
disparaissent.

### Newsletter

L'assistant passe de **3 à 2 étapes** : « 1 · Contenu », « 2 · Envoi ».
Il n'y a plus d'étape de ciblage — un seul segment existe désormais, `optin`
(tous les inscrits consentants, hors adresses en bounce). Les cinq autres
segments reposaient sur `customers`, alimentée par les réservations.

Les liens `#reserver` proposés sous le champ « Bouton — lien » sont remplacés
par `#carte`.

### Site public

Le widget disparaît. Les boutons de la navbar, du hero et le bouton flottant
deviennent des boutons **« Appeler »** (lien `tel:`) et disparaissent si aucun
numéro n'est renseigné. Les routes `/annuler` et `/widget-reservation` sont
retirées.

---

## 6. Détails techniques

- **Props renommées** : `onReserve` → `onAppeler`, `reserveLabel` → `appelLabel`
  dans `Navbar.tsx` et `Hero.tsx`.
- **Classes CSS conservées** : `.nav-resa`, `.nav-mobile-resa` et `.fab-reserv`
  habillent maintenant le bouton d'appel. Elles ne sont **pas** renommées : ce
  sont des classes de `site.css`, donc de la forme, et les renommer imposerait
  de reprendre le CSS de chaque client déjà livré.
- **`admin.css`** : 2 786 → 2 078 lignes. Sections `.ps-` (plan de service),
  `.tp-` (plan de salle), `.cli-` (CRM) et widget réservation supprimées, ainsi
  que les règles devenues orphelines. Aucune classe encore utilisée n'a été
  retirée : la liste des classes réellement présentes dans le TSX a été extraite
  et confrontée aux sélecteurs avant chaque suppression.
- **`site.css`** : bloc `.resa-cal` (calendrier du widget, ~87 lignes) retiré.
- **`schema.sql`** : 1 635 → 799 lignes.
- **`getRecipients()`** (`send-newsletter`) ne connaît plus qu'`optin` et
  renvoie une liste **vide** pour toute autre valeur — une campagne dont le
  segment aurait mal été enregistré ne part pas plus large que prévu.

### Les trois miroirs à ne jamais désynchroniser

Le segment et sa façon de compter les destinataires sont écrits à trois endroits :

1. `newsletter_segment_counts()` — base
2. `getRecipients()` — `supabase/functions/send-newsletter/index.ts`
3. `SEGMENTS` — `src/components/admin/TabNewsletter.tsx`

---

## 7. Vérifications faites avant livraison

- `esbuild` sur tous les `.ts` / `.tsx` : aucune erreur de syntaxe.
- Aucun import inutilisé (contrôle automatisé sur tout `src/`).
- Aucune référence résiduelle aux symboles et tables supprimés dans `src/`.
- `check-fond.mjs` : 12 blocs, 14 onglets, 5 champs — **0 erreur**.
- `check-connexions.mjs` : 10 connexions — **0 erreur, 0 alerte**.
- `diff -rq` CJ / AT / PK : seuls les écarts de forme attendus subsistent
  (`Hero.tsx`, `Carte.tsx`, `Histoire.tsx`, `site.css`, `theme.css`,
  `legal.generated.ts`, `admin-theme.css`).

## 8. À faire après le déploiement

- [ ] Ouvrir le site : le bouton « Appeler » compose bien le numéro.
- [ ] Ouvrir l'admin : 14 onglets, plus aucune trace de réservation.
- [ ] Créer une campagne de test : l'assistant doit afficher **2 étapes**.
- [ ] Envoyer un test : vérifier que le compteur de destinataires correspond.
- [ ] Vérifier que `/annuler` et `/widget-reservation` renvoient bien sur le site
      (route `*` → `<Site />`).

---

## 9. Correctif du 01/08 — `admin.css` (à appliquer par-dessus la première livraison)

### Le symptôme

Sidebar sans fond (texte blanc sur crème, illisible), boutons d'accent invisibles,
interrupteurs délavés dans l'onglet Horaires.

### La cause

Le script qui a élagué `admin.css` rattachait chaque commentaire au sélecteur qui
le suit. Or le bandeau récapitulatif en tête de fichier énumère les sections —
dont `.ps-*` et `.tp-*`. Le bloc `:root` qui suivait immédiatement ce bandeau a
donc été jugé « mort » et supprimé avec lui.

Résultat : `--admin-accent`, `--admin-ink`, `--admin-accent-light`, `--or`,
`--ok`, `--attente`, `--annule`, `--a06`/`--a08`/`--a12`/`--a25` — **toutes les
variables de la charte admin** — n'étaient plus déclarées. Une seule règle
perdue, mais celle qui gouvernait la couleur de toute l'interface.

### Le correctif

`admin.css` a été refait **depuis l'original**, avec un parseur qui :

1. traite les commentaires comme des jetons autonomes, jamais comme une partie
   du sélecteur qui suit ;
2. ne supprime jamais une règle sans classe (`:root`, `*`, `html`, `body`) ;
3. découpe les sélecteurs sur les virgules et n'élague que les parties mortes,
   au lieu de supprimer la règle entière ;
4. supprime une règle composée dès qu'**une** de ses classes a disparu
   (`.ps-service-bloc.actif` ne peut plus rien matcher), là où la version
   précédente la gardait parce que `.actif` existe toujours.

Fichier : `src/pages/admin.css` — 2 786 → 2 113 lignes.

### Contrôles ajoutés

- Comparaison règle par règle avec l'original : **0 suppression injustifiée**
  (chaque règle retirée n'a que des classes disparues).
- Aucune règle conservée n'a vu son corps modifié.
- Aucune variable `--admin-*` utilisée sans déclaration ni valeur de repli.
- Aucune classe encore présente dans le TSX n'a perdu ses règles.
- Aucune classe `.ps-` / `.tp-` / `.cli-` ne subsiste.

> Les classes `.fait` et `.libre` apparaissent comme « utilisées » si on extrait
> naïvement les chaînes du TSX : c'est le placeholder « Sans gluten, fait
> maison… » de l'onglet Ardoise. Leurs seules règles étaient
> `.etapes i.fait` (widget) et `.ps-table.libre` (plan de service) — leur
> suppression est correcte.

### Ce qu'il faut faire

Remplacer **uniquement** `src/pages/admin.css`. Aucun autre fichier ne change,
aucune action base de données. Si la première livraison n'a pas encore été
poussée, cette version est déjà celle du zip.

---

## 10. Correctif du 01/08 — onglet Horaires en habillage éditorial

### Le constat

Après le déploiement, l'onglet Horaires ressortait visuellement du lot : tableau
encadré, heures dans des champs beiges, alors que le reste de l'admin est passé
au registre éditorial (filets fins, titres en Fraunces, champs soulignés).

### La cause — antérieure à cette refonte

`admin.css` contient depuis un moment une section complète
« ══ HORAIRES ══ » entièrement scopée `.contenu.adm-vit`, avec trois classes
dédiées : `.hr-ferme`, `.hr-mention`, `.hr-vide`. **Ces règles n'ont jamais été
appliquées** : `TabHoraires.tsx` était resté sur `className="contenu"` et
n'utilisait aucune de ces trois classes. Du CSS écrit, livré, et dormant.

Douze onglets sur quatorze utilisent `.adm-vit`. Horaires était le seul à avoir
une section éditoriale dédiée sans jamais l'activer. Le décalage existait déjà,
mais il ne sautait aux yeux qu'une fois « Réservations & site » devenu
« Site & accès » — donc éditorial — juste à côté dans la navigation.

> À vérifier avec `git status` : le dépôt contient des modifications non
> commitées, dont ces +1 278 lignes de `admin.css`. Le CSS de la refonte
> éditoriale a été poussé sans son pendant TSX.

### Le correctif

`src/components/admin/TabHoraires.tsx` :

- `topbar` et `contenu` reçoivent `adm-vit`, avec l'eyebrow « Pilotage ».
- La ligne d'un jour fermé porte `hr-ferme` : elle s'éteint sans disparaître.
- Un jour fermé affiche « Fermé » (`hr-mention`) au lieu d'un tiret muet.
- Un créneau laissé vide sur un jour ouvert affiche « pas de service »
  (`hr-vide`) : deux champs vides ne disent rien d'eux-mêmes, on prenait le
  risque de les croire mal remplis.
- Les deux colonnes Midi et Soir passent par un sous-composant `Service` —
  elles étaient dupliquées à l'identique, avec le risque habituel de ne corriger
  qu'un côté.
- « Supprimer » d'une fermeture devient un `adm-vit-lien danger`, comme partout
  ailleurs dans l'habillage éditorial.

Aucune règle CSS n'est ajoutée : tout existait déjà et attendait son markup.

### Ce qu'il faut faire

Remplacer `src/components/admin/TabHoraires.tsx`. Aucune action base de données.

### Reste à trancher (hors périmètre de ce correctif)

Trois onglets n'utilisent pas `adm-vit` : **Tableau de bord**, **À emporter** et
**Fonctionnalités**. Contrairement à Horaires, aucune section éditoriale dédiée
ne les attend dans le CSS — seules les règles génériques (`.bloc`, `.champ`,
`.toggle`) changeraient d'aspect. Les basculer est un choix de design, pas une
correction : à décider séparément. « À emporter » est le plus discutable, c'est
un onglet Vitrine entouré d'onglets éditoriaux.
