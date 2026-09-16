-- تم تنفيذه فعليًا على مشروع ALASLSOLAR (nymkmrdbicfuniobunth) بتاريخ 2026-09-16.
-- محفوظ هنا للتوثيق فقط ولمزامنة أي بيئة تانية (staging مثلًا) بنفس الـ schema.

create table public.quote_drafts (
  rep_id uuid primary key references public.reps(id) on delete cascade,
  customer_name text,
  customer_phone text,
  quote_type text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  installation_cost numeric not null default 0,
  total numeric not null default 0,
  page text,
  last_active_at timestamptz not null default now()
);

alter table public.quote_drafts enable row level security;

create policy "Admins see all drafts" on public.quote_drafts
  for select using (is_admin());

create policy "Reps see own draft" on public.quote_drafts
  for select using (is_rep() and rep_id = auth.uid());

create or replace function public.rep_upsert_quote_draft(
  p_customer_name text, p_customer_phone text, p_quote_type text,
  p_items jsonb, p_subtotal numeric, p_installation_cost numeric,
  p_total numeric, p_page text
) returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not is_rep() then raise exception 'not authorized'; end if;
  insert into quote_drafts (rep_id, customer_name, customer_phone, quote_type, items, subtotal, installation_cost, total, page, last_active_at)
  values (auth.uid(), p_customer_name, p_customer_phone, p_quote_type, p_items, p_subtotal, p_installation_cost, p_total, p_page, now())
  on conflict (rep_id) do update set
    customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
    quote_type = excluded.quote_type, items = excluded.items, subtotal = excluded.subtotal,
    installation_cost = excluded.installation_cost, total = excluded.total,
    page = excluded.page, last_active_at = now();
end;
$$;

create or replace function public.rep_clear_quote_draft() returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  delete from quote_drafts where rep_id = auth.uid();
end;
$$;

grant execute on function public.rep_upsert_quote_draft(text, text, text, jsonb, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.rep_clear_quote_draft() to authenticated;
