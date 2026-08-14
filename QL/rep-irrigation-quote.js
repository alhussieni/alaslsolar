/* ============================================================
   rep-irrigation-quote.js
   حاسبة أسعار منظومة ري بالطاقة الشمسية.
   منطق تسمية الملف والطباعة منقول من AlaslSolarEgypt-QL،
   مربوط بمحرك الحساب في Supabase (preview/rep_create_irrigation_solar_quote).
   ============================================================ */

let client = null;
let currentRep = null;
let lastResult = null;
let lastInputs = null;
let panelCatalog = [];
let selectedQuoteType = "supply_install";

function $(sel) { return document.querySelector(sel); }
function fmt(n) { return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 }); }

async function initClient() {
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
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
  if (!session) { authPanel.hidden = false; repPanel.hidden = true; userName.textContent = ""; return; }
  const rep = await checkRepStatus(session.user.id);
  if (!rep) { authPanel.hidden = false; repPanel.hidden = true; userName.textContent = ""; return; }
  currentRep = rep;
  authPanel.hidden = true;
  repPanel.hidden = false;
  userName.textContent = rep.display_name;
  await loadPanelBrands();
}

async function loadPanelBrands() {
  const { data, error } = await client
    .from("products")
    .select("id, name_ar, brand, power_watt, vimp, voc, iimp, isc, price")
    .eq("category", "panels").eq("published", true)
    .not("power_watt", "is", null).not("vimp", "is", null).not("voc", "is", null)
    .not("iimp", "is", null).not("isc", "is", null)
    .order("brand", { ascending: true }).order("power_watt", { ascending: false });

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
  if (options.length === 0) { powerSel.innerHTML = '<option value="">مفيش قدرات متاحة</option>'; return; }
  powerSel.innerHTML = options.map((p) => `<option value="${p.id}">${p.power_watt}W — ${p.name_ar}</option>`).join("");
}

const PRESET_TOGGLES = {
  supply_only: ["panel", "inverter", "combiner", "mc4", "cables"],
  supply_install: ["panel", "inverter", "ip65", "combiner", "cables", "mc4", "structure", "concrete", "install_mech", "install_elec", "transport"],
};
function applyPresetToggles(preset) {
  const onKeys = PRESET_TOGGLES[preset] || [];
  document.querySelectorAll("[data-toggle]").forEach((el) => { el.checked = onKeys.includes(el.dataset.toggle); });
}

function collectToggles() {
  const out = {};
  document.querySelectorAll("[data-toggle]").forEach((el) => { out[el.dataset.toggle] = el.checked; });
  return out;
}

/* تسمية عرض السعر — نفس صيغة AlaslSolarEgypt-QL:
   QL-تاريخ-P-حصان الموتور-براند الانفرتر وقدرته-براند اللوح وقدرته-نوع الشاسية-اسم العميل-رقم الهاتف */
