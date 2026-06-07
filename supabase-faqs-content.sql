-- ══════════════════════════════════════════════════════════════
-- Al Asl Solar — FAQ Content (17 questions)
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Clear existing default FAQs first (optional — comment out if you want to keep them)
delete from public.faqs where question_en in (
  'Can solar reduce diesel consumption for irrigation?',
  'Do you provide batteries?',
  'What information is needed for a quotation?'
);

-- ── Section 1: Understanding & Discovery ──────────────────────

insert into public.faqs (question_ar, answer_ar, question_en, answer_en, page, sort_order, published) values

(
  'كيف تعمل منظومة الطاقة الشمسية؟',
  'الألواح بتاخد الضوء وتحوّله لكهرباء، الإنفرتر بيكيّفها عشان تشغّل أجهزتك. لو عندك بطاريات، أي زيادة في النهار بتتخزن وتلاقيها جاهزة بالليل أو وقت الانقطاع. ولو مربوط بالشبكة، الشبكة بتبقى احتياطي ليك — ومش بتدفع غير اللي بتستهلكه فعلاً فوق إنتاجك. النتيجة؟ العداد بيتباطأ، الفاتورة بتنزل، والمنظومة بتشتغل لوحدها.',
  'How does a solar energy system work?',
  'Panels convert sunlight into electricity. The inverter conditions it to power your appliances. If you have batteries, any surplus generated during the day is stored and available at night or during outages. If grid-connected, the grid acts as your backup — and you only pay for what you consume beyond your own production. The result: your meter slows down, your bill drops, and the system runs itself.',
  'home', 10, true
),

(
  'هل المنظومة تشتغل في الغيوم أو بالليل؟',
  'الألواح بتشتغل بالضوء مش بالحرارة. يوم الغيوم مش بيوقفها — بس بينقص إنتاجها شوية. أما الليل، فالمنظومة بتعتمد على البطاريات أو الشبكة كاحتياطي. مصر والسعودية من أغنى بلاد العالم بالشمس — بين ٢٠٠٠ و٣٢٠٠ ساعة تشميس في السنة. يعني حتى لو جه يوم غيوم، باقي السنة بيعوّض أكتر من كفاية.',
  'Does solar work on cloudy days or at night?',
  'Panels run on light, not heat. Cloudy days reduce output but don''t stop the system. At night, it relies on batteries or the grid as backup. Egypt and Saudi Arabia rank among the world''s richest countries in solar irradiance — 2,000 to 3,200 sunshine hours per year — so even occasional cloudy days are more than compensated over the year.',
  'home', 20, true
),

(
  'هل الألواح بتتحمل الحرارة الشديدة والغبار والعواصف؟',
  'الألواح اتصمّمت أصلاً للظروف الصعبة. بتتحمل الرمال والغبار والأمطار والحرارة الشديدة، وبتتصنع وفق معايير دولية صارمة. الحرارة الزيادة جداً ممكن تأثر بنسبة بسيطة على الكفاءة في ذروة الظهيرة — بس الإنتاج السنوي الإجمالي في مصر والسعودية بيفضل من الأعلى عالمياً. البيئة اللي إحنا فيها مش عدوة المنظومة — هي السبب الأساسي إن الاستثمار فيها منطقي جداً هنا.',
  'Can panels handle extreme heat, dust, and sandstorms?',
  'Panels are designed for tough conditions. They withstand sand, dust, rain, and extreme heat, and are manufactured to strict international standards. Very high temperatures can slightly affect efficiency at peak noon — but annual total output in Egypt and Saudi Arabia remains among the highest globally. The environment here isn''t the enemy of solar — it''s the main reason investing in it makes so much sense.',
  'home', 30, true
),

-- ── Section 2: Choosing the Right System ──────────────────────

(
  'ما الفرق بين On-Grid وOff-Grid والنظام الهجين؟',
  'اللي عنده شبكة كهرباء وعايز يقلل الفاتورة، بنربطه On-Grid — بيشتغل مع الشبكة وبيبيع الزيادة ليها. اللي في مزرعة أو منطقة بعيدة، بنعمله Off-Grid — بطاريات وألواح ويكفي نفسه. واللي عايز الاتنين مع بعض — شبكة واحتياطي في نفس الوقت — ده الهجين. بنساعدك تختار الأنسب لوضعك بعد المسح.',
  'What is the difference between On-Grid, Off-Grid, and Hybrid systems?',
  'On-Grid connects to the utility network and reduces your bill while selling surplus power back. Off-Grid is fully independent — panels and batteries that serve remote farms or areas without reliable grid access. Hybrid combines both: solar production with grid backup and battery storage. We help you choose the right fit after a site survey — it''s part of our service from day one.',
  'home', 40, true
),

