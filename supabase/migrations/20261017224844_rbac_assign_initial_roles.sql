-- Initial role assignment requested by the owner (2026-10-18). Data only, idempotent, looked up by email (no hardcoded ids).
-- alhussieni95@gmail.com          -> superadmin (also covered by the admin_users backfill)
-- youssef.alhussieni004@gmail.com -> admin (keeps his existing sales_rep role; remove it from the staff page if not wanted)
insert into public.user_roles(user_id, role_key)
select u.id, 'superadmin' from auth.users u where lower(u.email) = 'alhussieni95@gmail.com'
on conflict do nothing;

insert into public.user_roles(user_id, role_key)
select u.id, 'admin' from auth.users u where lower(u.email) = 'youssef.alhussieni004@gmail.com'
on conflict do nothing;
