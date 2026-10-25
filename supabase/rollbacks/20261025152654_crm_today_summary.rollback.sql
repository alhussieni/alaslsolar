drop function if exists public.crm_today_summary();
delete from supabase_migrations.schema_migrations where name = 'crm_today_summary';
