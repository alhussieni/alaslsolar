-- ════════════════════════════════════════════════
-- Run this in Supabase SQL Editor
-- Adds: site_stats table + faqs table
-- ════════════════════════════════════════════════

-- ── 1. Stats table ──────────────────────────────
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

insert into public.site_stats (id, value, label_en, label_ar, label_es, label_zh, sort_order)
values
  ('stat_1', '2026',  'Ready for new projects',    'جاهزون لمشاريع جديدة',       'Listos para nuevos proyectos', '准备接受新项目', 10),
  ('stat_2', '4',     'Main service sectors',      'قطاعات الخدمة الرئيسية',      'Sectores de servicio',         '主要服务领域',   20),
  ('stat_3', '24/7',  'Support-oriented operation','خدمة دعم متواصلة',            'Operación orientada al soporte','全天候支持运营', 30)
on conflict (id) do nothing;

alter table public.site_stats enable row level security;

drop policy if exists "Public can read stats" on public.site_stats;
create policy "Public can read stats"
  on public.site_stats for select using (true);

drop policy if exists "Admins can manage stats" on public.site_stats;
create policy "Admins can manage stats"
  on public.site_stats for all
  using (public.is_admin()) with check (public.is_admin());

-- ── 2. FAQ table ─────────────────────────────────
create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question_en text not null,
  answer_en   text not null,
  question_ar text not null default '',
  answer_ar   text not null default '',
  question_es text not null default '',
  answer_es   text not null default '',
  question_zh text not null default '',
  answer_zh   text not null default '',
  sort_order  int not null default 100,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.faqs (question_en, answer_en, question_ar, answer_ar, sort_order)
values
  (
    'Can solar reduce diesel consumption for irrigation?',
    'Yes. A properly sized solar or PV-diesel hybrid system can reduce generator runtime and fuel use while keeping pumps operational.',
    'هل تقلل الطاقة الشمسية استهلاك الديزل في الري؟',
    'نعم. يمكن لنظام شمسي أو هجين PV-Diesel مُصمَّم بشكل صحيح تقليل وقت تشغيل المولد واستهلاك الوقود مع الحفاظ على تشغيل المضخات.',
    10
  ),
  (
    'Do you provide batteries?',
    'Yes. Battery storage can be added for backup, load shifting, or improved operating reliability depending on the project needs.',
    'هل توفرون بطاريات تخزين؟',
    'نعم. يمكن إضافة تخزين البطاريات للنسخ الاحتياطي أو إدارة الأحمال أو تحسين موثوقية التشغيل حسب احتياجات المشروع.',
    20
  ),
  (
    'What information is needed for a quotation?',
    'Location, load details, working hours, current energy source, and available installation area help prepare a more accurate proposal.',
    'ما المعلومات المطلوبة للحصول على عرض سعر؟',
    'الموقع وتفاصيل الأحمال وساعات العمل ومصدر الطاقة الحالي والمساحة المتاحة للتركيب تساعد في إعداد عرض أكثر دقة.',
    30
  )
on conflict do nothing;

alter table public.faqs enable row level security;

drop policy if exists "Public can read published faqs" on public.faqs;
create policy "Public can read published faqs"
  on public.faqs for select using (published = true);

drop policy if exists "Admins can manage faqs" on public.faqs;
create policy "Admins can manage faqs"
  on public.faqs for all
  using (public.is_admin()) with check (public.is_admin());

-- ── Add page column to faqs (run if table already exists) ──
alter table public.faqs
  add column if not exists page text not null default 'home';

-- Update existing rows to set their page
update public.faqs set page = 'home' where page is null or page = '';

-- Add page column if not exists (run if table already created)
alter table public.faqs
  add column if not exists page text not null default 'home';

-- ── Add multi-image support to projects and articles ──
alter table public.projects
  add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.articles
  add column if not exists images jsonb not null default '[]'::jsonb;

-- images JSON structure per item:
-- [{ "url": "https://...", "position": "hero|inline|gallery", "caption": "..." }]
