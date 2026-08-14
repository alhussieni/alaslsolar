/* ============================================================
   rep-irrigation-quote.js
   حاسبة أسعار منظومة ري بالطاقة الشمسية — واجهة بنفس تخطيط Holoul.
   المحرك الحسابي بالكامل سيرفر-سايد داخل rep_create_irrigation_solar_quote.
   ============================================================ */

let client = null;
let currentRep = null;
let lastResult = null;
let lastInputs = null;

function $(sel) { return document.querySelector(sel); }

function fmt(n) {
  return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 });
}
function fmt1(n) {
  return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 1 });
}
function fmt2(n) {
  return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
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

  await loadPanelBrands();
}

let panelCatalog = []; // كل الألواح المؤهلة (بمواصفات كهربائية كاملة) — بنفلترها محليًا

async function loadPanelBrands() {
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
    .order("brand", { ascending: true })
    .order("power_watt", { ascending: false });

  const brandSel = $("#panelBrandSelect");
  const powerSel = $("#panelSelect");

  if (error || !data || data.length === 0) {
    brandSel.innerHTML = '<option value="">مفيش ألواح بمواصفات كهربائية كاملة — راجع الأدمن</option>';
    powerSel.innerHTML = '<option value=""></option>';
    return;
  }

  panelCatalog = data;
  const brands = [...new Set(data.map((p) => p.brand).filter(Boolean))];
  brandSel.innerHTML = brands.map((b) => `<option value="${b}">${b}</option>`).join("");
  populatePanelPowers(brands[0]);
  brandSel.value = brands[0];
}

function populatePanelPowers(brand) {
  const powerSel = $("#panelSelect");
  const options = panelCatalog.filter((p) => p.brand === brand);
  if (options.length === 0) {
    powerSel.innerHTML = '<option value="">مفيش قدرات متاحة لهذا البراند</option>';
    return;
  }
  powerSel.innerHTML = options
    .map((p) => `<option value="${p.id}">${p.power_watt}W — ${p.name_ar}</option>`)
    .join("");
}

function collectToggles() {
  const out = {};
  document.querySelectorAll("[data-toggle]").forEach((el) => {
    out[el.dataset.toggle] = el.checked;
  });
  return out;
}

let selectedQuoteType = "supply_install";

function attachPresetButtons() {
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedQuoteType = btn.dataset.preset;
      scheduleCalc();
    });
  });
}

const BOM_LABEL_FALLBACK = { panel: "ألواح الطاقة الشمسية", inverter: "الانفرتر" };
const BOM_WARRANTY = {
  panel: "12 سنة ضد عيوب الصناعة / 30 سنة ضد التناقص الإنتاجي عن %80",
  inverter: "سنة واحدة",
  combiner: "سنة واحدة",
  cables: "سنة واحدة",
};

function buildQLCode(hp, invKw, panelText, structureType) {
  const d = new Date();
  const dateStr = d.toLocaleDateString("en-GB").replace(/\//g, "");
  return `QL-${dateStr}-P-${hp} HP-VEICHI ${invKw} KW-${panelText}-${structureType}-`;
}

// ---------- معاينة تلقائية (بدون حفظ، بدون بيانات عميل) ----------
let debounceTimer = null;
function scheduleCalc() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runPreview, 400);
}

async function runPreview() {
  const msg = $("#calcMsg");
  const hp = parseFloat($("#hpInput").value);
  const panelId = $("#panelSelect").value;
  const structureType = $("#structureType").value;
  const discountPct = parseFloat($("#discountPct").value) || 0;

  if (!hp || hp <= 0 || !panelId) {
    $("#resultsWrap").hidden = true;
    return;
  }

  msg.textContent = "جاري الحساب...";
  msg.className = "rq-msg";

  const { data, error } = await client.rpc("preview_irrigation_solar_quote", {
    p_hp: hp,
    p_panel_product_id: panelId,
    p_structure_type: structureType,
    p_toggles: collectToggles(),
    p_discount_pct: discountPct,
  });

  if (error) {
    msg.textContent = "حصل خطأ: " + error.message;
    msg.className = "rq-msg error";
    return;
  }
  if (data && data.error) {
    msg.textContent = "تعذّر الحساب: " + data.error;
    msg.className = "rq-msg error";
    $("#resultsWrap").hidden = true;
    return;
  }

  msg.textContent = "";
  const panelText = $("#panelSelect").selectedOptions[0]?.textContent.trim() || "";
  lastResult = data;
  lastResult._quoteType = selectedQuoteType;
  lastInputs = { hp, panelText, structureType, custName: "", custPhone: "", custCity: "" };
  renderResults(data);
}

