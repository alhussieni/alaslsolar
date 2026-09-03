-- ============================================================
-- Al Asl Solar — Promotional Discounts
-- Run this in the Supabase SQL Editor once.
--
-- SECURITY NOTE — WHY THIS IS A SEPARATE TABLE FROM supplier_discounts:
-- supplier_discounts holds internal margin data (supplier_discount_pct,
-- sale_discount_pct) that must NEVER be readable by the public / anon key
-- (see the admin UI note: "بيُستخدم بس داخليًا... مش ظاهر للعميل ولا
-- للمندوب أبدًا"). The products page needs to read the promo percentage
-- with the public anon key to compute the discounted display price, so it
-- cannot share a table (or a public-read RLS policy) with supplier_discounts
-- without leaking cost/margin data to anyone who opens devtools.
-- This table stores ONLY (category, brand, promo %, active flag) — nothing
-- sensitive — so it is safe to expose via a public SELECT policy.
-- ============================================================

create table if not exists public.promotional_discounts (
  id                  uuid primary key default gen_random_uuid(),
  category            text not null,
  brand               text not null,
  name                text,                 -- e.g. "خصم رأس السنة", optional label for the admin list
  promo_discount_pct  numeric(5,2) not null default 0,
  is_active           boolean not null default false,
  start_date          date,                 -- nullable, reserved for future scheduling
  end_date            date,                 -- nullable, reserved for future scheduling
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (category, brand)
);

alter table public.promotional_discounts enable row level security;

-- Public (anon) can read ONLY active promos — this is what products.html
-- and product-detail.html use to compute the discounted display price.
drop policy if exists "promo_discounts_public_read" on public.promotional_discounts;
create policy "promo_discounts_public_read" on public.promotional_discounts
  for select using (is_active = true);

-- Only admins can create/edit/delete promotions.
drop policy if exists "promo_discounts_admin_write" on public.promotional_discounts;
create policy "promo_discounts_admin_write" on public.promotional_discounts
  for all using (public.is_admin());
