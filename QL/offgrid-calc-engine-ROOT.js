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

function pickInverterForBrand(catalog, brand, requiredKW, peakInstantaneousW, defaultSurgePct) {
  const options = catalog.inverters.filter(m => m.brand === brand).sort((a, b) => a.powerKW - b.powerKW);
  if (!options.length) return { model: null, undersized: false, surgeUndersized: false };
  const surgeCapOf = m => m.powerKW * 1000 * (m.surgeCapacityPct || defaultSurgePct || 1);
  const fit = options.find(m => m.powerKW >= requiredKW && peakInstantaneousW <= surgeCapOf(m));
  if (fit) return { model: fit, undersized: false, surgeUndersized: false };
  const largest = options[options.length - 1];
  return { model: largest, undersized: largest.powerKW < requiredKW, surgeUndersized: peakInstantaneousW > surgeCapOf(largest) };
}

function pickBatteryForBrand(catalog, brand, inverterVoltage, requestedVoltage, requestedAh, requestedType) {
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

  // مفيش سعة محددة: نفس السلوك التلقائي القديم — أعلى فولت متاح ثم أكبر AH
  const bestVoltage = Math.max(...brandOptions.map(b => b.voltage));
  const atBestVoltage = brandOptions.filter(b => b.voltage === bestVoltage);
  return { batt: atBestVoltage.sort((a, b) => b.ah - a.ah)[0], reason: null };
}

/**
 * catalog = { inverters:[{brand,type,voltage,powerKW,surgeCapacityPct,pvVocMax,pvMpptMin,pvMpptMax,unitPrice}],
 *             batteries:[{brand,voltage,ah,dod,unitPrice}],
 *             panels:[{brand,power,voc,vimp,pricePerWatt}] }
 * genericPrices = { steelPerUnit, cablesPerMeter, cableMetersPerSteelUnit, accessoriesFixed,
 *                   batteryChargeSunHours, systemEfficiency, defaultSurgeCapacityPct }
 * inputs = { panelBrand, invBrand, battBrand, phase, psh, safetyFactor, autonomyDays,
 *            morningEnabled, nightEnabled, loads:[{name,watt,runningFactor,surgeFactor,count,dayHours,nightHours}] }
 */
