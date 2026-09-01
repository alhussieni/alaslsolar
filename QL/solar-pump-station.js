/* ============================================================
   solar-pump-station.js
   محطة ري بالطاقة الشمسية — للمندوب. كل حسابات التكلفة/الخصم/الربح
   بتحصل في Edge Function اسمها solar-pump-quote (service_role)،
   الصفحة دي بس بتبعت المدخلات وتعرض السعر النهائي الراجع، ومعندهاش
   وصول مباشر لنسب خصم الموردين ولا التكلفة الداخلية.
   ============================================================ */

let client = null;
let currentSession = null;
let currentMount = "fixed";
let currentSupply = "supply_only";
let lastResult = null;

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
function fmt(n) { return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 }); }

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

  await loadPanels();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const authMsg = $("[data-auth-message]");
  authMsg.textContent = "جاري الدخول...";
  authMsg.className = "form-note";
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    authMsg.textContent = "بيانات الدخول غير صحيحة.";
    authMsg.className = "form-note error";
    return;
  }
  authMsg.textContent = "";
  await updateAuthState(data.session);
}

async function handleLogout() {
  await client.auth.signOut();
  await updateAuthState(null);
}

/* ---------------- تحميل الألواح والغطاسات من الكتالوج الحقيقي ---------------- */
/* ملاحظة: السعر المعروض هنا هو price المعلن العام — مش خصم، فمفيش أي حساسية
   في قراءته مباشرة من المتصفح، نفس منتجات الموقع العام بالظبط. */

async function loadPanels() {
  const sel = $("#panelSelect");
  const { data, error } = await client
    .from("products")
    .select("id,brand,name_ar,power_watt,vimp")
    .eq("category", "panels").eq("published", true)
    .not("vimp", "is", null).not("power_watt", "is", null)
    .order("power_watt", { ascending: false });

  if (error || !data || !data.length) {
    sel.innerHTML = `<option value="">مفيش ألواح متاحة حاليًا</option>`;
    return;
  }
  sel.innerHTML = data.map((p) => `<option value="${p.id}">${p.brand} ${p.power_watt}W</option>`).join("");
}

async function loadPumpsForHp(hp) {
  const sel = $("#pumpSelect");
  if (!hp || hp <= 0) { sel.innerHTML = `<option value="">— اختيار تلقائي —</option>`; return; }
  const { data } = await client
    .from("products")
    .select("id,brand,name_ar,power_hp")
    .in("category", ["well_motors", "pumps"]).eq("published", true).eq("in_stock", true)
    .gte("power_hp", hp * 0.9).lte("power_hp", hp * 1.15)
    .order("power_hp", { ascending: true });
  const opts = (data || []).map((p) => `<option value="${p.id}">${p.brand} ${p.name_ar} (${p.power_hp} HP)</option>`).join("");
  sel.innerHTML = `<option value="">— اختيار تلقائي —</option>${opts}`;
}

/* ---------------- أزرار التبديل (تثبيت / نوع العرض) ---------------- */

function setSeg(groupSelector, dataAttr, value, cb) {
  $$(groupSelector).forEach((b) => b.classList.toggle("active", b.dataset[dataAttr] === value));
  cb(value);
}

/* ---------------- الحساب (نداء Edge Function) ---------------- */

