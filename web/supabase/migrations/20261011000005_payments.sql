-- Incremento 3: pagos pendientes y recurrentes.
-- "Vencido" no se guarda: es un pendiente con fecha anterior a hoy.
-- Cada pendiente se liquida con un solo movimiento; un movimiento salda a lo más un pendiente.

create type public.payment_kind as enum ('regular', 'card_payment');
create type public.payment_status as enum ('pending', 'paid', 'cancelled');
create type public.recurrence_frequency as enum ('weekly', 'monthly', 'yearly', 'every_n_days');

create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  concept text not null check (btrim(concept) <> ''),
  kind public.payment_kind not null default 'regular',
  category_id uuid references public.categories (id) on delete restrict,
  card_account_id uuid references public.accounts (id) on delete restrict,
  responsible_id uuid references public.responsible_people (id) on delete restrict,
  label_id uuid references public.reference_labels (id) on delete restrict,
  expected_cents bigint check (expected_cents > 0),
  is_estimate boolean not null default false,
  frequency public.recurrence_frequency not null,
  weekdays smallint[] check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  day_of_month smallint check (day_of_month between 1 and 31),
  month_of_year smallint check (month_of_year between 1 and 12),
  interval_days smallint check (interval_days between 1 and 366),
  start_date date not null,
  end_date date,
  -- Desde cuándo generar. Al editar o reactivar una regla pasa a hoy para no crear vencidos falsos.
  generate_from date not null,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint rules_shape check (
    (frequency = 'weekly' and cardinality(weekdays) > 0)
    or (frequency = 'monthly' and day_of_month is not null)
    or (frequency = 'yearly' and day_of_month is not null and month_of_year is not null)
    or (frequency = 'every_n_days' and interval_days is not null)
  ),
  constraint rules_card check ((kind = 'card_payment') = (card_account_id is not null)),
  constraint rules_category check (kind = 'card_payment' or category_id is not null),
  constraint rules_end check (end_date is null or end_date >= start_date)
);

create table public.payment_occurrences (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.recurrence_rules (id) on delete set null,
  -- Fecha que generó la regla; se conserva aunque se mueva el vencimiento, para no duplicar.
  origin_date date,
  due_date date not null,
  concept text not null check (btrim(concept) <> ''),
  kind public.payment_kind not null default 'regular',
  category_id uuid references public.categories (id) on delete restrict,
  card_account_id uuid references public.accounts (id) on delete restrict,
  responsible_id uuid references public.responsible_people (id) on delete restrict,
  label_id uuid references public.reference_labels (id) on delete restrict,
  expected_cents bigint check (expected_cents > 0),
  is_estimate boolean not null default false,
  status public.payment_status not null default 'pending',
  transaction_id uuid unique references public.transactions (id) on delete restrict,
  cancel_reason text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint occurrences_rule_date unique (rule_id, origin_date),
  constraint occurrences_paid check ((status = 'paid') = (transaction_id is not null)),
  constraint occurrences_card check ((kind = 'card_payment') = (card_account_id is not null)),
  constraint occurrences_category check (kind = 'card_payment' or category_id is not null)
);

create index payment_occurrences_due on public.payment_occurrences (status, due_date);

-- ---------------------------------------------------------------------------
-- Generación de vencimientos.
-- ---------------------------------------------------------------------------

create function private.last_day(p_month_start date)
returns date
language sql
immutable
set search_path = ''
as $$ select (p_month_start + interval '1 month' - interval '1 day')::date $$;

-- Fechas de una regla dentro de [p_from, p_to]. Si el día no existe en el mes, usa el último.
create function private.rule_dates(r public.recurrence_rules, p_from date, p_to date)
returns setof date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_month date;
  v_target date;
  v_day date;
  v_k int;
