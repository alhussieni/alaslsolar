/**
 * project-lang-switcher.js
 * Included only in static project pages (/projects/{slug}*.html).
 *
 * Project pages use Arabic as the base file ({slug}.html) and -en/-es/-zh for the
 * other languages. Instead of guessing file names from the slug (which broke when
 * the English file is "-en"), this reads the page's own <link rel="alternate"
 * hreflang="..."> tags emitted by generate-projects.mjs and navigates to them.
 * (article-lang-switcher.js is for articles only: English is their base file.)
 */
(function () {
  function alternateFile(lang) {
    var link = document.querySelector('link[rel="alternate"][hreflang="' + lang + '"]');
    if (!link) return null;
    try {
      // pathname keeps the percent-encoding, so Arabic slugs work as relative URLs
      return new URL(link.href, window.location.href).pathname.split("/").pop() || null;
    } catch (e) {
      return null;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = alternateFile(btn.dataset.lang);
        var current = window.location.pathname.split("/").pop();
        if (target && target !== current) {
          window.location.href = target;
        }
      });
    });
  });
})();
