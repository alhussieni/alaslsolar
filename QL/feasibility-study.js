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

function pct(v) { return Number(v || 0) / 100; }

// IRR عن طريق البحث الثنائي (bisection) على NPV=0 — أبسط وأثبت من
// Newton-Raphson لو الفروض غريبة (مفيش قسمة على صفر أو تشعب).
function calcIRR(cashflows) {
  function npv(rate) {
    return cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
  }
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
    genKwhPerLiter, maintenancePct,
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

  for (let y = 1; y <= YEARS; y++) {
    const energy = energyYear1 * Math.pow(1 - pct(degradationPct), y - 1);
    const dieselLiters = energy / genKwhPerLiter;
    if (y === 1) dieselLitersYear1 = dieselLiters;

    const dieselAvoided = dieselLiters * dieselPrice * Math.pow(1 + pct(dieselEscPct), y - 1);
    const gridAvoided = energy * elecPrice * Math.pow(1 + pct(elecEscPct), y - 1);
    dieselTotalAvoidedCost += dieselAvoided;
    gridTotalAvoidedCost += gridAvoided;

    const dieselNet = dieselAvoided - maintenanceCost;
    const gridNet = gridAvoided - maintenanceCost;

    dieselCF.push(dieselNet);
    gridCF.push(gridNet);
    dieselCumulative.push(dieselCumulative[y - 1] + dieselNet);
    gridCumulative.push(gridCumulative[y - 1] + gridNet);
  }

  const co2TonsYear1 = (dieselLitersYear1 * 2.68) / 1000; // 2.68 كجم CO2 لكل لتر ديزيل محروق (معامل قياسي)
  const totalCostWithSolar = capex + maintenanceCost * YEARS;

  return {
    dieselCF, gridCF, dieselCumulative, gridCumulative,
    dieselNetSavings30: dieselCumulative[YEARS],
    gridNetSavings30: gridCumulative[YEARS],
    dieselIRR: calcIRR(dieselCF),
    gridIRR: calcIRR(gridCF),
    dieselPayback: calcPaybackYears(dieselCumulative),
    gridPayback: calcPaybackYears(gridCumulative),
    co2TonsYear1,
    dieselLitersYear1,
    dieselTotalAvoidedCost, gridTotalAvoidedCost, totalCostWithSolar, capex,
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
  };
}

function paybackLabel(years) {
  return years == null ? "أكتر من 30 سنة" : `${fmt1(years)} سنة`;
}
function irrLabel(rate) {
  return rate == null ? "—" : `${fmt1(rate * 100)}%`;
}

function renderResults(r) {
  $("[data-diesel-savings]").textContent = fmt(r.dieselNetSavings30) + " ج.م";
  $("[data-diesel-irr]").textContent = irrLabel(r.dieselIRR);
  $("[data-diesel-payback]").textContent = paybackLabel(r.dieselPayback);

  $("[data-grid-savings]").textContent = fmt(r.gridNetSavings30) + " ج.م";
  $("[data-grid-irr]").textContent = irrLabel(r.gridIRR);
  $("[data-grid-payback]").textContent = paybackLabel(r.gridPayback);

  $("[data-co2-saved]").textContent = fmt1(r.co2TonsYear1) + " طن";
  $("[data-diesel-liters-saved]").textContent = fmt(r.dieselLitersYear1) + " لتر";

  renderChart(r);
  $("[data-results-col]").hidden = false;
}

/* ---------------- رسوم SVG خام (من غير مكتبات خارجية) ---------------- */

