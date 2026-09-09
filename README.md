# ELEVAPLUS Gestión

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

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción en `dist/` (incluye service worker PWA) |
| `npm run test` | Tests (vitest) — la fórmula del cotizador |
| `npm run preview` | Sirve `dist/` para probar el build |

## Deploy (Railway)

Es un sitio estático. En Railway:
- Build command: `npm run build`
- Start command: `npx serve -s dist -l $PORT` (o servir `dist/` con cualquier estático)
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`

Dominio sugerido: `gestion.elevaplus.com.ar`.

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