(
  'هل الطاقة الشمسية بتشتغل مع مولد الديزل؟',
  'إيه، وبيشتغلوا مع بعض بشكل ممتاز. الألواح بتشتغل النهار وبتقلل ساعات تشغيل المولد بنسبة بتوصل لـ٧٠ أو ٨٠٪. ده بيعني توفير حقيقي في الوقود كل يوم، وبيطوّل عمر المولد نفسه لأنه بيشتغل أقل. في المناطق البعيدة عن الشبكة، التركيبة دي بتبقى الحل الأمثل — شمس النهار ومولد احتياطي للضرورة بس.',
  'Does solar work alongside a diesel generator?',
  'Yes, and they work together very well. Panels run during the day and reduce generator runtime by up to 70–80%. That means real daily fuel savings and a longer generator lifespan since it runs less. In areas far from the grid, this combination is often the optimal solution — solar for daytime loads and the generator only as an emergency backup.',
  'agriculture', 10, true
),

(
  'هل الطاقة الشمسية تنفع لري المزارع وتشغيل الطلمبات؟',
  'ده من أقوى تطبيقاتها في مصر. الطلمبة الشمسية بتشتغل مباشرة من الألواح أثناء النهار — من غير بطاريات في معظم الأحوال. ده بيقلل تكاليف الوقود والكهرباء بنسبة من ٦٠ لـ٨٠٪. المزارع اللي كانت بتصرف آلاف الجنيهات كل شهر على الديزل، دلوقتي بيشتغلوا بأقل من ربع التكلفة دي.',
  'Is solar suitable for farm irrigation and pump operation?',
  'This is one of the strongest applications of solar in Egypt. Solar pumps run directly from panels during the day — without batteries in most cases. This cuts fuel and electricity costs by 60–80%. Farms that used to spend thousands of pounds monthly on diesel now operate at less than a quarter of that cost.',
  'agriculture', 20, true
),

(
  'إيه البيانات المطلوبة عشان نختار الطلمبة والموتور المناسب لمزرعتي؟',
  'اللي بنحتاجه منك: مساحة الأرض بالفدان أو المتر، ونوع المحصول لأن كل نوع له احتياج مائي مختلف، ونظام الري — تنقيط، غمر، أو رش. وبخصوص البئر: قطره بالبوصة، عمقه الكلي، عمق منسوب المياه، وأبعد نقطة ري عن البئر. لما بتجمعلنا المعلومات دي، مهندسينا بيحسبوا قدرة الموتور المناسبة بالظبط.',
  'What data is needed to select the right pump and motor for my farm?',
  'We need: land area in feddans or meters, crop type (each has different water requirements), and irrigation method — drip, flood, or sprinkler. For the well: diameter in inches, total depth, water table depth, and the furthest irrigation point from the well. With this information, our engineers calculate the exact motor capacity needed — not oversized to waste money, not undersized to fall short.',
  'agriculture', 30, true
),

-- ── Section 3: Cost & Return ──────────────────────────────────

(
  'في كام سنة بسترد تكلفة المنظومة؟',
  'في مصر دلوقتي، المنازل بتسترد تكلفتها في من ٤ لـ٦ سنوات. المزارع والمصانع في من ٣ لـ٥ سنوات، لأن استهلاكهم أعلى والتوفير أكبر. وبعد فترة الاسترداد، الكهرباء والري بيبقوا شبه مجانيين طوال عمر المنظومة — اللي بيتعدى ٢٥ سنة. وبعد الزيادات الأخيرة في أسعار الكهرباء والوقود، فترة الاسترداد دي بتقصر أكتر.',
  'How many years does it take to recover the system cost?',
  'In Egypt today, residential systems typically recover their cost in 4–6 years. Farms and factories recover in 3–5 years because their consumption is higher and savings are greater. After payback, electricity and irrigation become nearly free for the life of the system — which exceeds 25 years. With recent increases in electricity and fuel prices, the payback period is getting shorter.',
  'home', 50, true
),

