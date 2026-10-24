-- Stage 8b hardening (approved by owner 2026-10-24).
-- Rollback: supabase/rollbacks/20261024231645_security_hardening_stage8b.rollback.sql
-- 1) Defence in depth: Supabase grants anon/authenticated broad table privileges by default and the only guard was RLS.
--    Make anon READ-ONLY at the privilege level (public writes go through SECURITY DEFINER RPCs such as submit_cart_quote_request,
--    which run as the function owner and are unaffected). authenticated keeps INSERT/UPDATE/DELETE (still RLS-gated) but loses
--    TRUNCATE/REFERENCES/TRIGGER, which RLS does not cover and no page uses.
do $mig$
declare r record;
begin
  for r in
    select c.oid::regclass as rel
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on %s from anon', r.rel);
    execute format('revoke truncate, references, trigger on %s from authenticated', r.rel);
  end loop;
end
$mig$;

-- same rule for objects created later by the migration role (new tables would otherwise re-open the hole)
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
do $mig$
begin
  begin
    alter default privileges for role supabase_admin in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
    alter default privileges for role supabase_admin in schema public revoke truncate, references, trigger on tables from authenticated;
  exception when others then
    raise notice 'supabase_admin default privileges not changed: %', sqlerrm;
  end;
end
$mig$;

-- 2) reps protection trigger: allow holders of reps.manage (superadmin) and not only legacy admin_users.
--    Without this, activating/deactivating a rep or changing can_access_* by a superadmin who is not in admin_users was silently reverted.
do $mig$
declare
  v_def text := pg_get_functiondef('public.reps_protect_sensitive_columns()'::regprocedure);
  v_old constant text := 'IF NOT is_admin() THEN';
begin
  if position('reps.manage' in v_def) > 0 then return; end if;  -- already patched
  if (length(v_def) - length(replace(v_def, v_old, ''))) <> length(v_old) then
    raise exception 'unexpected trigger function layout, aborting';
  end if;
  execute replace(v_def, v_old, 'IF NOT (is_admin() OR public.has_permission(''reps.manage'')) THEN');
end
$mig$;

-- 3) RLS/CRM look up customers by assigned rep constantly; the FK had no index
create index if not exists customers_assigned_rep_id_idx on public.customers(assigned_rep_id);
