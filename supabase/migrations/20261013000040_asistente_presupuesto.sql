-- =============================================================================
-- ELEVAPLUS Gestión — 0040 Asistente Chimuelo: propuesta de presupuesto
--
-- 1. Ampliar el check de asistente_propuestas.accion a
--    ('crear_servicio', 'cambiar_estado', 'crear_servicio_realizado', 'crear_presupuesto')
--    de forma idempotente.
-- 2. Eliminar la clave foránea en asistente_propuestas.resultado_id hacia servicios(id)
--    para que sea un UUID genérico que admita tanto servicios como presupuestos.
-- 3. Redefinir crear_propuesta para aceptar 'crear_presupuesto'.
-- 4. Redefinir confirmar_propuesta para ejecutar crear_presupuesto(datos->'presupuesto', datos->'items')
--    en la rama 'crear_presupuesto', asociar resultado_id al presupuesto creado y registrar
--    la propuesta como 'confirmada', o 'fallida' ante cualquier error en la misma transacción.
-- 5. Revoke de public y anon; grant a authenticated y service_role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ampliar check en asistente_propuestas.accion
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in (
    select constraint_name
    from information_schema.constraint_column_usage
    where table_name = 'asistente_propuestas' and column_name = 'accion'
  ) loop
    execute 'alter table public.asistente_propuestas drop constraint if exists ' || quote_ident(r.constraint_name);
  end loop;
end $$;

alter table public.asistente_propuestas
  add constraint asistente_propuestas_accion_check
  check (accion in ('crear_servicio', 'cambiar_estado', 'crear_servicio_realizado', 'crear_presupuesto'));

-- -----------------------------------------------------------------------------
-- 2. Quitar foreign key en asistente_propuestas.resultado_id
--    (resultado_id pasa a ser un UUID genérico que puede apuntar a servicios o presupuestos)
-- -----------------------------------------------------------------------------
alter table public.asistente_propuestas
  drop constraint if exists asistente_propuestas_resultado_id_fkey;

do $$
declare
  c text;
begin
  for c in (
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where nsp.nspname = 'public'
      and rel.relname = 'asistente_propuestas'
      and att.attname = 'resultado_id'
      and con.contype = 'f'
  ) loop
    execute 'alter table public.asistente_propuestas drop constraint ' || quote_ident(c);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Redefinición de crear_propuesta
-- -----------------------------------------------------------------------------
create or replace function public.crear_propuesta(
  p_conversacion_id uuid,
  p_accion text,
  p_datos jsonb,
  p_resumen text
) returns public.asistente_propuestas
language plpgsql security definer set search_path = public as $$
declare
  v_conv public.asistente_conversaciones%rowtype;
  v_propuesta public.asistente_propuestas%rowtype;
begin
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden crear propuestas';
  end if;

  if p_conversacion_id is null then
    raise exception 'Debe especificar la conversación';
  end if;

  if p_accion is null or p_accion not in ('crear_servicio', 'cambiar_estado', 'crear_servicio_realizado', 'crear_presupuesto') then
    raise exception 'Acción inválida o no soportada: %', p_accion;
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos de la propuesta deben ser un objeto JSON';
  end if;

  if nullif(trim(p_resumen), '') is null then
    raise exception 'Debe especificar el resumen de la propuesta';
  end if;

  select * into v_conv from public.asistente_conversaciones where id = p_conversacion_id;
  if not found then
    raise exception 'Conversación no encontrada';
  end if;

  if v_conv.usuario_id <> auth.uid() then
    raise exception 'No autorizado: la conversación no pertenece al usuario';
  end if;

  insert into public.asistente_propuestas (
    conversacion_id,
    usuario_id,
    accion,
    datos,
    resumen,
    estado,
    expira_at
  ) values (
    p_conversacion_id,
    auth.uid(),
    p_accion,
    p_datos,
    trim(p_resumen),
    'pendiente',
    now() + interval '30 minutes'
  ) returning * into v_propuesta;

  return v_propuesta;
end $$;