begin
  if p_from is null or p_to is null or p_from > p_to then
    return;
  end if;

  if r.frequency = 'weekly' then
    return query
      select g::date from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
      where extract(dow from g)::smallint = any (r.weekdays);

  elsif r.frequency = 'monthly' then
    for v_month in
      select g::date from generate_series(date_trunc('month', p_from::timestamp), p_to::timestamp, interval '1 month') g
    loop
      v_target := least(v_month + (r.day_of_month - 1), private.last_day(v_month));
      if v_target between p_from and p_to then
        return next v_target;
      end if;
    end loop;

  elsif r.frequency = 'yearly' then
    for v_month in
      select make_date(extract(year from g)::int, r.month_of_year, 1)
      from generate_series(date_trunc('year', p_from::timestamp), p_to::timestamp, interval '1 year') g
    loop
      v_target := least(v_month + (r.day_of_month - 1), private.last_day(v_month));
      if v_target between p_from and p_to then
        return next v_target;
      end if;
    end loop;

  elsif r.frequency = 'every_n_days' then
    v_k := greatest(0, ceil((p_from - r.start_date)::numeric / r.interval_days)::int);
    v_day := r.start_date + v_k * r.interval_days;
    while v_day <= p_to loop
      return next v_day;
      v_day := v_day + r.interval_days;
    end loop;
  end if;
end;
$$;

