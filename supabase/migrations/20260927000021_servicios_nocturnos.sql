-- =============================================================================
-- ELEVAPLUS Gestión — 0021 Servicios nocturnos y recargo horario
-- Requiere revisión antes de commitear.
--
-- Agrega:
-- 1. Columna nocturno en servicios para marcar servicios en franja nocturna.
-- 2. Parámetros de recargo nocturno y franja horaria en parametros_cotizador.
-- =============================================================================

-- 1. Campo en servicios
alter table public.servicios
  add column if not exists nocturno boolean not null default false;

-- 2. Parámetros en cotizador
alter table public.parametros_cotizador
  add column if not exists recargo_nocturno_pct numeric(5,2),
  add column if not exists nocturno_desde time default '20:00',
  add column if not exists nocturno_hasta time default '06:00';

-- Grants explícitos de PostgREST / Supabase
grant select, insert, update, delete on table
  public.servicios,
  public.parametros_cotizador
to authenticated, service_role;
