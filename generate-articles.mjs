/**
 * generate-articles.mjs
 * Al Asl Solar — Static Article Generator
 *
 * Run this script every time you publish or update an article:
 *   node generate-articles.mjs
 *
 * What it does:
 *   1. Fetches all published articles from Supabase
 *   2. Generates a static HTML file for each article  → /articles/{slug}.html
 *   3. Regenerates articles.html with static article cards (SEO-ready)
 *   4. Updates sitemap.xml to include every article URL
 *
 * Requirements:
 *   npm install @supabase/supabase-js marked
 */

import { createClient } from "@supabase/supabase-js";
import { marked } from "marked";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://nymkmrdbicfuniobunth.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55bWttcmRiaWNmdW5pb2J1bnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NzY0MjIsImV4cCI6MjA5NTM1MjQyMn0.31gmIJjgJM6MO0vcZqON-463MjZSe_2kcXUPlxtI5dY";
const SITE_URL = "https://alaslsolar.com";
const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getField(article, field, lang) {
  // Multilingual fields are stored as  field_en / field_ar / field_es / field_zh
  // or as a JSON object under the field key.
  const localized = article[`${field}_${lang}`];
  if (localized) return localized;
  const base = article[field];
  if (base && typeof base === "object") return base[lang] || base["en"] || "";
  return base || "";
}

function renderBody(raw = "") {
  const trimmed = raw.trim();
  return trimmed.startsWith("<") ? trimmed : marked.parse(trimmed);
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Shared nav HTML (keeps it DRY) ───────────────────────────────────────────
const NAV = `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="../index.html" aria-label="Al Asl Solar home">
      <img src="../logo-white.png" alt="Al Asl Solar logo" width="120" height="70" loading="eager">
    </a>
    <button class="menu-toggle" type="button" aria-controls="siteMenu" aria-expanded="false" data-menu-toggle>
      <i class="fa fa-bars" aria-hidden="true"></i>
      <span class="sr-only">Open menu</span>
    </button>
    <nav class="site-menu" id="siteMenu" aria-label="Main navigation">
      <a href="../index.html" data-i18n="nav_home">Home</a>
      <a href="../about.html" data-i18n="nav_about">About Us</a>
      <a href="../services.html" data-i18n="nav_services">Services</a>
      <a href="../projects.html" data-i18n="nav_projects">Projects</a>
      <a href="../articles.html" data-i18n="nav_articles">Articles</a>
      <a href="../contact.html" data-i18n="nav_contact">Contact</a>
      <a class="admin-link" href="../dashboard.html" data-i18n="nav_admin">Admin Login</a>
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

const FOOTER = `
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

const HEAD_COMMON = (extraLinks = "") => `
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
  ${extraLinks}`;

// ── Generate one static article page ─────────────────────────────────────────
function buildArticlePage(article) {
  const slug = article.slug || String(article.id);
  const title = getField(article, "title", "en");
  const summary = getField(article, "summary", "en");
  const body = renderBody(
    getField(article, "content", "en") ||
      getField(article, "body", "en") ||
      summary
  );
  const image = article.image_url || `${SITE_URL}/solar.jpg`;
  const dateISO = article.created_at
    ? new Date(article.created_at).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];
  const dateDisplay = formatDate(article.created_at);
  const pageUrl = `${SITE_URL}/articles/${slug}.html`;

  // Build hreflang links for all supported languages
  const langs = ["en", "ar", "es", "zh"];
  const hreflangLinks = langs
    .map((l) => `  <link rel="alternate" hreflang="${l}" href="${pageUrl}">`)
    .join("\n");

  // JSON-LD structured data for Google
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: summary,
    image: image,
    datePublished: dateISO,
    dateModified: dateISO,
    author: {
      "@type": "Organization",
      name: "Al Asl Solar",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Al Asl Solar",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
  });

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  ${HEAD_COMMON(`<link rel="stylesheet" href="../styles.css">`)}
  <title>${esc(title)} | Al Asl Solar</title>
  <meta name="description" content="${esc(summary)}">
  <meta property="og:title" content="${esc(title)} | Al Asl Solar">
  <meta property="og:description" content="${esc(summary)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${esc(image)}">
  <link rel="canonical" href="${pageUrl}">
${hreflangLinks}
  <script type="application/ld+json">${jsonLd}</script>
  <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script defer src="../supabase-config.js"></script>
  <script defer src="../app.js"></script>
