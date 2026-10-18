delete from public.role_permissions where permission_key in ('dashboard.access','content.manage','pricing.manage','leads.manage','reps.manage');
delete from public.permissions where key in ('dashboard.access','content.manage','pricing.manage','leads.manage','reps.manage');
delete from supabase_migrations.schema_migrations where name = 'rbac_dashboard_permissions_seed';
