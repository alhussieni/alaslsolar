/* ============================================================================
   offgrid-i18n.js — ترجمات حاسبة الأوف جريد (offgrid-calculator.html) — ar / en / es / zh

   - العربية = النصوص الأصلية للصفحة بالحرف (مرجع الفحص: لازم الصفحة بالعربي تفضل زي ما هي بالظبط).
   - قاعدة الـfallback: لغة الزائر ← الإنجليزي ← العربي. عمرها ما بتبقى نص فاضي.
   - رسائل المحرك (offgrid-calc-engine.js): بترجع errors (عربي، لأداة المندوب) + messages ({code, params}).
     الصفحة بالعربي بتعرض errors زي ما هي؛ باقي اللغات بتترجم من messages بالقوالب في MSG تحت.
   - أسماء الأجهزة والـpresets جاية من Supabase بالعربي: بنترجمها من LOADS / PRESETS بالاسم العربي،
     وأي اسم جديد مش موجود هنا بيظهر بالعربي (fallback) لحد ما يتضاف.
   ملاحظة: ترجمات en/es/zh محتاجة مراجعة لغوية/فنية من متحدث أصلي قبل اعتمادها نهائيًا.
   ============================================================================ */
(function () {
  'use strict';

  var LANGS = ['ar', 'en', 'es', 'zh'];
  var LOCALE = { ar: 'ar-EG-u-nu-latn', en: 'en-US', es: 'es-ES', zh: 'zh-CN' };
  function bi(s) { return '<bdi>' + s + '</bdi>'; }   // عزل اتجاه (رقم + وحدة) عن باقي الجملة

  /* ───────────────────────── واجهة الصفحة ───────────────────────── */
  var D = {};

  D.ar = {
    step_1: '١', step_2: '٢',
    page_title: 'حاسبة أنظمة الأوف جريد | الأصل للطاقة الشمسية',
    page_desc: 'حاسبة نظام الطاقة الشمسية بالبطاريات (أوف جريد) — احسب حجم الانفرتر والبطاريات والألواح المطلوبة من واقع أحمالك',
    bc_offgrid: 'أوف جريد',
    h1: 'حاسبة أنظمة الطاقة الشمسية بالبطاريات (Off-Grid)',
    slogan: 'حجم الانفرتر · البطاريات · الألواح — من واقع أحمالك الفعلية',
    intro: 'أدخل الأجهزة التي ستقوم بتشغيلها وساعات تشغيلها، واختر العلامات التجارية المناسبة، لتحصل على تقدير لتكلفة الخامات فقط (دون تركيب أو نقل).',
    disc_short_html: '<strong>تنويه هام:</strong> النتائج <strong>تقديرية للتخطيط الأولي</strong> وتشمل <strong>الخامات فقط</strong> — <strong>بدون تركيب أو نقل</strong>.',
    disc_full_html: '<strong>تنويه هام:</strong> النتائج هنا <strong>تقديرية للتخطيط الأولي</strong> وتشمل <strong>تكلفة الخامات فقط</strong> (الألواح، الانفرتر، البطاريات، الشاسيه، الكابلات، الإكسسوارات) — <strong>بدون تركيب أو نقل</strong>. للتسعير النهائي الدقيق تواصل مباشرة مع مهندسي الشركة.',
    disabled: 'حاسبة الأوف جريد قيد التطوير حاليًا وستعمل من جديد قريبًا. يُرجى التواصل معنا مباشرة في الوقت الحالي لحساب منظومتكم.',
    s1_title: 'الأحمال المطلوب تشغيلها', s1_sub: 'اختر الأجهزة وحدد عددها وساعات تشغيلها',
    pick_label: 'اختر جهازًا لإضافته', add_btn: 'أضف الجهاز',
    no_loads_hint: 'لم تتم إضافة أي جهاز بعد — اختر جهازًا من القائمة أعلاه، أو اختر أحد الأنظمة الجاهزة.',
    th_device: 'الجهاز', th_watt: 'القدرة (وات)', th_count: 'العدد', th_day: 'ساعات نهار', th_night: 'ساعات ليل',
    th_factor: 'معامل التشغيل',
    th_factor_tip: 'نسبة الوقت الفعلي اللي الجهاز شغال فيه فعليًا خلال الساعات المُدخّلة (1 = شغال طول الوقت، 0.5 = نص الوقت مثلًا)',
    chip_day: 'تشغيل فترة النهار', chip_night: 'تشغيل فترة الليل',
    s2_title: 'إعدادات النظام والماركات',
    s2_sub_locked: 'أضف جهازًا واحدًا على الأقل لتفعيل هذه الخطوة',
    s2_sub_ready: 'اختر العلامات التجارية ثم اضغط على "احسب النظام"',
    lbl_psh: 'متوسط ساعات الشمس (PSH)', lbl_safety: 'معامل الأمان', lbl_autonomy: 'أيام الاستقلالية (دون شمس)',
    hint_autonomy: 'القيمة 0 في أيام الاستقلالية تعني تغطية ليلة تشغيل عادية فقط، دون احتياطي إضافي لأيام غائمة متتالية.',
    lbl_phase: 'عدد الفازات', phase_single: 'أحادي الفاز', phase_three: 'ثلاثي الفاز',
    lbl_inv_brand: 'العلامة التجارية للانفرتر', lbl_batt_brand: 'العلامة التجارية للبطارية',
    lbl_panel_brand: 'العلامة التجارية للألواح', lbl_panel_watt: 'قدرة اللوح', calc_btn: 'احسب النظام',
    res_title: 'نتيجة الحساب', th_item: 'البند', th_type: 'النوع', th_qty: 'الكمية', th_price: 'السعر',
    foot_short_html: '<strong>الأسعار غير ظاهرة هنا</strong> — الكميات تغطي الخامات فقط و<strong>لا تشمل التركيب أو النقل</strong>.',
    foot_full_html: '<strong>الأسعار غير ظاهرة هنا</strong> — انقر على "اعرف السعر" أمام كل بند لعرض سعره بالتفصيل في صفحة المنتج. هذه الكميات تغطي الخامات فقط، و<strong>لا تشمل التركيب أو النقل أو أي رسوم إضافية</strong>. للحصول على عرض سعر نهائي دقيق، تواصل معنا مباشرة.',
    empty_prompt: 'اختر الأحمال والعلامات التجارية ثم اضغط "احسب النظام" لعرض النتيجة',
    aria_info: 'معلومة', aria_warn: 'تنبيه', aria_remove: 'حذف', aria_social: 'روابط التواصل',
    aria_whatsapp: 'تواصل معنا على واتساب', aria_nav: 'التنقل الرئيسي', aria_brand: 'الأصل للطاقة الشمسية',
    logo_alt: 'شعار الأصل للطاقة الشمسية',
    // ديناميكي
    u_watt: 'وات',
    tag_three: function (p) { return ' — ' + p.v + 'V ثلاثي فاز'; },
    no_loads_opt: 'لا توجد أجهزة متاحة',
    ph_inv: 'لا توجد انفرترات منشورة بسعر', ph_batt: 'لا توجد بطاريات منشورة بسعر',
    ph_panel: 'لا توجد ألواح منشورة بسعر', ph_watt: 'لا توجد قدرة مسجلة لهذه الماركة',
    m_inv: 'قدرة الانفرتر', m_inv_u: 'كيلوواط', m_store: 'سعة التخزين', m_store_u: 'كيلوواط.ساعة', m_store_u_wh: 'واط.ساعة',
    m_panels: 'عدد الألواح', m_panels_u: 'لوح', m_batts: 'عدد البطاريات', m_batts_u: 'بطارية',
    note_one: 'تنبيه', note_many: function (p) { return p.n + ' تنبيهات'; },
    row_panels: 'الألواح', row_inverter: 'انفرتر', row_chassis: 'شاسيه', row_cables: 'كابلات', row_batteries: 'بطاريات', row_accessories: 'إكسسوارات',
    type_steel: 'حديد مجلفن', type_cable6: '6 مم', type_accset: 'لوحة تجميع / MC4 / فيوز / قواطع',
    know_price: 'اعرف السعر', contact_us: 'تواصل معنا',
    brief_title: 'ملخص سريع لأداء نظامك',
    br_prod: 'إجمالي قدرة الألواح / الإنتاجية اليومية المتوقعة',
    br_cons: 'إجمالي استهلاكك النهاري / الليلي',
    br_store: 'سعة التخزين بالبطاريات', br_store_pct: ' (نسبة الاستخدام)',
    br_inv: 'هل الإنفرتر يكفي كل أجهزتك مع بعض؟',
    br_auto: 'أيام الاستقلالية المصمم عليها',
    v_prod: function (p) { return bi(p.kwp) + ' — ' + bi(p.daily) + '/يوم'; },
    v_cons: function (p) { return bi(p.day) + ' نهار — ' + bi(p.night) + ' ليل'; },
    v_store: function (p) { return bi(p.stored) + (p.pct != null ? ' (' + bi('~' + p.pct + '%') + ' من السعة الكاملة عند أقصى تفريغ)' : ''); },
    v_inv: function (p) { return bi(p.peak) + ' أقصى تشغيل — الإنفرتر: ' + bi(p.rated) + ' مستمر / ' + bi(p.surge) + ' إقلاع ' + (p.ok ? '— كافٍ ✓' : '— ⚠ راجعنا لمراجعة الأحمال'); },
    v_auto: function (p) { return bi(p.d) + ' يوم بدون شحن'; },
    ch_prod: 'إنتاج الألواح اليومي مقابل استهلاكك (kWh)', ch_store: 'سعة البطاريات مقابل استهلاكك الليلي (kWh)',
    bar_prod: 'إنتاج الألواح', bar_day: 'استهلاك نهاري', bar_night: 'استهلاك ليلي', bar_surplus: 'الفائض', bar_deficit: '⚠ عجز', bar_storage: 'سعة البطاريات',
    cap_prod_ok: function (p) { return 'فائض إنتاج يومي ' + bi(p.v) + ' فوق احتياجك اليومي'; },
    cap_prod_bad: function (p) { return '⚠ الإنتاج المتوقع أقل من احتياجك اليومي بـ ' + bi(p.v) + ' — راجعنا لمراجعة التصميم'; },
    cap_store_ok: function (p) { return 'فائض تخزين ' + bi(p.v) + ' فوق استهلاكك الليلي'; },
    cap_store_bad: function (p) { return '⚠ سعة البطاريات أقل من استهلاكك الليلي بـ ' + bi(p.v); },
    est_note: 'الأرقام تقديرية بناءً على معطيات التصميم (ساعات الشمس القصوى، كفاءة النظام) — للتأكيد النهائي راجع مع المهندس المسؤول قبل التنفيذ.',
    err_no_loads: 'اختر جهازًا واحدًا على الأقل وحدد عدده، أو اضغط على أحد الأنظمة الجاهزة أعلاه.'
  };

  D.en = {
    step_1: '1', step_2: '2',
    page_title: 'Off-Grid Solar System Calculator | Al Asl Solar Energy',
    page_desc: 'Off-grid solar battery system calculator — size the inverter, batteries and panels you need based on your actual loads',
    bc_offgrid: 'Off-Grid',
    h1: 'Off-Grid Solar & Battery System Calculator',
    slogan: 'Inverter · Batteries · Panels — sized from your actual loads',
    intro: 'Enter the appliances you will run and their operating hours, then choose suitable brands, to get a materials-only cost estimate (excluding installation and transport).',
    disc_short_html: '<strong>Important:</strong> Results are <strong>indicative estimates for preliminary planning</strong> and cover <strong>materials only</strong> — <strong>installation and transport not included</strong>.',
    disc_full_html: "<strong>Important:</strong> The results here are <strong>indicative estimates for preliminary planning</strong> and cover <strong>materials cost only</strong> (panels, inverter, batteries, mounting structure, cables, accessories) — <strong>excluding installation and transport</strong>. For an accurate final quote, contact the company's engineers directly.",
    disabled: 'The off-grid calculator is currently under development and will be back soon. Please contact us directly in the meantime to size your system.',
    s1_title: 'Loads to power', s1_sub: 'Choose the appliances and set their quantity and operating hours',
    pick_label: 'Choose an appliance to add', add_btn: 'Add appliance',
    no_loads_hint: 'No appliance added yet — choose one from the list above, or pick one of the ready-made systems.',
    th_device: 'Appliance', th_watt: 'Power (W)', th_count: 'Qty', th_day: 'Day hours', th_night: 'Night hours',
    th_factor: 'Duty factor',
    th_factor_tip: 'The share of time the appliance is actually running during the entered hours (1 = running all the time, 0.5 = half the time, for example)',
    chip_day: 'Run during daytime', chip_night: 'Run during nighttime',
    s2_title: 'System settings & brands',
    s2_sub_locked: 'Add at least one appliance to enable this step',
    s2_sub_ready: 'Choose the brands, then click "Calculate system"',
    lbl_psh: 'Average peak sun hours (PSH)', lbl_safety: 'Safety factor', lbl_autonomy: 'Days of autonomy (no sun)',
    hint_autonomy: '0 days of autonomy means covering a normal night of operation only, with no extra reserve for consecutive cloudy days.',
    lbl_phase: 'Number of phases', phase_single: 'Single-phase', phase_three: 'Three-phase',
    lbl_inv_brand: 'Inverter brand', lbl_batt_brand: 'Battery brand',
    lbl_panel_brand: 'Panel brand', lbl_panel_watt: 'Panel power', calc_btn: 'Calculate system',
    res_title: 'Calculation result', th_item: 'Item', th_type: 'Type', th_qty: 'Qty', th_price: 'Price',
    foot_short_html: '<strong>Prices are not shown here</strong> — quantities cover materials only and <strong>do not include installation or transport</strong>.',
    foot_full_html: '<strong>Prices are not shown here</strong> — click "See price" next to each item to view its detailed price on the product page. These quantities cover materials only and <strong>do not include installation, transport, or any additional fees</strong>. For an accurate final quote, contact us directly.',
    empty_prompt: 'Choose the loads and brands, then click "Calculate system" to see the result',
    aria_info: 'Information', aria_warn: 'Warning', aria_remove: 'Remove', aria_social: 'Social links',
    aria_whatsapp: 'Contact us on WhatsApp', aria_nav: 'Main navigation', aria_brand: 'Al Asl Solar Energy',
    logo_alt: 'Al Asl Solar Energy logo',
    u_watt: 'W',
    tag_three: function (p) { return ' — ' + p.v + 'V three-phase'; },
    no_loads_opt: 'No appliances available',
    ph_inv: 'No priced inverters published', ph_batt: 'No priced batteries published',
    ph_panel: 'No priced panels published', ph_watt: 'No power registered for this brand',
    m_inv: 'Inverter power', m_inv_u: 'kW', m_store: 'Storage capacity', m_store_u: 'kWh', m_store_u_wh: 'Wh',
    m_panels: 'Number of panels', m_panels_u: 'panels', m_batts: 'Number of batteries', m_batts_u: 'batteries',
    note_one: 'Warning', note_many: function (p) { return p.n + ' warnings'; },
    row_panels: 'Panels', row_inverter: 'Inverter', row_chassis: 'Mounting structure', row_cables: 'Cables', row_batteries: 'Batteries', row_accessories: 'Accessories',
    type_steel: 'Galvanized steel', type_cable6: '6 mm', type_accset: 'Combiner box / MC4 / fuses / breakers',
    know_price: 'See price', contact_us: 'Contact us',
    brief_title: "Quick summary of your system's performance",
    br_prod: 'Total panel power / expected daily production',
    br_cons: 'Your total daytime / night consumption',
    br_store: 'Battery storage capacity', br_store_pct: ' (usage ratio)',
    br_inv: 'Is the inverter enough for all your appliances at once?',
    br_auto: 'Designed days of autonomy',
    v_prod: function (p) { return bi(p.kwp) + ' — ' + bi(p.daily) + '/day'; },
    v_cons: function (p) { return bi(p.day) + ' daytime — ' + bi(p.night) + ' night'; },
    v_store: function (p) { return bi(p.stored) + (p.pct != null ? ' (' + bi('~' + p.pct + '%') + ' of full capacity at maximum discharge)' : ''); },
    v_inv: function (p) { return bi(p.peak) + ' peak load — Inverter: ' + bi(p.rated) + ' continuous / ' + bi(p.surge) + ' surge ' + (p.ok ? '— sufficient ✓' : '— ⚠ please contact us to review the loads'); },
    v_auto: function (p) { return bi(p.d) + ' days without charging'; },
    ch_prod: 'Daily panel production vs. your consumption (kWh)', ch_store: 'Battery capacity vs. your night consumption (kWh)',
    bar_prod: 'Panel production', bar_day: 'Day use', bar_night: 'Night use', bar_surplus: 'Surplus', bar_deficit: '⚠ Shortfall', bar_storage: 'Battery capacity',
    cap_prod_ok: function (p) { return 'Daily production surplus of ' + bi(p.v) + ' above your daily need'; },
    cap_prod_bad: function (p) { return '⚠ Expected production is ' + bi(p.v) + ' below your daily need — contact us to review the design'; },
    cap_store_ok: function (p) { return 'Storage surplus of ' + bi(p.v) + ' above your night consumption'; },
    cap_store_bad: function (p) { return '⚠ Battery capacity is ' + bi(p.v) + ' below your night consumption'; },
    est_note: 'Figures are estimates based on the design inputs (peak sun hours, system efficiency) — for final confirmation, check with the responsible engineer before implementation.',
    err_no_loads: 'Select at least one appliance and set its quantity, or click one of the ready-made systems above.'
  };

  D.es = {
    step_1: '1', step_2: '2',
    page_title: 'Calculadora de sistemas solares aislados (Off-Grid) | Al Asl Solar Energy',
    page_desc: 'Calculadora de sistemas solares con baterías (off-grid): calcule el inversor, las baterías y los paneles que necesita según sus cargas reales',
    bc_offgrid: 'Off-Grid',
    h1: 'Calculadora de sistemas solares con baterías (Off-Grid)',
    slogan: 'Inversor · Baterías · Paneles — dimensionados según sus cargas reales',
    intro: 'Introduzca los aparatos que utilizará y sus horas de funcionamiento, y elija las marcas adecuadas para obtener una estimación del coste solo de los materiales (sin instalación ni transporte).',
    disc_short_html: '<strong>Aviso importante:</strong> Los resultados son <strong>estimaciones orientativas para una planificación preliminar</strong> e incluyen <strong>solo los materiales</strong> — <strong>sin instalación ni transporte</strong>.',
    disc_full_html: '<strong>Aviso importante:</strong> Los resultados son <strong>estimaciones orientativas para una planificación preliminar</strong> e incluyen <strong>únicamente el coste de los materiales</strong> (paneles, inversor, baterías, estructura de montaje, cables y accesorios), <strong>sin instalación ni transporte</strong>. Para un presupuesto final preciso, contacte directamente con los ingenieros de la empresa.',
    disabled: 'La calculadora off-grid está en desarrollo y volverá a funcionar pronto. Mientras tanto, contáctenos directamente para dimensionar su sistema.',
    s1_title: 'Cargas que se alimentarán', s1_sub: 'Elija los aparatos e indique su cantidad y sus horas de funcionamiento',
    pick_label: 'Elija un aparato para añadir', add_btn: 'Añadir aparato',
    no_loads_hint: 'Aún no se ha añadido ningún aparato: elija uno de la lista de arriba o seleccione uno de los sistemas predefinidos.',
    th_device: 'Aparato', th_watt: 'Potencia (W)', th_count: 'Cant.', th_day: 'Horas de día', th_night: 'Horas de noche',
    th_factor: 'Factor de uso',
    th_factor_tip: 'Proporción del tiempo en que el aparato funciona realmente durante las horas introducidas (1 = siempre en marcha, 0,5 = la mitad del tiempo, por ejemplo)',
    chip_day: 'Funcionamiento diurno', chip_night: 'Funcionamiento nocturno',
    s2_title: 'Ajustes del sistema y marcas',
    s2_sub_locked: 'Añada al menos un aparato para activar este paso',
    s2_sub_ready: 'Elija las marcas y pulse «Calcular sistema»',
    lbl_psh: 'Horas solares pico medias (HSP)', lbl_safety: 'Factor de seguridad', lbl_autonomy: 'Días de autonomía (sin sol)',
    hint_autonomy: 'Un valor de 0 días de autonomía cubre solo una noche normal de funcionamiento, sin reserva adicional para días nublados consecutivos.',
    lbl_phase: 'Número de fases', phase_single: 'Monofásico', phase_three: 'Trifásico',
    lbl_inv_brand: 'Marca del inversor', lbl_batt_brand: 'Marca de la batería',
    lbl_panel_brand: 'Marca de los paneles', lbl_panel_watt: 'Potencia del panel', calc_btn: 'Calcular sistema',
    res_title: 'Resultado del cálculo', th_item: 'Concepto', th_type: 'Tipo', th_qty: 'Cantidad', th_price: 'Precio',
    foot_short_html: '<strong>Los precios no se muestran aquí</strong> — las cantidades incluyen solo los materiales y <strong>no incluyen instalación ni transporte</strong>.',
    foot_full_html: '<strong>Los precios no se muestran aquí</strong> — pulse «Ver precio» junto a cada concepto para ver su precio detallado en la página del producto. Estas cantidades incluyen solo los materiales y <strong>no incluyen instalación, transporte ni ningún cargo adicional</strong>. Para un presupuesto final preciso, contáctenos directamente.',
    empty_prompt: 'Elija las cargas y las marcas y pulse «Calcular sistema» para ver el resultado',
    aria_info: 'Información', aria_warn: 'Advertencia', aria_remove: 'Eliminar', aria_social: 'Redes sociales',
    aria_whatsapp: 'Contáctenos por WhatsApp', aria_nav: 'Navegación principal', aria_brand: 'Al Asl Solar Energy',
    logo_alt: 'Logotipo de Al Asl Solar Energy',
    u_watt: 'W',
    tag_three: function (p) { return ' — ' + p.v + ' V trifásico'; },
    no_loads_opt: 'No hay aparatos disponibles',
    ph_inv: 'No hay inversores publicados con precio', ph_batt: 'No hay baterías publicadas con precio',
    ph_panel: 'No hay paneles publicados con precio', ph_watt: 'No hay potencia registrada para esta marca',
    m_inv: 'Potencia del inversor', m_inv_u: 'kW', m_store: 'Capacidad de almacenamiento', m_store_u: 'kWh', m_store_u_wh: 'Wh',
    m_panels: 'Número de paneles', m_panels_u: 'paneles', m_batts: 'Número de baterías', m_batts_u: 'baterías',
    note_one: 'Advertencia', note_many: function (p) { return p.n + ' advertencias'; },
    row_panels: 'Paneles', row_inverter: 'Inversor', row_chassis: 'Estructura de montaje', row_cables: 'Cables', row_batteries: 'Baterías', row_accessories: 'Accesorios',
    type_steel: 'Acero galvanizado', type_cable6: '6 mm', type_accset: 'Caja combinadora / MC4 / fusibles / interruptores',
    know_price: 'Ver precio', contact_us: 'Contáctenos',
    brief_title: 'Resumen rápido del rendimiento de su sistema',
    br_prod: 'Potencia total de paneles / producción diaria prevista',
    br_cons: 'Su consumo total diurno / nocturno',
    br_store: 'Capacidad de almacenamiento de las baterías', br_store_pct: ' (porcentaje de uso)',
    br_inv: '¿Basta el inversor para todos sus aparatos a la vez?',
    br_auto: 'Días de autonomía de diseño',
    v_prod: function (p) { return bi(p.kwp) + ' — ' + bi(p.daily) + '/día'; },
    v_cons: function (p) { return bi(p.day) + ' de día — ' + bi(p.night) + ' de noche'; },
    v_store: function (p) { return bi(p.stored) + (p.pct != null ? ' (' + bi('~' + p.pct + '%') + ' de la capacidad total con la descarga máxima)' : ''); },
    v_inv: function (p) { return bi(p.peak) + ' de carga máxima — Inversor: ' + bi(p.rated) + ' continuos / ' + bi(p.surge) + ' de pico ' + (p.ok ? '— suficiente ✓' : '— ⚠ contáctenos para revisar las cargas'); },
    v_auto: function (p) { return bi(p.d) + ' días sin carga'; },
    ch_prod: 'Producción diaria de los paneles frente a su consumo (kWh)', ch_store: 'Capacidad de las baterías frente a su consumo nocturno (kWh)',
    bar_prod: 'Producción', bar_day: 'Uso diurno', bar_night: 'Uso nocturno', bar_surplus: 'Excedente', bar_deficit: '⚠ Déficit', bar_storage: 'Baterías',
    cap_prod_ok: function (p) { return 'Excedente de producción diaria de ' + bi(p.v) + ' sobre su necesidad diaria'; },
    cap_prod_bad: function (p) { return '⚠ La producción prevista es ' + bi(p.v) + ' inferior a su necesidad diaria: contáctenos para revisar el diseño'; },
    cap_store_ok: function (p) { return 'Excedente de almacenamiento de ' + bi(p.v) + ' sobre su consumo nocturno'; },
    cap_store_bad: function (p) { return '⚠ La capacidad de las baterías es ' + bi(p.v) + ' inferior a su consumo nocturno'; },
    est_note: 'Las cifras son estimaciones basadas en los datos de diseño (horas solares pico, eficiencia del sistema); para la confirmación final, consulte con el ingeniero responsable antes de la ejecución.',
    err_no_loads: 'Seleccione al menos un aparato e indique su cantidad, o pulse uno de los sistemas predefinidos de arriba.'
  };

  D.zh = {
    step_1: '1', step_2: '2',
    page_title: '离网光伏储能系统计算器 | Al Asl Solar Energy',
    page_desc: '离网光伏储能系统计算器——根据您的实际用电负载，计算所需的逆变器、电池和光伏板',
    bc_offgrid: '离网',
    h1: '离网光伏储能系统计算器 (Off-Grid)',
    slogan: '逆变器 · 电池 · 光伏板——按您的实际负载配置',
    intro: '输入您要使用的电器及其运行时间，并选择合适的品牌，即可获得仅含材料费用的估算（不含安装和运输）。',
    disc_short_html: '<strong>重要提示：</strong>结果为<strong>初步规划用的估算值</strong>，仅包含<strong>材料</strong>——<strong>不含安装和运输</strong>。',
    disc_full_html: '<strong>重要提示：</strong>此处结果为<strong>初步规划用的估算值</strong>，仅包含<strong>材料费用</strong>（光伏板、逆变器、电池、支架、电缆、配件）——<strong>不含安装和运输</strong>。如需准确的最终报价，请直接联系公司工程师。',
    disabled: '离网计算器正在开发中，将很快恢复使用。在此期间，请直接联系我们为您的系统做配置计算。',
    s1_title: '需要供电的负载', s1_sub: '选择电器并设置数量和运行小时数',
    pick_label: '选择要添加的电器', add_btn: '添加电器',
    no_loads_hint: '尚未添加任何电器——请从上方列表中选择，或选择一个预设系统。',
    th_device: '电器', th_watt: '功率 (W)', th_count: '数量', th_day: '白天小时数', th_night: '夜间小时数',
    th_factor: '运行系数',
    th_factor_tip: '电器在所填小时数内实际运行的时间占比（1 = 全程运行，例如 0.5 = 运行一半时间）',
    chip_day: '白天运行', chip_night: '夜间运行',
    s2_title: '系统设置与品牌',
    s2_sub_locked: '请至少添加一件电器以启用此步骤',
    s2_sub_ready: '选择品牌后点击“计算系统”',
    lbl_psh: '平均日照峰值小时数 (PSH)', lbl_safety: '安全系数', lbl_autonomy: '自给天数（无日照）',
    hint_autonomy: '自给天数为 0 表示仅覆盖一个正常运行的夜晚，不为连续阴天预留额外储备。',
    lbl_phase: '相数', phase_single: '单相', phase_three: '三相',
    lbl_inv_brand: '逆变器品牌', lbl_batt_brand: '电池品牌',
    lbl_panel_brand: '光伏板品牌', lbl_panel_watt: '光伏板功率', calc_btn: '计算系统',
    res_title: '计算结果', th_item: '项目', th_type: '类型', th_qty: '数量', th_price: '价格',
    foot_short_html: '<strong>此处不显示价格</strong>——数量仅涵盖材料，<strong>不含安装或运输</strong>。',
    foot_full_html: '<strong>此处不显示价格</strong>——点击各项目旁的“查看价格”，可在产品页面查看详细价格。这些数量仅涵盖材料，<strong>不含安装、运输或任何额外费用</strong>。如需准确的最终报价，请直接联系我们。',
    empty_prompt: '选择负载和品牌，然后点击“计算系统”查看结果',
    aria_info: '信息', aria_warn: '警告', aria_remove: '删除', aria_social: '社交媒体链接',
    aria_whatsapp: '通过 WhatsApp 联系我们', aria_nav: '主导航', aria_brand: 'Al Asl Solar Energy',
    logo_alt: 'Al Asl Solar Energy 标志',
    u_watt: 'W',
    tag_three: function (p) { return ' — ' + p.v + 'V 三相'; },
    no_loads_opt: '暂无可用电器',
    ph_inv: '暂无已标价发布的逆变器', ph_batt: '暂无已标价发布的电池',
    ph_panel: '暂无已标价发布的光伏板', ph_watt: '该品牌暂无登记功率',
    m_inv: '逆变器功率', m_inv_u: 'kW', m_store: '储能容量', m_store_u: 'kWh', m_store_u_wh: 'Wh',
    m_panels: '光伏板数量', m_panels_u: '块', m_batts: '电池数量', m_batts_u: '节',
    note_one: '提示', note_many: function (p) { return p.n + ' 条提示'; },
    row_panels: '光伏板', row_inverter: '逆变器', row_chassis: '支架', row_cables: '电缆', row_batteries: '电池', row_accessories: '配件',
    type_steel: '镀锌钢', type_cable6: '6 mm', type_accset: '汇流箱 / MC4 / 保险丝 / 断路器',
    know_price: '查看价格', contact_us: '联系我们',
    brief_title: '系统性能速览',
    br_prod: '光伏板总功率 / 预计日发电量',
    br_cons: '您的白天 / 夜间总用电量',
    br_store: '电池储能容量', br_store_pct: '（使用比例）',
    br_inv: '逆变器能否同时带动您的所有电器？',
    br_auto: '设计自给天数',
    v_prod: function (p) { return bi(p.kwp) + ' — ' + bi(p.daily) + '/天'; },
    v_cons: function (p) { return '白天 ' + bi(p.day) + ' — 夜间 ' + bi(p.night); },
    v_store: function (p) { return bi(p.stored) + (p.pct != null ? '（最大放电时约占满容量的 ' + bi(p.pct + '%') + '）' : ''); },
    v_inv: function (p) { return '峰值负载 ' + bi(p.peak) + ' — 逆变器：持续 ' + bi(p.rated) + ' / 瞬时 ' + bi(p.surge) + ' ' + (p.ok ? '— 满足 ✓' : '— ⚠ 请联系我们复核负载'); },
    v_auto: function (p) { return '无充电可用 ' + bi(p.d) + ' 天'; },
    ch_prod: '光伏板日发电量与您的用电量对比 (kWh)', ch_store: '电池容量与您的夜间用电量对比 (kWh)',
    bar_prod: '光伏板发电', bar_day: '白天用电', bar_night: '夜间用电', bar_surplus: '盈余', bar_deficit: '⚠ 缺口', bar_storage: '电池容量',
    cap_prod_ok: function (p) { return '日发电量比您的日需求多 ' + bi(p.v); },
    cap_prod_bad: function (p) { return '⚠ 预计发电量比您的日需求少 ' + bi(p.v) + '——请联系我们复核设计'; },
    cap_store_ok: function (p) { return '储能容量比您的夜间用电量多 ' + bi(p.v); },
    cap_store_bad: function (p) { return '⚠ 电池容量比您的夜间用电量少 ' + bi(p.v); },
    est_note: '数字为基于设计参数（峰值日照小时数、系统效率）的估算——最终确认请在实施前与负责工程师核实。',
    err_no_loads: '请至少选择一件电器并设置数量，或点击上方的预设系统。'
  };

  /* ─────────────── أسماء الأجهزة والـpresets (مفتاحها الاسم العربي الجاي من Supabase) ─────────────── */
  var LOADS = {
    'لمبة - LED Light': { en: 'LED light bulb', es: 'Bombilla LED', zh: 'LED灯泡' },
    'DVR / NVR': { en: 'DVR / NVR', es: 'DVR / NVR', zh: '硬盘录像机 (DVR / NVR)' },
    'راوتر / شاحن': { en: 'Router / charger', es: 'Router / cargador', zh: '路由器 / 充电器' },
    'كاميرا مراقبة': { en: 'Security camera', es: 'Cámara de vigilancia', zh: '监控摄像头' },
    'لابتوب': { en: 'Laptop', es: 'Portátil', zh: '笔记本电脑' },
    'مروحة': { en: 'Fan', es: 'Ventilador', zh: '风扇' },
    'شفاط مطبخ': { en: 'Kitchen exhaust fan', es: 'Extractor de cocina', zh: '厨房排气扇' },
    'تلفاز LCD / كاميرات CCTV': { en: 'LCD TV / CCTV cameras', es: 'TV LCD / cámaras CCTV', zh: '液晶电视 / CCTV摄像头' },
    'تلفاز LCD': { en: 'LCD TV', es: 'TV LCD', zh: '液晶电视' },
    'ثلاجة': { en: 'Refrigerator', es: 'Refrigerador', zh: '冰箱' },
    'كشاف إنارة': { en: 'Floodlight', es: 'Foco / reflector', zh: '投光灯' },
    'فريزر': { en: 'Freezer', es: 'Congelador', zh: '冷冻柜' },
    'موتور 1 حصان': { en: 'Motor 1 HP', es: 'Motor de 1 HP', zh: '1马力电机' },
    'ميكروويف': { en: 'Microwave', es: 'Microondas', zh: '微波炉' },
    'موتور 1.5 حصان / غاطس': { en: 'Motor 1.5 HP / submersible pump', es: 'Motor de 1,5 HP / bomba sumergible', zh: '1.5马力电机 / 潜水泵' },
    'تكييف 1.5 حصان': { en: 'Air conditioner 1.5 HP', es: 'Aire acondicionado 1,5 HP', zh: '1.5匹空调' },
    'غسالة': { en: 'Washing machine', es: 'Lavadora', zh: '洗衣机' },
    'تكييف 2.5 حصان': { en: 'Air conditioner 2.5 HP', es: 'Aire acondicionado 2,5 HP', zh: '2.5匹空调' },
    'تكييف 3 حصان': { en: 'Air conditioner 3 HP', es: 'Aire acondicionado 3 HP', zh: '3匹空调' },
    'هيتر مياه': { en: 'Water heater', es: 'Calentador de agua', zh: '热水器' }
  };

  var PRESETS = {
    'منزل مزرعة صغيرة - فردين': {
      en: 'Small farm house – 2 people', es: 'Casa de finca pequeña – 2 personas', zh: '小型农场住宅 – 2人'
    },
    'منزل عمال مزرعة - 4 أفراد': {
      en: 'Farm workers\' house – 4 people', es: 'Casa de trabajadores agrícolas – 4 personas', zh: '农场工人住所 – 4人'
    },
    'استراحة مهندس و6 عمال - 7 أفراد': {
      en: 'Engineer + 6 workers lodge – 7 people', es: 'Alojamiento de ingeniero y 6 trabajadores – 7 personas', zh: '工程师及6名工人宿舍 – 7人'
    }
  };
  var PRESET_DESC = {
    'إضاءة أساسية + ثلاجة + راوتر + مروحة': {
      en: 'Basic lighting + refrigerator + router + fan', es: 'Iluminación básica + refrigerador + router + ventilador', zh: '基础照明 + 冰箱 + 路由器 + 风扇'
    },
    'إضاءة + ثلاجة + مراوح + تلفاز + راوتر': {
      en: 'Lighting + refrigerator + fans + TV + router', es: 'Iluminación + refrigerador + ventiladores + TV + router', zh: '照明 + 冰箱 + 风扇 + 电视 + 路由器'
    },
    'إضاءة موسعة + ثلاجة + مراوح متعددة + تلفاز + راوترين': {
      en: 'Extended lighting + refrigerator + multiple fans + TV + two routers', es: 'Iluminación ampliada + refrigerador + varios ventiladores + TV + dos routers', zh: '扩展照明 + 冰箱 + 多台风扇 + 电视 + 两台路由器'
    }
  };

  /* ─────────────── رسائل المحرك لغير العربي (code → قالب) ─────────────── */
  var MSG = {
    no_panels: {
      en: function () { return 'No panels are published for this brand.'; },
      es: function () { return 'No hay paneles publicados para esta marca.'; },
      zh: function () { return '该品牌暂无已发布的光伏板。'; } },
    panel_watt_fallback: {
      en: function (p) { return '⚠ The selected power (' + p.watt + ' W) is not registered for brand "' + p.brand + '" — the closest available power was used instead.'; },
      es: function (p) { return '⚠ La potencia seleccionada (' + p.watt + ' W) no está registrada para la marca "' + p.brand + '": se ha usado la potencia disponible más cercana.'; },
      zh: function (p) { return '⚠ 品牌“' + p.brand + '”未登记所选功率（' + p.watt + ' W）——已改用最接近的可用功率。'; } },
    pick_inv_brand: {
      en: function () { return 'Select the inverter brand.'; },
      es: function () { return 'Seleccione la marca del inversor.'; },
      zh: function () { return '请选择逆变器品牌。'; } },
    pick_batt_brand: {
      en: function () { return 'Select the battery brand.'; },
      es: function () { return 'Seleccione la marca de la batería.'; },
      zh: function () { return '请选择电池品牌。'; } },
    no_inverter: {
      en: function (p) { return 'No inverter models are registered for brand "' + p.brand + '".'; },
      es: function (p) { return 'No hay modelos de inversor registrados para la marca "' + p.brand + '".'; },
      zh: function (p) { return '品牌“' + p.brand + '”暂无已登记的逆变器型号。'; } },
    inv_watt_fallback: {
      en: function (p) { return '⚠ The selected power (' + p.kw + ' kW) is not registered for brand "' + p.brand + '" — the closest available power was used instead.'; },
      es: function (p) { return '⚠ La potencia seleccionada (' + p.kw + ' kW) no está registrada para la marca "' + p.brand + '": se ha usado la potencia disponible más cercana.'; },
      zh: function (p) { return '⚠ 品牌“' + p.brand + '”未登记所选功率（' + p.kw + ' kW）——已改用最接近的可用功率。'; } },
    inv_undersized: {
      en: function (p) { return '⚠ The largest available ' + p.brand + ' inverter (' + p.kw + ' kW) is still smaller than the required peak power (' + p.requiredKW + ' kW) — reduce the loads or try another brand.'; },
      es: function (p) { return '⚠ El mayor inversor disponible de la marca ' + p.brand + ' (' + p.kw + ' kW) sigue siendo inferior a la potencia máxima necesaria (' + p.requiredKW + ' kW): reduzca las cargas o pruebe otra marca.'; },
      zh: function (p) { return '⚠ ' + p.brand + ' 品牌现有最大逆变器（' + p.kw + ' kW）仍小于所需的瞬时功率（' + p.requiredKW + ' kW）——请减少负载或尝试其他品牌。'; } },
    inv_surge: {
      en: function (p) { return '⚠ The largest available ' + p.brand + ' inverter cannot handle the starting current of "' + p.load + '" (' + (p.basis === 'datasheet' ? 'from the datasheet' : 'general approximation of 150% — enter the real ratio from the datasheet for higher accuracy') + ') — try another brand or run the large appliances separately.'; },
      es: function (p) { return '⚠ El mayor inversor disponible de la marca ' + p.brand + ' no soportará la corriente de arranque de "' + p.load + '" (' + (p.basis === 'datasheet' ? 'según la hoja de datos' : 'aproximación general del 150 %; registre el porcentaje real de la hoja de datos para mayor precisión') + '): pruebe otra marca o ponga en marcha los aparatos grandes por separado.'; },
      zh: function (p) { return '⚠ ' + p.brand + ' 品牌现有最大逆变器无法承受“' + p.load + '”的启动电流（' + (p.basis === 'datasheet' ? '来自数据手册' : '按通用近似值 150% 估算——请登记数据手册中的实际比例以提高准确性') + '）——请尝试其他品牌，或让大功率电器分开运行。'; } },
    batt_no_brand: {
      en: function (p) { return 'No batteries are registered for brand "' + p.brand + '".'; },
      es: function (p) { return 'No hay baterías registradas para la marca "' + p.brand + '".'; },
      zh: function (p) { return '品牌“' + p.brand + '”暂无已登记的电池。'; } },
    batt_no_type: {
      en: function (p) { return 'No batteries from brand "' + p.brand + '" in the selected type/model.'; },
      es: function (p) { return 'No hay baterías de la marca "' + p.brand + '" con el tipo/modelo seleccionado.'; },
      zh: function (p) { return '品牌“' + p.brand + '”没有所选类型/型号的电池。'; } },
    batt_no_voltage: {
      en: function (p) { return 'No batteries from brand "' + p.brand + '" at ' + p.volt + ' V.'; },
      es: function (p) { return 'No hay baterías de la marca "' + p.brand + '" de ' + p.volt + ' V.'; },
      zh: function (p) { return '品牌“' + p.brand + '”没有 ' + p.volt + ' V 的电池。'; } },
    batt_voltage_incompatible: {
      en: function (p) { return '⚠ The selected battery voltage (' + p.volt + ' V) must divide the inverter voltage (' + p.invVolt + ' V) exactly so the number of batteries in series is a whole number — choose another voltage or an inverter with a compatible voltage.'; },
      es: function (p) { return '⚠ La tensión de batería seleccionada (' + p.volt + ' V) debe dividir exactamente la tensión del inversor (' + p.invVolt + ' V) para que el número de baterías en serie sea entero: elija otra tensión o un inversor con tensión compatible.'; },
      zh: function (p) { return '⚠ 所选电池电压（' + p.volt + ' V）必须能整除逆变器电压（' + p.invVolt + ' V），这样串联电池数量才为整数——请选择其他电压或电压兼容的逆变器。'; } },
    batt_no_compatible_voltage: {
      en: function (p) { return 'No batteries from brand "' + p.brand + '" have a voltage compatible with the inverter (' + p.invVolt + ' V) — try another brand.'; },
      es: function (p) { return 'Ninguna batería de la marca "' + p.brand + '" tiene una tensión compatible con el inversor (' + p.invVolt + ' V): pruebe otra marca.'; },
      zh: function (p) { return '品牌“' + p.brand + '”没有与逆变器（' + p.invVolt + ' V）电压兼容的电池——请尝试其他品牌。'; } },
    batt_no_ah: {
      en: function (p) { return 'No battery from brand "' + p.brand + '" at ' + (p.volt || '') + ' V and ' + p.ah + ' Ah capacity.'; },
      es: function (p) { return 'No hay ninguna batería de la marca "' + p.brand + '" de ' + (p.volt || '') + ' V y ' + p.ah + ' Ah de capacidad.'; },
      zh: function (p) { return '品牌“' + p.brand + '”没有 ' + (p.volt || '') + ' V、' + p.ah + ' Ah 容量的电池。'; } },
    batt_fail: {
      en: function (p) { return 'Could not select a suitable battery from brand "' + p.brand + '".'; },
      es: function (p) { return 'No se pudo seleccionar una batería adecuada de la marca "' + p.brand + '".'; },
      zh: function (p) { return '无法从品牌“' + p.brand + '”中选出合适的电池。'; } },
    batt_zero: {
      en: function () { return '⚠ The calculated battery capacity is almost zero — review the night loads or days of autonomy before actual implementation.'; },
      es: function () { return '⚠ La capacidad de batería calculada es prácticamente cero: revise las cargas nocturnas o los días de autonomía antes de la ejecución real.'; },
      zh: function () { return '⚠ 计算得出的电池容量几乎为零——实际实施前请复核夜间负载或自给天数。'; } },
    no_string: {
      en: function (p) { return 'No possible string configuration with the ' + p.brand + ' ' + p.type + ' inverter and this panel — try a panel with a lower voltage or another inverter.'; },
      es: function (p) { return 'No es posible ninguna configuración de cadena con el inversor ' + p.brand + ' ' + p.type + ' y este panel: pruebe un panel de menor tensión u otro inversor.'; },
      zh: function (p) { return '⚠ ' + p.brand + ' ' + p.type + ' 逆变器与该光伏板无法组成可行的串联方案——请尝试电压更低的光伏板或其他逆变器。'; } },
    mppt_low: {
      en: function (p) { return '⚠ The panel string operating voltage (' + p.v + ' V) is below the minimum MPPT range of the ' + p.brand + ' inverter (' + p.min + ' V) — charging efficiency will drop.'; },
      es: function (p) { return '⚠ La tensión de funcionamiento de la cadena de paneles (' + p.v + ' V) es inferior al mínimo del rango MPPT del inversor ' + p.brand + ' (' + p.min + ' V): la eficiencia de carga disminuirá.'; },
      zh: function (p) { return '⚠ 光伏板串工作电压（' + p.v + ' V）低于 ' + p.brand + ' 逆变器 MPPT 范围的下限（' + p.min + ' V）——充电效率会下降。'; } },
    mppt_high: {
      en: function (p) { return '⚠ The panel string operating voltage (' + p.v + ' V) is above the maximum MPPT range of the ' + p.brand + ' inverter (' + p.max + ' V) — reduce the number of panels per string.'; },
      es: function (p) { return '⚠ La tensión de funcionamiento de la cadena de paneles (' + p.v + ' V) supera el máximo del rango MPPT del inversor ' + p.brand + ' (' + p.max + ' V): reduzca el número de paneles por cadena.'; },
      zh: function (p) { return '⚠ 光伏板串工作电压（' + p.v + ' V）高于 ' + p.brand + ' 逆变器 MPPT 范围的上限（' + p.max + ' V）——请减少每串的光伏板数量。'; } },
    no_voc_data: {
      en: function (p) { return '⚠ Insufficient technical data (Voc/Vimp) for panel brand "' + p.panel + '" or inverter "' + p.inv + '" — the number of panels is calculated from the energy balance only, without confirming that the actual string wiring is compatible with the inverter input. Check with the engineer before implementation.'; },
      es: function (p) { return '⚠ Datos técnicos insuficientes (Voc/Vimp) para la marca de paneles "' + p.panel + '" o el inversor "' + p.inv + '": el número de paneles se calcula solo con el balance energético, sin confirmar que el cableado real en cadenas sea compatible con la entrada del inversor. Consulte con el ingeniero antes de la ejecución.'; },
      zh: function (p) { return '⚠ 光伏板品牌“' + p.panel + '”或逆变器“' + p.inv + '”缺少足够的技术数据（Voc/Vimp）——光伏板数量仅按能量平衡计算，未确认实际串联接线是否与逆变器输入兼容。实施前请与工程师核实。'; } },
    pv_clipping: {
      en: function (p) { return '⚠ The installed PV power (' + p.w + ' W) exceeds the maximum PV power the ' + p.brand + ' inverter accepts (' + p.max + ' W) — the excess will be wasted (clipping); reduce the number of panels or choose a larger inverter.'; },
      es: function (p) { return '⚠ La potencia FV instalada (' + p.w + ' W) supera la potencia FV máxima que admite el inversor ' + p.brand + ' (' + p.max + ' W): el exceso se perderá (clipping); reduzca el número de paneles o elija un inversor mayor.'; },
      zh: function (p) { return '⚠ 装机光伏功率（' + p.w + ' W）超过 ' + p.brand + ' 逆变器可接受的最大光伏功率（' + p.max + ' W）——超出部分将被浪费（削波）；请减少光伏板数量或选择更大的逆变器。'; } },
    panel_typical: {
      en: function (p) { return 'ℹ️ The number of panels is calculated based on a typical ~' + p.watt + ' W panel of brand ' + p.brand + ' (for the electrical wiring design only) — this is the closest power actually registered, so if a more accurate power exists it must be registered in the products.'; },
      es: function (p) { return 'ℹ️ El número de paneles se calcula con un panel típico de ~' + p.watt + ' W de la marca ' + p.brand + ' (solo para el diseño del cableado eléctrico): es la potencia registrada más cercana, por lo que, si existe una potencia más precisa, debe registrarse en los productos.'; },
      zh: function (p) { return 'ℹ️ 光伏板数量按 ' + p.brand + ' 品牌约 ' + p.watt + ' W 的典型光伏板计算（仅用于电气接线设计）——这是实际登记的最接近功率，如有更精确的功率，需在产品中登记。'; } },
    panel_price_missing: {
      en: function () { return '⚠ The panel price for this brand is incomplete on the site — the value is not accurately calculated in the total.'; },
      es: function () { return '⚠ El precio de los paneles de esta marca está incompleto en el sitio: el valor no se calcula con exactitud en el total.'; },
      zh: function () { return '⚠ 该品牌光伏板的价格在网站上不完整——总计中的该项数值并不精确。'; } }
  };

  /* ───────────────────────── واجهة الاستخدام ───────────────────────── */
  function lang() {
    var l = (document.documentElement.getAttribute('lang') || 'ar').toLowerCase().split('-')[0];
    return LANGS.indexOf(l) >= 0 ? l : 'en';
  }
  function fill(v, p) { return typeof v === 'function' ? v(p || {}) : v; }
  function t(key, params) {
    var l = lang();
    var v = D[l][key];
    if (v === undefined) v = D.en[key];
    if (v === undefined) v = D.ar[key];
    return v === undefined ? key : fill(v, params);
  }
  function pick(map, nameAr) {
    var l = lang();
    if (l === 'ar') return nameAr;
    var e = map[nameAr];
    return (e && (e[l] || e.en)) || nameAr;                       // اسم جديد مش مترجم → يفضل بالعربي (مش فاضي)
  }
  function msg(m, arText) {
    var l = lang();
    if (l === 'ar' || !m) return arText;                          // العربي: نص المحرك الأصلي بالحرف
    var tpl = MSG[m.code];
    var f = tpl && (tpl[l] || tpl.en);
    if (!f) return arText;
    var p = {};
    for (var k in (m.params || {})) p[k] = m.params[k];
    if (p.load !== undefined) p.load = pick(LOADS, p.load);
    return f(p);
  }

  window.OG_I18N = {
    t: t, lang: lang, msg: msg,
    locale: function () { return LOCALE[lang()] || LOCALE.en; },
    loadName: function (n) { return pick(LOADS, n); },
    presetName: function (n) { return pick(PRESETS, n); },
    presetDesc: function (n) { return pick(PRESET_DESC, n); },
    _dict: D, _msg: MSG
  };
})();
