-- Stage 7 (part): enforce reps.can_access_offgrid / can_access_products on the SERVER (they were UI-only).
-- Mechanical, reviewable change: only the guard condition of two functions is extended; everything else in their bodies is untouched.
--   rep_create_offgrid_quote -> requires offgrid flag ; rep_create_quote -> requires products flag.
-- Admins (legacy admin_users) and superadmins bypass the flags. can_access_crm stays a UI-level toggle (no RPC corresponds to it).
-- Rollback: supabase/rollbacks/20261018220007_rbac_enforce_rep_flags_server_side.rollback.sql

create or replace function public.rbac_rep_flag(p_flag text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin()
      or public.has_role('superadmin')
      or coalesce((
           select case p_flag
                    when 'offgrid'  then r.can_access_offgrid
                    when 'products' then r.can_access_products
                    when 'crm'      then r.can_access_crm
                  end
           from public.reps r
           where r.id = (select auth.uid()) and r.active
         ), false);
$$;
revoke execute on function public.rbac_rep_flag(text) from public, anon;
grant execute on function public.rbac_rep_flag(text) to authenticated;

do $mig$
declare
  r record;
  v_def text;
  v_old constant text := 'if not (is_rep() or is_admin()) then';
begin
  for r in
    select * from (values
      ('public.rep_create_offgrid_quote(text,text,text,text,jsonb,text)'::regprocedure, 'offgrid'),
      ('public.rep_create_quote(text,text,text,text,jsonb,numeric,text)'::regprocedure,  'products')
    ) as v(fn, flag)
  loop
    v_def := pg_get_functiondef(r.fn);
    if position('rbac_rep_flag' in v_def) > 0 then continue; end if;  -- already patched
    if (length(v_def) - length(replace(v_def, v_old, ''))) <> length(v_old) then
      raise exception 'unexpected guard layout in %, aborting', r.fn;
    end if;
    execute replace(v_def, v_old, format('if not (is_rep() or is_admin()) or not public.rbac_rep_flag(%L) then', r.flag));
  end loop;
end
$mig$;
