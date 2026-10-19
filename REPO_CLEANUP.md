# Repo cleanup checklist (manual deletes on GitHub — nothing here is referenced by the site)

Verified against the repo on 2026-10-18:

| File | Why it is safe to delete |
|---|---|
| `0` (root) | 15 KB stale copy of a Chinese-language HTML page (looks like a mistyped output redirect) |
| `diff_app_js.txt`, `diff_dashboard_html.txt`, `diff_dashboard_js.txt`, `diff_products_html.txt` | scratch diffs |
| `projects-fix.zip` | scratch archive |
| `QL/fix-qty-price-total.patch`, `QL/fix-script-src-wrong-file.patch`, `QL/ql-rep-crm-changes.patch` | applied patches |
| `supabase/migrations/20261011120000_rep_create_quote_item_notes.sql` and its `.rollback.sql` | duplicate of `20261011045353_...` — production has only the 045353 version (checked in schema_migrations) |
| `rep-crm.html`, `rep-crm.js` (root) | stale copies of `QL/rep-crm.*` (the JS differs). `dashboard.html` linked to them until this change; it now points at `QL/rep-crm.html`. Delete only AFTER uploading this dashboard.html |

Not in scope / needs a decision: production has ~80 migrations but the repo has only a handful. Export a baseline
(`supabase db dump` / `supabase migration list`) so the repo becomes the real source of truth.
