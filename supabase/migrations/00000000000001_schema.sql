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
-- Comptes admin autorisés (multi-admin : équipe, accueil, etc.)
-- Le premier compte est injecté par le script depuis clients/<slug>.json
-- (champ admin.email). D'autres peuvent être ajoutés ensuite depuis
-- l'admin lui-même (onglet « Réservations & site »).
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
-- newsletter_segment_counts() : nombre de destinataires par segment.
-- Base commune : leads.consent = true (RGPD — on n'écrit qu'aux consentants).
--
-- 6 segments, chacun correspondant à une intention distincte du restaurateur.
-- Volontairement peu nombreux : multiplier les tranches d'inactivité n'apporte
-- rien (le message de reconquête est le même) et noie la liste.
--
-- ⚠️ TROIS ENDROITS DOIVENT RESTER COHÉRENTS, sinon le nombre annoncé ne
-- correspond pas aux envois réels :
--   1. cette fonction (comptage affiché dans l'admin)
--   2. getRecipients() dans l'edge function send-newsletter (envoi réel)
--   3. la constante SEGMENTS dans components/admin/TabNewsletter.tsx (libellés)
--
-- La tranche « inactif_7 » est OUVERTE (pas de limite haute) : sans cela, un
-- client absent depuis très longtemps n'appartient à aucun segment et devient
-- inciblable — le bug corrigé le 23/07.
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

  with base as (
    select lower(l.email) as email
    from public.leads l
    where l.consent = true and coalesce(l.email,'') <> ''
  ),
  joined as (
    select b.email, c.is_vip, c.last_visit, c.bookings_count
    from base b
    left join public.customers c on lower(c.email) = b.email
  )
  select jsonb_build_object(
    'optin',       (select count(*) from base),
    'optin_vip',   (select count(*) from joined where is_vip),
    -- Habitués : fidélité mesurée automatiquement, sans marquage manuel
    'habitues',    (select count(*) from joined where coalesce(bookings_count,0) >= 3),
    -- Absence notable, relance encore facile
    'inactif_3_6', (select count(*) from joined where last_visit is not null
                      and last_visit <= current_date - interval '3 months'
                      and last_visit >  current_date - interval '7 months'),
    -- Reconquête : 7 mois et plus, tranche ouverte
    'inactif_7',   (select count(*) from joined where last_visit is not null
                      and last_visit <= current_date - interval '7 months'),
    -- Ont testé une fois et ne sont pas revenus
    'une_visite',  (select count(*) from joined where coalesce(bookings_count,0) = 1)
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
-- D'autres accès se gèrent ensuite depuis l'admin (« Réservations & site »).
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
  unique (email));

-- Index partiel : le scheduler ne balaie que les leads en attente de welcome.
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

create table if not exists public.reservation_settings (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  phone_threshold int not null default 8,
  min_advance_hours int not null default 2,
  slot_duration int not null default 30,
  booking_horizon_days int not null default 60,
  newsletter_optin boolean not null default true,
  max_covers_per_slot int default null,  -- null = fallback sur capacité physique des tables (plafond par service midi/soir)
  waitlist_enabled boolean not null default false,   -- propose la liste d'attente quand un créneau est complet
  reminder_enabled boolean not null default true,    -- e-mail de rappel J-1 (cron reservation-reminders)
  table_duration int not null default 90
    constraint reservation_settings_table_duration_check check (table_duration between 30 and 300),
  -- Confirmation automatique des réservations en ligne. reserve_table() vérifie
  -- déjà tout (horaires, fermetures, capacité, tables) : la validation manuelle
  -- n'ajoutait aucune décision, elle faisait seulement attendre le client.
  -- Défaut false : aucun client existant ne change de comportement sans action.
  auto_confirm boolean not null default false,
  auto_confirm_same_day boolean not null default false,
  auto_confirm_block_noshow int not null default 1
    constraint rs_auto_confirm_block_noshow_check check (auto_confirm_block_noshow between 0 and 10),
    -- Durée d'occupation d'une table (minutes). Réglable dans « Réservations & site ».
    -- Lue par check_availability (dispo côté site) ET par le plan de service
    -- (rotation des tables) : les deux vues restent ainsi cohérentes.
  updated_at timestamptz not null default now()
);

create table if not exists public.dining_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  -- Fermeture temporaire (terrasse sous la pluie, salle privatisée).
  -- Une zone inactive sort du calcul de disponibilité : le site cesse
  -- d'accepter des réservations sur cette capacité, au lieu de promettre des
  -- tables hors service. Les tables et réservations placées sont conservées.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  capacity int not null default 2,
  online_limit int not null default 2,
  pos_x numeric not null default 0,
  pos_y numeric not null default 0,
  shape text not null default 'square', -- square | round | rect
  is_active boolean not null default true,
  area_id uuid references public.dining_areas(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  table_id uuid references public.restaurant_tables(id),
  date date not null,
  time text not null, -- "HH:MM"
  covers int not null,
  customer_name text not null,
  email text default '',
  phone text not null,
  notes text default '',
  status text not null default 'attente', -- attente | confirme | annule | no_show
  source text not null default 'site', -- site | telephone
  created_at timestamptz not null default now(),
  constraint chk_customer_name_length check (length(customer_name) <= 100),
  constraint chk_phone_length         check (length(phone) <= 30),
  constraint chk_notes_length         check (length(notes) <= 1000)
);

create index if not exists reservations_date_idx
  on public.reservations (date, time);
create index if not exists reservations_table_idx
  on public.reservations (table_id, date);

create table if not exists public.closure_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text default '',
  blocks_reservations boolean not null default true,
  service text default null check (service in ('midi', 'soir') or service is null),
  note_interne text default '',
  custom_message text default '',
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
      source in ('newsletter', 'reservation')
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
      source in ('newsletter', 'reservation')
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
  if v_source <> 'newsletter' and v_source <> 'reservation'
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
-- rien casser chez les appelants existants (ReservationWidget).
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

alter table public.reservation_settings enable row level security;
create policy "anon select enabled" on public.reservation_settings
  for select using (enabled = true);
create policy "admin select" on public.reservation_settings
  for select to authenticated using (is_admin());
create policy "admin insert" on public.reservation_settings
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.reservation_settings
  for update to authenticated using (is_admin());
create policy "admin delete" on public.reservation_settings
  for delete to authenticated using (is_admin());

alter table public.restaurant_tables enable row level security;
create policy "anon select active" on public.restaurant_tables
  for select using (is_active = true);
create policy "admin select" on public.restaurant_tables
  for select to authenticated using (is_admin());
create policy "admin insert" on public.restaurant_tables
  for insert to authenticated with check (is_admin());
create policy "admin update" on public.restaurant_tables
  for update to authenticated using (is_admin());
create policy "admin delete" on public.restaurant_tables
  for delete to authenticated using (is_admin());

alter table public.dining_areas enable row level security;
create policy "anon select areas" on public.dining_areas
  for select using (true);
create policy "admin all areas" on public.dining_areas
  for all to authenticated using (is_admin()) with check (is_admin());

alter table public.reservations enable row level security;
-- Le public peut creer une reservation et lire les creneaux occupes
-- (lecture limitee : le widget a besoin de connaitre les conflits).
-- NB : si vous preferez ne rien exposer, remplacez ce SELECT par une
-- fonction RPC SECURITY DEFINER qui ne retourne que (date, time_slot, table_id).
-- Garde-fous anti-forgerie : un visiteur ne peut pas s'auto-confirmer,
-- s'attribuer une table directement, ni usurper la source "telephone"
-- (reservee a l'admin via la policy "admin all").
create policy "anon insert" on public.reservations
  for insert with check (
    status = 'attente'
    and source = 'site'
    and table_id is null
    and covers > 0
    and length(trim(customer_name)) > 0
    and length(trim(phone)) > 0
  );
create policy "anon select availability" on public.reservations
  for select using (status <> 'annule');
create policy "admin insert" on public.reservations
  for insert to authenticated with check (is_admin());
create policy "admin select" on public.reservations
  for select to authenticated using (is_admin());
create policy "admin update" on public.reservations
  for update to authenticated using (is_admin());
create policy "admin delete" on public.reservations
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

-- Temps réel sur les réservations (pour l'affichage live + pastille de notification dans l'admin)
alter publication supabase_realtime add table public.reservations;

-- ============================================================
-- FICHES CLIENT (CRM) — table customers + rattachement automatique
-- Idempotent. Place en fin de schema : reservations et is_admin() existent deja.
-- ============================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text default '',
  phone text default '',
  is_vip boolean not null default false,
  notes text default '',
  bookings_count int not null default 0,
  covers_total int not null default 0,
  no_show_count int not null default 0,
  cancelled_count int not null default 0,
  first_visit date,
  last_visit date,
  created_at timestamptz not null default now()
);
create unique index if not exists customers_email_uidx
  on public.customers (lower(email)) where email <> '';
create unique index if not exists customers_phone_uidx
  on public.customers (phone) where phone <> '';

-- Index de recherche/tri pour l'onglet Clients (scalabilité).
-- pg_trgm : seul type d'index accélérant les ILIKE '%terme%' (recherche par fragment).
create extension if not exists pg_trgm;
create index if not exists customers_name_trgm       on public.customers using gin (lower(name)  gin_trgm_ops);
create index if not exists customers_email_trgm      on public.customers using gin (lower(email) gin_trgm_ops);
create index if not exists customers_phone_trgm      on public.customers using gin (phone gin_trgm_ops);
create index if not exists customers_last_visit_idx  on public.customers (last_visit desc nulls last);
create index if not exists customers_bookings_idx    on public.customers (bookings_count desc);

alter table public.reservations
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists reservations_customer_idx
  on public.reservations (customer_id);

create or replace function public.recompute_customer(cid uuid)
returns void language sql security definer set search_path = public as $$
  update public.customers c set
    bookings_count = coalesce(s.cnt, 0),
    covers_total   = coalesce(s.cov, 0),
    no_show_count  = coalesce(s.ns, 0),
    cancelled_count= coalesce(s.ann, 0),
    first_visit    = s.first_v,
    last_visit     = s.last_v
  from (
    select
      count(*) filter (where status <> 'annule')                as cnt,
      coalesce(sum(covers) filter (where status <> 'annule'),0) as cov,
      count(*) filter (where status = 'no_show')                as ns,
      count(*) filter (where status = 'annule')                 as ann,
      min(date) filter (where status <> 'annule')               as first_v,
      max(date) filter (where status <> 'annule')               as last_v
    from public.reservations where customer_id = cid
  ) s where c.id = cid;
$$;

-- Garde le nom le plus complet entre celui de la fiche et celui d'une nouvelle
-- réservation. Le nouveau ne l'emporte que s'il CONTIENT tout l'ancien et ajoute
-- au moins un mot : une saisie téléphone au seul prénom (« Victor ») ne peut donc
-- plus chasser « Victor Bourgeois ». Une vraie correction d'orthographe se fait
-- dans l'onglet Clients — geste explicite, pas effet de bord d'une prise de
-- réservation pressée.
create or replace function public.nom_plus_complet(p_actuel text, p_nouveau text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_actuel  text := btrim(regexp_replace(coalesce(p_actuel, ''),  '\s+', ' ', 'g'));
  v_nouveau text := btrim(regexp_replace(coalesce(p_nouveau, ''), '\s+', ' ', 'g'));
  v_mots_actuel  text[];
  v_mots_nouveau text[];
begin
  if v_nouveau = '' then return v_actuel;  end if;
  if v_actuel  = '' then return v_nouveau; end if;

  v_mots_actuel  := string_to_array(lower(v_actuel),  ' ');
  v_mots_nouveau := string_to_array(lower(v_nouveau), ' ');

  -- `<@` : tous les mots de l'actuel figurent dans le nouveau.
  if v_mots_actuel <@ v_mots_nouveau
     and array_length(v_mots_nouveau, 1) > array_length(v_mots_actuel, 1) then
    return v_nouveau;
  end if;

  return v_actuel;
end;
$$;

create or replace function public.attach_customer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  norm_email text := nullif(lower(trim(coalesce(new.email, ''))), '');
  norm_phone text := nullif(trim(coalesce(new.phone, '')), '');
begin
  if norm_email is not null then
    select id into cid from public.customers where lower(email) = norm_email limit 1;
  end if;
  if cid is null and norm_phone is not null then
    select id into cid from public.customers where phone = norm_phone limit 1;
  end if;
  if cid is null then
    insert into public.customers (name, email, phone)
    values (coalesce(new.customer_name, ''), coalesce(norm_email, ''), coalesce(norm_phone, ''))
    returning id into cid;
  else
    -- Enrichissement seulement : ni l'e-mail, ni le téléphone, ni le nom déjà
    -- renseignés ne sont écrasés par une saisie plus pauvre.
    update public.customers set
      email = case when email = '' and norm_email is not null then norm_email else email end,
      phone = case when phone = '' and norm_phone is not null then norm_phone else phone end,
      name  = public.nom_plus_complet(name, new.customer_name)
    where id = cid;
  end if;
  new.customer_id := cid;
  return new;
end;
$$;

drop trigger if exists trg_attach_customer on public.reservations;
create trigger trg_attach_customer
  before insert or update of email, phone, customer_name on public.reservations
  for each row execute function public.attach_customer();

create or replace function public.refresh_customer_counters()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.customer_id is not null then perform public.recompute_customer(old.customer_id); end if;
    return old;
  end if;
  if new.customer_id is not null then perform public.recompute_customer(new.customer_id); end if;
  if tg_op = 'UPDATE' and old.customer_id is not null and old.customer_id is distinct from new.customer_id then
    perform public.recompute_customer(old.customer_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refresh_counters on public.reservations;
create trigger trg_refresh_counters
  after insert or update or delete on public.reservations
  for each row execute function public.refresh_customer_counters();

alter table public.customers enable row level security;
drop policy if exists "admin select customers" on public.customers;
drop policy if exists "admin insert customers" on public.customers;
drop policy if exists "admin update customers" on public.customers;
drop policy if exists "admin delete customers" on public.customers;
create policy "admin select customers" on public.customers for select to authenticated using (is_admin());
create policy "admin insert customers" on public.customers for insert to authenticated with check (is_admin());
create policy "admin update customers" on public.customers for update to authenticated using (is_admin());
create policy "admin delete customers" on public.customers for delete to authenticated using (is_admin());

-- Temps reel pour l'onglet Clients
alter publication supabase_realtime add table public.customers;

-- ============================================================
-- DISPONIBILITE EN LIGNE — check_availability()
-- Le widget public verifie qu'une combinaison de tables libres (capacite reelle)
-- couvre le nombre de couverts, sur une fenetre d'occupation de +/- 90 min.
-- SECURITY DEFINER : lit tables + reservations en interne sans les exposer a anon.
-- Sert au widget (affichage des creneaux) ET de garde-fou avant insertion.
-- ============================================================
create or replace function public.check_availability(
  p_date date,
  p_time text,
  p_covers int
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  slot_min int;
  cumul int := 0;
  rec record;
begin
  if p_covers is null or p_covers < 1 then return false; end if;
  slot_min := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
  for rec in
    select t.capacity
    from public.restaurant_tables t
    where t.is_active
      and not exists (
        select 1 from public.reservations r
        where r.table_id = t.id
          and r.date = p_date
          and r.status <> 'annule'
          and abs(
                (split_part(r.time, ':', 1)::int * 60 + split_part(r.time, ':', 2)::int) - slot_min
              ) < 90
      )
    order by t.capacity desc
  loop
    cumul := cumul + rec.capacity;
    if cumul >= p_covers then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

grant execute on function public.check_availability(date, text, int) to anon, authenticated;

-- ============================================================
-- REGROUPEMENT DE TABLES — une réservation peut occuper plusieurs tables
-- (ex. 2+2 pour 4 couverts). table_ids = liste ; table_id = première table
-- (compat affichage), maintenu en phase par un trigger.
-- Place APRES check_availability : on la redéfinit pour lire table_ids.
-- ============================================================
alter table public.reservations
  add column if not exists table_ids uuid[] not null default '{}';

-- Backfill : les réservations déjà placées -> table_ids = [table_id]
update public.reservations
  set table_ids = array[table_id]
  where table_id is not null and (table_ids is null or array_length(table_ids,1) is null);

create or replace function public.sync_table_id()
returns trigger language plpgsql as $$
begin
  if new.table_ids is null then new.table_ids := '{}'; end if;
  new.table_id := case when array_length(new.table_ids,1) >= 1 then new.table_ids[1] else null end;
  return new;
end;
$$;

drop trigger if exists trg_sync_table_id on public.reservations;
create trigger trg_sync_table_id
  before insert or update of table_ids on public.reservations
  for each row execute function public.sync_table_id();

-- check_availability : disponibilité d'un créneau pour le widget public.
-- Triple contrôle :
--   0) HORAIRES D'OUVERTURE : créneau dans un service ouvert ce jour-là
--      (cohérence avec reserve_table — le widget n'affiche pas les jours fermés).
--   1) PLAFOND PAR SERVICE (midi/soir) : somme des couverts du service entier
--      ne doit pas dépasser max_covers_per_slot. Si null, fallback capacité physique.
--   2) DISPONIBILITÉ PHYSIQUE : tables libres sur la fenêtre de rotation
--      définie par reservation_settings.table_duration (défaut 90 min).
-- Frontière midi/soir : 960 min = 16h00.
create or replace function public.check_availability(
  p_date date, p_time text, p_covers int
)
returns boolean language plpgsql security definer set search_path = public stable as $$
declare
  slot_min       int;
  cumul          int := 0;
  rec            record;
  max_per_slot   int;
  already_booked int;
  v_service_min  int;
  v_service_max  int;
  v_day          int;
  v_is_open      boolean;
  v_duree        int;
begin
  if p_covers is null or p_covers < 1 then return false; end if;
  slot_min := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;

  -- 0) Horaires d'ouverture
  v_day := extract(dow from p_date)::int;
  select (
    not is_closed and (
      (lunch_open is not null and lunch_close is not null
        and slot_min >= (split_part(lunch_open,':',1)::int*60+split_part(lunch_open,':',2)::int)
        and slot_min <  (split_part(lunch_close,':',1)::int*60+split_part(lunch_close,':',2)::int))
      or
      (dinner_open is not null and dinner_close is not null
        and slot_min >= (split_part(dinner_open,':',1)::int*60+split_part(dinner_open,':',2)::int)
        and slot_min <  (split_part(dinner_close,':',1)::int*60+split_part(dinner_close,':',2)::int))
    )
  ) into v_is_open from public.opening_hours where day_of_week = v_day;
  if not coalesce(v_is_open, false) then return false; end if;

  -- 1) Plafond par service entier
  if slot_min < 960 then v_service_min := 0; v_service_max := 960;
  else v_service_min := 960; v_service_max := 1440; end if;

  -- Durée d'occupation d'une table, paramétrable (défaut 90 min)
  select coalesce(table_duration, 90) into v_duree from public.reservation_settings limit 1;
  v_duree := coalesce(v_duree, 90);

  select max_covers_per_slot into max_per_slot from public.reservation_settings limit 1;
  if max_per_slot is null then
    select coalesce(sum(t.capacity), 0) into max_per_slot
      from public.restaurant_tables t
      left join public.dining_areas a on a.id = t.area_id
      where t.is_active and coalesce(a.is_active, true);
  end if;

  if max_per_slot is not null and max_per_slot > 0 then
    select coalesce(sum(r.covers), 0) into already_booked
      from public.reservations r
      where r.date = p_date
        and r.status <> 'annule'
        and (split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) >= v_service_min
        and (split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) <  v_service_max;
    if already_booked + p_covers > max_per_slot then return false; end if;
  end if;

  -- 2) Disponibilité physique (fenêtre = table_duration)
  for rec in
    select t.capacity from public.restaurant_tables t
    left join public.dining_areas a on a.id = t.area_id
    where t.is_active and coalesce(a.is_active, true)
      and not exists (
        select 1 from public.reservations r
        where r.date = p_date
          and r.status <> 'annule'
          and t.id = any(r.table_ids)
          and abs(
                (split_part(r.time, ':', 1)::int * 60 + split_part(r.time, ':', 2)::int) - slot_min
              ) < v_duree
      )
    order by t.capacity desc
  loop
    cumul := cumul + rec.capacity;
    if cumul >= p_covers then return true; end if;
  end loop;
  return false;
