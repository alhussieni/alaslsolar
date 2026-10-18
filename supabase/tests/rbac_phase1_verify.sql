-- Read-only checks to run AFTER applying both migrations (staging first).
-- 1) Counts: expect roles=4, permissions=19, staff_profiles=2, user_roles=4 (superadmin+sales_rep, admin+sales_rep)
select (select count(*) from public.roles) roles,
       (select count(*) from public.permissions) permissions,
       (select count(*) from public.staff_profiles) staff,
       (select count(*) from public.user_roles) user_roles;

-- 2) Same person who was admin must be superadmin and active
select sp.email, array_agg(ur.role_key order by ur.role_key) roles, sp.active
from public.staff_profiles sp join public.user_roles ur on ur.user_id = sp.id
group by sp.email, sp.active;

-- 3) anon must see nothing (expect permission denied or 0 rows for each)
begin; set local role anon;
  select count(*) from public.user_roles;
rollback;

-- 4) Rep must NOT be able to grant roles. Replace <REP_UUID> with a real rep id.
-- begin; set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<REP_UUID>","role":"authenticated"}',true);
--   insert into public.user_roles(user_id, role_key) values ('<REP_UUID>','superadmin'); -- must FAIL
-- rollback;

-- 5) Last-superadmin guard (expect an exception). Replace <SUPER_UUID>.
-- begin; delete from public.user_roles where user_id='<SUPER_UUID>' and role_key='superadmin'; rollback;