async function calcQuote() {
  const msg = $("[data-calc-message]");
  const hp = parseFloat($("#hpInput").value);
  const panelId = $("#panelSelect").value;
  const includePump = $("#includePumpChk").checked;
  const pumpId = $("#pumpSelect").value || null;

  if (!hp || hp <= 0) { msg.textContent = "دخّل قدرة الغطاس بالحصان."; msg.className = "form-note error"; return; }
  if (!panelId) { msg.textContent = "اختار نوع اللوح الشمسي."; msg.className = "form-note error"; return; }

  msg.textContent = "جاري الحساب..."; msg.className = "form-note";
  $("#calcBtn").disabled = true;

  const { data: sessionData } = await client.auth.getSession();
  const jwt = sessionData?.session?.access_token;
  if (!jwt) { msg.textContent = "الجلسة منتهية، سجّل دخول تاني."; msg.className = "form-note error"; $("#calcBtn").disabled = false; return; }

  try {
    const { data, error } = await client.functions.invoke("solar-pump-quote", {
      body: {
        action: "quote", hp, panel_product_id: panelId,
        supply_type: currentSupply, structure_mount: currentMount,
        include_pump: includePump, pump_product_id: pumpId,
      },
    });
    $("#calcBtn").disabled = false;

    if (error || data?.error) {
      msg.textContent = data?.error || ("تعذر الحساب: " + error.message);
      msg.className = "form-note error";
      return;
    }

    msg.textContent = ""; lastResult = data;
    renderResult(data);
  } catch (e) {
    $("#calcBtn").disabled = false;
    msg.textContent = "تعذر الاتصال بالخادم: " + e.message;
    msg.className = "form-note error";
  }
}

function renderResult(r) {
  $("[data-result-card]").hidden = false;

  const s = r.specs;
  $("[data-specs-grid]").innerHTML = `
    <div class="spec-box"><div class="val">${fmt(s.calcKW)}</div><div class="lbl">KW فعلي</div></div>
    <div class="spec-box"><div class="val">${fmt(s.totalPanels)}</div><div class="lbl">عدد الألواح</div></div>
    <div class="spec-box"><div class="val">${fmt(s.arrays)}</div><div class="lbl">عدد السلاسل</div></div>
    <div class="spec-box"><div class="val">${fmt(s.panelsPerString)}</div><div class="lbl">ألواح/سلسلة</div></div>
    <div class="spec-box"><div class="val">${fmt(s.Vimp)}V</div><div class="lbl">Vimp الكلي</div></div>
    <div class="spec-box"><div class="val">${fmt(s.Voc)}V</div><div class="lbl">Voc الكلي</div></div>
    <div class="spec-box"><div class="val">${s.inverterModel}</div><div class="lbl">الإنفرتر</div></div>
    <div class="spec-box"><div class="val">${fmt(s.sarPerKW)}</div><div class="lbl">ج.م / KW</div></div>
  `;

  const warnBox = $("[data-inverter-warning]");
  if (s.inverterWarning) { warnBox.hidden = false; warnBox.textContent = s.inverterWarning; }
  else { warnBox.hidden = true; }

  $("[data-items-body]").innerHTML = r.items.map((it) => `
    <tr><td>${it.label}</td><td>${it.type}</td><td>${it.qty}</td><td>${fmt(it.sell)} ج.م</td></tr>
  `).join("");

  $("[data-subtotal]").textContent = fmt(r.sellTotal);
  $("[data-grand-total]").textContent = fmt(r.finalTotal);
}

/* ---------------- الحفظ والطباعة ---------------- */

async function saveAndPrint() {
  const msg = $("[data-save-message]");
  if (!lastResult) { msg.textContent = "احسب العرض الأول."; msg.className = "form-note error"; return; }

  const name = $("#custName").value.trim();
  const phone = $("#custPhone").value.trim();
  if (!name || !phone) { msg.textContent = "اسم العميل ورقم الهاتف مطلوبين."; msg.className = "form-note error"; return; }

  msg.textContent = "جاري الحفظ..."; msg.className = "form-note";
  $("#saveQuoteBtn").disabled = true;

  const hp = parseFloat($("#hpInput").value);
  const panelId = $("#panelSelect").value;
  const includePump = $("#includePumpChk").checked;
  const pumpId = $("#pumpSelect").value || null;

  try {
    const { data, error } = await client.functions.invoke("solar-pump-quote", {
      body: {
        action: "save", hp, panel_product_id: panelId,
        supply_type: currentSupply, structure_mount: currentMount,
        include_pump: includePump, pump_product_id: pumpId,
        customer_name: name, customer_phone: phone,
      },
    });
    $("#saveQuoteBtn").disabled = false;

    if (error || data?.error) {
      msg.textContent = data?.error || ("تعذر الحفظ: " + error.message);
      msg.className = "form-note error";
      return;
    }

    msg.textContent = `تم حفظ العرض رقم #${data.quote_id}.`;
    msg.className = "form-note ok";
    printQuote(data, name, phone);
  } catch (e) {
    $("#saveQuoteBtn").disabled = false;
    msg.textContent = "تعذر الاتصال بالخادم: " + e.message;
    msg.className = "form-note error";
  }
}

