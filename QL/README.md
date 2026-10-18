# QL — بوابة المناديب

صفحات أدوات المندوب (عروض أسعار، حاسبات، CRM). كلها static + Supabase (Auth/RLS/RPC).

## هيكل الملفات

| الملف | الدور |
|---|---|
| `rep-header.js` | هيدر ثابت مشترك لكل الصفحات (الروابط في مصفوفة `NAV_ITEMS`) |
| `auth-utils.js` | دخول بالـ username أو الإيميل (`QLAuth.toLoginEmail`) — لازم يتحمّل قبل ملف الصفحة |
| `rep-widgets.css` | تنسيقات مشتركة، **ومنها التقسيم الموحّد `.rep-split`** |
| `quote-item-utils.js` | قراءة بنود `quotes.items` بشكل موحّد (qty / unit price / line total) |
| `product-labels.js` | تسمية المنتجات في العروض (`window.ProductLabels`) |
| `quote-print.js` + `quote-print.css` | محرك الطباعة على الليتر هيد (`window.QuotePrint`) — مشترك بين عروض المنتجات والـ CRM |
| `rep-quotes.*` | إصدار عرض سعر منتجات (توريد / توريد وتركيب) |
| `rep-crm.*` | العروض السابقة + البحث + الطباعة بخيارات الأسعار + (أدمن) المناديب والمسودّات |
| `rep-offgrid-quote.*`, `solar-pump-station.*`, `feasibility-study.*` | الحاسبات |

## قاعدة تقسيم الصفحة (كل صفحات الأدوات)

```html
<div class="rep-main rep-main--split">
  <div class="rep-split">
    <div class="rep-split-input"> … الإدخال (الثلث، يمين الصفحة) … </div>
    <div class="rep-split-view">  … العرض / النتيجة (الثلثين، شمال الصفحة) … </div>
  </div>
</div>
```

الترتيب في الـ HTML هو نفس الترتيب على الشاشة (RTL) — أول عنصر يمين. على الشاشات أقل من 1020px بيتحول لعمود واحد.
أي صفحة أداة جديدة تستخدم نفس الكلاسات ولا تعرّف تقسيم خاص بيها.

## خيارات عرض الأسعار (priceMode)

- `detailed`: سعر كل بند + الإجمالي. مع إلغاء «إظهار الإجمالي» = قائمة أسعار.
- `total_only`: تفاصيل المنتجات من غير أسعارها + الإجمالي فقط (الإجمالي بيظهر دايمًا).

القواعد في `QuotePrint.normalizeOptions` (مصدر واحد للمعاينة والطباعة). الخيار للعرض فقط — العرض المحفوظ في الداتا بيز دايمًا بالأسعار الكاملة.
