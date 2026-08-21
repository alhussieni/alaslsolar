/**
 * Shared shopping cart state, backed by localStorage so it persists
 * across page navigation. Only stores { id, qty } pairs — cart.html
 * fetches live product data (name/price/image) every time it renders,
 * so prices are always current and the server (customer_submit_cart_quote)
 * re-verifies them anyway at checkout, never trusting client state.
 *
 * Loaded (non-module, plain script) on products.html, product-detail.html,
 * and cart.html.
 */
window.AlaslCart = (function () {
  const KEY = 'alasl-cart-v1';

  function getItems() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function setItems(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch (e) {
      // Storage unavailable (private browsing, quota, etc.) — fail silently.
    }
    updateBadges();
  }

  function addItem(id, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    const items = getItems();
    const existing = items.find((x) => x.id === id);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({ id, qty });
    }
    setItems(items);
  }

  function updateQty(id, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    const items = getItems();
    const existing = items.find((x) => x.id === id);
    if (existing) {
      existing.qty = qty;
      setItems(items);
    }
  }

  function removeItem(id) {
    setItems(getItems().filter((x) => x.id !== id));
  }

  function clear() {
    setItems([]);
  }

  function count() {
    return getItems().reduce((sum, x) => sum + x.qty, 0);
  }

  // Updates every [data-cart-badge] count and shows/hides the nearest
  // [data-cart-bar] wrapper based on whether the cart is empty.
  function updateBadges() {
    const n = count();
    document.querySelectorAll('[data-cart-bar]').forEach((bar) => {
      bar.hidden = n === 0;
      const badge = bar.querySelector('[data-cart-badge]');
      if (badge) badge.textContent = String(n);
    });
  }

  document.addEventListener('DOMContentLoaded', updateBadges);

  return { KEY, getItems, addItem, updateQty, removeItem, clear, count, updateBadges };
})();
