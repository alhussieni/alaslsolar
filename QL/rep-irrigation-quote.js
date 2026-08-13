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

let selectedQuoteType = "supply_install";

function attachPresetButtons() {
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedQuoteType = btn.dataset.preset;
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

async function runCalc() {
  const msg = $("#calcMsg");
  const hp = parseFloat($("#hpInput").value);
  const panelId = $("#panelSelect").value;
  const panelText = $("#panelSelect").selectedOptions[0]?.textContent.trim() || "";
  const structureType = $("#structureType").value;
  const discountPct = parseFloat($("#discountPct").value) || 0;
  const custName = $("#custName").value.trim();
  const custPhone = $("#custPhone").value.trim();
  const custCity = $("#custCity").value.trim();

  if (!hp || hp <= 0) { msg.textContent = "أدخل القدرة المطلوبة بالحصان."; msg.className = "rq-msg error"; return; }
  if (!panelId) { msg.textContent = "اختار لوح شمسي."; msg.className = "rq-msg error"; return; }
  if (!custName || custPhone.length < 8) { msg.textContent = "أدخل اسم العميل ورقم هاتف صحيح الأول."; msg.className = "rq-msg error"; return; }

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
    p_quote_type: selectedQuoteType,
    p_notes: null,
  });

  if (error) { msg.textContent = "حصل خطأ: " + error.message; msg.className = "rq-msg error"; return; }

  msg.textContent = "تم الحساب والحفظ بنجاح.";
  msg.className = "rq-msg ok";
  lastResult = data;
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
  $("#pSupplyOnly").textContent = fmt(supplyOnly) + " ﷼";
  $("#pSupplyInstall").textContent = fmt(supplyInstall) + " ﷼";

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

  $("#grandTotal").textContent = fmt(r.final_total) + " ﷼";

  lastResult._quoteType = lastResult._quoteType || selectedQuoteType;
}

function sendWhatsapp() {
  if (!lastResult || !lastInputs) return;
  const phone = lastInputs.custPhone.replace(/\D/g, "").replace(/^0/, "966");
  const msg = `الأصل للطاقة الشمسية\n\nعرض سعر منظومة ري بالطاقة الشمسية\nالعميل: ${lastInputs.custName}\nالقدرة: ${lastInputs.hp} حصان\nالسعر النهائي شامل ضريبة القيمة المضافة: ${fmt(lastResult.final_total)} ﷼\n\nللتواصل: 966561274344+`;
  window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
}

function attachEvents() {
  $("#calcBtn").addEventListener("click", runCalc);
  $("#saveBtn").addEventListener("click", () => {
    if (!lastResult) return;
    $("#calcMsg").textContent = "العرض محفوظ بالفعل (رقم " + lastResult.quote_id + ").";
    $("#calcMsg").className = "rq-msg ok";
  });
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
