/* ============================================================
   rep-quotes.js
   منطق صفحة عروض الأسعار الخاصة بالمناديب.
   يعتمد على supabase-config.js (نفس إعدادات باقي الموقع).
   ============================================================ */

const CATEGORY_LABELS = {
  pumps: "مضخات",
  well_motors: "موتورات آبار",
  inverters: "إنفرترات",
  garden_lights: "إنارة حدائق",
  pipes: "مواسير",
  panels: "ألواح شمسية",
  accessories: "إكسسوارات",
  street_lights: "إنارة شوارع",
  combiners: "صناديق تجميع",
  batteries: "بطاريات",
  offgrid: "أنظمة أوف جريد",
  flood_lights: "كشافات",
  solar_safety: "حماية وأمان",
  structures: "شاسيهات",
  cables: "كابلات",
  solar_kits: "باقات شمسية",
};

let client = null;
let currentSession = null;
let cart = []; // { productId, name, unitPrice, qty }
let quoteType = "supply_only";
let draftSaveTimer = null; // مؤقّت الحفظ التلقائي للمسودّة (debounce)

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function fmt(n) {
  return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 });
}

async function initClient() {
  // ننتظر تحميل مكتبة supabase و supabase-config.js (defer)
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  client = window.getAlaslSupabase ? window.getAlaslSupabase() : null;
  return client;
}

async function checkRepStatus(userId) {
  const { data, error } = await client
    .from("reps")
    .select("id, display_name, active, can_access_products")
    .eq("id", userId)
    .maybeSingle();
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
    authPanel.hidden = false;
    repPanel.hidden = true;
    logoutBtn.hidden = true;
    userName.textContent = "";
    return;
  }

  const rep = await checkRepStatus(session.user.id);
  if (!rep) {
    authMsg.textContent = "هذا الحساب غير مفعّل كمندوب. تواصل مع الأدمن.";
    authMsg.className = "rq-msg error";
    await client.auth.signOut();
    authPanel.hidden = false;
    repPanel.hidden = true;
    logoutBtn.hidden = true;
    return;
  }

  authPanel.hidden = true;
  repPanel.hidden = false;
  logoutBtn.hidden = false;
  userName.textContent = rep.display_name;

  if (!rep.can_access_products) {
    repPanel.innerHTML = `<div class="card" style="text-align:center;padding:40px 18px;color:var(--muted)">
      <i class="fa-solid fa-lock" style="font-size:22px;color:#b23b23;margin-bottom:8px"></i><br>
      معندكش صلاحية الوصول لعروض المنتجات. تواصل مع الأدمن لو محتاج الصلاحية دي.
    </div>`;
    return;
  }

  await loadCategories();
  await loadMyQuotes();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const authMsg = $("[data-auth-message]");
  authMsg.textContent = "جاري الدخول...";
  authMsg.className = "rq-msg";

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    authMsg.textContent = "بيانات الدخول غير صحيحة.";
    authMsg.className = "rq-msg error";
    return;
  }
  authMsg.textContent = "";
  await updateAuthState(data.session);
}

async function handleLogout() {
  await client.auth.signOut();
  await updateAuthState(null);
}

/* ---------------- المنتجات ---------------- */

