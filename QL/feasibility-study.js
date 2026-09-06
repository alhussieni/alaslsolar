/* ============================================================
   feasibility-study.js — دراسة جدوى (ROI) لعروض المناديب.
   حساب افتراضي بالكامل جوّه المتصفح (مفيش سيرفر) — الأرقام هنا
   كلها فروض بيدخلها المندوب نفسه، ومفيش هامش ربح داخلي محتاج
   إخفاء زي عرض الأسعار العادي، فمفيش داعي لـ Edge Function.
   ============================================================ */

let client = null;
let currentSession = null;
let lastCalc = null; // { years, dieselCF[], gridCF[], dieselCumulative[], gridCumulative[], ... }
let quoteIdFromUrl = null;

function $(sel) { return document.querySelector(sel); }
function fmt(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
function fmt1(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 1 }); }

async function initClient() {
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  client = window.getAlaslSupabase ? window.getAlaslSupabase() : null;
  return client;
}

/* ---------------- المصادقة (نفس نمط باقي صفحات المندوب) ---------------- */

async function checkRepStatus(userId) {
  const { data, error } = await client.from("reps").select("id, display_name, active").eq("id", userId).maybeSingle();
  if (error || !data || !data.active) return null;
  return data;
}

async function updateAuthState(session) {
  currentSession = session;
  const authPanel = $("[data-auth-panel]");
  const repPanel = $("[data-rep-panel]");
  const logoutBtn = $("[data-logout]");
  const userName = $("[data-user-name]");
  const authMsg = $("[data-auth-message]");

  if (!session) {
    authPanel.hidden = false; repPanel.hidden = true; logoutBtn.hidden = true; userName.textContent = "";
    return;
  }

  const rep = await checkRepStatus(session.user.id);
  if (!rep) {
    authMsg.textContent = "هذا الحساب غير مفعّل كمندوب. تواصل مع الأدمن.";
    authMsg.className = "form-note error";
    await client.auth.signOut();
    authPanel.hidden = false; repPanel.hidden = true; logoutBtn.hidden = true;
    return;
  }

  authPanel.hidden = true; repPanel.hidden = false; logoutBtn.hidden = false;
  userName.textContent = rep.display_name;

  await loadDefaultsAndQuote();
}

async function handleLogin(e) {
  e.preventDefault();
  const msg = $("[data-auth-message]");
  msg.textContent = "جاري الدخول..."; msg.className = "form-note";
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) { msg.textContent = "بيانات الدخول غير صحيحة."; msg.className = "form-note error"; return; }
  await updateAuthState(data.session);
}

async function handleLogout() {
  await client.auth.signOut();
  await updateAuthState(null);
}

/* ---------------- تحميل الإعدادات الافتراضية وبيانات العرض المربوط ---------------- */

async function loadDefaultsAndQuote() {
  // سعري الكهرباء والديزيل الافتراضيين من roi_settings (لوحة التحكم) —
  // المندوب يقدر يعدّلهم هنا لكل دراسة لوحدها من غير ما يأثر على القيمة العامة.
  try {
    const { data } = await client.from("roi_settings").select("*").eq("id", 1).maybeSingle();
    if (data) {
      if (Number(data.electricity_price_per_kwh) > 0) $("#fsElecPrice").value = data.electricity_price_per_kwh;
      if (Number(data.diesel_price_per_liter) > 0) $("#fsDieselPrice").value = data.diesel_price_per_liter;
      if (Number(data.discount_rate_pct) > 0) $("#fsDiscountRate").value = data.discount_rate_pct;
    }
  } catch (e) { console.error("roi_settings fetch error:", e); }

  const params = new URLSearchParams(location.search);
  quoteIdFromUrl = params.get("quote_id");
  if (!quoteIdFromUrl) return;

  const note = $("[data-quote-link-note]");
  try {
    const { data: quote, error } = await client.from("quotes")
      .select("id, total, notes, customer_id, customers(name, phone)")
      .eq("id", quoteIdFromUrl).maybeSingle();
    if (error || !quote) {
      note.textContent = "تعذر جلب بيانات العرض المربوط — كمّل البيانات يدويًا.";
      note.className = "form-note error";
      return;
    }
    if (quote.total) $("#fsCapex").value = Math.round(Number(quote.total));
    if (quote.customers?.name) $("#fsCustomerName").value = quote.customers.name;
    if (quote.customers?.phone) $("#fsCustomerPhone").value = quote.customers.phone;
    // notes بتحتوي نص زي "HP:100 | ..." — بنستخدمه كنص وصفي بس (مش رقمي)،
    // مش بنستنتج منه قدرة المنظومة بالـ KW لأن ده يكرر منطق حساب موجود في
    // edge function تاني وممكن يجيب نتيجة غير دقيقة؛ قدرة المنظومة بالـ KW
    // بتتدخل يدويًا من المندوب (كان ظاهرة له على الشاشة وقت عمل العرض).
    const hpMatch = /HP:\s*([\d.]+)/.exec(quote.notes || "");
    if (hpMatch) $("#fsSystemLabel").value = `منظومة غطاس ${hpMatch[1]} حصان`;
    note.textContent = `الدراسة دي مربوطة بعرض السعر رقم #${quote.id} — تم جلب CAPEX وبيانات العميل تلقائيًا.`;
    note.className = "form-note";
  } catch (e) {
    console.error("quote fetch error:", e);
  }
}

