-- =============================================================================
-- ELEVAPLUS Gestión — 0023 Transacciones atómicas de presupuestos (RPC)
-- RPCs transaccionales para crear, enviar, rechazar, aceptar y agregar ítems.
-- =============================================================================

-- ---------- Función interna: _insertar_items_presupuesto ----------
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

    return next v_serv;
  end loop;

  return;
end $$;

-- ---------- 1. RPC: crear_presupuesto ----------
create or replace function public.crear_presupuesto(
  p_datos jsonb,
  p_items jsonb
) returns presupuestos
language plpgsql security definer set search_path = public as $$
declare
  pr presupuestos%rowtype;
  v_cliente_id uuid;
  v_validez int;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos del presupuesto son inválidos';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El presupuesto debe tener al menos un ítem';
  end if;

  v_cliente_id := nullif(trim(p_datos->>'cliente_id'), '')::uuid;

  if v_cliente_id is null and nullif(trim(p_datos->>'prospecto_nombre'), '') is null then
    raise exception 'Debe indicar un cliente existente o el nombre del prospecto';
  end if;

  -- validez_dias por defecto: coalesce(p_datos.validez_dias, empresa.presupuesto_validez_dias, 15)
  select coalesce(
    nullif(p_datos->>'validez_dias', '')::int,
    (select presupuesto_validez_dias from empresa where id = 1),
    15
  ) into v_validez;

  -- Insertar presupuesto en estado borrador. creado_por siempre auth.uid()
  insert into presupuestos (
    cliente_id,
    prospecto_nombre,
    prospecto_telefono,
    prospecto_email,
    prospecto_cuit,
    estado,
    validez_dias,
    condiciones,
    notas,
    creado_por
  ) values (
    v_cliente_id,
    nullif(trim(p_datos->>'prospecto_nombre'), ''),
    nullif(trim(p_datos->>'prospecto_telefono'), ''),
    nullif(trim(p_datos->>'prospecto_email'), ''),
    nullif(trim(p_datos->>'prospecto_cuit'), ''),
    'borrador',
    v_validez,
    nullif(trim(p_datos->>'condiciones'), ''),
    nullif(trim(p_datos->>'notas'), ''),
    auth.uid()
  ) returning * into pr;

  -- Insertar servicios vía función interna
  perform public._insertar_items_presupuesto(pr.id, v_cliente_id, p_items);

  return pr;
end $$;

-- ---------- 2. RPC: agregar_items_presupuesto ----------
create or replace function public.agregar_items_presupuesto(
  p_presupuesto_id uuid,
  p_items jsonb
) returns setof servicios
language plpgsql security definer set search_path = public as $$
declare
  pr presupuestos%rowtype;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;

  select * into pr from presupuestos where id = p_presupuesto_id for update;
  if not found then raise exception 'Presupuesto no encontrado'; end if;

  if pr.estado not in ('borrador', 'enviado') then
    raise exception 'No se pueden agregar ítems porque el presupuesto está %', pr.estado;
  end if;

  return query select * from public._insertar_items_presupuesto(pr.id, pr.cliente_id, p_items);
end $$;

-- ---------- 3. RPC: marcar_presupuesto_enviado ----------
create or replace function public.marcar_presupuesto_enviado(
  p_presupuesto_id uuid,
  p_pdf_path text
) returns presupuestos
language plpgsql security definer set search_path = public as $$
declare
  pr presupuestos%rowtype;
  s record;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;

  select * into pr from presupuestos where id = p_presupuesto_id for update;
  if not found then raise exception 'Presupuesto no encontrado'; end if;

  if pr.estado not in ('borrador', 'enviado') then
    raise exception 'El presupuesto no se puede enviar porque su estado actual es %', pr.estado;
  end if;

  if p_pdf_path is null or trim(p_pdf_path) = '' then
    raise exception 'La ruta del PDF es obligatoria';
  end if;

  -- Pasar ítems en consulta a presupuestado vía cambiar_estado
  for s in
    select id
    from servicios
    where presupuesto_id = pr.id and estado = 'consulta'
  loop
    perform cambiar_estado(s.id, 'presupuestado', 'Presupuesto #' || pr.numero);
  end loop;

  update presupuestos
  set estado = 'enviado',
      pdf_path = trim(p_pdf_path),
      generado_at = now(),
      enviado_at = coalesce(pr.enviado_at, now())
  where id = pr.id
  returning * into pr;

  return pr;
end $$;

-- ---------- 4. RPC: rechazar_presupuesto ----------
create or replace function public.rechazar_presupuesto(
  p_presupuesto_id uuid,
  p_motivo text default null
) returns presupuestos
language plpgsql security definer set search_path = public as $$
declare
  pr presupuestos%rowtype;
  s record;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;

  select * into pr from presupuestos where id = p_presupuesto_id for update;
  if not found then raise exception 'Presupuesto no encontrado'; end if;

  if pr.estado not in ('borrador', 'enviado') then
    raise exception 'El presupuesto ya está %', pr.estado;
  end if;

  update presupuestos
  set estado = 'rechazado',
      respondido_at = now(),
      notas = case
        when p_motivo is not null and trim(p_motivo) <> '' then
          coalesce(notas || E'\n', '') || 'Motivo de rechazo: ' || trim(p_motivo)
        else notas
      end
  where id = pr.id
  returning * into pr;

  -- Cancelar vía cambiar_estado los servicios en consulta o presupuestado
  for s in
    select id
    from servicios
    where presupuesto_id = pr.id and estado in ('consulta', 'presupuestado')
  loop
    perform cambiar_estado(
      s.id,
      'cancelado',
      coalesce(nullif(trim(p_motivo), ''), 'Presupuesto #' || pr.numero || ' rechazado')
    );
  end loop;

  return pr;
