-- Ejemplos iniciales editables desde la aplicación. No son valores fijos:
-- la familia puede renombrarlos, cambiarlos, archivarlos o eliminarlos.
-- Las cuentas empiezan sin saldo ni fecha de arranque.

insert into public.institutions (name) values ('Banorte'), ('Bancrea');

insert into public.responsible_people (name) values ('Alicia'), ('Ana'), ('Adriana');

insert into public.categories (name, use) values
  ('Rentas', 'income'),
  ('Ingresos bancarios', 'income'),
  ('Otros ingresos', 'income'),
  ('Salud', 'expense'),
  ('Enfermería', 'expense'),
  ('Servicios', 'expense'),
  ('Predial', 'expense'),
  ('Otros gastos', 'expense');

insert into public.reference_labels (name, kind) values ('Abuela', 'beneficiary');

insert into public.accounts (name, institution_id, type, responsible_id, available_for_payments)
select 'Banorte', i.id, 'bank', r.id, true
from public.institutions i, public.responsible_people r
where i.name = 'Banorte' and r.name = 'Alicia';

insert into public.accounts (name, institution_id, type, responsible_id, available_for_payments)
select 'Banorte crédito', i.id, 'credit', r.id, false
from public.institutions i, public.responsible_people r
where i.name = 'Banorte' and r.name = 'Alicia';

insert into public.accounts (name, institution_id, type, responsible_id, available_for_payments)
select 'Bancrea', i.id, 'investment', r.id, false
from public.institutions i, public.responsible_people r
where i.name = 'Bancrea' and r.name = 'Ana';

insert into public.accounts (name, institution_id, type, responsible_id, available_for_payments)
select 'Efectivo', null, 'cash', r.id, true
from public.responsible_people r
where r.name = 'Ana';
