-- ELEVAPLUS Gestión — 0028 Carga asegurada en traslados

-- 1. Nuevas columnas en servicios
alter table public.servicios
  add column if not exists seguro_importe numeric(14,2),
  add column if not exists monto_seguro numeric(14,2);

-- 2. Constraints
alter table public.servicios
  drop constraint if exists servicios_seguro_ambos_o_ninguno,
  add constraint servicios_seguro_ambos_o_ninguno
    check ((seguro_importe is null and monto_seguro is null) or (seguro_importe is not null and monto_seguro is not null));

alter table public.servicios
  drop constraint if exists servicios_seguro_solo_traslado,
  add constraint servicios_seguro_solo_traslado
    check (seguro_importe is null or tipo = 'traslado');

alter table public.servicios
  drop constraint if exists servicios_seguro_monto_positivo,
  add constraint servicios_seguro_monto_positivo
    check (monto_seguro is null or monto_seguro > 0);

alter table public.servicios
  drop constraint if exists servicios_seguro_menor_igual_monto,
  add constraint servicios_seguro_menor_igual_monto
    check (monto_seguro is null or (monto is not null and monto_seguro <= monto));

-- 3. Trigger para cálculo y sincronización de monto_seguro
create or replace function public.sincronizar_seguro_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo_monto_seguro numeric(14,2);
begin
  if new.tipo = 'traslado' and new.seguro_importe is not null then
    if coalesce(new.aplica_iva, true) then
      v_nuevo_monto_seguro := round(new.seguro_importe / 1.21, 2);
    else
      v_nuevo_monto_seguro := new.seguro_importe;
    end if;
  else
    v_nuevo_monto_seguro := null;
  end if;

  if tg_op = 'UPDATE' then
    if (new.monto is not null) and (new.monto is not distinct from old.monto) and (v_nuevo_monto_seguro is distinct from old.monto_seguro) then
      new.monto := old.monto - coalesce(old.monto_seguro, 0) + coalesce(v_nuevo_monto_seguro, 0);
    end if;
  end if;

  new.monto_seguro := v_nuevo_monto_seguro;

  return new;
end;
$$;

drop trigger if exists trg_servicios_sincronizar_seguro on public.servicios;
create trigger trg_servicios_sincronizar_seguro
before insert or update on public.servicios
for each row
execute function public.sincronizar_seguro_servicio();

-- 4. Extensión de _insertar_items_presupuesto para aceptar seguro_importe
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
  v_seguro_importe numeric(14,2);
  v_monto_seguro numeric(14,2);
  v_aplica_iva boolean;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe indicar al menos un ítem';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    v_tipo := (item->>'tipo')::tipo_servicio;
    v_moneda := coalesce(nullif(trim(item->>'moneda'), ''), 'ARS');
    v_fecha_prog := nullif(item->>'fecha_programada', '')::date;
    v_aplica_iva := coalesce((item->>'aplica_iva')::boolean, true);

    v_seguro_importe := nullif(item->>'seguro_importe', '')::numeric;
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
      estado,
      creado_por
    ) values (
      p_presupuesto_id,
      p_cliente_id,
      v_tipo,
      nullif(trim(item->>'descripcion'), ''),
      nullif(item->>'monto', '')::numeric,
      v_seguro_importe,
      v_monto_seguro,
      v_moneda,
      nullif(item->>'monto_moneda', '')::numeric,
      nullif(item->>'cotizacion', '')::numeric,
      v_aplica_iva,
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

revoke execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public._insertar_items_presupuesto(uuid, uuid, jsonb) to service_role;
