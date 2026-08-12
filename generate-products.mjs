/**
 * generate-products.mjs
 * Al Asl Solar — Static Product Family Generator (Multilingual, SEO/GEO)
 *
 * Why this exists: products.html and product-detail.html render every
 * product entirely client-side from Supabase, and product-detail.html is
 * explicitly noindex'd (same treatment as article.html). That means no
 * individual product content was ever crawlable or indexable — this script
 * fixes that the same way generate-articles.mjs already does for articles:
 * bake real, static, crawlable HTML per product family, with proper
 * meta tags, hreflang, and JSON-LD, then link out to the live interactive
 * picker (product-detail.html) for actually configuring/ordering.
 *
 * Run after product data changes:
 *   npm run generate:products
 *
 * Generates per (category, brand) family:
 *   /products/{category}-{brandSlug}.html       English (default, indexed)
 *   /products/{category}-{brandSlug}-ar.html    Arabic
 *   /products/{category}-{brandSlug}-es.html    Spanish
 *   /products/{category}-{brandSlug}-zh.html    Chinese
 *
 * Also updates sitemap.xml (PRODUCTS marker block, alongside the
 * PROJECTS block already owned by generate-projects.mjs).
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { upsertMarkerBlock } from "./sitemap-utils.mjs";

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

const LANGS = {
  en: { label: "English",  dir: "ltr", hreflang: "en", suffix: ""     },
  ar: { label: "العربية",  dir: "rtl", hreflang: "ar", suffix: "-ar"  },
  es: { label: "Español",  dir: "ltr", hreflang: "es", suffix: "-es"  },
  zh: { label: "中文",      dir: "ltr", hreflang: "zh", suffix: "-zh"  },
};

// Clean (no-emoji) category labels for SEO titles/headings — the emoji
// versions in products.html's own translations dict are fine for UI chips
// but look spammy in a <title> tag.
const CAT_LABEL = {
  inverters:     { en: "Inverters",            ar: "إنفرترات",           es: "Inversores",              zh: "逆变器" },
  offgrid:       { en: "Off-Grid Inverters",    ar: "إنفرترات أوف-جريد",  es: "Inversores Off-Grid",     zh: "离网逆变器" },
  panels:        { en: "Solar Panels",          ar: "ألواح شمسية",        es: "Paneles Solares",         zh: "太阳能板" },
  structures:    { en: "Mounting Structures",   ar: "هياكل تثبيت",        es: "Estructuras de Montaje",  zh: "支架结构" },
  cables:        { en: "Solar Cables",          ar: "كابلات",             es: "Cables Solares",          zh: "电缆" },
  combiners:     { en: "Combiner Boxes",        ar: "صناديق تجميع",       es: "Cajas Combinadoras",      zh: "汇流箱" },
  accessories:   { en: "Accessories",           ar: "إكسسوارات",          es: "Accesorios",              zh: "配件" },
  batteries:     { en: "Batteries",             ar: "بطاريات",            es: "Baterías",                zh: "电池" },
  well_motors:   { en: "Well Motors",           ar: "موتورات آبار",       es: "Motores de Pozo",         zh: "井用电机" },
  pumps:         { en: "Pumps",                 ar: "طلمبات ومضخات",      es: "Bombas",                  zh: "水泵" },
  pipes:         { en: "HDPE Pipes",            ar: "مواسير",             es: "Tuberías",                zh: "HDPE管道" },
  street_lights: { en: "Solar Street Lights",   ar: "إنارة شوارع شمسية",  es: "Farolas Solares",         zh: "太阳能路灯" },
  flood_lights:  { en: "Solar Flood Lights",    ar: "كشافات شمسية",       es: "Focos Solares",           zh: "太阳能投光灯" },
  garden_lights: { en: "Solar Garden Lights",   ar: "إنارة حدائق شمسية",  es: "Luces Solares de Jardín", zh: "太阳能庭院灯" },
  solar_kits:    { en: "Solar Kits",            ar: "طقم طاقة شمسية",     es: "Kits Solares",            zh: "太阳能套件" },
  solar_safety:  { en: "Solar Safety Equipment",ar: "معدات أمان شمسية",   es: "Equipo de Seguridad Solar", zh: "太阳能安全设备" },
};

const INTRO_TEXT = {
  en: (n) => `${n} model${n === 1 ? "" : "s"} available. All prices in Egyptian Pounds (EGP) and subject to change — contact us for the latest quote.`,
  ar: (n) => `${n} موديل متاح. جميع الأسعار بالجنيه المصري وقابلة للتغيير — تواصل معنا لآخر تحديث للسعر.`,
  es: (n) => `${n} modelo${n === 1 ? "" : "s"} disponible${n === 1 ? "" : "s"}. Todos los precios en libras egipcias (EGP) y sujetos a cambios — contáctenos para la última cotización.`,
  zh: (n) => `现有 ${n} 款型号。所有价格均以埃及镑（EGP）计价，可能变动——请联系我们获取最新报价。`,
};

const UI_TEXT = {
  en: { kicker: "Product Catalog", specsCol: "Specifications", priceCol: "Price", nameCol: "Model", cta: "View & Configure This Product", inStock: "In Stock", outOfStock: "Contact Us", related: "Other brands in this category", backToAll: "View all products" },
  ar: { kicker: "كتالوج المنتجات", specsCol: "المواصفات", priceCol: "السعر", nameCol: "الموديل", cta: "اعرض واختار مواصفات المنتج", inStock: "متاح", outOfStock: "تواصل معنا", related: "ماركات أخرى في نفس الفئة", backToAll: "عرض كل المنتجات" },
  es: { kicker: "Catálogo de Productos", specsCol: "Especificaciones", priceCol: "Precio", nameCol: "Modelo", cta: "Ver y Configurar Este Producto", inStock: "Disponible", outOfStock: "Contáctenos", related: "Otras marcas en esta categoría", backToAll: "Ver todos los productos" },
  zh: { kicker: "产品目录", specsCol: "规格", priceCol: "价格", nameCol: "型号", cta: "查看并选择配置", inStock: "现货", outOfStock: "联系我们", related: "同类别的其他品牌", backToAll: "查看所有产品" },
};

// ── Helpers ──────────────────────────────────────────────────────────────
function esc(str = "") {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function slugify(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "brand";
}

function getField(row, field, lang) {
  return row[`${field}_${lang}`] || row[`${field}_ar`] || row[`${field}_en`] || row[field] || "";
}

function fmtPrice(n) {
  return Number(n).toLocaleString("en-US");
}

// ── Shared layout blocks (same as generate-articles.mjs) ───────────────────
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

function nav(lang) {
  const t = NAV_I18N[lang] || NAV_I18N.en;
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

// ── Build one family page for one language ──────────────────────────────
function buildFamilyPage(category, brand, rows, lang, allFamilies) {
  const { dir, hreflang, suffix } = LANGS[lang];
  const slug = `${category}-${slugify(brand)}`;
  const catLabel = (CAT_LABEL[category] && CAT_LABEL[category][lang]) || category;
  const title = `${catLabel} ${brand}`;
  const ui = UI_TEXT[lang] || UI_TEXT.en;

  const sorted = rows.slice().sort((a, b) => Number(a.price) - Number(b.price));
  const prices = sorted.map((r) => Number(r.price)).filter((n) => !Number.isNaN(n));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = minPrice === maxPrice ? `${fmtPrice(minPrice)} EGP` : `${fmtPrice(minPrice)}–${fmtPrice(maxPrice)} EGP`;

  const description = `${title} — ${INTRO_TEXT[lang] ? INTRO_TEXT[lang](rows.length) : INTRO_TEXT.en(rows.length)} ${priceRange}.`;

  const pageUrl = `${SITE_URL}/products/${slug}${suffix}.html`;
  const detailHref = (row) => {
    const multiModelCat = ["inverters", "offgrid", "pumps", "well_motors"].includes(category);
    const model = multiModelCat ? "" : (row.model_available || "");
    return `${SITE_URL}/product-detail.html?cat=${encodeURIComponent(category)}&brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`;
  };
  const familyDetailHref = detailHref(sorted[0]);

  const hreflangLinks = Object.entries(LANGS)
    .map(([, { suffix: s, hreflang: h }]) => `  <link rel="alternate" hreflang="${h}" href="${SITE_URL}/products/${slug}${s}.html">`)
    .join("\n");

  const langLinks = Object.entries(LANGS)
    .map(([l, { label, suffix: s }]) => {
      const active = l === lang ? ' aria-current="true"' : "";
      return `<a href="${slug}${s}.html"${active}>${label}</a>`;
    })
    .join(" | ");

  // Real, crawlable table of every variant — name, specs, price. This is
  // the actual indexable content search engines and AI crawlers read.
  const rowsHtml = sorted.map((r) => {
    const name = esc(getField(r, "name", lang) || `${catLabel} ${brand}`);
    const specs = esc(getField(r, "specs", lang));
    const price = `${fmtPrice(r.price)} EGP`;
    const stock = r.in_stock === false ? ui.outOfStock : ui.inStock;
    return `        <tr>
          <td>${name}</td>
          <td>${specs}</td>
          <td>${price}</td>
          <td>${esc(stock)}</td>
        </tr>`;
  }).join("\n");

  // Cross-links to sibling brands within the same category — real <a>
  // tags for crawlability/internal linking, not JS-rendered.
  const siblings = allFamilies.filter((f) => f.category === category && f.brand !== brand);
  const relatedHtml = siblings.length
    ? `
    <section class="section">
      <h2>${esc(ui.related)}</h2>
      <ul class="pd-related-list">
${siblings.map((f) => `        <li><a href="${category}-${slugify(f.brand)}${suffix}.html">${esc(f.brand)} ${esc(catLabel)}</a></li>`).join("\n")}
      </ul>
    </section>`
    : "";

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    description,
    itemListElement: sorted.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: getField(r, "name", lang) || `${catLabel} ${brand}`,
        brand: { "@type": "Brand", name: brand },
        description: getField(r, "specs", lang) || undefined,
        offers: {
          "@type": "Offer",
          price: String(r.price),
          priceCurrency: "EGP",
          availability: r.in_stock === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          url: detailHref(r),
        },
      },
    })),
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
  <title>${esc(title)} — ${esc(priceRange)} | Al Asl Solar</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="${esc(title)} | Al Asl Solar">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${SITE_URL}/solar.jpg">
  <link rel="canonical" href="${pageUrl}">
${hreflangLinks}
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    .pd-static-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    .pd-static-table th, .pd-static-table td { padding: 10px 12px; border-bottom: 1px solid var(--line, #e5e2dd); text-align: start; font-size: 0.92rem; }
    .pd-static-table th { font-weight: 700; background: var(--bg-alt, #f7f5f2); }
    .pd-related-list { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; }
    .pd-related-list a { display: inline-block; padding: 6px 14px; border: 1px solid var(--line, #e5e2dd); border-radius: 999px; text-decoration: none; color: inherit; font-size: 0.88rem; }
    .pd-cta-btn { display: inline-flex; align-items: center; gap: 8px; margin-top: 1.25rem; padding: 12px 24px; background: var(--brand, #b5842a); color: #fff; border-radius: 8px; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
${nav(lang)}

  <main id="main">
    <section class="page-hero">
      <p class="eyebrow">${esc(ui.kicker)}</p>
      <h1>${esc(title)}</h1>
      <p>${esc(description)}</p>
      <p style="margin-top:0.5rem;font-size:0.9rem;opacity:0.75;">${langLinks}</p>
      <a class="pd-cta-btn" href="${familyDetailHref}">${esc(ui.cta)} <i class="fa fa-arrow-${dir === 'rtl' ? 'left' : 'right'}" aria-hidden="true"></i></a>
    </section>

    <section class="section">
      <table class="pd-static-table">
        <thead>
          <tr><th>${esc(ui.nameCol)}</th><th>${esc(ui.specsCol)}</th><th>${esc(ui.priceCol)}</th><th></th></tr>
        </thead>
        <tbody>
${rowsHtml}
        </tbody>
      </table>
      <p style="margin-top:1rem;"><a href="../products.html">${esc(ui.backToAll)}</a></p>
    </section>
${relatedHtml}
  </main>
${footer()}
</body>
</html>`;
}

// ── Update sitemap.xml (PRODUCTS marker block) ──────────────────────────
function buildProductsSitemapBlock(families) {
  const today = new Date().toISOString().split("T")[0];
  return families.map(({ category, brand }) => {
    const slug = `${category}-${slugify(brand)}`;
    const hreflangs = Object.entries(LANGS)
      .map(([, { hreflang, suffix }]) => `      <xhtml:link rel="alternate" hreflang="${hreflang}" href="${SITE_URL}/products/${slug}${suffix}.html"/>`)
      .join("\n");
    return `  <url>
    <loc>${SITE_URL}/products/${slug}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
${hreflangs}
  </url>`;
  }).join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔄  Connecting to Supabase…");
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: products, error } = await client.from("products").select("*");
  if (error) {
    console.error("❌  Supabase error:", error.message);
    process.exit(1);
  }
  console.log(`✅  Fetched ${products.length} product(s).`);

  // Group into (category, brand) families
  const groups = new Map();
  for (const p of products) {
    if (!p.category || !p.brand) continue;
    const key = `${p.category}::${p.brand}`;
    if (!groups.has(key)) groups.set(key, { category: p.category, brand: p.brand, rows: [] });
    groups.get(key).rows.push(p);
  }
  const families = [...groups.values()].sort((a, b) => a.category.localeCompare(b.category) || a.brand.localeCompare(b.brand));
  console.log(`✅  Grouped into ${families.length} product families.`);

  const productsDir = path.join(__dir, "products");
  if (!fs.existsSync(productsDir)) fs.mkdirSync(productsDir);

  for (const family of families) {
    for (const lang of Object.keys(LANGS)) {
      const { suffix } = LANGS[lang];
      const html = buildFamilyPage(family.category, family.brand, family.rows, lang, families);
      const filename = `${family.category}-${slugify(family.brand)}${suffix}.html`;
      fs.writeFileSync(path.join(productsDir, filename), html, "utf8");
    }
  }
  console.log(`   📄  products/  (${families.length * 4} files written)`);

  const sitemapPath = path.join(__dir, "sitemap.xml");
  const previousSitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, "utf8") : "";
  const block = buildProductsSitemapBlock(families);
  const sitemapXml = upsertMarkerBlock(previousSitemap, "PRODUCTS", block);
  fs.writeFileSync(sitemapPath, sitemapXml, "utf8");
  console.log("   🗺️   sitemap.xml  (PRODUCTS block updated)");

  console.log(`\n✨  Done! Generated ${families.length * 4} product family pages (EN + AR + ES + ZH).`);
  console.log("    Upload to GitHub: products/  sitemap.xml");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
