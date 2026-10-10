-- =============================================================================
-- ELEVAPLUS Gestión — 0037 Asistente Chimuelo en la app
--
-- 1. Enums y tablas núcleo del asistente:
--    - rol_mensaje_asistente ('usuario', 'asistente')
--    - estado_propuesta ('pendiente', 'confirmada', 'descartada', 'vencida', 'fallida')
--    - asistente_conversaciones
--    - asistente_propuestas
--    - asistente_mensajes
-- 2. Índices y triggers (updated_at).
-- 3. RLS por rol:
--    - admin: acceso total (auditoría)
--    - oficina: ve e interactúa solo con sus conversaciones y mensajes
--    - chofer: sin acceso en v1
--    - propuestas: select para el dueño/admin; inserción/actualización directa bloqueada
-- 4. Extracción de lógica común de inserción:
--    - _insertar_un_servicio: función interna para insertar UN servicio con paradas, alquiler, etc.
--    - _insertar_items_presupuesto: redefinida reutilizando _insertar_un_servicio
-- 5. RPCs:
--    - crear_servicio: atómica con paradas, alquiler, y opcionalmente programar_servicio
--    - crear_propuesta: crea propuesta asociada a una conversación del usuario
--    - confirmar_propuesta: con for update, idempotente ante doble toque, maneja expiración
--      y marca 'fallida' si crear_servicio falla sin abortar la transacción de la marca
--    - descartar_propuesta: marca 'descartada' una propuesta pendiente
-- 6. Grants a authenticated y service_role, y revocación explícita para public y anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos / Enums
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'rol_mensaje_asistente') then
    create type public.rol_mensaje_asistente as enum ('usuario', 'asistente');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_propuesta') then
    create type public.estado_propuesta as enum ('pendiente', 'confirmada', 'descartada', 'vencida', 'fallida');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.asistente_conversaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  titulo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asistente_propuestas (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.asistente_conversaciones(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  accion text not null check (accion in ('crear_servicio')),
  datos jsonb not null,
  resumen text not null,
  estado public.estado_propuesta not null default 'pendiente',
  resultado_id uuid references public.servicios(id) on delete set null,
  error text,
  expira_at timestamptz not null default now() + interval '30 minutes',
  resuelta_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.asistente_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.asistente_conversaciones(id) on delete cascade,
  rol public.rol_mensaje_asistente not null,
  contenido text not null,
  fue_audio boolean not null default false,
  audio_segundos numeric(6,2),
  herramientas jsonb,
  propuesta_id uuid references public.asistente_propuestas(id) on delete set null,
  modelo text,
  prompt_version text,
  tokens_entrada int,
  tokens_salida int,
  costo_usd numeric(10,6),
  error text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Índices y Triggers
-- -----------------------------------------------------------------------------
create index if not exists ac_usuario_created_idx on public.asistente_conversaciones (usuario_id, created_at desc);
create index if not exists ap_conversacion_idx on public.asistente_propuestas (conversacion_id);
create index if not exists ap_usuario_estado_idx on public.asistente_propuestas (usuario_id, estado);
create index if not exists am_conversacion_created_idx on public.asistente_mensajes (conversacion_id, created_at);

drop trigger if exists asistente_conversaciones_updated_at on public.asistente_conversaciones;
create trigger asistente_conversaciones_updated_at
  before update on public.asistente_conversaciones
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. RLS (Row Level Security)
-- -----------------------------------------------------------------------------
alter table public.asistente_conversaciones enable row level security;
alter table public.asistente_propuestas enable row level security;
alter table public.asistente_mensajes enable row level security;

-- asistente_conversaciones
drop policy if exists ac_select on public.asistente_conversaciones;
create policy ac_select on public.asistente_conversaciones
  for select
  using (
    es_admin() or (es_admin_u_oficina() and usuario_id = auth.uid())
  );

drop policy if exists ac_insert on public.asistente_conversaciones;
create policy ac_insert on public.asistente_conversaciones
  for insert
  with check (
    es_admin_u_oficina() and usuario_id = auth.uid()
  );

drop policy if exists ac_update on public.asistente_conversaciones;
create policy ac_update on public.asistente_conversaciones
  for update
  using (
    es_admin() or (es_admin_u_oficina() and usuario_id = auth.uid())
  )
  with check (
    es_admin() or (es_admin_u_oficina() and usuario_id = auth.uid())
  );

drop policy if exists ac_delete on public.asistente_conversaciones;
create policy ac_delete on public.asistente_conversaciones
  for delete
  using (
    es_admin() or (es_admin_u_oficina() and usuario_id = auth.uid())
  );

-- asistente_mensajes
drop policy if exists am_select on public.asistente_mensajes;
create policy am_select on public.asistente_mensajes
  for select
  using (
    es_admin() or (
      es_admin_u_oficina() and exists (
        select 1 from public.asistente_conversaciones c
        where c.id = conversacion_id and c.usuario_id = auth.uid()
      )
    )
  );

drop policy if exists am_insert on public.asistente_mensajes;
create policy am_insert on public.asistente_mensajes
  for insert
  with check (
    es_admin_u_oficina() and exists (
      select 1 from public.asistente_conversaciones c
      where c.id = conversacion_id and c.usuario_id = auth.uid()
    )
  );

drop policy if exists am_delete on public.asistente_mensajes;
create policy am_delete on public.asistente_mensajes
  for delete
  using (
    es_admin() or (
      es_admin_u_oficina() and exists (
        select 1 from public.asistente_conversaciones c
        where c.id = conversacion_id and c.usuario_id = auth.uid()
      )
    )
  );

-- asistente_propuestas: solo lectura desde el front; inserción y resolución solo vía RPCs
drop policy if exists ap_select on public.asistente_propuestas;
create policy ap_select on public.asistente_propuestas
  for select
  using (
    es_admin() or (es_admin_u_oficina() and usuario_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 5. Grants en tablas
-- -----------------------------------------------------------------------------
revoke all on table public.asistente_conversaciones from public, anon;
grant select, insert, update, delete on table public.asistente_conversaciones to authenticated, service_role;

revoke all on table public.asistente_mensajes from public, anon;
grant select, insert, update, delete on table public.asistente_mensajes to authenticated, service_role;

revoke all on table public.asistente_propuestas from public, anon;
grant select, insert, update, delete on table public.asistente_propuestas to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Función interna común para insertar un servicio (_insertar_un_servicio)
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
    coalesce(nullif(p_datos->>'hora_programada', '')::time, nullif(p_datos->>'hora', '')::time),
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
-- 7. Redefinición de _insertar_items_presupuesto
-- -----------------------------------------------------------------------------
create or replace function public._insertar_items_presupuesto(
  p_presupuesto_id uuid,
  p_cliente_id uuid,
  p_items jsonb
) returns setof public.servicios
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  v_serv public.servicios%rowtype;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe indicar al menos un ítem';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    v_serv := public._insertar_un_servicio(p_presupuesto_id, p_cliente_id, item);
    return next v_serv;
  end loop;

  return;
end $$;

revoke execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 8. RPC crear_servicio
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

  -- 4. Insertar servicio mediante lógica común (en estado consulta)
  v_serv := public._insertar_un_servicio(
    nullif(p_datos->>'presupuesto_id', '')::uuid,
    v_cliente_id,
    p_datos
  );

  -- 5. Si hay choferes, programar_servicio
  if v_choferes is not null and array_length(v_choferes, 1) > 0 then
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

  return v_serv;
end $$;

revoke execute on function public.crear_servicio(jsonb, uuid[]) from public, anon;
grant execute on function public.crear_servicio(jsonb, uuid[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. RPC crear_propuesta
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

  if p_accion is null or p_accion not in ('crear_servicio') then
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
-- 10. RPC confirmar_propuesta
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

  -- Ejecución con control de excepciones: si crear_servicio falla, marcar 'fallida' sin abortar la transacción de la marca
  begin
    if v_propuesta.datos ? 'choferes' and jsonb_typeof(v_propuesta.datos->'choferes') = 'array' then
      select coalesce(array_agg(elem::text::uuid), '{}'::uuid[])
      into v_choferes
      from jsonb_array_elements_text(v_propuesta.datos->'choferes') elem
      where nullif(trim(elem), '') is not null;
    end if;

    if v_propuesta.accion = 'crear_servicio' then
      v_serv := public.crear_servicio(v_propuesta.datos, v_choferes);
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

-- -----------------------------------------------------------------------------
-- 11. RPC descartar_propuesta
-- -----------------------------------------------------------------------------
create or replace function public.descartar_propuesta(
  p_propuesta_id uuid
) returns public.asistente_propuestas
language plpgsql security definer set search_path = public as $$
declare
  v_propuesta public.asistente_propuestas%rowtype;
begin
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden descartar propuestas';
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

  if v_propuesta.usuario_id <> auth.uid() and not es_admin() then
    raise exception 'No autorizado: la propuesta no pertenece al usuario actual';
  end if;

  if v_propuesta.estado = 'confirmada' then
    raise exception 'No se puede descartar una propuesta ya confirmada';
  end if;

  if v_propuesta.estado = 'descartada' then
    return v_propuesta;
  end if;

  update public.asistente_propuestas set
    estado = 'descartada',
    resuelta_at = now()
  where id = v_propuesta.id
  returning * into v_propuesta;

  return v_propuesta;
end $$;

revoke execute on function public.descartar_propuesta(uuid) from public, anon;
grant execute on function public.descartar_propuesta(uuid) to authenticated, service_role;
