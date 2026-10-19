# ERP — reserved place (not built yet)

This file fixes the conventions NOW so the ERP can be added later without touching the CRM / admin / QL work.

| Area | Reserved convention |
|---|---|
| URL | `/erp/` (placeholder page exists; link in the dashboard sidebar is visible only with `erp.access`) |
| Permissions | namespace `erp.<domain>.<action>`, e.g. `erp.inventory.read`, `erp.purchasing.write`, `erp.invoices.approve`. Only `erp.access` exists today (superadmin only via bypass) |
| Roles (names reserved, NOT created) | `accountant`, `warehouse_keeper`, `purchasing` |
| Tables | prefix `erp_` in `public` (e.g. `erp_items`, `erp_stock_moves`), RLS enabled from day one, writes through `erp_*` SECURITY DEFINER RPCs like the `crm_*` ones |
| Edge Functions | prefix `erp-` |
| Audit | sensitive ERP writes go to `public.audit_log` (already exists) |
| Costs/profit | stay behind `costs.read` (superadmin only) unless an ERP role is explicitly granted it |
| Migrations | `supabase/migrations/<ts>_erp_<what>.sql` + matching `.rollback.sql` in `supabase/rollbacks/` |

Adding a role later = insert into `roles` + `role_permissions` (no code change); then create the user from `admin/staff.html`
(add the role to the ROLES list in `admin/staff.html` and the role list used by `staff-admin` is read from the DB automatically).

Open questions before building (owner to decide): inventory first or purchasing first? Is the ERP separate from product catalog
(`products`) or linked to it? Which currency/tax rules apply to invoices?
