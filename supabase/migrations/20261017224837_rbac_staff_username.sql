-- Adds optional username to staff_profiles so staff can log in with a username (mapped to <username>@staff.alaslsolar.com).
-- Existing users keep logging in with their real email (username stays NULL).
-- Rollback: supabase/rollbacks/20261017224816_rbac_foundation_schema.rollback.sql (drops the whole table).
alter table public.staff_profiles
  add column if not exists username text;

alter table public.staff_profiles
  drop constraint if exists staff_profiles_username_format;
alter table public.staff_profiles
  add constraint staff_profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');

create unique index if not exists staff_profiles_username_uidx
  on public.staff_profiles(username) where username is not null;
