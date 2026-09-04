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
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Dominio sugerido: `gestion.elevaplus.com.ar`.

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