function printQuote(r, custName, custPhone) {
  const area = document.getElementById("printArea");
  const dateStr = new Date().toLocaleDateString("ar-EG");
  const supplyLabel = r.supplyType === "supply_install" ? "توريد وتركيب شامل الضمان" : "توريد خامات فقط";

  const rows = r.items.map((it) => `
    <tr><td>${it.label}</td><td>${it.type}</td><td>${it.qty}</td><td>${it.warranty}</td><td>${fmt(it.sell)} ج.م</td></tr>
  `).join("");

  area.innerHTML = `
    <img class="print-letterhead" src="letterhead.jpg" alt="الأصل للطاقة الشمسية">
    <div class="print-body">
      <div class="print-meta">
        <div><strong>عرض سعر مُقدَّم إلى:</strong> ${custName} — ${custPhone}</div>
        <div><strong>تاريخ العرض:</strong> ${dateStr}</div>
      </div>
      <div class="print-intro">
        تحية طيبة وبعد،<br>
        نتشرف بتقديم عرض سعر منظومة توليد الكهرباء من خلال الطاقة الشمسية لتشغيل محطة ري / محرك غطاس
        بقدرة ${$("#hpInput").value} حصان — ${supplyLabel}${r.includePump ? " (شامل الغطاس)" : ""}.
      </div>
      <table class="print-table">
        <thead><tr><th>المكونات</th><th>النوع</th><th>العدد</th><th>الضمان</th><th>السعر</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="print-totals">
        <div class="row"><span>الإجمالي قبل الضريبة</span><span>${fmt(r.sellTotal)} ج.م</span></div>
        <div class="row grand"><span>السعر النهائي</span><span>${fmt(r.finalTotal)} ج.م</span></div>
      </div>
      <div class="print-terms">
        الارتباط بهذا السعر لمدة ثلاثة أيام فقط من تاريخ العرض (${dateStr}).<br>
        يقع على عاتق العميل تجهيز الموقع (أعمال الحفر والصب اللازمة) قبل موعد التوريد.<br>
        نلتزم بتوفير الدعم الفني وقطع الغيار للمنظومة حتى 10 سنوات من تاريخ التشغيل.
      </div>
      <div class="print-footer">الأصل للطاقة الشمسية — alaslsolar.com — هذا العرض قابل للتغيير حسب الأسعار وقت التعاقد.</div>
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
  $("#calcBtn").addEventListener("click", calcQuote);
  $("#saveQuoteBtn").addEventListener("click", saveAndPrint);

  $$("[data-mount]").forEach((b) => b.addEventListener("click", () => setSeg("[data-mount]", "mount", b.dataset.mount, (v) => { currentMount = v; })));
  $$("[data-supply]").forEach((b) => b.addEventListener("click", () => setSeg("[data-supply]", "supply", b.dataset.supply, (v) => { currentSupply = v; })));

  $("#includePumpChk").addEventListener("change", (e) => {
    $("[data-pump-wrap]").hidden = !e.target.checked;
    if (e.target.checked) loadPumpsForHp(parseFloat($("#hpInput").value));
  });
  $("#hpInput").addEventListener("change", () => {
    if ($("#includePumpChk").checked) loadPumpsForHp(parseFloat($("#hpInput").value));
  });

  client.auth.onAuthStateChange((_event, session) => { updateAuthState(session); });
  const { data } = await client.auth.getSession();
  await updateAuthState(data.session);
});
