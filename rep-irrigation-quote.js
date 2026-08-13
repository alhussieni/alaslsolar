/* ============================================================
   rep-irrigation-quote.js
   حاسبة أسعار منظومة ري بالطاقة الشمسية (مدخل HP بس).
   يعتمد على تسجيل الدخول اللي تم من index.html (نفس الجلسة).
   المحرك الحسابي بالكامل شغال سيرفر-سايد داخل
   rep_create_irrigation_solar_quote (Supabase) — الصفحة دي واجهة عرض فقط.
   ============================================================ */

let client = null;
let currentSession = null;
let currentRep = null;
let lastResult = null;

function $(sel) { return document.querySelector(sel); }

function fmt(n) {
  return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 });
}

async function initClient() {
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  client = window.getAlaslSupabase ? window.getAlaslSupabase() : null;
  return client;
}

async function checkRepStatus(userId) {
  const { data, error } = await client
    .from("reps")
    .select("id, display_name, active")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data || !data.active) return null;
  return data;
}

async function updateAuthState(session) {
  currentSession = session;
  const authPanel = $("[data-auth-panel]");
  const repPanel = $("[data-rep-panel]");
  const userName = $("[data-user-name]");

  if (!session) {
    authPanel.hidden = false;
    repPanel.hidden = true;
    userName.textContent = "";
    return;
  }

  const rep = await checkRepStatus(session.user.id);
  if (!rep) {
    authPanel.hidden = false;
    repPanel.hidden = true;
    userName.textContent = "";
    return;
  }

  currentRep = rep;
  authPanel.hidden = true;
  repPanel.hidden = false;
  userName.textContent = rep.display_name;

  await loadPanels();
}

async function loadPanels() {
  const sel = $("#panelSelect");
  const { data, error } = await client
    .from("products")
    .select("id, name_ar, brand, power_watt, vimp, voc, iimp, isc, price")
    .eq("category", "panels")
    .eq("published", true)
    .not("power_watt", "is", null)
    .not("vimp", "is", null)
    .not("voc", "is", null)
    .not("iimp", "is", null)
    .not("isc", "is", null)
    .order("power_watt", { ascending: false });

  if (error || !data || data.length === 0) {
    sel.innerHTML = '<option value="">مفيش ألواح بمواصفات كهربائية كاملة — راجع الأدمن</option>';
    return;
  }

  sel.innerHTML = data
    .map((p) => `<option value="${p.id}">${p.brand || ""} ${p.name_ar} — ${p.power_watt}W</option>`)
    .join("");
}

function collectToggles() {
  const out = {};
  document.querySelectorAll("[data-toggle]").forEach((el) => {
    out[el.dataset.toggle] = el.checked;
  });
  return out;
}

const BOM_LABEL_FALLBACK = {
  panel: "ألواح الطاقة الشمسية",
  inverter: "الانفرتر",
};

async function runCalc() {
  const msg = $("#calcMsg");
  const hp = parseFloat($("#hpInput").value);
  const panelId = $("#panelSelect").value;
  const structureType = $("#structureType").value;
  const quoteType = $("#quoteType").value;
  const discountPct = parseFloat($("#discountPct").value) || 0;
  const custName = $("#custName").value.trim();
  const custPhone = $("#custPhone").value.trim();
  const custCity = $("#custCity").value.trim();

  if (!hp || hp <= 0) {
    msg.textContent = "أدخل القدرة المطلوبة بالحصان.";
    msg.className = "rq-msg error";
    return;
  }
  if (!panelId) {
    msg.textContent = "اختار لوح شمسي.";
    msg.className = "rq-msg error";
    return;
  }
  if (!custName || custPhone.length < 8) {
    msg.textContent = "أدخل اسم العميل ورقم هاتف صحيح الأول.";
    msg.className = "rq-msg error";
    return;
  }

  msg.textContent = "جاري الحساب...";
  msg.className = "rq-msg";

  const { data, error } = await client.rpc("rep_create_irrigation_solar_quote", {
    p_customer_name: custName,
    p_customer_phone: custPhone,
    p_customer_city: custCity || null,
    p_hp: hp,
    p_panel_product_id: panelId,
    p_structure_type: structureType,
    p_toggles: collectToggles(),
    p_discount_pct: discountPct,
    p_quote_type: quoteType,
    p_notes: null,
  });

  if (error) {
    msg.textContent = "حصل خطأ: " + error.message;
    msg.className = "rq-msg error";
    return;
  }

  msg.textContent = "تم الحساب والحفظ بنجاح.";
  msg.className = "rq-msg ok";
  lastResult = data;
  lastResult._customer = { name: custName, phone: custPhone, city: custCity };
  lastResult._quoteType = quoteType;
  renderResults(data, quoteType);
}

