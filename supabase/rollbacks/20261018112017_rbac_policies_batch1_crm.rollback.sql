-- Removes only the additive rbac_* policies. Legacy policies were never touched, so access reverts to exactly the old behaviour.
drop policy if exists rbac_customers_select   on public.customers;
drop policy if exists rbac_customers_update   on public.customers;
drop policy if exists rbac_quotes_select      on public.quotes;
drop policy if exists rbac_quote_drafts_select on public.quote_drafts;
drop policy if exists rbac_reps_select        on public.reps;
drop policy if exists rbac_quote_costs_select on public.quote_costs;
delete from supabase_migrations.schema_migrations where name = 'rbac_policies_batch1_crm';
