/* =========================================================================
   محرك حساب أنظمة الأوف جريد — نسخة عامة لموقع alaslsolar.com

   ملاحظة مهمة: النسخة دي بتحسب "تكلفة الخامات فقط" من واقع أسعار المنتجات
   المنشورة فعليًا على الموقع (products.price) — من غير أي تكلفة شراء داخلية
   أو نسبة خصم من المورد أو هامش ربح. مفيش تركيب ولا نقل في الحساب ده خالص.
   المنطق الهندسي (اختيار الانفرتر/البطارية، تصميم سلاسل الألواح) منقول من
   نفس معادلات الأداة الداخلية، لكن بدون أي جزء تسعير/تكلفة إداري.
   ========================================================================= */

function roundUpTo(value, decimals) {
  const f = Math.pow(10, decimals);
  return Math.ceil(value * f) / f;
}

function pickInverterForBrand(catalog, brand, requiredKW, peakInstantaneousW, defaultSurgePct, requestedKW) {
  const options = catalog.inverters.filter(m => m.brand === brand).sort((a, b) => a.powerKW - b.powerKW);
  if (!options.length) return { model: null, undersized: false, surgeUndersized: false, requestedNotFound: false };
  const surgeCapOf = m => m.powerKW * 1000 * (m.surgeCapacityPct || defaultSurgePct || 1);

  // لو المندوب حدد قدرة معينة يدويًا: نستخدمها بالظبط لو موجودة لنفس الماركة،
  // حتى لو أصغر أو أكبر من القدرة المحسوبة تلقائيًا من الأحمال (زي ما بيحصل
  // بالظبط مع قدرة الألواح وفولت/سعة البطارية أعلاه).
  if (requestedKW) {
    const exact = options.find(m => m.powerKW === requestedKW);
    if (exact) {
      return {
        model: exact,
        undersized: exact.powerKW < requiredKW,
        surgeUndersized: peakInstantaneousW > surgeCapOf(exact),
        requestedNotFound: false,
      };
    }
  }

  const fit = options.find(m => m.powerKW >= requiredKW && peakInstantaneousW <= surgeCapOf(m));
  if (fit) return { model: fit, undersized: false, surgeUndersized: false, requestedNotFound: !!requestedKW };
  const largest = options[options.length - 1];
  return {
    model: largest,
    undersized: largest.powerKW < requiredKW,
    surgeUndersized: peakInstantaneousW > surgeCapOf(largest),
    requestedNotFound: !!requestedKW,
  };
}

function pickBatteryForBrand(catalog, brand, inverterVoltage, requestedVoltage, requestedAh, requestedType, autonomyEnergyWh, safetyFactor) {
  let brandOptions = catalog.batteries.filter(b => b.brand === brand);
  if (!brandOptions.length) return { batt: null, reason: 'no_brand' };

  if (requestedType) {
    const byType = brandOptions.filter(b => (b.type || '') === requestedType);
    if (!byType.length) return { batt: null, reason: 'no_type' };
    brandOptions = byType;
  }

  // لو المستخدم حدد فولت معين يدويًا: نتحقق إنه يقسم فولت الانفرتر بالظبط
  // (شرط أساسي عشان عدد البطاريات على التوالي يبقى عدد صحيح فعلي)
  if (requestedVoltage) {
    const atVoltage = brandOptions.filter(b => b.voltage === requestedVoltage);
    if (!atVoltage.length) return { batt: null, reason: 'no_voltage' };
    if (inverterVoltage % requestedVoltage !== 0) {
      return { batt: null, reason: 'voltage_incompatible', requestedVoltage };
    }
    brandOptions = atVoltage;
  } else {
    // مفيش فولت محدد: هنكتفي بالفولتات المتوافقة هندسيًا مع الانفرتر
    const compatible = brandOptions.filter(b => b.voltage <= inverterVoltage && inverterVoltage % b.voltage === 0);
    if (!compatible.length) return { batt: null, reason: 'no_compatible_voltage' };
    brandOptions = compatible;
  }

  if (requestedAh) {
    const atAh = brandOptions.filter(b => b.ah === requestedAh);
    if (!atAh.length) return { batt: null, reason: 'no_ah' };
    // لو فيه أكتر من نتيجة بنفس الفولت والسعة (نوع مختلف) ناخد الأرخص
    return { batt: atAh.sort((a, b) => (a.unitPrice || 0) - (b.unitPrice || 0))[0], reason: null };
  }

  // مفيش سعة محددة: نختار الفولت الأعلى المتاح (زي الأول — أقل عدد بطاريات
  // على التوالي)، وبعدين من بين كل أحجام الـAh المتاحة بنفس الفولت، نختار
  // اللي بيدّي أقل تكلفة إجمالية فعليًا (عدد الوحدات المطلوبة × سعر الوحدة)
  // مش أكبر سعة دايمًا — عشان العميل غالبًا بيهتم بالتكلفة قبل أي حاجة.
  const bestVoltage = Math.max(...brandOptions.map(b => b.voltage));
  const atBestVoltage = brandOptions.filter(b => b.voltage === bestVoltage);

  if (autonomyEnergyWh != null && safetyFactor != null && inverterVoltage) {
    let best = null;
    for (const candidate of atBestVoltage) {
      if (!candidate.ah || !candidate.dod) continue;
      const requiredAh = (autonomyEnergyWh * safetyFactor) / (candidate.dod * inverterVoltage);
      const units = Math.max(1, Math.ceil(requiredAh / candidate.ah));
      const totalCost = units * (candidate.unitPrice || 0);
      const isBetter = !best
        || totalCost < best.totalCost
        || (totalCost === best.totalCost && units < best.units);
      if (isBetter) best = { candidate, units, totalCost };
    }
    if (best) return { batt: best.candidate, reason: null };
  }

  // احتياطي لو مفيش بيانات كافية لحساب التكلفة (مثلاً autonomyEnergyWh مش
  // متاح من الاستدعاء) — نرجع للسلوك القديم: أعلى فولت ثم أكبر AH.
  return { batt: atBestVoltage.sort((a, b) => b.ah - a.ah)[0], reason: null };
}

