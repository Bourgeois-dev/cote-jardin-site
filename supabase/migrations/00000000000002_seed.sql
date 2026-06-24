-- ============================================================
-- SEED — Côté jardin (cote-jardin)
-- ============================================================

-- Horaires d'ouverture (0 = Lundi .. 6 = Dimanche)
insert into public.opening_hours (day_of_week, is_closed, lunch_open, lunch_close, dinner_open, dinner_close) values
  (1, true, null, null, null, null),
  (2, false, '12:00', '13:30', '19:00', '21:45'),
  (3, false, '12:00', '13:45', null, null),
  (4, false, '12:00', '13:30', '19:00', '21:45'),
  (5, false, '12:00', '13:30', '19:00', '21:45'),
  (6, false, '12:00', '13:30', '19:00', '21:45'),
  (0, true, null, null, null, null)
on conflict (day_of_week) do update
  set is_closed = excluded.is_closed,
      lunch_open = excluded.lunch_open,
      lunch_close = excluded.lunch_close,
      dinner_open = excluded.dinner_open,
      dinner_close = excluded.dinner_close;

-- Variantes de layout par section
insert into public.layout_settings (section_key, variant) values
  ('hero', 'default'),
  ('menu', 'default'),
  ('gallery', 'default'),
  ('story', 'split'),
  ('contact', 'default')
on conflict (section_key) do update set variant = excluded.variant;

-- Parametres de reservation
insert into public.reservation_settings
  (enabled, phone_threshold, min_advance_hours, slot_duration, booking_horizon_days, newsletter_optin)
values
  (true,
   8,
   2,
   30,
   60,
   true);

-- Banniere promo (desactivee par defaut)
insert into public.promo_banner (is_active) values (false);

-- Zone de salle par défaut (le restaurateur en ajoute d'autres via l'admin)
insert into public.dining_areas (name, position) values ('Salle', 0);

-- Contenus editables
-- NB : le bloc "Notre cuisine" (story) n'est PAS en base : exception figee au
-- build via les variables VITE_STORY_* (comme le hero). Voir CLAUDE.md.
insert into public.site_content (section_key, content) values
  ('ardoise', '{"plat":"","prix":"","label":"Le plat du jour","note":"","enabled":true}'::jsonb),
  ('menu_categories', '[]'::jsonb),
  ('contact_info', '{"address":"7, place de la République, 49400 SAUMUR","phone":"02 41 53 29 77","email":"contact@cote-jardin.fr"}'::jsonb),
  ('partners_enabled', '{"enabled":false}'::jsonb),
  ('newsletter_enabled', '{"enabled":true}'::jsonb)
on conflict (section_key) do update set content = excluded.content;