function sanitizeFilenamePart(s) { return String(s).replace(/[\/\\:*?"<>|]/g, "").trim(); }

function buildQuoteFilename(r, hp, panelBrand, panelPower, structureType, custName, custPhone) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, "0")}${months[now.getMonth()]}${now.getFullYear()}`;
  const motorHP = `${hp} HP`;
  const invSeg = `${r.inverter_brand} ${r.inverter_kw} KW`;
  const panelSeg = `${panelBrand}${panelPower}`;
  const parts = ["QL", dateStr, "P", motorHP, invSeg, panelSeg, structureType, custName || "Client", custPhone || ""]
    .filter((p) => p !== "").map(sanitizeFilenamePart);
  return parts.join("-");
}

async function runPreview() {
  const msg = $("#calcMsg");
  const hp = parseFloat($("#hpInput").value);
  const panelId = $("#panelSelect").value;
  const structureType = $("#structureType").value;
  const discountPct = parseFloat($("#discountPct").value) || 0;

  if (!hp || hp <= 0 || !panelId) { $("#resultsWrap").hidden = true; return; }

  msg.textContent = "جاري الحساب...";
  msg.className = "rq-msg";

  const { data, error } = await client.rpc("preview_irrigation_solar_quote", {
    p_hp: hp, p_panel_product_id: panelId, p_structure_type: structureType,
    p_toggles: collectToggles(), p_discount_pct: discountPct,
  });

  if (error) { msg.textContent = "حصل خطأ: " + error.message; msg.className = "rq-msg error"; return; }
  if (data && data.error) { msg.textContent = "تعذّر الحساب: " + data.error; msg.className = "rq-msg error"; $("#resultsWrap").hidden = true; return; }

  msg.textContent = "";
  const panelOpt = $("#panelSelect").selectedOptions[0];
  const panelBrand = $("#panelBrandSelect").value;
  const panelPower = panelOpt ? panelOpt.textContent.split("W")[0].trim() : "";
  lastResult = data;
  lastInputs = { hp, panelBrand, panelPower, structureType, custName: "", custPhone: "" };
  renderScreen(data);
}

async function saveQuote() {
  const msg = $("#calcMsg");
  const custName = $("#custName").value.trim();
  const custPhone = $("#custPhone").value.trim();

  if (!lastResult || $("#resultsWrap").hidden) { msg.textContent = "محتاج تدخل HP ولوح صحيحين الأول."; msg.className = "rq-msg error"; return; }
  if (!custName || custPhone.length < 8) { msg.textContent = "أدخل اسم العميل ورقم هاتف صحيح قبل الحفظ."; msg.className = "rq-msg error"; return; }

  const hp = parseFloat($("#hpInput").value);
  const panelId = $("#panelSelect").value;
  const structureType = $("#structureType").value;
  const discountPct = parseFloat($("#discountPct").value) || 0;

  msg.textContent = "جاري الحفظ...";
  msg.className = "rq-msg";

  const { data, error } = await client.rpc("rep_create_irrigation_solar_quote", {
    p_customer_name: custName, p_customer_phone: custPhone, p_customer_city: null,
    p_hp: hp, p_panel_product_id: panelId, p_structure_type: structureType,
    p_toggles: collectToggles(), p_discount_pct: discountPct,
    p_quote_type: selectedQuoteType, p_notes: null,
  });

  if (error) { msg.textContent = "حصل خطأ أثناء الحفظ: " + error.message; msg.className = "rq-msg error"; return; }
  if (data && data.error) { msg.textContent = "تعذّر الحفظ: " + data.error; msg.className = "rq-msg error"; return; }

  msg.textContent = "تم حفظ العرض بنجاح (رقم " + data.quote_id + ").";
  msg.className = "rq-msg ok";
  const panelOpt = $("#panelSelect").selectedOptions[0];
  const panelBrand = $("#panelBrandSelect").value;
  const panelPower = panelOpt ? panelOpt.textContent.split("W")[0].trim() : "";
  lastResult = data;
  lastInputs = { hp, panelBrand, panelPower, structureType, custName, custPhone };
  renderScreen(data);
}

function renderScreen(r) {
  $("#resultsWrap").hidden = false;

  const warnBox = $("#oversizeWarningBox");
  warnBox.innerHTML = r.inverter_oversize_warning ? `<div class="warn-banner">⚠️ ${r.inverter_oversize_warning}</div>` : "";

  $("#sumInvTag").textContent = `${r.inverter_brand || ""} ${r.inverter_kw} KW`;
  $("#mKw").textContent = fmt(r.calc_kw);
  $("#mPanels").textContent = fmt(r.total_panels);
  $("#mArrays").textContent = fmt(r.arrays);
  $("#mPerString").textContent = fmt(r.panels_per_string);
  $("#mVimp").textContent = fmt(r.vimp) + "V";
  $("#mVoc").textContent = fmt(r.voc) + "V";
  $("#mIimp").textContent = fmt(r.iimp) + "A";
  $("#mIsc").textContent = fmt(r.isc_calc) + "A";
  $("#mInv").textContent = `${r.inverter_kw} KW`;
  $("#mReactor").textContent = r.reactor_model + "A";
  $("#mCb").textContent = r.cb_size + "A";
  $("#mRatio").textContent = "×" + Number(r.efficiency_ratio).toFixed(2);

  $("#rowsBody").innerHTML = (r.rows || [])
    .map((row) => `<tr>
      <td style="padding:6px;border-bottom:1px solid #EFEBE0">${row.n}</td>
      <td style="padding:6px;border-bottom:1px solid #EFEBE0;font-weight:600">${row.name}</td>
      <td style="padding:6px;border-bottom:1px solid #EFEBE0;font-size:12px;color:var(--muted)">${row.type}</td>
      <td style="padding:6px;border-bottom:1px solid #EFEBE0;font-size:12px">${row.qty}</td>
      <td style="padding:6px;border-bottom:1px solid #EFEBE0;font-size:12px">${row.origin}</td>
      <td style="padding:6px;border-bottom:1px solid #EFEBE0;font-size:12px">${row.warranty}</td>
    </tr>`).join("");

  $("#grandTotal").textContent = fmt(r.final_total) + " ج.م";

  $("#paymentBody").innerHTML = (r.payment_terms || [])
    .map((t) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--line);font-size:13px">
      <span>${t.label} (${t.pct}%)</span><span class="num" style="font-weight:700">${fmt(t.amount)} ج.م</span>
    </div>`).join("");
}

