-- Self-service display-name change for ANY active staff member (not only reps).
-- Keeps the two name columns in step: staff_profiles.display_name (shell/user menu) and reps.display_name (printed on quotes), when a reps row exists.
-- Runs as owner but only ever touches the caller's own rows (auth.uid()). Roles, permissions, active flag, username are never touched.
-- Rollback: supabase/rollbacks/20261027083600_staff_update_my_profile.rollback.sql
create or replace function public.update_my_profile(p_display_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'display name must be 2-80 characters' using errcode = '22023';
  end if;

  update public.staff_profiles set display_name = v_name where id = v_uid and active;
  if not found then raise exception 'not an active staff member' using errcode = '42501'; end if;

  update public.reps set display_name = v_name where id = v_uid;   -- no-op when the user is not a rep

  insert into public.audit_log(actor_id, action, table_name, record_key, new_data)
  values (v_uid, 'update_my_profile', 'staff_profiles', v_uid::text, jsonb_build_object('display_name', v_name));
end;
$$;

revoke execute on function public.update_my_profile(text) from public, anon, authenticated;
grant execute on function public.update_my_profile(text) to authenticated;
