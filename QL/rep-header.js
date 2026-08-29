/* هيدر ثابت مشترك لكل صفحات المندوب — بيتحقن تلقائيًا في بداية الصفحة، بنفس شكل
   هيدر الموقع العام (.site-header) بس بروابط خاصة بأدوات المندوب. الملف ده مصدر واحد
   لكل الصفحات عشان أي تعديل على الروابط يحصل مرة واحدة بدل ما نكرره في كل ملف. */
(function () {
  const NAV_ITEMS = [
    { href: "index.html", label: "بوابة المناديب", icon: "fa-house" },
    { href: "rep-offgrid-quote.html", label: "حاسبة أوف جريد", icon: "fa-car-battery" },
    { href: "rep-quotes.html", label: "عروض المنتجات", icon: "fa-file-invoice" },
  ];

  const current = (location.pathname.split("/").pop() || "index.html");

  const navHtml = NAV_ITEMS.map((item) => {
    const active = item.href === current;
    return `<a href="${item.href}" class="rep-nav-link${active ? " active" : ""}"${active ? ' aria-current="page"' : ""}>
      <i class="fa-solid ${item.icon}" aria-hidden="true"></i><span>${item.label}</span>
    </a>`;
  }).join("");

  const header = document.createElement("header");
  header.className = "site-header rep-header";
  header.innerHTML = `
    <a class="brand" href="index.html" aria-label="الأصل للطاقة الشمسية — بوابة المناديب">
      <img src="../logo-white.png" alt="الأصل للطاقة الشمسية" width="90" height="52" loading="eager">
    </a>
    <nav class="rep-nav" aria-label="تنقل صفحات المندوب">${navHtml}</nav>
  `;

  document.addEventListener("DOMContentLoaded", () => {
    document.body.insertBefore(header, document.body.firstChild);
  });
})();
