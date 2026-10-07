-- =============================================================================
-- ELEVAPLUS Gestión — 0036 Revocar permisos EXECUTE a public y anon en funciones security definer
--
-- Motivo:
-- Cierra hallazgo de seguridad confirmado: funciones security definer en el schema
-- public tenían permisos EXECUTE otorgados por defecto al pseudo-rol PUBLIC (y por ende anon).
-- En particular, public.cambiar_estado consideraba auth.uid() is null como service_role,
-- lo que permitía a clientes sin autenticar (rol anon de PostgREST) modificar cualquier
-- servicio arbitrariamente.
--
-- Medidas:
-- 1. Reemplazar public.cambiar_estado con detección robusta de service_role:
--    coalesce(auth.jwt() ->> 'role', '') = 'service_role' or (auth.jwt() is null and auth.uid() is null)
-- 2. Revocar EXECUTE de public y anon en todas las funciones security definer de public.
-- 3. Otorgar EXECUTE a authenticated y service_role únicamente en las funciones que
--    la aplicación necesita invocar.
-- 4. Para funciones trigger (returns trigger): revocar de public, anon y authenticated.
-- 5. Para funciones internas o exclusivas de worker: otorgar solo a service_role.
-- 6. Configurar alter default privileges para que funciones futuras creadas por el rol
--    postgres en schema public no expongan EXECUTE a public ni anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reemplazo de public.cambiar_estado con detección segura de service_role
-- -----------------------------------------------------------------------------
create or replace function public.cambiar_estado(
  p_servicio_id uuid,
  p_nuevo estado_servicio,
  p_nota text default null
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  s servicios%rowtype;
  anterior estado_servicio;
  rol rol_usuario := mi_rol();
  es_service_role boolean := (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or (auth.jwt() is null and auth.uid() is null));
  permitido boolean := false;
  es_chofer_asignado boolean;
begin
  select * into s from servicios where id = p_servicio_id for update;
  if not found then raise exception 'Servicio no encontrado'; end if;
  anterior := s.estado;

  select exists (select 1 from servicio_choferes where servicio_id = s.id and chofer_id = auth.uid())
    into es_chofer_asignado;

  -- Transiciones válidas
  if es_service_role then
    permitido := true;
  elsif p_nuevo = 'cancelado' then
    permitido := rol in ('admin','oficina');
  elsif s.estado = 'consulta' and p_nuevo = 'presupuestado' then permitido := rol in ('admin','oficina');
  elsif s.estado = 'presupuestado' and p_nuevo = 'aceptado' then permitido := rol in ('admin','oficina');
  elsif s.estado in ('aceptado','consulta','presupuestado') and p_nuevo = 'programado' then permitido := rol in ('admin','oficina');
  elsif s.estado = 'programado' and p_nuevo = 'en_curso' then permitido := rol in ('admin','oficina') or es_chofer_asignado;
  elsif s.estado in ('programado','en_curso') and p_nuevo = 'terminado' then permitido := rol in ('admin','oficina') or es_chofer_asignado;
  elsif s.estado in ('terminado','cobrado') and p_nuevo = 'facturado' then permitido := rol in ('admin','oficina');
  elsif rol = 'admin' then permitido := true;  -- admin puede forzar cualquier corrección
  end if;

  if not permitido then
    raise exception 'Transición % → % no permitida para rol %', s.estado, p_nuevo, rol;
  end if;

  update servicios set
    estado = p_nuevo,
    fecha_inicio = case when p_nuevo = 'en_curso' and fecha_inicio is null then now() else fecha_inicio end,
    fecha_fin    = case when p_nuevo = 'terminado' and fecha_fin is null then now() else fecha_fin end
  where id = s.id returning * into s;

  insert into servicio_eventos (servicio_id, estado_anterior, estado_nuevo, usuario_id, nota)
  values (s.id, anterior, p_nuevo, auth.uid(), p_nota);

  return s;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Revocar EXECUTE en funciones trigger (returns trigger)
--    No requieren EXECUTE directo por roles de usuario ni PostgREST.
-- -----------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.recalcular_cobrado() from public, anon, authenticated;
revoke execute on function public.recalcular_por_cobro() from public, anon, authenticated;
revoke execute on function public.reevaluar_al_terminar() from public, anon, authenticated;
revoke execute on function public.sincronizar_cobro_desde_cheque() from public, anon, authenticated;
revoke execute on function public.sincronizar_estado_maquina() from public, anon, authenticated;
revoke execute on function public.sincronizar_moneda_servicio() from public, anon, authenticated;
revoke execute on function public.sincronizar_seguro_servicio() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Funciones security definer internas / worker (solo service_role)
-- -----------------------------------------------------------------------------
revoke execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) to service_role;

