-- =============================================================================
-- ELEVAPLUS Gestión — 0026 Recorridos: reprogramación, carga retroactiva y presupuestos
--
-- 1. Index en servicios.continuacion_de
-- 2. RPC reprogramar_paradas_pendientes(p_servicio_id uuid)
-- 3. Extensión de registrar_servicio_realizado para completar paradas en carga retroactiva
-- 4. Extensión de _insertar_items_presupuesto para insertar paradas de ítems de presupuesto
-- 5. Redefinición de guardar_paradas con validaciones de tipo traslado y dirección obligatoria
-- =============================================================================

-- ---------- 1. Índice en servicios.continuacion_de ----------
create index if not exists servicios_continuacion_de_idx on servicios(continuacion_de);

-- ---------- 2. RPC: reprogramar_paradas_pendientes ----------
drop function if exists public.reprogramar_paradas_pendientes(uuid);

create or replace function public.reprogramar_paradas_pendientes(
  p_servicio_id uuid
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  s_orig servicios%rowtype;
  s_nuevo servicios%rowtype;
  v_cant_pendientes int;
  v_origen text;
  v_destino text;
begin
  -- 1. Validar permisos: solo admin u oficina
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden reprogramar paradas';
  end if;

  -- 2. Obtener y bloquear servicio original
  select * into s_orig from servicios where id = p_servicio_id for update;
  if not found then
    raise exception 'Servicio no encontrado';
  end if;

  -- 3. Validar estado del servicio original: debe estar terminado, cobrado o facturado
  if s_orig.estado not in ('terminado', 'cobrado', 'facturado') then
    raise exception 'El servicio debe estar terminado para reprogramar paradas pendientes (estado actual: %)', s_orig.estado;
  end if;

  -- 4. Validar que tenga paradas no realizadas
  select count(*) into v_cant_pendientes
  from paradas
  where servicio_id = p_servicio_id and estado = 'no_realizada';

  if v_cant_pendientes = 0 then
    raise exception 'No hay paradas pendientes para reprogramar';
  end if;

  -- 5. Validar que no haya sido reprogramado ya
  if exists (
    select 1 from servicios
    where continuacion_de = p_servicio_id and estado <> 'cancelado'
  ) then
    raise exception 'Este recorrido ya tiene paradas reprogramadas';
  end if;

  -- 6. Origen: última parada completada; si ninguna se completó, el origen del servicio original
  select case
    when p.localidad is not null and trim(p.localidad) <> ''
      then trim(p.direccion) || ', ' || trim(p.localidad)
    else trim(p.direccion)
  end into v_origen
  from paradas p
  where p.servicio_id = p_servicio_id and p.estado = 'completada'
  order by p.orden desc
  limit 1;

  if v_origen is null or trim(v_origen) = '' then
    v_origen := s_orig.origen;
  end if;

  -- 7. Destino: última parada no realizada
  select case
    when p.localidad is not null and trim(p.localidad) <> ''
      then trim(p.direccion) || ', ' || trim(p.localidad)
    else trim(p.direccion)
  end into v_destino
  from paradas p
  where p.servicio_id = p_servicio_id and p.estado = 'no_realizada'
  order by p.orden desc
  limit 1;

  if v_destino is null or trim(v_destino) = '' then
    v_destino := s_orig.destino;
  end if;

  -- 8. Crear nuevo servicio en estado aceptado con monto vacío
  insert into servicios (
    cliente_id,
    tipo,
    descripcion,
    monto,
    moneda,
    monto_moneda,
    cotizacion,
    aplica_iva,
    nocturno,
    origen,
    destino,
    km,
    ida_y_vuelta,
    estado,
    continuacion_de,
    creado_por
  ) values (
    s_orig.cliente_id,
    s_orig.tipo,
    s_orig.descripcion,
    null,
    s_orig.moneda,
    null,
    null,
    s_orig.aplica_iva,
    coalesce(s_orig.nocturno, false),
    v_origen,
    v_destino,
    null,
    false,
    'aceptado'::estado_servicio,
    s_orig.id,
    auth.uid()
  ) returning * into s_nuevo;

  -- 9. Registrar evento de auditoría en servicio_eventos
  insert into servicio_eventos (
    servicio_id,
    estado_anterior,
    estado_nuevo,
    usuario_id,
    nota
  ) values (
    s_nuevo.id,
    null,
    'aceptado'::estado_servicio,
    auth.uid(),
    'Reprogramación de paradas pendientes de servicio #' || s_orig.numero
  );

  -- 10. Copiar las paradas no realizadas con orden 1..N y estado pendiente
  insert into paradas (
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
    s_nuevo.id,
    row_number() over (order by p.orden)::int as orden,
    p.direccion,
    p.localidad,
    p.carga,
    p.carga_desde,
    'pendiente'::estado_parada,
    p.notas
  from paradas p
  where p.servicio_id = s_orig.id
    and p.estado = 'no_realizada'
  order by p.orden;

  return s_nuevo;
end $$;

-- ---------- 3. Extensión de registrar_servicio_realizado ----------
create or replace function public.registrar_servicio_realizado(
  p_servicio_id uuid,
  p_nota text default null,
  p_estado_final estado_servicio default 'terminado'
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  s servicios%rowtype;
  v_nota text;
begin
  -- 1. Validar permisos: rol admin u oficina
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden registrar servicios realizados';
  end if;

  -- 2. Validar p_estado_final: solo se permite en_curso o terminado
  if p_estado_final not in ('en_curso', 'terminado') then
    raise exception 'p_estado_final inválido: solo se permite en_curso o terminado';
  end if;

  -- 3. Obtener y bloquear servicio
  select * into s from servicios where id = p_servicio_id for update;
  if not found then
    raise exception 'Servicio no encontrado';
  end if;

  -- 4. Validar estado inicial: debe estar en consulta
  if s.estado != 'consulta' then
    raise exception 'El servicio debe estar en estado consulta (actual: %)', s.estado;
  end if;

  -- 5. Si p_estado_final = 'en_curso', solo se permite para alquiler_periodo
  if p_estado_final = 'en_curso' and s.tipo != 'alquiler_periodo' then
    raise exception 'Solo los alquileres por período pueden registrarse en curso';
  end if;

  -- 6. Exigir fechas según p_estado_final
  if s.fecha_inicio is null then
    raise exception 'fecha_inicio debe estar seteada';
  end if;

  if p_estado_final = 'terminado' and s.fecha_fin is null then
    raise exception 'fecha_inicio y fecha_fin deben estar seteadas';
  end if;

  -- 7. Validar que la fecha no sea futura
  if s.fecha_inicio > now() then
    raise exception 'Un servicio realizado no puede tener fecha futura';
  end if;

  -- 8. Validar que fecha_fin no sea anterior a fecha_inicio
  if s.fecha_fin is not null and s.fecha_fin < s.fecha_inicio then
    raise exception 'La hora de fin es anterior a la de inicio';
  end if;

  -- 9. Preparar nota de auditoría
  v_nota := coalesce(nullif(trim(p_nota), ''), 'Carga retroactiva');

  -- 10. Encadenar transiciones en la misma transacción llamando a cambiar_estado
  s := cambiar_estado(s.id, 'programado'::estado_servicio, v_nota);
  s := cambiar_estado(s.id, 'en_curso'::estado_servicio, v_nota);
  if p_estado_final = 'terminado' then
    s := cambiar_estado(s.id, 'terminado'::estado_servicio, v_nota);

    -- Carga retroactiva: si el servicio tiene paradas y termina en terminado,
    -- marcar todas las paradas como completadas en la misma transacción.
    if exists (select 1 from paradas where servicio_id = s.id) then
      update paradas
      set estado = 'completada',
          completada_at = coalesce(completada_at, s.fecha_fin, now())
      where servicio_id = s.id;
    end if;
  end if;

  return s;
end $$;

-- ---------- 4. Extensión de _insertar_items_presupuesto ----------
create or replace function public._insertar_items_presupuesto(
  p_presupuesto_id uuid,
  p_cliente_id uuid,
  p_items jsonb
) returns setof servicios
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  v_serv servicios%rowtype;
  v_tipo tipo_servicio;
  v_moneda text;
  v_fecha_prog date;
  v_alq_desde date;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe indicar al menos un ítem';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    v_tipo := (item->>'tipo')::tipo_servicio;
    v_moneda := coalesce(nullif(trim(item->>'moneda'), ''), 'ARS');
    v_fecha_prog := nullif(item->>'fecha_programada', '')::date;

    if v_tipo = 'alquiler_periodo' and item ? 'alquiler' and item->'alquiler' is not null and jsonb_typeof(item->'alquiler') = 'object' then
      v_alq_desde := (item->'alquiler'->>'fecha_desde')::date;
      v_fecha_prog := coalesce(v_fecha_prog, v_alq_desde);
    end if;

    -- Validar paradas antes de insertar el servicio
    if item ? 'paradas' and item->'paradas' is not null and jsonb_typeof(item->'paradas') = 'array' and jsonb_array_length(item->'paradas') > 0 then
      if v_tipo <> 'traslado' then
        raise exception 'Solo los traslados pueden tener paradas';
      end if;

      if exists (
        select 1
        from jsonb_array_elements(item->'paradas') elem
        where nullif(trim(elem->>'direccion'), '') is null
      ) then
        raise exception 'Cada parada necesita una dirección';
      end if;
    end if;

    insert into servicios (
      presupuesto_id,
      cliente_id,
      tipo,
      descripcion,
      monto,
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
      maquina_id,
      vehiculo_id,
      estado,
      creado_por
    ) values (
      p_presupuesto_id,
      p_cliente_id,
      v_tipo,
      nullif(trim(item->>'descripcion'), ''),
      nullif(item->>'monto', '')::numeric,
      v_moneda,
      nullif(item->>'monto_moneda', '')::numeric,
      nullif(item->>'cotizacion', '')::numeric,
      coalesce((item->>'aplica_iva')::boolean, true),
      coalesce((item->>'nocturno')::boolean, false),
      nullif(trim(item->>'origen'), ''),
      nullif(trim(item->>'destino'), ''),
      nullif(item->>'km', '')::numeric,
      coalesce((item->>'ida_y_vuelta')::boolean, false),
      v_fecha_prog,
      nullif(item->>'hora_programada', '')::time,
      nullif(item->>'maquina_id', '')::uuid,
      nullif(item->>'vehiculo_id', '')::uuid,
      'consulta',
      auth.uid()
    ) returning * into v_serv;

    -- Si es alquiler_periodo y contiene objeto de alquiler
    if v_tipo = 'alquiler_periodo' and item ? 'alquiler' and item->'alquiler' is not null and jsonb_typeof(item->'alquiler') = 'object' then
      insert into alquileres (
        servicio_id,
        fecha_desde,
        fecha_hasta,
        unidad,
        cantidad,
        precio_unidad
      ) values (
        v_serv.id,
        (item->'alquiler'->>'fecha_desde')::date,
        (item->'alquiler'->>'fecha_hasta')::date,
        coalesce((item->'alquiler'->>'unidad')::unidad_alquiler, 'dia'::unidad_alquiler),
        coalesce((item->'alquiler'->>'cantidad')::int, 1),
        (item->'alquiler'->>'precio_unidad')::numeric
      );
    end if;

    -- Si el ítem contiene paradas (recorrido)
    if item ? 'paradas' and item->'paradas' is not null and jsonb_typeof(item->'paradas') = 'array' and jsonb_array_length(item->'paradas') > 0 then
      insert into paradas (
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
        coalesce((elem.val ->> 'carga_desde')::carga_desde, 'origen'::carga_desde),
        'pendiente'::estado_parada,
        nullif(trim(elem.val ->> 'notas'), '')
      from jsonb_array_elements(item->'paradas') with ordinality as elem(val, ord);
    end if;

    return next v_serv;
  end loop;

  return;
end $$;

-- ---------- 5. Redefinición de guardar_paradas ----------
create or replace function public.guardar_paradas(
  p_servicio_id uuid,
  p_paradas jsonb
) returns setof paradas
language plpgsql security definer set search_path = public as $$
declare
  v_serv servicios%rowtype;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;

  select * into v_serv from servicios where id = p_servicio_id;
  if not found then
    raise exception 'Servicio no encontrado';
  end if;

  if exists (
    select 1 from paradas
    where servicio_id = p_servicio_id and estado in ('completada', 'no_realizada')
  ) then
    raise exception 'No se pueden editar las paradas de un recorrido cerrado';
  end if;

  if p_paradas is not null and jsonb_typeof(p_paradas) <> 'array' then
    raise exception 'El formato de paradas debe ser un arreglo JSON';
  end if;

  if p_paradas is not null and jsonb_array_length(p_paradas) > 0 then
    if v_serv.tipo <> 'traslado' then
      raise exception 'Solo los traslados pueden tener paradas';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_paradas) elem
      where nullif(trim(elem->>'direccion'), '') is null
    ) then
      raise exception 'Cada parada necesita una dirección';
    end if;
  end if;

  delete from paradas where servicio_id = p_servicio_id;

  if p_paradas is not null and jsonb_array_length(p_paradas) > 0 then
    return query
    insert into paradas (
      servicio_id,
      orden,
      direccion,
      localidad,
      carga,
      carga_desde,
      notas
    )
    select
      p_servicio_id,
      elem.ord::int,
      trim(elem.val ->> 'direccion'),
      nullif(trim(elem.val ->> 'localidad'), ''),
      nullif(trim(elem.val ->> 'carga'), ''),
      coalesce((elem.val ->> 'carga_desde')::carga_desde, 'origen'::carga_desde),
      nullif(trim(elem.val ->> 'notas'), '')
    from jsonb_array_elements(p_paradas) with ordinality as elem(val, ord)
    returning *;
  end if;
end $$;

-- ---------- 6. Hardening y Grants ----------
revoke execute on function public.reprogramar_paradas_pendientes(uuid) from public, anon;
grant execute on function public.reprogramar_paradas_pendientes(uuid) to authenticated, service_role;

revoke execute on function public.registrar_servicio_realizado(uuid, text, estado_servicio) from public, anon;
grant execute on function public.registrar_servicio_realizado(uuid, text, estado_servicio) to authenticated, service_role;

revoke execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) to service_role;

revoke execute on function public.guardar_paradas(uuid, jsonb) from public, anon;
grant execute on function public.guardar_paradas(uuid, jsonb) to authenticated, service_role;