function computeOffgridMaterials(catalog, gp, inputs) {
  const errors = [];

  const panelOptions = catalog.panels.filter(p => p.brand === inputs.panelBrand);
  if (!panelOptions.length) { errors.push('لا توجد ألواح منشورة لهذه الماركة.'); return { errors }; }
  const requestedWatt = inputs.panelWatt ? Number(inputs.panelWatt) : null;
  const wattMatches = requestedWatt ? panelOptions.filter(p => Number(p.power) === requestedWatt) : [];
  const panelPool = wattMatches.length ? wattMatches : panelOptions;
  if (requestedWatt && !wattMatches.length) {
    errors.push(`⚠ القدرة المختارة (${requestedWatt} وات) مش مسجلة لماركة "${inputs.panelBrand}" — تم استخدام أقرب قدرة متاحة بدلًا منها.`);
  }
  const panel = panelPool.slice().sort((a, b) => (a.pricePerWatt || 0) - (b.pricePerWatt || 0))[0];
  if (!inputs.invBrand) { errors.push('اختار ماركة الانفرتر.'); return { errors }; }
  if (!inputs.battBrand) { errors.push('اختار ماركة البطارية.'); return { errors }; }

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
  const { model: inv, undersized: invUndersized, surgeUndersized } =
    pickInverterForBrand(catalog, inputs.invBrand, requiredKW, peakInstantaneousW, surgePctDefault);
  if (!inv) { errors.push(`مفيش موديلات انفرتر مسجلة لماركة "${inputs.invBrand}".`); return { errors }; }
  if (invUndersized) errors.push(`⚠ أكبر انفرتر متاح من ماركة ${inv.brand} (${inv.powerKW} كيلوواط) لسه أصغر من القدرة اللحظية المطلوبة (${requiredKW} كيلوواط) — قلل الأحمال أو جرّب ماركة تانية.`);
  const inverterVoltage = inv.voltage;

  if (surgeUndersized && peakSurgeAddOn > 0) {
    const basis = inv.surgeCapacityPct ? 'من الداتا شيت' : 'افتراض عام تقريبي 150% (سجّل النسبة الحقيقية من الداتا شيت لدقة أعلى)';
    errors.push(`⚠ أكبر انفرتر متاح من ماركة ${inv.brand} لسه مش هيتحمّل تيار بدء "${worstSurgeLoad}" (${basis}) — جرّب ماركة تانية أو شغّل الأجهزة الكبيرة منفصلة.`);
  }

  /* ---- 3) اختيار البطارية (يدويًا لو المستخدم حدد فولت/سعة/نوع، وإلا تلقائيًا) ---- */
  const requestedBattVoltage = inputs.battVoltage ? Number(inputs.battVoltage) : null;
  const requestedBattAh = inputs.battAh ? Number(inputs.battAh) : null;
  const requestedBattType = inputs.battType || null;
  const battPick = pickBatteryForBrand(catalog, inputs.battBrand, inverterVoltage, requestedBattVoltage, requestedBattAh, requestedBattType);
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
    errors.push(msgs[battPick.reason] || `تعذر اختيار بطارية مناسبة من ماركة "${inputs.battBrand}".`);
    return { errors };
  }
  const batteryVoltage = batt.voltage;
  const designOkay = inverterVoltage >= batteryVoltage;

  /* ---- 4) بنك البطاريات ---- */
  const autonomyEnergyWh = R4 + (autonomyDays * R5);
  const R7 = (batt.dod && inverterVoltage) ? (autonomyEnergyWh * safetyFactor) / (batt.dod * inverterVoltage) : 0;
  const O7 = designOkay ? inverterVoltage / batteryVoltage : 0; // عدد البطاريات في السلسلة
  const O8 = batt.ah ? Math.ceil(R7 / batt.ah) : 0;              // عدد السلاسل
  const O6 = Math.round(O7 * O8);                                // إجمالي عدد البطاريات
  const O9 = O7 * O8 * batt.ah * batteryVoltage;                 // إجمالي الطاقة المخزنة Wh
  if (autonomyEnergyWh <= 0) {
    errors.push('⚠ سعة البطاريات المحسوبة تقريبًا صفر — راجع الأحمال الليلية أو أيام الاستقلالية قبل التنفيذ الفعلي.');
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
      errors.push(`مفيش تركيبة سلسلة ممكنة بالانفرتر ${inv.brand} ${inv.type} مع اللوح ده — جرّب لوح بفولت أقل أو انفرتر تاني.`);
      panelsPerString = maxPanelsPerString;
      stringCount = Math.max(Math.ceil(O2min / panelsPerString), 1);
      stringVimp = panelsPerString * panel.vimp;
    } else {
      panelsPerString = best.panelsPerString; stringCount = best.stringCount; stringVimp = panelsPerString * panel.vimp;
    }
    pvLimitVerified = true;
    if (inv.pvMpptMin && stringVimp < inv.pvMpptMin) errors.push(`⚠ فولت تشغيل سلسلة الألواح (${Math.round(stringVimp)}V) أقل من الحد الأدنى لنطاق MPPT لانفرتر ${inv.brand} (${inv.pvMpptMin}V) — كفاءة الشحن هتقل.`);
    if (inv.pvMpptMax && stringVimp > inv.pvMpptMax) errors.push(`⚠ فولت تشغيل سلسلة الألواح (${Math.round(stringVimp)}V) أعلى من الحد الأقصى لنطاق MPPT لانفرتر ${inv.brand} (${inv.pvMpptMax}V) — قلل عدد الألواح بالسلسلة.`);
  } else {
    errors.push(`⚠ مفيش بيانات فنية كافية (Voc/Vimp) لماركة الألواح "${panel.brand}" أو انفرتر "${inv.brand}" — عدد الألواح محسوب من موازنة الطاقة بس، من غير تأكيد إن التوصيل الفعلي في سلاسل متوافق مع مدخل الانفرتر. راجع مع المهندس قبل التنفيذ.`);
  }
  const O2 = pvLimitVerified ? panelsPerString * stringCount : O2min;

  /* ---- 6) بنود الخامات (بدون تركيب أو نقل) ---- */
  const phaseQty = inputs.phase === 'three' ? 3 : 1;
  const steelQty = Math.max(Math.ceil(O2 / 2), 1);
  const cablesQty = steelQty * (gp.cableMetersPerSteelUnit || 20);

  const rows = [];
  if (panelWatt && panel.pricePerWatt) {
    const panelUnit = panel.pricePerWatt * panelWatt;
    rows.push({ name: 'الألواح', type: panel.brand, qty: O2, unitPrice: panelUnit, total: O2 * panelUnit });
    // panels are sold by this brand at a per-watt price with no fixed model/SKU,
    // so the ${panelWatt}W used for the electrical string design is an engineering
    // assumption (typical panel spec), not a real product listing — say so explicitly
    // instead of implying "JA Solar 550W" is an actual purchasable model.
    if (!requestedWatt || !wattMatches.length) {
      errors.push(`ℹ️ عدد الألواح محسوب على أساس لوح نموذجي ~${panelWatt} وات لماركة ${panel.brand} (لتصميم التوصيل الكهربائي فقط) — ده أقرب قدرة مسجلة فعليًا، فلو فيه قدرة تانية دقيقة أكتر لازم تتسجل في المنتجات.`);
    }
  } else {
    rows.push({ name: 'الألواح', type: panel.brand, qty: O2, unitPrice: 0, total: 0 });
    errors.push('⚠ سعر الألواح لهذه الماركة غير مكتمل في الموقع — القيمة غير محسوبة بدقة في الإجمالي.');
  }
  rows.push({ name: 'انفرتر', type: `${inv.brand} ${inv.type}`, qty: phaseQty, unitPrice: inv.unitPrice, total: phaseQty * inv.unitPrice });
  rows.push({ name: 'شاسيه', type: 'حديد مجلفن', qty: steelQty, unitPrice: gp.steelPerUnit, total: steelQty * gp.steelPerUnit });
  rows.push({ name: 'كابلات', type: '6 مم', qty: cablesQty, unitPrice: gp.cablesPerMeter, total: cablesQty * gp.cablesPerMeter });
  rows.push({ name: 'بطاريات', type: `${batt.brand} ${batt.ah}AH-${batt.voltage}V`, qty: O6, unitPrice: batt.unitPrice, total: O6 * batt.unitPrice });
  rows.push({ name: 'إكسسوارات', type: 'لوحة تجميع / MC4 / فيوز / قواطع', qty: 1, unitPrice: gp.accessoriesFixed, total: gp.accessoriesFixed });

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return {
    errors, inv, batt, panel,
    panelCount: O2, batteryCount: O6, storedKWh: O9 / 1000,
    rows, grandTotal, offer: true,
  };
}

if (typeof window !== 'undefined') window.computeOffgridMaterials = computeOffgridMaterials;
