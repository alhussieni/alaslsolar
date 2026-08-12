/**
 * generate-articles.mjs
 * Al Asl Solar — Static Article Generator (Multilingual)
 *
 * Run after publishing or updating an article:
 *   npm run generate
 *
 * Generates per article:
 *   /articles/{slug}.html       English (default, indexed by Google)
 *   /articles/{slug}-ar.html    Arabic
 *   /articles/{slug}-es.html    Spanish
 *   /articles/{slug}-zh.html    Chinese
 *
 * Also regenerates:
 *   articles.html   — static cards (English)
 *   sitemap.xml     — all article URLs
 */

import { createClient } from "@supabase/supabase-js";
import { marked } from "marked";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { upsertMarkerBlock, readMarkerBlock } from "./sitemap-utils.mjs";

// ── Config ────────────────────────────────────────────────────────────────────
// Supabase credentials are read from environment variables (set as GitHub
// Secrets in the workflow). Never hardcode keys directly in this file.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.\n" +
    "    Set them as GitHub Secrets, or export them locally before running this script."
  );
  process.exit(1);
}

const SITE_URL = "https://alaslsolar.com";
const __dir = path.dirname(fileURLToPath(import.meta.url));

// Supported languages: code → { label, dir, hreflang, suffix }
const LANGS = {
  en: { label: "English",  dir: "ltr", hreflang: "en", suffix: ""     },
  ar: { label: "العربية",  dir: "rtl", hreflang: "ar", suffix: "-ar"  },
  es: { label: "Español",  dir: "ltr", hreflang: "es", suffix: "-es"  },
  zh: { label: "中文",      dir: "ltr", hreflang: "zh", suffix: "-zh"  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Get the best available field for a language, falling back to Arabic then English
function getField(article, field, lang) {
  return (
    article[`${field}_${lang}`] ||
    article[`${field}_ar`]      ||
    article[`${field}_en`]      ||
    article[field]              ||
    ""
  );
}

function renderBody(raw = "") {
  const trimmed = raw.trim();
  return trimmed.startsWith("<") ? trimmed : marked.parse(trimmed);
}

function formatDate(iso, lang = "en") {
  if (!iso) return "";
  const locales = { en: "en-GB", ar: "ar-SA", es: "es-ES", zh: "zh-CN" };
  return new Date(iso).toLocaleDateString(locales[lang] || "en-GB", {
    year: "numeric", month: "long", day: "numeric",
  });
}

// ── Shared layout blocks ──────────────────────────────────────────────────────
const CSS_LINKS = `
  <link rel="preconnect" href="https://cdnjs.cloudflare.com">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">`;

const NAV_I18N = {
  en: { skip: "Skip to content", menu: "Open menu", nav: "Main navigation" },
  ar: { skip: "تخطي إلى المحتوى", menu: "فتح القائمة", nav: "التنقل الرئيسي" },
  es: { skip: "Saltar al contenido", menu: "Abrir menú", nav: "Navegación principal" },
  zh: { skip: "跳到主要内容", menu: "打开菜单", nav: "主导航" },
};

function nav(depth = 1, lang = "en") {
  const prefix = depth === 1 ? "../" : "";
  const t = NAV_I18N[lang] || NAV_I18N.en;
  return `
  <a class="skip-link" href="#main">${t.skip}</a>
  <header class="site-header">
    <a class="brand" href="${prefix}index.html" aria-label="Al Asl Solar home">
      <img src="${prefix}logo-white.png" alt="Al Asl Solar logo" width="120" height="70" loading="eager">
    </a>
    <button class="menu-toggle" type="button" aria-controls="siteMenu" aria-expanded="false" data-menu-toggle>
      <i class="fa fa-bars" aria-hidden="true"></i>
      <span class="sr-only">${t.menu}</span>
    </button>
    <nav class="site-menu" id="siteMenu" aria-label="${t.nav}">
      <a href="${prefix}index.html" data-i18n="nav_home">Home</a>
      <a href="${prefix}about.html" data-i18n="nav_about">About Us</a>
      <a href="${prefix}services.html" data-i18n="nav_services">Services</a>
      <a href="${prefix}products.html" data-i18n="nav_products">Products</a>
      <a href="${prefix}projects.html" data-i18n="nav_projects">Projects</a>
      <a href="${prefix}articles.html" data-i18n="nav_articles">Articles</a>
      <a href="${prefix}calculators.html" data-i18n="nav_calculators">Calculators</a>
      <a href="${prefix}contact.html" data-i18n="nav_contact">Contact</a>
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

// ── Build one article page for one language ───────────────────────────────────
function buildArticlePage(article, lang) {
  const { dir, hreflang, suffix } = LANGS[lang];
  const slug    = article.slug || String(article.id);
  const title   = getField(article, "title",   lang);
  const summary = getField(article, "summary", lang);
  const rawBody = getField(article, "content", lang) || getField(article, "body", lang) || summary;
  const body    = renderBody(rawBody);
  const image   = article.image_url || `${SITE_URL}/solar.jpg`;
  const dateISO = article.created_at
    ? new Date(article.created_at).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];
  const dateDisplay = formatDate(article.created_at, lang);

  const pageUrl     = `${SITE_URL}/articles/${slug}${suffix}.html`;
  const canonicalUrl = pageUrl; // self-referencing canonical: every language
                                 // variant points to itself, not to EN. Each
                                 // language is declared instead via the
                                 // hreflang alternates below.

  // hreflang links for all variants
  const hreflangLinks = Object.entries(LANGS)
    .map(([l, { suffix: s, hreflang: h }]) =>
      `  <link rel="alternate" hreflang="${h}" href="${SITE_URL}/articles/${slug}${s}.html">`)
    .join("\n");

  // Language switcher links (shown as static links so Google can follow them)
  const langLinks = Object.entries(LANGS)
    .map(([l, { label, suffix: s }]) => {
      const active = l === lang ? ' aria-current="true"' : "";
      return `<a href="${slug}${s}.html"${active}>${label}</a>`;
    })
    .join(" | ");

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: summary,
    image,
    inLanguage: hreflang,
    datePublished: dateISO,
    dateModified: dateISO,
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
  ${CSS_LINKS}
  <link rel="stylesheet" href="../styles.css">
  <title>${esc(title)} | Al Asl Solar</title>
  <meta name="description" content="${esc(summary)}">
  <meta property="og:title" content="${esc(title)} | Al Asl Solar">
  <meta property="og:description" content="${esc(summary)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${esc(image)}">
  <link rel="canonical" href="${canonicalUrl}">
${hreflangLinks}
  <script type="application/ld+json">${jsonLd}</script>
  <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script defer src="../supabase-config.js"></script>
  <script defer src="../app.js"></script>
  <script defer src="../article-lang-switcher.js"></script>
</head>
<body>
${nav(1, lang)}

  <main id="main">
    <section class="page-hero">
      <p class="eyebrow">Knowledge center</p>
      <h1>${esc(title)}</h1>
      <p class="article-lang-switcher" style="margin-top:0.5rem;font-size:0.9rem;opacity:0.75;">
        ${langLinks}
      </p>
    </section>

    <section class="section">
      <article class="article-detail-content">
        ${image ? `<img src="${esc(image)}" alt="${esc(title)}" loading="eager">` : ""}
        <span>${esc(dateDisplay)}</span>
        <div>${body}</div>
      </article>
      <p style="margin-top:2rem;">
        <a href="../articles.html">← Back to articles</a>
      </p>
    </section>
  </main>

${footer()}
</body>
</html>`;
}

// ── Regenerate articles.html with static cards ────────────────────────────────
function buildArticlesPage(articles) {
  const cards = articles.map((article) => {
    const slug    = article.slug || String(article.id);
    const title   = getField(article, "title",   "en");
    const summary = getField(article, "summary", "en");
    const image   = article.image_url || "solar.jpg";
    const date    = formatDate(article.created_at, "en");
    return `        <a class="article-card" href="articles/${slug}.html">
          <img src="${esc(image)}" alt="${esc(title)}" loading="lazy">
          <div>
            ${date ? `<span>${esc(date)}</span>` : ""}
            <h2>${esc(title)}</h2>
            <p>${esc(summary)}</p>
          </div>
        </a>`;
  }).join("\n");

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Solar Energy Articles — Al Asl Solar",
    url: `${SITE_URL}/articles.html`,
    description: "Solar energy guides, tips, and industry insights from Al Asl Solar.",
    blogPost: articles.map((a) => ({
      "@type": "BlogPosting",
      headline: getField(a, "title", "en"),
      url: `${SITE_URL}/articles/${a.slug || a.id}.html`,
      datePublished: a.created_at ? new Date(a.created_at).toISOString().split("T")[0] : "",
      description: getField(a, "summary", "en"),
    })),
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
  <meta name="theme-color" content="#0d0b0a">
  ${CSS_LINKS}
  <link rel="stylesheet" href="styles.css">
  <title>Articles | Al Asl Solar</title>
  <meta name="description" content="Read Al Asl Solar articles, updates, and renewable energy insights.">
  <meta property="og:title" content="Articles | Al Asl Solar">
  <meta property="og:description" content="Solar energy articles, project updates, and renewable energy insights.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE_URL}/articles.html">
  <meta property="og:image" content="${SITE_URL}/solar.jpg">
  <link rel="canonical" href="${SITE_URL}/articles.html">
  <link rel="alternate" hreflang="en" href="${SITE_URL}/articles.html">
  <link rel="alternate" hreflang="ar" href="${SITE_URL}/articles.html">
  <link rel="alternate" hreflang="es" href="${SITE_URL}/articles.html">
  <link rel="alternate" hreflang="zh" href="${SITE_URL}/articles.html">
  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/articles.html">
  <script type="application/ld+json">${jsonLd}</script>
  <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script defer src="supabase-config.js"></script>
  <script defer src="app.js"></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="index.html" aria-label="Al Asl Solar home">
      <img src="logo-white.png" alt="Al Asl Solar logo" width="120" height="70" loading="eager">
    </a>
    <button class="menu-toggle" type="button" aria-controls="siteMenu" aria-expanded="false" data-menu-toggle>
      <i class="fa fa-bars" aria-hidden="true"></i>
      <span class="sr-only">Open menu</span>
    </button>
    <nav class="site-menu" id="siteMenu" aria-label="Main navigation">
      <a href="index.html" data-i18n="nav_home">Home</a>
      <a href="about.html" data-i18n="nav_about">About Us</a>
      <a href="services.html" data-i18n="nav_services">Services</a>
      <a href="projects.html" data-i18n="nav_projects">Projects</a>
      <a href="articles.html" data-i18n="nav_articles">Articles</a>
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
      <p class="eyebrow" data-i18n="articles_kicker">Knowledge center</p>
      <h1 data-i18n="articles_title">Solar articles and updates</h1>
      <p data-i18n="articles_intro">Insights, announcements, and practical notes from Al Asl Solar.</p>
    </section>
    <section class="section">
      <div class="article-controls" data-articles-controls></div>
      <div class="cards three" data-articles-grid>
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

// ── Update sitemap.xml ────────────────────────────────────────────────────────
function buildSitemap(articles) {
  const today = new Date().toISOString().split("T")[0];

  const staticPages = [
    { url: "/",                        priority: "1.0", freq: "monthly" },
    { url: "/about.html",              priority: "0.8", freq: "monthly" },
    { url: "/services.html",           priority: "0.9", freq: "monthly" },
    { url: "/services-agriculture.html", priority: "0.9", freq: "monthly" },
    { url: "/services-industrial.html",  priority: "0.9", freq: "monthly" },
    { url: "/services-residential.html", priority: "0.9", freq: "monthly" },
    { url: "/products.html",           priority: "0.8", freq: "weekly"  },
    { url: "/projects.html",           priority: "0.8", freq: "weekly"  },
    { url: "/articles.html",           priority: "0.8", freq: "weekly"  },
    { url: "/calculators.html",        priority: "0.7", freq: "monthly" },
    { url: "/pump-calculator.html",    priority: "0.6", freq: "monthly" },
    { url: "/contact.html",            priority: "0.8", freq: "yearly"  },
  ];

  const staticEntries = staticPages.map(({ url, priority, freq }) => `  <url>
    <loc>${SITE_URL}${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");

  // Each article generates 4 URLs — EN is canonical, others are alternates
  const articleEntries = articles.flatMap((a) => {
    const slug    = a.slug || String(a.id);
    const lastmod = a.updated_at
      ? new Date(a.updated_at).toISOString().split("T")[0]
      : a.created_at
      ? new Date(a.created_at).toISOString().split("T")[0]
      : today;

    // hreflang links for sitemap
    const hreflangs = Object.entries(LANGS)
      .map(([l, { hreflang, suffix }]) =>
        `      <xhtml:link rel="alternate" hreflang="${hreflang}" href="${SITE_URL}/articles/${slug}${suffix}.html"/>`)
      .join("\n");

    // Only include the canonical (EN) URL in sitemap with hreflang annotations
    return `  <url>
    <loc>${SITE_URL}/articles/${slug}.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
${hreflangs}
  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${staticEntries}
${articleEntries}
</urlset>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔄  Connecting to Supabase…");
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: articles, error } = await client
    .from("articles")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌  Supabase error:", error.message);
    process.exit(1);
  }

  console.log(`✅  Fetched ${articles.length} published article(s).`);

  const articlesDir = path.join(__dir, "articles");
  if (!fs.existsSync(articlesDir)) fs.mkdirSync(articlesDir);

  // 1. Generate all language variants for each article
  for (const article of articles) {
    const slug = article.slug || String(article.id);
    for (const lang of Object.keys(LANGS)) {
      const { suffix } = LANGS[lang];
      const html     = buildArticlePage(article, lang);
      const filename = `${slug}${suffix}.html`;
      fs.writeFileSync(path.join(articlesDir, filename), html, "utf8");
      console.log(`   📄  articles/${filename}`);
    }
  }

  // 2. Regenerate articles.html
  const articlesListHtml = buildArticlesPage(articles);
  fs.writeFileSync(path.join(__dir, "articles.html"), articlesListHtml, "utf8");
  console.log("   📄  articles.html  (updated)");

  // 3. Update sitemap.xml — preserve whatever generate-projects.mjs and
  //    generate-products.mjs last wrote inside their own marker blocks,
  //    since these generators run independently and each only owns its
  //    own section.
  const sitemapPath = path.join(__dir, "sitemap.xml");
  const previousSitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, "utf8") : "";
  const preservedProjectsBlock = readMarkerBlock(previousSitemap, "PROJECTS");
  const preservedProductsBlock = readMarkerBlock(previousSitemap, "PRODUCTS");
  let sitemapXml = buildSitemap(articles);
  if (preservedProjectsBlock) {
    sitemapXml = upsertMarkerBlock(sitemapXml, "PROJECTS", preservedProjectsBlock);
  }
  if (preservedProductsBlock) {
    sitemapXml = upsertMarkerBlock(sitemapXml, "PRODUCTS", preservedProductsBlock);
  }
  fs.writeFileSync(sitemapPath, sitemapXml, "utf8");
  console.log("   🗺️   sitemap.xml  (updated)");

  console.log(`\n✨  Done! Generated ${articles.length * 4} article pages (EN + AR + ES + ZH).`);
  console.log("    Upload to GitHub: articles/  articles.html  sitemap.xml");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
