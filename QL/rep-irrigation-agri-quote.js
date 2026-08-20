/* ============================================================
   rep-irrigation-agri-quote.js
   حاسبة الري الزراعي: منظومة توليد كهرباء بالطاقة الشمسية لتشغيل
   مضخات الري (إنفرتر ضخ + ألواح + كابلات + مكونات المنظومة).
   محرك هندسي حقيقي (سلاسل/توازي) لما تتوفر بيانات Voc/MPPT للإنفرتر
   والألواح، مع fallback بموازنة القدرة لو البيانات ناقصة.
   الحفظ عبر rep_create_offgrid_quote() (نفس منطق حساب التكلفة/الربح
   من السيرفر — التسمية قديمة بس البنية عامة وتصلح لأي نوع عرض).
   ============================================================ */

const COMPANY_WHATSAPP = "201200074344";

let client = null;
let bomSettings = null;
let quoteRows = [];
let currentPreset = "materials_only";
let lastCalc = null;

function $(sel) { return document.querySelector(sel); }
function fmt(n) { return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 }); }
function fmt2(n) { return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 1 }); }

function showMsg(el, text, kind) {
  if (!el) return;
  el.textContent = text || "";
  el.style.color = kind === "error" ? "#b23b23" : kind === "ok" ? "var(--forest)" : "var(--muted)";
}

async function initClient() {
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) await new Promise((r) => setTimeout(r, 50));
  client = window.getAlaslSupabase ? window.getAlaslSupabase() : null;
  return client;
}

async function checkRepStatus(userId) {
  const { data, error } = await client.from("reps").select("id, display_name, active").eq("id", userId).maybeSingle();
  if (error || !data || !data.active) return null;
  return data;
}

async function updateAuthState(session) {
  const authPanel = $("[data-auth-panel]");
  const repPanel = $("[data-rep-panel]");
  const userName = $("[data-user-name]");
  if (!session) { authPanel.hidden = false; repPanel.hidden = true; return; }
  const rep = await checkRepStatus(session.user.id);
  if (!rep) { authPanel.hidden = false; repPanel.hidden = true; return; }
  authPanel.hidden = true;
  repPanel.hidden = false;
  userName.textContent = rep.display_name;
  await loadPanelBrands();
}

async function loadPanelBrands() {
  const { data: bom } = await client.from("offgrid_bom_settings").select("*").eq("id", 1).maybeSingle();
  bomSettings = bom;
  const { data } = await client.from("products").select("brand").eq("category", "panels").eq("published", true);
  const brands = [...new Set((data || []).map((r) => r.brand).filter(Boolean))].sort();
  $("#panelBrandSelect").innerHTML = brands.length
    ? brands.map((b) => `<option value="${b}">${b}</option>`).join("")
    : `<option value="">لا يوجد</option>`;
}

/* ---------------- المحرك الهندسي ---------------- */

function matchStrings(inv, panel, targetWatts) {
  const panelWatt = Number(panel.power_watt) || 0;
  if (!panelWatt) return null;
  const O2min = Math.max(Math.ceil(targetWatts / panelWatt), 1);

  if (inv.pv_voc_max && panel.voc && panel.vimp) {
    const maxPanelsPerString = Math.max(Math.floor(Number(inv.pv_voc_max) / Number(panel.voc)), 1);
    const impliedMpptMin = Number(inv.pv_mppt_min) || 0;
    const minPanelsPerString = impliedMpptMin ? Math.max(1, Math.ceil(impliedMpptMin / Number(panel.vimp))) : 1;
    let best = null;
    for (let pps = minPanelsPerString; pps <= maxPanelsPerString; pps++) {
      const strings = Math.max(Math.ceil(O2min / pps), 1);
      const total = pps * strings;
      const vimpTotal = pps * Number(panel.vimp);
      const inMppt = !inv.pv_mppt_max || vimpTotal <= Number(inv.pv_mppt_max);
      const candidate = { panelsPerString: pps, stringCount: strings, total, inMppt };
      if (!best || candidate.total < best.total || (candidate.total === best.total && candidate.inMppt && !best.inMppt)) best = candidate;
    }
    if (best) {
      return { panelCount: best.total, panelsPerString: best.panelsPerString, stringCount: best.stringCount, engineered: true };
    }
  }
  return { panelCount: O2min, panelsPerString: null, stringCount: null, engineered: false };
}

