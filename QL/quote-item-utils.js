/* quote-item-utils.js
   مصدر واحد لقراءة بنود العرض (quotes.items) بشكل موحّد في كل الصفحات
   (rep-crm.js / rep-quotes.js / rep-offgrid-quote.js).

   ليه محتاجين الملف ده:
   solar-pump-quote.edge-function.ts بيحفظ كل بند بالشكل ده:
     { key, label, type, qty: "#12#", warranty, sell }
   - qty نص مزخرف بعلامات # (لغرض العرض في الطباعة القديمة)، مش رقم.
   - مفيش unit_price ولا line_total محفوظين — "sell" هو إجمالي السطر بالفعل.
   أي كود بيحاول يقرأ it.qty كرقم مباشرة أو it.unit_price / it.line_total
   هيرجعله NaN أو undefined. الدوال دي بتقرا الشكل ده صح، وبرضه بتفضل شغالة
   لو بند قديم/يدوي (type: "custom") كان محفوظ فعلاً بـ unit_price/line_total صريحين. */

function parseQuoteItemQty(rawQty) {
  const m = String(rawQty ?? "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function getQuoteItemLineTotal(it) {
  if (it.line_total != null) return Number(it.line_total);
  if (it.sell != null) return Number(it.sell);
  const qty = parseQuoteItemQty(it.qty);
  const unit = Number(it.unit_price ?? it.unitPrice ?? 0);
  return qty * unit;
}

function getQuoteItemUnitPrice(it) {
  if (it.unit_price != null) return Number(it.unit_price);
  if (it.unitPrice != null) return Number(it.unitPrice);
  const qty = parseQuoteItemQty(it.qty);
  const lineTotal = getQuoteItemLineTotal(it);
  return qty ? lineTotal / qty : lineTotal;
}

function getQuoteItemLabel(it) {
  return it.label || it.name || "—";
}

window.QuoteItemUtils = {
  parseQuoteItemQty,
  getQuoteItemLineTotal,
  getQuoteItemUnitPrice,
  getQuoteItemLabel,
};
