-- Incremento 2: cuentas, movimientos, saldos y cambio de tipo.
-- Importes en centavos, siempre positivos; el tipo de operación decide el efecto.
-- Los comportamientos dependen del tipo de cuenta, nunca de su nombre.

create type public.account_type as enum ('bank', 'debit', 'credit', 'cash', 'investment');
create type public.tx_kind as enum ('income', 'expense', 'transfer', 'refund');
create type public.tx_status as enum ('active', 'voided');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  institution_id uuid references public.institutions (id) on delete restrict,
  type public.account_type not null,
  responsible_id uuid references public.responsible_people (id) on delete restrict,
  holder text,
  -- Sin fecha ni saldo de arranque hasta capturarlos o cargar el primer estado de cuenta.
  start_date date,
  -- Cuentas con fondos: dinero. Tarjeta de crédito: deuda (negativo = saldo a favor).
  opening_balance_cents bigint,
  available_for_payments boolean not null default false,
  archived boolean not null default false,
  statement_mode text not null default 'review' check (statement_mode in ('review', 'auto')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint accounts_opening_pair check ((start_date is null) = (opening_balance_cents is null)),
  constraint accounts_credit_not_available check (not (type = 'credit' and available_for_payments))
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  kind public.tx_kind not null,
  account_id uuid not null references public.accounts (id) on delete restrict,
  to_account_id uuid references public.accounts (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  effective_date date not null,
  category_id uuid references public.categories (id) on delete restrict,
  concept text not null check (btrim(concept) <> ''),
  detail text,
  responsible_id uuid references public.responsible_people (id) on delete restrict,
  label_id uuid references public.reference_labels (id) on delete restrict,
  notes text,
  status public.tx_status not null default 'active',
  void_reason text,
  voided_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint transactions_transfer_target check (
    (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id)
    or (kind <> 'transfer' and to_account_id is null)
  ),
  constraint transactions_category check (kind = 'transfer' or category_id is not null),
  constraint transactions_void check (
    (status = 'voided' and btrim(coalesce(void_reason, '')) <> '')
    or (status = 'active')
  )
);

create index transactions_account_date on public.transactions (account_id, effective_date);
create index transactions_to_account_date on public.transactions (to_account_id, effective_date) where to_account_id is not null;
create index transactions_date on public.transactions (effective_date);

create table public.balance_reviews (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete restrict,
  cutoff_date date not null,
  declared_cents bigint not null,
  recorded_cents bigint not null,
  note text,
  stale boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index balance_reviews_account on public.balance_reviews (account_id, cutoff_date);

-- ---------------------------------------------------------------------------
-- Reglas por tipo de cuenta.
-- ---------------------------------------------------------------------------

-- Efecto de un movimiento sobre una cuenta, en sus unidades naturales:
-- fondos para cuentas con dinero, deuda para tarjeta de crédito.
create function public.tx_delta(
  p_kind public.tx_kind,
  p_amount bigint,
  p_type public.account_type,
  p_is_destination boolean
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type = 'credit' then
      case
        when p_is_destination then -p_amount            -- pago a la tarjeta reduce deuda
        when p_kind = 'expense' then p_amount           -- cargo aumenta deuda
        when p_kind = 'refund' then -p_amount           -- devolución reduce deuda
        else 0
      end
    else
      case
        when p_is_destination then p_amount
        when p_kind in ('income', 'refund') then p_amount
        else -p_amount                                  -- gasto o traspaso de salida
      end
  end
$$;

-- ¿Es válido este movimiento para una cuenta de este tipo?
create function public.tx_allowed(
  p_kind public.tx_kind,
  p_type public.account_type,
  p_is_destination boolean
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type <> 'credit' then true
    when p_is_destination then p_kind = 'transfer'
    else p_kind in ('expense', 'refund')                -- sin ingresos ni traspasos desde tarjeta
  end
$$;

create function private.validate_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from public.accounts;
  v_to public.accounts;
  v_cat public.categories;
begin
  if tg_op = 'UPDATE' and old.status = 'voided' then
    -- Un movimiento anulado no cambia; solo se permite reasignar catálogos.
    if (to_jsonb(new) - array['category_id', 'label_id', 'responsible_id', 'updated_at', 'updated_by'])
       is distinct from (to_jsonb(old) - array['category_id', 'label_id', 'responsible_id', 'updated_at', 'updated_by']) then
      raise exception 'Un movimiento anulado no se puede modificar.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  select * into v_from from public.accounts where id = new.account_id;
  if new.to_account_id is not null then
    select * into v_to from public.accounts where id = new.to_account_id;
  end if;

  if tg_op = 'INSERT' or new.account_id is distinct from old.account_id then
    if v_from.archived then
      raise exception 'La cuenta "%" está archivada.', v_from.name using errcode = 'P0001';
    end if;
  end if;
  if new.to_account_id is not null
     and (tg_op = 'INSERT' or new.to_account_id is distinct from old.to_account_id)
     and v_to.archived then
    raise exception 'La cuenta "%" está archivada.', v_to.name using errcode = 'P0001';
  end if;

  if not public.tx_allowed(new.kind, v_from.type, false) then
    raise exception 'Esta operación no se admite en "%" (%).', v_from.name, v_from.type
      using errcode = 'P0001',
            hint = 'En tarjeta de crédito usa gasto, devolución o un traspaso hacia la tarjeta.';
  end if;
  if new.to_account_id is not null and not public.tx_allowed(new.kind, v_to.type, true) then
    raise exception 'Esta operación no se admite en "%".', v_to.name using errcode = 'P0001';
  end if;

  if new.category_id is not null then
    select * into v_cat from public.categories where id = new.category_id;
    if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) and v_cat.archived then
      raise exception 'La categoría "%" está archivada.', v_cat.name using errcode = 'P0001';
    end if;
    if new.kind = 'income' and v_cat.use = 'expense'
       or new.kind in ('expense', 'refund') and v_cat.use = 'income' then
      raise exception 'La categoría "%" no corresponde a este tipo de operación.', v_cat.name
        using errcode = 'P0001';
    end if;
  end if;
  if new.kind = 'transfer' then
    new.category_id := null;
  end if;

  if new.status = 'active' then
    if v_from.start_date is not null and new.effective_date < v_from.start_date then
      raise exception 'La fecha es anterior al inicio del registro de "%" (%).', v_from.name, v_from.start_date
        using errcode = 'P0001';
    end if;
    if v_to.start_date is not null and new.effective_date < v_to.start_date then
      raise exception 'La fecha es anterior al inicio del registro de "%" (%).', v_to.name, v_to.start_date
        using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'voided' then
    new.voided_at := now();
    new.voided_by := auth.uid();
  end if;

  return new;
end;
$$;

create trigger transactions_validate
  before insert or update on public.transactions
  for each row execute function private.validate_transaction();

create trigger transactions_touch
  before insert or update on public.transactions
  for each row execute function private.touch_audit();

-- Cambios que afectan saldos dejan desactualizadas las revisiones posteriores.
create function private.mark_reviews_stale_from_tx()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.balance_reviews r
  set stale = true
  where not r.stale
    and (
      (tg_op <> 'INSERT' and r.account_id in (old.account_id, old.to_account_id) and r.cutoff_date >= old.effective_date)
      or (tg_op <> 'DELETE' and r.account_id in (new.account_id, new.to_account_id) and r.cutoff_date >= new.effective_date)
    );
  return null;
end;
$$;

create trigger transactions_stale_reviews
  after insert or update of kind, account_id, to_account_id, amount_cents, effective_date, status
  on public.transactions
  for each row execute function private.mark_reviews_stale_from_tx();

-- Cuentas: tipo compatible con su historial y fecha de inicio sin dejar movimientos fuera.
create function private.validate_account()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
  v_first date;
begin
  if new.type = 'credit' then
    new.available_for_payments := false;
  end if;

  if tg_op = 'UPDATE' and new.type is distinct from old.type then
    select count(*) into v_count
    from public.transactions t
    where t.status = 'active'
      and (
        (t.account_id = new.id and not public.tx_allowed(t.kind, new.type, false))
        or (t.to_account_id = new.id and not public.tx_allowed(t.kind, new.type, true))
      );
    if v_count > 0 then
      raise exception 'Hay % movimiento(s) que no son compatibles con el nuevo tipo. Corrígelos o anúlalos antes de cambiarlo.', v_count
        using errcode = 'P0001';
    end if;
  end if;

  if new.start_date is not null
     and (tg_op = 'INSERT' or new.start_date is distinct from old.start_date) then
    select min(t.effective_date) into v_first
    from public.transactions t
    where t.status = 'active' and (t.account_id = new.id or t.to_account_id = new.id);
    if v_first is not null and v_first < new.start_date then
      raise exception 'Hay movimientos desde el % que quedarían antes de la nueva fecha de inicio.', v_first
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger accounts_validate
  before insert or update on public.accounts
  for each row execute function private.validate_account();

create trigger accounts_touch
  before insert or update on public.accounts
  for each row execute function private.touch_audit();

create function private.mark_reviews_stale_from_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.balance_reviews
  set stale = true
  where account_id = new.id and not stale;
  return null;
end;
$$;

create trigger accounts_stale_reviews
  after update of type, start_date, opening_balance_cents on public.accounts
  for each row
  when (old.type is distinct from new.type
        or old.start_date is distinct from new.start_date
        or old.opening_balance_cents is distinct from new.opening_balance_cents)
  execute function private.mark_reviews_stale_from_account();

create trigger balance_reviews_touch
  before insert or update on public.balance_reviews
  for each row execute function private.touch_audit();

-- ---------------------------------------------------------------------------
-- Saldos calculados (no hay un segundo saldo editable).
-- ---------------------------------------------------------------------------

create function public.account_balance(p_account uuid, p_as_of date default null)
returns bigint
language sql
stable
set search_path = ''
as $$
  with a as (
    select * from public.accounts where id = p_account
  ),
  d as (
    select public.tx_delta(t.kind, t.amount_cents, a.type, false) as delta, t.effective_date
    from public.transactions t, a
    where t.account_id = a.id and t.status = 'active'
    union all
    select public.tx_delta(t.kind, t.amount_cents, a.type, true), t.effective_date
    from public.transactions t, a
    where t.to_account_id = a.id and t.status = 'active'
  )
  select coalesce((select opening_balance_cents from a), 0)
       + coalesce((select sum(d.delta) from d
                   where d.effective_date <= coalesce(p_as_of, public.family_today())), 0)::bigint
$$;

create function public.account_balances(p_as_of date default null)
returns table (
  account_id uuid,
  name text,
  type public.account_type,
  institution_id uuid,
  institution_name text,
  responsible_id uuid,
  responsible_name text,
  available_for_payments boolean,
  archived boolean,
  has_opening boolean,
  start_date date,
  balance_cents bigint
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.name, a.type, a.institution_id, i.name, a.responsible_id, r.name,
         a.available_for_payments, a.archived, a.start_date is not null, a.start_date,
         public.account_balance(a.id, p_as_of)
  from public.accounts a
  left join public.institutions i on i.id = a.institution_id
  left join public.responsible_people r on r.id = a.responsible_id
  order by a.archived, a.name
$$;

-- Ingresos y gastos del mes: sin traspasos ni anulados; devoluciones restan gasto.
create function public.month_summary(p_month date default null)
returns table (income_cents bigint, expense_cents bigint)
language sql
stable
set search_path = ''
as $$
  with m as (
    select date_trunc('month', coalesce(p_month, public.family_today()))::date as first_day
  )
  select
    coalesce(sum(t.amount_cents) filter (where t.kind = 'income'), 0)::bigint,
    (coalesce(sum(t.amount_cents) filter (where t.kind = 'expense'), 0)
     - coalesce(sum(t.amount_cents) filter (where t.kind = 'refund'), 0))::bigint
  from public.transactions t, m
  where t.status = 'active'
    and t.effective_date >= m.first_day
    and t.effective_date < (m.first_day + interval '1 month')::date
$$;

-- ---------------------------------------------------------------------------
-- Cambio de tipo guiado: vista previa y aplicación atómica.
-- ---------------------------------------------------------------------------

create function public.preview_account_type_change(p_account uuid, p_new_type public.account_type)
returns table (
  incompatible_tx_id uuid,
  kind public.tx_kind,
  effective_date date,
  concept text,
  amount_cents bigint,
  current_balance_cents bigint,
  new_balance_cents bigint
)
language sql
stable
set search_path = ''
as $$
  with a as (select * from public.accounts where id = p_account),
  nb as (
    select coalesce((select opening_balance_cents from a), 0) + coalesce(sum(
      case when t.to_account_id = p_account
           then public.tx_delta(t.kind, t.amount_cents, p_new_type, true)
           else public.tx_delta(t.kind, t.amount_cents, p_new_type, false) end
    ), 0)::bigint as v
    from public.transactions t
    where t.status = 'active'
      and (t.account_id = p_account or t.to_account_id = p_account)
      and t.effective_date <= public.family_today()
      and public.tx_allowed(t.kind, p_new_type, t.to_account_id = p_account)
  ),
  bad as (
    select t.* from public.transactions t
    where t.status = 'active'
      and (
        (t.account_id = p_account and not public.tx_allowed(t.kind, p_new_type, false))
        or (t.to_account_id = p_account and not public.tx_allowed(t.kind, p_new_type, true))
      )
  )
  select bad.id, bad.kind, bad.effective_date, bad.concept, bad.amount_cents,
         public.account_balance(p_account), nb.v
  from nb left join bad on true
$$;

create function public.change_account_type(
  p_account uuid,
  p_new_type public.account_type,
  p_opening_cents bigint,
  p_void_tx_ids uuid[] default '{}',
  p_void_reason text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.can_write() then
    raise exception 'No tienes permiso para cambiar cuentas.' using errcode = '42501';
  end if;

  if coalesce(array_length(p_void_tx_ids, 1), 0) > 0 then
    if btrim(coalesce(p_void_reason, '')) = '' then
      raise exception 'Escribe el motivo para anular los movimientos.' using errcode = 'P0001';
    end if;
    update public.transactions
    set status = 'voided', void_reason = p_void_reason
    where id = any (p_void_tx_ids)
      and status = 'active'
      and (account_id = p_account or to_account_id = p_account);
  end if;

  update public.accounts
  set type = p_new_type,
      opening_balance_cents = case when start_date is null then null else p_opening_cents end,
      available_for_payments = case when p_new_type = 'credit' then false else available_for_payments end
  where id = p_account;
  if not found then
    raise exception 'Cuenta no encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

-- Reasignar referencias de un catálogo antes de retirarlo.
create function public.reassign_catalog(p_catalog text, p_from uuid, p_to uuid)
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
      get diagnostics v_rows = row_count;
      v_n := v_n + v_rows;
    when 'categories' then
      update public.transactions set category_id = p_to where category_id = p_from;
      get diagnostics v_n = row_count;
    when 'reference_labels' then
      update public.transactions set label_id = p_to where label_id = p_from;
      get diagnostics v_n = row_count;
    else
      raise exception 'Catálogo desconocido: %', p_catalog using errcode = '22023';
  end case;
  return v_n;
end;
$$;

-- Cuántos registros usan un elemento de catálogo o una cuenta (para explicar el efecto de retirarlo).
create function public.reference_count(p_catalog text, p_id uuid)
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
    when 'categories' then (select count(*) from public.transactions where category_id = p_id)
    when 'reference_labels' then (select count(*) from public.transactions where label_id = p_id)
    when 'accounts' then
      (select count(*) from public.transactions where account_id = p_id or to_account_id = p_id)
      + (select count(*) from public.balance_reviews where account_id = p_id)
    else 0
  end::int
$$;

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------

revoke all on public.accounts, public.transactions, public.balance_reviews from anon;
revoke delete on public.transactions, public.balance_reviews from authenticated;

alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.balance_reviews enable row level security;

create policy accounts_select on public.accounts for select to authenticated using (public.is_member());
create policy accounts_insert on public.accounts for insert to authenticated with check (public.can_write());
create policy accounts_update on public.accounts for update to authenticated using (public.can_write()) with check (public.can_write());
create policy accounts_delete on public.accounts for delete to authenticated using (public.can_write());

create policy transactions_select on public.transactions for select to authenticated using (public.is_member());
create policy transactions_insert on public.transactions for insert to authenticated with check (public.can_write());
create policy transactions_update on public.transactions for update to authenticated using (public.can_write()) with check (public.can_write());

create policy balance_reviews_select on public.balance_reviews for select to authenticated using (public.is_member());
create policy balance_reviews_insert on public.balance_reviews for insert to authenticated with check (public.can_write());
create policy balance_reviews_update on public.balance_reviews for update to authenticated using (public.can_write()) with check (public.can_write());
