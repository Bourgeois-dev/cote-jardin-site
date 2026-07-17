# Mise en production — Côté jardin

Le dossier `dist/cote-jardin/` **est** l'application React complète, prête à builder.
Tout le contenu evolutif se gere ensuite depuis l'admin (/gestion-a7x9k2).

## 1. Repo Git
- [ ] Initialiser le repo a partir de ce dossier :
      `cd dist/cote-jardin && git init && git add . && git commit -m "init cote-jardin"`
- [ ] Pousser sur GitHub (repo `cote-jardin`), contenu a la racine (package.json visible a la racine).
- [ ] Renseigner `deploy.repoPath` dans `clients/cote-jardin.json` pour les mises a jour via `update-client.mjs`.

## 2. Supabase
- [ ] `chmod +x deploy.sh && ./deploy.sh` (cree le projet, pousse le schema + seed,
      deploie l'edge function reservation-email).
- [ ] Creer le compte admin : Dashboard → Authentication → Users → Add user →
      email EXACTEMENT `gerant@cote-jardin.fr` + mot de passe + Auto Confirm User.
- [ ] Reporter le `project ref` dans `clients/cote-jardin.json` (`deploy.projectRef`).
- [ ] Verifier le domaine d'envoi Resend.

## 3. Netlify
- [ ] Creer le site (), brancher le repo GitHub.
- [ ] Le `netlify.toml` est deja inclus (build `npm run build`, publish `dist`, redirect SPA).
- [ ] Variables d'env : recopier le contenu de `.env.example` en remplacant
      VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY par les vraies cles.
- [ ] Domaine :  + HTTPS.

## 4. Auth — URLs de redirection (ETAPE CRITIQUE, sinon le "mot de passe oublie" casse)
- [ ] Supabase Dashboard -> Authentication -> URL Configuration.
- [ ] **Site URL** : mettre l'URL Netlify/domaine final (ex. https://).
      Par defaut Supabase pointe vers http://localhost:3000 -> tant que ce n'est
      pas corrige, TOUS les liens d'email (reinitialisation de mot de passe,
      confirmation) redirigent vers localhost et echouent silencieusement
      pour le restaurateur.
- [ ] **Redirect URLs** : ajouter `https:///**`
      a la liste autorisee (sinon Supabase ignore le redirectTo demande par
      l'app et retombe sur le Site URL par defaut).
- [ ] A refaire si le domaine change apres coup (domaine personnalise ajoute plus tard).
- [ ] **SMTP personnalise (fortement recommande)** : Project Settings -> Authentication
      -> SMTP Settings -> utiliser le compte Resend deja configure pour les emails
      de reservation. Le mailer par defaut de Supabase est tres limite (quelques
      emails/heure) -> "429 over_email_send_rate_limit" des les premiers tests
      repetes de mot de passe oublie. Sans SMTP perso, prevenir le restaurateur
      de ne pas redemander un lien plusieurs fois de suite.

## 5. Contenu
- [ ] Se connecter a /gestion-a7x9k2 avec gerant@cote-jardin.fr.
- [ ] Saisir la carte, la galerie (upload photos), les partenaires, le plan de salle.