</head>
<body>
${NAV}

  <main id="main">
    <section class="page-hero">
      <p class="eyebrow" data-i18n="articles_kicker">Knowledge center</p>
      <h1 id="articleTitle">${esc(title)}</h1>
    </section>

    <section class="section">
      <div class="article-detail" data-article-detail>
        <div class="article-detail-loading" data-article-loading hidden></div>
        <div class="article-detail-not-found" data-article-not-found hidden>
          <p data-i18n="article_not_found">This article could not be found.</p>
          <a href="../articles.html" data-i18n="article_back_link">Back to articles</a>
        </div>
        <article class="article-detail-content" data-article-content>
          ${image ? `<img data-article-image src="${esc(image)}" alt="${esc(title)}" loading="eager">` : ""}
          <span data-article-date>${esc(dateDisplay)}</span>
          <div data-article-body>${body}</div>
        </article>
      </div>
    </section>
  </main>

${FOOTER}
</body>
</html>`;
}

// ── Regenerate articles.html with static cards ────────────────────────────────
function buildArticlesPage(articles) {
  const cards = articles
    .map((article) => {
      const slug = article.slug || String(article.id);
      const title = getField(article, "title", "en");
      const summary = getField(article, "summary", "en");
      const image = article.image_url || "solar.jpg";
      const date = formatDate(article.created_at);

      return `        <a class="article-card" href="articles/${slug}.html">
          <img src="${esc(image)}" alt="${esc(title)}" loading="lazy">
          <div>
            ${date ? `<span>${esc(date)}</span>` : ""}
            <h2>${esc(title)}</h2>
            <p>${esc(summary)}</p>
          </div>
        </a>`;
    })
    .join("\n");

  // JSON-LD for the listing page
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Solar Energy Articles — Al Asl Solar",
    url: `${SITE_URL}/articles.html`,
    description:
      "Solar energy guides, tips, and industry insights from Al Asl Solar.",
    blogPost: articles.map((a) => ({
      "@type": "BlogPosting",
      headline: getField(a, "title", "en"),
      url: `${SITE_URL}/articles/${a.slug || a.id}.html`,
      datePublished: a.created_at
        ? new Date(a.created_at).toISOString().split("T")[0]
        : "",
      description: getField(a, "summary", "en"),
    })),
  });

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  ${HEAD_COMMON(`<link rel="stylesheet" href="styles.css">`)}
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
      <a class="admin-link" href="dashboard.html" data-i18n="nav_admin">Admin Login</a>
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
    { url: "/", priority: "1.0", freq: "monthly" },
    { url: "/about.html", priority: "0.8", freq: "monthly" },
    { url: "/services.html", priority: "0.9", freq: "monthly" },
    { url: "/services-agriculture.html", priority: "0.9", freq: "monthly" },
    { url: "/services-industrial.html", priority: "0.9", freq: "monthly" },
    { url: "/services-residential.html", priority: "0.9", freq: "monthly" },
    { url: "/projects.html", priority: "0.8", freq: "weekly" },
    { url: "/articles.html", priority: "0.8", freq: "weekly" },
    { url: "/contact.html", priority: "0.8", freq: "yearly" },
  ];

  const staticEntries = staticPages
    .map(
      ({ url, priority, freq }) => `  <url>
    <loc>${SITE_URL}${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`
    )
    .join("\n");

  const articleEntries = articles
    .map((a) => {
      const slug = a.slug || String(a.id);
      const lastmod = a.updated_at
        ? new Date(a.updated_at).toISOString().split("T")[0]
        : a.created_at
        ? new Date(a.created_at).toISOString().split("T")[0]
        : today;
      return `  <url>
    <loc>${SITE_URL}/articles/${slug}.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${articleEntries}
</urlset>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔄  Connecting to Supabase…");
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  // Create /articles/ directory
  const articlesDir = path.join(__dir, "articles");
  if (!fs.existsSync(articlesDir)) fs.mkdirSync(articlesDir);

  // 1. Generate individual article pages
  for (const article of articles) {
    const slug = article.slug || String(article.id);
    const html = buildArticlePage(article);
    const filePath = path.join(articlesDir, `${slug}.html`);
    fs.writeFileSync(filePath, html, "utf8");
    console.log(`   📄  articles/${slug}.html`);
  }

  // 2. Regenerate articles.html with static cards
  const articlesListHtml = buildArticlesPage(articles);
  fs.writeFileSync(path.join(__dir, "articles.html"), articlesListHtml, "utf8");
  console.log("   📄  articles.html  (updated)");

  // 3. Update sitemap.xml
  const sitemapXml = buildSitemap(articles);
  fs.writeFileSync(path.join(__dir, "sitemap.xml"), sitemapXml, "utf8");
  console.log("   🗺️   sitemap.xml  (updated)");

  console.log("\n✨  Done! Upload the following to your GitHub repo:");
  console.log("     • articles/          (whole folder)");
  console.log("     • articles.html");
  console.log("     • sitemap.xml");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
