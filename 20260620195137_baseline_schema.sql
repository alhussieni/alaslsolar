-- ════════════════════════════════════════════════════════════════
-- Al Asl Solar — Security & performance hardening
-- Follow-up to 20260620195137_baseline_schema.sql
--
-- Fixes applied (matches Supabase Performance/Security Advisor):
--  1. Multiple permissive SELECT policies on every content/pricing
--     table (one "Public can read" + one "Admins can manage" that
--     also covers SELECT) are merged into a single SELECT policy.
--     The separate "manage" policy is narrowed to INSERT/UPDATE/
--     DELETE only. No access is removed — admins could already see
--     everything via the old policy; this only removes the
--     duplicate evaluation per query.
--  2. The public storage buckets (site-media, datasheets) had a
--     SELECT policy on storage.objects that allowed clients to list
--     every file in the bucket via the Storage API. Public buckets
--     are already readable by direct object URL without this
--     policy, so it is dropped. Existing <bucket>/<file> URLs used
--     in articles/products keep working unchanged.
--
-- Not addressed here (left for manual/dashboard action):
--  - "Leaked password protection disabled" — toggled in
--    Authentication > Providers > Password in the Supabase
--    Dashboard, not available via SQL.
--  - is_admin() being callable by anon/authenticated — required by
--    design: every public-read policy below calls public.is_admin()
--    even for anonymous requests, so EXECUTE must remain granted.
-- ════════════════════════════════════════════════════════════════

-- ── articles ──
drop policy if exists "Admins can manage articles" on public.articles;
drop policy if exists "Public can read published articles" on public.articles;

create policy "Public can read published articles"
on public.articles for select
using (published = true or public.is_admin());

create policy "Admins can insert articles" on public.articles
for insert with check (public.is_admin());
create policy "Admins can update articles" on public.articles
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete articles" on public.articles
for delete using (public.is_admin());

-- ── projects ──
drop policy if exists "Admins can manage projects" on public.projects;
drop policy if exists "Public can read published projects" on public.projects;

create policy "Public can read published projects"
on public.projects for select
using (published = true or public.is_admin());

create policy "Admins can insert projects" on public.projects
for insert with check (public.is_admin());
create policy "Admins can update projects" on public.projects
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete projects" on public.projects
for delete using (public.is_admin());

-- ── faqs ──
drop policy if exists "Admins can manage faqs" on public.faqs;
drop policy if exists "Public can read published faqs" on public.faqs;

create policy "Public can read published faqs"
on public.faqs for select
using (published = true or public.is_admin());

create policy "Admins can insert faqs" on public.faqs
for insert with check (public.is_admin());
create policy "Admins can update faqs" on public.faqs
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete faqs" on public.faqs
for delete using (public.is_admin());

-- ── products ──
drop policy if exists "Admins can manage products" on public.products;
drop policy if exists "Public can read published products" on public.products;

create policy "Public can read published products"
on public.products for select
using (published = true or public.is_admin());

create policy "Admins can insert products" on public.products
for insert with check (public.is_admin());
create policy "Admins can update products" on public.products
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete products" on public.products
for delete using (public.is_admin());

-- ── site_stats ──
drop policy if exists "Admins can manage stats" on public.site_stats;
drop policy if exists "Public can read stats" on public.site_stats;

create policy "Public can read stats"
on public.site_stats for select
using (true);

create policy "Admins can insert stats" on public.site_stats
for insert with check (public.is_admin());
create policy "Admins can update stats" on public.site_stats
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete stats" on public.site_stats
for delete using (public.is_admin());

-- ── calculator_prices ──
drop policy if exists "Admins can manage prices" on public.calculator_prices;
drop policy if exists "Public can read active prices" on public.calculator_prices;

create policy "Public can read active prices"
on public.calculator_prices for select
using (active = true or public.is_admin());

create policy "Admins can insert prices" on public.calculator_prices
for insert with check (public.is_admin());
create policy "Admins can update prices" on public.calculator_prices
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete prices" on public.calculator_prices
for delete using (public.is_admin());

