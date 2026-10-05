import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
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

function extractNumberBefore(text: string, marker: RegExp): number | null {
  const m = text.match(marker);
  return m ? parseFloat(m[1]) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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
    const includedItemKeys: string[] = Array.isArray(body.included_item_keys) ? body.included_item_keys.map(String) : [];
    const includePump = !!body.include_pump;
    const pumpProductId = body.pump_product_id ? String(body.pump_product_id) : null;
    const structureMount = body.structure_mount === "rotational" ? "rotational" : "fixed";
    const inverterBrand = body.inverter_brand ? String(body.inverter_brand).trim() : "";
    const panelsPerStringAdjustOverride = body.panels_per_string_adjust != null ? Number(body.panels_per_string_adjust) : null;
    const stringsAdjustOverride = body.strings_adjust != null ? Number(body.strings_adjust) : null;
    const inverterPowerIncreaseOverride = body.inverter_power_increase != null ? Number(body.inverter_power_increase) : null;

    if (!hp || hp <= 0) return json({ error: "قدرة الغطاس (HP) مطلوبة وأكبر من صفر." }, 400);
    if (!panelProductId) return json({ error: "لازم تختار نوع اللوح الشمسي." }, 400);

    const { data: D } = await admin.from("irrigation_bom_settings").select("*").eq("id", 1).single();
    if (!D) return json({ error: "إعدادات الحساب مش موجودة (irrigation_bom_settings)." }, 500);

    const { data: panel } = await admin.from("products").select("*").eq("id", panelProductId).eq("category", "panels").eq("published", true).maybeSingle();
    if (!panel) return json({ error: "اللوح المختار مش موجود أو مش منشور." }, 400);
    if (!panel.vimp || !panel.power_watt) {
      return json({ error: `اللوح "${panel.name_ar}" ناقصه مواصفات كهربية (Vimp) في الكتالوج — لازم يتسجل الأول.` }, 400);
    }

    const maxStringV = Number(D.max_string_voltage) || 720;
    const panelsPerStringAdjust = panelsPerStringAdjustOverride ?? (Number(D.panels_per_string_adjust) || 0);
    const stringsAdjust = stringsAdjustOverride ?? (Number(D.strings_adjust) || 0);
    const hpCapacityRatio = Number(D.hp_capacity_ratio) || 1;
    const inverterPowerIncrease = inverterPowerIncreaseOverride ?? (Number(D.inverter_power_increase) || 0);
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

    const inverterKwNeeded = Math.ceil(hp * 0.746) + inverterPowerIncrease;
    let invQuery = admin.from("products").select("*").eq("category", "inverters").eq("published", true);
    if (inverterBrand) invQuery = invQuery.eq("brand", inverterBrand);
    const { data: invertersBrandFiltered } = await invQuery.order("power_kw", { ascending: true });
    let inverters = invertersBrandFiltered;
    let inverterBrandFallback = false;
    if (inverterBrand && (!inverters || inverters.length === 0)) {
      const { data: allInv } = await admin.from("products").select("*").eq("category", "inverters").eq("published", true).order("power_kw", { ascending: true });
      inverters = allInv;
      inverterBrandFallback = true;
    }
    let inverter = (inverters || []).find((r: any) => Number(r.power_kw) >= inverterKwNeeded) || (inverters || [])[(inverters || []).length - 1];
    if (!inverter) return json({ error: "مفيش إنفرترات منشورة في الكتالوج." }, 500);
    const inverterWarnings: string[] = [];
    if (inverterBrandFallback) {
      inverterWarnings.push(`⚠️ مفيش إنفرتر من "${inverterBrand}" منشور — تم اختيار الأنسب من شركة تانية (${inverter.brand}).`);
    }
    if (Number(inverter.power_kw) < inverterKwNeeded) {
      inverterWarnings.push(`⚠️ أعلى إنفرتر متاح (${inverter.power_kw} KW) أقل من القدرة المطلوبة (${inverterKwNeeded} KW) — راجع الكتالوج.`);
    }
    if (inverter.max_solar_input_kw != null && calcKW > Number(inverter.max_solar_input_kw)) {
      const bigger = (inverters || []).find((r: any) => Number(r.power_kw) > Number(inverter.power_kw) && (r.max_solar_input_kw == null || calcKW <= Number(r.max_solar_input_kw)));
      inverterWarnings.push(
        bigger
          ? `⚠️ قدرة الألواح (${calcKW.toFixed(1)} KW) أكبر مما يتحمله إنفرتر ${inverter.power_kw} KW (حده الأقصى ${inverter.max_solar_input_kw} KW) — الأنسب ${bigger.power_kw} KW.`
          : `⚠️ قدرة الألواح (${calcKW.toFixed(1)} KW) أكبر مما يتحمله إنفرتر ${inverter.power_kw} KW ولا يوجد طراز أعلى — راجع الإعداد يدويًا.`
      );
    }
    const inverterWarning: string | null = inverterWarnings.length ? inverterWarnings.join(" | ") : null;

    const combinerNeeded = Math.ceil(arrays * combinerHeadroom);
    const { data: combinersRaw } = await admin.from("products").select("*").eq("category", "combiners").eq("published", true);
    const combinersParsed = (combinersRaw || [])
      .map((r: any) => ({ row: r, capacity: extractNumberBefore(r.name_ar || "", /(\d+)\s*Arrays/i) }))
      .filter((x: any) => x.capacity != null)
      .sort((a: any, b: any) => a.capacity - b.capacity);
    const combinerMatch = combinersParsed.find((x: any) => x.capacity >= combinerNeeded) || combinersParsed[combinersParsed.length - 1];
    if (!combinerMatch) return json({ error: "مفيش لوحات تجميع منشورة في الكتالوج." }, 500);

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

    const { data: mc4Raw } = await admin.from("products").select("*").eq("category", "accessories").eq("published", true);
    const mc4 = (mc4Raw || []).find((r: any) => (r.name_ar || "").includes("أحادي") && (r.name_ar || "").includes("MC4"));
    if (!mc4) return json({ error: "مفيش وصلات MC4 منشورة في الكتالوج." }, 500);
    const mc4Qty = arrays * 2;

    const { data: structuresRaw } = await admin.from("products").select("*").eq("category", "structures").eq("published", true);
    const mountKeyword = structureMount === "rotational" ? "متحرك" : "ثابت";
    const structuresParsed = (structuresRaw || [])
      .filter((r: any) => (r.name_ar || "").includes(mountKeyword))
      .map((r: any) => ({ row: r, capacity: extractNumberBefore(r.name_ar || "", /(\d+)\s*لوح/) }))
      .filter((x: any) => x.capacity != null)
      .sort((a: any, b: any) => b.capacity - a.capacity);
    const structureMatch = structuresParsed[0];
    if (!structureMatch) return json({ error: `مفيش شاسيهات "${mountKeyword}" منشورة في الكتالوج.` }, 500);
    const structureKits = Math.ceil(totalPanels / structureMatch.capacity);

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

    async function priced(category: string, brand: string, listPrice: number, qty: number) {
      const d = await getSaleDiscount(admin, category, brand);
      const unitSell = listPrice * (1 - d.sale / 100);
      const unitCost = listPrice * (1 - d.supplier / 100);
      return { qty, unitSell, unitCost, sell: unitSell * qty, cost: unitCost * qty, listPrice };
    }

    const panelPricePerWatt = Number(panel.price) || 0;
    const panelUnitPrice = panelPricePerWatt * panelWatt;
    const panelP = await priced("panels", panel.brand, panelUnitPrice, totalPanels);
    const invP = await priced("inverters", inverter.brand, Number(inverter.price) || 0, 1);
    const combP = await priced("combiners", combinerMatch.row.brand, Number(combinerMatch.row.price) || 0, 1);
    const cableP = await priced("cables", cable.brand, Number(cable.price) || 0, cablesLen);
    const mc4P = await priced("accessories", mc4.brand, Number(mc4.price) || 0, mc4Qty);
    const structP = await priced("structures", structureMatch.row.brand, Number(structureMatch.row.price) || 0, structureKits);
    const concreteP = { qty: concreteQty, unitSell: concreteUnit, unitCost: concreteUnit, sell: concreteUnit * concreteQty, cost: concreteUnit * concreteQty };
    const earthP = { qty: earthQty, unitSell: earthUnit, unitCost: earthUnit, sell: earthUnit * earthQty, cost: earthUnit * earthQty };
    const mechP = { qty: totalPanels, unitSell: mechUnit, unitCost: mechUnit, sell: mechUnit * totalPanels, cost: mechUnit * totalPanels };
    const elecP = { qty: totalPanels, unitSell: elecUnit, unitCost: elecUnit, sell: elecUnit * totalPanels, cost: elecUnit * totalPanels };
    const transportP = { qty: transportQty, unitSell: transportUnit, unitCost: transportUnit, sell: transportCost, cost: transportCost };
    const pumpP = pump ? await priced(pump.category, pump.brand, Number(pump.price) || 0, 1) : null;

    type Item = { key: string; label: string; type: string; qty: string; warranty: string; sell: number; cost: number };
    const mandatoryItems: Item[] = [];
    const optionalItems: Item[] = [];
    const push = (arr: Item[], key: string, label: string, type: string, qty: string, warranty: string, p: { sell: number; cost: number }) =>
      arr.push({ key, label, type, qty, warranty, sell: p.sell, cost: p.cost });

    push(mandatoryItems, "panel", "ألواح الطاقة الشمسية", `${panel.brand} ${panelWatt}W أو ما يعادلها`, `#${totalPanels}#`, panel.warranty_notes || "12 سنة صناعة / 30 سنة كفاءة", panelP);

    push(optionalItems, "inverter", "الانفرتر", `${inverter.brand} ${inverter.power_kw} KW أو ما يعادلها`, "#1#", "سنة واحدة", invP);
    push(optionalItems, "combiner", combinerMatch.row.name_ar, "-", "#1#", "سنة واحدة", combP);
    push(optionalItems, "cables", "الكابلات - DC", `${cable.brand} ${cableTag}`, `#${cablesLen}# متر تقريبي`, "سنة واحدة", cableP);
    push(optionalItems, "mc4", "وصلات MC4", mc4.brand || "-", `#${mc4Qty}#`, "---", mc4P);
    push(optionalItems, "structure", `الشاسيه/الحوامل (${structureMount === "rotational" ? "متحرك" : "ثابت"})`, structureMatch.row.name_ar, `#${structureKits}#`, "عشر سنوات", structP);
    push(optionalItems, "concrete", "الخرسانة", "مصبوبة في الموقع", "مطابق للمخطط", "---", concreteP);
    push(optionalItems, "earth", "التأريض (بئر أرضي)", "-", `#${earthQty}#`, "سنة واحدة", earthP);
    push(optionalItems, "install_mech", "الأعمال الميدانية وتثبيت الألواح", "-", `#${totalPanels}#`, "سنة واحدة", mechP);
    push(optionalItems, "install_elec", "التركيبات والتوصيلات الكهربائية", "-", `#${totalPanels}#`, "سنة واحدة", elecP);
    push(optionalItems, "transport", "النقل", "-", `#${transportQty}#`, "---", transportP);

    if (pump && pumpP) {
      push(mandatoryItems, "pump", "الغطاس", `${pump.brand} ${pump.name_ar}`, "#1#", pump.warranty_notes || "سنة واحدة", pumpP);
    }

    const mandatorySell = mandatoryItems.reduce((s, it) => s + it.sell, 0);
    const mandatoryCost = mandatoryItems.reduce((s, it) => s + it.cost, 0);
    const optionalSell = optionalItems.reduce((s, it) => s + it.sell, 0);
    const optionalCost = optionalItems.reduce((s, it) => s + it.cost, 0);

    const supplyOnlyFinal = Math.round(mandatorySell * (1 + vat));
    const supplyInstallFinal = Math.round((mandatorySell + optionalSell) * (1 + vat));

    const selectedOptionalItems = optionalItems.filter((it) => includedItemKeys.includes(it.key));
    const selectedItems = [...mandatoryItems, ...selectedOptionalItems];
    const selectedOptionalSell = selectedOptionalItems.reduce((s, it) => s + it.sell, 0);
    const selectedOptionalCost = selectedOptionalItems.reduce((s, it) => s + it.cost, 0);
    const sellTotal = mandatorySell + selectedOptionalSell;
    const costTotal = mandatoryCost + selectedOptionalCost;
    const vatAmount = sellTotal * vat;
    const finalTotal = Math.round(sellTotal * (1 + vat));
    const profit = Math.round(sellTotal - costTotal);

    const result = {
      specs: {
        panelsPerString, arrays, totalPanels, calcKW: Math.round(calcKW * 10) / 10,
        Iimp: Math.round(Iimp), Vimp: Math.round(Vimp), Voc: Math.round(Voc), Isc: Math.round(Isc),
        inverterModel: `${inverter.brand} ${inverter.power_kw} KW`, inverterWarning,
        sarPerKW: calcKW > 0 ? Math.round(finalTotal / calcKW) : 0,
      },
      baseItems: mandatoryItems.map((it) => ({ key: it.key, label: it.label, type: it.type, qty: it.qty, warranty: it.warranty, sell: Math.round(it.sell) })),
      installOnlyItems: optionalItems.map((it) => ({ key: it.key, label: it.label, type: it.type, qty: it.qty, warranty: it.warranty, sell: Math.round(it.sell) })),
      items: selectedItems.map((it) => ({ key: it.key, label: it.label, type: it.type, qty: it.qty, warranty: it.warranty, sell: Math.round(it.sell) })),
      supplyOnlyTotal: Math.round(supplyOnlyFinal), supplyInstallTotal: Math.round(supplyInstallFinal),
      includedItemKeys,
      sellTotal: Math.round(sellTotal), vatAmount: Math.round(vatAmount), finalTotal,
      includePump: !!pump,
    };

    if (action === "quote") return json(result);

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

    const quoteTypeValue = selectedOptionalItems.length > 0 ? "supply_install" : "supply_only";
    const { data: savedQuote, error: quoteErr } = await admin.from("quotes")
      .insert({
        customer_id: customerId, rep_id: repId, quote_type: quoteTypeValue,
        items: result.items, subtotal: result.sellTotal, installation_cost: 0,
        total: result.finalTotal, currency: "EGP",
        notes: `HP:${hp} | بنود مضافة: ${includedItemKeys.join(",") || "بدون"} | غطاس:${result.includePump ? "نعم" : "لا"}`,
      })
      .select("id").single();
    if (quoteErr) return json({ error: "تعذر حفظ العرض: " + quoteErr.message }, 500);

    await admin.from("quote_costs").insert({ quote_id: savedQuote.id, total_cost: Math.round(costTotal), profit });

    return json({ ...result, quote_id: savedQuote.id, customer_id: customerId });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
