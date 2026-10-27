drop function if exists public.update_my_profile(text);
delete from supabase_migrations.schema_migrations where name = 'staff_update_my_profile';
