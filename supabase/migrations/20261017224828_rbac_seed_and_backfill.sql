-- =============================================================================
-- RBAC Phase 1 / 2 : reference data + backfill of existing users (data only)
-- Requires: 20261017224816_rbac_foundation_schema.sql
-- Idempotent: safe to re-run.
-- Backfill rules (verified read-only against prod on 2026-10-17):
--   admin_users -> staff_profiles + role 'superadmin'   (1 row; same access as today)
--   reps        -> staff_profiles + role 'sales_rep'    (2 rows)
--   1 person is in BOTH lists -> gets both roles (needed: customers are assigned to him as rep)
-- NOT migrated yet: reps.can_access_offgrid / can_access_products / can_access_crm.
--   They stay authoritative until the policy-migration phase.
-- =============================================================================

insert into public.permissions(key, module, description) values
  ('staff.manage',       'staff',   'Manage users, roles and role permissions'),
  ('audit.read',         'audit',   'Read the audit log'),
  ('costs.read',         'pricing', 'See cost, profit and supplier discounts'),
  ('articles.write',     'content', 'Create and edit articles'),
  ('articles.review',    'content', 'Review and publish articles'),
  ('products.write',     'catalog', 'Create and edit products'),
  ('products.review',    'catalog', 'Review and publish products'),
  ('reps.view',          'sales',   'List sales reps and their roles'),
  ('reps.activity.read', 'sales',   'Follow rep performance and activity'),
  ('customers.read_own', 'crm',     'See customers assigned to me'),
  ('customers.read_all', 'crm',     'See all customers'),
  ('customers.assign',   'crm',     'Assign customers to reps'),
  ('quotes.create',      'quotes',  'Create price quotes'),
  ('quotes.read_own',    'quotes',  'See my own quotes'),
  ('quotes.read_all',    'quotes',  'See all quotes'),
  ('crm.access',         'crm',     'Open the CRM module'),
  ('ql.access',          'ql',      'Open the /ql module'),
  ('offgrid.access',     'ql',      'Use the off-grid tools (legacy flag, not attached to a role yet)'),
  ('products.access',    'ql',      'Use products tools in /ql (legacy flag, not attached to a role yet)')
on conflict (key) do update set module = excluded.module, description = excluded.description;

insert into public.roles(key, name_ar, name_en, description, is_system) values
  ('superadmin',    'سوبر أدمن',   'Super Admin',   'Everything, including users and roles', true),
  ('admin',         'أدمن',        'Admin',         'Content, catalog, rep follow-up, customer assignment', true),
  ('sales_manager', 'مدير مناديب', 'Sales Manager', 'Follows all reps, assigns customers, creates quotes', true),
  ('sales_rep',     'مندوب',       'Sales Rep',     'Own customers and quotes in /ql', true)
on conflict (key) do update set name_ar = excluded.name_ar, name_en = excluded.name_en,
                               description = excluded.description;

-- superadmin: no rows needed, has_permission() bypasses for it.
insert into public.role_permissions(role_key, permission_key) values
  ('admin','articles.write'), ('admin','articles.review'),
  ('admin','products.write'), ('admin','products.review'),
  ('admin','reps.view'), ('admin','reps.activity.read'),
  ('admin','customers.read_all'), ('admin','customers.assign'),
  ('admin','quotes.read_all'), ('admin','crm.access'),

  ('sales_manager','reps.view'), ('sales_manager','reps.activity.read'),
  ('sales_manager','customers.read_all'), ('sales_manager','customers.assign'),
  ('sales_manager','quotes.create'), ('sales_manager','quotes.read_all'),
  ('sales_manager','crm.access'), ('sales_manager','ql.access'),

  ('sales_rep','ql.access'), ('sales_rep','crm.access'),
  ('sales_rep','quotes.create'), ('sales_rep','quotes.read_own'),
  ('sales_rep','customers.read_own')
on conflict do nothing;

-- ---------- backfill ----------
insert into public.staff_profiles(id, email, display_name, active)
select u.id, lower(u.email), null, true
from public.admin_users a
join auth.users u on lower(u.email) = lower(a.email)
on conflict (id) do nothing;

insert into public.staff_profiles(id, email, display_name, active)
select r.id, lower(r.email), r.display_name, r.active
from public.reps r
on conflict (id) do update set display_name = coalesce(public.staff_profiles.display_name, excluded.display_name);

insert into public.user_roles(user_id, role_key)
select u.id, 'superadmin'
from public.admin_users a
join auth.users u on lower(u.email) = lower(a.email)
on conflict do nothing;

insert into public.user_roles(user_id, role_key)
select r.id, 'sales_rep' from public.reps r
on conflict do nothing;

