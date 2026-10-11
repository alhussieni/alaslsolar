/* ============================================================
   quote-print.js
   محرك طباعة عرض السعر على الليتر هيد (A4 بصفحات مقسّمة تلقائيًا).
   مصدر واحد مشترك بين صفحة عروض المنتجات (rep-quotes) والـ CRM — أي تعديل على
   شكل الطباعة بيتعمل هنا مرة واحدة. التنسيق نفسه في quote-print.css.

   خيارات الطباعة (مبتتخزّنش في الداتا بيز — العرض المحفوظ دايمًا بالأسعار الكاملة):
   - priceMode: "detailed" (سعر كل بند) أو "total_only" (إجمالي فقط من غير سعر الوحدة/إجمالي البند).
   - showTotal: إظهار/إخفاء السعر الإجمالي. في وضع "total_only" الإجمالي بيظهر دايمًا
     (إخفاؤه كان هيطلّع عرض من غير أي سعر). تفصيلي + إخفاء الإجمالي = قائمة أسعار ("برايس ليست").

   يحتاج: <div id="printArea"></div> في الصفحة + quote-item-utils.js + product-labels.js.
   ============================================================ */
(function () {

/* بيوحّد الخيارات الجاية من أي صفحة لنفس القواعد، عشان الشاشة والطباعة يلتزموا بنفس المنطق */
function normalizeOptions(opts) {
  const priceMode = opts && opts.priceMode === "total_only" ? "total_only" : "detailed";
  const showTotal = priceMode === "total_only" ? true : !(opts && opts.showTotal === false);
  return { priceMode, showTotal };
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

/* client: عميل supabase (لتحميل أسماء المنتجات المميّزة).
   q: { id, customer:{name,phone,city}, quoteType, items, subtotal, installCost, total, createdAt }
   كل الأرقام جاية من الصف المحفوظ في جدول quotes.
   rawOpts: { priceMode, showTotal } — راجع normalizeOptions. */
async function printQuote(client, q, rawOpts) {
  const area = document.getElementById("printArea");
  const issueDate = new Date(q.createdAt);
  const dateStr = issueDate.toLocaleDateString("ar-EG-u-nu-latn");
  const validUntil = new Date(issueDate.getTime() + 3 * 24 * 60 * 60 * 1000);
  const validUntilStr = validUntil.toLocaleDateString("ar-EG-u-nu-latn");
  const typeLabel = q.quoteType === "supply_install" ? "توريد وتركيب" : "توريد فقط";
  const quoteNo = `Q-${issueDate.getFullYear()}${String(issueDate.getMonth() + 1).padStart(2, "0")}${String(issueDate.getDate()).padStart(2, "0")}-${String(q.id).padStart(3, "0")}`;
  const cust = q.customer || {};

  const opts = normalizeOptions(rawOpts);
  const detailed = opts.priceMode === "detailed";
  const printItems = await ProductLabels.withProductLabels(client, q.items);
  // عمود "ملاحظات" بيظهر بس لو في بند واحد على الأقل عليه ملاحظة (عشان ما ياخدش عرض من الجدول فاضي)
  const hasNotes = printItems.some((it) => String(it.note || "").trim());
  const tableHead = `<tr><th>البند</th><th>الكمية</th>${detailed ? "<th>سعر الوحدة</th><th>الإجمالي</th>" : ""}${hasNotes ? "<th>ملاحظات</th>" : ""}</tr>`;
  const rowUnits = printItems.map((it) => ({
    type: "row",
    html: `<tr><td>${escHtml(QuoteItemUtils.getQuoteItemLabel(it))}</td><td>${fmtPrint(QuoteItemUtils.parseQuoteItemQty(it.qty))}</td>${detailed ? `<td>${fmtPrint(QuoteItemUtils.getQuoteItemUnitPrice(it))}</td><td>${fmtPrint(QuoteItemUtils.getQuoteItemLineTotal(it))}</td>` : ""}${hasNotes ? `<td class="note-cell">${escHtml(String(it.note || "").trim())}</td>` : ""}</tr>`,
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

  // الإجمالي قبل التركيب + تكلفة التركيب: بس في الوضع التفصيلي مع إظهار الإجمالي.
  // قائمة الأسعار (تفصيلي من غير إجمالي): بنسيب سطر تكلفة التركيب لوحده (سعر مش إجمالي) لو أكبر من صفر.
  // إجمالي فقط: مفيش تفصيل، الرقم الوحيد هو الإجمالي الكلي.
  let subtotalBlock = [];
  if (q.quoteType === "supply_install" && detailed) {
    const installRow = `<div class="row"><span>تكلفة التركيب</span><span>${fmtPrint(q.installCost)} ج.م</span></div>`;
    const subtotalRow = `<div class="row"><span>الإجمالي قبل التركيب</span><span>${fmtPrint(q.subtotal)} ج.م</span></div>`;
    if (opts.showTotal) subtotalBlock = [{ type: "block", html: `<div class="print-terms">${subtotalRow}${installRow}</div>` }];
    else if (Number(q.installCost) > 0) subtotalBlock = [{ type: "block", html: `<div class="print-terms">${installRow}</div>` }];
  }
  const grandBoxBlock = opts.showTotal ? [{
    type: "block",
    html: `
      <div class="print-grand-box">
        <div class="note">السعر الإجمالي للعرض (غير شامل ض.ق.م)</div>
        <div class="amount">${fmtPrint(q.total)} ج.م</div>
      </div>`,
  }] : [];
  const termsBlock = {
    type: "block",
    html: `
      <div class="print-terms">
        <div class="fine">هذا العرض ساري لمدة 3 أيام من تاريخه، ولا يشمل ضريبة القيمة المضافة ما لم يذكر خلاف ذلك.</div>
      </div>`,
  };

  const pages = await paginatePrintUnits([...rowUnits, ...subtotalBlock, ...grandBoxBlock, termsBlock], tableHead);
  const topRights = pages.map((_, idx) => (idx === 0 ? topRightFull : topRightMinimal));

  area.innerHTML = renderPrintPages(pages, tableHead, topRights);
  setTimeout(() => window.print(), 150);
}

window.QuotePrint = { print: printQuote, normalizeOptions, fmtPrint, escHtml };
})();
