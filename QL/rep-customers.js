/* ============================================================
   rep-customers.js
   العملاء والمتابعة (CRM): قايمة العملاء، سجل النشاط، المتابعات، حالة عرض السعر،
   إسناد العملاء، ولوحة أداء المناديب (للإدارة).

   الأمان: كل القراءة بتتم عبر RLS (المندوب يشوف عملاءه بس، الإدارة تشوف الكل)،
   وكل الكتابة عبر دوال crm_* على السيرفر اللي بتتحقق من الصلاحيات.
   الإخفاء/الإظهار هنا (can(...)) تجميل للواجهة فقط وليس حماية.
   ============================================================ */

let client = null;
let currentSession = null;
let perms = [];
let repsMap = new Map();      // id -> { display_name, active }
let customers = [];
let selected = null;          // العميل المفتوح حاليًا

const STATUS = { issued: "صادر", negotiating: "تفاوض", accepted: "مقبول", rejected: "مرفوض", expired: "منتهي" };
const KIND = { call: "مكالمة", visit: "زيارة", whatsapp: "واتساب", note: "ملاحظة", status_change: "تغيير حالة", assignment: "إسناد", follow_up_done: "إنجاز متابعة" };
const QUOTE_TYPE = { supply_install: "توريد وتركيب", supply_only: "توريد فقط" };

function $(sel) { return document.querySelector(sel); }
function can(p) { return perms.indexOf(p) >= 0; }

/* بناء عناصر DOM بدون innerHTML — أي نص جاي من المستخدم بيتحط كـ textContent */
function h(tag, attrs) {
  const el = document.createElement(tag);
  Object.keys(attrs || {}).forEach((k) => {
    if (k === "class") el.className = attrs[k];
    else if (k === "text") el.textContent = attrs[k];
    else el.setAttribute(k, attrs[k]);
  });
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    if (c == null) continue;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

function fmtMoney(n) { return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 }); }
function fmtDate(s) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return s; }
}
function repName(id) {
  if (!id) return "—";
  if (currentSession && id === currentSession.user.id) return "أنا";
  const r = repsMap.get(id);
  return r ? r.display_name : "—";
}

function pageMsg(text, kind) {
  const el = $("[data-page-message]");
  el.textContent = text || "";
  el.className = "rq-msg" + (kind ? " " + kind : "");
  if (kind === "ok" && text) setTimeout(() => { if (el.textContent === text) pageMsg(""); }, 5000);
}

function friendlyError(err) {
  const m = (err && err.message) || "";
  if (err && err.code === "42501") return "ليس لديك صلاحية لهذه العملية.";
  if (/active rep/.test(m)) return "المندوب المختار غير نشط أو غير موجود.";
  if (/body required/.test(m)) return "اكتب نص التسجيل (حتى 2000 حرف).";
  if (/reason too long|note too long/.test(m)) return "النص طويل (الحد 500 حرف).";
  if (/invalid/.test(m)) return "قيمة غير صالحة.";
  if (/does not belong/.test(m)) return "العرض لا يخص هذا العميل.";
  return "تعذر تنفيذ العملية.";
}

async function initClient() {
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) await new Promise((r) => setTimeout(r, 50));
  client = window.getAlaslSupabase ? window.getAlaslSupabase() : null;
  return client;
}