async function runCalc() {
  const msgEl = $("[data-calc-message]");
  const hp = parseFloat($("#hpInput").value);
  const panelBrand = $("#panelBrandSelect").value;
  const iscSafetyPct = parseFloat($("#iscSafetyPct").value) || 0;
  const oversizePct = parseFloat($("#oversizePct").value) || 0;
  if (!hp || hp <= 0) { showMsg(msgEl, "اكتب قدرة صحيحة بالحصان.", "error"); return; }
  if (!panelBrand) { showMsg(msgEl, "مفيش ماركة ألواح متاحة.", "error"); return; }

  showMsg(msgEl, "جاري البحث في الكتالوج...", "");

  const { data: invs, error: invErr } = await client.from("products")
    .select("id,brand,name_ar,price,power_kw,pv_voc_max,pv_mppt_min,pv_mppt_max,reactor_rating_a,breaker_rating_a")
    .eq("category", "inverters").eq("published", true).eq("in_stock", true)
    .not("price", "is", null).gt("price", 0).not("power_kw", "is", null);
  if (invErr || !invs || !invs.length) { showMsg(msgEl, "تعذر تحميل إنفرترات الضخ الشمسي.", "error"); return; }

  const { data: panels, error: panelErr } = await client.from("products")
    .select("id,brand,name_ar,price,power_watt,voc,vimp,isc,iimp")
    .eq("category", "panels").eq("published", true).eq("brand", panelBrand)
    .not("price", "is", null).gt("price", 0).limit(1);
  if (panelErr || !panels || !panels.length) { showMsg(msgEl, "مفيش لوح متاح للماركة دي.", "error"); return; }
  const panel = panels[0];
  if (!panel.power_watt) { showMsg(msgEl, "بيانات قدرة اللوح ناقصة.", "error"); return; }

  const requiredKW = hp * 0.746;
  const sortedByKw = [...invs].sort((a, b) => Number(a.power_kw) - Number(b.power_kw));
  const single = sortedByKw.find((r) => Number(r.power_kw) >= requiredKW);
  let inverter, unitsNeeded;
  if (single) { inverter = single; unitsNeeded = 1; }
  else {
    inverter = sortedByKw[sortedByKw.length - 1];
    unitsNeeded = Math.max(Math.ceil(requiredKW / Number(inverter.power_kw)), 1);
  }

  const totalInverterKW = Number(inverter.power_kw) * unitsNeeded;
  const targetWatts = totalInverterKW * 1000 * (1 + oversizePct / 100);
  const match = matchStrings(inverter, panel, targetWatts);
  if (!match) { showMsg(msgEl, "بيانات اللوح ناقصة (القدرة بالوات).", "error"); return; }

  const panelCount = match.panelCount;
  const stringCount = match.stringCount || null;
  const panelsPerString = match.panelsPerString || null;
  const actualPowerKW = (panelCount * Number(panel.power_watt)) / 1000;

  const totalVimp = panelsPerString ? panelsPerString * Number(panel.vimp) : null;
  const totalVoc = panelsPerString ? panelsPerString * Number(panel.voc) : null;
  const totalIimp = stringCount && panel.iimp ? stringCount * Number(panel.iimp) : null;
  const totalIsc = stringCount && panel.isc ? stringCount * Number(panel.isc) * (1 + iscSafetyPct / 100) : null;

  const steelQty = Math.max(Math.ceil(panelCount / 2), 1);
  const cablesQty = steelQty * (bomSettings?.cable_meters_per_steel_unit ?? 20);

  lastCalc = {
    hp, inverter, unitsNeeded, panel, panelCount, stringCount, panelsPerString,
    actualPowerKW, totalVimp, totalVoc, totalIimp, totalIsc, steelQty, cablesQty,
    engineered: match.engineered,
  };

  $("[data-eng-warning]").hidden = match.engineered;
  $("#sumInverter").textContent = inverter.brand + " " + fmt(inverter.power_kw) + " KW" + (unitsNeeded > 1 ? " × " + unitsNeeded : "");
  $("#sumPowerKw").textContent = fmt2(actualPowerKW);
  $("#sumPanelCount").textContent = fmt(panelCount);
  $("#specStrings").textContent = stringCount ? fmt(stringCount) : "—";
  $("#specPerString").textContent = panelsPerString ? fmt(panelsPerString) : "—";
  $("#specVimp").textContent = totalVimp ? fmt2(totalVimp) + "V" : "—";
  $("#specVoc").textContent = totalVoc ? fmt2(totalVoc) + "V" : "—";
  $("#specIimp").textContent = totalIimp ? fmt2(totalIimp) + "A" : "—";
  $("#specIsc").textContent = totalIsc ? fmt2(totalIsc) + "A" : "—";
  $("#specReactor").textContent = inverter.reactor_rating_a ? fmt(inverter.reactor_rating_a) + "A" : "يُحدَّد من المهندس";
  $("#specBreaker").textContent = inverter.breaker_rating_a ? fmt(inverter.breaker_rating_a) + "A" : "يُحدَّد من المهندس";

  const dateCode = new Date().toISOString().slice(0, 10).split("-").reverse().join("");
  $("#quoteRefCode").textContent = "QL-" + dateCode + "-" + hp + "HP-" + inverter.brand + fmt(inverter.power_kw) + "KW-" + panel.brand + fmt(panel.power_watt) + "W";

  showMsg(msgEl, "تم الحساب. اختار نوع العرض تحت.", "ok");
  $("[data-quote-content]").hidden = false;
  buildPreset(currentPreset);
  $("[data-quote-content]").scrollIntoView({ behavior: "smooth" });
}

