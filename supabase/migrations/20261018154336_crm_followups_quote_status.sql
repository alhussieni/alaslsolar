-- CRM foundation: quote status, customer activity timeline, follow-ups, assignment + manager overview.
-- All WRITES go through SECURITY DEFINER RPCs (project convention: rep_* RPCs). Tables are read-only for clients under RLS.
-- Permissions used (seeded earlier): customers.read_all/read_own/assign, quotes.read_all/read_own, reps.activity.read.
-- Rollback: supabase/rollbacks/20261018154336_crm_followups_quote_status.rollback.sql

-- 1) quote status ------------------------------------------------------------
alter table public.quotes
  add column if not exists status             text not null default 'issued',
  add column if not exists status_changed_at  timestamptz,
  add column if not exists status_changed_by  uuid references auth.users(id) on delete set null,
  add column if not exists lost_reason        text;

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('issued','negotiating','accepted','rejected','expired'));
alter table public.quotes drop constraint if exists quotes_lost_reason_len;
alter table public.quotes add constraint quotes_lost_reason_len check (lost_reason is null or char_length(lost_reason) <= 500);

-- 2) activity timeline ---------------------------------------------------------
create table if not exists public.customer_activities (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  quote_id    bigint references public.quotes(id) on delete set null,
  actor_id    uuid references auth.users(id) on delete set null,
  kind        text not null check (kind in ('call','visit','whatsapp','note','status_change','assignment','follow_up_done')),
  body        text check (body is null or char_length(body) <= 2000),
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists customer_activities_customer_idx on public.customer_activities(customer_id, created_at desc);
create index if not exists customer_activities_actor_idx    on public.customer_activities(actor_id, created_at desc);

-- 3) follow-ups ----------------------------------------------------------------
create table if not exists public.follow_ups (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  quote_id    bigint references public.quotes(id) on delete set null,
  rep_id      uuid not null references public.reps(id),
  due_at      timestamptz not null,
  note        text check (note is null or char_length(note) <= 500),
  done_at     timestamptz,
  done_by     uuid references auth.users(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists follow_ups_open_idx     on public.follow_ups(rep_id, due_at) where done_at is null;
create index if not exists follow_ups_customer_idx on public.follow_ups(customer_id);

alter table public.customer_activities enable row level security;
alter table public.follow_ups          enable row level security;

drop policy if exists customer_activities_select on public.customer_activities;
create policy customer_activities_select on public.customer_activities for select to authenticated
  using (
    (select public.has_permission('customers.read_all'))
    or ((select public.has_permission('customers.read_own'))
        and exists (select 1 from public.customers c
                    where c.id = customer_activities.customer_id and c.assigned_rep_id = (select auth.uid())))
  );

drop policy if exists follow_ups_select on public.follow_ups;
create policy follow_ups_select on public.follow_ups for select to authenticated
  using (
    (select public.has_permission('reps.activity.read'))
    or ((select public.has_permission('customers.read_own')) and rep_id = (select auth.uid()))
  );

revoke all on public.customer_activities, public.follow_ups from anon, authenticated;
grant select on public.customer_activities, public.follow_ups to authenticated;

-- 4) helpers + RPCs -------------------------------------------------------------
create or replace function public.crm_can_touch_customer(p_customer_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.customers c
    where c.id = p_customer_id
      and (
        (select public.has_permission('customers.read_all'))
        or ((select public.has_permission('customers.read_own')) and c.assigned_rep_id = (select auth.uid()))
      )
  );
$$;

create or replace function public.crm_add_activity(p_customer_id bigint, p_kind text, p_body text, p_quote_id bigint default null)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_body text := nullif(btrim(p_body), '');
  v_id   bigint;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('call','visit','whatsapp','note') then raise exception 'invalid kind' using errcode = '22023'; end if;
  if v_body is null or char_length(v_body) > 2000 then raise exception 'body required (max 2000 chars)' using errcode = '22023'; end if;
  if not public.crm_can_touch_customer(p_customer_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_quote_id is not null and not exists (select 1 from public.quotes q where q.id = p_quote_id and q.customer_id = p_customer_id) then
    raise exception 'quote does not belong to this customer' using errcode = '22023';
  end if;
  insert into public.customer_activities(customer_id, quote_id, actor_id, kind, body)
  values (p_customer_id, p_quote_id, v_uid, p_kind, v_body) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.crm_set_quote_status(p_quote_id bigint, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_q      record;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('issued','negotiating','accepted','rejected','expired') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then raise exception 'reason too long' using errcode = '22023'; end if;

  select id, customer_id, rep_id, status into v_q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'quote not found' using errcode = 'P0002'; end if;

  if not ( (select public.has_permission('quotes.read_all'))
           or ((select public.has_permission('quotes.read_own')) and v_q.rep_id = v_uid) ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_q.status = p_status then return; end if;

  update public.quotes
     set status = p_status, status_changed_at = now(), status_changed_by = v_uid,
         lost_reason = case when p_status in ('rejected','expired') then v_reason else null end
   where id = p_quote_id;

  insert into public.customer_activities(customer_id, quote_id, actor_id, kind, body, meta)
  values (v_q.customer_id, p_quote_id, v_uid, 'status_change', v_reason,
          jsonb_build_object('from', v_q.status, 'to', p_status));
end;
$$;

create or replace function public.crm_assign_customer(p_customer_id bigint, p_rep_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_old  uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not (select public.has_permission('customers.assign')) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;
  if not exists (select 1 from public.reps r where r.id = p_rep_id and r.active) then
    raise exception 'target must be an active rep' using errcode = '22023';
  end if;

  select assigned_rep_id into v_old from public.customers where id = p_customer_id for update;
  if not found then raise exception 'customer not found' using errcode = 'P0002'; end if;
  if v_old is not distinct from p_rep_id then return; end if;

  update public.customers set assigned_rep_id = p_rep_id, updated_at = now() where id = p_customer_id;
  update public.follow_ups set rep_id = p_rep_id where customer_id = p_customer_id and done_at is null;

  insert into public.customer_activities(customer_id, actor_id, kind, body, meta)
  values (p_customer_id, v_uid, 'assignment', v_note, jsonb_build_object('from', v_old, 'to', p_rep_id));
  insert into public.audit_log(actor_id, action, table_name, record_key, old_data, new_data)
  values (v_uid, 'assign_customer', 'customers', p_customer_id::text,
          jsonb_build_object('rep_id', v_old), jsonb_build_object('rep_id', p_rep_id));
end;
$$;

create or replace function public.crm_add_follow_up(p_customer_id bigint, p_due_at timestamptz, p_note text default null,
                                                    p_quote_id bigint default null, p_rep_id uuid default null)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_note     text := nullif(btrim(p_note), '');
  v_cur      uuid;
  v_assignee uuid;
  v_id       bigint;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_due_at is null then raise exception 'due_at required' using errcode = '22023'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;
  if not public.crm_can_touch_customer(p_customer_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_quote_id is not null and not exists (select 1 from public.quotes q where q.id = p_quote_id and q.customer_id = p_customer_id) then
    raise exception 'quote does not belong to this customer' using errcode = '22023';
  end if;

  select assigned_rep_id into v_cur from public.customers where id = p_customer_id;
  v_assignee := coalesce(p_rep_id, v_cur, v_uid);
  if v_assignee <> v_uid and not (select public.has_permission('customers.assign')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reps r where r.id = v_assignee and r.active) then
    raise exception 'assignee must be an active rep' using errcode = '22023';
  end if;

  insert into public.follow_ups(customer_id, quote_id, rep_id, due_at, note, created_by)
  values (p_customer_id, p_quote_id, v_assignee, p_due_at, v_note, v_uid) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.crm_complete_follow_up(p_id bigint, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_f    record;
  v_note text := nullif(btrim(p_note), '');
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;
  select * into v_f from public.follow_ups where id = p_id for update;
  if not found then raise exception 'follow-up not found' using errcode = 'P0002'; end if;
  if not ( v_f.rep_id = v_uid or (select public.has_permission('reps.activity.read')) ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_f.done_at is not null then return; end if;
  update public.follow_ups set done_at = now(), done_by = v_uid where id = p_id;
  insert into public.customer_activities(customer_id, quote_id, actor_id, kind, body, meta)
  values (v_f.customer_id, v_f.quote_id, v_uid, 'follow_up_done', coalesce(v_note, v_f.note),
          jsonb_build_object('follow_up_id', p_id));
end;
$$;

create or replace function public.crm_rep_overview(p_days integer default 30)
returns table (
  rep_id uuid, display_name text, active boolean,
  quotes_count bigint, quotes_total numeric, accepted_count bigint, accepted_total numeric,
  customers_count bigint, overdue_follow_ups bigint, last_activity_at timestamptz
) language plpgsql stable security definer set search_path = ''
as $$
declare v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not (select public.has_permission('reps.activity.read')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select r.id, r.display_name, r.active,
         coalesce(q.cnt, 0), coalesce(q.total, 0), coalesce(q.acc_cnt, 0), coalesce(q.acc_total, 0),
         coalesce(c.cnt, 0), coalesce(f.overdue, 0),
         greatest(q.last_q, a.last_a)
  from public.reps r
  left join lateral (
    select count(*) cnt, sum(x.total) total,
           count(*) filter (where x.status = 'accepted') acc_cnt,
           sum(x.total) filter (where x.status = 'accepted') acc_total,
           max(x.created_at) last_q
    from public.quotes x
    where x.rep_id = r.id and x.created_at >= now() - make_interval(days => v_days)
  ) q on true
  left join lateral (select count(*) cnt from public.customers cu where cu.assigned_rep_id = r.id) c on true
  left join lateral (select count(*) overdue from public.follow_ups fu where fu.rep_id = r.id and fu.done_at is null and fu.due_at < now()) f on true
  left join lateral (select max(ca.created_at) last_a from public.customer_activities ca where ca.actor_id = r.id) a on true
  order by coalesce(q.total, 0) desc, r.display_name;
end;
$$;

-- privileges: only signed-in users may call the CRM RPCs; helper stays internal
revoke execute on function public.crm_can_touch_customer(bigint) from public, anon, authenticated;
revoke execute on function public.crm_add_activity(bigint, text, text, bigint),
                           public.crm_set_quote_status(bigint, text, text),
                           public.crm_assign_customer(bigint, uuid, text),
                           public.crm_add_follow_up(bigint, timestamptz, text, bigint, uuid),
                           public.crm_complete_follow_up(bigint, text),
                           public.crm_rep_overview(integer)
  from public, anon, authenticated;
grant execute on function public.crm_add_activity(bigint, text, text, bigint),
                          public.crm_set_quote_status(bigint, text, text),
                          public.crm_assign_customer(bigint, uuid, text),
                          public.crm_add_follow_up(bigint, timestamptz, text, bigint, uuid),
                          public.crm_complete_follow_up(bigint, text),
                          public.crm_rep_overview(integer)
  to authenticated;
