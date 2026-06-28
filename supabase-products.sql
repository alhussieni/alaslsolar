-- ============================================================
-- Al Asl Solar — Products Table
-- Run this in the Supabase SQL Editor once.
-- ============================================================

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  category      text not null,           -- 'inverters' | 'panels' | 'accessories' | 'structures' | 'cables' | 'combiners'
  brand         text,
  name          text not null,
  specs         text,                    -- e.g. "5.5 HP - 4 KW"
  unit          text default 'قطعة',    -- قطعة / متر / طقم
  price         numeric(12,2) not null,
  notes         text,
  published     boolean not null default true,
  sort_order    int not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS
alter table public.products enable row level security;

-- Anyone can read published products
create policy "products_public_read" on public.products
  for select using (published = true);

-- Only admins can insert / update / delete
create policy "products_admin_write" on public.products
  for all using (public.is_admin());

-- ============================================================
-- SEED DATA — Inverters (VEICHI)
-- ============================================================
insert into public.products (category, brand, name, specs, price, sort_order) values
('inverters','VEICHI','إنفرتر VEICHI','5.5 HP - 4 KW',10300,10),
('inverters','VEICHI','إنفرتر VEICHI','7.5 HP - 5.5 KW',11800,11),
('inverters','VEICHI','إنفرتر VEICHI','10 HP - 7.5 KW',15000,12),
('inverters','VEICHI','إنفرتر VEICHI','15 HP - 10 KW',19900,13),
('inverters','VEICHI','إنفرتر VEICHI','20 HP - 15 KW',23800,14),
('inverters','VEICHI','إنفرتر VEICHI','25 HP - 18.5 KW',30000,15),
('inverters','VEICHI','إنفرتر VEICHI','30 HP - 22 KW',35500,16),
('inverters','VEICHI','إنفرتر VEICHI','40 HP - 30 KW',48500,17),
('inverters','VEICHI','إنفرتر VEICHI','50 HP - 37 KW',54500,18),
('inverters','VEICHI','إنفرتر VEICHI','60 HP - 45 KW',74000,19),
('inverters','VEICHI','إنفرتر VEICHI','75 HP - 55 KW',82300,20),
('inverters','VEICHI','إنفرتر VEICHI','100 HP - 75 KW',102000,21),
('inverters','VEICHI','إنفرتر VEICHI','125 HP - 90 KW',115000,22),
('inverters','VEICHI','إنفرتر VEICHI','150 HP - 110 KW',138000,23),
('inverters','VEICHI','إنفرتر VEICHI','180 HP - 132 KW',177000,24),
('inverters','VEICHI','إنفرتر VEICHI','225 HP - 160 KW',198000,25),
('inverters','VEICHI','إنفرتر VEICHI','250 HP - 185 KW',309000,26),
('inverters','VEICHI','إنفرتر VEICHI','275 HP - 200 KW',340000,27),
('inverters','VEICHI','إنفرتر VEICHI','300 HP - 220 KW',390000,28);

-- ============================================================
-- SEED DATA — Inverters (Delixi)
-- ============================================================
insert into public.products (category, brand, name, specs, price, sort_order) values
('inverters','Delixi','إنفرتر Delixi','1 HP - 0.75 KW',7700,30),
('inverters','Delixi','إنفرتر Delixi','2 HP - 1.5 KW',8000,31),
('inverters','Delixi','إنفرتر Delixi','3 HP - 2.2 KW',9600,32),
('inverters','Delixi','إنفرتر Delixi','5.5 HP - 4 KW',10600,33),
('inverters','Delixi','إنفرتر Delixi','7.5 HP - 5.5 KW',14000,34),
('inverters','Delixi','إنفرتر Delixi','10 HP - 7.5 KW',15200,35),
('inverters','Delixi','إنفرتر Delixi','15 HP - 10 KW',19700,36),
('inverters','Delixi','إنفرتر Delixi','20 HP - 15 KW',22600,37),
('inverters','Delixi','إنفرتر Delixi','25 HP - 18.5 KW',29400,38),
('inverters','Delixi','إنفرتر Delixi','30 HP - 22 KW',35600,39),
('inverters','Delixi','إنفرتر Delixi','40 HP - 30 KW',44400,40),
('inverters','Delixi','إنفرتر Delixi','50 HP - 37 KW',53200,41),
('inverters','Delixi','إنفرتر Delixi','60 HP - 45 KW',68400,42),
('inverters','Delixi','إنفرتر Delixi','75 HP - 55 KW',75700,43),
('inverters','Delixi','إنفرتر Delixi','100 HP - 75 KW',86300,44),
('inverters','Delixi','إنفرتر Delixi','125 HP - 90 KW',106200,45),
('inverters','Delixi','إنفرتر Delixi','150 HP - 110 KW',121600,46),
('inverters','Delixi','إنفرتر Delixi','180 HP - 132 KW',156200,47);