async function loadCategories() {
  const sel = $("#categorySelect");
  sel.innerHTML = "";
  Object.entries(CATEGORY_LABELS).forEach(([key, label]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", loadProductsForCategory);
  await loadProductsForCategory();
}

/* أسماء كتير في الداتا بيز متطابقة (مثلًا كل إنفرترات Delixi اسمها "إنفرتر Delixi")، والفرق الحقيقي بينها
   في specs_ar (القدرة) و model_available (الموديل). بنضيفهم للاسم بس لما الاسم مش فريد جوه نفس الفئة،
   عشان باقي المنتجات تفضل أسماءها القصيرة زي ما هي. */
const nameCountsByCategory = new Map(); // category -> Map(اسم -> عدد المنتجات بنفس الاسم)

function productBaseName(p) { return p.name_ar || p.name_en || "منتج"; }

function countNames(rows) {
  const counts = new Map();
  rows.forEach((p) => { const n = productBaseName(p); counts.set(n, (counts.get(n) || 0) + 1); });
  return counts;
}

// رقم المواصفة بدون أصفار زيادة (4.10 -> 4)، أو null لو مش متسجّل
function specNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

/* الإنفرترات: دايمًا "الماركة الموديل - القدرة kW/HP" (مثال: VEICHI SI23 - 75KW/100HP)،
   عشان المندوب والعميل يميّزوا الصنف ويقارنوا السعر. لو أي حقل ناقص نرجع للصيغة العامة. */
function inverterLabel(p) {
  const kw = specNum(p.power_kw);
  const hp = specNum(p.power_hp);
  if (!p.brand || kw == null || hp == null) return null;
  const head = [p.brand, (p.model_available || "").trim()].filter(Boolean).join(" ");
  return `${head} - ${kw}KW/${hp}HP`;
}

/* البطاريات: السعة المخزّنة بالـKWH = AH × V ÷ 1000 (مثال: 100AH × 24V = 2.4KWH)، بتتضاف بجانب الاسم.
   دي سعة اسمية (نظرية) — مش السعة القابلة للاستخدام (بتتأثر بـDoD). لو الاسم فيه kWh أصلًا أو AH/V ناقصين
   مبنضيفش حاجة. voltage_v في الداتا بيز هو الفولت الاسمي المقرّب (12/24/48)، مش 12.8/25.6/51.2. */
function batteryKwh(p) {
  const ah = Number(p.capacity_ah);
  const v = Number(p.voltage_v);
  if (!(ah > 0) || !(v > 0)) return null;
  return String(Math.round((ah * v) / 10) / 100); // kWh لأقرب خانتين عشريتين
}

function buildProductLabel(p, nameCounts) {
  if (p.category === "inverters") {
    const inv = inverterLabel(p);
    if (inv) return inv;
  }
  if (p.category === "batteries") {
    const base = productBaseName(p);
    const kwh = batteryKwh(p);
    return kwh && !/kwh/i.test(base) ? `${base} — ${kwh}KWH` : base;
  }
  const base = productBaseName(p);
  if ((nameCounts?.get(base) || 0) <= 1) return base;
  const parts = [base];
  const specs = (p.specs_ar || "").trim();
  if (specs && !base.includes(specs)) parts.push(specs);
  const model = (p.model_available || "").trim();
  if (model && !base.includes(model)) parts.push("موديل " + model);
  return parts.join(" — ");
}

async function loadProductsForCategory() {
  const category = $("#categorySelect").value;
  const productSel = $("#productSelect");
  productSel.innerHTML = "<option>...جاري التحميل</option>";

  const { data, error } = await client
    .from("products")
    .select("id, category, brand, name_ar, name_en, specs_ar, model_available, power_kw, power_hp, capacity_ah, voltage_v, price")
    .eq("category", category)
    .eq("published", true)
    .eq("in_stock", true) // غير متاح = لا يظهر في أي أداة
    .order("name_ar", { ascending: true })
    .order("power_kw", { ascending: true, nullsFirst: false }) // الأسماء المتكررة تترتب بالقدرة من الأصغر للأكبر
    .order("price", { ascending: true });

  productSel.innerHTML = "";
  if (error || !data) {
    productSel.innerHTML = "<option>تعذر تحميل المنتجات</option>";
    return;
  }
  const nameCounts = countNames(data);
  nameCountsByCategory.set(category, nameCounts);

  data.forEach((p) => {
    const label = buildProductLabel(p, nameCounts);
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.dataset.name = label;
    opt.dataset.price = p.price || 0;
    opt.textContent = `${label} — ${fmt(p.price)} ج.م`;
    productSel.appendChild(opt);
  });
}

/* الدالة rep_create_quote بتخزّن name_ar بس في بنود العرض، فكل الإنفرترات بتطلع بنفس الاسم.
   وقت الطباعة بنرجّع الاسم المميّز من جدول products بالـ product_id (بنود قديمة من غير product_id
   أو منتج اتشال من الكتالوج بتفضل باسمها المحفوظ). */
async function withProductLabels(items) {
  const list = items || [];
  const ids = [...new Set(list.map((it) => it.product_id).filter(Boolean))];
  if (!ids.length) return list;

  const { data: prods, error } = await client
    .from("products")
    .select("id, category, brand, name_ar, name_en, specs_ar, model_available, power_kw, power_hp, capacity_ah, voltage_v")
    .in("id", ids);
  if (error || !prods) return list;

  for (const category of new Set(prods.map((p) => p.category))) {
    if (nameCountsByCategory.has(category)) continue;
    const { data: rows } = await client
      .from("products")
      .select("name_ar, name_en")
      .eq("category", category)
      .eq("published", true)
      .eq("in_stock", true);
    if (rows) nameCountsByCategory.set(category, countNames(rows));
  }

  const byId = new Map(prods.map((p) => [p.id, p]));
  return list.map((it) => {
    const p = byId.get(it.product_id);
    return p ? { ...it, name: buildProductLabel(p, nameCountsByCategory.get(p.category)) } : it;
  });
}

function addProductToCart() {
  const productSel = $("#productSelect");
  const opt = productSel.selectedOptions[0];
  if (!opt) return;
  const qty = Math.max(1, parseInt($("#qtyInput").value, 10) || 1);

  const existing = cart.find((c) => c.productId === opt.value);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      productId: opt.value,
      name: opt.dataset.name,
      unitPrice: parseFloat(opt.dataset.price) || 0,
      qty,
      note: "", // ملاحظة توضيحية للعميل (بتظهر في عمود "ملاحظات" في العرض المطبوع)
    });
  }
  renderCart();
}

