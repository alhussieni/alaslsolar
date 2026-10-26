/* ============================================================
   rep-quotes.js
   منطق صفحة عروض الأسعار الخاصة بالمناديب.
   يعتمد على supabase-config.js (نفس إعدادات باقي الموقع) +
   quote-item-utils.js / product-labels.js / quote-print.js (وحدات مشتركة مع الـ CRM).
   العروض السابقة اتنقلت لصفحة الـ CRM (rep-crm.html).
   ============================================================ */

const { escHtml } = window.QuotePrint;
const { nameCountsByCategory, countNames, buildProductLabel } = window.ProductLabels;

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
  ongrid: "إنفرترات أون جريد",
  hybrid: "إنفرترات هايبرد",
  ev_chargers: "شواحن سيارات كهربائية",
  reactors: "ريأكتورات",
  charge_controllers: "منظمات شحن",
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
    if (logoutBtn) logoutBtn.hidden = true;
    if (userName) userName.textContent = "";
    return;
  }

  const rep = await checkRepStatus(session.user.id);
  if (!rep) {
    authMsg.textContent = "هذا الحساب غير مفعّل كمندوب. تواصل مع الأدمن.";
    authMsg.className = "rq-msg error";
    await client.auth.signOut();
    authPanel.hidden = false;
    repPanel.hidden = true;
    if (logoutBtn) logoutBtn.hidden = true;
    return;
  }

  authPanel.hidden = true;
  repPanel.hidden = false;
  if (logoutBtn) logoutBtn.hidden = false;
  if (userName) userName.textContent = rep.display_name;

  if (!rep.can_access_products) {
    repPanel.innerHTML = `<div class="card" style="text-align:center;padding:40px 18px;color:var(--muted)">
      <i class="fa-solid fa-lock" style="font-size:22px;color:#b23b23;margin-bottom:8px"></i><br>
      معندكش صلاحية الوصول لعروض المنتجات. تواصل مع الأدمن لو محتاج الصلاحية دي.
    </div>`;
    return;
  }

  await loadCategories();
  renderCart();
  updateBanner();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = window.QLAuth ? window.QLAuth.toLoginEmail($("#loginEmail").value) : $("#loginEmail").value.trim();
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

/* الاختيار على ٣ مستويات: الفئة ← البراند ← المنتج.
   بنحمّل منتجات الفئة كلها مرة واحدة (متاح + منشور فقط) ونفلتر بالبراند محليًا، عشان تغيير البراند فوري. */
let categoryProducts = []; // منتجات الفئة المختارة حاليًا
const NO_BRAND = "__none__";

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
  $("#brandSelect").addEventListener("change", renderProductOptions);
  await loadProductsForCategory();
}

async function loadProductsForCategory() {
  const category = $("#categorySelect").value;
  const brandSel = $("#brandSelect");
  const productSel = $("#productSelect");
  brandSel.innerHTML = "<option>...جاري التحميل</option>";
  productSel.innerHTML = "";

  const { data, error } = await client
    .from("products")
    .select("id, category, brand, name_ar, name_en, specs_ar, model_available, power_kw, power_hp, capacity_ah, voltage_v, dod, cycle_life, price")
    .eq("category", category)
    .eq("published", true)
    .eq("in_stock", true) // غير متاح = لا يظهر في أي أداة
    .order("name_ar", { ascending: true })
    .order("power_kw", { ascending: true, nullsFirst: false }) // الأسماء المتكررة تترتب بالقدرة من الأصغر للأكبر
    .order("price", { ascending: true });

  if (error || !data) {
    categoryProducts = [];
    brandSel.innerHTML = "<option>تعذر تحميل المنتجات</option>";
    return;
  }
  categoryProducts = data;
  // عدّاد الأسماء على مستوى الفئة كلها (مش البراند بس) عشان الاسم يطلع بنفس الشكل في الطباعة
  nameCountsByCategory.set(category, countNames(data));

  const brands = [...new Set(data.map((p) => (p.brand || "").trim()))].sort((a, b) => a.localeCompare(b, "en"));
  brandSel.innerHTML = "";
  if (!brands.length) {
    brandSel.innerHTML = "<option value=\"\">لا توجد منتجات متاحة في هذه الفئة</option>";
    return;
  }
  brands.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b || NO_BRAND;
    opt.textContent = b || "بدون براند";
    brandSel.appendChild(opt);
  });
  renderProductOptions();
}

