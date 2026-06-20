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

/* ═══════════════════════════════════════════
   SHARED HELPERS
   ═══════════════════════════════════════════ */

function toggleSection(wrapId, btnId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'block';
}

let imageRowCounter = 0;

function addImageRow(containerId, type) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const idx = ++imageRowCounter;
  const row = document.createElement('div');
  row.id = `imgRow_${idx}`;
  row.style.cssText = 'display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:start;padding:10px;background:#fff;border-radius:var(--radius);border:1px solid var(--line)';
  row.innerHTML = `
    <div style="display:grid;gap:6px">
      <input type="file" accept="image/*" id="imgFile_${idx}" style="font-size:13px">
      <select id="imgPos_${idx}" style="min-height:36px;font-size:13px">
        <option value="hero">صورة رئيسية (Hero) — تظهر في أعلى الصفحة</option>
        <option value="inline">داخل المحتوى (Inline) — تظهر بين الفقرات</option>
        <option value="gallery">معرض صور (Gallery) — تظهر في نهاية الصفحة</option>
      </select>
      <input type="text" id="imgCaption_${idx}" placeholder="تعليق الصورة (اختياري)" style="min-height:34px;font-size:13px">
    </div>
    <div id="imgPreview_${idx}" style="width:60px;height:60px;border-radius:var(--radius);background:var(--bg);border:1px solid var(--line);display:grid;place-items:center;overflow:hidden">
      <span style="color:var(--muted);font-size:11px">معاينة</span>
    </div>
    <button type="button" onclick="document.getElementById('imgRow_${idx}').remove()"
      style="width:28px;height:28px;border-radius:50%;border:none;background:#fef2f2;color:#b91c1c;font-size:16px;cursor:pointer;display:grid;place-items:center">×</button>
  `;
  wrap.appendChild(row);

  // Preview on file select
  document.getElementById('imgFile_' + idx).addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const prev = document.getElementById('imgPreview_' + idx);
      if (prev) prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
    };
    reader.readAsDataURL(file);
  });
}

async function collectImages(containerId, folder) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return [];
  const rows = wrap.querySelectorAll('[id^="imgRow_"]');
  const images = [];
  for (const row of rows) {
    const idx = row.id.replace('imgRow_', '');
    const fileInput = document.getElementById('imgFile_' + idx);
    const pos = document.getElementById('imgPos_' + idx)?.value || 'hero';
    const caption = document.getElementById('imgCaption_' + idx)?.value.trim() || '';
    if (fileInput?.files[0]) {
      try {
        const url = await uploadImage(fileInput.files[0], folder);
        if (url) images.push({ url, position: pos, caption });
      } catch(e) { console.error('Image upload error:', e); }
    }
  }
  return images;
}

/* ═══════════════════════════════════════════
   PROJECTS
   ═══════════════════════════════════════════ */

async function handleProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const msgEl = document.querySelector('[data-project-message]');
  if (msgEl) msgEl.textContent = 'جاري رفع الصور والحفظ...';

  try {
    const images = await collectImages('projectImagesWrap', 'projects');
    const payload = {
      title:      formData.get('title'),
      category:   formData.get('category'),
      location:   formData.get('location') || null,
      capacity:   formData.get('capacity') || null,
      year:       formData.get('year') ? Number(formData.get('year')) : null,
      summary:    formData.get('summary'),
      sort_order: Number(formData.get('sort_order')) || 100,
      image_url:  images[0]?.url || null,
      images:     images,
      published:  formData.get('published') === 'on',
    };
    const { error } = await client.from('projects').insert(payload);
    if (error) throw error;
    form.reset();
    document.getElementById('projectImagesWrap').innerHTML = '';
    if (msgEl) msgEl.textContent = '✅ تم حفظ المشروع!';
    setTimeout(() => { if (msgEl) msgEl.textContent = ''; toggleSection('projectAddWrap','addProjectBtn'); }, 2000);
    loadProjects();
  } catch(e) {
    if (msgEl) msgEl.textContent = 'خطأ: ' + e.message;
  }
}