function renderResults(r, quoteType) {
  $("#resultsCard").hidden = false;

  const warnBox = $("#oversizeWarning");
  warnBox.innerHTML = r.inverter_oversize_warning
    ? `<div class="warn-box">⚠️ ${r.inverter_oversize_warning}</div>`
    : "";

  $("#mKw").textContent = fmt(r.calc_kw);
  $("#mPanels").textContent = fmt(r.total_panels);
  $("#mArrays").textContent = fmt(r.arrays);
  $("#mPerString").textContent = fmt(r.panels_per_string);
  $("#mVimp").textContent = fmt(r.vimp) + "V";
  $("#mVoc").textContent = fmt(r.voc) + "V";
  $("#mIimp").textContent = fmt(r.iimp) + "A";
  $("#mIsc").textContent = fmt(r.isc_calc) + "A";
  $("#mInv").textContent = `${r.inverter_brand} ${fmt(r.inverter_kw)} KW`;
  $("#mReactor").textContent = r.reactor_model + "A";
  $("#mCb").textContent = r.cb_size + "A";
  $("#mRatio").textContent = "×" + Number(r.efficiency_ratio).toFixed(2);

  const items = (r.items || []).filter((it) => it.on);
  $("#bomBody").innerHTML = items
    .map(
      (it) => `<tr>
        <td>${it.label || BOM_LABEL_FALLBACK[it.key] || it.key}</td>
        <td>${it.type || "-"}</td>
        <td>${fmt(it.qty)}</td>
        <td>${fmt(it.net)} ﷼</td>
      </tr>`
    )
    .join("");

  $("#grandTotal").textContent = fmt(r.final_total);

  const installKeys = ["install_mech", "install_elec"];
  const installTotal = items
    .filter((it) => installKeys.includes(it.key))
    .reduce((s, it) => s + Number(it.net || 0), 0);

  if (quoteType === "supply_install") {
    $("#pSupplyInstall").textContent = fmt(r.final_total) + " ﷼";
    $("#pSupplyOnly").textContent = fmt(r.final_total - installTotal) + " ﷼ (تقريبي)";
  } else {
    $("#pSupplyOnly").textContent = fmt(r.final_total) + " ﷼";
    $("#pSupplyInstall").textContent = fmt(r.final_total + installTotal) + " ﷼ (تقريبي)";
  }

  document.querySelectorAll(".price-card").forEach((c) => c.classList.remove("active"));
  const activeIdx = quoteType === "supply_install" ? 1 : 0;
  document.querySelectorAll(".price-card")[activeIdx].classList.add("active");

  buildPrintArea(r, items);
}

function buildPrintArea(r, items) {
  $("#printDate").textContent = new Date().toLocaleDateString("ar-SA");
  $("#printCustomer").innerHTML = `
    <div><strong>عرض سعر مُقدَّم إلى:</strong> ${r._customer.name} — ${r._customer.phone} ${r._customer.city ? "— " + r._customer.city : ""}</div>
    <div><strong>مقدّم من:</strong> ${currentRep ? currentRep.display_name : ""}</div>
  `;
  $("#printBomBody").innerHTML = items
    .map(
      (it, i) => `<tr>
        <td>${i + 1}</td>
        <td>${it.label || BOM_LABEL_FALLBACK[it.key] || it.key}</td>
        <td>${it.type || "-"}</td>
        <td>${fmt(it.qty)}</td>
      </tr>`
    )
    .join("");
  $("#printGrandTotal").textContent = fmt(r.final_total) + " ﷼";
}

function printQuote() {
  window.print();
}

function attachEvents() {
  $("#calcBtn").addEventListener("click", runCalc);
  $("#saveBtn").addEventListener("click", () => {
    if (!lastResult) return;
    printQuote();
  });
}

async function boot() {
  await initClient();
  if (!client) return;

  const { data: sessionData } = await client.auth.getSession();
  await updateAuthState(sessionData.session);

  client.auth.onAuthStateChange((_event, session) => {
    updateAuthState(session);
  });

  attachEvents();
}

document.addEventListener("DOMContentLoaded", boot);