-- ============================================================
-- SEED DATA — Solar Panels (per Watt pricing)
-- ============================================================
insert into public.products (category, brand, name, specs, unit, price, sort_order, notes) values
('panels','Trinasolar','الواح ترينا 725 وات باي فيشيال N-Tip','725W Bifacial','وات',8.45,50,NULL),
('panels','Trinasolar','الواح ترينا 720 وات باي فيشيال N-Tip','720W Bifacial','وات',8.45,51,NULL),
('panels','Trinasolar','الواح ترينا 715 وات باي فيشيال N-Tip','715W Bifacial','وات',8.45,52,NULL),
('panels','Trinasolar','الواح ترينا 615/625 وات باي فيشيال N-Tip','615-625W Bifacial','وات',8.35,53,NULL),
('panels','Trinasolar','الواح ترينا 450 وات دبل جلاس','450W Double Glass','وات',8.50,54,NULL),
('panels','Jinko','الواح جينكو 720 وات باي فيشيال N-Tip','720W Bifacial','وات',8.50,55,NULL),
('panels','Jinko','الواح جينكو 620 وات باي فيشيال N-Tip','620W Bifacial','وات',8.50,56,NULL),
('panels','Longi','الواح لونجي 650 وات Hi-MO X10 باي فيشيال N-Tip','650W Hi-MO X10 Bifacial','وات',8.50,57,'Hi-MO X10'),
('panels','Longi','الواح لونجي 630 وات باي فيشيال N-Tip','630W Bifacial','وات',8.40,58,NULL),
('panels','Longi','الواح لونجي 615/605 وات باي فيشيال N-Tip','605-615W Bifacial','وات',8.40,59,NULL),
('panels','Longi','الواح لونجي 575 وات','575W','وات',8.40,60,NULL),
('panels','JA Solar','الواح جا سولار 715 وات باي فيشيال N-Tip','715W Bifacial','وات',8.25,61,NULL),
('panels','JA Solar','الواح جا سولار 625 وات باي فيشيال N-Tip','625W Bifacial','وات',8.25,62,NULL),
('panels','Astronergy','الواح استرو انيرجي 715 وات باي فيشيال N-Tip','715W Bifacial','وات',8.00,63,NULL),
('panels','Ikoo','الواح ايكو 640/645 وات باي فيشيال N-Tip','640-645W Bifacial','وات',8.25,64,NULL),
('panels','Canadian Solar','الواح كانيدين 710 وات باي فيشيال N-Tip','710W Bifacial','وات',8.35,65,NULL),
('panels','Canadian Solar','الواح كانيدين 615 وات باي فيشيال N-Tip','615W Bifacial','وات',8.30,66,NULL),
('panels','REC','الواح رايزين 700 وات باي فيشيال N-Tip','700W Bifacial','وات',8.35,67,NULL),
('panels','Jolywood','الواح جوكين 625 وات باي فيشيال N-Tip','625W Bifacial','وات',7.95,68,NULL),
('panels','Qcells','الواح كوانتوم 590 وات باي فيشيال N-Tip','590W Bifacial','وات',7.75,69,NULL),
('panels','Nork','الواح نورك 550 وات','550W','وات',7.25,70,NULL);