revoke execute on function public.crear_factura_borrador(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crear_factura_borrador(jsonb, jsonb) to service_role;

revoke execute on function public.recalcular_servicio_cobrado(uuid) from public, anon, authenticated;
grant execute on function public.recalcular_servicio_cobrado(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Funciones security definer usadas por la aplicación (authenticated + service_role)
-- -----------------------------------------------------------------------------
revoke execute on function public.aceptar_presupuesto(uuid, uuid, jsonb) from public, anon;
grant execute on function public.aceptar_presupuesto(uuid, uuid, jsonb) to authenticated, service_role;

revoke execute on function public.agregar_items_presupuesto(uuid, jsonb) from public, anon;
grant execute on function public.agregar_items_presupuesto(uuid, jsonb) to authenticated, service_role;

revoke execute on function public.cambiar_estado(uuid, estado_servicio, text) from public, anon;
grant execute on function public.cambiar_estado(uuid, estado_servicio, text) to authenticated, service_role;

revoke execute on function public.cambiar_estado_cheque(uuid, estado_cheque, text, uuid, date, text, uuid, numeric, text, text) from public, anon;
grant execute on function public.cambiar_estado_cheque(uuid, estado_cheque, text, uuid, date, text, uuid, numeric, text, text) to authenticated, service_role;

revoke execute on function public.cerrar_recorrido(uuid, integer) from public, anon;
grant execute on function public.cerrar_recorrido(uuid, integer) to authenticated, service_role;

revoke execute on function public.crear_presupuesto(jsonb, jsonb) from public, anon;
grant execute on function public.crear_presupuesto(jsonb, jsonb) to authenticated, service_role;

revoke execute on function public.crear_presupuesto_desde_servicio(uuid) from public, anon;
grant execute on function public.crear_presupuesto_desde_servicio(uuid) to authenticated, service_role;

revoke execute on function public.crear_traslado_vinculado(uuid, jsonb, boolean, uuid[]) from public, anon;
grant execute on function public.crear_traslado_vinculado(uuid, jsonb, boolean, uuid[]) to authenticated, service_role;

revoke execute on function public.desvincular_servicio(uuid) from public, anon;
grant execute on function public.desvincular_servicio(uuid) to authenticated, service_role;

revoke execute on function public.guardar_paradas(uuid, jsonb) from public, anon;
grant execute on function public.guardar_paradas(uuid, jsonb) to authenticated, service_role;

revoke execute on function public.marcar_presupuesto_enviado(uuid, text) from public, anon;
grant execute on function public.marcar_presupuesto_enviado(uuid, text) to authenticated, service_role;

revoke execute on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated, service_role;

revoke execute on function public.programar_servicio(uuid, date, time without time zone, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.programar_servicio(uuid, date, time without time zone, uuid, uuid, uuid[]) to authenticated, service_role;

revoke execute on function public.rechazar_presupuesto(uuid, text) from public, anon;
grant execute on function public.rechazar_presupuesto(uuid, text) to authenticated, service_role;

revoke execute on function public.registrar_factura(jsonb, jsonb) from public, anon;
grant execute on function public.registrar_factura(jsonb, jsonb) to authenticated, service_role;

revoke execute on function public.registrar_servicio_realizado(uuid, text, estado_servicio) from public, anon;
grant execute on function public.registrar_servicio_realizado(uuid, text, estado_servicio) to authenticated, service_role;

revoke execute on function public.reprogramar_paradas_pendientes(uuid) from public, anon;
grant execute on function public.reprogramar_paradas_pendientes(uuid) to authenticated, service_role;

revoke execute on function public.tengo_google_calendar() from public, anon;
grant execute on function public.tengo_google_calendar() to authenticated, service_role;

revoke execute on function public.vincular_servicio(uuid, uuid, rol_vinculo, boolean) from public, anon;
grant execute on function public.vincular_servicio(uuid, uuid, rol_vinculo, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Revocar privilegios por defecto para que funciones futuras no queden expuestas
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
