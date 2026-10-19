-- Reverts function grants / view option / search_path.
-- DELIBERATELY does NOT restore INSERT/UPDATE/DELETE grants on pump_calculator_products for anon/authenticated: that was the vulnerability.
alter view public.pump_calculator_products set (security_invoker = false);
do $r$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('rep_clear_quote_draft','rep_create_irrigation_quote','rep_create_irrigation_solar_quote','rep_create_offgrid_quote',
                        'rep_create_quote','rep_upsert_quote_draft','preview_irrigation_solar_quote','_irrigation_solar_calc')
  loop
    execute format('grant execute on function %s to anon', f);
  end loop;
end $r$;
grant execute on function public.reps_protect_sensitive_columns() to anon, authenticated;
alter function public.reps_protect_sensitive_columns() reset search_path;
alter function public.enforce_max_calc_featured_panels() reset search_path;
delete from supabase_migrations.schema_migrations where name = 'security_hardening_stage8a';