end $$;

-- ---------- 5. RPC: aceptar_presupuesto (extendida con p_cliente_nuevo) ----------
drop function if exists public.aceptar_presupuesto(uuid, uuid);

create or replace function public.aceptar_presupuesto(
  p_presupuesto_id uuid,
  p_cliente_id uuid default null,
  p_cliente_nuevo jsonb default null
) returns presupuestos
language plpgsql security definer set search_path = public as $$
declare
  pr presupuestos%rowtype;
  s record;
  v_items_procesados int := 0;
  v_cliente_id uuid;
  v_nombre text;
  v_cuit text;
  v_cliente_existente_nombre text;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;

  -- Exigir exactamente uno de p_cliente_id o p_cliente_nuevo
  if (p_cliente_id is null and p_cliente_nuevo is null) or
     (p_cliente_id is not null and p_cliente_nuevo is not null) then
    raise exception 'Debe especificar exactamente uno de p_cliente_id o p_cliente_nuevo';
  end if;

  select * into pr from presupuestos where id = p_presupuesto_id for update;
  if not found then raise exception 'Presupuesto no encontrado'; end if;

  if pr.estado not in ('borrador', 'enviado') then
    raise exception 'El presupuesto ya está %', pr.estado;
  end if;

  -- Crear cliente si se proporcionó p_cliente_nuevo
  if p_cliente_nuevo is not null then
    v_nombre := trim(p_cliente_nuevo->>'nombre');
    if v_nombre is null or v_nombre = '' then
      raise exception 'El nombre o razón social del cliente es obligatorio';
    end if;

    v_cuit := nullif(regexp_replace(p_cliente_nuevo->>'cuit', '\D', '', 'g'), '');
    if v_cuit is not null then
      select nombre into v_cliente_existente_nombre
      from clientes
      where regexp_replace(coalesce(cuit, ''), '\D', '', 'g') = v_cuit
      limit 1;

      if v_cliente_existente_nombre is not null then
        raise exception 'Ya existe un cliente con ese CUIT: %', v_cliente_existente_nombre;
      end if;
    end if;

    insert into clientes (
      nombre,
      tipo,
      cuit,
      condicion_iva,
      telefono,
      email,
      direccion,
      localidad,
      condicion_pago
    ) values (
      v_nombre,
      coalesce(nullif(trim(p_cliente_nuevo->>'tipo'), '')::tipo_cliente, 'empresa'::tipo_cliente),
      v_cuit,
      nullif(trim(p_cliente_nuevo->>'condicion_iva'), '')::condicion_iva,
      nullif(trim(p_cliente_nuevo->>'telefono'), ''),
      nullif(trim(p_cliente_nuevo->>'email'), ''),
      nullif(trim(p_cliente_nuevo->>'direccion'), ''),
      nullif(trim(p_cliente_nuevo->>'localidad'), ''),
      coalesce(nullif(trim(p_cliente_nuevo->>'condicion_pago'), '')::condicion_pago, 'contado'::condicion_pago)
    ) returning id into v_cliente_id;
  else
    v_cliente_id := p_cliente_id;
    if not exists (select 1 from clientes where id = v_cliente_id) then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  update presupuestos
  set estado = 'aceptado',
      cliente_id = v_cliente_id,
      respondido_at = now()
  where id = pr.id
  returning * into pr;

  for s in
    select id, estado
    from servicios
    where presupuesto_id = pr.id and estado in ('consulta', 'presupuestado')
  loop
    v_items_procesados := v_items_procesados + 1;
    update servicios set cliente_id = v_cliente_id where id = s.id;
    if s.estado = 'consulta' then
      perform cambiar_estado(s.id, 'presupuestado', 'Presupuesto #' || pr.numero);
    end if;
    perform cambiar_estado(s.id, 'aceptado', 'Presupuesto #' || pr.numero || ' aceptado');
  end loop;

  if v_items_procesados = 0 then
    raise exception 'El presupuesto no tiene ítems para aceptar';
  end if;

  return pr;
end $$;

-- ---------- Hardening y Grants ----------
revoke execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) to service_role;

revoke execute on function public.crear_presupuesto(jsonb, jsonb) from public, anon;
grant execute on function public.crear_presupuesto(jsonb, jsonb) to authenticated, service_role;

revoke execute on function public.agregar_items_presupuesto(uuid, jsonb) from public, anon;
grant execute on function public.agregar_items_presupuesto(uuid, jsonb) to authenticated, service_role;

revoke execute on function public.marcar_presupuesto_enviado(uuid, text) from public, anon;
grant execute on function public.marcar_presupuesto_enviado(uuid, text) to authenticated, service_role;

revoke execute on function public.rechazar_presupuesto(uuid, text) from public, anon;
grant execute on function public.rechazar_presupuesto(uuid, text) to authenticated, service_role;

revoke execute on function public.aceptar_presupuesto(uuid, uuid, jsonb) from public, anon;
grant execute on function public.aceptar_presupuesto(uuid, uuid, jsonb) to authenticated, service_role;
