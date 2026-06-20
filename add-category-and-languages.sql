-- 1) عمود التصنيف (لفلتر المقالات)
alter table public.articles
  add column if not exists category text not null default 'general';

-- 2) أعمدة الترجمة لكل لغة (العنوان، الملخص، المحتوى)
-- العمود الأصلي (title, summary, content) بيُستخدم كنسخة احتياطية لو لغة معينة فاضية
alter table public.articles
  add column if not exists title_ar text,
  add column if not exists title_en text,
  add column if not exists title_es text,
  add column if not exists title_zh text,
  add column if not exists summary_ar text,
  add column if not exists summary_en text,
  add column if not exists summary_es text,
  add column if not exists summary_zh text,
  add column if not exists content_ar text,
  add column if not exists content_en text,
  add column if not exists content_es text,
  add column if not exists content_zh text;

-- 3) لو عندك مقالات موجودة بالفعل بالعربي في الأعمدة الأصلية،
-- نسخها لعمود title_ar / summary_ar / content_ar كنقطة بداية
update public.articles
set
  title_ar = coalesce(title_ar, title),
  summary_ar = coalesce(summary_ar, summary),
  content_ar = coalesce(content_ar, content)
where title_ar is null;

-- 4) تحديث التصنيف للمقالات الأربعة الحالية (عدّل الـ slug لو مختلف عندك)
update public.articles set category = 'intro' where slug = 'what-is-solar-energy';
update public.articles set category = 'compare' where slug = 'comparing-solar-systems';
update public.articles set category = 'maintenance' where slug = 'maintenance-and-lifespan';
update public.articles set category = 'applications' where slug = 'solar-applications';
