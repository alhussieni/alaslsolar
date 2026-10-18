-- Stage 6 (schema): ADDITIVE policies for the admin dashboard tables. Legacy is_admin() policies stay untouched (OR-ed).
-- Mapping table -> permission is in the VALUES list below. Pricing/settings tables require pricing.manage (superadmin only today).
-- articles/products: writers (write perm only) may not edit PUBLISHED rows and may not publish (trigger) -> publishing = *.review.
-- Rollback: supabase/rollbacks/20261018215900_rbac_policies_batch2_dashboard.rollback.sql
do $mig$
declare
  t record;
  pol text;
  using_expr text;
  check_expr text;
begin
  for t in
    select * from (values
      -- table, permission, cmds, review_permission (publish gate for write-only users)
      ('articles',                  'articles.write', 'sel,ins,upd,del', 'articles.review'),
      ('products',                  'products.write', 'sel,ins,upd,del', 'products.review'),
      ('category_settings',         'products.write', 'sel,ins,upd,del', null),
      ('faqs',                      'content.manage', 'sel,ins,upd,del', null),
      ('projects',                  'content.manage', 'sel,ins,upd,del', null),
      ('brand_logos',               'content.manage', 'sel,ins,upd,del', null),
      ('site_stats',                'content.manage', 'sel,ins,upd,del', null),
      ('calculator_prices',         'pricing.manage', 'sel,ins,upd,del', null),
      ('chassis_prices',            'pricing.manage', 'sel,ins,upd,del', null),
      ('inverter_prices',           'pricing.manage', 'sel,ins,upd,del', null),
      ('irr_prices',                'pricing.manage', 'sel,ins,upd,del', null),
      ('offgrid_component_prices',  'pricing.manage', 'sel,ins,upd,del', null),
      ('offgrid_loads',             'pricing.manage', 'sel,ins,upd,del', null),
      ('offgrid_packages',          'pricing.manage', 'sel,ins,upd,del', null),
      ('offgrid_presets',           'pricing.manage', 'sel,ins,upd,del', null),
      ('ongrid_prices',             'pricing.manage', 'sel,ins,upd,del', null),
      ('panel_config',              'pricing.manage', 'sel,ins,upd,del', null),
      ('offgrid_bom_cost_settings', 'pricing.manage', 'sel,ins,upd,del', null),
      ('promotional_discounts',     'pricing.manage', 'sel,ins,upd,del', null),
      ('pump_prices',               'pricing.manage', 'sel,ins,upd,del', null),
      ('pump_systems',              'pricing.manage', 'sel,ins,upd,del', null),
      ('supplier_discounts',        'pricing.manage', 'sel,ins,upd,del', null),
      ('calc_settings',             'pricing.manage', 'sel,upd',         null),
      ('irrigation_bom_settings',   'pricing.manage', 'sel,upd',         null),
      ('offgrid_bom_settings',      'pricing.manage', 'sel,upd',         null),
      ('roi_settings',              'pricing.manage', 'sel,upd',         null),
      ('cart_quote_requests',       'leads.manage',   'sel,upd,del',     null),
      ('reps',                      'reps.manage',    'ins,upd,del',     null)
    ) as v(tbl, perm, cmds, review_perm)
  loop
    using_expr := format('(select public.has_permission(%L))', t.perm);
    check_expr := using_expr;

    if t.cmds like '%sel%' then
      pol := 'rbac_' || t.tbl || '_select';
      execute format('drop policy if exists %I on public.%I', pol, t.tbl);
      execute format('create policy %I on public.%I for select to authenticated using (%s)', pol, t.tbl, using_expr);
    end if;
    if t.cmds like '%ins%' then
      pol := 'rbac_' || t.tbl || '_insert';
      execute format('drop policy if exists %I on public.%I', pol, t.tbl);
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)', pol, t.tbl, check_expr);
    end if;
    if t.cmds like '%upd%' then
      pol := 'rbac_' || t.tbl || '_update';
      if t.review_perm is not null then
        -- write-only users can edit unpublished rows; reviewers can edit anything
        using_expr := format('(select public.has_permission(%L)) or ((select public.has_permission(%L)) and published = false)', t.review_perm, t.perm);
        check_expr := format('(select public.has_permission(%L)) or (select public.has_permission(%L))', t.review_perm, t.perm);
      end if;
      execute format('drop policy if exists %I on public.%I', pol, t.tbl);
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', pol, t.tbl, using_expr, check_expr);
    end if;
    if t.cmds like '%del%' then
      pol := 'rbac_' || t.tbl || '_delete';
      using_expr := case when t.review_perm is not null
        then format('(select public.has_permission(%L)) or ((select public.has_permission(%L)) and published = false)', t.review_perm, t.perm)
        else format('(select public.has_permission(%L))', t.perm) end;
      execute format('drop policy if exists %I on public.%I', pol, t.tbl);
      execute format('create policy %I on public.%I for delete to authenticated using (%s)', pol, t.tbl, using_expr);
    end if;
  end loop;
end
$mig$;

-- publish gate: only users with the review permission (or legacy admin / service role) can turn a row to published=true
create or replace function public.rbac_guard_publish()
returns trigger language plpgsql set search_path = ''
as $$
declare v_perm text := tg_argv[0];
begin
  if (select auth.role()) = 'authenticated'
     and new.published is true
     and (tg_op = 'INSERT' or old.published is distinct from true)
     and not ((select public.is_admin()) or (select public.has_permission(v_perm))) then
    raise exception 'publishing requires the % permission', v_perm using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.rbac_guard_publish() from public, anon, authenticated;

drop trigger if exists trg_articles_guard_publish on public.articles;
create trigger trg_articles_guard_publish before insert or update on public.articles
  for each row execute function public.rbac_guard_publish('articles.review');

drop trigger if exists trg_products_guard_publish on public.products;
create trigger trg_products_guard_publish before insert or update on public.products
  for each row execute function public.rbac_guard_publish('products.review');