-- ============================================================
-- SEED DATA — Accessories (Suntree)
-- ============================================================
insert into public.products (category, brand, name, specs, price, sort_order) values
('accessories','Suntree','فيوز مع حامل FUSE WITH HOLDER','16-20-25A',160,80),
('accessories','Suntree','فيوز مع حامل FUSE WITH HOLDER','40-50A',300,81),
('accessories','Suntree','قاطع C.B ثنائي 2P','32-63A',700,82),
('accessories','Suntree','قاطع C.B ثلاثي 3P','32-63A',800,83),
('accessories','Suntree','قاطع C.B رباعي 4P','32-63A',1000,84),
('accessories','Suntree','قاطع MCCB ثنائي 2P','80-100-125-160A',3800,85),
('accessories','Suntree','قاطع MCCB ثنائي 2P','200-250A',4300,86),
('accessories','Suntree','قاطع MCCB رباعي 4P','80-100-125A',4200,87),
('accessories','Suntree','قاطع MCCB رباعي 4P','160-200-250A',4600,88),
('accessories','Suntree','قاطع MCCB ثنائي 2P','400A',9450,89),
('accessories','Suntree','كونيكتور MC4 أحادي SINGLE','1×1',45,90),
('accessories','Suntree','كونيكتور MC4 مزدوج DOUBLE','1×2',250,91),
('accessories','Suntree','كونيكتور MC4 ثلاثي TRIPLE','1×3',300,92),
('accessories','Suntree','كونيكتور MC4 رباعي QUADRUPLE','1×4',350,93),
('accessories','Suntree','صاعق صواعق SURGE',NULL,1450,94);

-- ============================================================
-- SEED DATA — Combiner Boxes (Kayal)
-- ============================================================
insert into public.products (category, brand, name, specs, price, sort_order) values
('combiners','Kayal','صندوق جمع Kayal 4 Arrays MCCB 80A','4 Arrays / MCCB 80A',5398,100),
('combiners','Kayal','صندوق جمع Kayal 6 Arrays MCCB 125A','6 Arrays / MCCB 125A',6248,101),
('combiners','Kayal','صندوق جمع Kayal 8 Arrays MCCB 160A','8 Arrays / MCCB 160A',6970,102),
('combiners','Kayal','صندوق جمع Kayal 10 Arrays MCCB 200A','10 Arrays / MCCB 200A',8288,103),
('combiners','Kayal','صندوق جمع Kayal 12 Arrays MCCB 250A','12 Arrays / MCCB 250A',9265,104),
('combiners','Kayal','صندوق جمع Kayal 14 Arrays MCCB 250A','14 Arrays / MCCB 250A',11305,105),
('combiners','Kayal','صندوق جمع Kayal 16 Arrays MCCB 320A','16 Arrays / MCCB 320A',12028,106),
('combiners','Kayal','صندوق جمع Kayal 18 Arrays MCCB 400A','18 Arrays / MCCB 400A',14960,107),
('combiners','Kayal','صندوق جمع Kayal 20 Arrays MCCB 400A','20 Arrays / MCCB 400A',16448,108);

-- ============================================================
-- SEED DATA — Structures (شاسيه)
-- ============================================================
insert into public.products (category, brand, name, specs, unit, price, sort_order, notes) values
('structures',NULL,'شاسيه متحرك صيني صينية كمر سيجال - 15 لوح','15 ألواح','طقم',28000,120,'صينية كمر سيجال حديد متحرك'),
('structures',NULL,'شاسيه متحرك صيني صينية كمر سيجال - 18 لوح','18 ألواح','طقم',32000,121,'صينية كمر سيجال حديد متحرك'),
('structures',NULL,'شاسيه ثابت مجلفن بالمسامير - 16 لوح','16 ألواح','طقم',13000,122,'شاسية ثابت حديد مجلفن'),
('structures',NULL,'شاسيه ثابت مجلفن بالكلامبات - 16 لوح','16 ألواح','طقم',15000,123,'شاسية ثابت حديد مجلفن بالكلامبات');

-- ============================================================
-- SEED DATA — Cables (LEADER)
-- ============================================================
insert into public.products (category, brand, name, specs, unit, price, sort_order) values
('cables','LEADER','كابل شمسي LEADER 6MM','6MM² Solar Cable','متر',57,130),
('cables','LEADER','كابل شمسي LEADER 4MM','4MM² Solar Cable','متر',53,131);
