#!/usr/bin/env bash
# ============================================================
# deploy.sh — Côté jardin (cote-jardin)
# Cree et configure le projet Supabase dedie a ce client.
#
# Prerequis :
#   - supabase CLI installe et connecte : `supabase login`
#   - jq installe
#   - Variables d'environnement (NE PAS les ecrire dans ce fichier) :
#       SUPABASE_ORG_ID      id de votre organisation Supabase
#       RESEND_API_KEY       clef API Resend (emails transactionnels)
#       ADMIN_PASSWORD       mot de passe initial du compte admin
#       MAILCHIMP_API_KEY    optionnel — active la synchro CRM si fourni
#       MAILCHIMP_LIST_ID    optionnel — id de l'audience Mailchimp du client
#       MAILCHIMP_DC         optionnel — datacenter (ex. us21), deduit de la
#                             clef API si omis
#
# Usage : ./deploy.sh
# ============================================================
set -euo pipefail

SLUG="cote-jardin"
NAME="Côté jardin"
REGION=""
ADMIN_EMAIL="gerant@cote-jardin.fr"
RESEND_FROM_EMAIL="onboarding@resend.dev"

: "${SUPABASE_ORG_ID:?Definir SUPABASE_ORG_ID}"
: "${RESEND_API_KEY:?Definir RESEND_API_KEY}"
: "${ADMIN_PASSWORD:?Definir ADMIN_PASSWORD}"
# CRM Mailchimp optionnel — peut etre configure plus tard (voir mailchimp-mise-en-route.md)
MAILCHIMP_API_KEY="${MAILCHIMP_API_KEY:-}"
MAILCHIMP_LIST_ID="${MAILCHIMP_LIST_ID:-}"
MAILCHIMP_DC="${MAILCHIMP_DC:-}"

DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"

echo "==> 1/6 Creation du projet Supabase '$SLUG' ($REGION)"
CREATE_OUT=$(supabase projects create "$SLUG" \
  --org-id "$SUPABASE_ORG_ID" \
  --region "$REGION" \
  --db-password "$DB_PASSWORD" \
  --output json)
PROJECT_REF=$(echo "$CREATE_OUT" | jq -r '.id // .ref')
echo "    project ref : $PROJECT_REF"
echo "    db password : (genere, notez-le dans votre gestionnaire de mots de passe)"
echo "    -> $DB_PASSWORD"

echo "==> 2/6 Attente de la disponibilite du projet"
for i in $(seq 1 30); do
  STATUS=$(supabase projects list --output json \
    | jq -r ".[] | select(.id==\"$PROJECT_REF\") | .status" 2>/dev/null || echo "")
  [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
  echo "    statut: ${STATUS:-...} (tentative $i/30)"
  sleep 10
done

echo "==> 3/6 Lien local + push des migrations"
supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD"
supabase db push

echo "==> 4/6 Deploiement des edge functions"
# Deploie toutes les fonctions presentes dans supabase/functions/ (reservation-email,
# mailchimp-sync, et toute future fonction ajoutee au gabarit) — pas de nom en dur,
# pour ne jamais se desynchroniser du contenu reel du dossier.
if [ -d "supabase/functions" ]; then
  for fn_dir in supabase/functions/*/; do
    [ -d "$fn_dir" ] || continue
    fn_name="$(basename "$fn_dir")"
    echo "    -> $fn_name"
    supabase functions deploy "$fn_name" --project-ref "$PROJECT_REF" --no-verify-jwt
  done
else
  echo "    (dossier supabase/functions absent)"
fi

echo "==> 5/6 Secrets des edge functions"
SECRETS=(
  "RESEND_API_KEY=$RESEND_API_KEY"
  "RESTO_NAME=$NAME"
)
[ -n "$RESEND_FROM_EMAIL" ] && SECRETS+=("RESERVATION_FROM_EMAIL=$RESEND_FROM_EMAIL")
if [ -n "$MAILCHIMP_API_KEY" ]; then
  SECRETS+=("MAILCHIMP_API_KEY=$MAILCHIMP_API_KEY")
  [ -n "$MAILCHIMP_LIST_ID" ] && SECRETS+=("MAILCHIMP_LIST_ID=$MAILCHIMP_LIST_ID")
  [ -n "$MAILCHIMP_DC" ] && SECRETS+=("MAILCHIMP_DC=$MAILCHIMP_DC")
  echo "    CRM Mailchimp : secrets configures."
else
  echo "    CRM Mailchimp : non configure ici — voir mailchimp-mise-en-route.md pour l'activer plus tard."
fi
supabase secrets set "${SECRETS[@]}" --project-ref "$PROJECT_REF"

echo "==> 6/6 Creation du compte admin ($ADMIN_EMAIL)"
# La clef service_role n'est utilisee que localement, jamais ecrite sur disque.
SERVICE_ROLE_KEY=$(supabase projects api-keys --project-ref "$PROJECT_REF" --output json \
  | jq -r '.[] | select(.name=="service_role") | .api_key')

curl -sS -X POST "https://$PROJECT_REF.supabase.co/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"email_confirm\":true}" \
  | jq '{id, email, created_at}'

ANON_KEY=$(supabase projects api-keys --project-ref "$PROJECT_REF" --output json \
  | jq -r '.[] | select(.name=="anon") | .api_key')

cat <<EOF

============================================================
Projet '$NAME' pret.

A copier dans le .env du site (cote front, clefs PUBLIQUES uniquement) :

  VITE_SUPABASE_URL=https://$PROJECT_REF.supabase.co
  VITE_SUPABASE_ANON_KEY=$ANON_KEY

Rappels :
  - Ne JAMAIS exposer la clef service_role / secrete.
  - Verifier le domaine Resend pour l'envoi des emails.
  - Connexion admin : /gestion-a7x9k2 avec $ADMIN_EMAIL
$([ -z "$MAILCHIMP_API_KEY" ] && echo "  - CRM Mailchimp non configure : suivre mailchimp-mise-en-route.md quand le client est pret.")
============================================================
EOF
