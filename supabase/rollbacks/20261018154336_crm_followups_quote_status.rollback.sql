-- WARNING: destroys all follow-ups, activity timeline and quote statuses recorded since the migration. Export first if needed.
drop function if exists public.crm_rep_overview(integer);
drop function if exists public.crm_complete_follow_up(bigint, text);
drop function if exists public.crm_add_follow_up(bigint, timestamptz, text, bigint, uuid);
drop function if exists public.crm_assign_customer(bigint, uuid, text);
drop function if exists public.crm_set_quote_status(bigint, text, text);
drop function if exists public.crm_add_activity(bigint, text, text, bigint);
drop function if exists public.crm_can_touch_customer(bigint);
drop table if exists public.follow_ups;
drop table if exists public.customer_activities;
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes drop constraint if exists quotes_lost_reason_len;
alter table public.quotes drop column if exists status, drop column if exists status_changed_at,
                          drop column if exists status_changed_by, drop column if exists lost_reason;
delete from supabase_migrations.schema_migrations where name = 'crm_followups_quote_status';