async function loadProjects() {
  const container = document.getElementById('projectsList');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--muted);font-size:14px">جاري التحميل…</p>';

  const { data, error } = await client.from('projects').select('*').order('sort_order').limit(50);
  if (error) { container.innerHTML = `<p style="color:red;font-size:14px">خطأ: ${error.message}</p>`; return; }
  if (!data || data.length === 0) { container.innerHTML = '<p style="color:var(--muted);font-size:14px">لا توجد مشاريع بعد.</p>'; return; }

  container.innerHTML = data.map(p => {
    const imgs = Array.isArray(p.images) ? p.images : [];
    const heroImg = imgs.find(i => i.position === 'hero') || imgs[0];
    return `
    <div style="border:1px solid var(--line);border-radius:var(--radius-lg);background:#fff;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:10px var(--space-3);background:#f9f6f2;border-bottom:1px solid var(--line);cursor:pointer"
           onclick="toggleProjectEdit('${p.id}')">
        ${heroImg ? `<img src="${heroImg.url}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0">` : '<div style="width:44px;height:44px;border-radius:6px;background:var(--line);flex-shrink:0;display:grid;place-items:center"><span style="font-size:18px">📷</span></div>'}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escP(p.title)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${escP(p.category||'')} ${p.location ? '· ' + escP(p.location) : ''} ${p.year ? '· ' + p.year : ''} · ${imgs.length} صورة</div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button type="button" onclick="event.stopPropagation();togglePublish('projects','${p.id}',${p.published},'projectsList',loadProjects)"
            style="padding:3px 8px;border-radius:var(--radius);border:1px solid var(--line);background:${p.published ? '#e8f5e9' : '#fff3e0'};color:${p.published ? '#2e7d32' : '#e65100'};font-size:11px;font-weight:700;cursor:pointer">
            ${p.published ? '✅ منشور' : '⏸ موقوف'}
          </button>
          <button type="button" onclick="event.stopPropagation();deleteRecord('projects','${p.id}',loadProjects)"
            style="padding:3px 8px;border-radius:var(--radius);border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;font-size:11px;cursor:pointer">🗑</button>
          <span style="font-size:18px;color:var(--muted)">›</span>
        </div>
      </div>

      <!-- Edit form -->
      <div id="projEdit_${p.id}" style="display:none;padding:var(--space-3)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2)">
          <div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">العنوان *</label>
            <input id="pf_title_${p.id}" value="${escP(p.title)}"></div>
          <div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">التصنيف</label>
            <select id="pf_cat_${p.id}" style="min-height:38px">
              ${['Agriculture','Commercial','Hybrid','Residential','Maintenance'].map(c=>`<option ${p.category===c?'selected':''}>${c}</option>`).join('')}
            </select></div>
          <div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">الموقع</label>
            <input id="pf_loc_${p.id}" value="${escP(p.location||'')}"></div>
          <div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">القدرة</label>
            <input id="pf_cap_${p.id}" value="${escP(p.capacity||'')}"></div>
          <div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">السنة</label>
            <input id="pf_year_${p.id}" type="number" value="${p.year||''}"></div>
          <div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">الترتيب</label>
            <input id="pf_sort_${p.id}" type="number" value="${p.sort_order||100}"></div>
        </div>
        <div style="margin-top:var(--space-2)"><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">الملخص *</label>
          <textarea id="pf_sum_${p.id}" rows="3">${escP(p.summary)}</textarea></div>

        <!-- Existing images -->
        ${imgs.length > 0 ? `
        <div style="margin-top:var(--space-2)">
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">الصور الحالية (${imgs.length})</label>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px" id="existImgs_${p.id}">
            ${imgs.map((img,i) => `
              <div style="border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;position:relative">
                <img src="${img.url}" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block">
                <div style="padding:4px 6px;background:#f9f6f2">
                  <div style="font-size:10px;font-weight:700;color:var(--brand-dark)">${img.position==='hero'?'🖼 رئيسية':img.position==='inline'?'📄 داخل المحتوى':'🖼 معرض'}</div>
                  ${img.caption ? `<div style="font-size:10px;color:var(--muted)">${escP(img.caption)}</div>` : ''}
                </div>
                <button type="button"
                  onclick="removeExistingImage('projects','${p.id}',${i},loadProjects)"
                  style="position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(185,28,28,.85);color:#fff;font-size:12px;cursor:pointer;display:grid;place-items:center">×</button>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <!-- Add more images -->
        <div style="margin-top:var(--space-2)">
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">إضافة صور جديدة</label>
          <div id="projNewImgs_${p.id}" style="display:grid;gap:var(--space-1)"></div>
          <button type="button" onclick="addImageRow('projNewImgs_${p.id}','project')"
            style="margin-top:6px;padding:5px 12px;border-radius:var(--radius);border:1.5px dashed var(--brand);background:var(--brand-soft);color:var(--brand-dark);font-size:12px;cursor:pointer;width:100%">
            + إضافة صورة
          </button>
        </div>

        <p class="form-note" id="projEditMsg_${p.id}" style="margin-top:6px"></p>
        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2)">
          <button class="btn btn-primary" type="button" onclick="saveProject('${p.id}')" style="min-height:38px;font-size:13px">💾 حفظ</button>
          <button type="button" onclick="toggleProjectEdit('${p.id}')"
            style="padding:7px 14px;border-radius:var(--radius);border:1px solid var(--line);background:#fff;font-size:13px;cursor:pointer">إلغاء</button>
        </div>
      </div>
    </div>
  `}).join('');
}

function escP(str) { return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toggleProjectEdit(id) {
  const el = document.getElementById('projEdit_' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function saveProject(id) {
  const msg = document.getElementById('projEditMsg_' + id);
  if (msg) msg.textContent = 'جاري الحفظ...';

  try {
    // Collect new images
    const newImgs = await collectImages('projNewImgs_' + id, 'projects');
    // Get existing images from Supabase
    const { data: existing } = await client.from('projects').select('images').eq('id', id).single();
    const existImgs = Array.isArray(existing?.images) ? existing.images : [];
    const allImgs = [...existImgs, ...newImgs];

    const payload = {
      title:      document.getElementById('pf_title_' + id)?.value.trim(),
      category:   document.getElementById('pf_cat_' + id)?.value,
      location:   document.getElementById('pf_loc_' + id)?.value.trim() || null,
      capacity:   document.getElementById('pf_cap_' + id)?.value.trim() || null,
      year:       Number(document.getElementById('pf_year_' + id)?.value) || null,
      summary:    document.getElementById('pf_sum_' + id)?.value.trim(),
      sort_order: Number(document.getElementById('pf_sort_' + id)?.value) || 100,
      image_url:  allImgs[0]?.url || null,
      images:     allImgs,
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('projects').update(payload).eq('id', id);
    if (error) throw error;
    if (msg) { msg.textContent = '✅ تم الحفظ!'; setTimeout(() => { if(msg) msg.textContent=''; }, 2500); }
    loadProjects();
  } catch(e) {
    if (msg) msg.textContent = 'خطأ: ' + e.message;
  }
}

/* ═══════════════════════════════════════════
   ARTICLES
   ═══════════════════════════════════════════ */

async function handleArticle(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const msgEl = document.querySelector('[data-article-message]');
  if (msgEl) msgEl.textContent = 'جاري رفع الصور والحفظ...';

  try {
    const images = await collectImages('articleImagesWrap', 'articles');
    const title = formData.get('title');
    const payload = {
      title,
      slug:      `${slugify(title)}-${Date.now()}`,
      summary:   formData.get('summary'),
      content:   formData.get('content'),
      image_url: images[0]?.url || null,
      images,
      published: formData.get('published') === 'on',
    };
    const { error } = await client.from('articles').insert(payload);
    if (error) throw error;
    form.reset();
    document.getElementById('articleImagesWrap').innerHTML = '';
    if (msgEl) msgEl.textContent = '✅ تم حفظ المقال!';
    setTimeout(() => { if(msgEl) msgEl.textContent=''; toggleSection('articleAddWrap','addArticleBtn'); }, 2000);
    loadArticles();
  } catch(e) {
    if (msgEl) msgEl.textContent = 'خطأ: ' + e.message;
  }
}

async function loadArticles() {
  const container = document.getElementById('articlesList');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--muted);font-size:14px">جاري التحميل…</p>';

  const { data, error } = await client.from('articles').select('*').order('created_at', {ascending:false}).limit(50);
  if (error) { container.innerHTML = `<p style="color:red;font-size:14px">خطأ: ${error.message}</p>`; return; }
  if (!data || data.length === 0) { container.innerHTML = '<p style="color:var(--muted);font-size:14px">لا توجد مقالات بعد.</p>'; return; }

  container.innerHTML = data.map(a => {
    const imgs = Array.isArray(a.images) ? a.images : [];
    const heroImg = imgs.find(i => i.position === 'hero') || imgs[0];
    return `
    <div style="border:1px solid var(--line);border-radius:var(--radius-lg);background:#fff;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:10px var(--space-3);background:#f9f6f2;border-bottom:1px solid var(--line);cursor:pointer"
           onclick="toggleArticleEdit('${a.id}')">
        ${heroImg ? `<img src="${heroImg.url}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0">` : '<div style="width:44px;height:44px;border-radius:6px;background:var(--line);flex-shrink:0;display:grid;place-items:center"><span style="font-size:18px">📝</span></div>'}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escP(a.title)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${new Date(a.created_at).toLocaleDateString('ar-EG')} · ${imgs.length} صورة</div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button type="button" onclick="event.stopPropagation();togglePublish('articles','${a.id}',${a.published},'articlesList',loadArticles)"
            style="padding:3px 8px;border-radius:var(--radius);border:1px solid var(--line);background:${a.published ? '#e8f5e9' : '#fff3e0'};color:${a.published ? '#2e7d32' : '#e65100'};font-size:11px;font-weight:700;cursor:pointer">
            ${a.published ? '✅ منشور' : '⏸ موقوف'}
          </button>
          <button type="button" onclick="event.stopPropagation();deleteRecord('articles','${a.id}',loadArticles)"
            style="padding:3px 8px;border-radius:var(--radius);border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;font-size:11px;cursor:pointer">🗑</button>
          <span style="font-size:18px;color:var(--muted)">›</span>
        </div>
      </div>

      <!-- Edit form -->
      <div id="artEdit_${a.id}" style="display:none;padding:var(--space-3)">
        <div style="display:grid;gap:var(--space-2)">
          <div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">العنوان *</label>
            <input id="af_title_${a.id}" value="${escP(a.title)}"></div>
          <div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">الملخص *</label>
            <textarea id="af_sum_${a.id}" rows="3">${escP(a.summary)}</textarea></div>
          <div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">المحتوى *</label>
            <textarea id="af_con_${a.id}" rows="6">${escP(a.content)}</textarea></div>
        </div>

        <!-- Existing images -->
        ${imgs.length > 0 ? `
        <div style="margin-top:var(--space-2)">
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">الصور الحالية (${imgs.length})</label>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
            ${imgs.map((img,i) => `
              <div style="border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;position:relative">
                <img src="${img.url}" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block">
                <div style="padding:4px 6px;background:#f9f6f2">
                  <div style="font-size:10px;font-weight:700;color:var(--brand-dark)">${img.position==='hero'?'🖼 رئيسية':img.position==='inline'?'📄 داخل المحتوى':'🖼 معرض'}</div>
                  ${img.caption ? `<div style="font-size:10px;color:var(--muted)">${escP(img.caption)}</div>` : ''}
                </div>
                <button type="button"
                  onclick="removeExistingImage('articles','${a.id}',${i},loadArticles)"
                  style="position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(185,28,28,.85);color:#fff;font-size:12px;cursor:pointer;display:grid;place-items:center">×</button>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <!-- Add more images -->
        <div style="margin-top:var(--space-2)">
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">إضافة صور جديدة</label>
          <div id="artNewImgs_${a.id}" style="display:grid;gap:var(--space-1)"></div>
          <button type="button" onclick="addImageRow('artNewImgs_${a.id}','article')"
            style="margin-top:6px;padding:5px 12px;border-radius:var(--radius);border:1.5px dashed var(--brand);background:var(--brand-soft);color:var(--brand-dark);font-size:12px;cursor:pointer;width:100%">
            + إضافة صورة
          </button>
        </div>

        <p class="form-note" id="artEditMsg_${a.id}" style="margin-top:6px"></p>
        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2)">
          <button class="btn btn-primary" type="button" onclick="saveArticle('${a.id}')" style="min-height:38px;font-size:13px">💾 حفظ</button>
          <button type="button" onclick="toggleArticleEdit('${a.id}')"
            style="padding:7px 14px;border-radius:var(--radius);border:1px solid var(--line);background:#fff;font-size:13px;cursor:pointer">إلغاء</button>
        </div>
      </div>
    </div>
  `}).join('');
}

function toggleArticleEdit(id) {
  const el = document.getElementById('artEdit_' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function saveArticle(id) {
  const msg = document.getElementById('artEditMsg_' + id);
  if (msg) msg.textContent = 'جاري الحفظ...';
  try {
    const newImgs = await collectImages('artNewImgs_' + id, 'articles');
    const { data: existing } = await client.from('articles').select('images').eq('id', id).single();
    const existImgs = Array.isArray(existing?.images) ? existing.images : [];
    const allImgs = [...existImgs, ...newImgs];

    const payload = {
      title:      document.getElementById('af_title_' + id)?.value.trim(),
      summary:    document.getElementById('af_sum_' + id)?.value.trim(),
      content:    document.getElementById('af_con_' + id)?.value.trim(),
      image_url:  allImgs[0]?.url || null,
      images:     allImgs,
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('articles').update(payload).eq('id', id);
    if (error) throw error;
    if (msg) { msg.textContent = '✅ تم الحفظ!'; setTimeout(() => { if(msg) msg.textContent=''; }, 2500); }
    loadArticles();
  } catch(e) {
    if (msg) msg.textContent = 'خطأ: ' + e.message;
  }
}

/* ── Shared: toggle publish / delete / remove image ── */
async function togglePublish(table, id, current, listId, reloadFn) {
  await client.from(table).update({ published: !current, updated_at: new Date().toISOString() }).eq('id', id);
  reloadFn();
}

async function deleteRecord(table, id, reloadFn) {
  if (!confirm('حذف هذا العنصر نهائياً؟')) return;
  await client.from(table).delete().eq('id', id);
  reloadFn();
}

async function removeExistingImage(table, id, index, reloadFn) {
  if (!confirm('حذف هذه الصورة؟')) return;
  const { data } = await client.from(table).select('images').eq('id', id).single();
  const imgs = Array.isArray(data?.images) ? [...data.images] : [];
  imgs.splice(index, 1);
  await client.from(table).update({ images: imgs, image_url: imgs[0]?.url || null, updated_at: new Date().toISOString() }).eq('id', id);
  reloadFn();
}

async function loadLists() {
  loadStats();
  loadFaqCounts();
  loadProjects();
  loadArticles();
}

document.addEventListener("DOMContentLoaded", () => {
  if (!client) {
    setText("[data-auth-message]", "Supabase client could not load.");
    return;
  }

  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("projectForm").addEventListener("submit", handleProject);
  document.getElementById("articleForm").addEventListener("submit", handleArticle);
  document.getElementById("faqAddForm")?.addEventListener("submit", handleFaqAdd);
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


/* ═══════════════════════════════════════════
   FAQ MANAGEMENT — Page-first navigation
   ═══════════════════════════════════════════ */

const FAQ_PAGES = {
  home:        { label: 'الصفحة الرئيسية', icon: '🏠' },
  services:    { label: 'الخدمات',          icon: '⚙️' },
  agriculture: { label: 'زراعة وري',        icon: '🌱' },
  industrial:  { label: 'صناعة وتجارة',     icon: '🏭' },
  residential: { label: 'سكني',             icon: '🏡' },
  about:       { label: 'من نحن',           icon: 'ℹ️' },
  contact:     { label: 'تواصل معنا',       icon: '📞' },
};

let activeFaqPage = null;
let allFaqData = [];

/* ── Load counts for all pages ── */
async function loadFaqCounts() {
  const { data } = await client.from('faqs').select('page');
  if (!data) return;
  Object.keys(FAQ_PAGES).forEach(p => {
    const el = document.getElementById('faqCount_' + p);
    if (el) {
      const count = data.filter(r => r.page === p).length;
      el.textContent = count + ' سؤال';
    }
  });
}

/* ── Open a page panel ── */
async function openFaqPage(page) {
  activeFaqPage = page;

  // Update selector active state
  document.querySelectorAll('.faq-page-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Show panel, update title
  const panel = document.getElementById('faqPagePanel');
  if (panel) panel.style.display = 'block';
  const title = document.getElementById('faqPanelTitle');
  if (title) title.textContent = FAQ_PAGES[page]?.icon + '  ' + FAQ_PAGES[page]?.label;

  // Hide add form
  const addWrap = document.getElementById('faqAddFormWrap');
  if (addWrap) addWrap.style.display = 'none';

  await loadFaqs();
}

function closeFaqPanel() {
  activeFaqPage = null;
  const panel = document.getElementById('faqPagePanel');
  if (panel) panel.style.display = 'none';
  document.querySelectorAll('.faq-page-btn').forEach(b => b.classList.remove('active'));
}

function toggleFaqAddForm() {
  const wrap = document.getElementById('faqAddFormWrap');
  if (!wrap) return;
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    document.getElementById('faqAddForm')?.reset();
    const prev = document.getElementById('faqTranslationPreview');
    if (prev) prev.style.display = 'none';
    const msg = document.getElementById('faqAddMessage');
    if (msg) msg.textContent = '';
  }
}

/* ── Load questions for active page ── */
async function loadFaqs() {
  const container = document.getElementById('faqList');
  if (!container || !activeFaqPage) return;
  container.innerHTML = '<p style="color:var(--muted);font-size:14px">جاري التحميل…</p>';

  const { data, error } = await client
    .from('faqs').select('*')
    .eq('page', activeFaqPage)
    .order('sort_order');

  if (error) { container.innerHTML = `<p style="color:red;font-size:14px">خطأ: ${error.message}</p>`; return; }

  allFaqData = data || [];

  if (!data || data.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);font-size:14px">لا توجد أسئلة في هذه الصفحة بعد. أضف سؤالاً أعلاه.</p>';
    return;
  }

  container.innerHTML = data.map(faq => `
    <div style="border:1px solid var(--line);border-radius:var(--radius-lg);background:#fff;overflow:hidden" data-faq-id="${faq.id}">

      <!-- Row header -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px var(--space-3);background:#f9f6f2;border-bottom:1px solid var(--line);cursor:pointer"
           onclick="toggleFaqEdit('${faq.id}')">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
          <span style="min-width:24px;height:24px;border-radius:50%;background:${faq.published ? 'var(--brand)' : '#ccc'};color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center;flex-shrink:0">${faq.sort_order}</span>
          <span style="font-weight:700;font-size:13px;direction:rtl;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1" title="${escHtml(faq.question_ar || faq.question_en)}">
            ${escHtml(faq.question_ar || faq.question_en)}
          </span>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button type="button" onclick="event.stopPropagation();toggleFaqPublish('${faq.id}',${faq.published})"
            style="padding:3px 9px;border-radius:var(--radius);border:1px solid var(--line);background:${faq.published ? '#e8f5e9' : '#fff3e0'};color:${faq.published ? '#2e7d32' : '#e65100'};font-size:11px;font-weight:700;cursor:pointer">
            ${faq.published ? '✅ منشور' : '⏸ موقوف'}
          </button>
          <button type="button" onclick="event.stopPropagation();deleteFaq('${faq.id}')"
            style="padding:3px 9px;border-radius:var(--radius);border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;cursor:pointer">
            🗑
          </button>
          <span style="font-size:18px;color:var(--muted);line-height:1">›</span>
        </div>
      </div>

      <!-- Edit form (collapsed) -->
      <div id="faqEdit_${faq.id}" style="display:none;padding:var(--space-3)">

        <!-- Arabic fields -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-2)">
          <div>
            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">السؤال (عربي) *</label>
            <input id="feq_ar_${faq.id}" value="${escHtml(faq.question_ar)}" dir="rtl">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">الإجابة (عربي) *</label>
            <textarea id="fea_ar_${faq.id}" rows="3" dir="rtl">${escHtml(faq.answer_ar)}</textarea>
          </div>
        </div>

        <!-- Translate button -->
        <button type="button" onclick="translateExistingFaq('${faq.id}')"
          style="padding:6px 14px;border-radius:var(--radius);border:1px solid var(--brand);background:var(--brand-soft);color:var(--brand-dark);font-size:12px;font-weight:700;cursor:pointer;margin-bottom:var(--space-2)">
          ✨ ترجمة تلقائية من العربي
        </button>

        <!-- Other languages -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-1)">
          <div><label style="font-size:11px;font-weight:700;display:block;margin-bottom:2px">Q — English</label><input id="feq_en_${faq.id}" value="${escHtml(faq.question_en)}"></div>
          <div><label style="font-size:11px;font-weight:700;display:block;margin-bottom:2px">A — English</label><textarea id="fea_en_${faq.id}" rows="2">${escHtml(faq.answer_en)}</textarea></div>
          <div><label style="font-size:11px;font-weight:700;display:block;margin-bottom:2px">Q — Español</label><input id="feq_es_${faq.id}" value="${escHtml(faq.question_es || '')}"></div>
          <div><label style="font-size:11px;font-weight:700;display:block;margin-bottom:2px">A — Español</label><textarea id="fea_es_${faq.id}" rows="2">${escHtml(faq.answer_es || '')}</textarea></div>
          <div><label style="font-size:11px;font-weight:700;display:block;margin-bottom:2px">Q — 中文</label><input id="feq_zh_${faq.id}" value="${escHtml(faq.question_zh || '')}"></div>
          <div><label style="font-size:11px;font-weight:700;display:block;margin-bottom:2px">A — 中文</label><textarea id="fea_zh_${faq.id}" rows="2">${escHtml(faq.answer_zh || '')}</textarea></div>
        </div>

        <!-- Sort + actions -->
        <div style="display:flex;align-items:center;gap:var(--space-2);margin-top:var(--space-2);flex-wrap:wrap">
          <div>
            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">الترتيب</label>
            <input id="fesort_${faq.id}" type="number" value="${faq.sort_order}" style="width:70px;min-height:36px">
          </div>
        </div>
        <p class="form-note" id="faqEditMsg_${faq.id}" style="margin-top:6px"></p>
        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2)">
          <button class="btn btn-primary" type="button" onclick="saveFaq('${faq.id}')" style="min-height:38px;font-size:13px">💾 حفظ</button>
          <button type="button" onclick="toggleFaqEdit('${faq.id}')"
            style="padding:7px 14px;border-radius:var(--radius);border:1px solid var(--line);background:#fff;font-size:13px;cursor:pointer">إلغاء</button>
        </div>
      </div>
    </div>
  `).join('');
}

/* ── Helpers ── */
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toggleFaqEdit(id) {
  const el = document.getElementById('faqEdit_' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

/* ── Claude API translation ── */
async function callClaudeTranslate(q_ar, a_ar) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `Translate this FAQ from Arabic to English, Spanish (ES), and Chinese (ZH).
Return ONLY valid JSON, no markdown:
{"q_en":"...","a_en":"...","q_es":"...","a_es":"...","q_zh":"...","a_zh":"..."}

Arabic question: ${q_ar}
Arabic answer: ${a_ar}` }]
    })
  });
  const data = await res.json();
  const text = data.content?.find(b => b.type === 'text')?.text || '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

async function translateNewFaq() {
  const q_ar = document.getElementById('faq_new_q_ar')?.value.trim();
  const a_ar = document.getElementById('faq_new_a_ar')?.value.trim();
  const msg  = document.getElementById('faqAddMessage');
  const btn  = document.getElementById('faqTranslateBtn');
  const prev = document.getElementById('faqTranslationPreview');
  if (!q_ar || !a_ar) { if (msg) msg.textContent = 'اكتب السؤال والإجابة بالعربية أولاً.'; return; }
  if (btn) { btn.textContent = '⏳ جاري الترجمة...'; btn.disabled = true; }
  if (msg) msg.textContent = '';
  try {
    const t = await callClaudeTranslate(q_ar, a_ar);
    ['en','es','zh'].forEach(l => {
      const qEl = document.getElementById('faq_new_q_' + l);
      const aEl = document.getElementById('faq_new_a_' + l);
      if (qEl) qEl.value = t['q_' + l] || '';
      if (aEl) aEl.value = t['a_' + l] || '';
    });
    if (prev) prev.style.display = 'block';
    if (msg) msg.textContent = '✅ تمت الترجمة — راجع وعدّل إن احتجت.';
  } catch(e) {
    if (prev) prev.style.display = 'block';
    if (msg) msg.textContent = 'تعذّرت الترجمة التلقائية — يمكنك الكتابة يدوياً.';
  } finally {
    if (btn) { btn.textContent = '✨ ترجمة تلقائية'; btn.disabled = false; }
  }
}

async function translateExistingFaq(id) {
  const q_ar = document.getElementById('feq_ar_' + id)?.value.trim();
  const a_ar = document.getElementById('fea_ar_' + id)?.value.trim();
  const msg  = document.getElementById('faqEditMsg_' + id);
  if (!q_ar || !a_ar) { if (msg) msg.textContent = 'اكتب النص العربي أولاً.'; return; }
  if (msg) msg.textContent = '⏳ جاري الترجمة...';
  try {
    const t = await callClaudeTranslate(q_ar, a_ar);
    ['en','es','zh'].forEach(l => {
      const qEl = document.getElementById('feq_' + l + '_' + id);
      const aEl = document.getElementById('fea_' + l + '_' + id);
      if (qEl) qEl.value = t['q_' + l] || '';
      if (aEl) aEl.value = t['a_' + l] || '';
    });
    if (msg) msg.textContent = '✅ تمت الترجمة — راجع وعدّل إن احتجت.';
  } catch(e) {
    if (msg) msg.textContent = 'تعذّرت الترجمة التلقائية.';
  }
}

/* ── Save / publish / delete ── */
async function saveFaq(id) {
  const msg = document.getElementById('faqEditMsg_' + id);
  const payload = {
    question_ar: document.getElementById('feq_ar_' + id)?.value.trim(),
    answer_ar:   document.getElementById('fea_ar_' + id)?.value.trim(),
    question_en: document.getElementById('feq_en_' + id)?.value.trim() || '',
    answer_en:   document.getElementById('fea_en_' + id)?.value.trim() || '',
    question_es: document.getElementById('feq_es_' + id)?.value.trim() || '',
    answer_es:   document.getElementById('fea_es_' + id)?.value.trim() || '',
    question_zh: document.getElementById('feq_zh_' + id)?.value.trim() || '',
    answer_zh:   document.getElementById('fea_zh_' + id)?.value.trim() || '',
    sort_order:  Number(document.getElementById('fesort_' + id)?.value) || 100,
    updated_at:  new Date().toISOString(),
  };
  if (!payload.question_ar || !payload.answer_ar) { if (msg) msg.textContent = 'السؤال والإجابة بالعربية مطلوبان.'; return; }
  if (msg) msg.textContent = 'جاري الحفظ...';
  const { error } = await client.from('faqs').update(payload).eq('id', id);
  if (error) { if (msg) msg.textContent = 'خطأ: ' + error.message; return; }
  if (msg) { msg.textContent = '✅ تم الحفظ!'; setTimeout(() => { if (msg) msg.textContent = ''; }, 3000); }
  loadFaqs();
  loadFaqCounts();
}

async function toggleFaqPublish(id, current) {
  await client.from('faqs').update({ published: !current, updated_at: new Date().toISOString() }).eq('id', id);
  loadFaqs();
}

async function deleteFaq(id) {
  if (!confirm('حذف هذا السؤال نهائياً؟')) return;
  const { error } = await client.from('faqs').delete().eq('id', id);
  const msg = document.getElementById('faqMessage');
  if (error) { if (msg) msg.textContent = 'خطأ: ' + error.message; return; }
  if (msg) { msg.textContent = 'تم الحذف.'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000); }
  loadFaqs();
  loadFaqCounts();
}

async function handleFaqAdd(event) {
  event.preventDefault();
  const msg = document.getElementById('faqAddMessage');
  const payload = {
    question_ar: document.getElementById('faq_new_q_ar')?.value.trim(),
    answer_ar:   document.getElementById('faq_new_a_ar')?.value.trim(),
    question_en: document.getElementById('faq_new_q_en')?.value.trim() || '',
    answer_en:   document.getElementById('faq_new_a_en')?.value.trim() || '',
    question_es: document.getElementById('faq_new_q_es')?.value.trim() || '',
    answer_es:   document.getElementById('faq_new_a_es')?.value.trim() || '',
    question_zh: document.getElementById('faq_new_q_zh')?.value.trim() || '',
    answer_zh:   document.getElementById('faq_new_a_zh')?.value.trim() || '',
    page:        activeFaqPage || 'home',
    sort_order:  Number(document.getElementById('faq_new_sort')?.value) || 100,
    published:   true,
  };
  if (!payload.question_ar || !payload.answer_ar) { if (msg) msg.textContent = 'السؤال والإجابة بالعربية مطلوبان.'; return; }
  if (msg) msg.textContent = 'جاري الإضافة...';
  const { error } = await client.from('faqs').insert(payload);
  if (error) { if (msg) msg.textContent = 'خطأ: ' + error.message; return; }
  if (msg) { msg.textContent = '✅ تمت الإضافة!'; setTimeout(() => { if (msg) msg.textContent = ''; }, 3000); }
  event.target.reset();
  document.getElementById('faq_new_sort').value = '100';
  document.getElementById('faqTranslationPreview').style.display = 'none';
  toggleFaqAddForm();
  loadFaqs();
  loadFaqCounts();
}