/**
 * catalog = { inverters:[{brand,type,voltage,powerKW,surgeCapacityPct,pvVocMax,pvMpptMin,pvMpptMax,pvMaxPowerW,unitPrice}],
 *             batteries:[{brand,voltage,ah,dod,unitPrice}],
 *             panels:[{brand,power,voc,vimp,pricePerWatt}] }
 * genericPrices = { steelPerUnit, cablesPerMeter, cableMetersPerSteelUnit, accessoriesFixed,
 *                   batteryChargeSunHours, systemEfficiency, defaultSurgeCapacityPct }
 * inputs = { panelBrand, invBrand, battBrand, phase, psh, safetyFactor, autonomyDays,
 *            morningEnabled, nightEnabled, loads:[{name,watt,runningFactor,surgeFactor,count,dayHours,nightHours}] }
 */
function computeOffgridMaterials(catalog, gp, inputs) {
  const errors = [];
  // رسائل لغوية موازية لـ errors (نفس الترتيب): { code, params } — للعرض بلغات تانية في الصفحات العامة.
  // errors نفسها (النص العربي) متتغيّرش لأن أداة المندوب (QL/rep-offgrid-quote.js) بتعرضها زي ما هي.
  const messages = [];
  function note(code, params, text) { errors.push(text); messages.push({ code, params: params || {} }); }

  const panelOptions = catalog.panels.filter(p => p.brand === inputs.panelBrand);
  if (!panelOptions.length) { note('no_panels', {}, 'لا توجد ألواح منشورة لهذه الماركة.'); return { errors, messages }; }
  const requestedWatt = inputs.panelWatt ? Number(inputs.panelWatt) : null;
  const wattMatches = requestedWatt ? panelOptions.filter(p => Number(p.power) === requestedWatt) : [];
  const panelPool = wattMatches.length ? wattMatches : panelOptions;
  if (requestedWatt && !wattMatches.length) {
    note('panel_watt_fallback', { watt: requestedWatt, brand: inputs.panelBrand }, `⚠ القدرة المختارة (${requestedWatt} وات) مش مسجلة لماركة "${inputs.panelBrand}" — تم استخدام أقرب قدرة متاحة بدلًا منها.`);
  }
  const panel = panelPool.slice().sort((a, b) => (a.pricePerWatt || 0) - (b.pricePerWatt || 0))[0];
  if (!inputs.invBrand) { note('pick_inv_brand', {}, 'اختار ماركة الانفرتر.'); return { errors, messages }; }
  if (!inputs.battBrand) { note('pick_batt_brand', {}, 'اختار ماركة البطارية.'); return { errors, messages }; }

  const psh = Number(inputs.psh) || 6;
  const safetyFactor = (inputs.safetyFactor === undefined || inputs.safetyFactor === null || inputs.safetyFactor === '')
    ? 1.1 : Number(inputs.safetyFactor);
  const autonomyDays = (inputs.autonomyDays === undefined || inputs.autonomyDays === null || inputs.autonomyDays === '')
    ? 0 : Number(inputs.autonomyDays);

  /* ---- 1) حمل الأحمال ---- */
  let R2 = 0, sumNight = 0, sumDay = 0, peakSurgeAddOn = 0, worstSurgeLoad = null;
  (inputs.loads || []).forEach(l => {
    const count = Number(l.count) || 0;
    const H = (Number(l.watt) || 0) * count;
    const runningFactor = (l.runningFactor === undefined || l.runningFactor === null || l.runningFactor === '') ? 1 : Number(l.runningFactor);
    const I = (Number(l.nightHours) || 0) * H * runningFactor;
    const J = (Number(l.dayHours) || 0) * H * runningFactor;
    R2 += H; sumNight += I; sumDay += J;
    if (count > 0 && l.surgeFactor && l.surgeFactor > 1) {
      const surgeAddOn = (Number(l.watt) || 0) * (l.surgeFactor - 1);
      if (surgeAddOn > peakSurgeAddOn) { peakSurgeAddOn = surgeAddOn; worstSurgeLoad = l.name; }
    }
  });
  const peakInstantaneousW = R2 + peakSurgeAddOn;

  const morningEnabled = !!inputs.morningEnabled;
  const nightEnabled = !!inputs.nightEnabled;
  const R4 = sumNight * (nightEnabled ? 1 : 0);
  const R5 = (sumDay * (morningEnabled ? 1 : 0)) + R4;
  const R6 = psh ? R5 / psh : 0;

  /* ---- 2) اختيار الانفرتر تلقائيًا ---- */
  const requiredKW = roundUpTo(R2 / 1000, 1);
  const surgePctDefault = gp.defaultSurgeCapacityPct || 1.5;
  const requestedInvKW = inputs.invPowerKW ? Number(inputs.invPowerKW) : null;
  const { model: inv, undersized: invUndersized, surgeUndersized, requestedNotFound: invRequestedNotFound } =
    pickInverterForBrand(catalog, inputs.invBrand, requiredKW, peakInstantaneousW, surgePctDefault, requestedInvKW);
  if (!inv) { note('no_inverter', { brand: inputs.invBrand }, `مفيش موديلات انفرتر مسجلة لماركة "${inputs.invBrand}".`); return { errors, messages }; }
  if (invRequestedNotFound) note('inv_watt_fallback', { kw: requestedInvKW, brand: inputs.invBrand }, `⚠ القدرة المختارة (${requestedInvKW} كيلوواط) مش مسجلة لماركة "${inputs.invBrand}" — تم استخدام أقرب قدرة متاحة بدلًا منها.`);
  if (invUndersized) note('inv_undersized', { brand: inv.brand, kw: inv.powerKW, requiredKW }, `⚠ أكبر انفرتر متاح من ماركة ${inv.brand} (${inv.powerKW} كيلوواط) لسه أصغر من القدرة اللحظية المطلوبة (${requiredKW} كيلوواط) — قلل الأحمال أو جرّب ماركة تانية.`);
  const inverterVoltage = inv.voltage;

  if (surgeUndersized && peakSurgeAddOn > 0) {
    const basis = inv.surgeCapacityPct ? 'من الداتا شيت' : 'افتراض عام تقريبي 150% (سجّل النسبة الحقيقية من الداتا شيت لدقة أعلى)';
    note('inv_surge', { brand: inv.brand, load: worstSurgeLoad, basis: inv.surgeCapacityPct ? 'datasheet' : 'assumed' }, `⚠ أكبر انفرتر متاح من ماركة ${inv.brand} لسه مش هيتحمّل تيار بدء "${worstSurgeLoad}" (${basis}) — جرّب ماركة تانية أو شغّل الأجهزة الكبيرة منفصلة.`);
  }

  /* ---- 3) اختيار البطارية (يدويًا لو المستخدم حدد فولت/سعة/نوع، وإلا تلقائيًا
     بأقل تكلفة فعلية — مش أكبر سعة متاحة، زي ما كان قبل كده) ---- */
  const autonomyEnergyWh = R4 + (autonomyDays * R5);
  const requestedBattVoltage = inputs.battVoltage ? Number(inputs.battVoltage) : null;
  const requestedBattAh = inputs.battAh ? Number(inputs.battAh) : null;
  const requestedBattType = inputs.battType || null;
  const battPick = pickBatteryForBrand(catalog, inputs.battBrand, inverterVoltage, requestedBattVoltage, requestedBattAh, requestedBattType, autonomyEnergyWh, safetyFactor);
  const batt = battPick.batt;
  if (!batt) {
    const msgs = {
      no_brand: `مفيش بطاريات مسجلة لماركة "${inputs.battBrand}".`,
      no_type: `مفيش بطاريات من ماركة "${inputs.battBrand}" بالنوع/الموديل المختار.`,
      no_voltage: `مفيش بطاريات من ماركة "${inputs.battBrand}" بفولت ${requestedBattVoltage}V.`,
      voltage_incompatible: `⚠ فولت البطارية المختار (${requestedBattVoltage}V) لازم يقسم فولت الانفرتر (${inverterVoltage}V) بالظبط عشان عدد البطاريات على التوالي يبقى صحيح — اختار فولت تاني أو انفرتر بفولت متوافق.`,
      no_compatible_voltage: `مفيش بطاريات من ماركة "${inputs.battBrand}" بجهد متوافق مع الانفرتر (${inverterVoltage}V) — جرّب ماركة تانية.`,
      no_ah: `مفيش بطارية من ماركة "${inputs.battBrand}" بفولت ${requestedBattVoltage || ''}V وسعة ${requestedBattAh}AH.`,
    };
    note(msgs[battPick.reason] ? 'batt_' + battPick.reason : 'batt_fail',
      { brand: inputs.battBrand, volt: requestedBattVoltage, invVolt: inverterVoltage, ah: requestedBattAh },
      msgs[battPick.reason] || `تعذر اختيار بطارية مناسبة من ماركة "${inputs.battBrand}".`);
    return { errors, messages };
  }
  const batteryVoltage = batt.voltage;
  const designOkay = inverterVoltage >= batteryVoltage;

  /* ---- 4) بنك البطاريات ---- */
  const R7 = (batt.dod && inverterVoltage) ? (autonomyEnergyWh * safetyFactor) / (batt.dod * inverterVoltage) : 0;
  const O7 = designOkay ? inverterVoltage / batteryVoltage : 0; // عدد البطاريات في السلسلة
  const O8 = batt.ah ? Math.ceil(R7 / batt.ah) : 0;              // عدد السلاسل
  const O6 = Math.round(O7 * O8);                                // إجمالي عدد البطاريات
  const O9 = O7 * O8 * batt.ah * batteryVoltage;                 // إجمالي الطاقة المخزنة Wh
  if (autonomyEnergyWh <= 0) {
    note('batt_zero', {}, '⚠ سعة البطاريات المحسوبة تقريبًا صفر — راجع الأحمال الليلية أو أيام الاستقلالية قبل التنفيذ الفعلي.');
  }

  /* ---- 5) تصميم مصفوفة الألواح ---- */
  const panelWatt = Number(panel.power) || 0;
  const chargeSunHours = gp.batteryChargeSunHours || 5.5;
  const systemEfficiency = gp.systemEfficiency || 0.78;
  const byBattery = panelWatt ? Math.ceil((R4 * safetyFactor) / (chargeSunHours * panelWatt * systemEfficiency)) : 0;
  const byDailyLoad = panelWatt ? Math.round((R6 / panelWatt) * safetyFactor / systemEfficiency) : 0;
  const O2min = Math.max(byBattery, byDailyLoad, 1);

  let panelsPerString = null, stringCount = null, stringVimp = null, pvLimitVerified = false;
  if (inv.pvVocMax && panel.voc && panel.vimp) {
    const maxPanelsPerString = Math.max(Math.floor(inv.pvVocMax / panel.voc), 1);
    const impliedMpptMin = inv.pvMpptMin || (inverterVoltage * 1.2);
    const minPanelsPerString = Math.max(1, Math.ceil(impliedMpptMin / panel.vimp));
    let best = null;
    for (let pps = minPanelsPerString; pps <= maxPanelsPerString; pps++) {
      const strings = Math.max(Math.ceil(O2min / pps), 1);
      const total = pps * strings;
      const vimpTotal = pps * panel.vimp;
      const inMppt = !inv.pvMpptMax || vimpTotal <= inv.pvMpptMax;
      const candidate = { panelsPerString: pps, stringCount: strings, total, inMppt };
      if (!best
        || candidate.total < best.total
        || (candidate.total === best.total && candidate.inMppt && !best.inMppt)
        || (candidate.total === best.total && candidate.inMppt === best.inMppt && candidate.panelsPerString > best.panelsPerString)
      ) best = candidate;
    }
    if (!best) {
      note('no_string', { brand: inv.brand, type: inv.type }, `مفيش تركيبة سلسلة ممكنة بالانفرتر ${inv.brand} ${inv.type} مع اللوح ده — جرّب لوح بفولت أقل أو انفرتر تاني.`);
      panelsPerString = maxPanelsPerString;
      stringCount = Math.max(Math.ceil(O2min / panelsPerString), 1);
      stringVimp = panelsPerString * panel.vimp;
    } else {
      panelsPerString = best.panelsPerString; stringCount = best.stringCount; stringVimp = panelsPerString * panel.vimp;
    }
    pvLimitVerified = true;
    if (inv.pvMpptMin && stringVimp < inv.pvMpptMin) note('mppt_low', { v: Math.round(stringVimp), brand: inv.brand, min: inv.pvMpptMin }, `⚠ فولت تشغيل سلسلة الألواح (${Math.round(stringVimp)}V) أقل من الحد الأدنى لنطاق MPPT لانفرتر ${inv.brand} (${inv.pvMpptMin}V) — كفاءة الشحن هتقل.`);
    if (inv.pvMpptMax && stringVimp > inv.pvMpptMax) note('mppt_high', { v: Math.round(stringVimp), brand: inv.brand, max: inv.pvMpptMax }, `⚠ فولت تشغيل سلسلة الألواح (${Math.round(stringVimp)}V) أعلى من الحد الأقصى لنطاق MPPT لانفرتر ${inv.brand} (${inv.pvMpptMax}V) — قلل عدد الألواح بالسلسلة.`);
  } else {
    note('no_voc_data', { panel: panel.brand, inv: inv.brand }, `⚠ مفيش بيانات فنية كافية (Voc/Vimp) لماركة الألواح "${panel.brand}" أو انفرتر "${inv.brand}" — عدد الألواح محسوب من موازنة الطاقة بس، من غير تأكيد إن التوصيل الفعلي في سلاسل متوافق مع مدخل الانفرتر. راجع مع المهندس قبل التنفيذ.`);
  }
  const O2 = pvLimitVerified ? panelsPerString * stringCount : O2min;

  /* فحص أقصى قدرة PV يقبلها الانفرتر (من الداتا شيت) — لو الحقل فاضي في الكتالوج
     الفحص بيتخطى تلقائيًا (pvPowerOk = null) ومفيش تحذير، لحد ما البيانات تتضاف. */
  const installedPvW = O2 * panelWatt;
  const pvPowerChecked = !!inv.pvMaxPowerW;
  if (pvPowerChecked && installedPvW > inv.pvMaxPowerW) {
    note('pv_clipping', { w: Math.round(installedPvW), brand: inv.brand, max: inv.pvMaxPowerW }, `⚠ قدرة الألواح المركّبة (${Math.round(installedPvW)}W) أعلى من أقصى قدرة PV يقبلها انفرتر ${inv.brand} (${inv.pvMaxPowerW}W) — الزيادة هتتهدر (clipping)، قلل عدد الألواح أو اختار انفرتر أكبر.`);
  }

  /* ---- 6) بنود الخامات (بدون تركيب أو نقل) ---- */
  const phaseQty = inputs.phase === 'three' ? 3 : 1;
  const steelQty = Math.max(Math.ceil(O2 / 2), 1);
  const cablesQty = steelQty * (gp.cableMetersPerSteelUnit || 20);

  const rows = [];
  if (panelWatt && panel.pricePerWatt) {
    const panelUnit = panel.pricePerWatt * panelWatt;
    rows.push({ name: 'الألواح', key: 'panels', type: panel.brand, qty: O2, unitPrice: panelUnit, total: O2 * panelUnit });
    // panels are sold by this brand at a per-watt price with no fixed model/SKU,
    // so the ${panelWatt}W used for the electrical string design is an engineering
    // assumption (typical panel spec), not a real product listing — say so explicitly
    // instead of implying "JA Solar 550W" is an actual purchasable model.
    if (!requestedWatt || !wattMatches.length) {
      note('panel_typical', { watt: panelWatt, brand: panel.brand }, `ℹ️ عدد الألواح محسوب على أساس لوح نموذجي ~${panelWatt} وات لماركة ${panel.brand} (لتصميم التوصيل الكهربائي فقط) — ده أقرب قدرة مسجلة فعليًا، فلو فيه قدرة تانية دقيقة أكتر لازم تتسجل في المنتجات.`);
    }
  } else {
    rows.push({ name: 'الألواح', key: 'panels', type: panel.brand, qty: O2, unitPrice: 0, total: 0 });
    note('panel_price_missing', {}, '⚠ سعر الألواح لهذه الماركة غير مكتمل في الموقع — القيمة غير محسوبة بدقة في الإجمالي.');
  }
  rows.push({ name: 'انفرتر', key: 'inverter', type: `${inv.brand} ${inv.type}`, qty: phaseQty, unitPrice: inv.unitPrice, total: phaseQty * inv.unitPrice });
  rows.push({ name: 'شاسيه', key: 'chassis', typeKey: 'steel', type: 'حديد مجلفن', qty: steelQty, unitPrice: gp.steelPerUnit, total: steelQty * gp.steelPerUnit });
  rows.push({ name: 'كابلات', key: 'cables', typeKey: 'cable6', type: '6 مم', qty: cablesQty, unitPrice: gp.cablesPerMeter, total: cablesQty * gp.cablesPerMeter });
  rows.push({ name: 'بطاريات', key: 'batteries', type: `${batt.brand} ${batt.ah}AH-${batt.voltage}V`, qty: O6, unitPrice: batt.unitPrice, total: O6 * batt.unitPrice });
  rows.push({ name: 'إكسسوارات', key: 'accessories', typeKey: 'accset', type: 'لوحة تجميع / MC4 / فيوز / قواطع', qty: 1, unitPrice: gp.accessoriesFixed, total: gp.accessoriesFixed });

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  const invRatedW = inv.powerKW * 1000;
  const invSurgeW = invRatedW * (inv.surgeCapacityPct || surgePctDefault);
  const dayLoadWh = sumDay * (morningEnabled ? 1 : 0);
  const nightLoadWh = R4;
  const dailyProductionKWh = panelWatt ? (O2 * panelWatt * psh * systemEfficiency) / 1000 : 0;
  const batteryUsagePct = O9 ? Math.round((autonomyEnergyWh / O9) * 100) : null;

  return {
    errors, messages, inv, batt, panel,
    panelCount: O2, batteryCount: O6, storedKWh: O9 / 1000,
    rows, grandTotal, offer: true,
    /* بيانات إضافية للبريف الفني عند الطباعة */
    brief: {
      panelKWp: (O2 * panelWatt) / 1000,
      dailyProductionKWh,
      dayLoadKWh: dayLoadWh / 1000,
      nightLoadKWh: nightLoadWh / 1000,
      storedKWh: O9 / 1000,
      batteryUsagePct,
      peakInstantaneousKW: peakInstantaneousW / 1000,
      invRatedKW: invRatedW / 1000,
      invSurgeKW: invSurgeW / 1000,
      panelsPerString, stringCount,
      batterySeriesCount: O7, batteryParallelStrings: O8,
      stringVimp, invMpptMin: inv.pvMpptMin || null, invMpptMax: inv.pvMpptMax || null,
      mpptOk: pvLimitVerified ? !((inv.pvMpptMin && stringVimp < inv.pvMpptMin) || (inv.pvMpptMax && stringVimp > inv.pvMpptMax)) : null,
      autonomyDays,
      pvMaxPowerW: inv.pvMaxPowerW || null,
      pvPowerOk: pvPowerChecked ? installedPvW <= inv.pvMaxPowerW : null,
    },
  };
}

if (typeof window !== 'undefined') window.computeOffgridMaterials = computeOffgridMaterials;