(
  'هل الطاقة الشمسية بترفع قيمة العقار أو المزرعة؟',
  'فكّر في الموضوع من ناحية المشتري — لو اتعرض عليك منزلين بنفس السعر، واحد فاتورة كهرباءه ٥٠٠ جنيه والتاني صفر، هتاخد إيه؟ المنظومة الشمسية بتخلي العقار أكتر جدوى للمشتري الجاي — وده بينعكس على سعر البيع. في المزارع، اللي عنده ري مستقل عن الكهرباء والوقود، أرضه بتتسعّر بشكل مختلف خالص.',
  'Does solar increase the value of a property or farm?',
  'Think from the buyer''s perspective — if two properties were offered at the same price, one with a 500-pound monthly bill and one at zero, which would you choose? A solar system makes property more attractive to future buyers and that reflects in the sale price. For farms, one with irrigation independent of electricity and fuel is priced very differently from one that isn''t.',
  'home', 60, true
),

(
  'هل فيه تمويل أو قروض لتركيب منظومة شمسية في مصر؟',
  'في مصر دلوقتي، مبادرة "شمس الصناعة ٢٠٢٦" بتستهدف ٧٠٠٠ مصنع بآليات تمويل حكومية محفزة. فيه كمان قروض من بنوك مصرية للأفراد والشركات مخصوصة لمشاريع الطاقة المتجددة. وفي بعض المشاريع الزراعية والصناعية، نظام التأجير التمويلي بيخلي الموضوع ميبدأش بدفعة كبيرة. فريقنا بيجلس معاك ويساعدك تختار الخيار الأنسب لوضعك.',
  'Is financing or loans available for solar installation in Egypt?',
  'In Egypt today, the "Shams Al Sinaa 2026" initiative targets 7,000 factories with government-backed financing. Egyptian banks also offer dedicated loans for individuals and companies for renewable energy projects. For some agricultural and industrial projects, leasing arrangements mean you don''t need a large upfront payment. Our team sits with you and helps you choose the option that best fits your situation.',
  'home', 70, true
),

-- ── Section 4: Implementation & Procedures ────────────────────

(
  'إيه المعلومات المطلوبة عشان أعمل عرض سعر؟',
  'الموضوع أبسط مما بيتخيله ناس كتير — تلاتة حاجات بس بتكفي: فاتورة الكهرباء بتاعتك أو تقريب لاستهلاكك الشهري، ومصدر الطاقة الحالي عندك — شبكة، مولد، أو مفيش حاجة، وموقعك والمساحة المتاحة على السطح أو الأرض. بس كده، وفريقنا بيقدملك عرض سعر دقيق في ٢٤ ساعة.',
  'What information is needed for a price quotation?',
  'It''s simpler than most people expect — just three things: your electricity bill or an estimate of monthly consumption, your current energy source (grid, generator, or none), and your location and the available roof or ground area. That''s all — our team delivers an accurate quotation within 24 hours.',
  'contact', 10, true
),

(
  'كيف أعرف الحجم المناسب للمنظومة؟',
  'مش لازم تحسب حاجة — في مهندسين موجودين عشان يحسبوها ليك صح. بس عشان تكون فاهم المنطق: الحجم بيعتمد على كام كيلوواط بتستهلك في اليوم وكام ساعة شمس في موقعك. منزل يستهلك ٣٠ كيلوواط في اليوم بيحتاج ٥ لـ٨ كيلوواط. مزرعة بطلمبة ٣٠ حصان من ٢٥ لـ٤٠ كيلوواط. مصنع يستهلك ٣٠٠ كيلوواط يومياً من ١٠٠ لـ١٥٠ كيلوواط.',
  'How do I know what system size I need?',
  'You don''t need to calculate anything — engineers are there to do it correctly for you. But to understand the logic: size depends on how many kilowatt-hours you consume per day and your location''s sunshine hours. A home consuming 30 kWh/day needs 5–8 kW. A farm with a 30-horsepower pump needs 25–40 kW. A factory consuming 300 kWh/day needs 100–150 kW. Our engineering team visits and calculates the right size based on your actual situation — free, no commitment.',
  'services', 10, true
),

(
  'كام الوقت من طلب العرض لحد ما المنظومة تشتغل؟',
  'بعد ما بتوافق على العرض، بنيجي نعمل مسح ميداني خلال يومين أو تلاتة. بعدها التصميم وتوريد المعدات من أسبوع لتلاتة حسب حجم المشروع. التركيب نفسه من يومين لخمسة أيام. إجمالاً، معظم المشاريع بتتسلّم خلال أسبوعين لستة أسابيع.',
  'How long from requesting a quote until the system is operational?',
  'After you approve the quotation, we conduct a site survey within 2–3 days. Design and equipment procurement then takes 1–3 weeks depending on project size. Installation itself takes 2–5 days. Overall, most projects are handed over within 2–6 weeks.',
  'contact', 20, true
),

