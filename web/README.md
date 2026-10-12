# Finanzas familiares — app web

Implementación del MVP descrito en `../product-spec-finanzas-familiares.md`. Next.js 16 + TypeScript, Supabase (Auth, Postgres con RLS) y despliegue en Vercel.

## Estado

| Incremento | Estado |
| --- | --- |
| 1. Base: Auth, roles, accesos, catálogos editables, RLS | Hecho. Probado en base local. |
| 2. Dinero: cuentas, movimientos, traspasos, devoluciones, saldos, cambio de tipo | Hecho. Probado en base local. |
| 3. Pagos pendientes y recurrentes, agenda y calendario mensual | Hecho. Reglas probadas en base local; migración aplicada en Supabase. |
| 4. Documentos privados y revisión de saldo | Hecho. Probado en base local; bucket privado creado en Supabase. |
| 5. Bandeja de estados de cuenta con lectura automática | Pendiente |
| 6. Avisos por correo y puesta en uso | Pendiente |

Conectado al proyecto de Supabase `Finanzas-sanchez` (migraciones aplicadas). No desplegado en Vercel todavía. Las reglas de base de datos están probadas en Postgres local.

Diseño tipo dashboard con sidebar verde plegable (referencia enviada por Marco el 11 oct 2026).

## Estructura

- `supabase/migrations/`: esquema, reglas de dinero, permisos (RLS) y ejemplos iniciales editables.
- `src/app/(auth)`: entrar, recuperar contraseña, crear contraseña desde invitación.
- `src/app/(app)`: Inicio, Movimientos, Pagos, Calendario, Cuentas, Documentos y Configuración; Bandeja como próximo incremento.
- `src/lib/money.ts`: dinero en centavos enteros, sin punto flotante.
- `tests/db/`: pruebas de reglas de dinero, flexibilidad y acceso contra un Postgres local que imita a Supabase.

Reglas clave en la base (no solo en la interfaz):

- Saldos calculados desde saldo inicial + movimientos; no hay un saldo editable aparte.
- El efecto de cada movimiento depende del tipo de cuenta (`tx_delta`, `tx_allowed`), nunca del nombre.
- Movimientos anulados con motivo, nunca borrados. Auditoría de quién creó y cambió.
- Una cuenta puede existir sin saldo de arranque: queda "Saldo por confirmar" y no suma a la liquidez.
- Consulta no puede escribir aunque llame directo a la API. Desactivar a alguien corta su acceso de inmediato. No se puede quitar el último administrador.

## Pruebas

Requieren un Postgres local (cada archivo crea y borra una base temporal):

```bash
npm test
```

## Configurar Supabase (una sola vez)

1. Crear un proyecto nuevo de Supabase dedicado a esta app.
2. Aplicar las migraciones de `supabase/migrations/` en orden (Supabase CLI `supabase db push`, o el editor SQL).
3. En **Authentication → Sign In / Providers**, desactivar "Allow new users to sign up". Solo se entra por invitación.
4. Autorizar el correo del primer administrador (en el editor SQL):

   ```sql
   insert into private.bootstrap_admin (email) values ('correo-del-administrador@ejemplo.com');
   ```

   Después, crear ese usuario en **Authentication → Users → Add user** con contraseña. Al crearse queda como administrador activo. A partir de ahí, todas las invitaciones y roles se manejan desde Configuración en la app.
5. En **Authentication → URL Configuration**, poner la URL del sitio y agregar `https://TU-DOMINIO/auth/confirm` a las Redirect URLs.
6. En **Authentication → Emails**, cambiar el enlace de las plantillas:
   - Invite user: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/actualizar-contrasena`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/actualizar-contrasena`
7. Configurar SMTP propio para los correos de Auth antes del uso real (el de Supabase tiene límites bajos).

## Correr localmente

```bash
cp .env.example .env.local
```

Llenar `.env.local` con la URL y las claves del proyecto, y luego:

```bash
npm run dev
```

## Desplegar en Vercel

1. Importar el repositorio con `web/` como Root Directory.
2. Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`.
3. Las previews no deben apuntar a los datos reales: usar un proyecto de Supabase de prueba para el entorno Preview.

## Supuestos marcados

- Los ejemplos iniciales (Banorte, Banorte crédito, Bancrea, Efectivo; Alicia, Ana, Adriana; categorías) son filas editables, no valores en el código.
- Las cuentas empiezan sin fecha ni saldo de arranque; se completan con el primer estado de cuenta (incremento 5) o a mano.
- Roles y usuarios finales pendientes de confirmar con la familia.

## Nota: carpeta sincronizada con iCloud

El proyecto vive en el Escritorio, que iCloud sincroniza. Si iCloud saca archivos del disco, `next dev` se queda esperando. Por eso `node_modules` y `.next` son enlaces a `node_modules.nosync` y `.next.nosync` (iCloud ignora lo que termina en `.nosync`). Para reinstalar:

```bash
rm -rf node_modules node_modules.nosync && mkdir node_modules.nosync && npm install && mv node_modules/* node_modules/.[!.]* node_modules.nosync/ 2>/dev/null; rmdir node_modules; ln -s node_modules.nosync node_modules
```
