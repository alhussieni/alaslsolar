-- Restores the pre-8b privileges. Tested inside a rolled-back transaction: anon write grants return to exactly 204.
-- The excluded tables were closed on purpose by EARLIER migrations (RBAC/CRM tables and the pump view) and must stay closed.
do $r$
declare r record;
begin
  for r in
    select c.oid::regclass as rel from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
      and c.relname not in ('staff_profiles','roles','permissions','role_permissions','user_roles','user_permissions','audit_log',
                            'customer_activities','follow_ups','pump_calculator_products')
  loop
    execute format('grant insert, update, delete, truncate, references, trigger on %s to anon', r.rel);
    execute format('grant truncate, references, trigger on %s to authenticated', r.rel);
  end loop;
end $r$;
alter default privileges for role postgres in schema public grant insert, update, delete, truncate, references, trigger on tables to anon;
alter default privileges for role postgres in schema public grant truncate, references, trigger on tables to authenticated;
do $r$
declare v_def text := pg_get_functiondef('public.reps_protect_sensitive_columns()'::regprocedure);
begin
  execute replace(v_def, 'IF NOT (is_admin() OR public.has_permission(''reps.manage'')) THEN', 'IF NOT is_admin() THEN');
end $r$;
drop index if exists public.customers_assigned_rep_id_idx;
delete from supabase_migrations.schema_migrations where name = 'security_hardening_stage8b';
