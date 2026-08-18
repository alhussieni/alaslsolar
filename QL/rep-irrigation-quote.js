/* ============================================================
   rep-irrigation-quote.js
   بيستقبل نتيجة حاسبة الري (pump-calculator.html) من sessionStorage،
   يسمح للمندوب يعدّل الكميات ويحط خصم % لكل بند، ويحفظ العرض عبر
   rep_create_irrigation_quote() اللي بتحسب التكلفة/الربح على السيرفر.
   ============================================================ */

let client = null;
let quoteType = "supply_only";
let quoteRows = []; // { label, productId, category, brand, qty, unitPrice, discountPct }

function $(sel) { return document.querySelector(sel); }
function fmt(n) { return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 }); }

function showMsg(el, text, kind) {
  if (!el) return;
  el.textContent = text || "";
  el.style.color = kind === "error" ? "#b23b23" : kind === "ok" ? "var(--forest)" : "var(--muted)";
}

async function initClient() {
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) await new Promise((r) => setTimeout(r, 50));
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
  if (!session) { authPanel.hidden = false; repPanel.hidden = true; return; }
  const rep = await checkRepStatus(session.user.id);
  if (!rep) { authPanel.hidden = false; repPanel.hidden = true; return; }
  authPanel.hidden = true;
  repPanel.hidden = false;
  userName.textContent = rep.display_name;
  loadIncomingCart();
}

/* ---------------- استقبال نتيجة الحاسبة ---------------- */

function loadIncomingCart() {
  let items = [];
  try {
    const raw = sessionStorage.getItem("alasl_rep_irrigation_cart");
    if (raw) items = JSON.parse(raw) || [];
  } catch (e) { items = []; }

  if (!items.length) {
    $("[data-empty-cart]").hidden = false;
    $("[data-quote-content]").hidden = true;
    return;
  }

  quoteRows = items.map((it) => ({
    label: it.name, productId: it.id || null, category: it.category || null, brand: it.brand || null,
    qty: it.qty || 1, unitPrice: it.price || 0, discountPct: 0,
  }));

  $("[data-empty-cart]").hidden = true;
  $("[data-quote-content]").hidden = false;
  renderQuoteTable();
  updateBanner();
}

function updateBanner() {
  $("#bannerName").textContent = $("#custName").value.trim() || "—";
  $("#bannerPhone").textContent = $("#custPhone").value.trim() || "—";
  $("#bannerDate").textContent = new Date().toLocaleDateString("ar-EG");
}

/* ---------------- جدول العرض ---------------- */

