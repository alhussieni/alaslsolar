-- 20261127120000_projects_i18n_columns.sql
-- Why:    Project pages in en/es/zh were generated with Arabic text because the
--         `projects` table had no per-language title/summary/meta columns (and the
--         dashboard never saved content_en/es/zh). generate-projects.mjs already reads
--         `<field>_<lang>` and falls back to Arabic when a value is NULL.
-- What:   ADDITIVE only. New nullable text columns; no existing column or row is touched.
--         content_en/es/zh already exist in prod (added by supabase-projects-seed.sql);
--         they are repeated here with IF NOT EXISTS so a fresh database ends up identical.
-- Depends: dashboard.js (saveProject / projectTranslationsBlock), generate-projects.mjs.
-- RLS/grants: unchanged (table-level grants + rbac_projects_* policies already cover new columns).
-- Rollback: supabase/rollbacks/20261127120000_projects_i18n_columns.rollback.sql

alter table public.projects
  add column if not exists title_en            text,
  add column if not exists title_es            text,
  add column if not exists title_zh            text,
  add column if not exists summary_en          text,
  add column if not exists summary_es          text,
  add column if not exists summary_zh          text,
  add column if not exists meta_description_en text,
  add column if not exists meta_description_es text,
  add column if not exists meta_description_zh text,
  add column if not exists content_en          text,
  add column if not exists content_es          text,
  add column if not exists content_zh          text;
