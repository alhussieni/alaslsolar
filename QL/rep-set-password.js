/* ============================================================
   rep-set-password.js
   بيتفعّل لما المندوب يدوس على لينك الدعوة اللي بعتناهولوه بالإيميل.
   Supabase بيثبّت جلسة مؤقتة تلقائيًا من اللينك (Invite/Recovery)،
   وهنا بنطلب من المندوب يحدد كلمة المرور بنفسه أول مرة.
   ============================================================ */

let client = null;

function $(sel) { return document.querySelector(sel); }

async function initClient() {
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  client = window.getAlaslSupabase ? window.getAlaslSupabase() : null;
  return client;
}

function showMsg(text, kind) {
  const el = $("[data-set-password-message]");
  if (!el) return;
  el.textContent = text || "";
  el.className = "form-note" + (kind === "error" ? " rq-msg error" : kind === "ok" ? " rq-msg ok" : "");
}

async function handleSubmit(e) {
  e.preventDefault();
  const newPassword = $("#newPassword").value;
  const confirmPassword = $("#confirmPassword").value;

  if (newPassword.length < 6) { showMsg("كلمة المرور لازم تكون 6 حروف/أرقام على الأقل.", "error"); return; }
  if (newPassword !== confirmPassword) { showMsg("تأكيد كلمة المرور مش مطابق.", "error"); return; }

  showMsg("جاري التفعيل...");
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) { showMsg("تعذر تفعيل الحساب: " + error.message, "error"); return; }

  showMsg("✅ تم تفعيل حسابك بنجاح! هتتحول دلوقتي...", "ok");
  setTimeout(() => { window.location.href = "index.html"; }, 1500);
}

document.addEventListener("DOMContentLoaded", async () => {
  await initClient();
  if (!client) return;

  // بنستنى لحظة عشان supabase-js يقرأ توكن الدعوة من رابط الصفحة (hash) ويثبّت الجلسة
  const { data } = await client.auth.getSession();
  let session = data.session;
  if (!session) {
    // أحيانًا التوكن بياخد لحظة إضافية يتحلل — نستنى حدث onAuthStateChange
    session = await new Promise((resolve) => {
      const { data: sub } = client.auth.onAuthStateChange((_e, s) => { if (s) resolve(s); });
      setTimeout(() => { sub?.subscription?.unsubscribe?.(); resolve(null); }, 4000);
    });
  }

  $("#stateChecking").hidden = true;
  if (!session) {
    $("#stateInvalid").hidden = false;
    return;
  }

  $("#setPasswordForm").hidden = false;
  $("#setPasswordForm").addEventListener("submit", handleSubmit);
});
