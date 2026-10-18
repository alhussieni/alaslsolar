-- =============================================================================
-- RBAC Phase 1 / 2 : schema only (additive, no existing object is touched)
-- Why   : replace the binary is_admin()/is_rep() model with roles + permissions
--         so CRM / ERP / QL / Admin can be gated per user.
-- Depends on: auth.users. Nothing existing depends on this yet.
-- Does NOT change: admin_users, reps, is_admin(), is_rep(), any existing policy.
-- Rollback: supabase/rollbacks/20261017224816_rbac_foundation_schema.rollback.sql
-- Data (roles, permissions, backfill) is in the following migration on purpose.
-- =============================================================================

-- ---------- tables ----------
create table if not exists public.staff_profiles (
  id           uuid primary key references auth.users(id) on delete restrict,
  email        text not null,
  display_name text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.roles (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name_ar     text not null,
  name_en     text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.permissions (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  module      text not null,
  description text
);

create table if not exists public.role_permissions (
  role_key       text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

create table if not exists public.user_roles (
  user_id    uuid not null references public.staff_profiles(id) on delete cascade,
  role_key   text not null references public.roles(key) on delete restrict,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);
create index if not exists user_roles_role_key_idx on public.user_roles(role_key);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,            -- null = system / migration
  action     text not null,
  table_name text not null,
  record_key text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

-- ---------- helper functions ----------
-- SECURITY DEFINER is required: they read RBAC tables whose RLS depends on them.
-- Hardened: empty search_path, fully-qualified names, no anon execute.

create or replace function public.has_role(p_role text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.staff_profiles sp on sp.id = ur.user_id and sp.active
    where ur.user_id = (select auth.uid())
      and ur.role_key = p_role
  );
$$;

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
        ur.role_key = 'superadmin'   -- superadmin bypass: also covers future permissions
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_key = ur.role_key and rp.permission_key = p_key
        )
      )
  );
$$;

-- For the portal UI: which modules/buttons to show. UI hiding is cosmetic only;
-- real enforcement stays in RLS.
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

-- ---------- triggers ----------
create or replace function public.rbac_touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.rbac_audit_user_roles()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log(actor_id, action, table_name, record_key, old_data, new_data)
  values (
    (select auth.uid()), tg_op, tg_table_name,
    case when tg_op = 'DELETE' then old.user_id::text || ':' || old.role_key
         else new.user_id::text || ':' || new.role_key end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Prevent locking everyone out: the last active superadmin cannot be removed,
-- demoted, or deactivated.
create or replace function public.rbac_guard_last_superadmin()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_is_removal boolean := false;
begin
  if tg_table_name = 'user_roles' then
    v_user := old.user_id;
    v_is_removal := old.role_key = 'superadmin'
                    and (tg_op = 'DELETE' or new.role_key <> 'superadmin' or new.user_id <> old.user_id);
  elsif tg_table_name = 'staff_profiles' then
    v_user := old.id;
    v_is_removal := (tg_op = 'DELETE' or (old.active and not new.active))
                    and exists (select 1 from public.user_roles ur
                                where ur.user_id = old.id and ur.role_key = 'superadmin');
  end if;

  if v_is_removal and not exists (
    select 1
    from public.user_roles ur
    join public.staff_profiles sp on sp.id = ur.user_id and sp.active
    where ur.role_key = 'superadmin' and ur.user_id <> v_user
  ) then
    raise exception 'Cannot remove, demote or deactivate the last active superadmin';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists staff_profiles_touch on public.staff_profiles;
create trigger staff_profiles_touch before update on public.staff_profiles
  for each row execute function public.rbac_touch_updated_at();

drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.rbac_audit_user_roles();

drop trigger if exists user_roles_guard on public.user_roles;
create trigger user_roles_guard before update or delete on public.user_roles
  for each row execute function public.rbac_guard_last_superadmin();

drop trigger if exists staff_profiles_guard on public.staff_profiles;
create trigger staff_profiles_guard before update or delete on public.staff_profiles
  for each row execute function public.rbac_guard_last_superadmin();

-- ---------- RLS ----------
alter table public.staff_profiles   enable row level security;
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles       enable row level security;
alter table public.audit_log        enable row level security;

-- Writes to anything RBAC = superadmin ONLY, checked by role (not by permission),
-- so granting a permission to another role can never become a privilege escalation.

drop policy if exists staff_profiles_select on public.staff_profiles;
create policy staff_profiles_select on public.staff_profiles for select to authenticated
  using (id = (select auth.uid())
         or (select public.has_permission('staff.manage'))
         or (select public.has_permission('reps.view')));
drop policy if exists staff_profiles_insert on public.staff_profiles;
create policy staff_profiles_insert on public.staff_profiles for insert to authenticated
  with check ((select public.has_role('superadmin')));
drop policy if exists staff_profiles_update on public.staff_profiles;
create policy staff_profiles_update on public.staff_profiles for update to authenticated
  using ((select public.has_role('superadmin'))) with check ((select public.has_role('superadmin')));
drop policy if exists staff_profiles_delete on public.staff_profiles;
create policy staff_profiles_delete on public.staff_profiles for delete to authenticated
  using ((select public.has_role('superadmin')));

drop policy if exists roles_superadmin_all on public.roles;
create policy roles_superadmin_all on public.roles for all to authenticated
  using ((select public.has_role('superadmin'))) with check ((select public.has_role('superadmin')));

drop policy if exists permissions_superadmin_all on public.permissions;
create policy permissions_superadmin_all on public.permissions for all to authenticated
  using ((select public.has_role('superadmin'))) with check ((select public.has_role('superadmin')));

drop policy if exists role_permissions_superadmin_all on public.role_permissions;
create policy role_permissions_superadmin_all on public.role_permissions for all to authenticated
  using ((select public.has_role('superadmin'))) with check ((select public.has_role('superadmin')));

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid())
         or (select public.has_permission('staff.manage'))
         or (select public.has_permission('reps.view')));
drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check ((select public.has_role('superadmin')));
drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles for update to authenticated
  using ((select public.has_role('superadmin'))) with check ((select public.has_role('superadmin')));
drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles for delete to authenticated
  using ((select public.has_role('superadmin')));

-- audit_log: read-only for clients. No insert/update/delete policy = closed on purpose;
-- rows are written only by SECURITY DEFINER triggers.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.has_permission('audit.read')));

-- ---------- privileges (Supabase grants broad defaults; tighten explicitly) ----------
revoke all on public.staff_profiles, public.roles, public.permissions,
              public.role_permissions, public.user_roles, public.audit_log
  from anon, authenticated;
grant select, insert, update, delete on public.staff_profiles, public.roles, public.permissions,
              public.role_permissions, public.user_roles to authenticated;
grant select on public.audit_log to authenticated;

revoke execute on function public.has_role(text), public.has_permission(text), public.my_permissions()
  from public, anon, authenticated;
grant execute on function public.has_role(text), public.has_permission(text), public.my_permissions()
  to authenticated;

revoke execute on function public.rbac_touch_updated_at(), public.rbac_audit_user_roles(),
                           public.rbac_guard_last_superadmin()
  from public, anon, authenticated;

