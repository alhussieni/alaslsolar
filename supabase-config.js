window.ALASL_SUPABASE_URL = "https://nymkmrdbicfuniobunth.supabase.co";
window.ALASL_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55bWttcmRiaWNmdW5pb2J1bnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NzY0MjIsImV4cCI6MjA5NTM1MjQyMn0.31gmIJjgJM6MO0vcZqON-463MjZSe_2kcXUPlxtI5dY";

function getAlaslSupabase() {
  if (!window.supabase) return null;
  if (!window.alaslSupabase) {
    window.alaslSupabase = window.supabase.createClient(
      window.ALASL_SUPABASE_URL,
      window.ALASL_SUPABASE_ANON_KEY
    );
  }
  return window.alaslSupabase;
}

/* ============================================================
   خصومات ترويجية — بتأثر على سعر العرض بس (products.html و
   product-detail.html)، وميّا بتلمس عمود products.price الأصلي
   في الداتابيز ولا أي حساب في QL/ (عروض أسعار المناديب).
   الجدول ده منفصل عن supplier_discounts عمدًا (راجع الملاحظة
   الأمنية في supabase-promotional-discounts.sql) — مسموح بقراءته
   بالـ anon key لأنه مفيهوش أي بيانات تكلفة/هامش ربح.
   ============================================================ */
async function getActivePromoMap(sb) {
  const map = {};
  try {
    const { data, error } = await sb
      .from('promotional_discounts')
      .select('category, brand, promo_discount_pct')
      .eq('is_active', true);
    if (error || !data) return map;
    data.forEach((r) => {
      map[`${r.category}|${r.brand}`] = Number(r.promo_discount_pct) || 0;
    });
  } catch (e) {
    console.error('getActivePromoMap error:', e);
  }
  return map;
}

// Returns a NEW array — never mutates the caller's rows or their .price.
// Adds .original_price (untouched) and overwrites .price with the
// discounted value when an active promo matches (category, brand).
// Products with no matching promo pass through unchanged.
function applyPromoPricing(rows, promoMap) {
  return (rows || []).map((r) => {
    const pct = promoMap[`${r.category}|${r.brand}`];
    if (!pct) return { ...r, original_price: r.price };
    const discounted = Math.round((Number(r.price) * (1 - pct / 100)) * 100) / 100;
    return { ...r, original_price: r.price, price: discounted, promo_pct: pct };
  });
}