end;
$$;

-- ============================================================
-- RÉSERVATION ATOMIQUE — check_availability_locked + reserve_table
-- check_availability_locked : version verrouillée (anti race condition) qui
--   RETOURNE les tables à assigner. Plafond par SERVICE entier (midi/soir),
--   fallback capacité physique si max_covers_per_slot null.
-- reserve_table : point d'entrée unique du widget public ET de la saisie admin.
--   - source='site'    : vérifie horaires + fermetures + plafond service,
--                        n'assigne PAS de table (placement manuel par le resto),
--                        crée la résa en statut 'attente'.
--   - source='telephone': assignation automatique via check_availability_locked,
--                        crée la résa en statut 'confirme'.
-- Frontière midi/soir : 960 min = 16h00.
-- ============================================================
create or replace function public.check_availability_locked(
  p_date date, p_time text, p_covers integer
)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  slot_min       int;
  cumul          int := 0;
  found          uuid[] := '{}';
  rec            record;
  max_per_slot   int;
  already_booked int;
  v_service_min  int;
  v_service_max  int;
  v_duree        int;
begin
  if p_covers is null or p_covers < 1 then return '{}'; end if;
  slot_min := split_part(p_time,':',1)::int * 60 + split_part(p_time,':',2)::int;

  if slot_min < 960 then
    v_service_min := 0;    v_service_max := 960;
  else
    v_service_min := 960;  v_service_max := 1440;
  end if;

  -- Durée d'occupation d'une table, paramétrable (défaut 90 min)
  select coalesce(table_duration, 90) into v_duree from public.reservation_settings limit 1;
  v_duree := coalesce(v_duree, 90);

  -- Verrou anti race condition
  perform 1 from public.reservations r
    where r.date = p_date
      and r.status <> 'annule'
      and abs((split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) - slot_min) < v_duree
    for update skip locked;

  -- Plafond par service entier (fallback capacité physique)
  select max_covers_per_slot into max_per_slot from public.reservation_settings limit 1;
  if max_per_slot is null then
    select coalesce(sum(capacity), 0) into max_per_slot
      from public.restaurant_tables where is_active;
  end if;

  if max_per_slot is not null and max_per_slot > 0 then
    select coalesce(sum(r.covers), 0) into already_booked
      from public.reservations r
      where r.date = p_date
        and r.status <> 'annule'
        and (split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) >= v_service_min
        and (split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) <  v_service_max;
    if already_booked + p_covers > max_per_slot then
      return '{}';
    end if;
  end if;

  -- Tables libres (fenêtre = table_duration)
  for rec in
    select t.id, t.capacity
    from public.restaurant_tables t
    left join public.dining_areas a on a.id = t.area_id
    where t.is_active and coalesce(a.is_active, true)
      and not exists (
        select 1 from public.reservations r
        where r.date = p_date
          and r.status <> 'annule'
          and t.id = any(r.table_ids)
          and abs((split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) - slot_min) < v_duree
      )
    order by t.capacity desc
  loop
    cumul := cumul + rec.capacity;
    found := found || rec.id;
    if cumul >= p_covers then return found; end if;
  end loop;
  return '{}';
