# Edge Functions

## send-newsletter
Envoie une campagne newsletter, ou un e-mail unique (bienvenue, test). Accepte :
- `campaign_id` : UUID de la campagne dans newsletter_campaigns
- `override_email` + `override_name` : envoi à un seul destinataire (Welcome, test)

Un seul segment de ciblage : `optin` (tous les inscrits consentants, hors
adresses en échec). Voir `getRecipients()` — miroir de `newsletter_segment_counts()`
en base et de la constante SEGMENTS dans TabNewsletter.tsx.

Garde d'accès : JWT admin (getUser + lookup admin_users) OU header
`X-Internal-Secret`, sinon 403. Jamais un relais d'e-mail ouvert.

Secrets requis : RESEND_API_KEY, NEWSLETTER_FROM_EMAIL (repli : RESERVATION_FROM_EMAIL),
                 RESTO_NAME, SUPABASE_URL, SERVICE_ROLE_KEY

## newsletter-scheduler
Appelée par pg_cron chaque minute. Déclenche send-newsletter pour toutes les
campagnes dont status='scheduled' et scheduled_at <= now(), et envoie les
e-mails de bienvenue en attente.

Cron job : newsletter-scheduler (* * * * *)

## newsletter-unsubscribe
Désinscription par token (`leads.unsubscribe_token` → consent=false).
GET affiche une page de confirmation, seul POST désabonne : un scanner d'URL ne
doit jamais désinscrire quelqu'un. Gère aussi le one-click RFC 8058
(List-Unsubscribe-Post).

## resend-webhook
Reçoit les événements Resend (clics, bounces, plaintes) et les enregistre dans
newsletter_events. Les événements sans tag campaign_id sont ignorés.

## assistant-newsletter
Rédaction assistée par IA d'une campagne ou d'une bannière promo. Vérifie
is_admin() avant tout appel payant. Secret : ANTHROPIC_API_KEY.

## extraire-carte
Scan d'ardoise : lecture d'une photo de carte par IA vision, renvoie un JSON de
plats. N'écrit jamais en base — c'est le front qui insère après validation.
Secrets : ANTHROPIC_API_KEY, EXTRACTION_MODEL (défaut claude-haiku-4-5).
