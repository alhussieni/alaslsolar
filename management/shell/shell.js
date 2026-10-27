/* ============================================================
   management/shell/shell.js — الهيكل الثابت المشترك لكل أقسام الموظفين.
   صفحة تضيف سطرين بس:  <link rel="stylesheet" href="/management/shell/shell.css">
                         <script defer src="/management/shell/shell.js"></script>
   (QL بتحمّله عن طريق rep-header.js). الملف بيكتشف القسم من المسار تلقائيًا.

   بيعرض: شريط علوي (لوجو، أقسام حسب الصلاحية، بحث عن عميل، قائمة المستخدم)
          + تبويبات القسم (CRM / أدوات QL).
   ملاحظة أمان: إظهار/إخفاء الأقسام تجميل فقط؛ الحماية الفعلية في RLS ودوال السيرفر.
   ============================================================ */
(function () {
  'use strict';
  if (window.__alaslShell) return;
  window.__alaslShell = true;

  var ROLE_LABELS = { superadmin: 'سوبر أدمن', admin: 'أدمن', sales_manager: 'مدير مناديب', sales_rep: 'مندوب' };

  /* الأقسام في الشريط العلوي (بالترتيب). any = أي صلاحية من دول تظهر القسم؛ null = لكل موظف مسجّل */
  var SECTIONS = [
    { id: 'portal',    label: 'الرئيسية',      icon: 'fa-house',        href: '/management/',            any: null },
    { id: 'crm',       label: 'العملاء',        icon: 'fa-address-book', href: '/QL/rep-customers.html', any: ['customers.read_own', 'customers.read_all'] },
    { id: 'ql',        label: 'عروض الأسعار',   icon: 'fa-file-invoice', href: '/QL/',                   any: ['ql.access'] },
    { id: 'dashboard', label: 'لوحة التحكم',    icon: 'fa-gauge-high',   href: '/dashboard.html',        any: ['dashboard.access'] },
    { id: 'staff',     label: 'الموظفين',       icon: 'fa-user-shield',  href: '/admin/staff.html',      any: ['staff.manage'] },
    { id: 'erp',       label: 'ERP',            icon: 'fa-industry',     href: '/erp/',                  any: ['erp.access'] }
  ];

  /* تبويبات داخل القسم */
  var SUBNAV = {
    crm: [
      { label: 'العملاء',        href: '/QL/rep-customers.html', any: ['customers.read_own', 'customers.read_all'], key: 'rep-customers.html|' },
      { label: 'المتابعات',      href: '/QL/rep-customers.html#followups', any: ['customers.read_own', 'customers.read_all'], key: 'rep-customers.html|#followups' },
      { label: 'سجل العروض',     href: '/QL/rep-crm.html', any: ['crm.access'], key: 'rep-crm.html|' },
      { label: 'أداء المناديب',  href: '/QL/rep-customers.html#overview', any: ['reps.activity.read'], key: 'rep-customers.html|#overview' }
    ],
    ql: [
      { label: 'حاسبة أوف جريد',  href: '/QL/rep-offgrid-quote.html', any: ['ql.access'], key: 'rep-offgrid-quote.html|' },
      { label: 'محطة ري شمسية',   href: '/QL/solar-pump-station.html', any: ['ql.access'], key: 'solar-pump-station.html|' },
      { label: 'عروض المنتجات',   href: '/QL/rep-quotes.html', any: ['ql.access'], key: 'rep-quotes.html|' },
      { label: 'دراسة جدوى',      href: '/QL/feasibility-study.html', any: ['ql.access'], key: 'feasibility-study.html|' }
    ]
  };

  function detectSection(pathname) {
    var p = pathname.toLowerCase();
    if (p.indexOf('/management') === 0) return 'portal'; // يشمل /management/account.html
    if (p.indexOf('/admin/staff') === 0) return 'staff';
    if (p.indexOf('/erp') === 0) return 'erp';
    if (/\/dashboard\.html$/.test(p)) return 'dashboard';
    if (p.indexOf('/ql') === 0) {
      var file = p.split('/').pop();
      return (file === 'rep-customers.html' || file === 'rep-crm.html') ? 'crm' : 'ql';
    }
    return null; // أي صفحة تانية: الشريط ما بيظهرش
  }

  var section = detectSection(location.pathname);
  if (!section) return;

  function has(perms, any) { return !any || any.some(function (p) { return perms.indexOf(p) >= 0; }); }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') el.className = attrs[k]; else if (k === 'text') el.textContent = attrs[k]; else el.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return el;
  }
  function icon(cls) { return h('i', { 'class': 'fa-solid ' + cls, 'aria-hidden': 'true' }); }

  /* ---------- عميل Supabase (نفس عميل الصفحة لو موجود، وإلا بنحمّله) ---------- */
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  async function getClient() {
    var started = Date.now();
    while (!window.getAlaslSupabase && Date.now() - started < 1200) await new Promise(function (r) { setTimeout(r, 60); });
    if (!window.getAlaslSupabase) {
      try {
        if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
        await loadScript('/supabase-config.js');
      } catch (e) { return null; }
    }
    started = Date.now();
    while (!window.getAlaslSupabase && Date.now() - started < 3000) await new Promise(function (r) { setTimeout(r, 60); });
    return window.getAlaslSupabase ? window.getAlaslSupabase() : null;
  }

  /* ---------- بناء الشريط ---------- */
  var bar = null, sub = null, client = null, ctx = { session: null, perms: [], roles: [], name: '' };

  function mountFrame() {
    document.body.classList.add('has-shell');
    bar = h('header', { 'class': 'ash-bar', role: 'banner' });
    sub = h('nav', { 'class': 'ash-sub', 'aria-label': 'تبويبات القسم', hidden: '' });
    document.body.insertBefore(sub, document.body.firstChild);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function measure() {
    var root = document.documentElement.style;
    root.setProperty('--ash-h', (bar ? bar.offsetHeight : 64) + 'px');
    root.setProperty('--ash-sub-h', (sub && !sub.hidden ? sub.offsetHeight : 0) + 'px');
  }

  function render() {
    bar.textContent = '';
    var loggedIn = !!ctx.session;

    var brand = h('a', { 'class': 'ash-brand', href: loggedIn ? '/management/' : '/index.html', 'aria-label': 'الأصل للطاقة الشمسية' }, h('img', { src: '/logo-white.png', alt: 'الأصل للطاقة الشمسية' }));
    var burger = h('button', { 'class': 'ash-burger', type: 'button', 'aria-label': 'القائمة', 'aria-expanded': 'false' }, icon('fa-bars'));
    burger.addEventListener('click', function () { var o = bar.classList.toggle('is-open'); burger.setAttribute('aria-expanded', String(o)); setTimeout(measure, 0); });
    bar.appendChild(brand);
    bar.appendChild(burger);

    var nav = h('nav', { 'class': 'ash-nav', 'aria-label': 'أقسام النظام' });
    if (loggedIn) {
      SECTIONS.forEach(function (s) {
        if (!has(ctx.perms, s.any)) return;
        var a = h('a', { 'class': 'ash-link' + (s.id === section ? ' is-active' : ''), href: s.href }, icon(s.icon), h('span', { text: s.label }));
        if (s.id === section) a.setAttribute('aria-current', 'page');
        nav.appendChild(a);
      });
    }
    bar.appendChild(nav);

    if (loggedIn && (has(ctx.perms, ['customers.read_own', 'customers.read_all']))) bar.appendChild(buildSearch());

    if (loggedIn) {
      bar.appendChild(buildUserMenu());
    } else {
      bar.appendChild(h('a', { 'class': 'ash-login', href: '/management/' }, 'دخول الموظفين'));
    }
    renderSub();
    measure();
  }

  function currentKey() {
    var file = location.pathname.split('/').pop() || '';
    return file.toLowerCase() + '|' + (location.hash || '');
  }

  function renderSub() {
    sub.textContent = '';
    var items = (ctx.session && SUBNAV[section]) ? SUBNAV[section].filter(function (t) { return has(ctx.perms, t.any); }) : [];
    if (items.length < 2) { sub.hidden = true; return; }
    var cur = currentKey();
    var file = cur.split('|')[0];
    // التبويب النشط: تطابق كامل (ملف + hash)، وإلا تبويب الملف نفسه بدون hash
    var active = items.filter(function (t) { return t.key === cur; })[0] || items.filter(function (t) { return t.key === file + '|'; })[0];
    items.forEach(function (t) {
      var a = h('a', { href: t.href, 'class': t === active ? 'is-active' : '' }, t.label);
      if (t === active) a.setAttribute('aria-current', 'page');
      sub.appendChild(a);
    });
    sub.hidden = false;
  }

  /* ---------- البحث عن عميل ---------- */
  // أي حرف خارج (حروف/أرقام/مسافة/+/-/.) بيتشال: ده بيمنع حقن فلاتر PostgREST (الفواصل والأقواس).
  function sanitize(q) { return String(q || '').replace(/[^\p{L}\p{N}\s+\-.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40); }

  function buildSearch() {
    var wrap = h('div', { 'class': 'ash-search', role: 'search' });
    var input = h('input', { type: 'search', placeholder: 'بحث عن عميل (اسم أو موبايل)', 'aria-label': 'بحث عن عميل', autocomplete: 'off' });
    var box = h('div', { 'class': 'ash-results', hidden: '' });
    wrap.appendChild(input); wrap.appendChild(icon('fa-magnifying-glass')); wrap.appendChild(box);
    var timer = null, seq = 0;

    function close() { box.hidden = true; box.textContent = ''; }
    async function run() {
      var term = sanitize(input.value);
      if (term.length < 2) { close(); return; }
      var my = ++seq;
      var res = await client.from('customers').select('id, name, phone, city').or('name.ilike.%' + term + '%,phone.ilike.%' + term + '%').order('created_at', { ascending: false }).limit(8);
      if (my !== seq) return; // نتيجة قديمة
      box.textContent = '';
      if (res.error) { box.appendChild(h('div', { 'class': 'ash-empty', text: 'تعذر البحث.' })); }
      else if (!res.data || !res.data.length) { box.appendChild(h('div', { 'class': 'ash-empty', text: 'لا توجد نتائج.' })); }
      else res.data.forEach(function (c) {
        box.appendChild(h('a', { href: '/QL/rep-customers.html?customer=' + encodeURIComponent(c.id) }, c.name, h('small', { text: (c.phone || '') + (c.city ? ' — ' + c.city : '') })));
      });
      box.hidden = false;
    }
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 250); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); input.blur(); }
      if (e.key === 'Enter') { var first = box.querySelector('a'); if (first) { e.preventDefault(); location.href = first.getAttribute('href'); } }
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
    return wrap;
  }

  /* ---------- قائمة المستخدم ---------- */
  function buildUserMenu() {
    var email = (ctx.session.user && ctx.session.user.email) || '';
    var name = ctx.name || email.split('@')[0];
    var wrap = h('div', { 'class': 'ash-user' });
    var btn = h('button', { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' },
      h('span', { 'class': 'ash-avatar', text: (name.trim()[0] || '?').toUpperCase() }), h('span', { 'class': 'ash-uname', text: name }), icon('fa-chevron-down'));
    var menu = h('div', { 'class': 'ash-menu', hidden: '' });
    var who = h('div', { 'class': 'ash-who' }, h('strong', { text: name }), h('span', { text: email }));
    ctx.roles.forEach(function (r) { who.appendChild(h('span', { 'class': 'ash-role', text: ROLE_LABELS[r] || r })); });
    menu.appendChild(who);
    menu.appendChild(h('a', { href: '/management/account.html' }, icon('fa-user-gear'), 'حسابي: الاسم وكلمة المرور'));
    menu.appendChild(h('a', { href: '/index.html' }, icon('fa-globe'), 'موقع الشركة'));
    var out = h('button', { type: 'button', 'class': 'ash-danger' }, icon('fa-right-from-bracket'), 'تسجيل الخروج');
    out.addEventListener('click', async function () { await client.auth.signOut(); location.href = '/management/'; });
    menu.appendChild(out);
    btn.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    wrap.appendChild(btn); wrap.appendChild(menu);
    return wrap;
  }

  /* ---------- تحميل حالة المستخدم ---------- */
  async function loadContext() {
    var s = (await client.auth.getSession()).data.session;
    ctx.session = s; ctx.perms = []; ctx.roles = []; ctx.name = '';
    if (!s) return;
    var uid = s.user.id;
    var results = await Promise.all([
      client.rpc('my_permissions'),
      client.from('staff_profiles').select('display_name').eq('id', uid).maybeSingle(),
      client.from('user_roles').select('role_key').eq('user_id', uid)
    ]);
    ctx.perms = (results[0].data && Array.isArray(results[0].data)) ? results[0].data : [];
    ctx.name = (results[1].data && results[1].data.display_name) || '';
    ctx.roles = (results[2].data || []).map(function (r) { return r.role_key; });
  }

  async function boot() {
    mountFrame();
    render(); // هيكل مبدئي (لوجو + دخول) لحد ما نعرف الجلسة
    window.addEventListener('resize', measure);
    window.addEventListener('hashchange', function () { renderSub(); measure(); });
    window.addEventListener('alasl:profile-updated', async function () { if (client) { await loadContext(); render(); } });
    client = await getClient();
    if (!client) return;
    await loadContext(); render();
    client.auth.onAuthStateChange(async function (event) {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') { await loadContext(); render(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
