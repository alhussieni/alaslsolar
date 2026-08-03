-- ============================================================
-- Al Asl Solar — Optional product-detail fields
-- Run once in Supabase SQL Editor. All columns are nullable —
-- product-detail.html only renders a section when the field is
-- actually filled in. Nothing here fakes data; it just adds the
-- storage so the admin dashboard/editor can populate it per product.
-- ============================================================

alter table public.products
  add column if not exists sku            text,             -- e.g. 'VCLB-1.2K-100-Li'
  add column if not exists description    text,             -- long-form paragraph, shown in "الوصف" tab
  add column if not exists key_features   text[],           -- bullet list, e.g. {'خلايا LiFePO4 عالية الجودة','نظام BMS ذكي'}
  add column if not exists applications   text[],           -- tags matching APP_ICONS in product-detail.html: solar, home, farm, ups, ev, camera, industrial, irrigation
  add column if not exists rating         numeric(2,1),      -- 0.0–5.0
  add column if not exists review_count   int,
  add column if not exists warranty_years int,
  add column if not exists warranty_notes text,
  -- quick-facts strip (only shown per-field, when present)
  add column if not exists temp_min       numeric,
  add column if not exists temp_max       numeric,
  add column if not exists weight_kg      numeric,
  add column if not exists ip_rating      text,             -- e.g. 'IP65'
  add column if not exists cycle_life     text,             -- e.g. '6000+'
  add column if not exists capacity_ah    numeric,          -- batteries
  add column if not exists voltage_v      numeric;
