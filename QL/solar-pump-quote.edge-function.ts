import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ══════════════════════════════════════════════════════════════════
   solar-pump-quote — محرك حساب عروض أسعار "محطة ري بالطاقة الشمسية"
   ══════════════════════════════════════════════════════════════════
   الأمان: كل حسابات التكلفة/الخصم/الربح بتحصل هنا بمفتاح service_role
   فقط. المتصفح (كود صفحة QL/solar-pump-station.html) بياخد بس الأسعار
   النهائية للبيع — نفس مبدأ محرك "حلول" المرجعي.

   actions:
   - "quote": حساب معاينة بس، من غير حفظ في قاعدة البيانات.
   - "save": نفس الحساب + حفظ في customers/quotes/quote_costs.
   ══════════════════════════════════════════════════════════════════ */

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function getSaleDiscount(admin: any, category: string, brand: string): Promise<{ sale: number; supplier: number }> {
  const { data } = await admin
    .from("supplier_discounts")
    .select("supplier_discount_pct,sale_discount_pct")
    .eq("category", category)
    .eq("brand", brand)
    .maybeSingle();
  if (!data) return { sale: 0, supplier: 0 };
  return { sale: Number(data.sale_discount_pct) || 0, supplier: Number(data.supplier_discount_pct) || 0 };
}

