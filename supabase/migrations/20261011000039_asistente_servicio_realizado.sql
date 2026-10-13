-- =============================================================================
-- ELEVAPLUS Gestión — 0039 Asistente Chimuelo: propuesta de servicio realizado
--
-- 1. Ampliar el check de asistente_propuestas.accion a
--    ('crear_servicio', 'cambiar_estado', 'crear_servicio_realizado') de forma idempotente.
-- 2. Redefinir _insertar_un_servicio para aceptar fecha_inicio y fecha_fin e inferirlas
--    si es_realizado = true.
-- 3. Redefinir crear_servicio para soportar es_realizado = true asignando choferes
--    directamente sin llamar a programar_servicio (evita notificaciones y preserva estado 'consulta').
-- 4. Redefinir crear_propuesta para aceptar 'crear_servicio_realizado'.
-- 5. Redefinir confirmar_propuesta para ejecutar crear_servicio(datos, choferes) y
--    luego registrar_servicio_realizado(servicio_id, nota, estado_final) en la misma transacción.
-- 6. Grants a authenticated y service_role, revoke de public y anon.
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
  check (accion in ('crear_servicio', 'cambiar_estado', 'crear_servicio_realizado'));

-- -----------------------------------------------------------------------------
-- 2. Redefinición de _insertar_un_servicio con soporte de fecha_inicio y fecha_fin
-- -----------------------------------------------------------------------------
create or replace function public._insertar_un_servicio(
  p_presupuesto_id uuid,
  p_cliente_id uuid,
  p_datos jsonb
) returns public.servicios
language plpgsql security definer set search_path = public as $$
declare
  v_serv public.servicios%rowtype;
  v_tipo public.tipo_servicio;
  v_cliente_id uuid;
  v_presupuesto_id uuid;
  v_moneda text;
  v_fecha_prog date;
  v_alq_desde date;
  v_seguro_importe numeric(14,2);
  v_monto_seguro numeric(14,2);
  v_aplica_iva boolean;
  v_direccion_trabajo text;
  v_localidad_trabajo text;
  v_trabajo_a_realizar text;
  v_fecha_inicio timestamptz;
  v_fecha_fin timestamptz;
  v_hora_prog time;
