-- Removes every additive rbac_* policy created by batch 2 and the publish gate. Legacy policies were never touched.
drop trigger if exists trg_articles_guard_publish on public.articles;
drop trigger if exists trg_products_guard_publish on public.products;
drop function if exists public.rbac_guard_publish();
do $r$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and policyname in (
        select 'rbac_' || t || '_' || c
        from unnest(array['articles','products','category_settings','faqs','projects','brand_logos','site_stats','calculator_prices','chassis_prices',
          'inverter_prices','irr_prices','offgrid_component_prices','offgrid_loads','offgrid_packages','offgrid_presets','ongrid_prices','panel_config',
          'offgrid_bom_cost_settings','promotional_discounts','pump_prices','pump_systems','supplier_discounts','calc_settings','irrigation_bom_settings',
          'offgrid_bom_settings','roi_settings','cart_quote_requests','reps']) t,
             unnest(array['select','insert','update','delete']) c)
      and policyname <> 'rbac_reps_select'   -- created by batch 1, not here
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $r$;
delete from supabase_migrations.schema_migrations where name = 'rbac_policies_batch2_dashboard';
