-- Bridge: any NEW row in legacy public.reps (e.g. created by the invite-rep Edge Function) is mirrored into the RBAC tables,
-- so it shows up in the staff page. Only adds sales_rep when the user has no role yet (never overrides roles set by staff-admin).
-- Never blocks the legacy flow: on failure it logs a WARNING and lets the reps insert succeed.
-- Rollback: supabase/rollbacks/20261018110738_rbac_reps_insert_bridge.rollback.sql
create or replace function public.rbac_sync_new_rep()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.staff_profiles(id, email, display_name, active)
  values (new.id, lower(new.email), new.display_name, new.active)
  on conflict (id) do nothing;

  insert into public.user_roles(user_id, role_key)
  select new.id, 'sales_rep'
  where not exists (select 1 from public.user_roles ur where ur.user_id = new.id)
  on conflict do nothing;

  return new;
exception when others then
  raise warning 'rbac_sync_new_rep failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke execute on function public.rbac_sync_new_rep() from public, anon, authenticated;

drop trigger if exists reps_rbac_bridge on public.reps;
create trigger reps_rbac_bridge after insert on public.reps
  for each row execute function public.rbac_sync_new_rep();
