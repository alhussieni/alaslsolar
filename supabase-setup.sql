-- Al Asl Solar Supabase setup
-- 1) In Supabase Authentication, create an admin user with email/password.
-- 2) Replace the email below with your admin email.
-- 3) Run this file in Supabase SQL Editor.

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz default now()
);

insert into public.admin_users (email)
values ('REDACTED')
on conflict (email) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Project',
  location text,
  capacity text,
  year int,
  summary text not null,
  image_url text,
  published boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  summary text not null,
  content text not null,
  image_url text,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.projects enable row level security;
alter table public.articles enable row level security;

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users
for select
using (public.is_admin());

drop policy if exists "Public can read published projects" on public.projects;
create policy "Public can read published projects"
on public.projects
for select
using (published = true);

drop policy if exists "Admins can manage projects" on public.projects;
create policy "Admins can manage projects"
on public.projects
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read published articles" on public.articles;
create policy "Public can read published articles"
on public.articles
for select
using (published = true);

drop policy if exists "Admins can manage articles" on public.articles;
create policy "Admins can manage articles"
on public.articles
for all
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do nothing;

drop policy if exists "Public can read site media" on storage.objects;
create policy "Public can read site media"
on storage.objects
for select
using (bucket_id = 'site-media');

drop policy if exists "Admins can upload site media" on storage.objects;
create policy "Admins can upload site media"
on storage.objects
for insert
with check (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "Admins can update site media" on storage.objects;
create policy "Admins can update site media"
on storage.objects
for update
using (bucket_id = 'site-media' and public.is_admin())
with check (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "Admins can delete site media" on storage.objects;
create policy "Admins can delete site media"
on storage.objects
for delete
using (bucket_id = 'site-media' and public.is_admin());

-- ── Stats table (for homepage statistics) ──
create table if not exists public.site_stats (
  id text primary key,
  value text not null,
  label_en text not null,
  label_ar text not null,
  label_es text not null default '',
  label_zh text not null default '',
  sort_order int not null default 10,
  updated_at timestamptz not null default now()
);

-- Default stats (edit values in Admin Dashboard)
insert into public.site_stats (id, value, label_en, label_ar, label_es, label_zh, sort_order)
values
  ('stat_1', '2026',  'Ready for new projects',   'جاهزون لمشاريع جديدة',       'Listos para nuevos proyectos', '准备接受新项目', 10),
  ('stat_2', '4',     'Main service sectors',     'قطاعات الخدمة الرئيسية',      'Sectores de servicio',         '主要服务领域',   20),
  ('stat_3', '24/7',  'Support-oriented operation','خدمة دعم متواصلة',            'Operación orientada al soporte','全天候支持运营', 30)
on conflict (id) do nothing;

alter table public.site_stats enable row level security;

drop policy if exists "Public can read stats" on public.site_stats;
create policy "Public can read stats"
on public.site_stats
for select
using (true);

drop policy if exists "Admins can manage stats" on public.site_stats;
create policy "Admins can manage stats"
on public.site_stats
for all
using (public.is_admin())
with check (public.is_admin());
