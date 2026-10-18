/* ============================================================
   QL/auth-utils.js
   أدوات دخول مشتركة لكل صفحات QL (مصدر واحد بدل تكرار المنطق).
   - بيقبل اسم مستخدم أو إيميل في خانة الدخول.
   - اسم المستخدم (من غير @) بيتحول داخليًا لإيميل <username>@staff.alaslsolar.com
     وده نفس التحويل اللي بتعمله Edge Function staff-admin عند إنشاء المستخدم.
   ============================================================ */
(function () {
  var STAFF_EMAIL_DOMAIN = "staff.alaslsolar.com";
  window.QLAuth = {
    toLoginEmail: function (input) {
      var v = String(input || "").trim().toLowerCase();
      if (!v) return v;
      return v.indexOf("@") >= 0 ? v : v + "@" + STAFF_EMAIL_DOMAIN;
    },
  };
})();