function renderQuoteTable() {
  const body = $("#quoteItemsBody");
  body.innerHTML = "";

  const rows = [...quoteRows];
  if (quoteType === "supply_install" && !rows.some((r) => r.bomKey === "transport")) {
    rows.push({ label: "النقل", bomKey: "transport", qty: 1, unitPrice: 0, discountPct: 0, isBom: true });
    rows.push({ label: "التركيب", bomKey: "install", qty: 1, unitPrice: 0, discountPct: 0, isBom: true });
  }

  rows.forEach((r, idx) => {
    const lineTotal = r.qty * r.unitPrice * (1 - r.discountPct / 100);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="bom-label">${r.label}</td>
      <td><input type="number" min="0" step="1" value="${r.qty}" data-qty-idx="${idx}" style="width:56px;padding:5px;text-align:center"></td>
      <td>${fmt(r.unitPrice)}</td>
      <td><input type="number" min="0" max="100" value="${r.discountPct}" data-discount-idx="${idx}"></td>
      <td>${fmt(lineTotal)}</td>`;
    body.appendChild(tr);
  });

  quoteRows = rows;

  document.querySelectorAll("[data-qty-idx]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = parseInt(e.target.dataset.qtyIdx, 10);
      quoteRows[idx].qty = Math.max(0, parseFloat(e.target.value) || 0);
      renderQuoteTable();
    });
  });
  document.querySelectorAll("[data-discount-idx]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = parseInt(e.target.dataset.discountIdx, 10);
      quoteRows[idx].discountPct = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
      renderQuoteTable();
    });
  });

  const grand = quoteRows.reduce((s, r) => s + r.qty * r.unitPrice * (1 - r.discountPct / 100), 0);
  $("#grandTotalDisplay").textContent = fmt(grand);
}

/* ---------------- الحفظ ---------------- */

async function saveQuote() {
  const msgEl = $("[data-quote-message]");
  const name = $("#custName").value.trim();
  const phone = $("#custPhone").value.trim();
  const city = $("#custCity").value.trim();
  if (!name || !phone) { showMsg(msgEl, "اسم العميل ورقم التليفون مطلوبين.", "error"); return; }
  if (!quoteRows.length) { showMsg(msgEl, "مفيش أصناف في العرض.", "error"); return; }

  const items = quoteRows.filter((r) => r.qty > 0).map((r) => {
    if (r.isBom) return { type: "bom_fixed", key: r.bomKey, qty: r.qty, discount_pct: r.discountPct, label: r.label };
    return { type: "product", product_id: r.productId, qty: r.qty, discount_pct: r.discountPct, label: r.label };
  });

  if (items.some((it) => it.type === "product" && !it.product_id)) {
    showMsg(msgEl, "في صنف من غير معرّف منتج صالح — احسب من صفحة حاسبة الري تاني.", "error");
    return;
  }

  showMsg(msgEl, "جاري الحفظ...", "");

  const { data: quoteId, error } = await client.rpc("rep_create_irrigation_quote", {
    p_customer_name: name, p_customer_phone: phone, p_customer_city: city || null,
    p_quote_type: quoteType, p_items: items, p_notes: null,
  });

  if (error) { showMsg(msgEl, "خطأ أثناء الحفظ: " + error.message, "error"); return; }

  const { data: saved } = await client.from("quotes").select("id, items, total, created_at").eq("id", quoteId).maybeSingle();
  showMsg(msgEl, "تم حفظ العرض بنجاح.", "ok");
  sessionStorage.removeItem("alasl_rep_irrigation_cart");

  printQuote({ id: quoteId, customer: { name, phone, city }, quoteType, items: saved?.items || items, total: saved?.total || 0, createdAt: saved?.created_at || new Date() });
}

function printQuote(q) {
  const area = document.getElementById("printArea");
  const dateStr = new Date(q.createdAt).toLocaleDateString("ar-EG");
  const typeLabel = q.quoteType === "supply_install" ? "توريد وتركيب" : "توريد فقط";
  const rows = (q.items || []).map((it) => `
    <tr><td>${it.label}</td><td>${fmt(it.qty)}</td><td>${fmt(it.unit_price)}</td><td>${it.discount_pct || 0}%</td><td>${fmt(it.line_total)}</td></tr>
  `).join("");
  area.innerHTML = `
    <div class="print-header">
      <img src="logo.png" alt="الأصل للطاقة الشمسية">
      <div style="text-align:left;"><div class="print-title">عرض سعر — منظومة ري زراعي</div><div>#${q.id} — ${dateStr}</div></div>
    </div>
    <div style="margin-bottom:16px; font-size:13px;">
      <div><strong>العميل:</strong> ${q.customer.name} — ${q.customer.phone}${q.customer.city ? " — " + q.customer.city : ""}</div>
      <div><strong>نوع العرض:</strong> ${typeLabel}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>البند</th><th>الكمية</th><th>سعر الوحدة</th><th>خصم</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="print-totals"><div class="row grand"><span>الإجمالي الكلي</span><span>${fmt(q.total)} ج.م</span></div></div>
    <div class="print-footer">الأصل للطاقة الشمسية — alaslsolar.com — هذا العرض قابل للتغيير حسب الأسعار وقت التعاقد.</div>
  `;
  setTimeout(() => window.print(), 100);
}

/* ---------------- ربط الأحداث ---------------- */

document.addEventListener("DOMContentLoaded", async () => {
  await initClient();
  if (!client) return;

  $("#saveQuoteBtn")?.addEventListener("click", saveQuote);
  $("#custName")?.addEventListener("input", updateBanner);
  $("#custPhone")?.addEventListener("input", updateBanner);
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
    quoteType = b.dataset.quoteType;
    document.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("active", x === b));
    renderQuoteTable();
  }));

  client.auth.onAuthStateChange((_e, session) => updateAuthState(session));
  const { data } = await client.auth.getSession();
  await updateAuthState(data.session);
});
