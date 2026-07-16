window.ALASL_SUPABASE_URL = "https://nymkmrdbicfuniobunth.supabase.co";
window.ALASL_SUPABASE_ANON_KEY = "sb_publishable_vrHvQTuZT4kbzFP6hoIf0w_5FMFFk2e";
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
