-- ============================================================
-- SCHEMA — Côté Jardin (cote-jardin)
-- Instantané régénéré depuis provisioning-kit/templates/schema.sql
-- le 2026-07-29, après vérification contre la base déployée
-- (jdbxtygycrzqlyzqjpfg, eu-west-3). Fichier idempotent : il décrit
-- l'état cible de la base, il ne s'empile pas avec les précédents.
-- Genere par new-client.mjs — ne pas editer a la main,
-- modifier le template puis regenerer.
-- ============================================================

-- ------------------------------------------------------------
-- Filet de sécurité RLS — event trigger « ensure_rls ».
--
-- Toute table créée dans le schéma public reçoit automatiquement
-- « enable row level security ». Sans policy, Supabase bloque alors TOUT
-- accès : une table oubliée est inaccessible plutôt qu'ouverte en grand.
-- Ce schéma active déjà la RLS table par table ; le trigger couvre ce qui
-- serait créé plus tard (migration à chaud, table de travail, table ajoutée
-- depuis le dashboard).
--
-- Repris tel quel de la documentation Supabase (Authentication →
-- « Auto-enable RLS for new tables »). Cette option est OPT-IN : un projet
-- neuf ne l'a pas. On l'installe donc ici pour que chaque client en dispose
-- sans dépendre d'une case cochée à la main.
--
-- ⚠️ N'agit que sur les tables créées APRÈS son installation — d'où sa place
-- en tête de fichier, avant la première table.
-- ------------------------------------------------------------
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $rls$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null and cmd.schema_name in ('public') then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: RLS activee sur %', cmd.object_identity;
      exception when others then
        raise log 'rls_auto_enable: echec de l''activation sur %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: ignore % (schema %)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$rls$;

-- Pas de « create ... if not exists » pour les event triggers : on retire puis
-- on recree, ce qui rend le fichier rejouable sans erreur.
drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();


-- ------------------------------------------------------------
-- Comptes admin autorisés (multi-admin : équipe, accueil, etc.)
-- Le premier compte est injecté par le script depuis clients/<slug>.json
-- (champ admin.email). D'autres peuvent être ajoutés ensuite depuis
-- l'admin lui-même (onglet « Site & accès »).
-- ------------------------------------------------------------
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  label text default '',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Fonction is_admin() : vérifie l'appartenance à admin_users
-- (SECURITY DEFINER : lit la table avec les privilèges du propriétaire,
-- donc pas de blocage circulaire avec la policy RLS de admin_users)
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_users au
    join auth.users u on lower(u.email) = lower(au.email)
    where u.id = auth.uid()
  );
$$;


-- ------------------------------------------------------------
-- newsletter_segment_counts() : nombre de destinataires par segment. : compte les destinataires du segment.
--
-- Il n'en reste qu'un — « optin », tous les inscrits — depuis le retrait du
-- module Réservation et du CRM : la table `customers`, qui portait le statut
-- VIP, les compteurs de visites et les dates de dernière venue, n'existe plus.
-- La fonction conserve sa forme jsonb pour ne pas casser l'appel RPC côté
-- admin, et pour qu'un futur segment s'y ajoute sans changer le contrat.
--
-- TROIS ENDROITS doivent rester le miroir l'un de l'autre, sinon le nombre
-- affiché dans l'admin ne correspond pas aux envois réels :
--   1. cette fonction (comptage affiché dans l'admin)
--   2. getRecipients() dans l'edge function send-newsletter (envoi réel)
--   3. la constante SEGMENTS dans components/admin/TabNewsletter.tsx (libellés)
-- ------------------------------------------------------------
create or replace function public.newsletter_segment_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'optin', (
      select count(*)
      from public.leads l
      where l.consent = true and coalesce(l.email,'') <> ''
        -- Adresse en échec (bounce) : on cesse de lui écrire — protège la
        -- réputation d'expéditeur. MIROIR avec getOptinRecipients()
        -- (send-newsletter/index.ts) : même exclusion des deux côtés, sinon
        -- les compteurs affichés divergent des envois réels.
        and not exists (
          select 1 from public.newsletter_events e
          where e.type = 'bounced' and e.email = lower(l.email)
        )
    )
  ) into v;

  return v;
end;
$$;

