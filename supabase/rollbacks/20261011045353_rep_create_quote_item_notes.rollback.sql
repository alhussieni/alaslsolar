-- Rollback لـ 20261011045353_rep_create_quote_item_notes.sql
-- بيرجّع الدالة لتعريفها الأصلي (مأخوذ من pg_get_functiondef قبل التعديل، بتاريخ 2026-10-11).
-- البنود اللي اتحفظت بـ"note" بتفضل في quotes.items زي ما هي (مفتاح زيادة بس، الصفحة والطباعة القديمة بيتجاهلوه).

create or replace function public.rep_create_quote(
  p_customer_name text,
  p_customer_phone text,
  p_customer_city text,
  p_quote_type text,
  p_items jsonb,
  p_installation_cost numeric,
  p_notes text default null::text
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rep_id uuid := auth.uid();
  v_customer_id bigint;
  v_quote_id bigint;
  v_item jsonb;
  v_product record;
  v_discount_pct numeric;
  v_unit_price numeric;
  v_qty numeric;
  v_computed_items jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_install numeric := coalesce(p_installation_cost, 0);
begin
  if not (is_rep() or is_admin()) then
    raise exception 'not authorized';
  end if;
  if p_quote_type not in ('supply_only','supply_install') then
    raise exception 'invalid quote_type';
  end if;
  if p_customer_phone is null or length(trim(p_customer_phone)) < 8 then
    raise exception 'invalid phone';
  end if;
  if v_install < 0 then
    raise exception 'invalid installation cost';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;

    select id, name_ar, name_en, category, brand, price
      into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid
        and published = true and in_stock = true;

    if v_product.id is null then
      raise exception 'product not found or unpublished: %', v_item->>'product_id';
    end if;

    select supplier_discount_pct into v_discount_pct
      from public.supplier_discounts
      where category = v_product.category and brand = v_product.brand;

    v_unit_price := round(coalesce(v_product.price, 0) * (1 - coalesce(v_discount_pct, 0) / 100.0), 2);

    v_computed_items := v_computed_items || jsonb_build_object(
      'product_id', v_product.id,
      'name', coalesce(v_product.name_ar, v_product.name_en),
      'unit_price', v_unit_price,
      'qty', v_qty,
      'line_total', v_unit_price * v_qty
    );

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
  end loop;

  if jsonb_array_length(v_computed_items) = 0 then
    raise exception 'quote must have at least one item';
  end if;

  if p_quote_type = 'supply_install' then
    v_total := v_subtotal + v_install;
  else
    v_install := 0;
    v_total := v_subtotal;
  end if;

  insert into public.customers (name, phone, city, assigned_rep_id, lead_source)
  values (p_customer_name, p_customer_phone, p_customer_city, v_rep_id, 'rep_quote')
  on conflict (phone) do update
    set name = excluded.name,
        city = coalesce(excluded.city, public.customers.city),
        updated_at = now()
  returning id into v_customer_id;

  insert into public.quotes (customer_id, rep_id, quote_type, items, subtotal, installation_cost, total, notes)
  values (v_customer_id, v_rep_id, p_quote_type, v_computed_items, v_subtotal, v_install, v_total, p_notes)
  returning id into v_quote_id;

  return v_quote_id;
end;
$function$;