begin
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos del servicio deben ser un objeto JSON';
  end if;

  v_tipo := (p_datos->>'tipo')::public.tipo_servicio;
  if v_tipo is null then
    raise exception 'Debe especificar el tipo de servicio';
  end if;

  v_cliente_id := coalesce(p_cliente_id, nullif(p_datos->>'cliente_id', '')::uuid);
  v_presupuesto_id := coalesce(p_presupuesto_id, nullif(p_datos->>'presupuesto_id', '')::uuid);
  v_moneda := coalesce(nullif(trim(p_datos->>'moneda'), ''), 'ARS');
  v_fecha_prog := coalesce(
    nullif(p_datos->>'fecha_programada', '')::date,
    nullif(p_datos->>'fecha', '')::date
  );
  v_aplica_iva := coalesce((p_datos->>'aplica_iva')::boolean, true);

  v_seguro_importe := nullif(p_datos->>'seguro_importe', '')::numeric;
  if v_tipo = 'traslado' and v_seguro_importe is not null then
    if v_aplica_iva then
      v_monto_seguro := round(v_seguro_importe / 1.21, 2);
    else
      v_monto_seguro := v_seguro_importe;
    end if;
  else
    v_seguro_importe := null;
    v_monto_seguro := null;
  end if;

  if v_tipo = 'alquiler_periodo' and p_datos ? 'alquiler' and p_datos->'alquiler' is not null and jsonb_typeof(p_datos->'alquiler') = 'object' then
    v_alq_desde := (p_datos->'alquiler'->>'fecha_desde')::date;
    v_fecha_prog := coalesce(v_fecha_prog, v_alq_desde);
  end if;

  -- Validar paradas antes de insertar el servicio
  if p_datos ? 'paradas' and p_datos->'paradas' is not null and jsonb_typeof(p_datos->'paradas') = 'array' and jsonb_array_length(p_datos->'paradas') > 0 then
    if v_tipo <> 'traslado' then
      raise exception 'Solo los traslados pueden tener paradas';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_datos->'paradas') elem
      where nullif(trim(elem->>'direccion'), '') is null
    ) then
      raise exception 'Cada parada necesita una dirección';
    end if;
  end if;

  v_direccion_trabajo := coalesce(
    nullif(trim(p_datos->>'direccion_trabajo'), ''),
    nullif(trim(p_datos->>'direccion'), '')
  );
  v_localidad_trabajo := coalesce(
    nullif(trim(p_datos->>'localidad_trabajo'), ''),
    nullif(trim(p_datos->>'localidad'), '')
  );
  v_trabajo_a_realizar := nullif(trim(p_datos->>'trabajo_a_realizar'), '');

  v_hora_prog := coalesce(nullif(p_datos->>'hora_programada', '')::time, nullif(p_datos->>'hora', '')::time);
  v_fecha_inicio := nullif(p_datos->>'fecha_inicio', '')::timestamptz;
  v_fecha_fin := nullif(p_datos->>'fecha_fin', '')::timestamptz;

  -- Si es servicio realizado y no vienen fechas explícitas, inferir fecha_inicio y fecha_fin a partir de fecha_prog
  if v_fecha_inicio is null and v_fecha_prog is not null and coalesce((p_datos->>'es_realizado')::boolean, false) then
    v_fecha_inicio := (v_fecha_prog::text || ' ' || coalesce(to_char(v_hora_prog, 'HH24:MI:SS'), '12:00:00') || '-03')::timestamptz;
    v_fecha_fin := coalesce(v_fecha_fin, v_fecha_inicio);
  end if;

  insert into public.servicios (
    presupuesto_id,
    cliente_id,
    tipo,
    descripcion,
    monto,
    seguro_importe,
    monto_seguro,
    moneda,
    monto_moneda,
    cotizacion,
    aplica_iva,
    nocturno,
    origen,
    destino,
    km,
    ida_y_vuelta,
    fecha_programada,
    hora_programada,
    fecha_inicio,
    fecha_fin,
    maquina_id,
    vehiculo_id,
    direccion_trabajo,
    localidad_trabajo,
    trabajo_a_realizar,
    estado,
    creado_por
  ) values (
    v_presupuesto_id,
    v_cliente_id,
    v_tipo,
    nullif(trim(p_datos->>'descripcion'), ''),
    nullif(p_datos->>'monto', '')::numeric,
    v_seguro_importe,
    v_monto_seguro,
    v_moneda,
    nullif(p_datos->>'monto_moneda', '')::numeric,
    nullif(p_datos->>'cotizacion', '')::numeric,
    v_aplica_iva,
    coalesce((p_datos->>'nocturno')::boolean, false),
    nullif(trim(p_datos->>'origen'), ''),
    nullif(trim(p_datos->>'destino'), ''),
    nullif(p_datos->>'km', '')::numeric,
    coalesce((p_datos->>'ida_y_vuelta')::boolean, false),
    v_fecha_prog,
    v_hora_prog,
    v_fecha_inicio,
    v_fecha_fin,
    nullif(p_datos->>'maquina_id', '')::uuid,
    nullif(p_datos->>'vehiculo_id', '')::uuid,
    v_direccion_trabajo,
    v_localidad_trabajo,
    v_trabajo_a_realizar,
    'consulta',
    auth.uid()
  ) returning * into v_serv;

  -- Si es alquiler_periodo y contiene objeto de alquiler
  if v_tipo = 'alquiler_periodo' and p_datos ? 'alquiler' and p_datos->'alquiler' is not null and jsonb_typeof(p_datos->'alquiler') = 'object' then
    insert into public.alquileres (
      servicio_id,
      fecha_desde,
      fecha_hasta,
      unidad,
      cantidad,
      precio_unidad
    ) values (
      v_serv.id,
      (p_datos->'alquiler'->>'fecha_desde')::date,
      (p_datos->'alquiler'->>'fecha_hasta')::date,
      coalesce((p_datos->'alquiler'->>'unidad')::public.unidad_alquiler, 'dia'::public.unidad_alquiler),
      coalesce((p_datos->'alquiler'->>'cantidad')::int, 1),
      (p_datos->'alquiler'->>'precio_unidad')::numeric
    );
  end if;

  -- Si el ítem contiene paradas (recorrido)
  if p_datos ? 'paradas' and p_datos->'paradas' is not null and jsonb_typeof(p_datos->'paradas') = 'array' and jsonb_array_length(p_datos->'paradas') > 0 then
    insert into public.paradas (
      servicio_id,
      orden,
      direccion,
      localidad,
      carga,
      carga_desde,
      estado,
      notas
    )
    select
      v_serv.id,
      elem.ord::int,
      trim(elem.val ->> 'direccion'),
      nullif(trim(elem.val ->> 'localidad'), ''),
      nullif(trim(elem.val ->> 'carga'), ''),
      coalesce((elem.val ->> 'carga_desde')::public.carga_desde, 'origen'::public.carga_desde),
      'pendiente'::public.estado_parada,
      nullif(trim(elem.val ->> 'notas'), '')
    from jsonb_array_elements(p_datos->'paradas') with ordinality as elem(val, ord);
  end if;

  return v_serv;
