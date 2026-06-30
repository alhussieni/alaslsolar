/**
 * article-lang-switcher.js
 * Included only in static article pages (/articles/{slug}*.html)
 * Redirects the user to the correct language variant when they
 * click a language button, instead of just changing UI strings.
 */
(function () {
  // Map lang code → file suffix
  const SUFFIX = { en: "", ar: "-ar", es: "-es", zh: "-zh" };

  // Extract the base slug from the current filename
  // e.g. "my-article-ar.html" → "my-article"
  //      "my-article.html"    → "my-article"
  function getBaseSlug() {
    const filename = window.location.pathname.split("/").pop() || "";
    return filename
      .replace(/\.html$/, "")
      .replace(/-(ar|es|zh)$/, "");
  }

  // Run after app.js has attached its own listeners so we can override
  document.addEventListener("DOMContentLoaded", function () {
    const baseSlug = getBaseSlug();

    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const lang   = btn.dataset.lang;
        const suffix = SUFFIX[lang] ?? "";
        const target = baseSlug + suffix + ".html";

        // Only redirect if we'd land on a different file
        const current = window.location.pathname.split("/").pop();
        if (target !== current) {
          window.location.href = target;
        }
      });
    });
  });
})();