-- ── irr_prices ──
drop policy if exists "Admins manage irr_prices" on public.irr_prices;
drop policy if exists "Public read irr_prices" on public.irr_prices;

create policy "Public read irr_prices"
on public.irr_prices for select
using (active = true or public.is_admin());

create policy "Admins can insert irr_prices" on public.irr_prices
for insert with check (public.is_admin());
create policy "Admins can update irr_prices" on public.irr_prices
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete irr_prices" on public.irr_prices
for delete using (public.is_admin());

-- ── ongrid_prices ──
drop policy if exists "Admins manage ongrid_prices" on public.ongrid_prices;
drop policy if exists "Public read ongrid_prices" on public.ongrid_prices;

create policy "Public read ongrid_prices"
on public.ongrid_prices for select
using (active = true or public.is_admin());

create policy "Admins can insert ongrid_prices" on public.ongrid_prices
for insert with check (public.is_admin());
create policy "Admins can update ongrid_prices" on public.ongrid_prices
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete ongrid_prices" on public.ongrid_prices
for delete using (public.is_admin());

-- ── offgrid_packages ──
drop policy if exists "Admins manage offgrid_packages" on public.offgrid_packages;
drop policy if exists "Public read offgrid_packages" on public.offgrid_packages;

create policy "Public read offgrid_packages"
on public.offgrid_packages for select
using (active = true or public.is_admin());

create policy "Admins can insert offgrid_packages" on public.offgrid_packages
for insert with check (public.is_admin());
create policy "Admins can update offgrid_packages" on public.offgrid_packages
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete offgrid_packages" on public.offgrid_packages
for delete using (public.is_admin());

-- ── offgrid_component_prices ──
drop policy if exists "Admins manage component prices" on public.offgrid_component_prices;
drop policy if exists "Public read component prices" on public.offgrid_component_prices;

create policy "Public read component prices"
on public.offgrid_component_prices for select
using (true);

create policy "Admins can insert component prices" on public.offgrid_component_prices
for insert with check (public.is_admin());
create policy "Admins can update component prices" on public.offgrid_component_prices
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete component prices" on public.offgrid_component_prices
for delete using (public.is_admin());

-- ── panel_config ──
drop policy if exists "Admins manage panel_config" on public.panel_config;
drop policy if exists "Public read panel_config" on public.panel_config;

create policy "Public read panel_config"
on public.panel_config for select
using (active = true or public.is_admin());

create policy "Admins can insert panel_config" on public.panel_config
for insert with check (public.is_admin());
create policy "Admins can update panel_config" on public.panel_config
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete panel_config" on public.panel_config
for delete using (public.is_admin());

-- ── inverter_prices ──
drop policy if exists "Admins manage inverter_prices" on public.inverter_prices;
drop policy if exists "Public read inverter_prices" on public.inverter_prices;

create policy "Public read inverter_prices"
on public.inverter_prices for select
using (active = true or public.is_admin());

create policy "Admins can insert inverter_prices" on public.inverter_prices
for insert with check (public.is_admin());
create policy "Admins can update inverter_prices" on public.inverter_prices
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete inverter_prices" on public.inverter_prices
for delete using (public.is_admin());

-- ── chassis_prices ──
drop policy if exists "Admins manage chassis_prices" on public.chassis_prices;
drop policy if exists "Public read chassis_prices" on public.chassis_prices;

create policy "Public read chassis_prices"
on public.chassis_prices for select
using (active = true or public.is_admin());

create policy "Admins can insert chassis_prices" on public.chassis_prices
for insert with check (public.is_admin());
create policy "Admins can update chassis_prices" on public.chassis_prices
for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete chassis_prices" on public.chassis_prices
for delete using (public.is_admin());

-- ── storage: remove bucket-listing SELECT policies on public buckets ──
-- Public object URLs (used throughout articles/products) keep working;
-- only bulk listing via the Storage API is removed.
drop policy if exists "Public can read site media" on storage.objects;
drop policy if exists "Public can read datasheets" on storage.objects;