(
  'إيه الاشتراطات الأساسية للتعاقد على محطة أون جريد مع شركة الكهرباء؟',
  'المكان لازم يكون ملكك أو عندك عقد إيجار موثق لمدة مش أقل من ٢٥ سنة. العداد لازم يكون ٣ فاز، مسجل باسمك، على نفس عنوان العقار، وقانوني مش كودي. مالك العقار والعداد والمتعاقد على المحطة لازم يكونوا نفس الشخص. وقدرة المحطة مش المفروض تتعدى أقصى حمل مسجل على عدادك. المستندات المطلوبة: بطاقة رقم قومي أو بطاقة ضريبية أو سجل تجاري، وإيصالات كهرباء آخر ٦ شهور، وإقرار بعدم مخالفة قانون البناء.',
  'What are the basic requirements for contracting an On-Grid station with the electricity company?',
  'The location must be owned by you or have a documented lease of at least 25 years. The meter must be 3-phase, registered in your name, at the same property address, and legal (not informal). The property owner, meter holder, and station contractor must all be the same person. Station capacity must not exceed the maximum load registered on your meter. Required documents: national ID or tax card or commercial register, last 6 months'' electricity bills, and a declaration of compliance with building regulations.',
  'services', 20, true
),

(
  'هل ممكن أربط المنظومة بشبكة الكهرباء وأبيع الزيادة؟',
  'إيه، وده بيخلي الاستثمار أذكى بكتير. النظام ده اسمه Net Metering — لما منظومتك تنتج أكتر من اللي بتستهلكه، الزيادة بتتحسب في رصيدك عند شركة الكهرباء وتوفّرها في الفاتورة الجاية. إجراءات الترخيص والربط بنتولاها نيابةً عنك.',
  'Can I connect the system to the grid and sell surplus power?',
  'Yes, and it makes the investment significantly smarter. The system is called Net Metering — when your system produces more than you consume, the surplus is credited to your account with the electricity company and reduces your next bill. We handle all licensing and grid connection procedures on your behalf.',
  'services', 30, true
),

-- ── Section 5: After Installation ────────────────────────────

(
  'ما هو الضمان على الألواح والإنفرتر والبطاريات؟',
  'الألواح بتيجي بضمان أداء ٢٥ سنة وضمان منتج من ١٠ لـ١٢ سنة. الإنفرتر ضمانه من ٥ لـ١٠ سنوات حسب الماركة. البطاريات الليثيوم ضمانها من ٥ لـ١٠ سنوات. وفوق ده، Al Asl Solar بتقدم ضمان تركيب وخدمة ما بعد البيع على كل المشاريع — لأن علاقتنا بيك مش بتخلص بعد التركيب.',
  'What is the warranty on panels, inverters, and batteries?',
  'Panels come with a 25-year performance warranty and a 10–12-year product warranty. Inverters carry a 5–10-year warranty depending on the brand. Lithium batteries have a 5–10-year warranty. Beyond that, Al Asl Solar provides an installation warranty and after-sales service on every project — because our relationship with you doesn''t end at installation.',
  'home', 80, true
),

(
  'إيه الصيانة المطلوبة بعد التركيب؟',
  'الطاقة الشمسية مش زي المولد — مفيش تعبئة وقود، مفيش فلاتر شهرية، مفيش ضوضاء. اللي بيتطلبه فعلاً: تنظيف الألواح كل شهر أو شهرين في المناطق الغبارية، وفحص سنوي بسيط للتوصيلات والإنفرتر. بنقدم عقود صيانة دورية تشمل التنظيف والفحص والمراقبة عن بُعد.',
  'What maintenance is required after installation?',
  'Solar is nothing like a generator — no fuel refills, no monthly filters, no noise. What it actually requires: panel cleaning every 1–2 months in dusty areas, and a simple annual inspection of connections and the inverter. We offer periodic maintenance contracts covering cleaning, inspection, and remote monitoring — so your system always runs at peak efficiency.',
  'home', 90, true
);

-- Confirm
select page, count(*) as total from public.faqs group by page order by page;
