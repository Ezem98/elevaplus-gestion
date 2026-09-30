-- =============================================================================
-- ELEVAPLUS Gestión — 0032 Vínculos entre servicios, traslados de máquinas y alquileres
--
-- 1. Tipo enum rol_vinculo ('traslado_maquina', 'relacionado')
-- 2. Columnas en servicios: vinculado_a, rol_vinculo, traslado_incluido,
--    direccion_trabajo, localidad_trabajo, trabajo_a_realizar
-- 3. Constraints vinculo_coherente, traslado_incluido_solo_traslados, traslado_incluido_sin_monto
-- 4. RPC crear_traslado_vinculado
-- 5. RPC vincular_servicio
-- 6. RPC desvincular_servicio
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipo enum rol_vinculo
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.rol_vinculo as enum ('traslado_maquina', 'relacionado');
exception
  when duplicate_object then null;
end $$;

grant usage on type public.rol_vinculo to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Columnas y constraints en servicios
-- -----------------------------------------------------------------------------
alter table public.servicios
  add column if not exists vinculado_a uuid references public.servicios(id),
  add column if not exists rol_vinculo public.rol_vinculo,
  add column if not exists traslado_incluido boolean not null default false,
  add column if not exists direccion_trabajo text,
  add column if not exists localidad_trabajo text,
  add column if not exists trabajo_a_realizar text;

alter table public.servicios
  drop constraint if exists vinculo_coherente,
  add constraint vinculo_coherente check (
    (vinculado_a is null and rol_vinculo is null and not traslado_incluido)
    or (vinculado_a is not null and rol_vinculo is not null and vinculado_a <> id)
  );

alter table public.servicios
  drop constraint if exists traslado_incluido_solo_traslados,
  add constraint traslado_incluido_solo_traslados
    check (not traslado_incluido or (tipo = 'traslado' and rol_vinculo = 'traslado_maquina'));

alter table public.servicios
  drop constraint if exists traslado_incluido_sin_monto,
  add constraint traslado_incluido_sin_monto
    check (not traslado_incluido or (coalesce(monto, 0) = 0 and no_facturable));

create index if not exists servicios_vinculado_idx on public.servicios (vinculado_a);