-- ------------------------------------------------------------
-- Fonction is_editor() : réservée au studio La Table Digitale.
-- SECURITY DEFINER pour pouvoir lire auth.users sans exposer la table au rôle
-- appelant (sinon erreur 42501 "permission denied for table users").
-- ------------------------------------------------------------
create or replace function public.is_editor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) like '%@latable-digitale.fr'
  );
$$;

alter table public.admin_users enable row level security;
create policy "admin manage admin_users" on public.admin_users
  for all to authenticated using (is_admin()) with check (is_admin());

-- Comptes admin de départ.
-- 1) Le restaurateur, depuis cfg.admin.email dans clients/<slug>.json.
-- 2) Le studio (La Table Digitale), pour l'accompagnement et la maintenance.
-- D'autres accès se gèrent ensuite depuis l'admin (« Site & accès »).
--
-- ⚠️ Rappel : insérer un email ici ne crée PAS le compte de connexion.
-- Chaque email doit aussi exister dans Supabase Auth (Dashboard → Authentication
-- → Users → Add user), sinon is_admin() ne matchera jamais.
insert into public.admin_users (email, label) values
  ('gerant@cote-jardin.fr',                'Administrateur principal'),
  ('admin@latable-digitale.fr',      'La Table Digitale — studio'),
  ('bourgeois.v92@gmail.com',        'Victor — prestataire')
on conflict (email) do nothing;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  description text default '',
  price numeric(8,2),
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  alt text default '',
  caption text not null default '',
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  first_name text default '',
  last_name text default '',
  email text not null,
  phone text default '',
  zip text default '',
  source text not null default 'newsletter',
  consent           boolean not null default false,
  unsubscribe_token uuid    not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  welcome_sent      boolean not null default false,
  -- Horodatage de la désinscription (consent repassé à false). Null si jamais
  -- désinscrit. Alimenté par l'edge function newsletter-unsubscribe. Permet de
  -- mesurer les désinscriptions sur une période, pas seulement en volume total.
  unsubscribed_at   timestamptz,
  unique (email));

-- Index partiel : le scheduler ne balaie que les leads en attente de welcome.
create index if not exists leads_unsubscribed_at_idx
  on public.leads (unsubscribed_at)
  where unsubscribed_at is not null;

create index if not exists leads_welcome_pending
  on public.leads (created_at)
  where welcome_sent = false and consent = true;

create table if not exists public.promo_banner (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default false,
  title text default '',
  subtitle text default '',
  message text default '',
  cta_label text default '',
  cta_url text default '',
  image_url text default '',
  event_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Autre',
  description text default '',
  image_url text default '',
  website text default '',
  location text default '',
  partner_type text default '',
  featured boolean not null default false,
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists partners_display_order
  on public.partners (featured desc, position asc);

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  url text not null,
  position int not null default 0,
  is_active boolean not null default true
);

-- ------------------------------------------------------------
-- Feature flags : modules activables. Lecture par tout admin, écriture
-- réservée au studio (is_editor). La policy UPDATE passe par is_editor()
-- (SECURITY DEFINER) et NON par un select direct sur auth.users, qui
-- provoquerait une erreur 42501 "permission denied for table users".
-- ------------------------------------------------------------
create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  enabled boolean not null default true,
  description text default '',
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;
create policy "admin select features" on public.feature_flags
  for select to authenticated using (is_admin());
create policy "editor update features" on public.feature_flags
  for update to authenticated using (is_editor()) with check (is_editor());

create table if not exists public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null unique check (day_of_week between 0 and 6), -- 0 = Dimanche .. 6 = Samedi
  is_closed boolean not null default false,
  lunch_open text,
  lunch_close text,
  dinner_open text,
  dinner_close text
);

create table if not exists public.layout_settings (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique, -- hero | menu | gallery | story | contact
  variant text not null default 'default',
  updated_at timestamptz not null default now()
);

create table if not exists public.closure_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text default '',
  service text default null check (service in ('midi', 'soir') or service is null),
  note_interne text default '',
  created_at timestamptz not null default now()
);
create index if not exists closure_periods_range_idx
  on public.closure_periods (start_date, end_date);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  rating int not null default 5,   -- note sur 5
  content text not null,
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists reviews_position_idx
  on public.reviews (position);