// ---------- الحفظ الفعلي (بيانات العميل مطلوبة هنا بس) ----------
async function saveQuote() {
  const msg = $("#calcMsg");
  const custName = $("#custName").value.trim();
  const custPhone = $("#custPhone").value.trim();
  const custCity = $("#custCity").value.trim();

  if (!lastResult || $("#resultsWrap").hidden) {
    msg.textContent = "محتاج تدخل HP ولوح صحيحين الأول عشان يظهر حساب.";
    msg.className = "rq-msg error";
    return;
  }
  if (!custName || custPhone.length < 8) {
    msg.textContent = "أدخل اسم العميل ورقم هاتف صحيح قبل الحفظ.";
    msg.className = "rq-msg error";
    return;
  }

  const hp = parseFloat($("#hpInput").value);
  const panelId = $("#panelSelect").value;
  const structureType = $("#structureType").value;
  const discountPct = parseFloat($("#discountPct").value) || 0;

  msg.textContent = "جاري الحفظ...";
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
    p_quote_type: selectedQuoteType,
    p_notes: null,
  });

  if (error) {
    msg.textContent = "حصل خطأ أثناء الحفظ: " + error.message;
    msg.className = "rq-msg error";
    return;
  }

  msg.textContent = "تم حفظ العرض بنجاح (رقم " + data.quote_id + ").";
  msg.className = "rq-msg ok";
  const panelText = $("#panelSelect").selectedOptions[0]?.textContent.trim() || "";
  lastResult = data;
  lastResult._quoteType = selectedQuoteType;
  lastInputs = { hp, panelText, structureType, custName, custPhone, custCity };
  renderResults(data);
}

