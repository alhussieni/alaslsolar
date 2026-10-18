-- Stage 6 (data): permissions for the admin dashboard areas + role grants. Idempotent.
-- Assumptions to confirm with the owner: admin also gets content.manage (projects/FAQs/brand logos/stats) and leads.manage (site quote requests).
-- Pricing/calculator settings, supplier discounts, quote costs and rep management stay superadmin-only (no role is granted them).
-- Rollback: supabase/rollbacks/20261018215843_rbac_dashboard_permissions_seed.rollback.sql
insert into public.permissions(key, module, description) values
  ('dashboard.access', 'dashboard', 'Open the admin dashboard'),
  ('content.manage',   'content',   'Manage projects, FAQs, brand logos and site stats'),
  ('pricing.manage',   'pricing',   'Manage prices, calculators, BOM settings, discounts and supplier discounts'),
  ('leads.manage',     'leads',     'Handle website quote requests'),
  ('reps.manage',      'sales',     'Create, activate and edit reps (legacy reps table)')
on conflict (key) do update set module = excluded.module, description = excluded.description;

insert into public.role_permissions(role_key, permission_key) values
  ('admin', 'dashboard.access'),
  ('admin', 'content.manage'),
  ('admin', 'leads.manage')
on conflict do nothing;
