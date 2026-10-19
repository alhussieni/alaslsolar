-- Stage 8a security hardening (found while reviewing advisors).
-- 1) CRITICAL: public.pump_calculator_products is a SECURITY DEFINER (owner = postgres) auto-updatable view with default grants,
--    so the anon key could UPDATE/DELETE rows of public.products through it, bypassing RLS (verified: anon UPDATE via view affected 1 row,
--    while a direct UPDATE on products affected 0). Fix: read-only grants + run with the caller's permissions.
-- Rollback: supabase/rollbacks/20261018220338_security_hardening_stage8a.rollback.sql
revoke insert, update, delete, truncate, references, trigger on public.pump_calculator_products from anon, authenticated, public;
alter view public.pump_calculator_products set (security_invoker = true);

-- 2) Rep-only RPCs were executable by anon (they reject non-reps inside, but there is no reason to expose them).
--    NOT touched: is_admin()/is_rep() — RLS policies evaluated for anon call them, revoking would break public reads.
do $mig$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('rep_clear_quote_draft','rep_create_irrigation_quote','rep_create_irrigation_solar_quote','rep_create_offgrid_quote',
                        'rep_create_quote','rep_upsert_quote_draft','preview_irrigation_solar_quote','_irrigation_solar_calc')
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end
$mig$;

-- trigger-only function: nobody needs to call it directly
revoke execute on function public.reps_protect_sensitive_columns() from public, anon, authenticated;

-- 3) pin search_path on the two flagged trigger functions (they reference public objects unqualified)
alter function public.reps_protect_sensitive_columns() set search_path = public;
alter function public.enforce_max_calc_featured_panels() set search_path = public;
