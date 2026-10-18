drop trigger if exists reps_rbac_bridge on public.reps;
drop function if exists public.rbac_sync_new_rep();
delete from supabase_migrations.schema_migrations where name = 'rbac_reps_insert_bridge';
