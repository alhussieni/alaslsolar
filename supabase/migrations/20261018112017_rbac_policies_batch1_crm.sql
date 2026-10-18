-- RBAC batch 1: ADDITIVE policies (permissive policies are OR-ed with the legacy is_admin()/is_rep() ones, which stay untouched).
-- Scope: customers, quotes, quote_drafts, reps (read), quote_costs (read). Writes to quotes/customers creation still go through rep_* RPCs (batch 2).
-- Cost data (quote_costs) is exposed ONLY via costs.read, which no role except superadmin has.
-- Rollback: supabase/rollbacks/20261018112017_rbac_policies_batch1_crm.rollback.sql

-- customers ------------------------------------------------------------------
drop policy if exists rbac_customers_select on public.customers;
create policy rbac_customers_select on public.customers for select to authenticated
  using (
    (select public.has_permission('customers.read_all'))
    or ((select public.has_permission('customers.read_own')) and assigned_rep_id = (select auth.uid()))
  );

drop policy if exists rbac_customers_update on public.customers;
create policy rbac_customers_update on public.customers for update to authenticated
  using (
    (select public.has_permission('customers.assign'))
    or ((select public.has_permission('customers.read_own')) and assigned_rep_id = (select auth.uid()))
  )
  with check (
    (select public.has_permission('customers.assign'))
    or ((select public.has_permission('customers.read_own')) and assigned_rep_id = (select auth.uid()))
  );

-- quotes ---------------------------------------------------------------------
drop policy if exists rbac_quotes_select on public.quotes;
create policy rbac_quotes_select on public.quotes for select to authenticated
  using (
    (select public.has_permission('quotes.read_all'))
    or ((select public.has_permission('quotes.read_own')) and rep_id = (select auth.uid()))
  );

-- live drafts (CRM "who is working on what now") ------------------------------
drop policy if exists rbac_quote_drafts_select on public.quote_drafts;
create policy rbac_quote_drafts_select on public.quote_drafts for select to authenticated
  using (
    (select public.has_permission('reps.activity.read'))
    or ((select public.has_permission('quotes.create')) and rep_id = (select auth.uid()))
  );

-- reps list (names/flags) for people who follow reps ---------------------------
drop policy if exists rbac_reps_select on public.reps;
create policy rbac_reps_select on public.reps for select to authenticated
  using ((select public.has_permission('reps.view')));

-- cost / profit snapshot: superadmin only (costs.read) --------------------------
drop policy if exists rbac_quote_costs_select on public.quote_costs;
create policy rbac_quote_costs_select on public.quote_costs for select to authenticated
  using ((select public.has_permission('costs.read')));
