-- Per-user EXTRA permissions on top of roles, granted ONLY by a superadmin.
-- Use case (owner decision 2026-10-19): an Admin may enter /QL and issue quotes only when the superadmin explicitly opens it for that user.
-- has_permission()/my_permissions() now also read this table. Role-based behaviour is unchanged.
-- Rollback: supabase/rollbacks/20261019042659_rbac_user_permission_grants.rollback.sql

create table if not exists public.user_permissions (
  user_id        uuid not null references public.staff_profiles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  granted_by     uuid references auth.users(id) on delete set null,
  granted_at     timestamptz not null default now(),
  primary key (user_id, permission_key)
);
create index if not exists user_permissions_perm_idx on public.user_permissions(permission_key);

alter table public.user_permissions enable row level security;

drop policy if exists user_permissions_select on public.user_permissions;
create policy user_permissions_select on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('staff.manage')));
-- writes: superadmin ROLE only (checked by role, never by a grantable permission -> no privilege escalation)
drop policy if exists user_permissions_insert on public.user_permissions;
create policy user_permissions_insert on public.user_permissions for insert to authenticated
  with check ((select public.has_role('superadmin')));
drop policy if exists user_permissions_update on public.user_permissions;
create policy user_permissions_update on public.user_permissions for update to authenticated
  using ((select public.has_role('superadmin'))) with check ((select public.has_role('superadmin')));
drop policy if exists user_permissions_delete on public.user_permissions;
create policy user_permissions_delete on public.user_permissions for delete to authenticated
  using ((select public.has_role('superadmin')));

revoke all on public.user_permissions from anon, authenticated;
grant select, insert, update, delete on public.user_permissions to authenticated;

create or replace function public.rbac_audit_user_permissions()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log(actor_id, action, table_name, record_key, old_data, new_data)
  values (
    (select auth.uid()), tg_op, tg_table_name,
    case when tg_op = 'DELETE' then old.user_id::text || ':' || old.permission_key
         else new.user_id::text || ':' || new.permission_key end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function public.rbac_audit_user_permissions() from public, anon, authenticated;

drop trigger if exists user_permissions_audit on public.user_permissions;
create trigger user_permissions_audit after insert or update or delete on public.user_permissions
  for each row execute function public.rbac_audit_user_permissions();

create or replace function public.has_permission(p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.active
      and (
        exists (
          select 1 from public.user_roles ur
          where ur.user_id = sp.id
            and (
              ur.role_key = 'superadmin'
              or exists (select 1 from public.role_permissions rp
                         where rp.role_key = ur.role_key and rp.permission_key = p_key)
            )
        )
        or exists (select 1 from public.user_permissions up
                   where up.user_id = sp.id and up.permission_key = p_key)
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
    union
    select up.permission_key
    from public.user_permissions up
    join public.staff_profiles sp on sp.id = up.user_id and sp.active
    where up.user_id = (select auth.uid())
  ) s;
$$;
