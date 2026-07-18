-- ============================================================
-- SCHEMA — Côté Jardin (cote-jardin)
-- Régénéré depuis la base DÉPLOYÉE (jdbxtygycrzqlyzqjpfg, eu-west-3)
-- le 2026-07-18. Reflète l'état réel de production, y compris les
-- ajouts appliqués directement à la base et absents de l'ancien
-- schema.sql du dépôt (liste d'attente, rappel J-1, plafond par
-- service, tokens d'annulation, trigram CRM, feature flags…).
--
-- Ordre : extensions → is_admin/is_editor → tables → contraintes
-- → index → RLS + policies → fonctions métier → triggers → grants.
-- Idempotent autant que possible (create ... if not exists,
-- create or replace, drop policy if exists avant recréation).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensions
-- ------------------------------------------------------------
create extension if not exists pg_trgm;      -- recherche trigram (CRM clients)
create extension if not exists pgcrypto;     -- gen_random_uuid()

-- ============================================================
-- 1. Comptes admin + fonctions d'autorisation
--    (déclarées tôt : les policies en dépendent)
-- ============================================================
create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  label      text default '',
  created_at timestamptz not null default now()
);

-- is_admin() : l'utilisateur connecté figure-t-il dans admin_users ?
-- SECURITY DEFINER pour lire admin_users + auth.users sans blocage RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.admin_users au
    join auth.users u on lower(u.email) = lower(au.email)
    where u.id = auth.uid()
  );
$$;

-- is_editor() : compte interne La Table Digitale (accès onglet Fonctionnalités).
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) like '%latable-digitale%'
  );
$$;

-- ============================================================
-- 2. Tables
-- ============================================================

-- — Vitrine —————————————————————————————————————————————————
create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  name        text not null,
  description text default '',
  price       numeric,
  position    int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.gallery_images (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  alt        text default '',
  caption    text not null default '',
  position   int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.partners (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null default 'Autre',
  description  text default '',
  image_url    text default '',
  website      text default '',
  location     text not null default '',
  partner_type text not null default '',
  featured     boolean not null default false,
  position     int  not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  author     text not null,
  rating     int  not null default 5,
  content    text not null,
  position   int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.social_links (
  id        uuid primary key default gen_random_uuid(),
  platform  text not null,
  url       text not null,
  position  int  not null default 0,
  is_active boolean not null default true
);

create table if not exists public.takeaway_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text default '',
  price       numeric,
  position    int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.promo_banner (
  id         uuid primary key default gen_random_uuid(),
  is_active  boolean not null default false,
  title      text default '',
  subtitle   text default '',
  message    text default '',
  cta_label  text default '',
  cta_url    text default '',
  image_url  text default '',
  event_date date,
  updated_at timestamptz not null default now()
);

-- — Contenus / réglages éditables ————————————————————————————
create table if not exists public.site_content (
  id          uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  content     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.layout_settings (
  id          uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  variant     text not null default 'default',
  updated_at  timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  label       text not null,
  enabled     boolean not null default true,
  description text default '',
  updated_at  timestamptz not null default now()
);

-- — Horaires & fermetures ————————————————————————————————————
create table if not exists public.opening_hours (
  id           uuid primary key default gen_random_uuid(),
  day_of_week  int not null unique check (day_of_week >= 0 and day_of_week <= 6),
  is_closed    boolean not null default false,
  lunch_open   text,
  lunch_close  text,
  dinner_open  text,
  dinner_close text
);

create table if not exists public.closure_periods (
  id                  uuid primary key default gen_random_uuid(),
  start_date          date not null,
  end_date            date not null,
  reason              text default '',
  blocks_reservations boolean not null default true,
  service             text check ((service = any (array['midi','soir'])) or service is null),
  note_interne        text default '',
  custom_message      text default '',
  created_at          timestamptz not null default now()
);

-- — Réservation : réglages, salle, tables ————————————————————
create table if not exists public.reservation_settings (
  id                   uuid primary key default gen_random_uuid(),
  enabled              boolean not null default false,
  phone_threshold      int not null default 8,
  min_advance_hours    int not null default 2,
  slot_duration        int not null default 30,
  booking_horizon_days int not null default 60,
  newsletter_optin     boolean not null default true,
  max_covers_per_slot  int,                        -- null = pas de plafond (repli capacité physique)
  waitlist_enabled     boolean not null default false,
  reminder_enabled     boolean not null default true,
  updated_at           timestamptz not null default now()
);

create table if not exists public.dining_areas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_tables (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  capacity     int not null default 2,
  online_limit int not null default 2,
  pos_x        numeric not null default 0,
  pos_y        numeric not null default 0,
  shape        text not null default 'square',
  is_active    boolean not null default true,
  area_id      uuid references public.dining_areas(id),
  created_at   timestamptz not null default now()
);

-- — CRM : clients ————————————————————————————————————————————
create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default '',
  email           text default '',
  phone           text default '',
  is_vip          boolean not null default false,
  notes           text default '',
  bookings_count  int not null default 0,
  covers_total    int not null default 0,
  no_show_count   int not null default 0,
  cancelled_count int not null default 0,
  first_visit     date,
  last_visit      date,
  created_at      timestamptz not null default now()
);

-- — Réservations —————————————————————————————————————————————
create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid references public.restaurant_tables(id),
  table_ids     uuid[] not null default '{}'::uuid[],
  customer_id   uuid references public.customers(id),
  date          date not null,
  time          text not null,
  covers        int  not null,
  customer_name text not null check (length(customer_name) <= 100),
  email         text default '',
  phone         text not null check (length(phone) <= 30),
  notes         text default '' check (length(notes) <= 1000),
  status        text not null default 'attente',
  source        text not null default 'site',
  cancel_token  uuid default gen_random_uuid(),
  reminder_sent boolean not null default false,
  created_at    timestamptz not null default now()
);

-- — Liste d'attente ——————————————————————————————————————————
create table if not exists public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  time          text not null,
  covers        int  not null,
  customer_name text not null,
  email         text not null,
  phone         text not null,
  notes         text default '',
  notified      boolean not null default false,
  notif_sent_at timestamptz,
  created_at    timestamptz not null default now()
);

