-- Reserves the ERP permission namespace. No tables, no role grants: only superadmin (bypass) holds erp.access until an ERP role is designed.
-- Rollback: supabase/rollbacks/20261019042423_rbac_reserve_erp_namespace.rollback.sql
insert into public.permissions(key, module, description) values
  ('erp.access', 'erp', 'Open the ERP module (reserved - module not built yet)')
on conflict (key) do update set module = excluded.module, description = excluded.description;