function renderResults(r) {
  $("#resultsWrap").hidden = false;

  // بانر العميل والتاريخ
  $("#bannerName").textContent = lastInputs.custName || "—";
  $("#bannerPhone").textContent = lastInputs.custPhone || "—";
  const todayStr = new Date().toLocaleDateString("en-GB");
  $("#bannerDate").textContent = todayStr;
  $("#legalDate").textContent = todayStr;

  // تحذير تجاوز الإنفرتر
  const warnBox = $("#oversizeWarningBox");
  warnBox.innerHTML = r.inverter_oversize_warning
    ? `<div class="warn-banner no-print"><span style="font-size:22px">⚠️</span><div style="font-weight:700;font-size:13px;color:#8A2E1D;line-height:1.6">${r.inverter_oversize_warning}</div></div>`
    : "";

  // ملخص المنظومة
  $("#sumInvTag").textContent = `${r.inverter_brand || "VEICHI"} ${r.inverter_kw} KW`;
  $("#sumKw").textContent = fmt1(r.calc_kw);
  $("#sumPanels").textContent = fmt(r.total_panels);
  $("#sumSarPerKw").textContent = fmt(r.sar_per_kw);

  const items = (r.items || []).filter((it) => it.on);
  const installKeys = ["install_mech", "install_elec"];
  const installTotal = items.filter((it) => installKeys.includes(it.key)).reduce((s, it) => s + Number(it.net || 0), 0);
  const supplyOnly = lastResult._quoteType === "supply_install" ? r.final_total - installTotal : r.final_total;
  const supplyInstall = lastResult._quoteType === "supply_install" ? r.final_total : r.final_total + installTotal;
  $("#pSupplyOnly").textContent = fmt(supplyOnly) + " ج.م";
  $("#pSupplyInstall").textContent = fmt(supplyInstall) + " ج.م";

  // المواصفات الفنية
  $("#mKw").textContent = fmt1(r.calc_kw);
  $("#mPanels").textContent = fmt(r.total_panels);
  $("#mArrays").textContent = fmt(r.arrays);
  $("#mPerString").textContent = fmt(r.panels_per_string);
  $("#mVimp").textContent = fmt1(r.vimp) + "V";
  $("#mVoc").textContent = fmt1(r.voc) + "V";
  $("#mIimp").textContent = fmt1(r.iimp) + "A";
  $("#mIsc").textContent = fmt1(r.isc_calc) + "A";
  $("#mInv").textContent = `${r.inverter_kw} KW`;
  $("#mReactor").textContent = r.reactor_model + "A";
  $("#mCb").textContent = r.cb_size + "A";
  $("#mRatio").textContent = "×" + fmt2(r.efficiency_ratio);

  // العرض المالي / كود العرض
  $("#offerIntro").textContent = `نتشرف بتقديم عرض سعر منظومة توليد الكهرباء من خلال الطاقة الشمسية للتشغيل راس كهرباء /محرك غطاس ${lastInputs.hp} حصان`;
  $("#submittedByLine").textContent = currentRep ? `📋 قدّم هذا العرض: ${currentRep.display_name}` : "";
  $("#qlCode").textContent = buildQLCode(lastInputs.hp, r.inverter_kw, lastInputs.panelText.replace(/\s+/g, ""), lastInputs.structureType);

  // جدول البنود
  $("#bomBody").innerHTML = items
    .map(
      (it, i) => `<tr>
        <td>${i + 1}</td>
        <td class="bom-label">${it.label || BOM_LABEL_FALLBACK[it.key] || it.key}</td>
        <td style="font-size:11.5px;color:var(--muted)">${it.type || "-"}</td>
        <td style="font-size:11.5px">${fmt(it.qty)}</td>
        <td style="font-size:11.5px">${BOM_WARRANTY[it.key] || "لا يوجد"}</td>
      </tr>`
    )
    .join("");

  $("#grandTotal").textContent = fmt(r.final_total) + " ج.م";

  lastResult._quoteType = lastResult._quoteType || selectedQuoteType;
}

function sendWhatsapp() {
  if (!lastResult || !lastInputs) return;
  const phone = lastInputs.custPhone.replace(/\D/g, "").replace(/^0/, "20");
  const msg = `الأصل للطاقة الشمسية\n\nعرض سعر منظومة ري بالطاقة الشمسية\nالعميل: ${lastInputs.custName}\nالقدرة: ${lastInputs.hp} حصان\nالسعر النهائي شامل ضريبة القيمة المضافة: ${fmt(lastResult.final_total)} ج.م\n\nللتواصل: 201200074344+`;
  window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
}

function attachEvents() {
  // الحساب التلقائي: أي تغيير في المدخلات الهندسية يعيد المعاينة، من غير زرار
  $("#hpInput").addEventListener("input", scheduleCalc);
  $("#structureType").addEventListener("change", scheduleCalc);
  $("#discountPct").addEventListener("input", scheduleCalc);
  $("#panelSelect").addEventListener("change", scheduleCalc);
  $("#panelBrandSelect").addEventListener("change", (e) => {
    populatePanelPowers(e.target.value);
    scheduleCalc();
  });
  document.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("change", scheduleCalc));

  $("#custName").addEventListener("input", (e) => { $("#bannerName").textContent = e.target.value.trim() || "—"; });
  $("#custPhone").addEventListener("input", (e) => { $("#bannerPhone").textContent = e.target.value.trim() || "—"; });

  $("#saveBtn").addEventListener("click", saveQuote);
  $("#printBtn").addEventListener("click", () => window.print());
  $("#waBtn").addEventListener("click", sendWhatsapp);
  attachPresetButtons();
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