end;
$$;
grant execute on function public.check_availability_locked(date, text, int) to anon, authenticated;

create or replace function public.reserve_table(
  p_date date, p_time text, p_covers integer,
  p_customer_name text, p_email text, p_phone text,
  p_notes text default ''::text, p_source text default 'site'::text
)
returns jsonb language plpgsql security definer
set search_path to 'public' as $$
declare
  v_tables uuid[]; v_resa_id uuid; v_slot_min int; v_is_open boolean;
  v_day int; v_service text; v_closure record; v_msg text;
  v_max int; v_total int; v_service_min int; v_service_max int;
  v_cfg record; v_statut text; v_noshow int := 0; v_token uuid;
begin
  if p_covers < 1 then return jsonb_build_object('error', 'covers_invalid'); end if;
  if length(trim(coalesce(p_customer_name,''))) = 0 then return jsonb_build_object('error', 'name_required'); end if;
  if length(trim(coalesce(p_phone,''))) = 0 then return jsonb_build_object('error', 'phone_required'); end if;

  v_slot_min := split_part(p_time,':',1)::int * 60 + split_part(p_time,':',2)::int;
  v_service  := case when v_slot_min < 960 then 'midi' else 'soir' end;
  if v_slot_min < 960 then v_service_min := 0; v_service_max := 960;
  else v_service_min := 960; v_service_max := 1440; end if;

  if p_source = 'site' then
    v_day := extract(dow from p_date)::int;
    select (not is_closed and (
        (lunch_open is not null and lunch_close is not null
          and v_slot_min >= (split_part(lunch_open,':',1)::int*60+split_part(lunch_open,':',2)::int)
          and v_slot_min <  (split_part(lunch_close,':',1)::int*60+split_part(lunch_close,':',2)::int))
        or (dinner_open is not null and dinner_close is not null
          and v_slot_min >= (split_part(dinner_open,':',1)::int*60+split_part(dinner_open,':',2)::int)
          and v_slot_min <  (split_part(dinner_close,':',1)::int*60+split_part(dinner_close,':',2)::int))
    )) into v_is_open from public.opening_hours where day_of_week = v_day;
    if not coalesce(v_is_open, false) then return jsonb_build_object('error', 'slot_closed'); end if;

    select * into v_closure from public.closure_periods
      where p_date between start_date and end_date and blocks_reservations = true
        and (service is null or service = v_service) limit 1;
    if found then
      v_msg := coalesce(nullif(trim(v_closure.custom_message), ''), '');
      return jsonb_build_object('error','closure_period','custom_message',v_msg,'note',v_closure.reason);
    end if;

    select max_covers_per_slot into v_max from public.reservation_settings limit 1;
    if v_max is null then
      select coalesce(sum(t.capacity),0) into v_max
        from public.restaurant_tables t
        left join public.dining_areas a on a.id = t.area_id
        where t.is_active and coalesce(a.is_active, true);
    end if;
    if v_max is not null and v_max > 0 then
      select coalesce(sum(r.covers),0) into v_total from public.reservations r
        where r.date = p_date and r.status not in ('annule')
          and (split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) >= v_service_min
          and (split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) <  v_service_max;
      if (v_total + p_covers) > v_max then return jsonb_build_object('error','no_availability'); end if;
    end if;
    v_tables := array[]::uuid[];

    -- ── Statut : confirmation automatique si activée ET garde-fous passés ──
    -- Tout a déjà été vérifié ci-dessus (horaires, fermetures, capacité) : la
    -- validation manuelle n'ajoutait aucune décision, elle faisait seulement
    -- attendre le client. Les trois exceptions laissent la main au
    -- restaurateur là où elle est utile.
    v_statut := 'attente';
    select auto_confirm, auto_confirm_same_day, auto_confirm_block_noshow, phone_threshold
      into v_cfg from public.reservation_settings limit 1;
    if coalesce(v_cfg.auto_confirm, false) then
      -- Antécédents de no-show : recherche par e-mail OU téléphone, le client
      -- pouvant réserver avec l'un ou l'autre.
      if coalesce(v_cfg.auto_confirm_block_noshow, 0) > 0 then
        select coalesce(max(c.no_show_count), 0) into v_noshow from public.customers c
        where (nullif(trim(lower(p_email)),'') is not null and lower(c.email) = trim(lower(p_email)))
           or (nullif(trim(p_phone),'') is not null
                 and regexp_replace(c.phone,'\D','','g') = regexp_replace(p_phone,'\D','','g'));
      end if;
      -- Le seuil groupe fait foi : au-delà, le widget renvoie déjà vers le
      -- téléphone. Un seul seuil à régler, pas de contradiction possible.
      -- Comparaison IDENTIQUE à celle du widget (covers > seuil bloque).
      if p_covers <= coalesce(v_cfg.phone_threshold, 8)
         and (coalesce(v_cfg.auto_confirm_same_day,false) or p_date > current_date)
         and (coalesce(v_cfg.auto_confirm_block_noshow,0) = 0 or v_noshow < v_cfg.auto_confirm_block_noshow)
      then v_statut := 'confirme'; end if;
    end if;
  else
    -- source='telephone' : saisie par le restaurateur, toujours confirmée
    v_tables := public.check_availability_locked(p_date, p_time, p_covers);
    if array_length(v_tables,1) is null then return jsonb_build_object('error','no_availability'); end if;
    v_statut := 'confirme';
  end if;

  insert into public.reservations (date, time, covers, customer_name, email, phone, notes, status, source, table_ids)
  values (p_date, p_time, p_covers, trim(p_customer_name), coalesce(trim(p_email),''),
          trim(p_phone), coalesce(trim(p_notes),''), v_statut, p_source, v_tables)
  returning id, cancel_token into v_resa_id, v_token;

  return jsonb_build_object(
    'ok', true, 'id', v_resa_id, 'tables', v_tables, 'status', v_statut,
    'auto_confirmed', (v_statut = 'confirme' and p_source = 'site'),
    -- Token renvoyé seulement si confirmé d'emblée : nécessaire au lien
    -- d'annulation de l'e-mail de confirmation.
    'cancel_token', case when v_statut = 'confirme' and p_source = 'site' then v_token::text else null end
  );
