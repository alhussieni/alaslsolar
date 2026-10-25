-- Numbers for the "Today" panel on /management/. Scope follows permissions:
--   reps.activity.read -> follow-ups of everyone, else own (needs customers.read_own)
--   quotes.read_all    -> all quotes, else own (needs quotes.read_own)
--   customers.read_all -> all customers, else own (needs customers.read_own)
--   leads.manage       -> new website requests
-- Returns only the keys the caller is allowed to see (absent key = not permitted). Never returns costs or profit.
-- Rollback: supabase/rollbacks/20261025152654_crm_today_summary.rollback.sql
create or replace function public.crm_today_summary()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_out     jsonb := '{}'::jsonb;
  v_tz      constant text := 'Africa/Cairo';
  v_day0    timestamptz := (date_trunc('day',   now() at time zone v_tz)) at time zone v_tz;
  v_month0  timestamptz := (date_trunc('month', now() at time zone v_tz)) at time zone v_tz;
  v_fu_all  boolean := public.has_permission('reps.activity.read');
  v_c_own   boolean := public.has_permission('customers.read_own');
  v_c_all   boolean := public.has_permission('customers.read_all');
  v_q_all   boolean := public.has_permission('quotes.read_all');
  v_q_own   boolean := public.has_permission('quotes.read_own');
  a bigint; b bigint; c bigint; x numeric; y numeric;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  if v_fu_all or v_c_own then
    select count(*) filter (where f.due_at < now()),
           count(*) filter (where f.due_at >= v_day0 and f.due_at < v_day0 + interval '1 day')
      into a, b
      from public.follow_ups f
     where f.done_at is null and (v_fu_all or f.rep_id = v_uid);
    v_out := v_out || jsonb_build_object('follow_ups_overdue', a, 'follow_ups_today', b,
                                         'scope_follow_ups', case when v_fu_all then 'all' else 'own' end);
  end if;

  if v_q_all or v_q_own then
    select count(*) filter (where q.status in ('issued','negotiating')),
           coalesce(sum(q.total) filter (where q.status in ('issued','negotiating')), 0),
           count(*) filter (where q.status = 'accepted' and q.status_changed_at >= v_month0),
           coalesce(sum(q.total) filter (where q.status = 'accepted' and q.status_changed_at >= v_month0), 0)
      into a, x, c, y
      from public.quotes q
     where (v_q_all or q.rep_id = v_uid);
    v_out := v_out || jsonb_build_object('quotes_open', a, 'quotes_open_total', x,
                                         'accepted_month', c, 'accepted_month_total', y,
                                         'scope_quotes', case when v_q_all then 'all' else 'own' end);
  end if;

  if v_c_all or v_c_own then
    select count(*) into a from public.customers cu where (v_c_all or cu.assigned_rep_id = v_uid);
    v_out := v_out || jsonb_build_object('customers', a, 'scope_customers', case when v_c_all then 'all' else 'own' end);
  end if;

  if public.has_permission('leads.manage') then
    select count(*) into a from public.cart_quote_requests r where r.status = 'new';
    v_out := v_out || jsonb_build_object('new_requests', a);
  end if;

  return v_out;
end;
$$;

revoke execute on function public.crm_today_summary() from public, anon, authenticated;
grant execute on function public.crm_today_summary() to authenticated;