alter table public.takeaway_items enable row level security;
create policy "anon select active takeaway" on public.takeaway_items
  for select using (is_active = true);
create policy "admin select takeaway" on public.takeaway_items
  for select to authenticated using (is_admin());
create policy "admin insert takeaway" on public.takeaway_items
  for insert to authenticated with check (is_admin());
create policy "admin update takeaway" on public.takeaway_items
  for update to authenticated using (is_admin());
create policy "admin delete takeaway" on public.takeaway_items
  for delete to authenticated using (is_admin());

create table if not exists public.takeaway_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  price numeric(8,2),
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- RLS — pattern 4 policies par table :
--   public/anon  : SELECT sur lignes actives uniquement
--   admin auth   : CRUD complet gate par is_admin()
-- ------------------------------------------------------------

-- Helper macro-like : on ecrit les policies explicitement par table.

alter table public.menu_items enable row level security;
create policy "anon select active" on public.menu_items
  for select using (is_active = true);
create policy "admin select" on public.menu_items
  for select to authenticated using (is_admin());
create policy "admin insert" on public.menu_items
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.menu_items
  for update to authenticated using (is_admin());
create policy "admin delete" on public.menu_items
  for delete to authenticated using (is_admin());

alter table public.gallery_images enable row level security;
create policy "anon select" on public.gallery_images
  for select using (true);
create policy "admin insert" on public.gallery_images
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.gallery_images
  for update to authenticated using (is_admin());
create policy "admin delete" on public.gallery_images
  for delete to authenticated using (is_admin());

alter table public.site_content enable row level security;
create policy "anon select" on public.site_content
  for select using (true);
create policy "admin insert" on public.site_content
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.site_content
  for update to authenticated using (is_admin());
create policy "admin delete" on public.site_content
  for delete to authenticated using (is_admin());

alter table public.leads enable row level security;
-- Le public peut s'inscrire (insert) mais jamais lire. Garde-fous anti-spam :
-- format email valide, et source contrainte. Les sources tracées par lien UTM
-- ("newsletter:instagram", "newsletter:qr-menu"...) sont autorisées via un slug
-- strict [a-z0-9_-]{1,32} : l'anon ne peut pas écrire de texte libre.
create policy "anon insert" on public.leads
  for insert with check (
    email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and (
      source = 'newsletter'
      or source ~ '^newsletter:[a-z0-9_-]{1,32}$'
    )
  );
-- Réinscription depuis le formulaire public (upsert on conflict email) :
-- l'anon peut repasser consent à true, avec les mêmes garde-fous sur source.
create policy "anon_resubscribe" on public.leads
  for update using (true) with check (
    consent = true
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and (
      source = 'newsletter'
      or source ~ '^newsletter:[a-z0-9_-]{1,32}$'
    )
  );
-- Désinscription via lien email (consent -> false) sans authentification.
create policy "anon_unsubscribe" on public.leads
  for update using (true) with check (consent = false);
create policy "admin select" on public.leads
  for select to authenticated using (is_admin());

-- ── Inscription newsletter depuis le site public ────────────────────────────
-- ⚠️ NE PAS remplacer par un .upsert() côté client : PostgREST le traduit en
-- INSERT ... ON CONFLICT, qui exige un droit de SELECT sur `leads`. Or `anon`
-- n'en a aucun (et ne doit pas en avoir : la liste des emails serait
-- publiquement lisible). Sans cette fonction, toute RÉINSCRIPTION d'une adresse
-- déjà connue échoue en 42501 — bug vu en production, symptôme « Une erreur est
-- survenue » côté visiteur.
-- Trois statuts distincts sont renvoyés ('nouveau', 'reactive', 'deja_inscrit')
-- pour que le formulaire public puisse dire au visiteur qu'il est DÉJÀ inscrit
-- au lieu de lui réafficher un « Merci ! » trompeur à chaque soumission.
create or replace function public.inscrire_newsletter_statut(
  p_email text, p_first_name text default '', p_last_name text default '',
  p_source text default 'newsletter'
) returns text
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_source  text := coalesce(nullif(btrim(p_source), ''), 'newsletter');
  v_prenom  text := btrim(coalesce(p_first_name, ''));
  v_nom     text := btrim(coalesce(p_last_name, ''));
  v_consent boolean;