end;
$$;
grant execute on function public.reserve_table(date, text, int, text, text, text, text, text) to anon, authenticated;


-- ── Annulation par le client, via le lien des e-mails ───────────────────────
-- Appelée par la page /annuler (Annuler.tsx) avec la clé anon : le token du
-- lien fait seul office d'autorisation, d'où SECURITY DEFINER (la RLS des
-- réservations interdit tout accès anonyme).
-- Refuse une réservation déjà annulée ou passée, et renvoie un motif
-- exploitable par le front plutôt qu'une erreur SQL.
create or replace function public.cancel_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id     uuid;
  v_status text;
  v_date   date;
begin
  select id, status, date into v_id, v_status, v_date
    from public.reservations where cancel_token = p_token;

  if v_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_status = 'annule' then
    return jsonb_build_object('error', 'already_cancelled');
  end if;
  if v_date < current_date then
    return jsonb_build_object('error', 'past_reservation');
  end if;

  -- Le passage en 'annule' déclenche notifier_waitlist_si_liberee().
  update public.reservations set status = 'annule' where id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
grant execute on function public.cancel_by_token(uuid) to anon, authenticated;



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
-- LISTE D'ATTENTE
-- Quand un service est complet, les visiteurs peuvent laisser
-- leurs coordonnées. L'admin les voit dans l'onglet "Liste d'attente"
-- et peut les notifier par email si une place se libère.
-- ============================================================
create table if not exists public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  time          text not null,
  covers        int  not null check (covers > 0),
  customer_name text not null check (length(customer_name) <= 100),
  email         text not null default '',
  phone         text not null check (length(phone) <= 30),
  notes         text default '' check (length(notes) <= 1000),
  notified      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists waitlist_date_idx on public.waitlist (date, time);

