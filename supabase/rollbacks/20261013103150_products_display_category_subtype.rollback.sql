-- Rollback لـ 20261013103150_products_display_category_subtype.sql
-- بيرجّع إكسسوارات Huawei لمكانها الأصلي ثم يحذف العمودين. products.category ما اتغيّرش أصلاً فمفيش بيانات تانية تتأثر.
-- لو products.html الجديدة لسه مرفوعة، ارجع لنسختها القديمة الأول (هي بتعمل select للعمودين).

update public.products
   set display_category = null,
       subtype          = null
 where category = 'accessories'
   and brand = 'Huawei';

alter table public.products
  drop column if exists display_category,
  drop column if exists subtype;