-- — Newsletter (leads + campagnes + envois) ——————————————————
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  first_name        text default '',
  last_name         text default '',
  email             text not null unique,
  phone             text default '',
  zip               text default '',
  source            text not null default 'newsletter',
  consent           boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at        timestamptz not null default now()
);

create table if not exists public.newsletter_campaigns (
  id               uuid primary key default gen_random_uuid(),
  template         text not null check (template = any (array['blocs','welcome','evenementiel','nouveau_menu','vie_resto'])),
  segment          text not null check (segment  = any (array['optin','optin_vip','inactif_1_2','inactif_3_4','inactif_5_6','jamais_venu'])),
  subject          text not null,
  content          jsonb not null default '{}'::jsonb,
  scheduled_at     timestamptz,
  sent_at          timestamptz,
  status           text not null default 'draft' check (status = any (array['draft','scheduled','sending','sent','failed'])),
  recipients_count int,
  sent_count       int default 0,
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.newsletter_sends (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  email       text not null,
  name        text,
  sent_at     timestamptz default now(),
  error       text
);

-- ============================================================
-- 3. Index (hors clés primaires)
-- ============================================================
create index        if not exists closure_periods_range_idx      on public.closure_periods (start_date, end_date);
create index        if not exists customers_bookings_idx          on public.customers (bookings_count desc);
create index        if not exists customers_last_visit_idx        on public.customers (last_visit desc nulls last);
create index        if not exists customers_email_trgm            on public.customers using gin (lower(email) gin_trgm_ops);
create index        if not exists customers_name_trgm             on public.customers using gin (lower(name)  gin_trgm_ops);
create index        if not exists customers_phone_trgm            on public.customers using gin (phone gin_trgm_ops);
create unique index if not exists customers_email_uidx            on public.customers (lower(email)) where (email <> '');
create unique index if not exists customers_phone_uidx            on public.customers (phone)         where (phone <> '');
create unique index if not exists leads_unsubscribe_token_idx     on public.leads (unsubscribe_token);
create index        if not exists newsletter_campaigns_status_idx on public.newsletter_campaigns (status, scheduled_at);
create index        if not exists newsletter_sends_campaign_idx   on public.newsletter_sends (campaign_id);
create index        if not exists partners_display_order          on public.partners (featured desc, position);
create unique index if not exists reservations_cancel_token_idx   on public.reservations (cancel_token);
create index        if not exists reservations_customer_idx       on public.reservations (customer_id);
create index        if not exists reservations_date_idx           on public.reservations (date, time);
create index        if not exists reservations_table_idx          on public.reservations (table_id, date);
create index        if not exists reviews_position_idx            on public.reviews (position);
create index        if not exists waitlist_date_idx               on public.waitlist (date, time);

-- ============================================================
-- 4. RLS + policies
--    Modèle : lecture publique (souvent restreinte à is_active),
--    écriture réservée à is_admin(). Tables CRM/privées : pas de
--    lecture anon. Insertions anon contrôlées (résa, lead, waitlist).
-- ============================================================
alter table public.admin_users          enable row level security;
alter table public.menu_items           enable row level security;
alter table public.gallery_images       enable row level security;
alter table public.partners             enable row level security;
alter table public.reviews              enable row level security;
alter table public.social_links         enable row level security;
alter table public.takeaway_items       enable row level security;
alter table public.promo_banner         enable row level security;
alter table public.site_content         enable row level security;
alter table public.layout_settings      enable row level security;
alter table public.feature_flags        enable row level security;
alter table public.opening_hours        enable row level security;
alter table public.closure_periods      enable row level security;
alter table public.reservation_settings enable row level security;
alter table public.dining_areas         enable row level security;
alter table public.restaurant_tables    enable row level security;
alter table public.customers            enable row level security;
alter table public.reservations         enable row level security;
alter table public.waitlist             enable row level security;
alter table public.leads                enable row level security;
alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_sends     enable row level security;

-- — admin_users ————————————————————————————————————————————
drop policy if exists "admin manage admin_users" on public.admin_users;
create policy "admin manage admin_users" on public.admin_users
  for all to authenticated using (is_admin()) with check (is_admin());

-- — Helper mental : "crud admin + lecture active anon" ————————
-- menu_items
drop policy if exists "anon select active" on public.menu_items;
drop policy if exists "admin select" on public.menu_items;
drop policy if exists "admin insert" on public.menu_items;
drop policy if exists "admin update" on public.menu_items;
drop policy if exists "admin delete" on public.menu_items;
create policy "anon select active" on public.menu_items for select to public using (is_active = true);
create policy "admin select" on public.menu_items for select to authenticated using (is_admin());
create policy "admin insert" on public.menu_items for insert to authenticated with check (is_admin());
create policy "admin update" on public.menu_items for update to authenticated using (is_admin());
create policy "admin delete" on public.menu_items for delete to authenticated using (is_admin());

-- gallery_images (lecture anon totale)
drop policy if exists "anon select" on public.gallery_images;
drop policy if exists "admin insert" on public.gallery_images;
drop policy if exists "admin update" on public.gallery_images;
drop policy if exists "admin delete" on public.gallery_images;
create policy "anon select" on public.gallery_images for select to public using (true);
create policy "admin insert" on public.gallery_images for insert to authenticated with check (is_admin());
create policy "admin update" on public.gallery_images for update to authenticated using (is_admin());
create policy "admin delete" on public.gallery_images for delete to authenticated using (is_admin());

-- partners
drop policy if exists "anon select active" on public.partners;
drop policy if exists "admin select" on public.partners;
drop policy if exists "admin insert" on public.partners;
drop policy if exists "admin update" on public.partners;
drop policy if exists "admin delete" on public.partners;
create policy "anon select active" on public.partners for select to public using (is_active = true);
create policy "admin select" on public.partners for select to authenticated using (is_admin());
create policy "admin insert" on public.partners for insert to authenticated with check (is_admin());
create policy "admin update" on public.partners for update to authenticated using (is_admin());
create policy "admin delete" on public.partners for delete to authenticated using (is_admin());

-- reviews
drop policy if exists "anon select active" on public.reviews;
drop policy if exists "admin select" on public.reviews;
drop policy if exists "admin insert" on public.reviews;
drop policy if exists "admin update" on public.reviews;
drop policy if exists "admin delete" on public.reviews;
create policy "anon select active" on public.reviews for select to public using (is_active = true);
create policy "admin select" on public.reviews for select to authenticated using (is_admin());
create policy "admin insert" on public.reviews for insert to authenticated with check (is_admin());
create policy "admin update" on public.reviews for update to authenticated using (is_admin());
create policy "admin delete" on public.reviews for delete to authenticated using (is_admin());

-- social_links
drop policy if exists "anon select active" on public.social_links;
drop policy if exists "admin select" on public.social_links;
drop policy if exists "admin insert" on public.social_links;
drop policy if exists "admin update" on public.social_links;
drop policy if exists "admin delete" on public.social_links;
create policy "anon select active" on public.social_links for select to public using (is_active = true);
create policy "admin select" on public.social_links for select to authenticated using (is_admin());
create policy "admin insert" on public.social_links for insert to authenticated with check (is_admin());
create policy "admin update" on public.social_links for update to authenticated using (is_admin());
create policy "admin delete" on public.social_links for delete to authenticated using (is_admin());

-- takeaway_items
drop policy if exists "anon select active takeaway" on public.takeaway_items;
drop policy if exists "admin select takeaway" on public.takeaway_items;
drop policy if exists "admin insert takeaway" on public.takeaway_items;
drop policy if exists "admin update takeaway" on public.takeaway_items;
drop policy if exists "admin delete takeaway" on public.takeaway_items;
create policy "anon select active takeaway" on public.takeaway_items for select to public using (is_active = true);
create policy "admin select takeaway" on public.takeaway_items for select to authenticated using (is_admin());
create policy "admin insert takeaway" on public.takeaway_items for insert to authenticated with check (is_admin());
create policy "admin update takeaway" on public.takeaway_items for update to authenticated using (is_admin());
create policy "admin delete takeaway" on public.takeaway_items for delete to authenticated using (is_admin());

-- promo_banner
drop policy if exists "anon select active" on public.promo_banner;
drop policy if exists "admin select" on public.promo_banner;
drop policy if exists "admin insert" on public.promo_banner;
drop policy if exists "admin update" on public.promo_banner;
drop policy if exists "admin delete" on public.promo_banner;
create policy "anon select active" on public.promo_banner for select to public using (is_active = true);
create policy "admin select" on public.promo_banner for select to authenticated using (is_admin());
create policy "admin insert" on public.promo_banner for insert to authenticated with check (is_admin());
create policy "admin update" on public.promo_banner for update to authenticated using (is_admin());
create policy "admin delete" on public.promo_banner for delete to authenticated using (is_admin());

-- site_content (lecture anon totale)
drop policy if exists "anon select" on public.site_content;
drop policy if exists "admin insert" on public.site_content;
drop policy if exists "admin update" on public.site_content;
drop policy if exists "admin delete" on public.site_content;
create policy "anon select" on public.site_content for select to public using (true);
create policy "admin insert" on public.site_content for insert to authenticated with check (is_admin());
create policy "admin update" on public.site_content for update to authenticated using (is_admin());
create policy "admin delete" on public.site_content for delete to authenticated using (is_admin());

-- layout_settings (lecture anon totale)
drop policy if exists "anon select" on public.layout_settings;
drop policy if exists "admin insert" on public.layout_settings;
drop policy if exists "admin update" on public.layout_settings;
drop policy if exists "admin delete" on public.layout_settings;
create policy "anon select" on public.layout_settings for select to public using (true);
create policy "admin insert" on public.layout_settings for insert to authenticated with check (is_admin());
create policy "admin update" on public.layout_settings for update to authenticated using (is_admin());
create policy "admin delete" on public.layout_settings for delete to authenticated using (is_admin());

-- feature_flags (lecture admin ; écriture éditeur LTD uniquement)
drop policy if exists "admin select features" on public.feature_flags;
drop policy if exists "editor update features" on public.feature_flags;
create policy "admin select features" on public.feature_flags for select to authenticated using (is_admin());
create policy "editor update features" on public.feature_flags for update to authenticated using (is_editor()) with check (is_editor());

-- opening_hours (lecture anon totale)
drop policy if exists "anon select" on public.opening_hours;
drop policy if exists "admin insert" on public.opening_hours;
drop policy if exists "admin update" on public.opening_hours;
drop policy if exists "admin delete" on public.opening_hours;
create policy "anon select" on public.opening_hours for select to public using (true);
create policy "admin insert" on public.opening_hours for insert to authenticated with check (is_admin());
create policy "admin update" on public.opening_hours for update to authenticated using (is_admin());
create policy "admin delete" on public.opening_hours for delete to authenticated using (is_admin());

-- closure_periods (lecture anon totale)
drop policy if exists "anon select" on public.closure_periods;
drop policy if exists "admin insert" on public.closure_periods;
drop policy if exists "admin update" on public.closure_periods;
drop policy if exists "admin delete" on public.closure_periods;
create policy "anon select" on public.closure_periods for select to public using (true);
create policy "admin insert" on public.closure_periods for insert to authenticated with check (is_admin());
create policy "admin update" on public.closure_periods for update to authenticated using (is_admin());
create policy "admin delete" on public.closure_periods for delete to authenticated using (is_admin());

-- reservation_settings (lecture anon si enabled)
drop policy if exists "anon select enabled" on public.reservation_settings;
drop policy if exists "admin select" on public.reservation_settings;
drop policy if exists "admin insert" on public.reservation_settings;
drop policy if exists "admin update" on public.reservation_settings;
drop policy if exists "admin delete" on public.reservation_settings;
create policy "anon select enabled" on public.reservation_settings for select to public using (enabled = true);
create policy "admin select" on public.reservation_settings for select to authenticated using (is_admin());
create policy "admin insert" on public.reservation_settings for insert to authenticated with check (is_admin());
create policy "admin update" on public.reservation_settings for update to authenticated using (is_admin());
create policy "admin delete" on public.reservation_settings for delete to authenticated using (is_admin());

-- dining_areas (lecture anon totale)
drop policy if exists "anon select areas" on public.dining_areas;
drop policy if exists "admin all areas" on public.dining_areas;
create policy "anon select areas" on public.dining_areas for select to public using (true);
create policy "admin all areas" on public.dining_areas for all to authenticated using (is_admin()) with check (is_admin());

-- restaurant_tables (lecture anon si active)
drop policy if exists "anon select active" on public.restaurant_tables;
drop policy if exists "admin select" on public.restaurant_tables;
drop policy if exists "admin insert" on public.restaurant_tables;
drop policy if exists "admin update" on public.restaurant_tables;
drop policy if exists "admin delete" on public.restaurant_tables;
create policy "anon select active" on public.restaurant_tables for select to public using (is_active = true);
create policy "admin select" on public.restaurant_tables for select to authenticated using (is_admin());
create policy "admin insert" on public.restaurant_tables for insert to authenticated with check (is_admin());
create policy "admin update" on public.restaurant_tables for update to authenticated using (is_admin());
create policy "admin delete" on public.restaurant_tables for delete to authenticated using (is_admin());

-- customers (aucune lecture anon)
drop policy if exists "admin select customers" on public.customers;
drop policy if exists "admin insert customers" on public.customers;
drop policy if exists "admin update customers" on public.customers;
drop policy if exists "admin delete customers" on public.customers;
create policy "admin select customers" on public.customers for select to authenticated using (is_admin());
create policy "admin insert customers" on public.customers for insert to authenticated with check (is_admin());
create policy "admin update customers" on public.customers for update to authenticated using (is_admin());
create policy "admin delete customers" on public.customers for delete to authenticated using (is_admin());

-- reservations (insertion anon contrôlée ; le reste admin)
drop policy if exists "anon insert" on public.reservations;
drop policy if exists "admin select" on public.reservations;
drop policy if exists "admin insert" on public.reservations;
drop policy if exists "admin update" on public.reservations;
drop policy if exists "admin delete" on public.reservations;
create policy "anon insert" on public.reservations for insert to public
  with check (
    status = 'attente' and source = 'site' and table_id is null and covers > 0
    and length(trim(customer_name)) > 0 and length(trim(phone)) > 0
  );
create policy "admin select" on public.reservations for select to authenticated using (is_admin());
create policy "admin insert" on public.reservations for insert to authenticated with check (is_admin());
create policy "admin update" on public.reservations for update to authenticated using (is_admin());
create policy "admin delete" on public.reservations for delete to authenticated using (is_admin());

-- waitlist (insertion anon contrôlée ; gestion admin)
drop policy if exists "waitlist_anon_insert" on public.waitlist;
drop policy if exists "waitlist_admin_all" on public.waitlist;
create policy "waitlist_anon_insert" on public.waitlist for insert to anon
  with check (
    covers > 0 and length(trim(customer_name)) > 0 and length(trim(phone)) > 0
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );
create policy "waitlist_admin_all" on public.waitlist for all to authenticated using (is_admin()) with check (is_admin());

-- leads (opt-in anon + désinscription/réinscription par token ; gestion admin)
drop policy if exists "anon insert" on public.leads;
drop policy if exists "anon_unsubscribe" on public.leads;
drop policy if exists "anon_resubscribe" on public.leads;
drop policy if exists "admin select" on public.leads;
drop policy if exists "admin update" on public.leads;
drop policy if exists "admin delete" on public.leads;
create policy "anon insert" on public.leads for insert to public
  with check (
    email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and source = any (array['newsletter','reservation'])
  );
create policy "anon_unsubscribe" on public.leads for update to anon using (true) with check (consent = false);
create policy "anon_resubscribe" on public.leads for update to anon using (true)
  with check (
    consent = true
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and source = any (array['newsletter','reservation'])
  );
create policy "admin select" on public.leads for select to authenticated using (is_admin());
create policy "admin update" on public.leads for update to authenticated using (is_admin());
create policy "admin delete" on public.leads for delete to authenticated using (is_admin());

-- newsletter_campaigns / newsletter_sends (admin only)
drop policy if exists "admin_all_newsletter_campaigns" on public.newsletter_campaigns;
create policy "admin_all_newsletter_campaigns" on public.newsletter_campaigns for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "admin_all_newsletter_sends" on public.newsletter_sends;
create policy "admin_all_newsletter_sends" on public.newsletter_sends for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================
-- 5. Fonctions métier
-- ============================================================

-- attach_customer : rattache/fusionne une résa à une fiche client (email/tél).
create or replace function public.attach_customer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
    update public.customers set
      email = case when email = '' and norm_email is not null then norm_email else email end,
      phone = case when phone = '' and norm_phone is not null then norm_phone else phone end,
      name  = case when coalesce(new.customer_name,'') <> '' then new.customer_name else name end
    where id = cid;
  end if;
  new.customer_id := cid;
  return new;
end;
$$;

-- recompute_customer : recalcule les compteurs d'une fiche client.
create or replace function public.recompute_customer(cid uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.customers c set
    bookings_count  = coalesce(s.cnt, 0),
    covers_total    = coalesce(s.cov, 0),
    no_show_count   = coalesce(s.ns, 0),
    cancelled_count = coalesce(s.ann, 0),
    first_visit     = s.first_v,
    last_visit      = s.last_v
  from (
    select
      count(*) filter (where status <> 'annule') as cnt,
      coalesce(sum(covers) filter (where status <> 'annule'),0) as cov,
      count(*) filter (where status = 'no_show') as ns,
      count(*) filter (where status = 'annule') as ann,
      min(date) filter (where status <> 'annule') as first_v,
      max(date) filter (where status <> 'annule') as last_v
    from public.reservations where customer_id = cid
  ) s where c.id = cid;
$$;

-- refresh_customer_counters : trigger qui rejoue recompute_customer.
create or replace function public.refresh_customer_counters()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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

-- sync_table_id : maintient table_id = première entrée de table_ids.
create or replace function public.sync_table_id()
returns trigger
language plpgsql
as $$
begin
  if new.table_ids is null then new.table_ids := '{}'; end if;
  new.table_id := case when array_length(new.table_ids,1) >= 1 then new.table_ids[1] else null end;
  return new;
end;
$$;

-- touch_updated_at : met à jour updated_at.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin new.updated_at = now(); return new; end;
$$;

-- check_availability : le créneau accepte-t-il p_covers ? (horaires +
-- plafond par service + disponibilité physique sur fenêtre 90 min).
create or replace function public.check_availability(p_date date, p_time text, p_covers integer)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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
begin
  if p_covers is null or p_covers < 1 then return false; end if;
  slot_min := split_part(p_time,':',1)::int*60 + split_part(p_time,':',2)::int;

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

  select max_covers_per_slot into max_per_slot from public.reservation_settings limit 1;
  if max_per_slot is null then
    select coalesce(sum(capacity),0) into max_per_slot from public.restaurant_tables where is_active;
  end if;

  if max_per_slot is not null and max_per_slot > 0 then
    select coalesce(sum(r.covers),0) into already_booked
      from public.reservations r
      where r.date = p_date and r.status <> 'annule'
        and (split_part(r.time,':',1)::int*60+split_part(r.time,':',2)::int) >= v_service_min
        and (split_part(r.time,':',1)::int*60+split_part(r.time,':',2)::int) <  v_service_max;
    if already_booked + p_covers > max_per_slot then return false; end if;
  end if;

  -- 2) Disponibilité physique (fenêtre 90 min)
  for rec in
    select t.capacity from public.restaurant_tables t
    where t.is_active
      and not exists (
        select 1 from public.reservations r
        where r.date = p_date and r.status <> 'annule' and t.id = any(r.table_ids)
          and abs((split_part(r.time,':',1)::int*60+split_part(r.time,':',2)::int) - slot_min) < 90)
    order by t.capacity desc
  loop
    cumul := cumul + rec.capacity;
    if cumul >= p_covers then return true; end if;
  end loop;
  return false;
end;
$$;

-- check_availability_locked : variante avec verrou (anti race condition),
-- renvoie la liste de tables à assigner (usage résa téléphone).
create or replace function public.check_availability_locked(p_date date, p_time text, p_covers integer)
returns uuid[]
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  slot_min       int;
  cumul          int := 0;
  found          uuid[] := '{}';
  rec            record;
  max_per_slot   int;
  already_booked int;
begin
  if p_covers is null or p_covers < 1 then return '{}'; end if;
  slot_min := split_part(p_time,':',1)::int * 60 + split_part(p_time,':',2)::int;

  perform 1 from public.reservations r
    where r.date = p_date
      and r.status <> 'annule'
      and abs((split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) - slot_min) < 90
    for update skip locked;

  select max_covers_per_slot into max_per_slot from public.reservation_settings limit 1;
  if max_per_slot is not null then
    select coalesce(sum(r.covers), 0) into already_booked
      from public.reservations r
      where r.date = p_date
        and r.status <> 'annule'
        and abs((split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) - slot_min) < 90;
    if already_booked + p_covers > max_per_slot then
      return '{}';
    end if;
  end if;

  for rec in
    select t.id, t.capacity
    from public.restaurant_tables t
    where t.is_active
      and not exists (
        select 1 from public.reservations r
        where r.date = p_date
          and r.status <> 'annule'
          and t.id = any(r.table_ids)
          and abs((split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) - slot_min) < 90
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

-- reserve_table : point d'entrée d'une réservation (site ou téléphone).
-- Valide horaires, fermetures, plafond, puis insère.
create or replace function public.reserve_table(
  p_date date, p_time text, p_covers integer,
  p_customer_name text, p_email text, p_phone text,
  p_notes text default '', p_source text default 'site'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_tables      uuid[];
  v_resa_id     uuid;
  v_slot_min    int;
  v_is_open     boolean;
  v_day         int;
  v_service     text;
  v_closure     record;
  v_msg         text;
  v_max         int;
  v_total       int;
  v_service_min int;
  v_service_max int;
begin
  if p_covers < 1 then return jsonb_build_object('error', 'covers_invalid'); end if;
  if length(trim(coalesce(p_customer_name,''))) = 0 then return jsonb_build_object('error', 'name_required'); end if;
  if length(trim(coalesce(p_phone,''))) = 0 then return jsonb_build_object('error', 'phone_required'); end if;

  v_slot_min := split_part(p_time,':',1)::int * 60 + split_part(p_time,':',2)::int;
  v_service  := case when v_slot_min < 960 then 'midi' else 'soir' end;

  if v_slot_min < 960 then
    v_service_min := 0;    v_service_max := 960;
  else
    v_service_min := 960;  v_service_max := 1440;
  end if;

  if p_source = 'site' then
    v_day := extract(dow from p_date)::int;
    select (
      not is_closed and (
        (lunch_open is not null and lunch_close is not null
          and v_slot_min >= (split_part(lunch_open,':',1)::int*60+split_part(lunch_open,':',2)::int)
          and v_slot_min <  (split_part(lunch_close,':',1)::int*60+split_part(lunch_close,':',2)::int))
        or
        (dinner_open is not null and dinner_close is not null
          and v_slot_min >= (split_part(dinner_open,':',1)::int*60+split_part(dinner_open,':',2)::int)
          and v_slot_min <  (split_part(dinner_close,':',1)::int*60+split_part(dinner_close,':',2)::int))
      )
    ) into v_is_open from public.opening_hours where day_of_week = v_day;

    if not coalesce(v_is_open, false) then
      return jsonb_build_object('error', 'slot_closed');
    end if;

    select * into v_closure from public.closure_periods
      where p_date between start_date and end_date
        and blocks_reservations = true
        and (service is null or service = v_service)
      limit 1;

    if found then
      v_msg := coalesce(nullif(trim(v_closure.custom_message), ''), '');
      return jsonb_build_object('error', 'closure_period', 'custom_message', v_msg, 'note', v_closure.reason);
    end if;

    select max_covers_per_slot into v_max from public.reservation_settings limit 1;
    if v_max is null then
      select coalesce(sum(capacity), 0) into v_max
        from public.restaurant_tables where is_active;
    end if;

    if v_max is not null and v_max > 0 then
      select coalesce(sum(r.covers), 0) into v_total
        from public.reservations r
        where r.date = p_date
          and r.status not in ('annule')
          and (split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) >= v_service_min
          and (split_part(r.time,':',1)::int*60 + split_part(r.time,':',2)::int) <  v_service_max;
      if (v_total + p_covers) > v_max then
        return jsonb_build_object('error', 'no_availability');
      end if;
    end if;

    v_tables := array[]::uuid[];

  else
    -- source='telephone' : assignation automatique avec verrou
    v_tables := public.check_availability_locked(p_date, p_time, p_covers);
    if array_length(v_tables, 1) is null then
      return jsonb_build_object('error', 'no_availability');
    end if;
  end if;

  insert into public.reservations (
    date, time, covers, customer_name, email, phone, notes, status, source, table_ids
  ) values (
    p_date, p_time, p_covers, trim(p_customer_name),
    coalesce(trim(p_email), ''), trim(p_phone), coalesce(trim(p_notes), ''),
    case when p_source = 'telephone' then 'confirme' else 'attente' end,
    p_source, v_tables
  )
  returning id into v_resa_id;

  return jsonb_build_object('ok', true, 'id', v_resa_id, 'tables', v_tables);
end;
$$;

-- cancel_by_token : annulation client via lien email (rappel J-1).
create or replace function public.cancel_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_status text;
  v_date date;
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

  update public.reservations set status = 'annule' where id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- get_next_waitlist : prochaine personne à notifier pour un créneau libéré.
create or replace function public.get_next_waitlist(p_date date, p_time text)
returns table(id uuid, customer_name text, email text, phone text, covers integer, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
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

-- newsletter_segment_counts : effectifs par segment (admin only).
create or replace function public.newsletter_segment_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
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
    select b.email, c.is_vip, c.last_visit
    from base b
    left join public.customers c on lower(c.email) = b.email
  )
  select jsonb_build_object(
    'optin',       (select count(*) from base),
    'optin_vip',   (select count(*) from joined where is_vip),
    'inactif_1_2', (select count(*) from joined where last_visit is not null
                      and last_visit <= current_date - interval '1 month'
                      and last_visit >  current_date - interval '3 months'),
    'inactif_3_4', (select count(*) from joined where last_visit is not null
                      and last_visit <= current_date - interval '3 months'
                      and last_visit >  current_date - interval '5 months'),
    'inactif_5_6', (select count(*) from joined where last_visit is not null
                      and last_visit <= current_date - interval '5 months'
                      and last_visit >  current_date - interval '7 months'),
    'jamais_venu', (select count(*) from joined where last_visit is null)
  ) into v;

  return v;
end;
$$;

-- ============================================================
-- 6. Triggers
-- ============================================================
drop trigger if exists trg_attach_customer on public.reservations;
create trigger trg_attach_customer
  before insert or update of email, phone, customer_name on public.reservations
  for each row execute function public.attach_customer();

drop trigger if exists trg_sync_table_id on public.reservations;
create trigger trg_sync_table_id
  before insert or update of table_ids on public.reservations
  for each row execute function public.sync_table_id();

drop trigger if exists trg_refresh_counters on public.reservations;
create trigger trg_refresh_counters
  after insert or delete or update on public.reservations
  for each row execute function public.refresh_customer_counters();

drop trigger if exists trg_newsletter_updated_at on public.newsletter_campaigns;
create trigger trg_newsletter_updated_at
  before update on public.newsletter_campaigns
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 7. Grants (RPC exposées aux rôles anon / authenticated)
-- ============================================================
grant execute on function public.check_availability(date, text, int)                                   to anon, authenticated;
grant execute on function public.reserve_table(date, text, int, text, text, text, text, text)            to anon, authenticated;
grant execute on function public.cancel_by_token(uuid)                                                   to anon, authenticated;
grant execute on function public.newsletter_segment_counts()                                             to authenticated;
grant execute on function public.get_next_waitlist(date, text)                                           to authenticated;