alter table public.waitlist enable row level security;

-- Admin : lecture/écriture complète
create policy "admin_all_waitlist" on public.waitlist
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Public : insertion uniquement (formulaire d'attente côté site)
create policy "anon_insert_waitlist" on public.waitlist
  for insert to anon
  with check (
    covers > 0
    and length(trim(customer_name)) > 0
    and length(trim(phone)) > 0
  );

alter publication supabase_realtime add table public.waitlist;

-- ── Liste d'attente : sélection du prochain inscrit à notifier ──────────────
-- Retourne UN seul inscrit (le plus ancien) pour un créneau donné, en ignorant
-- ceux déjà notifiés, les inscriptions de plus de 7 jours et les dates passées.
-- SECURITY DEFINER : appelée par l'edge function reservation-reminders.
create or replace function public.get_next_waitlist(p_date date, p_time text)
returns table (id uuid, customer_name text, email text, phone text,
               covers integer, created_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select id, customer_name, email, phone, covers, created_at
  from public.waitlist
  where date = p_date
    and time = p_time
    and notified = false
    and notif_sent_at is null
    and created_at > now() - interval '7 days'
    and date >= current_date
  order by created_at asc
  limit 1;
$$;

-- ── Notification automatique quand une table se libère ──────────────────────
-- Déclenché sur TOUT passage en 'annule' ou 'no_show', quelle que soit
-- l'origine : annulation par le restaurateur (admin), annulation par le client
-- via le lien des emails (cancel_by_token), no_show, ou update SQL direct.
-- C'est le seul point de déclenchement : le front ne doit PAS appeler
-- notifyWaitlist() en plus, sous peine d'envoyer l'email en double.
--
-- La référence du projet est injectée par le générateur (champ projectRef de
-- la fiche client). L'appel est asynchrone (pg_net) et ne fait jamais échouer
-- l'annulation si l'edge function est indisponible.
create or replace function public.notifier_waitlist_si_liberee()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_libere  boolean;
  v_attente integer;
begin
  v_libere := new.status in ('annule', 'no_show')
              and old.status is distinct from new.status
              and old.status not in ('annule', 'no_show');
  if not v_libere then return new; end if;
  if new.date < current_date then return new; end if;

  select count(*) into v_attente
  from public.waitlist
  where date = new.date and time = new.time
    and notified = false and notif_sent_at is null
    and created_at > now() - interval '7 days';
  if v_attente = 0 then return new; end if;

  perform net.http_post(
    url     := 'https://jdbxtygycrzqlyzqjpfg.supabase.co/functions/v1/reservation-reminders',
    body    := jsonb_build_object('notify_waitlist', true, 'date', new.date, 'time', new.time),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists trg_waitlist_liberation on public.reservations;
create trigger trg_waitlist_liberation
  after update of status on public.reservations
  for each row execute function public.notifier_waitlist_si_liberee();

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