function renderCart() {
  const body = $("#cartBody");
  body.innerHTML = "";
  cart.forEach((item, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${fmt(item.unitPrice)}</td>
      <td><input type="number" min="1" value="${item.qty}" data-idx="${idx}" class="cart-qty"></td>
      <td>${fmt(item.unitPrice * item.qty)}</td>
      <td><input type="text" maxlength="300" value="${escHtml(item.note || "")}" data-idx="${idx}" class="cart-note" placeholder="ملاحظة للعميل (اختياري)"></td>
      <td><button type="button" class="rq-remove" data-idx="${idx}">حذف</button></td>
    `;
    body.appendChild(tr);
  });
  $$(".cart-qty").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      cart[idx].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      renderCart();
    });
  });
  // الملاحظة بتتخزّن على عنصر السلة من غير إعادة رسم، عشان المؤشر ما يتنقلش وانت بتكتب
  $$(".cart-note").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      if (cart[idx]) cart[idx].note = e.target.value;
    });
  });
  $$(".rq-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      cart.splice(idx, 1);
      renderCart();
    });
  });
  updateTotals();
}

function updateTotals() {
  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
  const installCost = quoteType === "supply_install" ? (parseFloat($("#installCost").value) || 0) : 0;
  const grand = subtotal + installCost;
  $("#subtotalDisplay").textContent = fmt(subtotal);
  $("#installTotalDisplay").textContent = fmt(installCost);
  $("#grandTotalDisplay").textContent = fmt(grand);
  $("[data-install-total-row]").hidden = quoteType !== "supply_install";
  scheduleDraftAutosave();
  return { subtotal, installCost, grand };
}

/* ---------------- نوع العرض ---------------- */

function setQuoteType(type) {
  quoteType = type;
  $$(".rq-type-btn").forEach((b) => b.classList.toggle("active", b.dataset.quoteType === type));
  $("[data-install-cost-wrap]").hidden = type !== "supply_install";
  updateTotals();
}

/* ---------------- مسودّة تلقائية (عشان الأدمن يشوف المناديب شغالين على إيه دلوقتي) ----------------
   نفس الفكرة المستخدمة في rep-offgrid-quote.js: تسجيل بعد ١٥ ثانية من آخر
   تعديل، من غير رسائل أو توقف لشغل المندوب، وبتتمسح فورًا عند الحفظ النهائي. */
function scheduleDraftAutosave() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(saveDraftNow, 15000);
}

async function saveDraftNow() {
  if (!client) return;
  const name = $("#custName")?.value.trim() || "";
  const phone = $("#custPhone")?.value.trim() || "";
  if (!name && !phone && !cart.length) return;

  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
  const installCost = quoteType === "supply_install" ? (parseFloat($("#installCost")?.value) || 0) : 0;
  const total = subtotal + installCost;

  try {
    await client.rpc("rep_upsert_quote_draft", {
      p_customer_name: name || null,
      p_customer_phone: phone || null,
      p_quote_type: quoteType,
      p_items: cart.map((c) => ({ label: c.name, qty: c.qty, unit_price: c.unitPrice, line_total: c.unitPrice * c.qty })),
      p_subtotal: subtotal,
      p_installation_cost: installCost,
      p_total: total,
      p_page: "rep-quotes",
    });
  } catch (e) {
    // تجاهل عمدًا — الأولوية لشغل المندوب، مش للمسودّة.
  }
}

async function clearDraftNow() {
  if (!client) return;
  try { await client.rpc("rep_clear_quote_draft"); } catch (e) { /* تجاهل */ }
}

/* ---------------- حفظ العرض ---------------- */

async function saveQuote() {
  const msg = $("[data-quote-message]");
  const name = $("#custName").value.trim();
  const phone = $("#custPhone").value.trim();
  const city = $("#custCity").value.trim();

  if (!name || !phone) {
    msg.textContent = "اسم العميل ورقم التليفون مطلوبين.";
    msg.className = "rq-msg error";
    return;
  }
  if (cart.length === 0) {
    msg.textContent = "أضف منتج واحد على الأقل للعرض.";
    msg.className = "rq-msg error";
    return;
  }

  // rep_create_quote بتقبل بس أصناف من جدول products (بـ product_id) وبتحسب الأسعار بنفسها.
  // الأصناف المستوردة من الحاسبة (productId = null) هترفضها الدالة، فنوقف هنا برسالة واضحة.
  const unlinked = cart.filter((c) => !c.productId);
  if (unlinked.length) {
    msg.textContent = "الأصناف دي مش من قائمة المنتجات ومينفعش تتحفظ هنا: " +
      unlinked.map((c) => c.name).join("، ") + ". احذفها أو ضيف بدلها منتج من القائمة.";
    msg.className = "rq-msg error";
    return;
  }

  const { installCost } = updateTotals();

  msg.textContent = "جاري الحفظ...";
  msg.className = "rq-msg";

  // الأسعار والإجماليات بتتحسب في الداتا بيز (المصدر الوحيد للحقيقة) — بنبعت product_id و qty بس.
  const { data, error } = await client.rpc("rep_create_quote", {
    p_customer_name: name,
    p_customer_phone: phone,
    p_customer_city: city || null,
    p_quote_type: quoteType,
    p_items: cart.map((c) => {
      const note = (c.note || "").trim();
      return note ? { product_id: c.productId, qty: c.qty, note } : { product_id: c.productId, qty: c.qty };
    }),
    p_installation_cost: installCost,
    p_notes: null,
  });

  if (error) {
    msg.textContent = "حصل خطأ أثناء الحفظ: " + error.message;
    msg.className = "rq-msg error";
    return;
  }

  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  await clearDraftNow();

  // الطباعة من الصف المحفوظ فعلًا (المصدر الوحيد للحقيقة)، مش من أرقام الشاشة — نفس نمط rep-offgrid-quote.js.
  const { data: saved, error: readErr } = await client
    .from("quotes")
    .select("id, items, subtotal, installation_cost, total, created_at")
    .eq("id", data)
    .maybeSingle();

  if (readErr || !saved) {
    msg.textContent = "تم حفظ العرض رقم #" + data + "، لكن تعذر تحميله للطباعة. اطبعه من «عروضي السابقة».";
    msg.className = "rq-msg ok";
    await loadMyQuotes();
    return;
  }

  msg.textContent = "تم حفظ العرض بنجاح.";
  msg.className = "rq-msg ok";

  await printQuote({
    id: saved.id,
    customer: { name, phone, city },
    quoteType,
    items: withCartNotes(saved.items),
    subtotal: saved.subtotal,
    installCost: saved.installation_cost,
    total: saved.total,
    createdAt: saved.created_at,
  });

  await loadMyQuotes();
}

/* الدالة rep_create_quote لازم تكون محدّثة (migration ملاحظات البنود) عشان الملاحظة تتخزّن في العرض المحفوظ.
   لحد ما تتطبّق، بنرجّع الملاحظات من السلة بالـproduct_id وقت أول طباعة بعد الحفظ، عشان ما تضيعش. */
function withCartNotes(items) {
  const notes = new Map(cart.filter((c) => (c.note || "").trim()).map((c) => [c.productId, c.note.trim()]));
  return (items || []).map((it) => (it.note || !notes.has(it.product_id) ? it : { ...it, note: notes.get(it.product_id) }));
}

/* ---------------- الطباعة على الليتر هيد (نفس مقاسات وتنسيق rep-offgrid-quote.js) ---------------- */

const MM_TO_PX = 96 / 25.4;
const PAGE_CONTENT_W_MM = 210 - 14 - 14; // عرض المحتوى داخل هوامش الصفحة اليمين/الشمال
const PAGE_CONTENT_H_MM = 297 - 80 - 26; // الارتفاع المتاح بين مساحة اللوجو فوق والفوتر تحت
const PAGE_SAFETY_BUFFER_MM = 12; // هامش أمان لفروق قياس الخط بين الشاشة والطباعة

function fmtPrint(n) { return Number(n || 0).toLocaleString("ar-EG-u-nu-latn", { maximumFractionDigits: 0 }); }

function escHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function measureBlockHeightPx(stage, html) {
  stage.innerHTML = html;
  return stage.getBoundingClientRect().height;
}

/* units: مصفوفة { type: 'row'|'block', html } — الوحدات دي معناها "ما ينفعش يتقطّع نصين"
   بين صفحتين. صفوف الجدول بتتجمّع تلقائيًا في جدول واحد بعنوان لكل صفحة تحتوي عليها. */
async function paginatePrintUnits(units, tableHead) {
  await (document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve());

  const stage = document.createElement("div");
  stage.style.cssText = `position:absolute; visibility:hidden; left:-9999px; top:0; width:${PAGE_CONTENT_W_MM}mm; direction:rtl; font-family:'Cairo',sans-serif;`;
  document.body.appendChild(stage);

  const theadHeightPx = measureBlockHeightPx(stage, `<table class="print-table"><thead>${tableHead}</thead></table>`);
  const maxH = (PAGE_CONTENT_H_MM - PAGE_SAFETY_BUFFER_MM) * MM_TO_PX;

  const pages = [[]];
  let curH = 0;
  for (const unit of units) {
    const wrappedForMeasure = unit.type === "row" ? `<table class="print-table"><tbody>${unit.html}</tbody></table>` : unit.html;
    let h = measureBlockHeightPx(stage, wrappedForMeasure);
    const curPage = pages[pages.length - 1];
    const startsNewTableOnThisPage = unit.type === "row" && (curPage.length === 0 || curPage[curPage.length - 1].type !== "row");
    if (startsNewTableOnThisPage) h += theadHeightPx;

    if (curH + h > maxH && curPage.length > 0) {
      pages.push([]);
      curH = 0;
      if (unit.type === "row") h += theadHeightPx; // أول صف في الصفحة الجديدة هيفتح جدول جديد بعنوانه
    }
    pages[pages.length - 1].push(unit);
    curH += h;
  }
  document.body.removeChild(stage);
  return pages;
}

function renderPrintPages(pages, tableHead, topRights) {
  return pages.map((pageUnits, idx) => {
    const parts = [];
    let i = 0;
    while (i < pageUnits.length) {
      if (pageUnits[i].type === "row") {
        let rowsHtml = "";
        while (i < pageUnits.length && pageUnits[i].type === "row") { rowsHtml += pageUnits[i].html; i++; }
        parts.push(`<table class="print-table"><thead>${tableHead}</thead><tbody>${rowsHtml}</tbody></table>`);
      } else {
        parts.push(pageUnits[i].html);
        i++;
      }
    }
    const topRight = (topRights && topRights[idx]) || "";
    return `<div class="printPage">${topRight}${parts.join("")}</div>`;
  }).join("");
}

/* q: { id, customer:{name,phone,city}, quoteType, items, subtotal, installCost, total, createdAt }
   كل الأرقام جاية من الصف المحفوظ في جدول quotes. */
async function printQuote(q) {
  const area = document.getElementById("printArea");
  const issueDate = new Date(q.createdAt);
  const dateStr = issueDate.toLocaleDateString("ar-EG-u-nu-latn");
  const validUntil = new Date(issueDate.getTime() + 3 * 24 * 60 * 60 * 1000);
  const validUntilStr = validUntil.toLocaleDateString("ar-EG-u-nu-latn");
  const typeLabel = q.quoteType === "supply_install" ? "توريد وتركيب" : "توريد فقط";
  const quoteNo = `Q-${issueDate.getFullYear()}${String(issueDate.getMonth() + 1).padStart(2, "0")}${String(issueDate.getDate()).padStart(2, "0")}-${String(q.id).padStart(3, "0")}`;
  const cust = q.customer || {};

  const printItems = await withProductLabels(q.items);
  // عمود "ملاحظات" بيظهر بس لو في بند واحد على الأقل عليه ملاحظة (عشان ما ياخدش عرض من الجدول فاضي)
  const hasNotes = printItems.some((it) => String(it.note || "").trim());
  const tableHead = `<tr><th>البند</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th>${hasNotes ? "<th>ملاحظات</th>" : ""}</tr>`;
  const rowUnits = printItems.map((it) => ({
    type: "row",
    html: `<tr><td>${escHtml(QuoteItemUtils.getQuoteItemLabel(it))}</td><td>${fmtPrint(QuoteItemUtils.parseQuoteItemQty(it.qty))}</td><td>${fmtPrint(QuoteItemUtils.getQuoteItemUnitPrice(it))}</td><td>${fmtPrint(QuoteItemUtils.getQuoteItemLineTotal(it))}</td>${hasNotes ? `<td class="note-cell">${escHtml(String(it.note || "").trim())}</td>` : ""}</tr>`,
  }));

  const infoBox = (lbl, val) => `<div class="print-info-box"><div class="lbl">${lbl}</div><div class="val">${val}</div></div>`;
  const infoRow = `
    <div class="print-info-grid">
      ${infoBox("العميل / المشروع", `${escHtml(cust.name)} — ${escHtml(cust.phone)}${cust.city ? " — " + escHtml(cust.city) : ""}`)}
      ${infoBox("نوع العرض", typeLabel)}
      ${infoBox("تاريخ الإصدار", dateStr)}
      ${infoBox("صالح حتى", validUntilStr)}
    </div>`;

  /* الهيدر (عنوان + رقم عرض + تاريخ + صناديق المعلومات) عنصر مطلق الموضع أعلى يمين كل صفحة بجوار اللوجو.
     النسخة الكاملة في أول صفحة بس، وباقي الصفحات نسخة مصغّرة. */
  const topRightFull = `
    <div class="print-topright">
      <div class="tr-title">عرض سعر</div>
      <div class="tr-meta">رقم العرض: ${quoteNo} — التاريخ: ${dateStr}</div>
      ${infoRow}
    </div>`;
  const topRightMinimal = `
    <div class="print-topright">
      <div class="tr-title">عرض سعر (تابع)</div>
      <div class="tr-meta">رقم العرض: ${quoteNo} — التاريخ: ${dateStr}</div>
    </div>`;

  const subtotalBlock = q.quoteType === "supply_install" ? [{
    type: "block",
    html: `
      <div class="print-terms">
        <div class="row"><span>الإجمالي قبل التركيب</span><span>${fmtPrint(q.subtotal)} ج.م</span></div>
        <div class="row"><span>تكلفة التركيب</span><span>${fmtPrint(q.installCost)} ج.م</span></div>
      </div>`,
  }] : [];
  const grandBoxBlock = {
    type: "block",
    html: `
      <div class="print-grand-box">
        <div class="note">السعر الإجمالي للعرض (غير شامل ض.ق.م)</div>
        <div class="amount">${fmtPrint(q.total)} ج.م</div>
      </div>`,
  };
  const termsBlock = {
    type: "block",
    html: `
      <div class="print-terms">
        <div class="fine">هذا العرض ساري لمدة 3 أيام من تاريخه، ولا يشمل ضريبة القيمة المضافة ما لم يذكر خلاف ذلك.</div>
      </div>`,
  };

  const pages = await paginatePrintUnits([...rowUnits, ...subtotalBlock, grandBoxBlock, termsBlock], tableHead);
  const topRights = pages.map((_, idx) => (idx === 0 ? topRightFull : topRightMinimal));

  area.innerHTML = renderPrintPages(pages, tableHead, topRights);
  setTimeout(() => window.print(), 150);
}

/* ---------------- عروضي السابقة ---------------- */

async function loadMyQuotes() {
  const list = $("#myQuotesList");
  list.innerHTML = "جاري التحميل...";

  const { data, error } = await client
    .from("quotes")
    .select("id, created_at, quote_type, subtotal, installation_cost, total, items, customers(name, phone, city)")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    list.innerHTML = "تعذر تحميل العروض السابقة.";
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = "<p style='color:var(--muted)'>لسه معملتش أي عرض سعر.</p>";
    return;
  }

  list.innerHTML = "";
  data.forEach((q) => {
    const row = document.createElement("div");
    row.className = "rq-quote-item";
    const dateStr = new Date(q.created_at).toLocaleDateString("ar-EG");
    row.innerHTML = `
      <div>#${q.id} — ${q.customers?.name || "بدون اسم"} (${q.customers?.phone || ""}) — ${dateStr} — ${fmt(q.total)} ج.م</div>
      <button type="button" class="btn" data-reprint="${q.id}">طباعة</button>
      <a class="btn" href="feasibility-study.html?quote_id=${q.id}" target="_blank" rel="noopener">دراسة جدوى</a>
    `;
    list.appendChild(row);

    row.querySelector("[data-reprint]").addEventListener("click", () => {
      printQuote({
        id: q.id,
        customer: q.customers || {},
        quoteType: q.quote_type,
        items: q.items || [],
        subtotal: q.subtotal,
        installCost: q.installation_cost,
        total: q.total,
        createdAt: q.created_at,
      });
    });
  });
}

/* ---------------- ربط الأحداث ---------------- */

document.addEventListener("DOMContentLoaded", async () => {
  await initClient();
  if (!client) {
    $("[data-auth-message]").textContent = "تعذر الاتصال بالخادم.";
    return;
  }

  $("[data-login-form]").addEventListener("submit", handleLogin);
  $("[data-logout]").addEventListener("click", handleLogout);
  $("#addProductBtn").addEventListener("click", addProductToCart);
  $("#saveQuoteBtn").addEventListener("click", saveQuote);
  $("#installCost").addEventListener("input", updateTotals);
  $("#custName").addEventListener("input", scheduleDraftAutosave);
  $("#custPhone").addEventListener("input", scheduleDraftAutosave);
  $$(".rq-type-btn").forEach((b) => b.addEventListener("click", () => setQuoteType(b.dataset.quoteType)));

  client.auth.onAuthStateChange((_event, session) => {
    updateAuthState(session);
  });

  const { data } = await client.auth.getSession();
  await updateAuthState(data.session);

  // استقبال سلة جاية من حاسبة المضخات أو الأوف جريد (لو المندوب جه من هناك)
  try {
    const incoming = sessionStorage.getItem("alasl_rep_cart");
    if (incoming) {
      const items = JSON.parse(incoming);
      if (Array.isArray(items) && items.length) {
        items.forEach((it) => {
          cart.push({
            productId: null,
            name: it.name,
            unitPrice: parseFloat(it.price) || 0,
            qty: QuoteItemUtils.parseQuoteItemQty(it.qty) || 1,
          });
        });
        renderCart();
        $("[data-quote-message]").textContent = "تم استيراد نتيجة الحاسبة — راجع الأصناف والأسعار قبل الحفظ.";
        $("[data-quote-message]").className = "rq-msg ok";
      }
      sessionStorage.removeItem("alasl_rep_cart");
    }
  } catch (e) {
    // تجاهل أي خطأ في قراءة السلة القادمة، مش سبب لإيقاف الصفحة
  }
});
