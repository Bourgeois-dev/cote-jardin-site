-- ============================================================
-- SCHEMA — Côté jardin (cote-jardin)
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

alter table public.admin_users enable row level security;
create policy "admin manage admin_users" on public.admin_users
  for all to authenticated using (is_admin()) with check (is_admin());

-- Compte admin de départ (le restaurateur). D'autres accès se gèrent ensuite
-- depuis l'admin — voir cfg.admin.email dans clients/<slug>.json.
insert into public.admin_users (email, label) values ('gerant@cote-jardin.fr', 'Administrateur principal')
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
  position int not null default 0,
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
  consent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (email)
);

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
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  url text not null,
  position int not null default 0,
  is_active boolean not null default true
);

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
  updated_at timestamptz not null default now()
);

create table if not exists public.dining_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
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
  created_at timestamptz not null default now()
);

create index if not exists reservations_date_idx
  on public.reservations (date, time);
create index if not exists reservations_table_idx
  on public.reservations (table_id, date);

create table if not exists public.closure_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,        -- inclusive
  reason text default '',         -- message affiche au client (ex : "Conges d'ete")
  blocks_reservations boolean not null default true,
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
-- format email valide, source limitée aux deux valeurs utilisées par le site.
create policy "anon insert" on public.leads
  for insert with check (
    email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and source in ('newsletter', 'reservation')
  );
create policy "admin select" on public.leads
  for select to authenticated using (is_admin());
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

create policy "admin write gallery" on storage.objects
  for insert to authenticated with check (bucket_id = 'gallery' and is_admin());
create policy "admin update gallery" on storage.objects
  for update to authenticated using (bucket_id = 'gallery' and is_admin());
create policy "admin delete gallery" on storage.objects
  for delete to authenticated using (bucket_id = 'gallery' and is_admin());
create policy "admin list gallery" on storage.objects
  for select to authenticated using (bucket_id = 'gallery' and is_admin());

create policy "admin write partners" on storage.objects
  for insert to authenticated with check (bucket_id = 'partners' and is_admin());
create policy "admin update partners" on storage.objects
  for update to authenticated using (bucket_id = 'partners' and is_admin());
create policy "admin delete partners" on storage.objects
  for delete to authenticated using (bucket_id = 'partners' and is_admin());
create policy "admin list partners" on storage.objects
  for select to authenticated using (bucket_id = 'partners' and is_admin());

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

-- check_availability : une table est occupée si elle figure dans table_ids
-- d'une résa non annulée dans la fenêtre +/-90 min (gère le regroupement).
create or replace function public.check_availability(
  p_date date, p_time text, p_covers int
)
returns boolean language plpgsql security definer set search_path = public stable as $$
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
        where r.date = p_date
          and r.status <> 'annule'
          and t.id = any(r.table_ids)
          and abs(
                (split_part(r.time, ':', 1)::int * 60 + split_part(r.time, ':', 2)::int) - slot_min
              ) < 90
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
  for insert to authenticated with check (bucket_id = 'menu' and is_admin());
create policy "admin update menu" on storage.objects
  for update to authenticated using (bucket_id = 'menu' and is_admin());
create policy "admin delete menu" on storage.objects
  for delete to authenticated using (bucket_id = 'menu' and is_admin());