end $$;

revoke execute on function public._insertar_un_servicio(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public._insertar_un_servicio(uuid, uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Redefinición de crear_servicio con soporte de es_realizado
-- -----------------------------------------------------------------------------
create or replace function public.crear_servicio(
  p_datos jsonb,
  p_choferes uuid[] default null
) returns public.servicios
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_serv public.servicios%rowtype;
  v_choferes uuid[];
  v_es_realizado boolean;
begin
  -- 1. Validar permisos: solo admin u oficina
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden crear servicios';
  end if;

  -- 2. Validar estructura básica
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos del servicio deben ser un objeto JSON';
  end if;

  v_cliente_id := nullif(p_datos->>'cliente_id', '')::uuid;
  if v_cliente_id is null then
    raise exception 'Debe especificar el cliente';
  end if;

  if not exists (select 1 from public.clientes where id = v_cliente_id) then
    raise exception 'Cliente no encontrado';
  end if;

  -- 3. Resolver choferes si vienen dentro de p_datos
  v_choferes := p_choferes;
  if (v_choferes is null or array_length(v_choferes, 1) is null) and p_datos ? 'choferes' and jsonb_typeof(p_datos->'choferes') = 'array' then
    select coalesce(array_agg(elem::text::uuid), '{}'::uuid[])
    into v_choferes
    from jsonb_array_elements_text(p_datos->'choferes') elem
    where nullif(trim(elem), '') is not null;
  end if;

  v_es_realizado := coalesce((p_datos->>'es_realizado')::boolean, false);

  -- 4. Insertar servicio mediante lógica común (en estado consulta)
  v_serv := public._insertar_un_servicio(
    nullif(p_datos->>'presupuesto_id', '')::uuid,
    v_cliente_id,
    p_datos
  );

  -- 5. Choferes
  if v_choferes is not null and array_length(v_choferes, 1) > 0 then
    if v_es_realizado then
      -- Para servicios ya realizados: asignar a servicio_choferes directamente sin llamar a programar_servicio
      insert into public.servicio_choferes (servicio_id, chofer_id)
      select v_serv.id, elem
      from unnest(v_choferes) elem
      on conflict do nothing;
    else
      if v_serv.fecha_programada is null then
        raise exception 'Debe especificar una fecha para programar el servicio con choferes';
      end if;

      v_serv := public.programar_servicio(
        v_serv.id,
        v_serv.fecha_programada,
        v_serv.hora_programada,
        v_serv.vehiculo_id,
        v_serv.maquina_id,
        v_choferes
      );
    end if;
  end if;

  return v_serv;
end $$;

revoke execute on function public.crear_servicio(jsonb, uuid[]) from public, anon;
grant execute on function public.crear_servicio(jsonb, uuid[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC crear_propuesta (acepta crear_servicio, cambiar_estado y crear_servicio_realizado)
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

  if p_accion is null or p_accion not in ('crear_servicio', 'cambiar_estado', 'crear_servicio_realizado') then
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
-- 5. RPC confirmar_propuesta (agrega rama crear_servicio_realizado)
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

    return jsonb_build_object(
      'ok', false,
      'propuesta_id', v_propuesta.id,
      'estado', 'vencida',
      'error', 'La propuesta venció'
    );
  end if;

  -- Ejecución con control de excepciones: si falla la creación o registro,
  -- marcar 'fallida' y revertir la subtransacción para no dejar servicios huérfanos
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