/* ---------------- بناء بنود العرض حسب النوع ---------------- */

function buildPreset(preset) {
  currentPreset = preset;
  document.querySelectorAll(".qtype-card").forEach((c) => c.classList.toggle("active", c.dataset.preset === preset));
  if (!lastCalc) return;
  const c = lastCalc;
  const b = bomSettings || {};

  const rows = [
    { label: "ألواح الطاقة الشمسية", type: "panel", productId: c.panel.id, watt: Number(c.panel.power_watt), qty: c.panelCount, unitPrice: Number(c.panel.power_watt) * Number(c.panel.price), discountPct: 0, warranty: "12 سنة ضد عيوب الصناعة / 30 سنة ضد التناقص الإنتاجي عن %80" },
    { label: "الإنفرتر", type: "product", productId: c.inverter.id, qty: c.unitsNeeded, unitPrice: Number(c.inverter.price), discountPct: 0, warranty: "سنة واحدة" },
    { label: "لوحة الحماية IP65", infoOnly: true, warranty: "مُضمَّنة مع الإنفرتر" },
    { label: "لوحة تجميع (Combiner Box)", type: "bom_fixed", bomKey: "combiner_box", qty: c.unitsNeeded, unitPrice: b.combiner_box_customer_fixed || 3500, discountPct: 0, warranty: "سنة واحدة" },
    { label: "الكابلات - DC", type: "bom_fixed", bomKey: "cables", qty: c.cablesQty, unitPrice: b.cables_customer_per_meter || 65, discountPct: 0, warranty: "سنة واحدة", note: "تقريبي — يُحدد نهائيًا عند التوريد" },
    { label: "وصلات MC4", type: "bom_fixed", bomKey: "mc4", qty: c.stringCount || Math.ceil(c.panelCount / 15), unitPrice: b.mc4_customer_per_pair || 45, discountPct: 0, warranty: "---" },
  ];

  if (preset === "supply_install") {
    rows.push({ label: "الشاسيه/الحوامل (ثابت)", type: "bom_fixed", bomKey: "steel", qty: c.steelQty, unitPrice: b.steel_customer_per_unit || 1500, discountPct: 0, warranty: "لا يوجد" });
    rows.push({ label: "التركيب الشامل (خرسانة + أعمال ميدانية + توصيلات كهربائية)", type: "bom_fixed", bomKey: "install", qty: c.steelQty, unitPrice: b.install_customer_per_unit || 0, discountPct: 0, warranty: "لا يوجد" });
    rows.push({ label: "النقل", type: "bom_fixed", bomKey: "transport", qty: 1, unitPrice: b.transport_customer_fixed || 0, discountPct: 0, warranty: "لا يوجد" });
    rows.push({ label: "التأريض (بئر أرضي)", infoOnly: true, warranty: "غير شامل — يُتفق عليه منفصلًا" });
    rows.push({ label: "الريأكتور", infoOnly: true, warranty: "غير شامل — يُتفق عليه منفصلًا" });
  }

  quoteRows = rows;
  renderQuoteTable();
}

