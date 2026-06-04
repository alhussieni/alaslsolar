const client = getAlaslSupabase();

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text || "";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileExtension(file) {
  return file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "jpg";
}

async function uploadImage(file, folder) {
  if (!file || file.size === 0) return "";
  const safeName = `${folder}/${Date.now()}-${Math.random().toString(16).slice(2)}.${fileExtension(file)}`;
  const { error } = await client.storage.from("site-media").upload(safeName, file, {
    cacheControl: "3600",
    upsert: false
  });
  if (error) throw error;
  const { data } = client.storage.from("site-media").getPublicUrl(safeName);
  return data.publicUrl;
}

async function requireSession() {
  const { data } = await client.auth.getSession();
  updateAuthState(data.session);
}

function updateAuthState(session) {
  const authPanel = document.querySelector("[data-auth-panel]");
  const dashboard = document.querySelector("[data-dashboard]");

  if (session) {
    authPanel.hidden = true;
    dashboard.hidden = false;
    setText("[data-user-email]", session.user.email);
    loadLists();
  } else {
    authPanel.hidden = false;
    dashboard.hidden = true;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  setText("[data-auth-message]", "Logging in...");

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    setText("[data-auth-message]", error.message);
    return;
  }

  setText("[data-auth-message]", "");
  updateAuthState(data.session);
}

async function handleLogout() {
  await client.auth.signOut();
  updateAuthState(null);
}

async function handleProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  setText("[data-project-message]", "Saving project...");

  try {
    const imageUrl = await uploadImage(formData.get("image"), "projects");
    const payload = {
      title: formData.get("title"),
      category: formData.get("category"),
      location: formData.get("location") || null,
      capacity: formData.get("capacity") || null,
      year: formData.get("year") ? Number(formData.get("year")) : null,
      summary: formData.get("summary"),
      image_url: imageUrl || null,
      published: formData.get("published") === "on"
    };

    const { error } = await client.from("projects").insert(payload);
    if (error) throw error;
    form.reset();
    form.elements.published.checked = true;
    setText("[data-project-message]", "Project saved.");
    loadLists();
  } catch (error) {
    setText("[data-project-message]", error.message);
  }
}

async function handleArticle(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  setText("[data-article-message]", "Saving article...");

  try {
    const imageUrl = await uploadImage(formData.get("image"), "articles");
    const title = formData.get("title");
    const payload = {
      title,
      slug: `${slugify(title)}-${Date.now()}`,
      summary: formData.get("summary"),
      content: formData.get("content"),
      image_url: imageUrl || null,
      published: formData.get("published") === "on"
    };

    const { error } = await client.from("articles").insert(payload);
    if (error) throw error;
    form.reset();
    form.elements.published.checked = true;
    setText("[data-article-message]", "Article saved.");
    loadLists();
  } catch (error) {
    setText("[data-article-message]", error.message);
  }
}

function renderAdminList(selector, items, emptyText) {
  const element = document.querySelector(selector);
  if (!element) return;
  if (!items || items.length === 0) {
    element.innerHTML = `<p>${emptyText}</p>`;
    return;
  }

  element.innerHTML = items.map((item) => `
    <div class="admin-list__item">
      <strong>${item.title}</strong>
      <span>${item.published ? "Published" : "Draft"}</span>
    </div>
  `).join("");
}

async function loadLists() {
  loadStats();
  const [{ data: projects }, { data: articles }] = await Promise.all([
    client.from("projects").select("title,published,created_at").order("created_at", { ascending: false }).limit(6),
    client.from("articles").select("title,published,created_at").order("created_at", { ascending: false }).limit(6)
  ]);

  renderAdminList("[data-project-list]", projects, "No projects yet.");
  renderAdminList("[data-article-list]", articles, "No articles yet.");
}

document.addEventListener("DOMContentLoaded", () => {
  if (!client) {
    setText("[data-auth-message]", "Supabase client could not load.");
    return;
  }

  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("projectForm").addEventListener("submit", handleProject);
  document.getElementById("articleForm").addEventListener("submit", handleArticle);
  document.querySelector("[data-logout]").addEventListener("click", handleLogout);

  client.auth.onAuthStateChange((_event, session) => updateAuthState(session));
  requireSession();
});

/* ═══════════════════════════════════════════
   STATS MANAGEMENT
   ═══════════════════════════════════════════ */

async function loadStats() {
  const container = document.getElementById("statsList");
  if (!container) return;

  const { data, error } = await client
    .from("site_stats")
    .select("*")
    .order("sort_order");

  if (error || !data || data.length === 0) {
    container.innerHTML = `<p style="color:var(--muted);font-size:14px">
      ${error ? "Could not load stats: " + error.message : "No stats found — run the SQL setup first."}
    </p>`;
    return;
  }

  container.innerHTML = data.map(stat => `
    <div class="admin-form" style="
      background:#fff;
      border:1px solid var(--line);
      border-radius:var(--radius-lg);
      padding:var(--space-3);
    " data-stat-row="${stat.id}">
      <div style="display:grid;grid-template-columns:120px 1fr 1fr 1fr 1fr;gap:var(--space-2);align-items:end">
        <div>
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">Value</label>
          <input
            id="stat_value_${stat.id}"
            value="${stat.value}"
            placeholder="e.g. 120+"
            style="font-size:22px;font-weight:800;color:var(--brand);text-align:center"
          >
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">English label</label>
          <input id="stat_en_${stat.id}" value="${stat.label_en}" placeholder="Label in English">
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">Arabic label</label>
          <input id="stat_ar_${stat.id}" value="${stat.label_ar}" placeholder="التسمية بالعربية" dir="rtl">
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">Spanish label</label>
          <input id="stat_es_${stat.id}" value="${stat.label_es}" placeholder="Etiqueta en español">
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">Chinese label</label>
          <input id="stat_zh_${stat.id}" value="${stat.label_zh}" placeholder="中文标签">
        </div>
      </div>
      <button
        class="btn btn-primary"
        type="button"
        onclick="saveStat('${stat.id}')"
        style="margin-top:var(--space-2);min-height:40px;font-size:13px"
      >
        Save this stat
      </button>
    </div>
  `).join("");
}

async function saveStat(id) {
  const msg = document.getElementById("statsMessage");
  const value   = document.getElementById(`stat_value_${id}`)?.value.trim();
  const label_en = document.getElementById(`stat_en_${id}`)?.value.trim();
  const label_ar = document.getElementById(`stat_ar_${id}`)?.value.trim();
  const label_es = document.getElementById(`stat_es_${id}`)?.value.trim();
  const label_zh = document.getElementById(`stat_zh_${id}`)?.value.trim();

  if (!value || !label_en || !label_ar) {
    if (msg) msg.textContent = "Value, English label, and Arabic label are required.";
    return;
  }

  if (msg) msg.textContent = "Saving...";

  const { error } = await client
    .from("site_stats")
    .update({ value, label_en, label_ar, label_es, label_zh, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    if (msg) msg.textContent = "Error: " + error.message;
    return;
  }

  if (msg) {
    msg.textContent = "✅ Saved! Homepage will reflect the new values immediately.";
    setTimeout(() => { if (msg) msg.textContent = ""; }, 4000);
  }
}
