-- Restores the role-only versions of has_permission()/my_permissions() and drops the grants table (extras are lost).
create or replace function public.has_permission(p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.staff_profiles sp on sp.id = ur.user_id and sp.active
    where ur.user_id = (select auth.uid())
      and (
        ur.role_key = 'superadmin'
        or exists (select 1 from public.role_permissions rp
                   where rp.role_key = ur.role_key and rp.permission_key = p_key)
      )
  );
$$;
create or replace function public.my_permissions()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct k order by k), '{}'::text[])
  from (
    select p.key as k from public.permissions p
    where public.has_role('superadmin')
    union
    select rp.permission_key
    from public.user_roles ur
    join public.staff_profiles sp on sp.id = ur.user_id and sp.active
    join public.role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = (select auth.uid())
  ) s;
$$;
drop table if exists public.user_permissions;
drop function if exists public.rbac_audit_user_permissions();
delete from supabase_migrations.schema_migrations where name = 'rbac_user_permission_grants';
-- NOTE: staff-admin v3 (set_permissions / list_users extras) needs the table; redeploy the previous function version if you roll back.
