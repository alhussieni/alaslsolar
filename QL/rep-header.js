/* QL/rep-header.js — بقى مجرد محمّل للهيكل الموحد.
   الهيدر القديم (روابط QL فقط) اتبدل بالشريط الموحد الموجود في /management/shell/ (أقسام النظام + بحث + قائمة المستخدم)،
   وروابط أدوات QL بقت تبويبات تحت الشريط. الملف محتفظ باسمه عشان صفحات QL كلها لسه بتحمّله من غير تعديل. */
(function () {
  if (window.__alaslShell) return;
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/management/shell/shell.css";
  document.head.appendChild(link);
  var script = document.createElement("script");
  script.src = "/management/shell/shell.js";
  document.head.appendChild(script);
})();
