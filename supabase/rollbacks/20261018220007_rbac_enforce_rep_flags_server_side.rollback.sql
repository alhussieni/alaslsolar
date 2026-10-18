-- Restores the original guard in the two functions, then drops the helper.
do $r$
declare
  fn regprocedure;
  v_def text;
begin
  foreach fn in array array[
    'public.rep_create_offgrid_quote(text,text,text,text,jsonb,text)'::regprocedure,
    'public.rep_create_quote(text,text,text,text,jsonb,numeric,text)'::regprocedure ]
  loop
    v_def := pg_get_functiondef(fn);
    v_def := regexp_replace(v_def, 'if not \(is_rep\(\) or is_admin\(\)\) or not public\.rbac_rep_flag\(''[a-z]+''\) then', 'if not (is_rep() or is_admin()) then');
    execute v_def;
  end loop;
end $r$;
drop function if exists public.rbac_rep_flag(text);
delete from supabase_migrations.schema_migrations where name = 'rbac_enforce_rep_flags_server_side';