begin
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'invalide';
  end if;
  if v_source <> 'newsletter'
     and v_source !~ '^newsletter:[a-z0-9_-]{1,32}$' then
    v_source := 'newsletter';
  end if;

  -- Recherche insensible à la casse : d'anciennes fiches saisies à la main
  -- côté admin peuvent contenir des majuscules, la contrainte unique porte
  -- elle sur la valeur brute.
  select consent into v_consent
    from public.leads where lower(email) = v_email
    order by created_at limit 1;

  if not found then
    -- `on conflict do nothing` rend l'insertion atomique : deux visiteurs qui
    -- soumettent la même adresse au même instant ne créent pas de doublon.
    insert into public.leads (first_name, last_name, email, source, consent)
    values (v_prenom, v_nom, v_email, v_source, true)
    on conflict (email) do nothing;
    if found then
      return 'nouveau';
    end if;
    select consent into v_consent
      from public.leads where lower(email) = v_email
      order by created_at limit 1;
    if not found then
      return 'invalide';
    end if;
  end if;

  if v_consent then
    -- Déjà inscrit : on ne touche ni au consentement ni à la source. On se
    -- contente de compléter les nom/prénom restés vides — aucune donnée
    -- existante n'est écrasée.
    update public.leads
       set first_name = case when btrim(coalesce(first_name, '')) = '' then v_prenom else first_name end,
           last_name  = case when btrim(coalesce(last_name,  '')) = '' then v_nom    else last_name  end
     where lower(email) = v_email;
    return 'deja_inscrit';
  end if;

  -- Adresse connue mais désinscrite : c'est une vraie réinscription.
  update public.leads
     set consent    = true,
         source     = v_source,
         first_name = case when btrim(coalesce(first_name, '')) = '' then v_prenom else first_name end,
         last_name  = case when btrim(coalesce(last_name,  '')) = '' then v_nom    else last_name  end
   where lower(email) = v_email;
  return 'reactive';
end;
$$;

revoke all on function public.inscrire_newsletter_statut(text, text, text, text) from public;
grant execute on function public.inscrire_newsletter_statut(text, text, text, text) to anon, authenticated;

-- Façade historique : même signature, même type de retour qu'avant, pour ne
-- rien casser chez les appelants existants (bloc Newsletter du site).
create or replace function public.inscrire_newsletter(
  p_email text, p_first_name text default '', p_last_name text default '',
  p_source text default 'newsletter'
) returns boolean
language sql security definer set search_path to 'public'
as $$
  select public.inscrire_newsletter_statut(p_email, p_first_name, p_last_name, p_source) <> 'invalide';
$$;

revoke all on function public.inscrire_newsletter(text, text, text, text) from public;
grant execute on function public.inscrire_newsletter(text, text, text, text) to anon, authenticated;

create policy "admin update" on public.leads
  for update to authenticated using (is_admin());
create policy "admin delete" on public.leads
  for delete to authenticated using (is_admin());

alter table public.promo_banner enable row level security;
create policy "anon select active" on public.promo_banner
  for select using (is_active = true);
create policy "admin select" on public.promo_banner
  for select to authenticated using (is_admin());
create policy "admin insert" on public.promo_banner
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.promo_banner
  for update to authenticated using (is_admin());
create policy "admin delete" on public.promo_banner
  for delete to authenticated using (is_admin());

alter table public.partners enable row level security;
create policy "anon select active" on public.partners
  for select using (is_active = true);
create policy "admin select" on public.partners
  for select to authenticated using (is_admin());
create policy "admin insert" on public.partners
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.partners
  for update to authenticated using (is_admin());
create policy "admin delete" on public.partners
  for delete to authenticated using (is_admin());

alter table public.social_links enable row level security;
create policy "anon select active" on public.social_links
  for select using (is_active = true);
create policy "admin select" on public.social_links
  for select to authenticated using (is_admin());
create policy "admin insert" on public.social_links
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.social_links
  for update to authenticated using (is_admin());
create policy "admin delete" on public.social_links
  for delete to authenticated using (is_admin());

alter table public.opening_hours enable row level security;
create policy "anon select" on public.opening_hours
  for select using (true);
