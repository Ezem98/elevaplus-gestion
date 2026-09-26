-- =============================================================================
-- ELEVAPLUS Gestión — 0019 Grants explícitos de Data API (PostgREST)
-- Requiere revisión antes de commitear.
--
-- Motivo:
-- A partir del 30 de octubre de 2026, Supabase deja de otorgar automáticamente
-- permisos en el schema public a los roles de PostgREST para tablas y vistas.
-- Sin grants explícitos, PostgREST no puede exponer los objetos (error 42501
-- permission denied) y fallan tanto la app cliente como supabase db reset y los
-- tests de integración.
--
-- Criterio de privilegios por rol:
-- 1. authenticated:
--    - SELECT, INSERT, UPDATE, DELETE en todas las tablas usadas desde el front.
--      RLS sigue siendo la defensa real que restringe según el rol (admin, oficina, chofer);
--      el grant solo habilita la exposición en PostgREST.
--    - SELECT en vistas (agenda, cuenta_corriente, iva_mensual, saldos_cuentas) y
--      tablas que el front únicamente lee (arca_log, lotes_emision).
--    - push_suscripciones requiere SELECT, INSERT, UPDATE, DELETE porque el front
--      hace upsert() y delete() para registrar y cancelar suscripciones Web Push
--      (protegida por la policy push_propias con usuario_id = auth.uid()).
-- 2. service_role:
--    - ALL en todas las tablas, vistas y secuencias (usado por el worker y edge functions).
-- 3. anon:
--    - NINGÚN grant. En este sistema no hay acceso anónimo a datos.
-- 4. Tablas exclusivas del worker (ejecuciones_worker, gcal_eventos_derivados,
--    google_calendar_conexiones): solo service_role (sin grant a authenticated ni anon).
--    google_calendar_conexiones se accede desde el front únicamente vía la RPC
--    public.tengo_google_calendar() con security definer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas usadas desde el frontend (acceso authenticated: CRUD)
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on table
  public.adjuntos,
  public.alquileres,
  public.categorias_movimiento,
  public.cheque_eventos,
  public.cheques,
  public.clientes,
  public.cobro_aplicaciones,
  public.cobros,
  public.cuentas,
  public.empresa,
  public.eventos_flota,
  public.facturas,
  public.maquinas,
  public.movimientos_caja,
  public.novedades_empleado,
  public.parametros_cotizador,
  public.perfiles,
  public.push_suscripciones,
  public.servicio_choferes,
  public.servicio_eventos,
  public.servicios,
  public.tercerizados,
  public.vehiculos,
  public.vencimiento_instancias,
  public.vencimientos
to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Tablas del worker con lectura desde el frontend (solo SELECT)
-- -----------------------------------------------------------------------------
grant select on table
  public.arca_log,
  public.lotes_emision
to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Vistas accesibles desde el frontend (solo SELECT)
-- -----------------------------------------------------------------------------
grant select on table
  public.agenda,
  public.cuenta_corriente,
  public.iva_mensual,
  public.saldos_cuentas
to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Acceso total para service_role (worker, edge functions y mantenimiento)
-- -----------------------------------------------------------------------------
grant all on table
  public.adjuntos,
  public.alquileres,
  public.arca_log,
  public.categorias_movimiento,
  public.cheque_eventos,
  public.cheques,
  public.clientes,
  public.cobro_aplicaciones,
  public.cobros,
  public.cuentas,
  public.ejecuciones_worker,
  public.empresa,
  public.eventos_flota,
  public.facturas,
  public.gcal_eventos_derivados,
  public.google_calendar_conexiones,
  public.lotes_emision,
  public.maquinas,
  public.movimientos_caja,
  public.novedades_empleado,
  public.parametros_cotizador,
  public.perfiles,
  public.push_suscripciones,
  public.servicio_choferes,
  public.servicio_eventos,
  public.servicios,
  public.tercerizados,
  public.vehiculos,
  public.vencimiento_instancias,
  public.vencimientos,
  public.agenda,
  public.cuenta_corriente,
  public.iva_mensual,
  public.saldos_cuentas
to service_role;

-- -----------------------------------------------------------------------------
-- 5. Secuencias para claves autoincrementales (arca_log, cheque_eventos, etc.)
-- -----------------------------------------------------------------------------
grant usage, select on all sequences in schema public to authenticated, service_role;

