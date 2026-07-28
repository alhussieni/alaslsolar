/**
 * generate-projects.mjs
 * Al Asl Solar — Static Project Page Generator
 *
 * Run after adding/editing a project in the dashboard:
 *   npm run generate
 * (this runs generate-articles.mjs AND generate-projects.mjs)
 *
 * Generates per published project:
 *   /projects/{slug}.html       Arabic content, default file (indexed by Google)
 *   /projects/{slug}-en.html    English fallback (same content until translated)
 *   /projects/{slug}-es.html    Spanish fallback
 *   /projects/{slug}-zh.html    Chinese fallback
 *
 * Also updates:
 *   sitemap.xml   — inside the <!-- PROJECTS:START/END --> block only,
 *                   leaving articles/static entries untouched.
 *
 * Data source:
 *   - If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (GitHub Actions),
 *     projects are fetched live from Supabase (published = true).
 *   - Otherwise (e.g. running locally before the table is seeded), falls
 *     back to data/projects-seed.json so pages can be generated immediately.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";
import { upsertMarkerBlock } from "./sitemap-utils.mjs";

const SITE_URL = "https://alaslsolar.com";
const __dir = path.dirname(fileURLToPath(import.meta.url));

// Arabic is the primary, fully-written language for project stories.
// Other language files are generated too (for hreflang completeness) and
// simply fall back to the Arabic text until per-language content is added.
const LANGS = {
  ar: { label: "العربية", dir: "rtl", hreflang: "ar", suffix: "" },
  en: { label: "English", dir: "ltr", hreflang: "en", suffix: "-en" },
  es: { label: "Español", dir: "ltr", hreflang: "es", suffix: "-es" },
  zh: { label: "中文", dir: "ltr", hreflang: "zh", suffix: "-zh" },
};

const CATEGORY_LABEL_AR = {
  Agriculture: "زراعي",
  Commercial: "تجاري",
  Institutional: "مؤسسي",
  Heritage: "تراث",
  Hybrid: "هجين",
  Residential: "سكني",
  Maintenance: "صيانة",
};

function assetHref(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("..")) return url;
  return `../${url}`;
}

function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getField(project, field, lang) {
  return project[`${field}_${lang}`] || project[`${field}_ar`] || project[field] || "";
}

function renderBody(raw = "") {
  const trimmed = raw.trim();
  return trimmed.startsWith("<") ? trimmed : marked.parse(trimmed);
}

function nav(lang) {
  const t = {
    ar: { skip: "تخطي إلى المحتوى", menu: "فتح القائمة", nav: "التنقل الرئيسي" },
    en: { skip: "Skip to content", menu: "Open menu", nav: "Main navigation" },
    es: { skip: "Saltar al contenido", menu: "Abrir menú", nav: "Navegación principal" },
    zh: { skip: "跳到主要内容", menu: "打开菜单", nav: "主导航" },
  }[lang];

  return `
  <a class="skip-link" href="#main">${t.skip}</a>
  <header class="site-header">
    <a class="brand" href="../index.html" aria-label="Al Asl Solar home">
      <img src="../logo-white.png" alt="Al Asl Solar logo" width="120" height="70" loading="eager">
    </a>
    <button class="menu-toggle" type="button" aria-controls="siteMenu" aria-expanded="false" data-menu-toggle>
      <i class="fa fa-bars" aria-hidden="true"></i>
      <span class="sr-only">${t.menu}</span>
    </button>
    <nav class="site-menu" id="siteMenu" aria-label="${t.nav}">
      <a href="../index.html" data-i18n="nav_home">Home</a>
      <a href="../about.html" data-i18n="nav_about">About Us</a>
      <a href="../services.html" data-i18n="nav_services">Services</a>
      <a href="../products.html" data-i18n="nav_products">Products</a>
      <a href="../projects.html" data-i18n="nav_projects">Projects</a>
      <a href="../articles.html" data-i18n="nav_articles">Articles</a>
      <a href="../calculators.html" data-i18n="nav_calculators">Calculators</a>
      <a href="../contact.html" data-i18n="nav_contact">Contact</a>
      <div class="lang-switcher" role="group" aria-label="Language">
        <button class="lang-globe-btn" id="langToggle" aria-expanded="false" aria-haspopup="listbox" type="button">
          <i class="ti ti-world" aria-hidden="true"></i>
          <span id="langLabel" data-i18n="language">Language</span>
          <i class="ti ti-chevron-down lang-arrow" aria-hidden="true"></i>
        </button>
        <ul class="lang-dropdown" id="langDropdown" role="listbox" aria-label="Select language">
          <li><button type="button" data-lang="en" role="option">🇺🇸 English</button></li>
          <li><button type="button" data-lang="ar" role="option">🇸🇦 العربية</button></li>
          <li><button type="button" data-lang="es" role="option">🇪🇸 Español</button></li>
          <li><button type="button" data-lang="zh" role="option">🇨🇳 中文</button></li>
        </ul>
      </div>
    </nav>
  </header>`;
}

function footer() {
  return `
  <footer class="site-footer">
    <div>
      <strong>Al Asl Solar Energy</strong>
      <p>sales@alaslsolar.com | +20 120 007 4344 | +966 56 127 4344</p>
    </div>
    <div class="social-links" aria-label="Social links">
      <a href="https://linkedin.com/company/alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><i class="fab fa-linkedin" aria-hidden="true"></i></a>
      <a href="https://youtube.com/@alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><i class="fab fa-youtube" aria-hidden="true"></i></a>
      <a href="https://facebook.com/alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><i class="fab fa-facebook" aria-hidden="true"></i></a>
      <a href="https://instagram.com/alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><i class="fab fa-instagram" aria-hidden="true"></i></a>
      <a href="https://tiktok.com/@alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><i class="fab fa-tiktok" aria-hidden="true"></i></a>
    </div>
  </footer>
  <a class="whatsapp" href="https://wa.me/201200074344" target="_blank" rel="noopener noreferrer" aria-label="Contact Al Asl Solar on WhatsApp">
    <i class="fab fa-whatsapp" aria-hidden="true"></i>
  </a>`;
}

function buildProjectPage(project, lang) {
  const { dir, hreflang, suffix } = LANGS[lang];
  const slug = project.slug;
  const title = getField(project, "title", lang);
  const summary = project.meta_description || getField(project, "summary", lang);
  const rawBody = getField(project, "content", lang) || summary;
  const body = renderBody(rawBody);
  const catLabel = CATEGORY_LABEL_AR[project.category] || project.category || "";
  const heroImage = assetHref(project.image_url) || "../solar.jpg";
  const absoluteImage = heroImage.startsWith("http") ? heroImage : `${SITE_URL}/${heroImage.replace(/^\.\.\//, "")}`;
  const gallery = Array.isArray(project.images)
    ? project.images.filter((i) => i && i.url && i.position !== "logo" && i.url !== project.image_url)
    : [];
  const logoImage = Array.isArray(project.images) ? project.images.find((i) => i && i.url && i.position === "logo") : null;
  const dateISO = project.created_at
    ? new Date(project.created_at).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const pageUrl = `${SITE_URL}/projects/${slug}${suffix}.html`;

  const hreflangLinks = Object.entries(LANGS)
    .map(([, { suffix: s, hreflang: h }]) => `  <link rel="alternate" hreflang="${h}" href="${SITE_URL}/projects/${slug}${s}.html">`)
    .join("\n");

  const langLinks = Object.entries(LANGS)
    .map(([l, { label, suffix: s }]) => {
      const active = l === lang ? ' aria-current="true"' : "";
      return `<a href="${slug}${s}.html"${active}>${label}</a>`;
    })
    .join(" | ");

  const metaLine = [project.location, project.capacity].filter(Boolean).join(" · ");

  const logoBadge = logoImage
    ? `<div class="client-logo-badge"><img src="${esc(assetHref(logoImage.url))}" alt="${esc(logoImage.caption || title)} logo" loading="eager"></div>`
    : "";

  const galleryHtml = gallery.length
    ? `<div class="project-gallery">
        ${gallery
          .map(
            (img, idx) => `<button type="button" class="project-gallery-item" data-full="${esc(assetHref(img.url))}" data-caption="${esc(img.caption || "")}" aria-label="${esc(img.caption || title)}">
          <img src="${esc(assetHref(img.url))}" alt="${esc(img.caption || title)}" loading="lazy">
        </button>`
          )
          .join("\n        ")}
      </div>`
    : "";

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: summary,
    image: absoluteImage,
    inLanguage: hreflang,
    datePublished: dateISO,
    dateModified: dateISO,
    about: catLabel || undefined,
    author: { "@type": "Organization", name: "Al Asl Solar", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "Al Asl Solar",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
  });

  return `<!DOCTYPE html>
<html lang="${hreflang}" dir="${dir}">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-N97W09ZNSP"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-N97W09ZNSP');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0d0b0a">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="format-detection" content="telephone=no">
  <link rel="preconnect" href="https://cdnjs.cloudflare.com">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
  <link rel="stylesheet" href="../styles.css">
  <title>${esc(title)} | Al Asl Solar</title>
  <meta name="description" content="${esc(summary)}">
  <meta property="og:title" content="${esc(title)} | Al Asl Solar">
  <meta property="og:description" content="${esc(summary)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${esc(absoluteImage)}">
  <link rel="canonical" href="${pageUrl}">
${hreflangLinks}
  <script type="application/ld+json">${jsonLd}</script>
  <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script defer src="../supabase-config.js"></script>
  <script defer src="../app.js"></script>
  <script defer src="../article-lang-switcher.js"></script>
</head>
<body>
${nav(lang)}

  <main id="main">
    <section class="project-hero" style="--project-hero-image:url('${esc(heroImage)}')">
      <div class="project-hero-inner">
        ${catLabel ? `<p class="eyebrow">${esc(catLabel)}</p>` : ""}
        <h1>${esc(title)}</h1>
        ${metaLine ? `<p class="project-hero-meta">${esc(metaLine)}</p>` : ""}
        ${logoBadge}
        <p class="article-lang-switcher" style="margin-top:0.5rem;font-size:0.9rem;opacity:0.85;">
          ${langLinks}
        </p>
      </div>
    </section>

    <section class="section">
      <article class="article-detail-content">
        <div>${body}</div>
        ${galleryHtml}
      </article>
      <p style="margin-top:2rem;">
        <a href="../projects.html">← Back to projects</a>
      </p>
    </section>
  </main>

${footer()}
</body>
</html>`;
}

async function loadProjects() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await client
      .from("projects")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("❌  Supabase error:", error.message);
      process.exit(1);
    }
    console.log(`✅  Fetched ${data.length} published project(s) from Supabase.`);
    return data.filter((p) => p.slug);
  }

  console.log("ℹ️   No Supabase credentials found — using data/projects-seed.json instead.");
  const seedPath = path.join(__dir, "data", "projects-seed.json");
  if (!fs.existsSync(seedPath)) return [];
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  return seed.projects.filter((p) => p.slug);
}

function buildSitemapProjectEntries(projects) {
  return projects
    .map((p) => {
      const lastmod = p.updated_at
        ? new Date(p.updated_at).toISOString().split("T")[0]
        : p.created_at
        ? new Date(p.created_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      const hreflangs = Object.entries(LANGS)
        .map(([, { hreflang, suffix }]) => `      <xhtml:link rel="alternate" hreflang="${hreflang}" href="${SITE_URL}/projects/${p.slug}${suffix}.html"/>`)
        .join("\n");
      return `  <url>
    <loc>${SITE_URL}/projects/${p.slug}.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
${hreflangs}
  </url>`;
    })
    .join("\n");
}

// ── Regenerate projects.html with static cards ─────────────────────────────
function buildProjectsPage(projects) {
  const cards = projects.map((project) => {
    const slug = project.slug;
    const title = getField(project, "title", "ar");
    const catLabel = CATEGORY_LABEL_AR[project.category] ? project.category : (project.category || "");
    // نفس منطق صفحة التفاصيل بالظبط: صورة المشروع الفعلية، ولو مفيش تُستخدم solar.jpg كاحتياطي فقط
    const cardImage = project.image_url || "solar.jpg";
    return `        <a class="project-card" data-category="${esc(project.category || "")}" href="projects/${slug}.html" style="--project-image:url('${esc(cardImage)}')">
          <span>${esc(catLabel)}</span>
          <h2>${esc(title)}</h2>
        </a>`;
  }).join("\n");

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Solar Projects — Al Asl Solar",
    url: `${SITE_URL}/projects.html`,
    description: "Completed solar energy projects by Al Asl Solar for agricultural, commercial, and residential clients in Egypt and Saudi Arabia.",
  });

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-N97W09ZNSP"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-N97W09ZNSP');
  </script>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Explore Al Asl Solar projects including farm irrigation, commercial solar, hybrid energy systems, and maintenance programs.">
  <meta name="theme-color" content="#0d0b0a">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="format-detection" content="telephone=no">
  <meta property="og:title" content="Projects | Al Asl Solar">
  <meta property="og:description" content="Solar project experience for farms, homes, and industrial facilities.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE_URL}/projects.html">
  <meta property="og:image" content="${SITE_URL}/solar.jpg">
  <title>Projects | Al Asl Solar</title>
  <link rel="canonical" href="${SITE_URL}/projects.html">
  <link rel="preconnect" href="https://cdnjs.cloudflare.com">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800&display=swap" rel="stylesheet">
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap"></noscript>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
  <link rel="stylesheet" href="styles.css">
  <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script defer src="supabase-config.js"></script>
  <link rel="alternate" hreflang="en" href="${SITE_URL}/projects.html">
  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/projects.html">
  <script type="application/ld+json">${jsonLd}</script>
  <script defer src="app.js"></script>
</head>
<body>
  <a class="skip-link" href="#main" data-i18n="skip_link">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="index.html" aria-label="Al Asl Solar home">
      <img src="logo-white.png" alt="Al Asl Solar logo" width="120" height="70" loading="eager">
    </a>
    <button class="menu-toggle" type="button" aria-controls="siteMenu" aria-expanded="false" data-menu-toggle>
      <i class="fa fa-bars" aria-hidden="true"></i>
      <span class="sr-only" data-i18n="menu_open">Open menu</span>
    </button>
    <nav class="site-menu" id="siteMenu" aria-label="Main navigation">
      <a href="index.html" data-i18n="nav_home">Home</a>
      <a href="about.html" data-i18n="nav_about">About Us</a>
      <a href="services.html" data-i18n="nav_services">Services</a>
      <a href="products.html" data-i18n="nav_products">Products</a>
      <a href="projects.html" data-i18n="nav_projects">Projects</a>
      <a href="articles.html" data-i18n="nav_articles">Articles</a>
      <a href="calculators.html" data-i18n="nav_calculators">Calculators</a>
      <a href="contact.html" data-i18n="nav_contact">Contact</a>
      <div class="lang-switcher" role="group" aria-label="Language">
        <button class="lang-globe-btn" id="langToggle" aria-expanded="false" aria-haspopup="listbox" type="button">
          <i class="ti ti-world" aria-hidden="true"></i>
          <span id="langLabel" data-i18n="language">Language</span>
          <i class="ti ti-chevron-down lang-arrow" aria-hidden="true"></i>
        </button>
        <ul class="lang-dropdown" id="langDropdown" role="listbox" aria-label="Select language">
          <li><button type="button" data-lang="en" role="option">🇺🇸 English</button></li>
          <li><button type="button" data-lang="ar" role="option">🇸🇦 العربية</button></li>
          <li><button type="button" data-lang="es" role="option">🇪🇸 Español</button></li>
          <li><button type="button" data-lang="zh" role="option">🇨🇳 中文</button></li>
        </ul>
      </div>
    </nav>
  </header>

  <main id="main">
    <section class="page-hero">
      <p class="eyebrow" data-i18n="projects_kicker">Project experience</p>
      <h1 data-i18n="projects_title">Solar solutions built for real operating conditions</h1>
      <p data-i18n="projects_intro">Use this page to present completed projects with real photos, capacity, location, savings, and commissioning date when available.</p>
    </section>

    <section class="section">
      <div class="filter-bar" data-project-filters>
        <button class="active" type="button" data-filter="all" data-i18n="filter_all">All</button>
        <button type="button" data-filter="Agriculture" data-i18n="filter_agriculture">Agriculture</button>
        <button type="button" data-filter="Commercial" data-i18n="filter_commercial">Commercial</button>
        <button type="button" data-filter="Institutional" data-i18n="filter_institutional">Institutional</button>
        <button type="button" data-filter="Heritage" data-i18n="filter_heritage">Heritage</button>
        <button type="button" data-filter="Hybrid" data-i18n="filter_hybrid">Hybrid</button>
        <button type="button" data-filter="Residential" data-i18n="filter_residential">Residential</button>
      </div>
      <div class="cards three" id="projectsGrid" data-projects-grid>
${cards}
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div>
      <strong>Al Asl Solar Energy</strong>
      <p>sales@alaslsolar.com | +20 120 007 4344 | +966 56 127 4344</p>
    </div>
    <div class="social-links" aria-label="Social links">
      <a href="https://linkedin.com/company/alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><i class="fab fa-linkedin" aria-hidden="true"></i></a>
      <a href="https://youtube.com/@alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><i class="fab fa-youtube" aria-hidden="true"></i></a>
      <a href="https://facebook.com/alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><i class="fab fa-facebook" aria-hidden="true"></i></a>
      <a href="https://instagram.com/alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><i class="fab fa-instagram" aria-hidden="true"></i></a>
      <a href="https://tiktok.com/@alaslsolar" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><i class="fab fa-tiktok" aria-hidden="true"></i></a>
    </div>
  </footer>

  <a class="whatsapp" href="https://wa.me/201200074344" target="_blank" rel="noopener noreferrer" aria-label="Contact Al Asl Solar on WhatsApp">
    <i class="fab fa-whatsapp" aria-hidden="true"></i>
  </a>
</body>
</html>`;
}

async function main() {
  const projects = await loadProjects();

  const projectsDir = path.join(__dir, "projects");
  if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir);

  for (const project of projects) {
    for (const lang of Object.keys(LANGS)) {
      const { suffix } = LANGS[lang];
      const html = buildProjectPage(project, lang);
      const filename = `${project.slug}${suffix}.html`;
      fs.writeFileSync(path.join(projectsDir, filename), html, "utf8");
      console.log(`   📄  projects/${filename}`);
    }
  }

  // Update sitemap.xml — only the PROJECTS marker block, leaving whatever
  // generate-articles.mjs wrote for static pages + articles untouched.
  const sitemapPath = path.join(__dir, "sitemap.xml");
  let sitemapXml = fs.existsSync(sitemapPath)
    ? fs.readFileSync(sitemapPath, "utf8")
    : `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n</urlset>`;

  const projectEntries = buildSitemapProjectEntries(projects);
  sitemapXml = upsertMarkerBlock(sitemapXml, "PROJECTS", projectEntries);
  fs.writeFileSync(sitemapPath, sitemapXml, "utf8");
  console.log("   🗺️   sitemap.xml  (projects section updated)");

  // Regenerate projects.html (the listing page) — previously this was a
  // hand-edited static file never touched by automation, which is why it
  // always showed solar.jpg and never reflected admin-uploaded images.
  const projectsPageHtml = buildProjectsPage(projects);
  fs.writeFileSync(path.join(__dir, "projects.html"), projectsPageHtml, "utf8");
  console.log("   📄  projects.html  (updated)");

  console.log(`\n✨  Done! Generated ${projects.length * Object.keys(LANGS).length} project page(s).`);
  console.log("    Upload to GitHub: projects/  projects.html  sitemap.xml");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