create policy "admin insert" on public.opening_hours
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.opening_hours
  for update to authenticated using (is_admin());
create policy "admin delete" on public.opening_hours
  for delete to authenticated using (is_admin());

alter table public.layout_settings enable row level security;
create policy "anon select" on public.layout_settings
  for select using (true);
create policy "admin insert" on public.layout_settings
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.layout_settings
  for update to authenticated using (is_admin());
create policy "admin delete" on public.layout_settings
  for delete to authenticated using (is_admin());

alter table public.closure_periods enable row level security;
-- Le public lit les fermetures (le widget en a besoin pour bloquer les dates)
create policy "anon select" on public.closure_periods
  for select using (true);
create policy "admin insert" on public.closure_periods
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.closure_periods
  for update to authenticated using (is_admin());
create policy "admin delete" on public.closure_periods
  for delete to authenticated using (is_admin());

alter table public.reviews enable row level security;
create policy "anon select active" on public.reviews
  for select using (is_active = true);
create policy "admin select" on public.reviews
  for select to authenticated using (is_admin());
create policy "admin insert" on public.reviews
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.reviews
  for update to authenticated using (is_admin());
create policy "admin delete" on public.reviews
  for delete to authenticated using (is_admin());

-- ------------------------------------------------------------
-- Storage : buckets publics gallery + partners
-- (lecture publique par URL directe, ecriture admin uniquement)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('partners', 'partners', true)
on conflict (id) do nothing;

-- Note : les policies Storage utilisent auth.role() = 'authenticated' et non is_admin()
-- car is_admin() (SECURITY DEFINER) n'est pas fiable dans le contexte Storage de Supabase.
-- L'accès est suffisamment protégé : seul l'admin peut se connecter via Supabase Auth.
create policy "admin write gallery" on storage.objects
  for insert to authenticated with check (bucket_id = 'gallery');
create policy "admin update gallery" on storage.objects
  for update to authenticated using (bucket_id = 'gallery');
create policy "admin delete gallery" on storage.objects
  for delete to authenticated using (bucket_id = 'gallery');
create policy "admin list gallery" on storage.objects
  for select to authenticated using (bucket_id = 'gallery');

create policy "admin write partners" on storage.objects
  for insert to authenticated with check (bucket_id = 'partners');
create policy "admin update partners" on storage.objects
  for update to authenticated using (bucket_id = 'partners');
create policy "admin delete partners" on storage.objects
  for delete to authenticated using (bucket_id = 'partners');
create policy "admin list partners" on storage.objects
  for select to authenticated using (bucket_id = 'partners');

-- ============================================================
-- NEWSLETTER CAMPAIGNS
-- Historique + planification des campagnes email.
-- Statuts : draft → scheduled → sending → sent / failed
-- Edge functions : send-newsletter, newsletter-scheduler
-- Cron : newsletter-scheduler (* * * * *)
-- ============================================================
create table if not exists public.newsletter_campaigns (
  id               uuid primary key default gen_random_uuid(),
  template         text not null,
  segment          text not null,
  subject          text not null,
  content          jsonb not null default '{}',
  scheduled_at     timestamptz,
  sent_at          timestamptz,
  status           text not null default 'draft',
  recipients_count int,
  sent_count       int default 0,
  error_message    text,
  folder           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_nl_template check (template in ('welcome','evenementiel','nouveau_menu','vie_resto')),
  constraint chk_nl_segment  check (segment  in ('optin','optin_vip')),
  constraint chk_nl_status   check (status   in ('draft','scheduled','sending','sent','failed'))
);

-- Valeurs autorisées pour les campagnes.
-- template : 'blocs' = campagne libre (système de blocs, seul proposé à la création).
--   Les autres sont conservés pour l'historique et pour 'welcome' (email de bienvenue
--   automatique déclenché à l'inscription, pas une campagne éditoriale).
-- segment  : doit rester synchronisé avec SEGMENTS (TabNewsletter.tsx),
--   getRecipients() (edge send-newsletter) et newsletter_segment_counts().
alter table public.newsletter_campaigns drop constraint if exists chk_template;
alter table public.newsletter_campaigns add constraint chk_template
  check (template = any (array['blocs','welcome','evenementiel','nouveau_menu','vie_resto']));
