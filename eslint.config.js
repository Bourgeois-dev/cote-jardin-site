// Configuration ESLint — volontairement minimale.
//
// OBJECTIF UNIQUE : attraper les erreurs qui CASSENT le site à l'exécution mais
// que TypeScript compile sans broncher. Le cas typique : un Hook appelé après
// un `return` conditionnel (règle des Hooks). Ce bug a mis le site hors ligne
// le 23/07/2026 alors que `tsc` et `esbuild` passaient tous les deux.
//
// Ce n'est PAS un linter de style : aucune règle de formatage, d'ordre des
// imports ou de préférence syntaxique. Uniquement des erreurs réelles, pour
// que le lint reste rapide et qu'aucun avertissement inutile ne vienne noyer
// les vrais problèmes.
//
// Branché sur `npm run build` : une erreur bloque le déploiement Netlify.
// Le site cassé n'atteint donc jamais la production.

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "supabase/functions/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // ── LA règle qui justifie tout ce fichier ────────────────────────────
      // Interdit d'appeler un Hook conditionnellement, dans une boucle, ou
      // après un `return` anticipé. Erreur bloquante, jamais un avertissement.
      "react-hooks/rules-of-hooks": "error",

      // Dépendances d'effet manquantes : source classique de bugs silencieux
      // (valeur figée, effet qui ne se relance pas). Averti sans bloquer, car
      // certaines omissions sont volontaires et documentées.
      "react-hooks/exhaustive-deps": "warn",

      // ── Bruit désactivé ─────────────────────────────────────────────────
      // `any` est utilisé à dessein pour les données Supabase peu typées.
      "@typescript-eslint/no-explicit-any": "off",
      // Les variables inutilisées préfixées d'un _ sont intentionnelles.
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
      }],
      // Les blocs catch vides sont volontaires (ex. lib/incident.ts : le
      // journal ne doit jamais casser le site).
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