function renderQuoteTable() {
  const body = $("#quoteItemsBody");
  body.innerHTML = "";
  quoteRows.forEach((r, idx) => {
    if (r.infoOnly) {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td class=\"bom-label\">" + r.label + "</td><td>—</td><td>لا يوجد</td><td>—</td><td>—</td><td>—</td><td>" + r.warranty + "</td>";
      body.appendChild(tr);
      return;
    }
    const lineTotal = r.qty * r.unitPrice * (1 - r.discountPct / 100);
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td class=\"bom-label\">" + r.label + (r.note ? "<div style=\"font-size:10.5px;color:var(--muted)\">" + r.note + "</div>" : "") + "</td>" +
      "<td></td>" +
      "<td>" + fmt(r.qty) + "</td>" +
      "<td>" + fmt(r.unitPrice) + "</td>" +
      "<td><input type=\"number\" min=\"0\" max=\"100\" value=\"" + r.discountPct + "\" data-discount-idx=\"" + idx + "\"></td>" +
      "<td>" + fmt(lineTotal) + "</td>" +
      "<td style=\"font-size:11px\">" + (r.warranty || "") + "</td>";
    body.appendChild(tr);
  });
  document.querySelectorAll("[data-discount-idx]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = parseInt(e.target.dataset.discountIdx, 10);
      quoteRows[idx].discountPct = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
      renderQuoteTable();
    });
  });
  const grand = quoteRows.filter((r) => !r.infoOnly).reduce((s, r) => s + r.qty * r.unitPrice * (1 - r.discountPct / 100), 0);
  $("#grandTotalDisplay").textContent = fmt(grand);
  if (lastCalc && lastCalc.actualPowerKW) $("#sumPricePerKw").textContent = fmt(grand / lastCalc.actualPowerKW);
}

/* ---------------- الحفظ ---------------- */

async function saveQuote() {
  const msgEl = $("[data-quote-message]");
  const name = $("#custName").value.trim();
  const phone = $("#custPhone").value.trim();
  if (!name || !phone) { showMsg(msgEl, "اسم العميل ورقم التليفون مطلوبين.", "error"); return; }
  if (!quoteRows.length) { showMsg(msgEl, "احسب المنظومة الأول.", "error"); return; }

  const items = quoteRows.map((r) => {
    if (r.infoOnly) return { type: "info_only", label: r.label, warranty: r.warranty };
    if (r.type === "panel") return { type: "panel", product_id: r.productId, watt: r.watt, qty: r.qty, discount_pct: r.discountPct, label: r.label, warranty: r.warranty };
    if (r.type === "product") return { type: "product", product_id: r.productId, qty: r.qty, discount_pct: r.discountPct, label: r.label, warranty: r.warranty };
    return { type: "bom_fixed", key: r.bomKey, qty: r.qty, discount_pct: r.discountPct, label: r.label, warranty: r.warranty };
  });

  showMsg(msgEl, "جاري الحفظ...", "");
  const quoteTypeForDb = currentPreset === "supply_install" ? "supply_install" : "supply_only";

  const { data: quoteId, error } = await client.rpc("rep_create_offgrid_quote", {
    p_customer_name: name, p_customer_phone: phone, p_customer_city: null,
    p_quote_type: quoteTypeForDb, p_items: items, p_notes: "حاسبة الري الزراعي — " + ($("#quoteRefCode").textContent || ""),
  });

  if (error) { showMsg(msgEl, "خطأ أثناء الحفظ: " + error.message, "error"); return; }

  const { data: saved } = await client.from("quotes").select("id, items, total, created_at").eq("id", quoteId).maybeSingle();
  showMsg(msgEl, "تم حفظ العرض بنجاح.", "ok");

  printQuote({ id: quoteId, customer: { name, phone }, preset: currentPreset, items: saved && saved.items || items, total: saved && saved.total || 0, createdAt: saved && saved.created_at || new Date(), hp: lastCalc ? lastCalc.hp : "" });
}