/* ---------------- محرك الحساب المالي ---------------- */

const YEARS = 30;

// معاملات تقريبية لإحصائيات "الإقناع السريع" (مش أرقام رسمية، بس تقريب
// معقول لمصر تحديدًا — الشركة المرجعية اللي بعتلنا أرقامها سعودية وبتستخدم
// افتراض استهلاك منزل مختلف، فمينفعش ننسخه زي ما هو). عدّلهم لو عندك
// أرقام أدق.
const EGYPT_AVG_HOUSEHOLD_KWH_PER_YEAR = 3000; // متوسط استهلاك بيت مصري تقريبًا/سنة
const KWH_PER_PHONE_CHARGE = 0.015; // متوسط استهلاك شحنة موبايل كاملة

function pct(v) { return Number(v || 0) / 100; }

// صافي القيمة الحالية عند معدل خصم معيّن — دي نفس الدالة اللي calcIRR
// بيدوّر بيها على الجذر (npv=0)، لكن هنا بنستخدمها مباشرة عند معدل
// الخصم اللي المندوب مدخله (مش بندوّر على معدل، إحنا عايزين القيمة نفسها).
function calcNPV(cashflows, rate) {
  return cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

// IRR عن طريق البحث الثنائي (bisection) على NPV=0 — أبسط وأثبت من
// Newton-Raphson لو الفروض غريبة (مفيش قسمة على صفر أو تشعب).
function calcIRR(cashflows) {
  const npv = (rate) => calcNPV(cashflows, rate);
  let lo = -0.99, hi = 10; // من -99% لحد 1000%
  if (npv(lo) * npv(hi) > 0) return null; // مفيش جذر في المدى ده (مشروع خسران تمامًا أو غير واقعي)
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1) return mid;
    if (npv(lo) * v <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

function calcPaybackYears(cumulative) {
  for (let y = 1; y < cumulative.length; y++) {
    if (cumulative[y] >= 0 && cumulative[y - 1] < 0) {
      const frac = -cumulative[y - 1] / (cumulative[y] - cumulative[y - 1]);
      return (y - 1) + frac;
    }
  }
  return null; // ماترجعش رأس المال خلال 30 سنة بالفروض دي
}

function runFeasibility(inputs) {
  const {
    capex, systemKw, psh, degradationPct,
    elecPrice, elecEscPct, dieselPrice, dieselEscPct,
    genKwhPerLiter, maintenancePct, discountRatePct,
  } = inputs;

  const energyYear1 = systemKw * psh * 365; // kWh/سنة قبل أي تدهور
  const maintenanceCost = capex * pct(maintenancePct); // ثابتة كل سنة (مش متصاعدة) — تبسيط متعمّد

  const dieselCF = [-capex];
  const gridCF = [-capex];
  const dieselCumulative = [-capex];
  const gridCumulative = [-capex];
  let dieselLitersYear1 = 0;
  let dieselTotalAvoidedCost = 0;
  let gridTotalAvoidedCost = 0;
  const yearRows = [];
  const currentCalendarYear = new Date().getFullYear();

  for (let y = 1; y <= YEARS; y++) {
    const energy = energyYear1 * Math.pow(1 - pct(degradationPct), y - 1);
    const dieselLiters = energy / genKwhPerLiter;
    if (y === 1) dieselLitersYear1 = dieselLiters;

    const dieselPriceThisYear = dieselPrice * Math.pow(1 + pct(dieselEscPct), y - 1);
    const gridPriceThisYear = elecPrice * Math.pow(1 + pct(elecEscPct), y - 1);
    const dieselAvoided = dieselLiters * dieselPriceThisYear;
    const gridAvoided = energy * gridPriceThisYear;
    dieselTotalAvoidedCost += dieselAvoided;
    gridTotalAvoidedCost += gridAvoided;

    // أول سنة ضمان مجاني للمنظومة — مفيش تكلفة صيانة فيها.
    const yearMaintenance = y === 1 ? 0 : maintenanceCost;

    const dieselNet = dieselAvoided - yearMaintenance;
    const gridNet = gridAvoided - yearMaintenance;

    dieselCF.push(dieselNet);
    gridCF.push(gridNet);
    dieselCumulative.push(dieselCumulative[y - 1] + dieselNet);
    gridCumulative.push(gridCumulative[y - 1] + gridNet);

    yearRows.push({
      year: y,
      calendarYear: currentCalendarYear + y - 1,
      energy,
      dieselPriceThisYear, gridPriceThisYear,
      maintenance: yearMaintenance,
      dieselAvoided, gridAvoided,
      dieselNet, gridNet,
      dieselCumulative: dieselCumulative[y],
      gridCumulative: gridCumulative[y],
    });
  }

  const co2TonsYear1 = (dieselLitersYear1 * 2.68) / 1000; // 2.68 كجم CO2 لكل لتر ديزيل محروق (معامل قياسي)
  const totalCostWithSolar = capex + maintenanceCost * (YEARS - 1); // أول سنة من غير صيانة

  // إحصائيات إضافية للإقناع السريع (زي الجدول المرجعي اللي اتبعت) — كلها
  // مبنية على أرقام السنة الأولى، قبل أي تصاعد أسعار أو تدهور كفاءة.
  const dieselMonthlySaving = dieselCF[1] / 12;
  const gridMonthlySaving = gridCF[1] / 12;
  const annualEnergyMwh = energyYear1 / 1000;
  const householdsEquivalent = Math.round(energyYear1 / EGYPT_AVG_HOUSEHOLD_KWH_PER_YEAR);
  const phoneChargesEquivalent = Math.round(energyYear1 / KWH_PER_PHONE_CHARGE);

  return {
    dieselCF, gridCF, dieselCumulative, gridCumulative,
    dieselNetSavings30: dieselCumulative[YEARS],
    gridNetSavings30: gridCumulative[YEARS],
    dieselIRR: calcIRR(dieselCF),
    gridIRR: calcIRR(gridCF),
    dieselNPV30: calcNPV(dieselCF, pct(discountRatePct)),
    gridNPV30: calcNPV(gridCF, pct(discountRatePct)),
    dieselPayback: calcPaybackYears(dieselCumulative),
    gridPayback: calcPaybackYears(gridCumulative),
    co2TonsYear1,
    dieselLitersYear1,
    dieselTotalAvoidedCost, gridTotalAvoidedCost, totalCostWithSolar, capex,
    dieselMonthlySaving, gridMonthlySaving, annualEnergyMwh, householdsEquivalent, phoneChargesEquivalent,
    yearRows,
  };
}

function readInputs() {
  return {
    capex: parseFloat($("#fsCapex").value) || 0,
    systemKw: parseFloat($("#fsSystemKw").value) || 0,
    psh: parseFloat($("#fsPsh").value) || 0,
    degradationPct: parseFloat($("#fsDegradation").value) || 0,
    elecPrice: parseFloat($("#fsElecPrice").value) || 0,
    elecEscPct: parseFloat($("#fsElecEsc").value) || 0,
    dieselPrice: parseFloat($("#fsDieselPrice").value) || 0,
    dieselEscPct: parseFloat($("#fsDieselEsc").value) || 0,
    genKwhPerLiter: parseFloat($("#fsGenConsumption").value) || 3.5,
    maintenancePct: parseFloat($("#fsMaintenance").value) || 0,
    discountRatePct: parseFloat($("#fsDiscountRate").value) || 0,
  };
}

function paybackLabel(years) {
  return years == null ? "أكتر من 30 سنة" : `${fmt1(years)} سنة`;
}
function irrLabel(rate) {
  return rate == null ? "—" : `${fmt1(rate * 100)}%`;
}

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

function renderResults(r) {
  // الشريط الرئيسي — رقم واحد كبير لكل سيناريو + فترة الاسترداد بس
  setText("[data-diesel-hero]", fmt(r.dieselNetSavings30) + " ج.م");
  setText("[data-diesel-payback-inline]", paybackLabel(r.dieselPayback));
  setText("[data-grid-hero]", fmt(r.gridNetSavings30) + " ج.م");
  setText("[data-grid-payback-inline]", paybackLabel(r.gridPayback));

  // تفاصيل مالية إضافية (NPV + IRR بس، من غير تكرار)
  setText("[data-diesel-npv]", fmt(r.dieselNPV30) + " ج.م");
  setText("[data-diesel-irr]", irrLabel(r.dieselIRR));
  setText("[data-grid-npv]", fmt(r.gridNPV30) + " ج.م");
  setText("[data-grid-irr]", irrLabel(r.gridIRR));

  // لمحة سريعة
  setText("[data-co2-saved]", fmt1(r.co2TonsYear1) + " طن");
  setText("[data-diesel-liters-saved]", fmt(r.dieselLitersYear1) + " لتر");
  setText("[data-annual-energy]", fmt1(r.annualEnergyMwh) + " MWh");
  setText("[data-households-equiv]", fmt(r.householdsEquivalent));
  setText("[data-phones-equiv]", fmt(r.phoneChargesEquivalent));
  setText("[data-diesel-monthly-saving]", fmt(r.dieselMonthlySaving) + " ج.م/شهر");

  renderYearTables(r);
  renderChart(r);
  $("[data-results-col]").hidden = false;

  // بعد أول حساب، نقفل فورم الفروض تلقائيًا عشان العرض قدّام العميل
  // يبقى نضيف من غير فورم ظاهر — لسه ممكن تفتحه تاني وتعدّل وتعيد الحساب.
  const details = $("[data-assumptions-details]");
  if (details) details.open = false;
}

function renderYearTables(r) {
  const dieselBody = $("[data-diesel-year-table]");
  const gridBody = $("[data-grid-year-table]");
  if (dieselBody) {
    dieselBody.innerHTML = r.yearRows.map((row) => `
      <tr>
        <td>${row.year}</td><td>${row.calendarYear}</td><td>${fmt(row.energy)}</td>
        <td>${row.dieselPriceThisYear.toFixed(2)}</td><td>${fmt(row.maintenance)}</td>
        <td>${fmt(row.dieselAvoided)}</td><td>${fmt(row.dieselNet)}</td><td>${fmt(row.dieselCumulative)}</td>
      </tr>`).join("");
  }
  if (gridBody) {
    gridBody.innerHTML = r.yearRows.map((row) => `
      <tr>
        <td>${row.year}</td><td>${row.calendarYear}</td><td>${fmt(row.energy)}</td>
        <td>${row.gridPriceThisYear.toFixed(2)}</td><td>${fmt(row.maintenance)}</td>
        <td>${fmt(row.gridAvoided)}</td><td>${fmt(row.gridNet)}</td><td>${fmt(row.gridCumulative)}</td>
      </tr>`).join("");
  }
}

/* ---------------- رسوم SVG خام (من غير مكتبات خارجية) ---------------- */

function makeChartScales(r, width, height) {
  const pad = { top: 36, right: 18, bottom: 34, left: 88 };
  const allVals = [...r.dieselCumulative, ...r.gridCumulative, 0];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = (maxV - minV) || 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  // محور أفقي مكسور عمدًا: أول 5 سنين تاخد 61.8% من العرض (القاعدة
  // الذهبية) عشان تبان واسعة وواضحة، والـ 25 سنة الباقية تتضغط في
  // الـ 38.2% الباقية. لازم علامة بصرية واضحة عند نقطة الكسر (splitYear)
  // وإلا القارئ هيفتكر إن الميل في المنطقتين قابل للمقارنة مباشرة وهو مش كده.
  const splitYear = 5;
  const w1 = innerW * 0.618;
  const w2 = innerW * 0.382;

  function x(year) {
    if (year <= splitYear) return pad.left + (year / splitYear) * w1;
    return pad.left + w1 + ((year - splitYear) / (YEARS - splitYear)) * w2;
  }
  function invX(px) {
    const rel = px - pad.left;
    if (rel <= w1) return Math.max(0, (rel / w1) * splitYear);
    return Math.min(YEARS, splitYear + ((rel - w1) / w2) * (YEARS - splitYear));
  }
  function y(v) { return pad.top + innerH - ((v - minV) / span) * innerH; }

  return { pad, innerW, innerH, minV, maxV, span, x, y, invX, splitYear, width, height };
}

function buildChartSvg(r, width, height) {
  const s = makeChartScales(r, width, height);
  const { pad, minV, maxV, x, y, splitYear } = s;
  const toPath = (arr) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const zeroY = y(0);

  const minLabelGap = Math.abs(y(minV) - zeroY);
  const gridValues = minLabelGap > 22 ? [minV, 0, maxV] : [0, maxV];
  const gridLines = gridValues.map((v) => {
    const yy = y(v);
    const labelY = v === 0 ? yy - 6 : yy;
    const baseline = v === 0 ? "auto" : "middle";
    return `
      <line x1="${pad.left}" y1="${yy.toFixed(1)}" x2="${width - pad.right}" y2="${yy.toFixed(1)}" stroke="#e4d8ca" stroke-width="1"></line>
      <text x="${pad.left - 8}" y="${labelY.toFixed(1)}" text-anchor="end" dominant-baseline="${baseline}" font-size="10.5" fill="#7a6f5f">${fmt(v)}</text>
    `;
  }).join("");

  // تظليل خفيف على منطقة أول 5 سنين (المكبّرة) + خط فاصل صريح عند
  // سنة 5 يوضح إن المقياس اتغيّر — الصدق البصري قبل أي حاجة.
  const zoomBand = `<rect x="${x(0)}" y="${pad.top}" width="${(x(splitYear) - x(0)).toFixed(1)}" height="${s.innerH}" fill="#d98324" opacity="0.05"></rect>`;
  const breakMarker = `
    <line x1="${x(splitYear).toFixed(1)}" y1="${pad.top}" x2="${x(splitYear).toFixed(1)}" y2="${height - pad.bottom}" stroke="#b8a98f" stroke-width="1" stroke-dasharray="2,3"></line>
    <text x="${x(splitYear).toFixed(1)}" y="${pad.top - 10}" text-anchor="middle" font-size="9.5" fill="#9c8f7a">مقياس مضغوط بعد سنة 5 ↦</text>
  `;

  // سنين على المحور: 1-5 كل سنة (المنطقة المكبّرة)، وبعدين كل 5 سنين
  const yearLabels = [];
  for (let yr = 1; yr <= splitYear; yr++) {
    yearLabels.push(`<text x="${x(yr).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#7a6f5f">${yr}</text>`);
  }
  for (let yr = 10; yr <= YEARS; yr += 5) {
    yearLabels.push(`<text x="${x(yr).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="10.5" fill="#7a6f5f">سنة ${yr}</text>`);
  }

  function breakevenMarker(payback, color) {
    if (payback == null) return "";
    const px = x(payback).toFixed(1);
    return `
      <line x1="${px}" y1="${pad.top}" x2="${px}" y2="${zeroY.toFixed(1)}" stroke="${color}" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"></line>
      <circle cx="${px}" cy="${zeroY.toFixed(1)}" r="4.5" fill="#fff" stroke="${color}" stroke-width="2.5"></circle>
    `;
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" data-chart-svg>
      ${zoomBand}
      ${gridLines}
      ${yearLabels.join("")}
      <path d="${toPath(r.dieselCumulative)}" fill="none" stroke="#1f3a5f" stroke-width="2.5"></path>
      <path d="${toPath(r.gridCumulative)}" fill="none" stroke="#d98324" stroke-width="2.5"></path>
      ${breakevenMarker(r.dieselPayback, "#1f3a5f")}
      ${breakevenMarker(r.gridPayback, "#d98324")}
      ${breakMarker}
      <rect data-hover-capture x="${pad.left}" y="${pad.top}" width="${s.innerW}" height="${s.innerH}" fill="transparent"></rect>
      <g data-hover-layer style="display:none">
        <line data-hover-guide x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" stroke="#7a6f5f" stroke-width="1" stroke-dasharray="2,2"></line>
        <circle data-hover-dot-diesel r="4.5" fill="#1f3a5f"></circle>
        <circle data-hover-dot-grid r="4.5" fill="#d98324"></circle>
      </g>
    </svg>
    <div class="fs-chart-tooltip" data-chart-tooltip></div>
  `;
}

// بتتنادى مرة واحدة بعد إدراج الشارت في الصفحة — بتحسب نفس المقاييس
// تاني (رخيصة حسابيًا) وتربط حركة الماوس بتحديث خط الإرشاد ونقطتين
// القيمة وصندوق الـ tooltip، من غير أي مكتبة خارجية.
function attachChartHover(holder, r, width, height) {
  const s = makeChartScales(r, width, height);
  const svg = holder.querySelector("[data-chart-svg]");
  const capture = holder.querySelector("[data-hover-capture]");
  const layer = holder.querySelector("[data-hover-layer]");
  const guide = holder.querySelector("[data-hover-guide]");
  const dotDiesel = holder.querySelector("[data-hover-dot-diesel]");
  const dotGrid = holder.querySelector("[data-hover-dot-grid]");
  const tooltip = holder.querySelector("[data-chart-tooltip]");
  if (!svg || !capture) return;

  function yearValue(arr, year) {
    const lo = Math.floor(year), hi = Math.ceil(year);
    if (lo === hi) return arr[lo];
    const frac = year - lo;
    return arr[lo] + (arr[hi] - arr[lo]) * frac; // تقريب خطي بين السنتين الصحيحتين
  }

  function handleMove(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const userX = (clientX - rect.left) * scaleX;
    const year = Math.round(s.invX(userX));
    const dieselV = yearValue(r.dieselCumulative, year);
    const gridV = yearValue(r.gridCumulative, year);
    const px = s.x(year);

    layer.style.display = "block";
    guide.setAttribute("x1", px); guide.setAttribute("x2", px);
    dotDiesel.setAttribute("cx", px); dotDiesel.setAttribute("cy", s.y(dieselV));
    dotGrid.setAttribute("cx", px); dotGrid.setAttribute("cy", s.y(gridV));

    tooltip.style.display = "block";
    tooltip.innerHTML = `<b>${year === 0 ? "اليوم" : "سنة " + year}</b><br>ديزيل: ${fmt(dieselV)} ج.م<br>شبكة: ${fmt(gridV)} ج.م`;
    const rectHolder = holder.getBoundingClientRect();
    let leftPx = ((clientX - rectHolder.left) + 14);
    if (leftPx + 140 > rectHolder.width) leftPx = (clientX - rectHolder.left) - 154;
    tooltip.style.left = leftPx + "px";
    tooltip.style.top = Math.max(0, (clientY - rectHolder.top) - 50) + "px";
  }

  capture.addEventListener("mousemove", (e) => handleMove(e.clientX, e.clientY));
  capture.addEventListener("mouseleave", () => {
    layer.style.display = "none";
    tooltip.style.display = "none";
  });
  capture.addEventListener("touchmove", (e) => {
    if (e.touches[0]) { handleMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
  }, { passive: false });
}

// بار واحد بتلات أعمدة: ديزيل، شبكة، طاقة شمسية — مش بارين منفصلين.
// الترتيب تنازلي عمدًا: العميل أصلاً عارف إن الشبكة أرخص من الديزيل،
// فلما يشوف الترتيب ده صحيح قدامه بيثق في باقي الأرقام، وبعدين لما
// يشوف عمود الطاقة الشمسية أقل من الاتنين بفارق واضح، الاقتناع بييجي
// أقوى لأن الثقة اتبنت الأول.
function buildThreeWayBarSvg(r, width, height) {
  const bars = [
    { label: "لو فضلت على الديزل", value: r.dieselTotalAvoidedCost, color: "#1f3a5f" },
    { label: "لو فضلت على الشبكة", value: r.gridTotalAvoidedCost, color: "#d98324" },
    { label: "بالطاقة الشمسية", value: r.totalCostWithSolar, color: "#214234" },
  ].sort((a, b) => b.value - a.value);

  const maxV = Math.max(...bars.map((b) => b.value)) || 1;
  const pad = { top: 30, bottom: 32, side: 24 };
  const innerH = height - pad.top - pad.bottom;
  const innerW = width - pad.side * 2;
  const gap = innerW * 0.12;
  const barW = (innerW - gap * (bars.length - 1)) / bars.length;
  const barH = (v) => (v / maxV) * innerH;

  const barsSvg = bars.map((b, i) => {
    const x = pad.side + i * (barW + gap);
    const h = barH(b.value);
    const y = height - pad.bottom - h;
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${b.color}" rx="5"></rect>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="${b.color}">${fmt(b.value)}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#7a6f5f">${b.label}</text>
    `;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${pad.side - 10}" y1="${height - pad.bottom}" x2="${width - pad.side + 10}" y2="${height - pad.bottom}" stroke="#c9bda8" stroke-width="1"></line>
      ${barsSvg}
    </svg>
  `;
}

function renderChart(r) {
  const holder = $("[data-chart-holder]");
  const width = Math.max(320, holder.clientWidth || 600);
  const height = Math.round(width / 1.618);
  holder.innerHTML = buildChartSvg(r, width, height);
  attachChartHover(holder, r, width, height);

  setText("[data-diesel-irr-legend]", irrLabel(r.dieselIRR));
  setText("[data-grid-irr-legend]", irrLabel(r.gridIRR));

  const barHolder = $("[data-cost-bar-holder]");
  if (barHolder) {
    const w = Math.max(320, barHolder.clientWidth || 600);
    barHolder.innerHTML = buildThreeWayBarSvg(r, w, Math.round(w / 1.618));
  }
}

/* ---------------- الحفظ ---------------- */

async function saveStudy() {
  const msg = $("[data-fs-message]");
  const inputs = readInputs();
  if (!inputs.capex || !inputs.systemKw) {
    msg.textContent = "لازم تدخل CAPEX وقدرة المنظومة الأول.";
    msg.className = "form-note error";
    return;
  }
  msg.textContent = "جاري الحفظ..."; msg.className = "form-note";
  $("#fsSaveBtn").disabled = true;

  const row = {
    quote_id: quoteIdFromUrl ? Number(quoteIdFromUrl) : null,
    rep_id: currentSession.user.id,
    customer_name: $("#fsCustomerName").value.trim() || null,
    customer_phone: $("#fsCustomerPhone").value.trim() || null,
    system_label: $("#fsSystemLabel").value.trim() || null,
    capex: inputs.capex,
    system_kw: inputs.systemKw,
    psh: inputs.psh,
    degradation_pct: inputs.degradationPct,
    electricity_price: inputs.elecPrice,
    electricity_escalation_pct: inputs.elecEscPct,
    diesel_price: inputs.dieselPrice,
    diesel_escalation_pct: inputs.dieselEscPct,
    generator_kwh_per_liter: inputs.genKwhPerLiter,
    annual_maintenance_pct: inputs.maintenancePct,
    discount_rate_pct: inputs.discountRatePct,
  };

  const { error } = await client.from("feasibility_studies").insert(row);
  $("#fsSaveBtn").disabled = false;
  if (error) { msg.textContent = "تعذر الحفظ: " + error.message; msg.className = "form-note error"; return; }
  msg.textContent = "تم حفظ الدراسة."; msg.className = "form-note";
  setTimeout(() => { if (msg) msg.textContent = ""; }, 2500);
}

/* ---------------- الطباعة / PDF ---------------- */

function printStudy() {
  if (!lastCalc) return;
  const r = lastCalc;
  const area = $("#printArea");
  const dateStr = new Date().toLocaleDateString("en-GB");
  const label = $("#fsSystemLabel").value.trim() || "دراسة جدوى منظومة طاقة شمسية";
  const custName = $("#fsCustomerName").value.trim();
  const custPhone = $("#fsCustomerPhone").value.trim();
  const inputs = readInputs();

  area.innerHTML = `
    <div class="print-letterhead-bg"><img src="letterhead.jpg" alt=""></div>
    <div class="print-body" dir="rtl">
      <div class="print-meta">
        <div><strong>دراسة جدوى مُقدَّمة إلى:</strong> ${custName || "—"} ${custPhone ? "— " + custPhone : ""}</div>
        <div><strong>تاريخ الدراسة:</strong> ${dateStr}</div>
      </div>
      <h2 style="margin:0 0 6px">${label}</h2>
      <div class="print-assumptions">
        <span>CAPEX: ${fmt(inputs.capex)} ج.م</span>
        <span>القدرة: ${fmt1(inputs.systemKw)} KW</span>
        <span>PSH: ${inputs.psh} ساعة/يوم</span>
        <span>سعر الكهرباء: ${inputs.elecPrice} ج.م/kWh</span>
        <span>سعر الديزيل: ${inputs.dieselPrice} ج.م/لتر</span>
        <span>الصيانة السنوية: ${inputs.maintenancePct}% من CAPEX</span>
        <span>معدل الخصم (NPV): ${inputs.discountRatePct}%</span>
      </div>
      <div class="print-results">
        <div class="print-result-box">
          <h4>💧 مقابل مولد ديزيل</h4>
          <div class="row"><span>صافي الربح (Net Profit)</span><span>${fmt(r.dieselNetSavings30)} ج.م</span></div>
          <div class="row"><span>القيمة الحالية الصافية (NPV)</span><span>${fmt(r.dieselNPV30)} ج.م</span></div>
          <div class="row"><span>العائد الداخلي (IRR)</span><span>${irrLabel(r.dieselIRR)}</span></div>
          <div class="row"><span>فترة الاسترداد (PBP)</span><span>${paybackLabel(r.dieselPayback)}</span></div>
        </div>
        <div class="print-result-box">
          <h4>⚡ مقابل شبكة الكهرباء</h4>
          <div class="row"><span>صافي الربح (Net Profit)</span><span>${fmt(r.gridNetSavings30)} ج.م</span></div>
          <div class="row"><span>القيمة الحالية الصافية (NPV)</span><span>${fmt(r.gridNPV30)} ج.م</span></div>
          <div class="row"><span>العائد الداخلي (IRR)</span><span>${irrLabel(r.gridIRR)}</span></div>
          <div class="row"><span>فترة الاسترداد (PBP)</span><span>${paybackLabel(r.gridPayback)}</span></div>
        </div>
      </div>
      <div class="print-assumptions" style="margin-top:8px;margin-bottom:8px">
        <span>الطاقة المنتجة سنويًا: ${fmt1(r.annualEnergyMwh)} MWh</span>
        <span>يكفي استهلاك ~${fmt(r.householdsEquivalent)} منزل/سنة</span>
        <span>توفير شهري (ديزيل): ${fmt(r.dieselMonthlySaving)} ج.م</span>
        <span>توفير شهري (شبكة): ${fmt(r.gridMonthlySaving)} ج.م</span>
        <span>CO₂ موفّر: ${fmt1(r.co2TonsYear1)} طن/سنة</span>
      </div>

      <h4 class="print-chart-heading">التدفق النقدي التراكمي — 30 سنة</h4>
      ${buildChartSvg(r, 700, 130)}
      <h4 class="print-chart-heading" style="margin-top:6px">مقارنة سريعة — التكلفة الكلية على 30 سنة</h4>
      ${buildThreeWayBarSvg(r, 700, 150)}
    </div>

    <!-- الجداول التفصيلية لسه كل واحد في صفحته المستقلة — دي جداول 30
         صف مفيش طريقة تتكوّم في المساحة المتاحة أصلاً، فمحتاجة صفحة
         كاملة لوحدها بمساحة أمان فوق وتحت. -->
    <div class="print-body print-page-break" dir="rtl">
      <h4 class="print-year-table-wrap">الجدول التفصيلي سنة بسنة — مقابل مولد ديزيل</h4>
      ${buildPrintYearTable(r.yearRows, "diesel")}
    </div>

    <div class="print-body print-page-break" dir="rtl">
      <h4 class="print-year-table-wrap">الجدول التفصيلي سنة بسنة — مقابل شبكة الكهرباء</h4>
      ${buildPrintYearTable(r.yearRows, "grid")}
      <div class="print-footer">
        الحساب افتراضي لأغراض الإقناع الأولي، مبني على الفروض الموضحة أعلاه — مش عرض مالي رسمي وقابل للتغيير حسب الأسعار الفعلية وقت التعاقد.
        الأصل للطاقة الشمسية — alaslsolar.com
      </div>
    </div>
  `;
  setTimeout(() => window.print(), 150);
}

function buildPrintYearTable(yearRows, mode) {
  const priceLabel = mode === "diesel" ? "سعر الديزيل المكافئ" : "سعر الشبكة";
  const avoidedLabel = "القيمة المستردة";
  const rows = yearRows.map((row) => {
    const price = mode === "diesel" ? row.dieselPriceThisYear : row.gridPriceThisYear;
    const avoided = mode === "diesel" ? row.dieselAvoided : row.gridAvoided;
    const net = mode === "diesel" ? row.dieselNet : row.gridNet;
    const cum = mode === "diesel" ? row.dieselCumulative : row.gridCumulative;
    return `<tr><td>${row.year}</td><td>${row.calendarYear}</td><td>${fmt(row.energy)}</td><td>${price.toFixed(2)}</td><td>${fmt(row.maintenance)}</td><td>${fmt(avoided)}</td><td>${fmt(net)}</td><td>${fmt(cum)}</td></tr>`;
  }).join("");
  return `
    <table class="print-year-table">
      <thead><tr><th>سنة</th><th>ميلادي</th><th>الطاقة (kWh)</th><th>${priceLabel}</th><th>الصيانة</th><th>${avoidedLabel}</th><th>صافي التوفير</th><th>الربح التراكمي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ---------------- ربط الأحداث ---------------- */

document.addEventListener("DOMContentLoaded", async () => {
  await initClient();
  if (!client) { $("[data-auth-message]").textContent = "تعذر الاتصال بالخادم."; return; }

  $("[data-login-form]").addEventListener("submit", handleLogin);
  $("[data-logout]").addEventListener("click", handleLogout);

  $("#fsCalcBtn").addEventListener("click", () => {
    const inputs = readInputs();
    if (!inputs.capex || !inputs.systemKw) {
      $("[data-fs-message]").textContent = "لازم تدخل CAPEX وقدرة المنظومة الأول.";
      $("[data-fs-message]").className = "form-note error";
      return;
    }
    $("[data-fs-message]").textContent = "";
    lastCalc = runFeasibility(inputs);
    renderResults(lastCalc);
  });

  $("#fsSaveBtn").addEventListener("click", saveStudy);
  $("#fsPrintBtn").addEventListener("click", printStudy);

  const { data: { session } } = await client.auth.getSession();
  await updateAuthState(session);

  client.auth.onAuthStateChange((_event, session) => { updateAuthState(session); });
});