function buildPrintTemplate() {
  const r = lastResult;
  const i = lastInputs;
  if (!r || !i) return false;

  const filename = buildQuoteFilename(r, i.hp, i.panelBrand, i.panelPower, i.structureType, i.custName, i.custPhone);
  $("#pqQuoteNo").textContent = filename;
  $("#pqDate").textContent = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  $("#pqClient").textContent = i.custName || "غير محدد";
  $("#pqPhone").textContent = i.custPhone || "غير محدد";
  $("#pqRequestedKW").textContent = `${i.hp} حصان`;
  $("#pqStructureType").textContent = i.structureType === "FIXED" ? "ثابت (Fixed)" : "متحرك (Rotational)";

  const specs = [
    ["عدد الألواح", `${r.total_panels}`],
    ["القدرة المصممة", `${r.calc_kw} KW`],
    ["موديل الانفرتر", `${r.inverter_brand} ${r.inverter_kw} KW`],
    ["فولت السلسلة", `${r.vimp} V`],
    ["القاطع الرئيسي", `${r.cb_size} A`],
  ];
  $("#pqSpecs").innerHTML = specs.map(([k, v]) => `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  $("#pqOfferBody").innerHTML = (r.rows || [])
    .map((row) => `<tr><td>${row.n}</td><td>${row.name}</td><td>${row.type}</td><td>${row.qty}</td><td>${row.origin}</td><td>${row.warranty}</td></tr>`)
    .join("");

  $("#pqGrandTotalValue").textContent = fmt(r.final_total) + " ج.م";

  $("#pqPayment").innerHTML = (r.payment_terms || [])
    .map((t) => `<div class="row"><span>${t.label} (${t.pct}%)</span><span>${fmt(t.amount)} ج.م</span></div>`).join("");

  return filename;
}

function doPrint() {
  const filename = buildPrintTemplate();
  if (!filename) { $("#calcMsg").textContent = "احسب المنظومة الأول قبل الطباعة."; $("#calcMsg").className = "rq-msg error"; return; }
  const printEl = document.getElementById("printQuote");
  printEl.classList.add("pq-active");
  const prevTitle = document.title;
  document.title = filename;
  window.print();
  window.addEventListener("afterprint", function restore() {
    printEl.classList.remove("pq-active");
    document.title = prevTitle;
    window.removeEventListener("afterprint", restore);
  });
}

function sendWhatsapp() {
  if (!lastResult || !lastInputs) return;
  const phone = lastInputs.custPhone.replace(/\D/g, "").replace(/^0/, "20");
  const msg = `الأصل للطاقة الشمسية\n\nعرض سعر منظومة ري بالطاقة الشمسية\nالعميل: ${lastInputs.custName}\nالقدرة: ${lastInputs.hp} حصان\nالسعر الإجمالي (غير شامل ض.ق.م): ${fmt(lastResult.final_total)} ج.م\n\nللتواصل: 201200074344+`;
  window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
}

let debounceTimer = null;
function scheduleCalc() { clearTimeout(debounceTimer); debounceTimer = setTimeout(runPreview, 400); }

function attachEvents() {
  $("#hpInput").addEventListener("input", scheduleCalc);
  $("#structureType").addEventListener("change", scheduleCalc);
  $("#discountPct").addEventListener("input", scheduleCalc);
  $("#panelSelect").addEventListener("change", scheduleCalc);
  $("#panelBrandSelect").addEventListener("change", (e) => { populatePanelPowers(e.target.value); scheduleCalc(); });
  document.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("change", scheduleCalc));

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedQuoteType = btn.dataset.preset;
      applyPresetToggles(selectedQuoteType);
      scheduleCalc();
    });
  });

  $("#saveBtn").addEventListener("click", saveQuote);
  $("#printBtn").addEventListener("click", doPrint);
  $("#waBtn").addEventListener("click", sendWhatsapp);
}

async function boot() {
  applyPresetToggles(selectedQuoteType);
  await initClient();
  if (!client) return;
  const { data: sessionData } = await client.auth.getSession();
  await updateAuthState(sessionData.session);
  client.auth.onAuthStateChange((_event, session) => { updateAuthState(session); });
  attachEvents();
}

document.addEventListener("DOMContentLoaded", boot);
