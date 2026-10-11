-- =============================================================================
-- ELEVAPLUS Gestión — 0038 Asistente Chimuelo: propuesta de cambio de estado
--
-- 1. Ampliar el check de asistente_propuestas.accion a ('crear_servicio', 'cambiar_estado')
--    de forma idempotente.
-- 2. Redefinir crear_propuesta para aceptar 'crear_servicio' y 'cambiar_estado'.
-- 3. Redefinir confirmar_propuesta para ejecutar la rama 'cambiar_estado' vía
--    public.cambiar_estado(servicio_id, nuevo_estado, nota).
-- 4. Repetir revoke public/anon + grant authenticated/service_role.
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
  check (accion in ('crear_servicio', 'cambiar_estado'));

-- -----------------------------------------------------------------------------
-- 2. RPC crear_propuesta (acepta crear_servicio y cambiar_estado)
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

  if p_accion is null or p_accion not in ('crear_servicio', 'cambiar_estado') then
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
-- 3. RPC confirmar_propuesta (agrega rama cambiar_estado)
-- -----------------------------------------------------------------------------
create or replace function public.confirmar_propuesta(
  p_propuesta_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_propuesta public.asistente_propuestas%rowtype;
  v_serv public.servicios%rowtype;
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

    -- Devolver en vez de lanzar: un raise desharía la marca de 'vencida'.
    return jsonb_build_object(
      'ok', false,
      'propuesta_id', v_propuesta.id,
      'estado', 'vencida',
      'error', 'La propuesta venció'
    );
  end if;

  -- Ejecución con control de excepciones: si crear_servicio o cambiar_estado falla,
  -- marcar 'fallida' sin abortar la transacción de la marca
  begin
    if v_propuesta.datos ? 'choferes' and jsonb_typeof(v_propuesta.datos->'choferes') = 'array' then
      select coalesce(array_agg(elem::text::uuid), '{}'::uuid[])
      into v_choferes
      from jsonb_array_elements_text(v_propuesta.datos->'choferes') elem
      where nullif(trim(elem), '') is not null;
    end if;

    if v_propuesta.accion = 'crear_servicio' then
      v_serv := public.crear_servicio(v_propuesta.datos, v_choferes);
    elsif v_propuesta.accion = 'cambiar_estado' then
      v_serv := public.cambiar_estado(
        (v_propuesta.datos->>'servicio_id')::uuid,
        (v_propuesta.datos->>'nuevo_estado')::public.estado_servicio,
        v_propuesta.datos->>'nota'
      );
    else
      raise exception 'Acción no soportada: %', v_propuesta.accion;
    end if;

    update public.asistente_propuestas set
      estado = 'confirmada',
      resultado_id = v_serv.id,
      resuelta_at = now()
    where id = v_propuesta.id;

    return jsonb_build_object(
      'ok', true,
      'propuesta_id', v_propuesta.id,
      'estado', 'confirmada',
      'resultado_id', v_serv.id,
      'servicio', to_jsonb(v_serv)
    );
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