grant select, insert, update, delete on table public.servicios to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. RPC crear_traslado_vinculado
-- -----------------------------------------------------------------------------
create or replace function public.crear_traslado_vinculado(
  p_servicio_id uuid,
  p_datos jsonb default '{}'::jsonb,
  p_incluido boolean default false,
  p_choferes uuid[] default null
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  v_principal servicios%rowtype;
  v_traslado servicios%rowtype;
  v_cliente_id uuid;
  v_fecha date;
  v_hora time;
  v_origen text;
  v_destino text;
  v_destino_default text;
  v_vehiculo_id uuid;
  v_maquina_id uuid;
  v_ida_y_vuelta boolean;
  v_descripcion text;
  v_monto numeric(14,2);
  v_aplica_iva boolean;
  v_no_facturable boolean;
  v_traslado_incluido boolean;
  v_moneda text;
begin
  -- 1. Validar permisos: solo admin u oficina
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden crear traslados vinculados';
  end if;

  -- 2. Validar parámetro obligatorio
  if p_servicio_id is null then
    raise exception 'Debe especificar el servicio principal';
  end if;

  -- 3. Obtener y bloquear el servicio principal
  select * into v_principal from servicios where id = p_servicio_id for update;
  if not found then
    raise exception 'Servicio principal no encontrado';
  end if;

  -- 4. Validar estado del principal: rechazar si está cancelado
  if v_principal.estado = 'cancelado' then
    raise exception 'No se puede vincular a un servicio principal cancelado';
  end if;

  -- 5. Validar reglas de vinculación:
  -- - No se permiten cadenas: el principal no puede estar vinculado a otro
  if v_principal.vinculado_a is not null then
    raise exception 'No se permiten vínculos en cadena: el servicio principal ya está vinculado a otro';
  end if;

  -- - El principal no puede ser un traslado de máquina
  if v_principal.rol_vinculo = 'traslado_maquina' then
    raise exception 'Un traslado de máquina no puede tener servicios vinculados';
  end if;

  -- 6. Precarga y resolución de datos
  v_cliente_id := coalesce(nullif(p_datos->>'cliente_id', '')::uuid, v_principal.cliente_id);
  v_fecha := coalesce(
    nullif(p_datos->>'fecha_programada', '')::date,
    nullif(p_datos->>'fecha', '')::date,
    v_principal.fecha_programada
  );
  v_hora := coalesce(
    nullif(p_datos->>'hora_programada', '')::time,
    nullif(p_datos->>'hora', '')::time
  );

  -- Destino: direccion_trabajo + localidad_trabajo del principal por defecto, o destino del principal
  v_destino_default := case
    when nullif(trim(v_principal.direccion_trabajo), '') is not null and nullif(trim(v_principal.localidad_trabajo), '') is not null then
      trim(v_principal.direccion_trabajo) || ', ' || trim(v_principal.localidad_trabajo)
    when nullif(trim(v_principal.direccion_trabajo), '') is not null then
      trim(v_principal.direccion_trabajo)
    when nullif(trim(v_principal.localidad_trabajo), '') is not null then
      trim(v_principal.localidad_trabajo)
    else
      v_principal.destino
  end;
  v_destino := coalesce(nullif(trim(p_datos->>'destino'), ''), v_destino_default);

  v_origen := nullif(trim(p_datos->>'origen'), '');
  v_vehiculo_id := nullif(p_datos->>'vehiculo_id', '')::uuid;
  v_maquina_id := coalesce(nullif(p_datos->>'maquina_id', '')::uuid, v_principal.maquina_id);
  v_ida_y_vuelta := coalesce(
    (p_datos->>'ida_y_vuelta')::boolean,
    (v_principal.tipo = 'alquiler_hora')
  );
  v_descripcion := coalesce(nullif(trim(p_datos->>'descripcion'), ''), 'Traslado de máquina');
  v_moneda := coalesce(nullif(trim(p_datos->>'moneda'), ''), 'ARS');
  v_aplica_iva := coalesce((p_datos->>'aplica_iva')::boolean, true);

  if p_incluido then
    v_monto := 0;
    v_no_facturable := true;
    v_traslado_incluido := true;
  else
    v_monto := nullif(p_datos->>'monto', '')::numeric;
    v_no_facturable := coalesce((p_datos->>'no_facturable')::boolean, false);
    v_traslado_incluido := false;
  end if;

  -- 7. Insertar el traslado vinculado en estado consulta
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    origen,
    destino,
    km,
    ida_y_vuelta,
    fecha_programada,
    hora_programada,
    vehiculo_id,
    maquina_id,
    monto,
    moneda,
    aplica_iva,
    no_facturable,
    vinculado_a,
    rol_vinculo,
    traslado_incluido,
    creado_por
  ) values (
    v_cliente_id,
    'traslado',
    'consulta',
    v_descripcion,
    v_origen,
    v_destino,
    nullif(p_datos->>'km', '')::numeric,
    v_ida_y_vuelta,
    v_fecha,
    v_hora,
    v_vehiculo_id,
    v_maquina_id,
    v_monto,
    v_moneda,
    v_aplica_iva,
    v_no_facturable,
    v_principal.id,
    'traslado_maquina',
    v_traslado_incluido,
    auth.uid()
  ) returning * into v_traslado;

  -- 8. Si vienen choferes y fecha, llamar a programar_servicio
  if p_choferes is not null and array_length(p_choferes, 1) > 0 and v_fecha is not null then
    v_traslado := public.programar_servicio(
      v_traslado.id,
      v_fecha,
      v_hora,
      v_vehiculo_id,
      v_maquina_id,
      p_choferes
    );
  end if;

  return v_traslado;
end $$;