async function rpc(name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

/* ---------------- الدخول ---------------- */

async function updateAuthState(session) {
  currentSession = session;
  const authPanel = $("[data-auth-panel]");
  const repPanel = $("[data-rep-panel]");
  const logoutBtn = $("[data-logout]");
  const authMsg = $("[data-auth-message]");

  if (!session) {
    authPanel.hidden = false; repPanel.hidden = true; if (logoutBtn) logoutBtn.hidden = true;
    if ($("[data-user-name]")) $("[data-user-name]").textContent = "";
    return;
  }

  const { data, error } = await client.rpc("my_permissions");
  perms = error || !Array.isArray(data) ? [] : data;
  if (!can("customers.read_own") && !can("customers.read_all")) {
    authMsg.textContent = "هذا الحساب لا يملك صلاحية الوصول للعملاء. تواصل مع الإدارة.";
    authMsg.className = "rq-msg error";
    await client.auth.signOut();
    authPanel.hidden = false; repPanel.hidden = true; if (logoutBtn) logoutBtn.hidden = true;
    return;
  }

  authPanel.hidden = true; repPanel.hidden = false; if (logoutBtn) logoutBtn.hidden = false;
  if ($("[data-user-name]")) $("[data-user-name]").textContent = session.user.email || "";
  $("[data-overview-section]").hidden = !can("reps.activity.read");
  await reloadAll();
  // رابط من البحث العام: /QL/rep-customers.html?customer=ID
  const wanted = Number(new URLSearchParams(location.search).get("customer"));
  if (wanted && customers.some((c) => c.id === wanted)) {
    await openCustomer(wanted);
    $("[data-detail-section]").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = window.QLAuth ? window.QLAuth.toLoginEmail($("#loginEmail").value) : $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const authMsg = $("[data-auth-message]");
  authMsg.textContent = "جاري الدخول...";
  authMsg.className = "rq-msg";
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) { authMsg.textContent = "بيانات الدخول غير صحيحة."; authMsg.className = "rq-msg error"; return; }
  authMsg.textContent = "";
  await updateAuthState(data.session);
}

async function handleLogout() {
  await client.auth.signOut();
  selected = null;
  await updateAuthState(null);
}

/* ---------------- تحميل البيانات ---------------- */

async function reloadAll() {
  await loadReps();
  await Promise.all([loadCustomers(), loadFollowUps(), can("reps.activity.read") ? loadOverview() : Promise.resolve()]);
  if (selected) await openCustomer(selected.id);
}

async function loadReps() {
  const { data } = await client.from("reps").select("id, display_name, active");
  repsMap = new Map((data || []).map((r) => [r.id, r]));
}

async function loadCustomers() {
  const { data, error } = await client
    .from("customers")
    .select("id, name, phone, city, notes, assigned_rep_id, created_at, quotes(count)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) { pageMsg("تعذر تحميل العملاء.", "error"); return; }
  customers = data || [];
  renderCustomers();
}

function renderCustomers() {
  const q = ($("[data-customer-search]").value || "").trim().toLowerCase();
  const rows = customers.filter((c) => !q || [c.name, c.phone, c.city].some((v) => (v || "").toLowerCase().indexOf(q) >= 0));
  const tb = $("[data-customers-body]");
  tb.textContent = "";
  rows.forEach((c) => {
    const n = c.quotes && c.quotes[0] ? c.quotes[0].count : 0;
    const tr = h("tr", { class: "rc-click" + (selected && selected.id === c.id ? " rc-selected" : "") },
      h("td", { text: c.name }), h("td", { text: c.phone, dir: "ltr" }), h("td", { text: c.city || "—" }),
      h("td", { text: repName(c.assigned_rep_id) }), h("td", { text: String(n) }));
    tr.addEventListener("click", () => openCustomer(c.id));
    tb.appendChild(tr);
  });
  $("[data-customers-empty]").hidden = rows.length > 0;
}

async function loadFollowUps() {
  const { data, error } = await client
    .from("follow_ups")
    .select("id, customer_id, rep_id, due_at, note, customers(name, phone)")
    .is("done_at", null)
    .order("due_at", { ascending: true })
    .limit(100);
  if (error) { pageMsg("تعذر تحميل المتابعات.", "error"); return; }
  const rows = data || [];
  const tb = $("[data-followups-body]");
  tb.textContent = "";
  const now = Date.now();
  rows.forEach((f) => {
    const overdue = new Date(f.due_at).getTime() < now;
    const done = h("button", { type: "button", class: "btn", text: "تم" });
    done.addEventListener("click", async () => {
      done.disabled = true;
      try { await rpc("crm_complete_follow_up", { p_id: f.id, p_note: null }); await reloadAll(); }
      catch (e) { pageMsg(friendlyError(e), "error"); done.disabled = false; }
    });
    const name = f.customers ? f.customers.name : "—";
    const nameCell = h("td", { text: name });
    nameCell.style.cursor = "pointer";
    nameCell.addEventListener("click", () => openCustomer(f.customer_id));
    tb.appendChild(h("tr", {}, nameCell,
      h("td", { class: overdue ? "rc-overdue" : "", text: fmtDate(f.due_at) }),
      h("td", { text: repName(f.rep_id) }), h("td", { text: f.note || "—" }), h("td", {}, done)));
  });
  $("[data-followups-empty]").hidden = rows.length > 0;
}

async function loadOverview() {
  const days = Number($("[data-overview-days]").value) || 30;
  const tb = $("[data-overview-body]");
  try {
    const rows = await rpc("crm_rep_overview", { p_days: days });
    tb.textContent = "";
    (rows || []).forEach((r) => {
      tb.appendChild(h("tr", {},
        h("td", { text: r.display_name + (r.active ? "" : " (موقوف)") }),
        h("td", { text: String(r.quotes_count) }), h("td", { text: fmtMoney(r.quotes_total) }),
        h("td", { text: String(r.accepted_count) }), h("td", { text: fmtMoney(r.accepted_total) }),
        h("td", { text: String(r.customers_count) }),
        h("td", { class: r.overdue_follow_ups > 0 ? "rc-overdue" : "", text: String(r.overdue_follow_ups) }),
        h("td", { text: fmtDate(r.last_activity_at) })));
    });
  } catch (e) { tb.textContent = ""; pageMsg(friendlyError(e), "error"); }
}

/* ---------------- تفاصيل العميل ---------------- */

async function openCustomer(id) {
  const c = customers.find((x) => x.id === id);
  if (!c) return;
  selected = c;
  renderCustomers();
  $("[data-detail-section]").hidden = false;
  $("[data-detail-title]").textContent = c.name;
  $("[data-detail-info]").textContent = `${c.phone}${c.city ? " — " + c.city : ""} — المندوب: ${repName(c.assigned_rep_id)}${c.notes ? " — " + c.notes : ""}`;
  renderForms(c);

  const [quotes, acts] = await Promise.all([
    client.from("quotes").select("id, quote_type, total, status, created_at, lost_reason").eq("customer_id", id).order("created_at", { ascending: false }),
    client.from("customer_activities").select("id, kind, body, meta, actor_id, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!selected || selected.id !== id) return; // المستخدم فتح عميل تاني في الأثناء
  renderQuotes(quotes.data || []);
  renderTimeline(acts.data || []);
}

function renderQuotes(quotes) {
  const tb = $("[data-detail-quotes]");
  tb.textContent = "";
  quotes.forEach((q) => {
    const sel = h("select", { "aria-label": "حالة العرض" });
    Object.keys(STATUS).forEach((k) => { const o = h("option", { value: k, text: STATUS[k] }); if (k === q.status) o.selected = true; sel.appendChild(o); });
    sel.addEventListener("change", async () => {
      let reason = null;
      if (sel.value === "rejected" || sel.value === "expired") {
        reason = window.prompt("سبب الرفض / الانتهاء (اختياري):", "") || null;
      }
      try { await rpc("crm_set_quote_status", { p_quote_id: q.id, p_status: sel.value, p_reason: reason }); pageMsg("تم تحديث حالة العرض.", "ok"); await openCustomer(selected.id); }
      catch (e) { pageMsg(friendlyError(e), "error"); sel.value = q.status; }
    });
    tb.appendChild(h("tr", {}, h("td", { text: String(q.id) }), h("td", { text: QUOTE_TYPE[q.quote_type] || q.quote_type }),
      h("td", { text: fmtMoney(q.total) }), h("td", { text: fmtDate(q.created_at) }), h("td", {}, sel)));
  });
}

function renderTimeline(items) {
  const ul = $("[data-detail-timeline]");
  ul.textContent = "";
  items.forEach((a) => {
    let detail = a.body || "";
    if (a.kind === "status_change" && a.meta) detail = `${STATUS[a.meta.from] || a.meta.from} ← ${STATUS[a.meta.to] || a.meta.to}${a.body ? " — " + a.body : ""}`;
    if (a.kind === "assignment" && a.meta) detail = `إلى: ${repName(a.meta.to)}${a.body ? " — " + a.body : ""}`;
    ul.appendChild(h("li", {},
      h("span", { class: "rc-tag", text: KIND[a.kind] || a.kind }), h("span", { text: detail }),
      h("div", { class: "meta", text: `${repName(a.actor_id)} — ${fmtDate(a.created_at)}` })));
  });
  if (!items.length) ul.appendChild(h("li", { class: "meta", text: "لا يوجد نشاط مسجّل بعد." }));
}

function renderForms(c) {
  const box = $("[data-detail-forms]");
  box.textContent = "";

  // 1) تسجيل نشاط
  const kind = h("select", {});
  ["call", "visit", "whatsapp", "note"].forEach((k) => kind.appendChild(h("option", { value: k, text: KIND[k] })));
  const body = h("textarea", { rows: "3", maxlength: "2000", placeholder: "اكتب تفاصيل الاتصال أو الزيارة..." });
  const addAct = h("button", { type: "button", class: "btn btn-primary", text: "حفظ النشاط" });
  addAct.addEventListener("click", async () => {
    addAct.disabled = true;
    try { await rpc("crm_add_activity", { p_customer_id: c.id, p_kind: kind.value, p_body: body.value, p_quote_id: null }); body.value = ""; pageMsg("تم حفظ النشاط.", "ok"); await openCustomer(c.id); }
    catch (e) { pageMsg(friendlyError(e), "error"); }
    addAct.disabled = false;
  });
  box.appendChild(h("div", { class: "rc-box" }, h("h4", { text: "تسجيل نشاط" }), h("label", { text: "النوع" }), kind, h("label", { text: "التفاصيل" }), body, h("div", { style: "margin-top:8px" }, addAct)));

  // 2) متابعة جديدة
  const due = h("input", { type: "datetime-local" });
  const note = h("input", { type: "text", maxlength: "500", placeholder: "ملاحظة (اختياري)" });
  const addFu = h("button", { type: "button", class: "btn btn-primary", text: "إضافة متابعة" });
  addFu.addEventListener("click", async () => {
    if (!due.value) { pageMsg("اختار موعد المتابعة.", "error"); return; }
    addFu.disabled = true;
    try { await rpc("crm_add_follow_up", { p_customer_id: c.id, p_due_at: new Date(due.value).toISOString(), p_note: note.value || null, p_quote_id: null, p_rep_id: null }); due.value = ""; note.value = ""; pageMsg("تمت إضافة المتابعة.", "ok"); await reloadAll(); }
    catch (e) { pageMsg(friendlyError(e), "error"); }
    addFu.disabled = false;
  });
  box.appendChild(h("div", { class: "rc-box" }, h("h4", { text: "متابعة جديدة" }), h("label", { text: "الموعد" }), due, h("label", { text: "ملاحظة" }), note, h("div", { style: "margin-top:8px" }, addFu)));

  // 3) إسناد العميل (للإدارة فقط)
  if (can("customers.assign")) {
    const sel = h("select", {});
    sel.appendChild(h("option", { value: "", text: "— اختر المندوب —" }));
    repsMap.forEach((r, id) => { if (r.active) { const o = h("option", { value: id, text: r.display_name }); if (id === c.assigned_rep_id) o.selected = true; sel.appendChild(o); } });
    const why = h("input", { type: "text", maxlength: "500", placeholder: "سبب النقل (اختياري)" });
    const go = h("button", { type: "button", class: "btn btn-primary", text: "إسناد" });
    go.addEventListener("click", async () => {
      if (!sel.value) { pageMsg("اختار المندوب.", "error"); return; }
      go.disabled = true;
      try { await rpc("crm_assign_customer", { p_customer_id: c.id, p_rep_id: sel.value, p_note: why.value || null }); pageMsg("تم إسناد العميل.", "ok"); await reloadAll(); }
      catch (e) { pageMsg(friendlyError(e), "error"); }
      go.disabled = false;
    });
    box.appendChild(h("div", { class: "rc-box" }, h("h4", { text: "إسناد العميل لمندوب" }), h("label", { text: "المندوب" }), sel, h("label", { text: "ملاحظة" }), why, h("div", { style: "margin-top:8px" }, go)));
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initClient();
  if (!client) { pageMsg("تعذر الاتصال بالخادم.", "error"); return; }
  $("[data-login-form]").addEventListener("submit", handleLogin);
  $("[data-logout]")?.addEventListener("click", handleLogout);
  $("[data-customer-search]").addEventListener("input", renderCustomers);
  $("[data-overview-days]").addEventListener("change", loadOverview);
  $("[data-detail-close]").addEventListener("click", () => { selected = null; $("[data-detail-section]").hidden = true; renderCustomers(); });
  const { data } = await client.auth.getSession();
  await updateAuthState(data.session);
  client.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT") updateAuthState(null); });
});
