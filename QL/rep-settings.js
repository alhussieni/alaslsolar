/* ============================================================
   rep-settings.js
   صفحة إعدادات المندوب: تغيير الاسم الظاهر في عروض الأسعار،
   وتغيير كلمة المرور الخاصة به (بدون تدخل الأدمن).
   ============================================================ */

let client = null;
let currentSession = null;
let currentRep = null;

function $(sel) { return document.querySelector(sel); }

async function initClient() {
  for (let i = 0; i < 50 && !window.getAlaslSupabase; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  client = window.getAlaslSupabase ? window.getAlaslSupabase() : null;
  return client;
}

async function checkRepStatus(userId) {
  const { data, error } = await client
    .from("reps")
    .select("id, email, display_name, active")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data || !data.active) return null;
  return data;
}

function showMsg(el, text, kind) {
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
  if (!rep) {
    authMsg.textContent = "هذا الحساب غير مفعّل كمندوب. تواصل مع الأدمن.";
    authMsg.className = "rq-msg error";
    await client.auth.signOut();
    authPanel.hidden = false;
    repPanel.hidden = true;
    logoutBtn.hidden = true;
    return;
  }

  currentRep = rep;
  authPanel.hidden = true;
  repPanel.hidden = false;
  logoutBtn.hidden = false;
  userName.textContent = rep.display_name;
  $("#settingsName").value = rep.display_name || "";
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

/* ---------------- تغيير الاسم الظاهر ---------------- */

async function handleNameSave(e) {
  e.preventDefault();
  const msg = $("[data-name-message]");
  const newName = $("#settingsName").value.trim();
  if (!newName) { showMsg(msg, "اكتب اسم صحيح.", "error"); return; }

  showMsg(msg, "جاري الحفظ...");
  const { error } = await client.from("reps").update({ display_name: newName }).eq("id", currentSession.user.id);
  if (error) { showMsg(msg, "تعذر الحفظ: " + error.message, "error"); return; }

  currentRep.display_name = newName;
  $("[data-user-name]").textContent = newName;
  showMsg(msg, "✅ تم حفظ الاسم بنجاح.", "ok");
}

/* ---------------- تغيير كلمة المرور ---------------- */

async function handlePasswordChange(e) {
  e.preventDefault();
  const msg = $("[data-password-message]");
  const currentPassword = $("#currentPassword").value;
  const newPassword = $("#newPassword").value;
  const confirmPassword = $("#confirmPassword").value;

  if (newPassword.length < 6) { showMsg(msg, "كلمة المرور الجديدة لازم تكون 6 حروف/أرقام على الأقل.", "error"); return; }
  if (newPassword !== confirmPassword) { showMsg(msg, "تأكيد كلمة المرور مش مطابق.", "error"); return; }

  showMsg(msg, "جاري التحقق من كلمة المرور الحالية...");
  // بنتأكد من كلمة المرور الحالية الأول (حتى لو الجلسة مفتوحة على جهاز مشترك، محدش
  // يقدر يغيّر كلمة المرور من غير ما يعرف الحالية فعلًا)
  const { error: verifyError } = await client.auth.signInWithPassword({
    email: currentSession.user.email, password: currentPassword,
  });
  if (verifyError) { showMsg(msg, "كلمة المرور الحالية غير صحيحة.", "error"); return; }

  showMsg(msg, "جاري تغيير كلمة المرور...");
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) { showMsg(msg, "تعذر تغيير كلمة المرور: " + error.message, "error"); return; }

  $("#currentPassword").value = "";
  $("#newPassword").value = "";
  $("#confirmPassword").value = "";
  showMsg(msg, "✅ تم تغيير كلمة المرور بنجاح.", "ok");
}

/* ---------------- ربط الأحداث ---------------- */

document.addEventListener("DOMContentLoaded", async () => {
  await initClient();
  if (!client) return;

  $("[data-login-form]").addEventListener("submit", handleLogin);
  $("[data-logout]").addEventListener("click", handleLogout);
  $("[data-name-form]").addEventListener("submit", handleNameSave);
  $("[data-password-form]").addEventListener("submit", handlePasswordChange);

  client.auth.onAuthStateChange((_e, session) => updateAuthState(session));
  const { data } = await client.auth.getSession();
  await updateAuthState(data.session);
});