function buildChartSvg(r, width, height) {
  const pad = { top: 16, right: 16, bottom: 26, left: 62 };
  const allVals = [...r.dieselCumulative, ...r.gridCumulative, 0];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = (maxV - minV) || 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const x = (i) => pad.left + (i / YEARS) * innerW;
  const y = (v) => pad.top + innerH - ((v - minV) / span) * innerH;

  const toPath = (arr) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const zeroY = y(0).toFixed(1);

  // خطوط شبكة أفقية + قيم على المحور الرأسي (min / 0 / max) — بدونها
  // العميل شايف خط بيصعد من غير ما يعرف بكام.
  const gridLines = [minV, 0, maxV].map((v) => `
    <line x1="${pad.left}" y1="${y(v).toFixed(1)}" x2="${width - pad.right}" y2="${y(v).toFixed(1)}" stroke="#e4d8ca" stroke-width="1"></line>
    <text x="${pad.left - 8}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10.5" fill="#7a6f5f">${fmt(v)}</text>
  `).join("");

  // سنين على المحور الأفقي كل 5 سنين
  const yearLabels = [];
  for (let yr = 0; yr <= YEARS; yr += 5) {
    yearLabels.push(`<text x="${x(yr).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="10.5" fill="#7a6f5f">${yr === 0 ? "اليوم" : "سنة " + yr}</text>`);
  }

  // علامة واضحة عند نقطة الاسترداد الفعلية لكل خط (دائرة + خط رأسي منقّط)
  function breakevenMarker(payback, color) {
    if (payback == null) return "";
    const px = x(payback).toFixed(1);
    const py = y(0).toFixed(1);
    return `
      <line x1="${px}" y1="${pad.top}" x2="${px}" y2="${py}" stroke="${color}" stroke-width="1" stroke-dasharray="3,3" opacity="0.55"></line>
      <circle cx="${px}" cy="${py}" r="5" fill="${color}"></circle>
    `;
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${gridLines}
      ${yearLabels.join("")}
      <path d="${toPath(r.dieselCumulative)}" fill="none" stroke="#1f3a5f" stroke-width="2.5"></path>
      <path d="${toPath(r.gridCumulative)}" fill="none" stroke="#d98324" stroke-width="2.5"></path>
      ${breakevenMarker(r.dieselPayback, "#1f3a5f")}
      ${breakevenMarker(r.gridPayback, "#d98324")}
    </svg>
  `;
}

// بار بسيط: التكلفة الكلية على 30 سنة لو فضلت زي ما إنت (ديزيل/شبكة)،
// مقابل التكلفة الكلية لو ركّبت الطاقة الشمسية (CAPEX + صيانة 30 سنة).
// أسهل بكتير من خط بياني للعميل اللي مش هيقعد يحلل أرقام — طول العمودين
// وحده بيوصّل الرسالة.
function buildCostBarSvg(r, width, height, mode) {
  const withoutSolar = mode === "diesel" ? r.dieselTotalAvoidedCost : r.gridTotalAvoidedCost;
  const withSolar = r.totalCostWithSolar;
  const maxV = Math.max(withoutSolar, withSolar) || 1;
  const pad = { top: 26, bottom: 30, side: 40 };
  const barW = 90;
  const gap = 60;
  const innerH = height - pad.top - pad.bottom;
  const barH = (v) => (v / maxV) * innerH;

  const x1 = pad.side;
  const x2 = pad.side + barW + gap;
  const h1 = barH(withoutSolar);
  const h2 = barH(withSolar);
  const y1 = height - pad.bottom - h1;
  const y2 = height - pad.bottom - h2;
  const baseColor = mode === "diesel" ? "#1f3a5f" : "#d98324";

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${pad.side - 10}" y1="${height - pad.bottom}" x2="${width - pad.side + 10}" y2="${height - pad.bottom}" stroke="#c9bda8" stroke-width="1"></line>
      <rect x="${x1}" y="${y1.toFixed(1)}" width="${barW}" height="${h1.toFixed(1)}" fill="${baseColor}" opacity="0.35" rx="4"></rect>
      <text x="${x1 + barW / 2}" y="${y1 - 8}" text-anchor="middle" font-size="13" font-weight="700" fill="${baseColor}">${fmt(withoutSolar)}</text>
      <text x="${x1 + barW / 2}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#7a6f5f">${mode === "diesel" ? "لو فضلت على الديزل" : "لو فضلت على الشبكة"}</text>

      <rect x="${x2}" y="${y2.toFixed(1)}" width="${barW}" height="${h2.toFixed(1)}" fill="var(--forest, #2f7d5e)" rx="4"></rect>
      <text x="${x2 + barW / 2}" y="${y2 - 8}" text-anchor="middle" font-size="13" font-weight="700" fill="#2f7d5e">${fmt(withSolar)}</text>
      <text x="${x2 + barW / 2}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#7a6f5f">بالطاقة الشمسية</text>
    </svg>
  `;
}

function renderChart(r) {
  const holder = $("[data-chart-holder]");
  const width = Math.max(320, holder.clientWidth || 600);
  holder.innerHTML = buildChartSvg(r, width, 220);

  const dieselBarHolder = $("[data-diesel-bar-holder]");
  const gridBarHolder = $("[data-grid-bar-holder]");
  if (dieselBarHolder) dieselBarHolder.innerHTML = buildCostBarSvg(r, dieselBarHolder.clientWidth || 260, 200, "diesel");
  if (gridBarHolder) gridBarHolder.innerHTML = buildCostBarSvg(r, gridBarHolder.clientWidth || 260, 200, "grid");
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
      </div>
      <div class="print-results">
        <div class="print-result-box">
          <h4>💧 مقابل مولد ديزيل</h4>
          <div class="row"><span>صافي الربح (30 سنة)</span><span>${fmt(r.dieselNetSavings30)} ج.م</span></div>
          <div class="row"><span>معدل العائد IRR</span><span>${irrLabel(r.dieselIRR)}</span></div>
          <div class="row"><span>فترة الاسترداد</span><span>${paybackLabel(r.dieselPayback)}</span></div>
        </div>
        <div class="print-result-box">
          <h4>⚡ مقابل شبكة الكهرباء</h4>
          <div class="row"><span>صافي الربح (30 سنة)</span><span>${fmt(r.gridNetSavings30)} ج.م</span></div>
          <div class="row"><span>معدل العائد IRR</span><span>${irrLabel(r.gridIRR)}</span></div>
          <div class="row"><span>فترة الاسترداد</span><span>${paybackLabel(r.gridPayback)}</span></div>
        </div>
      </div>
      <div style="margin-top:14px">${buildChartSvg(r, 700, 200)}</div>
      <div style="display:flex;gap:14px;margin-top:10px">
        <div style="flex:1">${buildCostBarSvg(r, 340, 200, "diesel")}</div>
        <div style="flex:1">${buildCostBarSvg(r, 340, 200, "grid")}</div>
      </div>
      <div class="print-footer">
        الحساب افتراضي لأغراض الإقناع الأولي، مبني على الفروض الموضحة أعلاه — مش عرض مالي رسمي وقابل للتغيير حسب الأسعار الفعلية وقت التعاقد.
        الأصل للطاقة الشمسية — alaslsolar.com
      </div>
    </div>
  `;
  setTimeout(() => window.print(), 150);
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
