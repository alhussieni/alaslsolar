-- Rollback for 20261127120000_projects_i18n_columns.sql
-- WARNING: drops any translations saved in these columns. content_en/es/zh are NOT dropped
-- (they pre-date this migration).
-- Before running: deploy the previous dashboard.js, otherwise saveProject will fail on missing columns.

alter table public.projects
  drop column if exists title_en,
  drop column if exists title_es,
  drop column if exists title_zh,
  drop column if exists summary_en,
  drop column if exists summary_es,
  drop column if exists summary_zh,
  drop column if exists meta_description_en,
  drop column if exists meta_description_es,
  drop column if exists meta_description_zh;
