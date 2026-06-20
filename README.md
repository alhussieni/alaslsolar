# Al Asl Solar Website

Static GitHub Pages website for Al Asl Solar.

## Test locally

Open `index.html` in a browser, or serve the folder with any static web server.

## Pages

- `index.html`
- `about.html`
- `services.html`
- `projects.html`
- `articles.html`
- `contact.html`
- `admin/index.html`
- `dashboard.html`

## Content editing

Projects, articles, FAQs, and stats can be edited from `dashboard.html` using Supabase Auth, Database, and Storage.

## Database schema

All schema changes now live in `supabase/migrations/` as a single tracked migration
(`20260620195137_baseline_schema.sql`), generated from the live production database
on 2026-06-20. This replaces the older, scattered `supabase-setup.sql`,
`supabase-new-tables.sql`, `add-category-column.sql`, and `supabase-faqs-content.sql`
files, which are no longer used and have been removed.

The `calculator_prices`, `irr_prices`, `ongrid_prices`, `offgrid_packages`,
`offgrid_component_prices`, `panel_config`, `inverter_prices`, `chassis_prices`, and
`products` tables exist in the schema but are **not yet wired to any page** — they're
prepared in advance for an upcoming price-calculator feature.

### Connecting this repo to Supabase (one-time setup)

1. In the Supabase Dashboard, go to **Project Settings → Integrations → GitHub** and
   authorize/connect this repository.
2. Set the working directory to `.` (the `supabase/` folder is at the repo root).
3. Enable **Deploy to production** so migrations pushed/merged to `main` apply
   automatically.
4. For a fresh environment, run the migration once in the Supabase SQL Editor or via
   `supabase db push` after `supabase link --project-ref <project-ref>`. It is
   idempotent and safe to re-run.
5. After the schema exists, create the admin user (`REDACTED`) in
   Supabase Authentication with an email/password.
