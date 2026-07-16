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
