-- 20261013103150_products_display_category_subtype.sql
--
-- لماذا: إعادة تنظيم صفحة المنتجات (products.html). المطلوب إن إكسسوارات Huawei (حساس طاقة ذكي، دونجل WLAN، دونجل 4G، Smart Logger)
--        تظهر في الشجرة تحت: إنفرترات ← أون جريد ← Huawei ← إكسسوارات، مع إن category بتاعها الحقيقي "accessories".
-- ماذا: إضافة عمودين اختياريين (nullable) على products:
--         display_category : مكان ظهور المنتج في شجرة/جريد صفحة المنتجات (لو NULL يبقى هو نفسه category).
--         subtype          : اسم مستوى فرعي تحت الماركة في الشجرة (مثلاً accessories).
--       وتعيين القيمتين لإكسسوارات Huawei الأربعة فقط.
-- يعتمد عليه: products.html (select لـ display_category, subtype + بناء الشجرة).
--
-- سلامة: products.category ما بيتغيّرش خالص، فالحاسبات (pump/offgrid) وعروض الأسعار والخصومات (supplier_discounts / promotional_discounts)
--        وصفحة المنتج والسلة والمقارنة كلها بتفضل شايفة "accessories". الأعمدة الجديدة nullable بدون default،
--        فأي كود حالي (بما فيهم dashboard.js اللي بيحدّث بحقول صريحة) مش بيتأثر. نفّذ الـ migration دي قبل رفع products.html الجديدة.
-- Rollback: supabase/rollbacks/20261013103150_products_display_category_subtype.rollback.sql

alter table public.products
  add column if not exists display_category text,
  add column if not exists subtype text;

comment on column public.products.display_category is
  'مكان عرض المنتج في شجرة وجريد صفحة المنتجات العامة فقط. NULL = نفس category. لا يؤثر على الحاسبات أو عروض الأسعار أو الخصومات.';
comment on column public.products.subtype is
  'مستوى فرعي اختياري تحت الماركة في شجرة صفحة المنتجات (مثال: accessories). NULL = لا يظهر مستوى فرعي.';

-- إكسسوارات Huawei (4 منتجات) تظهر تحت أون جريد ← Huawei ← إكسسوارات
update public.products
   set display_category = 'ongrid',
       subtype          = 'accessories'
 where category = 'accessories'
   and brand = 'Huawei'
   and display_category is null;
