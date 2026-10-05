# ELEVAPLUS Gestión

[![CI](https://github.com/Ezem98/elevaplus-gestion/actions/workflows/ci.yml/badge.svg)](https://github.com/Ezem98/elevaplus-gestion/actions/workflows/ci.yml)
[![Smoke Producción](https://github.com/Ezem98/elevaplus-gestion/actions/workflows/smoke-produccion.yml/badge.svg)](https://github.com/Ezem98/elevaplus-gestion/actions/workflows/smoke-produccion.yml)

Sistema de gestión a medida para ELEVAPLUS: servicios, alquileres, cobranzas y flota.
Diseño completo en [`docs/DISEÑO.md`](docs/DISEÑO.md).

## Stack

React 19 + TypeScript + Vite · Tailwind v4 · React Router 7 · Supabase (Postgres, Auth, Storage, RLS) · PWA.

## Puesta en marcha

### 1. Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com) (región `sa-east-1`, São Paulo).
2. SQL Editor → pegar y ejecutar `supabase/migrations/0001_esquema_inicial.sql`.
3. SQL Editor → ejecutar `supabase/seed.sql` (vehículos y parámetros del cotizador; ajustar la flota real).
4. Authentication → Providers → dejar solo **Email**. Desactivar "Confirm email" si los usuarios los crea la admin a mano.
5. Authentication → Users → crear el usuario de la administradora. Luego en SQL:
   ```sql
   update perfiles set rol = 'admin', nombre = 'Nombre' where id = '<uuid del usuario>';
   ```
6. Project Settings → API → copiar URL y anon key.

### 2. App

```bash
cp .env.example .env.local   # completar con URL y anon key
npm install
npm run dev
```

## Scripts

| Comando                    | Qué hace                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run dev`              | Servidor de desarrollo                                            |
| `npm run build`            | Build de producción en `dist/` (incluye service worker PWA)       |
| `npm test`                 | Verificación BOM + copias + tests unitarios                       |
| `npm run test:unit`        | Tests unitarios de funciones puras (vitest en `src/`)             |
| `npm run test:db`          | Tests de base de datos con pgTAP (`supabase test db`)             |
| `npm run test:integracion` | Tests de integración con cliente autenticado por rol              |
| `npm run test:e2e`         | Smoke tests end-to-end con Playwright                             |
| `npm run db:local`         | Inicia Supabase local, reinicia migraciones y aplica seed de test |
| `npm run preview`          | Sirve `dist/` para probar el build                                |

## Tests

El proyecto utiliza un entorno local efímero de Supabase para ejecutar pruebas de base de datos, integración y E2E sin tocar producción ni staging.

### 1. Levantar la base de datos local y cargar datos de prueba

Asegurate de tener Docker Desktop abierto y ejecutá:

```bash
npm run db:local
```

Este comando:

1. Inicia el stack de Supabase local (`supabase start`) en el puerto 54321 (API/PostgREST) y 54322 (PostgreSQL).
2. Aplica todas las migraciones desde cero (`supabase db reset`).
3. Ejecuta `supabase/seed-test.sql` con usuarios fijos (`admin@test.local`, `oficina@test.local`, `chofer1@test.local`, `chofer2@test.local`), clientes, flota y categorías.

### 2. Ejecutar las suites de tests

```bash
# Calidad estática y tests unitarios
npm test

# Solo unitarios
npm run test:unit

# Tests de base de datos (pgTAP dentro de PostgreSQL)
npm run test:db

# Tests de integración (vitest contra Supabase local)
npm run test:integracion

# Tests E2E (Playwright)
npm run test:e2e
```

#### Correr un archivo de pgTAP individual

Para ejecutar únicamente un archivo específico de pgTAP en lugar de toda la suite:

```bash
npx supabase test db supabase/tests/01-cobros.sql
```

Archivos disponibles en `supabase/tests/`:

- `supabase/tests/00-setup.sql` (helpers de autenticación `como_admin()`, `como_oficina()`, etc.)
- `supabase/tests/01-cobros.sql` (cobros, aplicaciones y recálculo de estados)
- `supabase/tests/02-cheques.sql` (ciclo de cheques recibidos y propios, saldos y excepciones)
- `supabase/tests/03-estados.sql` (matriz de transiciones por rol, triggers de máquinas y auditoría)
- `supabase/tests/04-saldos.sql` (saldos de cuentas, movimientos, IVA mensual y cuenta corriente)
- `supabase/tests/05-agenda-proyeccion.sql` (vista unificada de agenda con 8 ramas y `proyeccion_caja`)
- `supabase/tests/06-facturacion.sql` (unicidad, notas de crédito y crédito fiscal en `iva_mensual`)

### 3. ¿Qué hacer si `supabase start` falla por Docker?

1. **Verificar que Docker Desktop esté en ejecución**:
   - Abrí **Docker Desktop** desde el menú inicio o ejecutá `docker info` en la terminal.
   - Si muestra el error `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`, el servicio de Docker Desktop todavía está iniciando o detenido.
2. **Esperar a que el motor termine de iniciar**:
   - Aguardá unos segundos hasta que el ícono de la ballena de Docker Desktop en la barra de tareas quede quieto (verde).
3. **Reiniciar Docker Desktop si queda trabado**:
   - Hacé clic derecho en el ícono de Docker Desktop y seleccioná **Restart Docker**.
   - En PowerShell podés reiniciar el proceso con:
     ```powershell
     Stop-Process -Name "Docker Desktop" -Force
     Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
     ```
4. **Reintentar el comando**:
   ```bash
   npx supabase start
   ```

## Deploy (Railway)

El proyecto cuenta con dos servicios en Railway:

### 1. App Web (`elevaplus-gestion`)

Sitio estático (SPA React + PWA):

- Repo: `Ezem98/elevaplus-gestion` (rama `main`)
- Build command: `npm run build`
- Start command: `npx serve -s dist -l $PORT` (o servir `dist/` con cualquier estático)
- Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_VAPID_PUBLIC_KEY`
  - `VITE_WORKER_URL`: URL del worker (ej. `https://elevaplus-worker-production.up.railway.app`)
- Dominio: `https://gestion.eleva-plus.com.ar`

### 2. Worker de Procesamiento (`elevaplus-worker`)

Servicio Node.js para tareas en segundo plano (lote nocturno ARCA, generación de PDFs, envío de correos, recordatorios y sincronización con Google Calendar):

- Repo: `Ezem98/elevaplus-gestion` (rama `main`)
- Root Directory: `worker/`
- Build command: `npm run build` (o automático vía `Dockerfile` / `package.json`)
- Start command: `npm start` (ejecuta `node dist/index.js`)
- Variables de entorno:
  - `PORT`: puerto del servidor HTTP (por defecto `3000`, Railway asigna `$PORT`)
  - `NODE_ENV`: `production` o `staging`
  - `TZ`: `America/Argentina/Buenos_Aires`
  - `SUPABASE_URL`: URL del proyecto Supabase
  - `SUPABASE_SERVICE_ROLE_KEY`: Service Role Key de Supabase para acceso administrativo
  - `WORKER_SECRET`: Token aleatorio para autenticar llamadas internas y webhooks
  - `AFIPSDK_ACCESS_TOKEN`: Access token de Afip SDK
  - `ARCA_CUIT`: CUIT del emisor
  - `ARCA_CERT`: Certificado digital X.509 de ARCA
  - `ARCA_KEY`: Clave privada del certificado ARCA
  - `RESEND_API_KEY`: Clave de API de Resend
  - `RESEND_REMITENTE`: Remitente de correo (ej. `ELEVAPLUS Facturación <facturacion@eleva-plus.com.ar>`)
  - `MAIL_LISTA_BLANCA`: Lista blanca de correos autorizados en staging (opcional)
  - `PERMITIR_LOTE_HOMOLOGACION`: Solo para forzar emisión nocturna en homologación (`true`/`false`)
  - `GOOGLE_OAUTH_CLIENT_ID`: Client ID de Google OAuth para Calendar API
  - `GOOGLE_OAUTH_CLIENT_SECRET`: Client Secret de Google OAuth
  - `GOOGLE_OAUTH_REDIRECT_URI`: URI de redirección OAuth hacia el endpoint del worker (`/gcal/callback`)

## Notificaciones Push (Web Push + Supabase Edge Functions)

Para habilitar las notificaciones push en segundo plano cuando choferes inician o terminan servicios, o cargan servicios no planificados:

1. **Generar claves VAPID y configurar secrets**:

   ```bash
   npx web-push generate-vapid-keys
   ```

   - Clave pública: agregar a `.env.local` y a las variables de entorno en Railway como `VITE_VAPID_PUBLIC_KEY`.
   - Ambas claves, asunto y secret del webhook a los secrets de Supabase:
     ```bash
     npx supabase secrets set VAPID_PUBLIC_KEY="<clave_publica>" VAPID_PRIVATE_KEY="<clave_privada>" VAPID_SUBJECT="mailto:elevaplus.one@gmail.com" WEBHOOK_SECRET="<uuid_aleatorio>"
     ```

2. **Desplegar la Edge Function**:

   ```bash
   npx supabase functions deploy enviar-push --no-verify-jwt
   ```

3. **Crear los Database Webhooks en Supabase**:
   En Supabase Dashboard → **Database** → **Webhooks** → crear dos webhooks de tipo **Supabase Edge Function** apuntando a `enviar-push`:
   - **Webhook 1**: Tabla `servicio_eventos`, evento `INSERT`, con header `Authorization: Bearer <WEBHOOK_SECRET>`.
   - **Webhook 2**: Tabla `servicios`, evento `INSERT`, con header `Authorization: Bearer <WEBHOOK_SECRET>`.

4. **Rotación de `WEBHOOK_SECRET`**:
   Para rotar el secret, debe actualizarse en tres lugares sincronizados: en los secrets de la Edge Function (`npx supabase secrets set WEBHOOK_SECRET=...`), en el header `Authorization` de los dos webhooks en Supabase Dashboard, y en la variable de entorno `WEBHOOK_SECRET` del servicio `elevaplus-worker` en Railway.

## Ingreso con huella / Passkeys (Supabase Auth)

Para habilitar el inicio de sesión con huella dactilar, Face ID o llave de seguridad (WebAuthn / Passkeys):

1. En Supabase Dashboard → **Authentication** → **Passkeys** → activar **Enable Passkey authentication**.
2. Configurar los datos del Relying Party:
   - **Relying Party Display Name**: `ELEVAPLUS Gestión`
   - **Relying Party ID**: el dominio bare de la app (ej: `gestion.elevaplus.com.ar`, o `localhost` para desarrollo local). Sin scheme, puerto ni ruta.
   - **Relying Party Origins**: `https://<dominio>` y `http://localhost:5173` (separados por coma).

> **Aviso importante:** Sin esta configuración activa en Supabase, la API de WebAuthn devuelve error (`passkey_disabled`) y no permite registrar ni autenticar passkeys.

## Sincronización con Google Calendar

Para permitir la sincronización unidireccional de los compromisos de agenda (vencimientos, cheques a cobrar y cubrir, cobros diferidos y alquileres) hacia Google Calendar en el calendario `ELEVAPLUS`:

### Pasos en Google Cloud Console

1. **Crear o seleccionar proyecto**:
   - Ingresar a [Google Cloud Console](https://console.cloud.google.com/).
   - Crear un proyecto nuevo (ej. `elevaplus-gestion`) o seleccionar uno existente.
2. **Habilitar la API de Google Calendar**:
   - En **APIs y servicios** → **Biblioteca**, buscar `Google Calendar API` y hacer clic en **Habilitar**.
3. **Configurar pantalla de consentimiento de OAuth**:
   - Ir a **APIs y servicios** → **Pantalla de consentimiento de OAuth**.
   - Tipo de usuario: **Externo**.
   - Completar nombre de la app (ej. `ELEVAPLUS Gestión`), correo de asistencia y datos de contacto del desarrollador.
   - En **Permisos** (Scopes), agregar el permiso sensible: `https://www.googleapis.com/auth/calendar` y `https://www.googleapis.com/auth/userinfo.email`.
   - En **Usuarios de prueba** (Test users): dejar la app en estado **"Prueba" (Testing)** y agregar el correo de la dueña y el tuyo como usuarios de prueba autorizados. De este modo, la app funciona de inmediato sin necesidad de pasar por el proceso formal de verificación de Google.
4. **Crear credenciales de OAuth 2.0**:
   - Ir a **APIs y servicios** → **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - Nombre: `ELEVAPLUS Worker OAuth`.
   - **URIs de redirección autorizados**:
     - Producción: `https://elevaplus-worker-production.up.railway.app/gcal/callback`
     - Desarrollo local (opcional): `http://localhost:3000/gcal/callback`
   - Guardar y copiar el **ID de cliente** y el **Secreto de cliente**.

### Variables de entorno requeridas en Railway (`elevaplus-worker`)

Cargar las siguientes variables en el servicio `elevaplus-worker` en Railway antes del push / deploy:

| Variable | Valor / Ejemplo |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | `<tu_client_id>.apps.googleusercontent.com` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `<tu_client_secret>` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://elevaplus-worker-production.up.railway.app/gcal/callback` |
| `HEARTBEAT_CALENDARIO` | URL del monitor de latido en Better Stack (para cron 01:00 hs) |

## Estructura

```
src/
├── app/            # router, layouts (oficina / chofer)
├── features/       # un módulo por dominio: auth, dashboard, servicios, cotizador, chofer
├── components/ui/  # primitivos (Boton, Campo, Tarjeta, Chip)
└── lib/            # supabase, tipos, cotizador (fórmula pura + tests), formato
supabase/
├── migrations/     # SQL versionado
└── seed.sql
docs/DISEÑO.md      # decisiones, modelo, roadmap
```

## Estado

Esqueleto funcional: auth con roles y RLS, layout oficina y chofer, pantalla **Hoy**, lista de **Servicios**, **Cotizador** con desglose, pantalla del chofer con **Iniciar / Terminé** vía RPC `cambiar_estado`.

Pendiente inmediato (Fase 1): alta/edición de servicio, detalle con timeline, clientes y cuenta corriente, cobros y cheques, "Crear presupuesto" desde el cotizador, PDF y compartir por WhatsApp, importación de la planilla. Ver roadmap en el diseño.