function printQuote(q) {
  const area = document.getElementById("printArea");
  const dateStr = new Date(q.createdAt).toLocaleDateString("ar-EG");
  const rows = (q.items || []).map((it) =>
    "<tr><td>" + it.label + "</td><td>" + (it.qty != null ? it.qty : "لا يوجد") + "</td><td>" + (it.info_only ? "—" : fmt(it.unit_price)) + "</td><td>" + (it.info_only ? "—" : (it.discount_pct || 0) + "%") + "</td><td>" + (it.info_only ? "—" : fmt(it.line_total)) + "</td><td style=\"font-size:11px\">" + (it.warranty || "") + "</td></tr>"
  ).join("");
  area.innerHTML =
    "<div class=\"print-header\"><img src=\"../logo.png\" alt=\"الأصل للطاقة الشمسية\">" +
    "<div style=\"text-align:left;\"><div class=\"print-title\">عرض سعر — حاسبة الري الزراعي</div><div>#" + q.id + " — " + dateStr + "</div></div></div>" +
    "<div style=\"margin-bottom:12px; font-size:13px;\"><div><strong>العميل:</strong> " + q.customer.name + " — " + q.customer.phone + "</div>" +
    "<div>نتشرف بتقديم عرض سعر منظومة توليد الكهرباء من خلال الطاقة الشمسية لتشغيل محرك غاطس " + (q.hp || "") + " حصان.</div></div>" +
    "<table class=\"print-table\"><thead><tr><th>البند</th><th>الكمية</th><th>سعر الوحدة</th><th>خصم</th><th>الإجمالي</th><th>الضمان</th></tr></thead><tbody>" + rows + "</tbody></table>" +
    "<div class=\"print-totals\"><div class=\"row grand\"><span>الإجمالي الكلي</span><span>" + fmt(q.total) + " ج.م</span></div></div>" +
    "<div class=\"print-terms\">• يقع على عاتق العميل تجهيز الموقع (أعمال الحفر والصب اللازمة) قبل موعد التوريد.<br>" +
    "• الارتباط بهذا السعر لمدة ثلاثة أيام فقط من تاريخ العرض.<br>• هذا العرض قابل للتغيير حسب الأسعار وقت التعاقد.</div>" +
    "<div class=\"print-footer\">الأصل للطاقة الشمسية — alaslsolar.com</div>";
  setTimeout(() => window.print(), 100);
}

/* ---------------- واتساب ---------------- */

function buildWhatsAppSummary() {
  const grand = $("#grandTotalDisplay").textContent;
  const name = $("#custName").value.trim();
  const hp = $("#hpInput").value;
  return encodeURIComponent(
    "عرض سعر حاسبة الري الزراعي\nالعميل: " + name + "\nالقدرة: " + hp + " حصان\nنوع العرض: " +
    (currentPreset === "supply_install" ? "توريد وتركيب" : "توريد خامات فقط") +
    "\nالإجمالي: " + grand + " ج.م\nمرجع العرض: " + $("#quoteRefCode").textContent
  );
}

function sendToCustomer() {
  const phone = $("#custPhone").value.trim().replace(/^0/, "20").replace(/\D/g, "");
  if (!phone) { showMsg($("[data-quote-message]"), "اكتب رقم تليفون العميل الأول.", "error"); return; }
  window.open("https://wa.me/" + phone + "?text=" + buildWhatsAppSummary(), "_blank");
}

function notifyCompany() {
  window.open("https://wa.me/" + COMPANY_WHATSAPP + "?text=" + buildWhatsAppSummary(), "_blank");
}

/* ---------------- ربط الأحداث ---------------- */

document.addEventListener("DOMContentLoaded", async () => {
  await initClient();
  if (!client) return;

  $("#calcBtn") && $("#calcBtn").addEventListener("click", runCalc);
  $("#saveQuoteBtn") && $("#saveQuoteBtn").addEventListener("click", saveQuote);
  $("#sendCustomerBtn") && $("#sendCustomerBtn").addEventListener("click", sendToCustomer);
  $("#notifyCompanyBtn") && $("#notifyCompanyBtn").addEventListener("click", notifyCompany);
  document.querySelectorAll(".qtype-card").forEach((c) => c.addEventListener("click", () => buildPreset(c.dataset.preset)));

  client.auth.onAuthStateChange((_e, session) => updateAuthState(session));
  const { data } = await client.auth.getSession();
  await updateAuthState(data.session);
});