revoke execute on function public.crear_propuesta(uuid, text, jsonb, text) from public, anon;
grant execute on function public.crear_propuesta(uuid, text, jsonb, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Redefinición de confirmar_propuesta (agrega rama crear_presupuesto)
-- -----------------------------------------------------------------------------
create or replace function public.confirmar_propuesta(
  p_propuesta_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_propuesta public.asistente_propuestas%rowtype;
  v_serv public.servicios%rowtype;
  v_pres public.presupuestos%rowtype;
  v_resultado_id uuid;
  v_choferes uuid[];
  v_error text;
begin
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden confirmar propuestas';
  end if;

  if p_propuesta_id is null then
    raise exception 'Debe especificar la propuesta';
  end if;

  select * into v_propuesta
  from public.asistente_propuestas
  where id = p_propuesta_id
  for update;

  if not found then
    raise exception 'Propuesta no encontrada';
  end if;

  if v_propuesta.usuario_id <> auth.uid() then
    raise exception 'No autorizado: la propuesta no pertenece al usuario actual';
  end if;

  -- Idempotencia ante doble toque
  if v_propuesta.estado = 'confirmada' then
    return jsonb_build_object(
      'ok', true,
      'propuesta_id', v_propuesta.id,
      'estado', 'confirmada',
      'resultado_id', v_propuesta.resultado_id,
      'ya_confirmada', true
    );
  end if;

  if v_propuesta.estado = 'descartada' then
    raise exception 'La propuesta ya fue descartada';
  end if;

  if v_propuesta.estado = 'fallida' then
    raise exception 'La propuesta ya fue procesada y resultó fallida: %', coalesce(v_propuesta.error, 'error previo');
  end if;

  if v_propuesta.estado <> 'pendiente' then
    raise exception 'La propuesta no está pendiente (estado actual: %)', v_propuesta.estado;
  end if;

  if v_propuesta.expira_at < now() then
    update public.asistente_propuestas set
      estado = 'vencida',
      resuelta_at = now()
    where id = v_propuesta.id;

    return jsonb_build_object(
      'ok', false,
      'propuesta_id', v_propuesta.id,
      'estado', 'vencida',
      'error', 'La propuesta venció'
    );
  end if;

  -- Ejecución con control de excepciones: si falla la creación o registro,
  -- marcar 'fallida' y revertir la subtransacción para no dejar registros huérfanos
  begin
    if v_propuesta.datos ? 'choferes' and jsonb_typeof(v_propuesta.datos->'choferes') = 'array' then
      select coalesce(array_agg(elem::text::uuid), '{}'::uuid[])
      into v_choferes
      from jsonb_array_elements_text(v_propuesta.datos->'choferes') elem
      where nullif(trim(elem), '') is not null;
    end if;

    if v_propuesta.accion = 'crear_servicio' then
      v_serv := public.crear_servicio(v_propuesta.datos, v_choferes);
      v_resultado_id := v_serv.id;
    elsif v_propuesta.accion = 'cambiar_estado' then
      v_serv := public.cambiar_estado(
        (v_propuesta.datos->>'servicio_id')::uuid,
        (v_propuesta.datos->>'nuevo_estado')::public.estado_servicio,
        v_propuesta.datos->>'nota'
      );
      v_resultado_id := v_serv.id;
    elsif v_propuesta.accion = 'crear_servicio_realizado' then
      v_serv := public.crear_servicio(
        v_propuesta.datos || jsonb_build_object('es_realizado', true),
        v_choferes
      );
      v_serv := public.registrar_servicio_realizado(
        v_serv.id,
        coalesce(nullif(trim(v_propuesta.datos->>'nota'), ''), 'Carga retroactiva vía Chimuelo'),
        -- Siempre 'terminado': registrar un cobro desde el asistente es otra acción (hito 6d).
        'terminado'::public.estado_servicio
      );
      v_resultado_id := v_serv.id;
    elsif v_propuesta.accion = 'crear_presupuesto' then
      v_pres := public.crear_presupuesto(
        v_propuesta.datos->'presupuesto',
        v_propuesta.datos->'items'
      );
      v_resultado_id := v_pres.id;
    else
      raise exception 'Acción no soportada: %', v_propuesta.accion;
    end if;

    update public.asistente_propuestas set
      estado = 'confirmada',
      resultado_id = v_resultado_id,
      resuelta_at = now()
    where id = v_propuesta.id;

    if v_propuesta.accion = 'crear_presupuesto' then
      return jsonb_build_object(
        'ok', true,
        'propuesta_id', v_propuesta.id,
        'estado', 'confirmada',
        'resultado_id', v_resultado_id,
        'presupuesto', to_jsonb(v_pres)
      );
    else
      return jsonb_build_object(
        'ok', true,
        'propuesta_id', v_propuesta.id,
        'estado', 'confirmada',
        'resultado_id', v_resultado_id,
        'servicio', to_jsonb(v_serv)
      );
    end if;
  exception when others then
    v_error := sqlerrm;
    update public.asistente_propuestas set
      estado = 'fallida',
      error = v_error,
      resuelta_at = now()
    where id = v_propuesta.id;

    return jsonb_build_object(
      'ok', false,
      'propuesta_id', v_propuesta.id,
      'estado', 'fallida',
      'error', v_error
    );
  end;
end $$;

revoke execute on function public.confirmar_propuesta(uuid) from public, anon;
grant execute on function public.confirmar_propuesta(uuid) to authenticated, service_role;
