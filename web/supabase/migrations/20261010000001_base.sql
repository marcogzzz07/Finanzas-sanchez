-- Incremento 1: accesos, roles, configuración y catálogos editables.
-- Un solo espacio familiar. Ningún nombre de banco, persona o cuenta está fijo aquí.

create schema if not exists private;

create type public.app_role as enum ('admin', 'editor', 'viewer');
create type public.category_use as enum ('income', 'expense', 'both');
create type public.label_kind as enum ('property', 'beneficiary');

-- Correo autorizado para convertirse en el primer administrador. No expuesto por la API.
create table private.bootstrap_admin (
  email text primary key
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'viewer',
  active boolean not null default false,
  email_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_settings (
  id smallint primary key default 1 check (id = 1),
  timezone text not null default 'America/Monterrey',
  currency text not null default 'MXN' check (currency = 'MXN'),
  digest_hour smallint not null default 8 check (digest_hour between 0 and 23),
  lead_days smallint not null default 3 check (lead_days between 0 and 30),
  global_recipient_id uuid references public.profiles (id) on delete set null,
  max_upload_mb smallint not null default 10 check (max_upload_mb between 1 and 50),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.family_settings default values;

-- ---------------------------------------------------------------------------
-- Funciones de acceso. Una sesión autenticada no basta: se exige perfil activo.
-- ---------------------------------------------------------------------------

create function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.active
$$;

create function public.is_member()
returns boolean
language sql
stable
set search_path = ''
as $$ select public.current_app_role() is not null $$;

create function public.can_write()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(public.current_app_role() in ('admin', 'editor'), false) $$;

create function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(public.current_app_role() = 'admin', false) $$;

create function public.family_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone (select s.timezone from public.family_settings s where s.id = 1))::date
$$;

-- Marca de auditoría común: quién y cuándo creó o cambió un registro.
-- Solo toca las columnas que la tabla tenga; created_* no se puede alterar.
create function private.touch_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_set jsonb := '{}'::jsonb;
begin
  if v_row ? 'created_at' then
    v_set := v_set || jsonb_build_object('created_at',
      case when tg_op = 'INSERT' then to_jsonb(now()) else to_jsonb(old) -> 'created_at' end);
  end if;
  if v_row ? 'created_by' then
    v_set := v_set || jsonb_build_object('created_by',
      case when tg_op = 'INSERT' then to_jsonb(auth.uid()) else to_jsonb(old) -> 'created_by' end);
  end if;
  if v_row ? 'updated_at' then
    v_set := v_set || jsonb_build_object('updated_at', now());
  end if;
  if v_row ? 'updated_by' then
    v_set := v_set || jsonb_build_object('updated_by', auth.uid());
  end if;
  return jsonb_populate_record(new, v_set);
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfiles: alta automática, último administrador protegido.
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bootstrap boolean;
begin
  v_bootstrap :=
    exists (select 1 from private.bootstrap_admin b where lower(b.email) = lower(new.email))
    and not exists (select 1 from public.profiles p where p.role = 'admin' and p.active);

  insert into public.profiles (id, full_name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when v_bootstrap then 'admin'::public.app_role else 'viewer'::public.app_role end,
    v_bootstrap
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.guard_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active)
     and not exists (
       select 1 from public.profiles p
       where p.id <> old.id and p.role = 'admin' and p.active
     ) then
    raise exception 'No se puede quitar el último administrador activo.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger profiles_guard_last_admin
  before update or delete on public.profiles
  for each row execute function private.guard_last_admin();

create trigger profiles_touch
  before update on public.profiles
  for each row execute function private.touch_audit();

-- Administración de accesos (solo administrador).

create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role public.app_role,
  active boolean,
  email_opt_in boolean,
  email_confirmed boolean,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los accesos.' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.full_name, p.role, p.active, p.email_opt_in,
           u.email_confirmed_at is not null, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.full_name, u.email;
end;
$$;

create function public.admin_set_access(p_user uuid, p_role public.app_role, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar accesos.' using errcode = '42501';
  end if;
  update public.profiles set role = p_role, active = p_active where id = p_user;
  if not found then
    raise exception 'Usuario no encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

create function public.admin_set_name(p_user uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede editar otros usuarios.' using errcode = '42501';
  end if;
  update public.profiles set full_name = btrim(p_full_name) where id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogos editables.
-- ---------------------------------------------------------------------------

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index institutions_active_name on public.institutions (lower(btrim(name))) where not archived;

create table public.responsible_people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  user_id uuid unique references public.profiles (id) on delete set null,
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index responsible_people_active_name on public.responsible_people (lower(btrim(name))) where not archived;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  use public.category_use not null,
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categories_active_name on public.categories (lower(btrim(name))) where not archived;

create table public.reference_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  kind public.label_kind not null,
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index reference_labels_active_name on public.reference_labels (kind, lower(btrim(name))) where not archived;

create trigger institutions_touch before insert or update on public.institutions
  for each row execute function private.touch_audit();
create trigger responsible_people_touch before insert or update on public.responsible_people
  for each row execute function private.touch_audit();
create trigger categories_touch before insert or update on public.categories
  for each row execute function private.touch_audit();
create trigger reference_labels_touch before insert or update on public.reference_labels
  for each row execute function private.touch_audit();

-- ---------------------------------------------------------------------------
-- Permisos y RLS.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on schema private from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.family_settings enable row level security;
alter table public.institutions enable row level security;
alter table public.responsible_people enable row level security;
alter table public.categories enable row level security;
alter table public.reference_labels enable row level security;

-- Perfiles: cada quien edita solo su nombre y su preferencia de correo.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, email_opt_in) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated using (public.is_member());
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and public.is_member())
  with check (id = (select auth.uid()));

-- Configuración global: lectura para miembros, edición solo administrador.
revoke insert, delete on public.family_settings from authenticated;
create policy family_settings_select on public.family_settings
  for select to authenticated using (public.is_member());
create policy family_settings_update on public.family_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger family_settings_touch before update on public.family_settings
  for each row execute function private.touch_audit();

-- Catálogos operativos: lectura para miembros, edición para administrador y editor.
do $$
declare
  t text;
begin
  foreach t in array array['institutions', 'responsible_people', 'categories', 'reference_labels'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.can_write())', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.can_write())', t);
  end loop;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_set_access(uuid, public.app_role, boolean) from public, anon;
revoke execute on function public.admin_set_name(uuid, text) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_access(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.admin_set_name(uuid, text) to authenticated;
