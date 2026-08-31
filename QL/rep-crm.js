/* ============================================================
   rep-crm.js
   عرض العروض السابقة: كل مندوب يشوف عروضه بس (بيتفلتر تلقائيًا من
   خلال صلاحيات قاعدة البيانات RLS)، والأدمن يشوف عروض كل المناديب
   مع تفصيل عدد العروض لكل مندوب.
   ============================================================ */

let client = null;
let currentSession = null;
let isAdmin = false;
let allQuotes = []; // كل العروض اللي رجعت من الاستعلام (متفلترة أصلًا حسب الصلاحيات)
let repFilterId = null; // null = من غير فلتر مندوب (أدمن بس)

function $(sel) { return document.querySelector(sel); }
function fmt(n) { return Number(n || 0).toLocaleString("ar-EG-u-nu-latn", { maximumFractionDigits: 0 }); }

async function initClient() {
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  client = window.getAlaslSupabase ? window.getAlaslSupabase() : null;
  return client;
}

async function checkRepStatus(userId) {
  const { data, error } = await client.from("reps").select("id, display_name, active, can_access_crm").eq("id", userId).maybeSingle();
  if (error || !data || !data.active) return null;
  return data;
}

/* بنتأكد هل المستخدم الحالي أدمن ولا لأ عن طريق قراءة جدول admin_users —
   الجدول ده أصلًا معمول عليه RLS بحيث الأدمن بس يقدر يقراه، فلو رجع صف
   معناه المستخدم أدمن فعلًا (مش بس بنفترض) */
async function checkIsAdmin(email) {
  const { data } = await client.from("admin_users").select("email").ilike("email", email).maybeSingle();
  return !!data;
}