// يستخرج أول رقم قبل نص معين من name_ar — بديل بسيط لعمود مخصص غير موجود
// حاليًا (زي عدد الـ Arrays في لوحة التجميع، أو عدد الألواح في الشاسيه).
function extractNumberBefore(text: string, marker: RegExp): number | null {
  const m = text.match(marker);
  return m ? parseFloat(m[1]) : null;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "POST بس." }, 405);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "مفيش توكن مصادقة." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await callerClient.auth.getUser(jwt);
    if (userError || !userData?.user?.id) return json({ error: "جلسة غير صالحة." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // لازم يكون مندوب نشط (أو أدمن) — منع أي مستخدم Auth عادي من نداء الدالة
    const repId = userData.user.id;
    const { data: repRow } = await admin.from("reps").select("id,display_name,active").eq("id", repId).maybeSingle();
    const { data: adminRow } = await admin.from("admin_users").select("email").ilike("email", userData.user.email || "").maybeSingle();
    if (!adminRow && (!repRow || repRow.active === false)) {
      return json({ error: "الصفحة دي للمناديب النشطين بس." }, 403);
    }

    const body = await req.json();
    const action = String(body.action || "quote");
    const hp = Number(body.hp);
    const panelProductId = String(body.panel_product_id || "");
    const supplyType = body.supply_type === "supply_install" ? "supply_install" : "supply_only";
    const includePump = !!body.include_pump;
    const pumpProductId = body.pump_product_id ? String(body.pump_product_id) : null;
    const structureMount = body.structure_mount === "rotational" ? "rotational" : "fixed";

    if (!hp || hp <= 0) return json({ error: "قدرة الغطاس (HP) مطلوبة وأكبر من صفر." }, 400);
    if (!panelProductId) return json({ error: "لازم تختار نوع اللوح الشمسي." }, 400);

    // ── إعدادات الحساب (قابلة للتعديل من الأدمن) ──
    const { data: D } = await admin.from("irrigation_bom_settings").select("*").eq("id", 1).single();
    if (!D) return json({ error: "إعدادات الحساب مش موجودة (irrigation_bom_settings)." }, 500);

    // ── اللوح المختار ──
    const { data: panel } = await admin.from("products").select("*").eq("id", panelProductId).eq("category", "panels").eq("published", true).maybeSingle();
    if (!panel) return json({ error: "اللوح المختار مش موجود أو مش منشور." }, 400);
    if (!panel.vimp || !panel.power_watt) {
      return json({ error: `اللوح "${panel.name_ar}" ناقصه مواصفات كهربية (Vimp) في الكتالوج — لازم يتسجل الأول.` }, 400);
    }

    const maxStringV = Number(D.max_string_voltage) || 720;
    const panelsPerStringAdjust = Number(D.panels_per_string_adjust) || 0;
    const stringsAdjust = Number(D.strings_adjust) || 0;
    const hpCapacityRatio = Number(D.hp_capacity_ratio) || 1;
    const inverterPowerIncrease = Number(D.inverter_power_increase) || 0;
    const combinerHeadroom = Number(D.combiner_headroom) || 1.1;
    const vat = Number(D.vat) || 0;

    const vimp = Number(panel.vimp), voc = Number(panel.voc) || 0, iimp = Number(panel.iimp) || 0, isc = Number(panel.isc) || 0;
    const panelWatt = Number(panel.power_watt);

    const panelsPerString = Math.floor(maxStringV / vimp) - panelsPerStringAdjust;
    if (panelsPerString <= 0) return json({ error: "إعدادات الجهد الأقصى للسلسلة غير متوافقة مع هذا اللوح." }, 400);
    const arrays = Math.max(1, Math.round((hp * 1000 * hpCapacityRatio) / (panelsPerString * panelWatt)) - stringsAdjust);
    const totalPanels = panelsPerString * arrays;
    const calcKW = (panelWatt * totalPanels) / 1000;

    const Iimp = arrays * iimp, Vimp = panelsPerString * vimp, Voc = panelsPerString * voc, Isc = arrays * isc;

    // ── الإنفرتر: أصغر موديل حقيقي من الكتالوج يغطي القدرة المطلوبة ──
    const inverterKwNeeded = Math.ceil(hp * 0.8) + inverterPowerIncrease;
    const { data: inverters } = await admin.from("products").select("*").eq("category", "inverters").eq("published", true).order("power_kw", { ascending: true });
    let inverter = (inverters || []).find((r: any) => Number(r.power_kw) >= inverterKwNeeded) || (inverters || [])[(inverters || []).length - 1];
    let inverterWarning: string | null = null;
    if (!inverter) return json({ error: "مفيش إنفرترات منشورة في الكتالوج." }, 500);
    if (Number(inverter.power_kw) < inverterKwNeeded) {
      inverterWarning = `⚠️ أعلى إنفرتر متاح (${inverter.power_kw} KW) أقل من القدرة المطلوبة (${inverterKwNeeded} KW) — راجع الكتالوج.`;
    }
    if (inverter.max_solar_input_kw != null && calcKW > Number(inverter.max_solar_input_kw)) {
      const bigger = (inverters || []).find((r: any) => Number(r.power_kw) > Number(inverter.power_kw) && (r.max_solar_input_kw == null || calcKW <= Number(r.max_solar_input_kw)));
      inverterWarning = bigger
        ? `⚠️ قدرة الألواح (${calcKW.toFixed(1)} KW) أكبر مما يتحمله إنفرتر ${inverter.power_kw} KW (حده الأقصى ${inverter.max_solar_input_kw} KW) — الأنسب ${bigger.power_kw} KW.`
        : `⚠️ قدرة الألواح (${calcKW.toFixed(1)} KW) أكبر مما يتحمله إنفرتر ${inverter.power_kw} KW ولا يوجد طراز أعلى — راجع الإعداد يدويًا.`;
    }

    // ── لوحة التجميع: أصغر صندوق حقيقي يغطي عدد السلاسل + هامش أمان ──
    const combinerNeeded = Math.ceil(arrays * combinerHeadroom);
    const { data: combinersRaw } = await admin.from("products").select("*").eq("category", "combiners").eq("published", true);
    const combinersParsed = (combinersRaw || [])
      .map((r: any) => ({ row: r, capacity: extractNumberBefore(r.name_ar || "", /(\d+)\s*Arrays/i) }))
      .filter((x: any) => x.capacity != null)
      .sort((a: any, b: any) => a.capacity - b.capacity);
    const combinerMatch = combinersParsed.find((x: any) => x.capacity >= combinerNeeded) || combinersParsed[combinersParsed.length - 1];
    if (!combinerMatch) return json({ error: "مفيش لوحات تجميع منشورة في الكتالوج." }, 500);

    // ── الكابلات: نختار مقطع 6mm فوق 100 كيلوواط و4mm تحتها (نفس عتبة النقل) ──
    const cableTag = calcKW >= 100 ? "6MM" : "4MM";
    const { data: cablesRaw } = await admin.from("products").select("*").eq("category", "cables").eq("published", true);
    const cable = (cablesRaw || []).find((r: any) => (r.name_ar || "").toUpperCase().includes(cableTag)) || (cablesRaw || [])[0];
    if (!cable) return json({ error: "مفيش كابلات منشورة في الكتالوج." }, 500);
    const cableLowMult = Number(D.cable_low_multiplier) || 45;
    const cableHighMult = Number(D.cable_high_multiplier) || 90;
    const cableRaw = calcKW >= 100 ? cableHighMult * arrays : cableLowMult * arrays;
    const roundedHundreds = Math.round(cableRaw / 100) * 100;
    const hundredsUnit = roundedHundreds / 100;
    const evenUnit = hundredsUnit % 2 === 0 ? hundredsUnit : hundredsUnit > 0 ? hundredsUnit + 1 : hundredsUnit - 1;
    const cablesLen = Math.max(100, evenUnit * 100);

    // ── وصلات MC4 (أحادي — وصلة لكل طرف سلسلة) ──
    const { data: mc4Raw } = await admin.from("products").select("*").eq("category", "accessories").eq("published", true);
    const mc4 = (mc4Raw || []).find((r: any) => (r.name_ar || "").includes("أحادي") && (r.name_ar || "").includes("MC4"));
    if (!mc4) return json({ error: "مفيش وصلات MC4 منشورة في الكتالوج." }, 500);
    const mc4Qty = arrays * 2; // طرفين لكل سلسلة (موجب وسالب)

    // ── الشاسيه: كيت بعدد ألواح ثابت، حسب نوع التثبيت المطلوب ──
    const { data: structuresRaw } = await admin.from("products").select("*").eq("category", "structures").eq("published", true);
    const mountKeyword = structureMount === "rotational" ? "متحرك" : "ثابت";
    const structuresParsed = (structuresRaw || [])
      .filter((r: any) => (r.name_ar || "").includes(mountKeyword))
      .map((r: any) => ({ row: r, capacity: extractNumberBefore(r.name_ar || "", /(\d+)\s*لوح/) }))
      .filter((x: any) => x.capacity != null)
      .sort((a: any, b: any) => b.capacity - a.capacity); // الأكبر سعة الأول (كيتات أقل = أوفر غالبًا)
    const structureMatch = structuresParsed[0];
    if (!structureMatch) return json({ error: `مفيش شاسيهات "${mountKeyword}" منشورة في الكتالوج.` }, 500);
    const structureKits = Math.ceil(totalPanels / structureMatch.capacity);

    // ── بنود من غير منتج حقيقي — من irrigation_bom_settings ──
    const concreteQty = Math.round((arrays * 8) / 3.5);
    const concreteUnit = Number(D.concrete_per_unit) || 0;
    const earthQty = Math.max(1, Math.round(calcKW / 40));
    const earthUnit = Number(D.earthing_per_unit) || 0;
    const mechUnit = Number(D.mech_install_per_panel) || 0;
    const elecUnit = Number(D.elec_install_per_panel) || 0;
    const transportQty = Math.max(1, Math.ceil(calcKW / 20));
    const transportUnit = Number(D.transport_per_trip) || 0;
    const transportMin = Number(D.transport_minimum) || 0;
    const transportCost = Math.max(transportQty * transportUnit, transportMin);

    // ── الغطاس (اختياري) ──
    let pump: any = null;
    if (includePump) {
      if (pumpProductId) {
        const { data: p } = await admin.from("products").select("*").eq("id", pumpProductId).eq("published", true).maybeSingle();
        pump = p;
      }
      if (!pump) {
        const { data: candidates } = await admin.from("products").select("*")
          .in("category", ["well_motors", "pumps"]).eq("published", true).eq("in_stock", true)
          .gte("power_hp", hp * 0.9).lte("power_hp", hp * 1.15)
          .order("power_hp", { ascending: true }).limit(1);
        pump = candidates?.[0] || null;
      }
      if (!pump) return json({ error: "مطلوب غطاس ضمن العرض، ومفيش موديل مطابق للقدرة دي في الكتالوج." }, 400);
    }

    // ── تطبيق الخصومات (خصم البيع = سعر العميل، خصم المورد = تكلفة الشركة الداخلية) ──
    async function priced(category: string, brand: string, listPrice: number, qty: number) {
      const d = await getSaleDiscount(admin, category, brand);
      const unitSell = listPrice * (1 - d.sale / 100);
      const unitCost = listPrice * (1 - d.supplier / 100);
      return { qty, unitSell, unitCost, sell: unitSell * qty, cost: unitCost * qty, listPrice };
    }

    const panelP = await priced("panels", panel.brand, Number(panel.price) || 0, totalPanels);
    const invP = await priced("inverters", inverter.brand, Number(inverter.price) || 0, 1);
    const combP = await priced("combiners", combinerMatch.row.brand, Number(combinerMatch.row.price) || 0, 1);
    const cableP = await priced("cables", cable.brand, Number(cable.price) || 0, cablesLen);
    const mc4P = await priced("accessories", mc4.brand, Number(mc4.price) || 0, mc4Qty);
    const structP = await priced("structures", structureMatch.row.brand, Number(structureMatch.row.price) || 0, structureKits);
    // بنود من غير منتج/ماركة: تُباع بنفس السعر (مفيش خصم بيع ولا هامش)
    const concreteP = { qty: concreteQty, unitSell: concreteUnit, unitCost: concreteUnit, sell: concreteUnit * concreteQty, cost: concreteUnit * concreteQty };
    const earthP = { qty: earthQty, unitSell: earthUnit, unitCost: earthUnit, sell: earthUnit * earthQty, cost: earthUnit * earthQty };
    const mechP = { qty: totalPanels, unitSell: mechUnit, unitCost: mechUnit, sell: mechUnit * totalPanels, cost: mechUnit * totalPanels };
    const elecP = { qty: totalPanels, unitSell: elecUnit, unitCost: elecUnit, sell: elecUnit * totalPanels, cost: elecUnit * totalPanels };
    const transportP = { qty: transportQty, unitSell: transportUnit, unitCost: transportUnit, sell: transportCost, cost: transportCost };
    const pumpP = pump ? await priced(pump.category, pump.brand, Number(pump.price) || 0, 1) : null;

    // ── تجميع البنود حسب نوع العرض ──
    type Item = { key: string; label: string; type: string; qty: string; warranty: string; sell: number; cost: number };
    const items: Item[] = [];
    const push = (key: string, label: string, type: string, qty: string, warranty: string, p: { sell: number; cost: number }) =>
      items.push({ key, label, type, qty, warranty, sell: p.sell, cost: p.cost });

    push("panel", "ألواح الطاقة الشمسية", `${panel.brand} ${panelWatt}W أو ما يعادلها`, `#${totalPanels}#`, panel.warranty_notes || "12 سنة صناعة / 30 سنة كفاءة", panelP);
    push("inverter", "الانفرتر", `${inverter.brand} ${inverter.power_kw} KW أو ما يعادلها`, "#1#", "سنة واحدة", invP);
    push("combiner", combinerMatch.row.name_ar, "-", "#1#", "سنة واحدة", combP);
    push("cables", "الكابلات - DC", `${cable.brand} ${cableTag}`, `${cablesLen} متر تقريبي`, "سنة واحدة", cableP);
    push("mc4", "وصلات MC4", mc4.brand || "-", `#${mc4Qty}#`, "---", mc4P);

    if (supplyType === "supply_install") {
      push("structure", `الشاسيه/الحوامل (${structureMount === "rotational" ? "متحرك" : "ثابت"})`, structureMatch.row.name_ar, `#${structureKits}#`, "عشر سنوات", structP);
      push("concrete", "الخرسانة", "مصبوبة في الموقع", "مطابق للمخطط", "---", concreteP);
      push("earth", "التأريض (بئر أرضي)", "-", `#${earthQty}#`, "سنة واحدة", earthP);
      push("install_mech", "الأعمال الميدانية وتثبيت الألواح", "-", `#${totalPanels}#`, "سنة واحدة", mechP);
      push("install_elec", "التركيبات والتوصيلات الكهربائية", "-", `#${totalPanels}#`, "سنة واحدة", elecP);
      push("transport", "النقل", "-", `#${transportQty}#`, "---", transportP);
    }

    if (pump && pumpP) {
      push("pump", "الغطاس", `${pump.brand} ${pump.name_ar}`, "#1#", pump.warranty_notes || "سنة واحدة", pumpP);
    }

    const sellTotal = items.reduce((s, it) => s + it.sell, 0);
    const costTotal = items.reduce((s, it) => s + it.cost, 0);
    const vatAmount = sellTotal * vat;
    const finalTotal = Math.round(sellTotal + vatAmount);
    const profit = Math.round(sellTotal - costTotal);

    const result = {
      specs: {
        panelsPerString, arrays, totalPanels, calcKW: Math.round(calcKW * 10) / 10,
        Iimp: Math.round(Iimp), Vimp: Math.round(Vimp), Voc: Math.round(Voc), Isc: Math.round(Isc),
        inverterModel: `${inverter.brand} ${inverter.power_kw} KW`, inverterWarning,
        sarPerKW: calcKW > 0 ? Math.round(finalTotal / calcKW) : 0,
      },
      items: items.map((it) => ({ key: it.key, label: it.label, type: it.type, qty: it.qty, warranty: it.warranty, sell: Math.round(it.sell) })),
      sellTotal: Math.round(sellTotal), vatAmount: Math.round(vatAmount), finalTotal,
      supplyType, includePump: !!pump,
    };

    if (action === "quote") return json(result);

    // ── action === "save": حفظ العميل + العرض + التكلفة الداخلية ──
    const customerName = String(body.customer_name || "").trim();
    const customerPhone = String(body.customer_phone || "").trim();
    if (!customerName || !customerPhone) return json({ error: "اسم العميل ورقم الهاتف مطلوبين للحفظ." }, 400);

    let customerId: number | null = null;
    const { data: existing } = await admin.from("customers").select("id").eq("phone", customerPhone).maybeSingle();
    if (existing) {
      customerId = existing.id;
    } else {
      const { data: created, error: custErr } = await admin.from("customers")
        .insert({ name: customerName, phone: customerPhone, assigned_rep_id: repId, lead_source: "solar_pump_station" })
        .select("id").single();
      if (custErr) return json({ error: "تعذر حفظ بيانات العميل: " + custErr.message }, 500);
      customerId = created.id;
    }

    const { data: savedQuote, error: quoteErr } = await admin.from("quotes")
      .insert({
        customer_id: customerId, rep_id: repId, quote_type: "solar_pump_station",
        items: result.items, subtotal: result.sellTotal, installation_cost: 0,
        total: result.finalTotal, currency: "EGP",
        notes: `HP:${hp} | ${supplyType} | غطاس:${result.includePump ? "نعم" : "لا"}`,
      })
      .select("id").single();
    if (quoteErr) return json({ error: "تعذر حفظ العرض: " + quoteErr.message }, 500);

    await admin.from("quote_costs").insert({ quote_id: savedQuote.id, total_cost: Math.round(costTotal), profit });

    return json({ ...result, quote_id: savedQuote.id, customer_id: customerId });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
