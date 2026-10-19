delete from public.role_permissions where permission_key = 'erp.access';
delete from public.permissions where key = 'erp.access';
delete from supabase_migrations.schema_migrations where name = 'rbac_reserve_erp_namespace';
