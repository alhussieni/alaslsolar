-- يضيف عمود التصنيف لجدول المقالات، بدون التأثير على المقالات الموجودة
alter table public.articles
  add column if not exists category text not null default 'general';

-- تحديث المقالات الأربعة الحالية بالتصنيف المناسب (عدّل الـ slug لو مختلف عندك)
update public.articles set category = 'intro' where slug = 'what-is-solar-energy';
update public.articles set category = 'compare' where slug = 'comparing-solar-systems';
update public.articles set category = 'maintenance' where slug = 'maintenance-and-lifespan';
update public.articles set category = 'applications' where slug = 'solar-applications';