alter table public.newsletter_campaigns drop constraint if exists chk_segment;
alter table public.newsletter_campaigns add constraint chk_segment
  check (segment = any (array[
    'optin','optin_vip','habitues','une_visite','inactif_3_6','inactif_7',
    -- anciens segments conservés pour l'historique des campagnes
    'inactif_1_2','inactif_3_4','inactif_5_6','jamais_venu'
  ]));
alter table public.newsletter_campaigns drop constraint if exists chk_status;
alter table public.newsletter_campaigns add constraint chk_status
  check (status = any (array['draft','scheduled','sending','sent','failed']));


create index if not exists newsletter_campaigns_status_idx
  on public.newsletter_campaigns (status, scheduled_at);

create index if not exists newsletter_campaigns_folder_idx
  on public.newsletter_campaigns (folder);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_newsletter_updated_at on public.newsletter_campaigns;
create trigger trg_newsletter_updated_at
  before update on public.newsletter_campaigns
  for each row execute function public.touch_updated_at();

alter table public.newsletter_campaigns enable row level security;
create policy "admin_all_newsletter_campaigns" on public.newsletter_campaigns
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.newsletter_campaigns;

-- Envois individuels (tracking par destinataire)
create table if not exists public.newsletter_sends (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  email       text not null,
  name        text,
  sent_at     timestamptz default now(),
  error       text
);
create index if not exists newsletter_sends_campaign_idx on public.newsletter_sends (campaign_id);
alter table public.newsletter_sends enable row level security;
create policy "admin_all_newsletter_sends" on public.newsletter_sends
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Registre des dossiers de campagnes (permet les dossiers vides persistants).
create table if not exists public.newsletter_events (
  -- Événements Resend par destinataire (webhook resend-webhook).
  -- Unicité (campaign_id, email, type) : on compte les PERSONNES qui ont
  -- cliqué, pas les clics répétés — le chiffre honnête pour un taux.
  -- Écriture : uniquement l'edge function resend-webhook (service role).
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  email       text not null,
  type        text not null check (type in ('clicked','bounced','complained','unsubscribed')),
  url         text,
  created_at  timestamptz not null default now(),
  constraint uq_nl_event unique (campaign_id, email, type)
);
create index if not exists nl_events_campaign_idx on public.newsletter_events (campaign_id, type);
alter table public.newsletter_events enable row level security;
drop policy if exists "admin read events" on public.newsletter_events;
create policy "admin read events" on public.newsletter_events
  for select to authenticated using (is_admin());

-- Clics et bounces par campagne (délivrés = sent_count - bounces, côté client).
drop function if exists public.newsletter_click_counts();
create or replace function public.newsletter_event_counts()
returns table (campaign_id uuid, clicks bigint, bounces bigint, complaints bigint, unsubscribes bigint)
language sql
security definer
set search_path to 'public'
as $$
  select e.campaign_id,
         count(*) filter (where e.type = 'clicked')::bigint,
         count(*) filter (where e.type = 'bounced')::bigint,
         count(*) filter (where e.type = 'complained')::bigint,
         count(*) filter (where e.type = 'unsubscribed')::bigint
  from public.newsletter_events e
  where public.is_admin()
  group by e.campaign_id
$$;
grant execute on function public.newsletter_event_counts() to authenticated;

create table if not exists public.newsletter_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);
alter table public.newsletter_folders enable row level security;
create policy "admin_all_newsletter_folders" on public.newsletter_folders
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- BUCKET "menu" — carte téléchargeable (PDF/PNG/JPG)
-- Lecture publique (téléchargement visiteurs), écriture/suppression admin.
-- L'URL du fichier est stockée dans site_content (clé "menu_file").
-- ============================================================
insert into storage.buckets (id, name, public)
values ('menu', 'menu', true)
on conflict (id) do nothing;

drop policy if exists "admin insert menu" on storage.objects;
drop policy if exists "admin update menu" on storage.objects;
drop policy if exists "admin delete menu" on storage.objects;
create policy "admin insert menu" on storage.objects
  for insert to authenticated with check (bucket_id = 'menu');
create policy "admin update menu" on storage.objects
  for update to authenticated using (bucket_id = 'menu');
create policy "admin delete menu" on storage.objects
  for delete to authenticated using (bucket_id = 'menu');