function showMsg(text, kind) {
  const el = $("[data-crm-message]");
  if (!el) return;
  el.textContent = text || "";
  el.className = "form-note" + (kind === "error" ? " rq-msg error" : kind === "ok" ? " rq-msg ok" : "");
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
  isAdmin = await checkIsAdmin(session.user.email);

  if (!rep && !isAdmin) {
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
  userName.textContent = isAdmin ? `${rep?.display_name || session.user.email} (أدمن)` : (rep?.display_name || "—");

  if (!isAdmin && rep && !rep.can_access_crm) {
    repPanel.innerHTML = `<div class="card" style="text-align:center;padding:40px 18px;color:var(--muted)">
      <i class="fa-solid fa-lock" style="font-size:22px;color:#b23b23;margin-bottom:8px"></i><br>
      معندكش صلاحية الوصول لـ CRM. تواصل مع الأدمن لو محتاج الصلاحية دي.
    </div>`;
    return;
  }

  document.querySelectorAll(".crm-col-rep").forEach((el) => { el.hidden = !isAdmin; });
  $("#crmRepBreakdownCard").hidden = !isAdmin;

  await loadQuotes();
}

/* ---------------- تحميل العروض ---------------- */

async function loadQuotes() {
  showMsg("جاري تحميل العروض...");
  const { data, error } = await client
    .from("quotes")
    .select("id, created_at, quote_type, total, subtotal, installation_cost, items, rep_id, customers(name, phone, city), reps(display_name)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) { showMsg("تعذر تحميل العروض: " + error.message, "error"); return; }
  allQuotes = data || [];
  showMsg("");
  renderStats();
  if (isAdmin) renderRepBreakdown();
  renderQuoteList();
}

/* ---------------- الإحصائيات العامة ---------------- */

function renderStats() {
  const box = $("#crmStats");
  const totalCount = allQuotes.length;
  const totalValue = allQuotes.reduce((s, q) => s + Number(q.total || 0), 0);
  const repCount = new Set(allQuotes.map((q) => q.rep_id)).size;

  const stats = [
    { lbl: "إجمالي عدد العروض", val: fmt(totalCount) },
    { lbl: "إجمالي قيمة العروض", val: fmt(totalValue) + " ج.م" },
  ];
  if (isAdmin) stats.push({ lbl: "عدد المناديب النشطين", val: fmt(repCount) });

  box.innerHTML = stats.map((s) => `<div class="crm-stat-box"><div class="lbl">${s.lbl}</div><div class="val">${s.val}</div></div>`).join("");
}

/* ---------------- تفصيل عدد العروض لكل مندوب (أدمن بس) ---------------- */

function renderRepBreakdown() {
  const map = new Map(); // rep_id -> { name, count, total }
  allQuotes.forEach((q) => {
    const key = q.rep_id || "بدون مندوب";
    const name = q.reps?.display_name || "بدون مندوب";
    if (!map.has(key)) map.set(key, { name, count: 0, total: 0 });
    const entry = map.get(key);
    entry.count += 1;
    entry.total += Number(q.total || 0);
  });

  const rows = [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  const tbody = $("#crmRepTableBody");
  tbody.innerHTML = rows.map(([repId, r]) => `
    <tr data-rep-row="${repId}" class="${repFilterId === repId ? "active-filter" : ""}">
      <td>${r.name}</td><td>${fmt(r.count)}</td><td>${fmt(r.total)} ج.م</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-rep-row]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.repRow;
      repFilterId = repFilterId === id ? null : id;
      renderRepBreakdown();
      renderQuoteList();
    });
  });
}

/* ---------------- قائمة العروض (مع البحث والفلترة) ---------------- */

function getFilteredQuotes() {
  const search = ($("#crmSearch").value || "").trim().toLowerCase();
  const typeFilter = $("#crmTypeFilter").value;

  return allQuotes.filter((q) => {
    if (repFilterId && q.rep_id !== repFilterId) return false;
    if (typeFilter && q.quote_type !== typeFilter) return false;
    if (search) {
      const name = (q.customers?.name || "").toLowerCase();
      const phone = (q.customers?.phone || "").toLowerCase();
      if (!name.includes(search) && !phone.includes(search)) return false;
    }
    return true;
  });
}

function renderQuoteList() {
  const filtered = getFilteredQuotes();
  const tbody = $("#crmQuoteBody");
  const typeLabel = (t) => t === "supply_install" ? "توريد وتركيب" : "توريد فقط";

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 7 : 6}" style="color:var(--muted);padding:20px">مفيش عروض مطابقة.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((q) => {
    const dateStr = new Date(q.created_at).toLocaleDateString("ar-EG-u-nu-latn");
    return `
      <tr>
        <td>#${q.id}</td>
        <td>${dateStr}</td>
        <td>${q.customers?.name || "بدون اسم"}<br><span style="color:var(--muted);font-size:11.5px">${q.customers?.phone || ""}</span></td>
        <td class="crm-col-rep" ${isAdmin ? "" : "hidden"}>${q.reps?.display_name || "—"}</td>
        <td>${typeLabel(q.quote_type)}</td>
        <td>${fmt(q.total)} ج.م</td>
        <td>
          <button type="button" class="btn" data-toggle-detail="${q.id}" style="font-size:12px">التفاصيل</button>
          <button type="button" class="btn" data-quick-print="${q.id}" style="font-size:12px">طباعة</button>
          ${isAdmin ? `<button type="button" class="btn btn-secondary dark" data-delete="${q.id}" style="font-size:12px">حذف</button>` : ""}
        </td>
      </tr>
      <tr class="crm-quote-detail-row" id="detail-${q.id}" hidden><td colspan="${isAdmin ? 7 : 6}"></td></tr>
    `;
  }).join("");

  filtered.forEach((q) => {
    tbody.querySelector(`[data-toggle-detail="${q.id}"]`).addEventListener("click", () => toggleDetail(q));
    tbody.querySelector(`[data-quick-print="${q.id}"]`).addEventListener("click", () => quickPrint(q));
    const delBtn = tbody.querySelector(`[data-delete="${q.id}"]`);
    if (delBtn) delBtn.addEventListener("click", () => handleDelete(q));
  });
}

/* ---------------- حذف عرض سعر (أدمن بس — الصلاحية دي متأكّدة من قاعدة البيانات
   نفسها عبر RLS، مش بس مخفية في الواجهة) ---------------- */
async function handleDelete(q) {
  const customerName = q.customers?.name || "بدون اسم";
  const confirmed = window.confirm(`هتحذف عرض #${q.id} (${customerName}) نهائيًا. الإجراء ده مش قابل للتراجع، متأكد؟`);
  if (!confirmed) return;

  showMsg("جاري الحذف...");
  const { error } = await client.from("quotes").delete().eq("id", q.id);
  if (error) { showMsg("تعذر الحذف: " + error.message, "error"); return; }

  allQuotes = allQuotes.filter((x) => x.id !== q.id);
  showMsg("✅ تم حذف العرض.", "ok");
  renderStats();
  if (isAdmin) renderRepBreakdown();
  renderQuoteList();
}

function toggleDetail(q) {
  const row = $(`#detail-${q.id}`);
  const willShow = row.hidden;
  document.querySelectorAll(".crm-quote-detail-row").forEach((r) => { r.hidden = true; });
  if (!willShow) return;

  const items = Array.isArray(q.items) ? q.items : [];
  const rowsHtml = items.map((it) => `
    <tr>
      <td class="dtd">${it.label || it.name || "—"}</td>
      <td class="dtd">${fmt(it.qty)}</td>
      <td class="dtd">${fmt(it.unit_price)}</td>
      <td class="dtd">${fmt(it.line_total ?? (it.unit_price || 0) * (it.qty || 0))}</td>
    </tr>
  `).join("");

  row.querySelector("td").innerHTML = `
    <strong>بنود العرض #${q.id}</strong>
    <table>
      <thead><tr><th>البند</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
  row.hidden = false;
}

/* ---------------- طباعة سريعة (نسخة مبسّطة عامة تصلح لأي نوع عرض) ----------------
   ملاحظة: دي نسخة عامة مبسّطة (جدول بنود + إجمالي بس)، مش نفس تصميم الليتر هيد
   والصفحات المقسّمة الخاص بحاسبة الأوف جريد تحديدًا — لو محتاج نفس الشكل هنا
   كمان محتاج نربطها بنفس محرك الطباعة المتقدم. */
function quickPrint(q) {
  const area = $("#printAreaCrm");
  const dateStr = new Date(q.created_at).toLocaleDateString("ar-EG-u-nu-latn");
  const items = Array.isArray(q.items) ? q.items : [];
  const rows = items.map((it) => `
    <tr><td>${it.label || it.name || "—"}</td><td>${fmt(it.qty)}</td><td>${fmt(it.unit_price)}</td><td>${fmt(it.line_total ?? (it.unit_price || 0) * (it.qty || 0))}</td></tr>
  `).join("");

  area.innerHTML = `
    <div class="print-header">
      <img src="../logo.png" alt="الأصل للطاقة الشمسية">
      <div style="text-align:left;"><div class="print-title">عرض سعر #${q.id}</div><div>${dateStr}</div></div>
    </div>
    <div class="print-meta">
      <div><strong>العميل:</strong> ${q.customers?.name || "—"} — ${q.customers?.phone || ""}${q.customers?.city ? " — " + q.customers.city : ""}</div>
      ${isAdmin ? `<div><strong>المندوب:</strong> ${q.reps?.display_name || "—"}</div>` : ""}
    </div>
    <table class="print-table">
      <thead><tr><th>البند</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="print-totals"><div class="row grand"><span>الإجمالي الكلي</span><span>${fmt(q.total)} ج.م</span></div></div>
  `;
  setTimeout(() => window.print(), 100);
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

/* ---------------- ربط الأحداث ---------------- */

document.addEventListener("DOMContentLoaded", async () => {
  await initClient();
  if (!client) return;

  $("[data-login-form]").addEventListener("submit", handleLogin);
  $("[data-logout]").addEventListener("click", handleLogout);
  $("#crmSearch").addEventListener("input", renderQuoteList);
  $("#crmTypeFilter").addEventListener("change", renderQuoteList);

  client.auth.onAuthStateChange((_e, session) => updateAuthState(session));
  const { data } = await client.auth.getSession();
  await updateAuthState(data.session);
});
