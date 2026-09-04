-- ============================================================
-- Al Asl Solar — Feasibility Studies (دراسة جدوى)
-- Run this in the Supabase SQL Editor once.
--
-- Stores the ROI assumptions a rep enters for a given saved quote
-- (quote_id, nullable — a study can also be built standalone) so
-- it can be reopened/edited later instead of re-typed each time.
-- No server-side calc needed (unlike quotes, which go through the
-- solar-pump-quote edge function to hide supplier margins) — the
-- numbers here are all things the rep is meant to see and adjust,
-- so plain client-side RLS (reps manage their own rows, admins see
-- all) is enough; there's nothing sensitive to hide from the rep.
-- ============================================================

create table if not exists public.feasibility_studies (
  id                        bigint generated always as identity primary key,
  quote_id                  bigint references public.quotes(id) on delete set null,
  rep_id                    uuid not null references public.reps(id),
  customer_name             text,
  customer_phone            text,
  system_label              text,                 -- e.g. "منظومة غطاس 100 حصان"
  capex                     numeric not null default 0,
  system_kw                 numeric not null default 0,
  psh                       numeric not null default 5.5,   -- ساعات الذروة الشمسية (Peak Sun Hours)
  degradation_pct           numeric not null default 0.65,  -- تدهور كفاءة الألواح سنويًا %
  electricity_price         numeric not null default 0,     -- جنيه/kWh
  electricity_escalation_pct numeric not null default 8,    -- تصاعد سعر الشبكة سنويًا %
  diesel_price              numeric not null default 0,     -- جنيه/لتر
  diesel_escalation_pct     numeric not null default 8,      -- تصاعد سعر الديزيل سنويًا %
  generator_kwh_per_liter   numeric not null default 3.5,    -- استهلاك المولد kWh/لتر ديزيل
  annual_maintenance_pct    numeric not null default 1,      -- الصيانة السنوية % من CAPEX
  discount_rate_pct         numeric not null default 10,      -- معدل الخصم لحساب NPV %
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table public.feasibility_studies enable row level security;

drop policy if exists "feasibility_studies_select" on public.feasibility_studies;
create policy "feasibility_studies_select" on public.feasibility_studies
  for select using (is_admin() or (is_rep() and rep_id = auth.uid()));

drop policy if exists "feasibility_studies_insert" on public.feasibility_studies;
create policy "feasibility_studies_insert" on public.feasibility_studies
  for insert with check (is_rep() and rep_id = auth.uid());

drop policy if exists "feasibility_studies_update" on public.feasibility_studies;
create policy "feasibility_studies_update" on public.feasibility_studies
  for update using (is_admin() or (is_rep() and rep_id = auth.uid()));

drop policy if exists "feasibility_studies_delete" on public.feasibility_studies;
create policy "feasibility_studies_delete" on public.feasibility_studies
  for delete using (is_admin() or (is_rep() and rep_id = auth.uid()));
