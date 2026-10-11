-- ============================================================
-- Align the new accessories (sort_order 5101-5137) with the storefront
-- naming convention used by product-detail.html:
--   name_ar  = product TYPE (قاطع / فيوز / كونيكتور MC4 / صاعق) incl. poles (2P/3P/4P)
--   specs_ar = the rating (amps ...)
-- Already applied on production. Only needed on a database that was loaded with the
-- first version of supabase-add-sep-2026-pricelist.sql (the current version of that
-- file already contains these names, so do NOT run both on a fresh database).
-- ============================================================
begin;
update public.products set name_ar='كونيكتور MC4 أحادي', name_en='SunX MC4 Connector Single', specs_ar='1500V', specs_en='Single MC4 1500V' where category='accessories' and brand='SunX Power' and sort_order=5101 and published=false;
update public.products set name_ar='كونيكتور MC4 Y-2x1', name_en='SunX MC4 Connector Y 2x1', specs_ar='1500V', specs_en='MC4 Y 2x1 1500V' where category='accessories' and brand='SunX Power' and sort_order=5102 and published=false;
update public.products set name_ar='كونيكتور MC4 Y-3x1', name_en='SunX MC4 Connector Y 3x1', specs_ar='1500V', specs_en='MC4 Y 3x1 1500V' where category='accessories' and brand='SunX Power' and sort_order=5103 and published=false;
update public.products set name_ar='كونيكتور MC4 Y-4x1', name_en='SunX MC4 Connector Y 4x1', specs_ar='1500V', specs_en='MC4 Y 4x1 1500V' where category='accessories' and brand='SunX Power' and sort_order=5104 and published=false;
update public.products set name_ar='كونيكتور MC4 Y-5x1', name_en='SunX MC4 Connector Y 5x1', specs_ar='1500V', specs_en='MC4 Y 5x1 1500V' where category='accessories' and brand='SunX Power' and sort_order=5105 and published=false;
update public.products set name_ar='قاطع DC رباعي 4P 1000V', name_en='Kayal DC Circuit Breaker 4 Pole 1000V', specs_ar='32 A', specs_en='32A' where category='accessories' and brand='Kayal' and sort_order=5106 and published=false;
update public.products set name_ar='قاطع DC رباعي 4P 1000V', name_en='Kayal DC Circuit Breaker 4 Pole 1000V', specs_ar='63 A', specs_en='63A' where category='accessories' and brand='Kayal' and sort_order=5107 and published=false;
update public.products set name_ar='قاطع DC رباعي 4P 1000V', name_en='Kayal DC Circuit Breaker 4 Pole 1000V', specs_ar='80 A', specs_en='80A' where category='accessories' and brand='Kayal' and sort_order=5108 and published=false;
update public.products set name_ar='قاطع DC رباعي 4P 1000V', name_en='Kayal DC Circuit Breaker 4 Pole 1000V', specs_ar='100 A', specs_en='100A' where category='accessories' and brand='Kayal' and sort_order=5109 and published=false;
update public.products set name_ar='قاطع DC رباعي 4P 1000V', name_en='Kayal DC Circuit Breaker 4 Pole 1000V', specs_ar='125 A', specs_en='125A' where category='accessories' and brand='Kayal' and sort_order=5110 and published=false;
update public.products set name_ar='قاطع DC رباعي 4P 1000V', name_en='Kayal DC Circuit Breaker 4 Pole 1000V', specs_ar='160 A', specs_en='160A' where category='accessories' and brand='Kayal' and sort_order=5111 and published=false;
update public.products set name_ar='قاطع DC رباعي 4P 1000V', name_en='Kayal DC Circuit Breaker 4 Pole 1000V', specs_ar='200 A', specs_en='200A' where category='accessories' and brand='Kayal' and sort_order=5112 and published=false;
update public.products set name_ar='قاطع DC رباعي 4P 1000V', name_en='Kayal DC Circuit Breaker 4 Pole 1000V', specs_ar='250 A', specs_en='250A' where category='accessories' and brand='Kayal' and sort_order=5113 and published=false;
update public.products set name_ar='فيوز مع حامل 1000V', name_en='Kayal Fuse + Holder 1000V', specs_ar='20 A', specs_en='20A' where category='accessories' and brand='Kayal' and sort_order=5114 and published=false;
update public.products set name_ar='فيوز مع حامل 1000V', name_en='Kayal Fuse + Holder 1000V', specs_ar='25 A', specs_en='25A' where category='accessories' and brand='Kayal' and sort_order=5115 and published=false;
update public.products set name_ar='فيوز مع حامل 1000V', name_en='Kayal Fuse + Holder 1000V', specs_ar='30 A', specs_en='30A' where category='accessories' and brand='Kayal' and sort_order=5116 and published=false;
update public.products set name_ar='صاعق صواعق SURGE 3 قطب 1000V DC', name_en='Kayal Surge Protector 3 Pole 1000V DC', specs_ar='20-40KA', specs_en='20-40KA' where category='accessories' and brand='Kayal' and sort_order=5117 and published=false;
update public.products set name_ar='قاطع C.B SL7N-63 ثنائي 2P 550V', name_en='Suntree Circuit Breaker SL7N-63 2 Pole 550V', specs_ar='32 A - 550V', specs_en='32A - 550V' where category='accessories' and brand='Suntree' and sort_order=5118 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثنائي 2P 1000V', name_en='Suntree SM8 MCCB 2 Pole 1000V', specs_ar='80 A - 1000V', specs_en='80A - 1000V' where category='accessories' and brand='Suntree' and sort_order=5119 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثنائي 2P 1000V', name_en='Suntree SM8 MCCB 2 Pole 1000V', specs_ar='100 A - 1000V', specs_en='100A - 1000V' where category='accessories' and brand='Suntree' and sort_order=5120 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثنائي 2P 1000V', name_en='Suntree SM8 MCCB 2 Pole 1000V', specs_ar='125 A - 1000V', specs_en='125A - 1000V' where category='accessories' and brand='Suntree' and sort_order=5121 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثنائي 2P 1000V', name_en='Suntree SM8 MCCB 2 Pole 1000V', specs_ar='160 A - 1000V', specs_en='160A - 1000V' where category='accessories' and brand='Suntree' and sort_order=5122 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثنائي 2P 1000V', name_en='Suntree SM8 MCCB 2 Pole 1000V', specs_ar='250 A - 1000V', specs_en='250A - 1000V' where category='accessories' and brand='Suntree' and sort_order=5123 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثلاثي 3P 1500V', name_en='Suntree SM8 MCCB 3 Pole 1500V', specs_ar='80 A - 1500V', specs_en='80A - 1500V' where category='accessories' and brand='Suntree' and sort_order=5124 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثلاثي 3P 1500V', name_en='Suntree SM8 MCCB 3 Pole 1500V', specs_ar='100 A - 1500V', specs_en='100A - 1500V' where category='accessories' and brand='Suntree' and sort_order=5125 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثلاثي 3P 1500V', name_en='Suntree SM8 MCCB 3 Pole 1500V', specs_ar='125 A - 1500V', specs_en='125A - 1500V' where category='accessories' and brand='Suntree' and sort_order=5126 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثلاثي 3P 1500V', name_en='Suntree SM8 MCCB 3 Pole 1500V', specs_ar='160 A - 1500V', specs_en='160A - 1500V' where category='accessories' and brand='Suntree' and sort_order=5127 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثلاثي 3P 1500V', name_en='Suntree SM8 MCCB 3 Pole 1500V', specs_ar='250 A - 1500V', specs_en='250A - 1500V' where category='accessories' and brand='Suntree' and sort_order=5128 and published=false;
update public.products set name_ar='قاطع MCCB SM8 ثلاثي 3P 1500V', name_en='Suntree SM8 MCCB 3 Pole 1500V', specs_ar='300 A - 1500V', specs_en='300A - 1500V' where category='accessories' and brand='Suntree' and sort_order=5129 and published=false;
update public.products set name_ar='قاطع C.B SL7N-63 رباعي 4P 1000V', name_en='Suntree Circuit Breaker SL7N-63 4 Pole 1000V', specs_ar='32 A - 1000V', specs_en='32A - 1000V' where category='accessories' and brand='Suntree' and sort_order=5130 and published=false;
update public.products set name_ar='قاطع C.B SL7N-63 رباعي 4P 1000V', name_en='Suntree Circuit Breaker SL7N-63 4 Pole 1000V', specs_ar='63 A - 1000V', specs_en='63A - 1000V' where category='accessories' and brand='Suntree' and sort_order=5131 and published=false;
update public.products set name_ar='قاطع MCCB SM8 رباعي 4P 1500V', name_en='Suntree SM8 MCCB 4 Pole 1500V', specs_ar='400 A - 1500V', specs_en='400A - 1500V' where category='accessories' and brand='Suntree' and sort_order=5132 and published=false;
update public.products set name_ar='فيوز مع حامل SRD-30 1000V', name_en='Suntree Fuse Holder and Link SRD-30 1000V', specs_ar='20 A', specs_en='20A' where category='accessories' and brand='Suntree' and sort_order=5133 and published=false;
update public.products set name_ar='فيوز مع حامل SRD-30 1000V', name_en='Suntree Fuse Holder and Link SRD-30 1000V', specs_ar='25 A', specs_en='25A' where category='accessories' and brand='Suntree' and sort_order=5134 and published=false;
update public.products set name_ar='فيوز مع حامل SRD-30 1000V', name_en='Suntree Fuse Holder and Link SRD-30 1000V', specs_ar='30 A', specs_en='30A' where category='accessories' and brand='Suntree' and sort_order=5135 and published=false;
update public.products set name_ar='صاعق صواعق SUP2H1-PV 3 قطب 1000V', name_en='Suntree Surge Protector SUP2H1-PV 3 Pole 1000V', specs_ar='20-40KA', specs_en='20-40KA' where category='accessories' and brand='Suntree' and sort_order=5136 and published=false;
update public.products set name_ar='كونيكتور MC4 أحادي 6 مم', name_en='Suntree MC4 Connector 6mm Cable', specs_ar='كابل PV 6 مم - 1500V', specs_en='PV 6mm 1500V cable use' where category='accessories' and brand='Suntree' and sort_order=5137 and published=false;
commit;
