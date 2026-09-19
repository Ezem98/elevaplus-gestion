-- 20260918000017_ejecuciones_worker.sql
-- Tabla de control de ejecuciones para idempotencia de tareas programadas del worker.
-- Requiere revisión antes de commitear.

create table if not exists ejecuciones_worker (
  id bigserial primary key,
  tarea text not null,
  clave text not null,              -- 'recordatorio-hoy:2026-09-18', 'resumen-semanal:2026-09-21'
  ejecutado_at timestamptz not null default now(),
  resultado jsonb,
  unique (tarea, clave)
);

alter table ejecuciones_worker enable row level security;

-- Sin policies: intencionalmente restrictivo, sin lectura ni escritura desde la app (ni siquiera rol admin).
-- Solo el worker mediante service role lee y registra ejecuciones técnicas de idempotencia.