// المنتجات: بنرتّب البطاريات بالفولت ثم السعة، والباقي زي ترتيب الاستعلام
function renderProductOptions() {
  const category = $("#categorySelect").value;
  const brand = $("#brandSelect").value;
  const productSel = $("#productSelect");
  productSel.innerHTML = "";

  let rows = categoryProducts.filter((p) => ((p.brand || "").trim() || NO_BRAND) === brand);
  if (category === "batteries") {
    rows = [...rows].sort((a, b) => (Number(a.voltage_v) - Number(b.voltage_v)) || (Number(a.capacity_ah) - Number(b.capacity_ah)));
  }
  const nameCounts = nameCountsByCategory.get(category);
  rows.forEach((p) => {
    const label = buildProductLabel(p, nameCounts);
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.dataset.name = label;
    opt.dataset.price = p.price || 0;
    opt.textContent = `${label} — ${fmt(p.price)} ج.م`;
    productSel.appendChild(opt);
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

/* خيارات عرض الأسعار: بتتقرا من الصفحة، وبتتحكم في شكل المعاينة على الشاشة وفي الطباعة بنفس القواعد
   (القواعد نفسها في QuotePrint.normalizeOptions عشان الشاشة = المطبوع). */
function getPrintOptions() {
  const priceMode = document.querySelector(".rq-mode-btn.active")?.dataset.priceMode === "total_only" ? "total_only" : "detailed";
  return QuotePrint.normalizeOptions({ priceMode, showTotal: document.getElementById("optShowTotal")?.checked !== false });
}

function renderCart() {
  const opts = getPrintOptions();
  const detailed = opts.priceMode === "detailed";
  const head = $("#cartHead");
  const body = $("#cartBody");

  head.innerHTML = `<tr>
    <th class="rq-name">البند</th>
    ${detailed ? "<th>سعر الوحدة</th>" : ""}
    <th>الكمية</th>
    ${detailed ? "<th>الإجمالي</th>" : ""}
    <th>ملاحظات</th>
    <th></th>
  </tr>`;

  body.innerHTML = "";
  if (!cart.length) {
    body.innerHTML = `<tr><td colspan="${detailed ? 6 : 4}" class="rq-empty">
      <i class="fa-solid fa-arrow-right" style="color:var(--brand);margin-left:6px"></i>
      اختار المنتجات من العمود الجانبي وهتظهر هنا في عرض السعر.
    </td></tr>`;
  }
  cart.forEach((item, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="rq-name">${escHtml(item.name)}</td>
      ${detailed ? `<td class="num">${fmt(item.unitPrice)}</td>` : ""}
      <td><input type="number" min="1" value="${item.qty}" data-idx="${idx}" class="cart-qty"></td>
      ${detailed ? `<td class="num">${fmt(item.unitPrice * item.qty)}</td>` : ""}
      <td><input type="text" maxlength="300" value="${escHtml(item.note || "")}" data-idx="${idx}" class="cart-note" placeholder="ملاحظة للعميل (اختياري)"></td>
      <td><button type="button" class="rq-remove rw-remove" data-idx="${idx}">حذف</button></td>
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

/* ملخص الإجماليات على الشاشة بنفس منطق الطباعة بالظبط:
   - تفصيلي + إجمالي: الإجمالي قبل التركيب + التركيب + الإجمالي الكلي.
   - تفصيلي من غير إجمالي (برايس ليست): تكلفة التركيب بس لو أكبر من صفر.
   - إجمالي فقط: الرقم الوحيد هو الإجمالي الكلي. */
function updateTotals() {
  const opts = getPrintOptions();
  const detailed = opts.priceMode === "detailed";
  const isInstall = quoteType === "supply_install";
  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
  const installCost = isInstall ? (parseFloat($("#installCost").value) || 0) : 0;
  const grand = subtotal + installCost;

  $("#subtotalDisplay").textContent = fmt(subtotal);
  $("#installTotalDisplay").textContent = fmt(installCost);
  $("#grandTotalDisplay").textContent = fmt(grand);

  const showBreakdown = isInstall && detailed && opts.showTotal;
  $("[data-row-subtotal]").hidden = !showBreakdown;
  $("[data-install-total-row]").hidden = !(showBreakdown || (isInstall && detailed && installCost > 0));
  $("[data-grand-bar]").hidden = !opts.showTotal;

  // في وضع قائمة الأسعار الإجمالي مش بيظهر للعميل، بس المندوب لازم يفضل شايفه
  const note = $("[data-internal-note]");
  note.hidden = opts.showTotal;
  if (!opts.showTotal) note.textContent = `الإجمالي (للمندوب فقط — مش هيظهر في المطبوع): ${fmt(grand)} ج.م`;

  $("#quoteTypeTag").textContent = isInstall ? "توريد وتركيب" : "توريد فقط";
  scheduleDraftAutosave();
  return { subtotal, installCost, grand };
}

/* بانر العميل أعلى العرض (نفس فكرة بانر حاسبة الأوف جريد) */
function updateBanner() {
  $("#bannerName").textContent = $("#custName").value.trim() || "—";
  $("#bannerPhone").textContent = $("#custPhone").value.trim() || "—";
  $("#bannerDate").textContent = new Date().toLocaleDateString("ar-EG-u-nu-latn");
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
    msg.textContent = "تم حفظ العرض رقم #" + data + "، لكن تعذر تحميله للطباعة. اطبعه من صفحة CRM.";
    msg.className = "rq-msg ok";
    return;
  }

  msg.textContent = "تم حفظ العرض رقم #" + saved.id + " — تلاقيه في CRM.";
  msg.className = "rq-msg ok";

  await QuotePrint.print(client, {
    id: saved.id,
    customer: { name, phone, city },
    quoteType,
    items: withCartNotes(saved.items),
    subtotal: saved.subtotal,
    installCost: saved.installation_cost,
    total: saved.total,
    createdAt: saved.created_at,
  }, getPrintOptions());
}

/* الدالة rep_create_quote لازم تكون محدّثة (migration ملاحظات البنود) عشان الملاحظة تتخزّن في العرض المحفوظ.
   لحد ما تتطبّق، بنرجّع الملاحظات من السلة بالـproduct_id وقت أول طباعة بعد الحفظ، عشان ما تضيعش. */
function withCartNotes(items) {
  const notes = new Map(cart.filter((c) => (c.note || "").trim()).map((c) => [c.productId, c.note.trim()]));
  return (items || []).map((it) => (it.note || !notes.has(it.product_id) ? it : { ...it, note: notes.get(it.product_id) }));
}

/* ---------------- خيارات عرض الأسعار (واجهة) ---------------- */

function updatePrintOptionsUI() {
  const mode = document.querySelector(".rq-mode-btn.active")?.dataset.priceMode;
  const cb = document.getElementById("optShowTotal");
  const hint = document.getElementById("printOptHint");
  if (!cb || !hint) return;
  if (mode === "total_only") {
    cb.checked = true;
    cb.disabled = true;
    hint.textContent = "العرض هيظهر بتفاصيل المنتجات من غير سعر كل بند، والإجمالي بيظهر دايمًا في الوضع ده.";
  } else {
    cb.disabled = false;
    hint.textContent = cb.checked
      ? "العرض هيظهر بسعر كل بند والإجمالي."
      : "العرض هيطلع كقائمة أسعار: سعر كل بند من غير إجمالي.";
  }
  hint.textContent += " الخيار ده بيتطبّق على المعاينة والطباعة، والعرض المحفوظ بيفضل بالأسعار الكاملة.";
}

/* ---------------- ربط الأحداث ---------------- */

document.addEventListener("DOMContentLoaded", async () => {
  await initClient();
  if (!client) {
    $("[data-auth-message]").textContent = "تعذر الاتصال بالخادم.";
    return;
  }

  $("[data-login-form]").addEventListener("submit", handleLogin);
  $("[data-logout]")?.addEventListener("click", handleLogout);
  $("#addProductBtn").addEventListener("click", addProductToCart);
  $("#saveQuoteBtn").addEventListener("click", saveQuote);
  $("#installCost").addEventListener("input", updateTotals);
  $("#custName").addEventListener("input", () => { updateBanner(); scheduleDraftAutosave(); });
  $("#custPhone").addEventListener("input", () => { updateBanner(); scheduleDraftAutosave(); });
  $$(".rq-type-btn").forEach((b) => b.addEventListener("click", () => setQuoteType(b.dataset.quoteType)));

  $$(".rq-mode-btn").forEach((b) => b.addEventListener("click", () => {
    $$(".rq-mode-btn").forEach((x) => x.classList.toggle("active", x === b));
    updatePrintOptionsUI();
    renderCart();
  }));
  $("#optShowTotal")?.addEventListener("change", () => { updatePrintOptionsUI(); renderCart(); });
  updatePrintOptionsUI();

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