-- Crea los vencimientos de las reglas activas hasta 60 días adelante (o p_until). Idempotente.
-- Recupera fechas omitidas desde generate_from si nadie abrió la app.
create function public.generate_occurrences(p_until date default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until date := coalesce(p_until, public.family_today() + 60);
  v_n int;
begin
  -- Miembros activos, la clave de servicio (tarea programada) o una sesión directa de base de datos.
  if not (
    public.is_member()
    or nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role'
    or (nullif(current_setting('request.jwt.claims', true), '') is null and session_user <> 'authenticator')
  ) then
    raise exception 'Sin acceso.' using errcode = '42501';
  end if;

  insert into public.payment_occurrences (
    rule_id, origin_date, due_date, concept, kind, category_id, card_account_id,
    responsible_id, label_id, expected_cents, is_estimate
  )
  select r.id, d, d, r.concept, r.kind, r.category_id, r.card_account_id,
         r.responsible_id, r.label_id, r.expected_cents, r.is_estimate
  from public.recurrence_rules r
  cross join lateral private.rule_dates(
    r,
    greatest(r.start_date, r.generate_from),
    least(coalesce(r.end_date, v_until), v_until)
  ) d
  where r.active
  on conflict (rule_id, origin_date) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Vista previa de un cambio en la serie: cuántos pendientes futuros se reemplazarán.
create function public.rule_future_pending(p_rule uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.payment_occurrences
  where rule_id = p_rule and status = 'pending' and due_date >= public.family_today()
$$;

-- Aplica un cambio de la serie desde hoy: reemplaza solo pendientes futuros.
-- Conserva pagados, cancelados y vencidos.
create function public.apply_rule_change(p_rule uuid)
returns int
language plpgsql
set search_path = ''
as $$
begin
  if not public.can_write() then
    raise exception 'No tienes permiso para cambiar pagos.' using errcode = '42501';
  end if;
  delete from public.payment_occurrences
  where rule_id = p_rule and status = 'pending' and due_date >= public.family_today();
  update public.recurrence_rules
  set generate_from = greatest(start_date, public.family_today())
  where id = p_rule;
  return public.generate_occurrences();
end;
$$;

-- ---------------------------------------------------------------------------
-- Validaciones.
-- ---------------------------------------------------------------------------

create function private.validate_payment_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type public.account_type;
  v_use public.category_use;
begin
  if new.card_account_id is not null then
    select type into v_type from public.accounts where id = new.card_account_id;
    if v_type is distinct from 'credit' then
      raise exception 'El pago de tarjeta debe apuntar a una tarjeta de crédito.' using errcode = 'P0001';
    end if;
  end if;
  if new.category_id is not null then
    select use into v_use from public.categories where id = new.category_id;
    if v_use = 'income' then
      raise exception 'Elige una categoría de gasto.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger recurrence_rules_validate before insert or update on public.recurrence_rules
  for each row execute function private.validate_payment_target();
create trigger payment_occurrences_validate before insert or update on public.payment_occurrences
  for each row execute function private.validate_payment_target();

create function private.guard_occurrence_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paid' and new.status = 'cancelled' then
    raise exception 'Un pago registrado no se cancela. Primero anula o revisa su movimiento.' using errcode = 'P0001';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' and btrim(coalesce(new.cancel_reason, '')) = '' then
    new.cancel_reason := 'Cancelado';
  end if;
  return new;
end;
$$;

create trigger payment_occurrences_guard before update on public.payment_occurrences
  for each row execute function private.guard_occurrence_status();

create trigger recurrence_rules_touch before insert or update on public.recurrence_rules
  for each row execute function private.touch_audit();
create trigger payment_occurrences_touch before insert or update on public.payment_occurrences
  for each row execute function private.touch_audit();

-- Anular el movimiento que pagó un pendiente lo regresa a pendiente, en la misma operación.
create function private.reopen_payment_on_void()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_occurrences
  set status = 'pending', transaction_id = null
  where transaction_id = new.id;
  return null;
end;
$$;

create trigger transactions_reopen_payment
  after update of status on public.transactions
  for each row
  when (old.status = 'active' and new.status = 'voided')
  execute function private.reopen_payment_on_void();

-- ---------------------------------------------------------------------------
-- Registrar o vincular el pago real.
-- ---------------------------------------------------------------------------

create function public.register_payment(
  p_occurrence uuid,
  p_account uuid,
  p_amount_cents bigint,
  p_date date,
  p_concept text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  o public.payment_occurrences;
  v_tx uuid;
begin
  if not public.can_write() then
    raise exception 'No tienes permiso para registrar pagos.' using errcode = '42501';
  end if;

  -- Bloqueo: dos clics o peticiones simultáneas no crean dos movimientos.
  select * into o from public.payment_occurrences where id = p_occurrence for update;
  if not found then
    raise exception 'Pago no encontrado.' using errcode = 'P0002';
  end if;
  if o.status <> 'pending' then
    raise exception 'Este pago ya está %.', case o.status when 'paid' then 'registrado' else 'cancelado' end
      using errcode = 'P0001';
  end if;

  if o.kind = 'card_payment' then
    insert into public.transactions (kind, account_id, to_account_id, amount_cents, effective_date, concept, responsible_id, label_id)
    values ('transfer', p_account, o.card_account_id, p_amount_cents, p_date, coalesce(nullif(btrim(p_concept), ''), o.concept), o.responsible_id, o.label_id)
    returning id into v_tx;
  else
    insert into public.transactions (kind, account_id, amount_cents, effective_date, category_id, concept, responsible_id, label_id)
    values ('expense', p_account, p_amount_cents, p_date, o.category_id, coalesce(nullif(btrim(p_concept), ''), o.concept), o.responsible_id, o.label_id)
    returning id into v_tx;
  end if;

  update public.payment_occurrences set status = 'paid', transaction_id = v_tx where id = o.id;
  return v_tx;
end;
$$;

-- Usar un movimiento ya capturado en lugar de crear otro. No cambia saldos.
create function public.link_payment(p_occurrence uuid, p_transaction uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  o public.payment_occurrences;
  t public.transactions;
begin
  if not public.can_write() then
    raise exception 'No tienes permiso para registrar pagos.' using errcode = '42501';
  end if;
  select * into o from public.payment_occurrences where id = p_occurrence for update;
  if o.status <> 'pending' then
    raise exception 'Este pago ya no está pendiente.' using errcode = 'P0001';
  end if;
  select * into t from public.transactions where id = p_transaction;
  if t.id is null or t.status <> 'active' then
    raise exception 'El movimiento no existe o está anulado.' using errcode = 'P0001';
  end if;
  if o.kind = 'card_payment' and not (t.kind = 'transfer' and t.to_account_id = o.card_account_id) then
    raise exception 'Para un pago de tarjeta, vincula un traspaso hacia esa tarjeta.' using errcode = 'P0001';
  end if;
  if o.kind = 'regular' and t.kind <> 'expense' then
    raise exception 'Vincula un gasto.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payment_occurrences where transaction_id = p_transaction) then
    raise exception 'Ese movimiento ya salda otro pago.' using errcode = 'P0001';
  end if;
  update public.payment_occurrences set status = 'paid', transaction_id = p_transaction where id = o.id;
end;
$$;

-- Ampliar reasignación y conteo de referencias a los pagos.
create or replace function public.reassign_catalog(p_catalog text, p_from uuid, p_to uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_n int := 0;
  v_rows int;
begin
  if not public.can_write() then
    raise exception 'No tienes permiso para reasignar.' using errcode = '42501';
  end if;
  if p_from = p_to then
    return 0;
  end if;
  case p_catalog
    when 'institutions' then
      update public.accounts set institution_id = p_to where institution_id = p_from;
      get diagnostics v_n = row_count;
    when 'responsible_people' then
      update public.accounts set responsible_id = p_to where responsible_id = p_from;
      get diagnostics v_n = row_count;
      update public.transactions set responsible_id = p_to where responsible_id = p_from;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
      update public.recurrence_rules set responsible_id = p_to where responsible_id = p_from;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
      update public.payment_occurrences set responsible_id = p_to where responsible_id = p_from;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
    when 'categories' then
      update public.transactions set category_id = p_to where category_id = p_from;
      get diagnostics v_n = row_count;
      update public.recurrence_rules set category_id = p_to where category_id = p_from;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
      update public.payment_occurrences set category_id = p_to where category_id = p_from;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
    when 'reference_labels' then
      update public.transactions set label_id = p_to where label_id = p_from;
      get diagnostics v_n = row_count;
      update public.recurrence_rules set label_id = p_to where label_id = p_from;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
      update public.payment_occurrences set label_id = p_to where label_id = p_from;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
    else
      raise exception 'Catálogo desconocido: %', p_catalog using errcode = '22023';
  end case;
  return v_n;
end;
$$;

create or replace function public.reference_count(p_catalog text, p_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select case p_catalog
    when 'institutions' then (select count(*) from public.accounts where institution_id = p_id)
    when 'responsible_people' then
      (select count(*) from public.accounts where responsible_id = p_id)
      + (select count(*) from public.transactions where responsible_id = p_id)
      + (select count(*) from public.recurrence_rules where responsible_id = p_id)
      + (select count(*) from public.payment_occurrences where responsible_id = p_id)
    when 'categories' then
      (select count(*) from public.transactions where category_id = p_id)
      + (select count(*) from public.recurrence_rules where category_id = p_id)
      + (select count(*) from public.payment_occurrences where category_id = p_id)
    when 'reference_labels' then
      (select count(*) from public.transactions where label_id = p_id)
      + (select count(*) from public.recurrence_rules where label_id = p_id)
      + (select count(*) from public.payment_occurrences where label_id = p_id)
    when 'accounts' then
      (select count(*) from public.transactions where account_id = p_id or to_account_id = p_id)
      + (select count(*) from public.balance_reviews where account_id = p_id)
      + (select count(*) from public.recurrence_rules where card_account_id = p_id)
      + (select count(*) from public.payment_occurrences where card_account_id = p_id)
    else 0
  end::int
$$;

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------

revoke all on public.recurrence_rules, public.payment_occurrences from anon;

alter table public.recurrence_rules enable row level security;
alter table public.payment_occurrences enable row level security;

create policy recurrence_rules_select on public.recurrence_rules for select to authenticated using (public.is_member());
create policy recurrence_rules_insert on public.recurrence_rules for insert to authenticated with check (public.can_write());
create policy recurrence_rules_update on public.recurrence_rules for update to authenticated using (public.can_write()) with check (public.can_write());
create policy recurrence_rules_delete on public.recurrence_rules for delete to authenticated using (public.can_write());

create policy payment_occurrences_select on public.payment_occurrences for select to authenticated using (public.is_member());
create policy payment_occurrences_insert on public.payment_occurrences for insert to authenticated with check (public.can_write());
create policy payment_occurrences_update on public.payment_occurrences for update to authenticated using (public.can_write()) with check (public.can_write());
-- Solo se eliminan pagos sin movimiento; los pagados conservan su operación.
create policy payment_occurrences_delete on public.payment_occurrences for delete to authenticated using (public.can_write() and status <> 'paid');

revoke execute on function public.generate_occurrences(date) from public, anon;
grant execute on function public.generate_occurrences(date) to authenticated, service_role;
