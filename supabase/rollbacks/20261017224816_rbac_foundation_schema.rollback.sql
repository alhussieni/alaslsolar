-- Rollback for the 4 rbac_* migrations (20261017224816 .. 20261017224844) and the staff-admin function.
-- Only drops objects created by them. admin_users, reps, is_admin(), is_rep() and every pre-existing policy are untouched.
-- Run ONLY while no policy uses has_permission()/has_role().
-- Also delete the Edge Function: `supabase functions delete staff-admin` (or dashboard > Edge Functions).
-- Staff accounts created through the staff page live in auth.users and public.reps; they are NOT removed here.
begin;
drop table if exists public.audit_log        cascade;
drop table if exists public.user_roles       cascade;
drop table if exists public.role_permissions cascade;
drop table if exists public.permissions      cascade;
drop table if exists public.roles            cascade;
drop table if exists public.staff_profiles   cascade;
drop function if exists public.has_permission(text);
drop function if exists public.has_role(text);
drop function if exists public.my_permissions();
drop function if exists public.rbac_touch_updated_at();
drop function if exists public.rbac_audit_user_roles();
drop function if exists public.rbac_guard_last_superadmin();
delete from supabase_migrations.schema_migrations where name like 'rbac\_%';
commit;