revoke execute on function public.crear_traslado_vinculado(uuid, jsonb, boolean, uuid[]) from public, anon;
grant execute on function public.crear_traslado_vinculado(uuid, jsonb, boolean, uuid[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC vincular_servicio
-- -----------------------------------------------------------------------------
create or replace function public.vincular_servicio(
  p_servicio_id uuid,
  p_principal_id uuid,
  p_rol rol_vinculo,
  p_incluido boolean default false
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  v_servicio servicios%rowtype;
  v_principal servicios%rowtype;
begin
  -- 1. Validar permisos: solo admin u oficina
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden vincular servicios';
  end if;

  -- 2. Validar parámetros
  if p_servicio_id is null or p_principal_id is null then
    raise exception 'Debe especificar el servicio y el servicio principal';
  end if;

  if p_servicio_id = p_principal_id then
    raise exception 'Un servicio no puede vincularse a sí mismo';
  end if;

  if p_rol is null then
    raise exception 'Debe especificar el rol del vínculo';
  end if;

  -- 3. Bloquear y obtener ambos servicios en orden de ID consistente para evitar deadlocks
  if p_servicio_id < p_principal_id then
    select * into v_servicio from servicios where id = p_servicio_id for update;
    select * into v_principal from servicios where id = p_principal_id for update;
  else
    select * into v_principal from servicios where id = p_principal_id for update;
    select * into v_servicio from servicios where id = p_servicio_id for update;
  end if;

  if v_servicio.id is null then
    raise exception 'Servicio a vincular no encontrado';
  end if;
  if v_principal.id is null then
    raise exception 'Servicio principal no encontrado';
  end if;

  -- 4. Validar estado del principal: rechazar si está cancelado
  if v_principal.estado = 'cancelado' then
    raise exception 'No se puede vincular a un servicio principal cancelado';
  end if;

  -- 5. Validar que ninguno de los dos esté vinculado a otro (un solo nivel)
  if v_principal.vinculado_a is not null then
    raise exception 'No se permiten vínculos en cadena: el servicio principal ya está vinculado a otro';
  end if;

  if v_servicio.vinculado_a is not null then
    raise exception 'El servicio ya está vinculado a otro servicio';
  end if;

  -- 6. Validar que el que se vincula no tenga vinculados propios
  if exists (select 1 from servicios where vinculado_a = v_servicio.id) then
    raise exception 'No se permiten vínculos en cadena: el servicio a vincular ya tiene servicios vinculados';
  end if;

  -- 7. Validar rol traslado_maquina: solo si el servicio es un traslado (incluido o no)
  if p_rol = 'traslado_maquina' and v_servicio.tipo <> 'traslado' then
    raise exception 'Solo un traslado puede tener el rol traslado_maquina';
  end if;

  -- 8. Validaciones específicas para traslado incluido
  if p_incluido then
    if p_rol <> 'traslado_maquina' then
      raise exception 'Un traslado incluido debe tener el rol traslado_maquina';
    end if;

    if v_servicio.estado in ('cobrado', 'facturado') or v_servicio.factura_id is not null or coalesce(v_servicio.monto_cobrado, 0) > 0 then
      raise exception 'No se puede incluir un traslado que ya está cobrado o facturado';
    end if;

    update servicios set
      vinculado_a = v_principal.id,
      rol_vinculo = p_rol,
      traslado_incluido = true,
      monto = 0,
      no_facturable = true,
      updated_at = now()
    where id = v_servicio.id
    returning * into v_servicio;
  else
    update servicios set
      vinculado_a = v_principal.id,
      rol_vinculo = p_rol,
      traslado_incluido = false,
      updated_at = now()
    where id = v_servicio.id
    returning * into v_servicio;
  end if;

  return v_servicio;
end $$;

revoke execute on function public.vincular_servicio(uuid, uuid, rol_vinculo, boolean) from public, anon;
grant execute on function public.vincular_servicio(uuid, uuid, rol_vinculo, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. RPC desvincular_servicio
-- -----------------------------------------------------------------------------
create or replace function public.desvincular_servicio(
  p_servicio_id uuid
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  v_servicio servicios%rowtype;
begin
  -- 1. Validar permisos: solo admin u oficina
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden desvincular servicios';
  end if;

  -- 2. Validar parámetro
  if p_servicio_id is null then
    raise exception 'Debe especificar el servicio a desvincular';
  end if;

  -- 3. Obtener y bloquear el servicio
  select * into v_servicio from servicios where id = p_servicio_id for update;
  if not found then
    raise exception 'Servicio no encontrado';
  end if;

  -- 4. Validar que esté vinculado
  if v_servicio.vinculado_a is null then
    raise exception 'El servicio no está vinculado a ningún otro';
  end if;

  -- 5. Si era un traslado incluido, no se permite si ya está cobrado o facturado
  if v_servicio.traslado_incluido then
    if v_servicio.estado in ('cobrado', 'facturado') or v_servicio.factura_id is not null or coalesce(v_servicio.monto_cobrado, 0) > 0 then
      raise exception 'No se puede desvincular un traslado incluido que ya está cobrado o facturado';
    end if;
  end if;

  -- 6. Quitar vínculo. Si era traslado incluido: monto = null y no_facturable = false
  update servicios set
    vinculado_a = null,
    rol_vinculo = null,
    traslado_incluido = false,
    monto = case when v_servicio.traslado_incluido then null else monto end,
    no_facturable = case when v_servicio.traslado_incluido then false else no_facturable end,
    updated_at = now()
  where id = v_servicio.id
  returning * into v_servicio;

  return v_servicio;
end $$;

revoke execute on function public.desvincular_servicio(uuid) from public, anon;
grant execute on function public.desvincular_servicio(uuid) to authenticated, service_role;
