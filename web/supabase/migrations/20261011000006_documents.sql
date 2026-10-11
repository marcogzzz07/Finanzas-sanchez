-- Incremento 4: documentos privados y revisión de saldo con evidencia.
-- Subir un documento no crea movimientos ni cambia saldos.

create type public.document_kind as enum ('statement', 'receipt', 'other');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  kind public.document_kind not null,
  -- Ruta en el bucket privado; no es una URL pública.
  storage_path text not null unique,
  file_name text not null check (btrim(file_name) <> ''),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0),
  account_id uuid references public.accounts (id) on delete restrict,
  transaction_id uuid references public.transactions (id) on delete restrict,
  period_start date,
  period_end date,
  cutoff_date date,
  notes text,
  -- Retirado: ya no aparece en listas, pero se conserva si respalda algo.
  archived boolean not null default false,
  replaces_id uuid references public.documents (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint documents_period check (period_end is null or period_start is null or period_end >= period_start)
);

create index documents_account on public.documents (account_id, cutoff_date);
create index documents_transaction on public.documents (transaction_id);

alter table public.balance_reviews
  add column document_id uuid references public.documents (id) on delete restrict;

create trigger documents_touch before insert or update on public.documents
  for each row execute function private.touch_audit();

-- Corregir una revisión de saldo recalcula el saldo registrado y la deja vigente.
create function private.refresh_balance_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.cutoff_date is distinct from old.cutoff_date
     or new.declared_cents is distinct from old.declared_cents
     or new.account_id is distinct from old.account_id then
    new.recorded_cents := public.account_balance(new.account_id, new.cutoff_date);
    new.stale := false;
  end if;
  return new;
end;
$$;

create trigger balance_reviews_refresh before insert or update on public.balance_reviews
  for each row execute function private.refresh_balance_review();

-- ---------------------------------------------------------------------------
-- RLS de la tabla y del bucket privado.
-- ---------------------------------------------------------------------------

revoke all on public.documents from anon;
alter table public.documents enable row level security;

create policy documents_select on public.documents for select to authenticated using (public.is_member());
create policy documents_insert on public.documents for insert to authenticated with check (public.can_write());
create policy documents_update on public.documents for update to authenticated using (public.can_write()) with check (public.can_write());
create policy documents_delete on public.documents for delete to authenticated using (public.can_write());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy documents_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_member());
create policy documents_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_write());
create policy documents_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can_write());

-- Conteo de vínculos de documentos para retirar o eliminar con explicación.
create function public.document_links(p_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select ((select count(*) from public.balance_reviews where document_id = p_id)
        + (select count(*) from public.documents where id = p_id and transaction_id is not null))::int
$$;
