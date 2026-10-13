/* ============================================================
   product-labels.js
   مصدر واحد لتسمية المنتجات في عروض الأسعار (عشان الاسم يطلع بنفس الشكل
   في صفحة عروض المنتجات وفي طباعة العروض من الـ CRM).
   بيعتمد على عميل supabase بيتمرّر له (مش global) — راجع withProductLabels.
   ============================================================ */
(function () {

/* أسماء كتير في الداتا بيز متطابقة (مثلًا كل إنفرترات Delixi اسمها "إنفرتر Delixi")، والفرق الحقيقي بينها
   في specs_ar (القدرة) و model_available (الموديل). بنضيفهم للاسم بس لما الاسم مش فريد جوه نفس الفئة،
   عشان باقي المنتجات تفضل أسماءها القصيرة زي ما هي. */
const nameCountsByCategory = new Map(); // category -> Map(اسم -> عدد المنتجات بنفس الاسم)

function productBaseName(p) { return p.name_ar || p.name_en || "منتج"; }

function countNames(rows) {
  const counts = new Map();
  rows.forEach((p) => { const n = productBaseName(p); counts.set(n, (counts.get(n) || 0) + 1); });
  return counts;
}

// رقم المواصفة بدون أصفار زيادة (4.10 -> 4)، أو null لو مش متسجّل
function specNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

/* الإنفرترات: دايمًا "الماركة الموديل - القدرة kW/HP" (مثال: VEICHI SI23 - 75KW/100HP)،
   عشان المندوب والعميل يميّزوا الصنف ويقارنوا السعر. لو أي حقل ناقص نرجع للصيغة العامة. */
function inverterLabel(p) {
  const kw = specNum(p.power_kw);
  const hp = specNum(p.power_hp);
  if (!p.brand || kw == null || hp == null) return null;
  const head = [p.brand, (p.model_available || "").trim()].filter(Boolean).join(" ");
  return `${head} - ${kw}KW/${hp}HP`;
}

/* البطاريات: بنعرض بجانب الاسم السعة المخزّنة بالـKWH.
   - لو الـkWh مسجّل أصلًا من المصنع (في الاسم أو specs_ar، زي Phylion 5.04kWh) بنعرضه زي ما هو.
   - لو مش مسجّل: KWH = الفولت الفعلي × AH ÷ 1000 بالأرقام المسجّلة على البطارية (مثال: 25.6V × 100Ah = 2.56KWH)،
     من غير أي خصم DoD، لأن العرض بيعرض قيم المصنع في الحالة القياسية.
   الفولت والـAh بيتقرأوا من specs_ar ("الجهد: 25.6V | السعة: 100Ah") لأن عمود voltage_v مقرّب (12/24/48)
   مش الفولت الفعلي (12.8/25.6/51.2). لو النص مش بالشكل ده بنرجع للاسم ثم للأعمدة. */
function firstNum(text, re) {
  const m = String(text || "").match(re);
  const n = m ? Number(m[1]) : NaN;
  return n > 0 ? n : null;
}

function batteryKwh(p) {
  const registered = firstNum(`${p.name_ar || ""} ${p.specs_ar || ""}`, /(\d+(?:\.\d+)?)\s*kwh/i);
  if (registered) return String(registered);
  const volts = firstNum(p.specs_ar, /الجهد:\s*(\d+(?:\.\d+)?)\s*V/i)
    ?? firstNum(p.name_ar, /(\d+(?:\.\d+)?)\s*V\b/i)
    ?? (Number(p.voltage_v) > 0 ? Number(p.voltage_v) : null);
  const ah = firstNum(p.specs_ar, /السعة:\s*(\d+(?:\.\d+)?)\s*Ah/i)
    ?? firstNum(p.name_ar, /(\d+(?:\.\d+)?)\s*Ah/i)
    ?? (Number(p.capacity_ah) > 0 ? Number(p.capacity_ah) : null);
  if (!volts || !ah) return null;
  return String(Math.round((volts * ah) / 10) / 100); // kWh لأقرب خانتين عشريتين
}

/* عمق التفريغ DOD (%) — من عمود dod (0.8 أو 80) أو من النص ("6000 @80% DOD" / "80%DOD@25°C").
   بنرجّع null لو مش مسجّل، ومبنخمّنش (الجل/التيوبلار مش هيظهر لهم DOD غير لو اتسجّل في الداتا). */
function batteryDodPct(p) {
  const raw = Number(p.dod);
  if (Number.isFinite(raw) && raw > 0 && raw <= 100) return Math.round(raw <= 1 ? raw * 100 : raw);
  const t = `${p.cycle_life || ""} ${p.specs_ar || ""}`;
  const m = t.match(/(\d+(?:\.\d+)?)\s*%\s*DOD/i) || t.match(/DOD\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%/i);
  const n = m ? Math.round(Number(m[1])) : NaN;
  return n > 0 && n <= 100 ? n : null;
}

/* عدد الدورات — من cycle_life ("6000 @80% DOD") أو من specs_ar ("عمر تشغيلي >6000 دورة") */
function batteryCycles(p) {
  const fromCol = firstNum(p.cycle_life, /(\d{3,5})/);
  if (fromCol) return String(fromCol);
  const m = String(p.specs_ar || "").match(/(\d{3,5})\s*دورة/);
  return m ? m[1] : null;
}

function buildProductLabel(p, nameCounts) {
  if (p.category === "inverters") {
    const inv = inverterLabel(p);
    if (inv) return inv;
  }
  if (p.category === "batteries") {
    const base = productBaseName(p);
    const kwh = batteryKwh(p);
    const head = kwh && !/kwh/i.test(base) ? `${base} — ${kwh}KWH` : base;
    // مثال: بطارية ليثيوم MUST 25.6V 200Ah — 5.12KWH - DOD80% @ 6000Cycle
    const dod = batteryDodPct(p);
    const cyc = batteryCycles(p);
    const tail = dod && cyc ? ` - DOD${dod}% @ ${cyc}Cycle` : dod ? ` - DOD${dod}%` : cyc ? ` - ${cyc}Cycle` : "";
    return head + tail;
  }
  const base = productBaseName(p);
  if ((nameCounts?.get(base) || 0) <= 1) return base;
  const parts = [base];
  const specs = (p.specs_ar || "").trim();
  if (specs && !base.includes(specs)) parts.push(specs);
  const model = (p.model_available || "").trim();
  if (model && !base.includes(model)) parts.push("موديل " + model);
  return parts.join(" — ");
}

/* الدالة rep_create_quote بتخزّن name_ar بس في بنود العرض، فكل الإنفرترات بتطلع بنفس الاسم.
   وقت الطباعة بنرجّع الاسم المميّز من جدول products بالـ product_id (بنود قديمة من غير product_id
   أو منتج اتشال من الكتالوج بتفضل باسمها المحفوظ). */
async function withProductLabels(client, items) {
  const list = items || [];
  const ids = [...new Set(list.map((it) => it.product_id).filter(Boolean))];
  if (!ids.length) return list;

  const { data: prods, error } = await client
    .from("products")
    .select("id, category, brand, name_ar, name_en, specs_ar, model_available, power_kw, power_hp, capacity_ah, voltage_v, dod, cycle_life")
    .in("id", ids);
  if (error || !prods) return list;

  for (const category of new Set(prods.map((p) => p.category))) {
    if (nameCountsByCategory.has(category)) continue;
    const { data: rows } = await client
      .from("products")
      .select("name_ar, name_en")
      .eq("category", category)
      .eq("published", true)
      .eq("in_stock", true);
    if (rows) nameCountsByCategory.set(category, countNames(rows));
  }

  const byId = new Map(prods.map((p) => [p.id, p]));
  return list.map((it) => {
    const p = byId.get(it.product_id);
    return p ? { ...it, name: buildProductLabel(p, nameCountsByCategory.get(p.category)) } : it;
  });
}

  window.ProductLabels = {
    nameCountsByCategory,
    productBaseName,
    countNames,
    buildProductLabel,
    withProductLabels,
  };
})();
