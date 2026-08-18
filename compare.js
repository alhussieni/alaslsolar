/**
 * Shared "compare products" state, backed by localStorage so it persists
 * across page navigation. Enforces the site's comparison rule: up to 3
 * products, all from the same category (comparing an inverter against a
 * well motor doesn't make sense).
 *
 * Loaded (non-module, plain script) on products.html, product-detail.html,
 * and compare.html.
 */
window.AlaslCompare = (function () {
  const KEY = 'alasl-compare-v1';
  const MAX_ITEMS = 3;

  function getList() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function setList(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      // Storage unavailable (private browsing, quota, etc.) — fail silently,
      // the compare feature just won't persist for this visitor.
    }
    updateBadges();
  }

  // item: { id, category }
  // Returns { ok: true } or { ok: false, reason: 'category' | 'full' }
  function addItem(item) {
    const list = getList();
    if (list.some((x) => x.id === item.id)) return { ok: true, already: true };
    if (list.length > 0 && list[0].category !== item.category) {
      return { ok: false, reason: 'category' };
    }
    if (list.length >= MAX_ITEMS) {
      return { ok: false, reason: 'full' };
    }
    list.push({ id: item.id, category: item.category });
    setList(list);
    return { ok: true };
  }

  function removeItem(id) {
    setList(getList().filter((x) => x.id !== id));
  }

  function clear() {
    setList([]);
  }

  function has(id) {
    return getList().some((x) => x.id === id);
  }

  // Updates every [data-compare-badge] count and shows/hides the nearest
  // [data-compare-bar] ancestor-or-self wrapper based on whether the list
  // is empty. Called automatically whenever the list changes, and also
  // exposed so pages can call it once on load.
  function updateBadges() {
    const list = getList();
    document.querySelectorAll('[data-compare-bar]').forEach((bar) => {
      bar.hidden = list.length === 0;
      const badge = bar.querySelector('[data-compare-badge]');
      if (badge) badge.textContent = String(list.length);
    });
  }

  document.addEventListener('DOMContentLoaded', updateBadges);

  return { KEY, MAX_ITEMS, getList, addItem, removeItem, clear, has, updateBadges };
})();
