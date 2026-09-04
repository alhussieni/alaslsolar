-- ============================================================
-- Al Asl Solar — ROI Settings (electricity price + diesel price)
-- Run this in the Supabase SQL Editor once.
--
-- Single-row settings table (id=1), same pattern as
-- irrigation_bom_settings: reps + admins can read (needed later
-- for ROI calculations inside the rep quote tools in QL/), only
-- admins can write. Not public-readable — this has no reason to
-- be exposed to site visitors.
--
-- Extensible on purpose: more columns (e.g. diesel generator
-- consumption rate, operating hours, tariff tiers) can be added
-- later with a plain `alter table ... add column` — the id=1
-- singleton pattern and RLS policies won't need to change.
-- ============================================================

create table if not exists public.roi_settings (
  id                        smallint primary key default 1,
  electricity_price_per_kwh numeric(10,4) not null default 0,
  diesel_price_per_liter    numeric(10,4) not null default 0,
  discount_rate_pct         numeric(6,2) not null default 19.5,
  updated_at                timestamptz not null default now(),
  constraint roi_settings_singleton check (id = 1)
);

insert into public.roi_settings (id, electricity_price_per_kwh, diesel_price_per_liter)
values (1, 0, 0)
on conflict (id) do nothing;

alter table public.roi_settings enable row level security;

drop policy if exists "roi_settings_read" on public.roi_settings;
create policy "roi_settings_read" on public.roi_settings
  for select using (is_rep() or is_admin());

drop policy if exists "roi_settings_admin_write" on public.roi_settings;
create policy "roi_settings_admin_write" on public.roi_settings
  for update using (is_admin());
