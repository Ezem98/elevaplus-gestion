-- ELEVAPLUS Gestión — 0027 Moneda en servicios y RPC atómica registrar_factura

-- ---------- 1. Trigger de sincronización de moneda y monto ----------
create or replace function public.sincronizar_moneda_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moneda = 'USD' then
    if new.monto_moneda is not null and new.cotizacion is not null then
      new.monto := round(new.monto_moneda * new.cotizacion, 2);
    end if;
  else
    new.monto_moneda := null;
    new.cotizacion := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_servicios_sincronizar_moneda on public.servicios;
create trigger trg_servicios_sincronizar_moneda
before insert or update on public.servicios
for each row
execute function public.sincronizar_moneda_servicio();

-- ---------- 2. RPC atómica registrar_factura ----------
create or replace function public.registrar_factura(
  p_datos jsonb,
  p_servicios jsonb
) returns facturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo tipo_factura;
  v_punto_venta int;
  v_numero bigint;
  v_fecha date;
  v_cliente_id uuid;
  v_in_neto numeric(14,2);
  v_in_iva numeric(14,2);
  v_in_total numeric(14,2);
  v_notas text;
  v_cae text;
  v_factura facturas%rowtype;
  v_elem jsonb;
  v_s_id uuid;
  v_cotiz numeric(12,4);
  v_serv servicios%rowtype;
  v_monto_servicio numeric(14,2);
  v_numero_formateado text;
  v_calc_neto numeric(14,2) := 0;
  v_calc_base_iva numeric(14,2) := 0;
  v_calc_iva numeric(14,2) := 0;
  v_calc_total numeric(14,2) := 0;
begin
  -- 1. Control de autorización
  if not es_admin_u_oficina() and auth.role() <> 'service_role' then
    raise exception 'No autorizado';
  end if;

  -- 2. Validaciones básicas de p_datos
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos de la factura son obligatorios';
  end if;

  v_tipo := (p_datos->>'tipo')::tipo_factura;
  v_punto_venta := nullif(trim(p_datos->>'punto_venta'), '')::int;
  v_numero := nullif(trim(p_datos->>'numero'), '')::bigint;
  v_fecha := coalesce(nullif(trim(p_datos->>'fecha'), '')::date, current_date);
  v_cliente_id := (p_datos->>'cliente_id')::uuid;
  v_notas := nullif(trim(p_datos->>'notas'), '');
  v_cae := nullif(trim(p_datos->>'cae'), '');

  if v_tipo is null then
    raise exception 'El tipo de factura es obligatorio';
  end if;

  if v_punto_venta is null or v_punto_venta <= 0 then
    raise exception 'El punto de venta es obligatorio';
  end if;

  if v_numero is null or v_numero <= 0 then
    raise exception 'El número de factura es obligatorio';
  end if;

  if v_cliente_id is null then
    raise exception 'El cliente es obligatorio';
  end if;

  if exists (
    select 1 from facturas
    where tipo = v_tipo and punto_venta = v_punto_venta and numero = v_numero
  ) then
    raise exception 'Ya existe una factura con ese número en ese punto de venta';
  end if;

  if p_servicios is null or jsonb_typeof(p_servicios) <> 'array' or jsonb_array_length(p_servicios) = 0 then
    raise exception 'Debe incluir al menos un servicio para facturar';
  end if;

  -- Totales enviados por el cliente (para verificar concordancia si fueron provistos)
  v_in_neto := nullif(trim(p_datos->>'neto'), '')::numeric;
  v_in_iva := nullif(trim(p_datos->>'iva'), '')::numeric;
  v_in_total := nullif(trim(p_datos->>'total'), '')::numeric;

  -- 3. Validar servicios y calcular totales desde la base
  for v_elem in select * from jsonb_array_elements(p_servicios)
  loop
    if jsonb_typeof(v_elem) = 'object' then
      v_s_id := (v_elem->>'id')::uuid;
      v_cotiz := nullif(trim(v_elem->>'cotizacion'), '')::numeric(12,4);
    else
      v_s_id := trim(v_elem::text, '"')::uuid;
      v_cotiz := null;
    end if;

    select * into v_serv from servicios where id = v_s_id for update;
    if not found then
      raise exception 'Servicio % no encontrado', v_s_id;
    end if;

    if v_serv.cliente_id is distinct from v_cliente_id then
      raise exception 'El servicio % no pertenece al cliente de la factura', v_s_id;
    end if;

    if v_serv.factura_id is not null then
      raise exception 'El servicio % ya se encuentra facturado', v_s_id;
    end if;

    if v_serv.moneda = 'USD' then
      if v_cotiz is null or v_cotiz <= 0 then
        raise exception 'Falta la cotización del día para el servicio #%', v_serv.numero;
      end if;
      v_monto_servicio := round(v_serv.monto_moneda * v_cotiz, 2);
    else
      v_monto_servicio := coalesce(v_serv.monto, 0);
    end if;

    v_calc_neto := v_calc_neto + v_monto_servicio;
    if coalesce(v_serv.aplica_iva, true) then
      v_calc_base_iva := v_calc_base_iva + v_monto_servicio;
    end if;
  end loop;

  v_calc_neto := round(v_calc_neto, 2);
  v_calc_iva := round(v_calc_base_iva * 0.21, 2);
  v_calc_total := round(v_calc_neto + v_calc_iva, 2);

  -- Si p_datos trae totales y difieren más de 1 centavo de los calculados, arrojar error
  if v_in_neto is not null and abs(v_in_neto - v_calc_neto) > 0.01 then
    raise exception 'Los totales no coinciden con los servicios';
  end if;
  if v_in_iva is not null and abs(v_in_iva - v_calc_iva) > 0.01 then
    raise exception 'Los totales no coinciden con los servicios';
  end if;
  if v_in_total is not null and abs(v_in_total - v_calc_total) > 0.01 then
    raise exception 'Los totales no coinciden con los servicios';
  end if;

  -- 4. Insertar la factura siempre con los totales calculados en la base
  insert into facturas (
    tipo,
    punto_venta,
    numero,
    fecha,
    cliente_id,
    neto,
    iva,
    total,
    notas,
    cae,
    estado_emision
  ) values (
    v_tipo,
    v_punto_venta,
    v_numero,
    v_fecha,
    v_cliente_id,
    v_calc_neto,
    v_calc_iva,
    v_calc_total,
    v_notas,
    v_cae,
    'manual'::estado_emision
  ) returning * into v_factura;

  v_numero_formateado := v_tipo::text || ' ' || lpad(v_punto_venta::text, 4, '0') || '-' || lpad(v_numero::text, 8, '0');

  -- 5. Actualizar servicios y cambiar estados a facturado
  for v_elem in select * from jsonb_array_elements(p_servicios)
  loop
    if jsonb_typeof(v_elem) = 'object' then
      v_s_id := (v_elem->>'id')::uuid;
      v_cotiz := nullif(trim(v_elem->>'cotizacion'), '')::numeric(12,4);
    else
      v_s_id := trim(v_elem::text, '"')::uuid;
      v_cotiz := null;
    end if;

    select * into v_serv from servicios where id = v_s_id;

    if v_serv.moneda = 'USD' then
      update servicios
      set factura_id = v_factura.id,
          cotizacion = v_cotiz
      where id = v_s_id;
    else
      update servicios
      set factura_id = v_factura.id
      where id = v_s_id;
    end if;

    perform cambiar_estado(
      v_s_id,
      'facturado'::estado_servicio,
      'Factura ' || v_numero_formateado
    );
  end loop;

  return v_factura;
end;
$$;

revoke execute on function public.registrar_factura(jsonb, jsonb) from public, anon;
grant execute on function public.registrar_factura(jsonb, jsonb) to authenticated, service_role;

-- ---------- 3. RPC atómica crear_factura_borrador ----------
create or replace function public.crear_factura_borrador(
  p_datos jsonb,
  p_servicios jsonb
) returns facturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo tipo_factura;
  v_punto_venta int;
  v_cliente_id uuid;
  v_periodo_desde date;
  v_periodo_hasta date;
  v_lote_id uuid;
  v_concepto int := 2;
  v_factura facturas%rowtype;
  v_elem jsonb;
  v_s_id uuid;
  v_cotiz numeric(12,4);
  v_serv servicios%rowtype;
  v_monto_servicio numeric(14,2);
  v_calc_neto numeric(14,2) := 0;
  v_calc_base_iva numeric(14,2) := 0;
  v_calc_iva numeric(14,2) := 0;
  v_calc_total numeric(14,2) := 0;
begin
  -- 1. Control de autorización (exclusivo para service_role del worker)
  if auth.role() <> 'service_role' then
    raise exception 'No autorizado';
  end if;

  -- 2. Validaciones básicas de p_datos
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos de la factura son obligatorios';
  end if;

  v_tipo := (p_datos->>'tipo')::tipo_factura;
  v_punto_venta := nullif(trim(p_datos->>'punto_venta'), '')::int;
  v_cliente_id := (p_datos->>'cliente_id')::uuid;
  v_periodo_desde := nullif(trim(p_datos->>'periodo_desde'), '')::date;
  v_periodo_hasta := nullif(trim(p_datos->>'periodo_hasta'), '')::date;
  v_lote_id := nullif(trim(p_datos->>'lote_id'), '')::uuid;
  if p_datos->>'concepto' is not null then
    v_concepto := (p_datos->>'concepto')::int;
  end if;

  if v_tipo is null then
    raise exception 'El tipo de factura es obligatorio';
  end if;

  if v_punto_venta is null or v_punto_venta <= 0 then
    raise exception 'El punto de venta es obligatorio';
  end if;

  if v_cliente_id is null then
    raise exception 'El cliente es obligatorio';
  end if;

  if p_servicios is null or jsonb_typeof(p_servicios) <> 'array' or jsonb_array_length(p_servicios) = 0 then
    raise exception 'Debe incluir al menos un servicio para facturar';
  end if;

  -- 3. Validar servicios y calcular totales desde la base
  for v_elem in select * from jsonb_array_elements(p_servicios)
  loop
    if jsonb_typeof(v_elem) = 'object' then
      v_s_id := (v_elem->>'id')::uuid;
      v_cotiz := nullif(trim(v_elem->>'cotizacion'), '')::numeric(12,4);
    else
      v_s_id := trim(v_elem::text, '"')::uuid;
      v_cotiz := null;
    end if;

    select * into v_serv from servicios where id = v_s_id for update;
    if not found then
      raise exception 'Servicio % no encontrado', v_s_id;
    end if;

    if v_serv.cliente_id is distinct from v_cliente_id then
      raise exception 'El servicio % no pertenece al cliente de la factura', v_s_id;
    end if;

    if v_serv.factura_id is not null or v_serv.estado = 'facturado' then
      raise exception 'El servicio % ya se encuentra facturado', v_s_id;
    end if;

    if v_serv.moneda = 'USD' then
      if v_cotiz is null or v_cotiz <= 0 then
        raise exception 'Falta la cotización del día para el servicio #%', v_serv.numero;
      end if;
      v_monto_servicio := round(v_serv.monto_moneda * v_cotiz, 2);
    else
      v_monto_servicio := coalesce(v_serv.monto, 0);
    end if;

    v_calc_neto := v_calc_neto + v_monto_servicio;
    if coalesce(v_serv.aplica_iva, true) then
      v_calc_base_iva := v_calc_base_iva + v_monto_servicio;
    end if;
  end loop;

  v_calc_neto := round(v_calc_neto, 2);
  v_calc_iva := round(v_calc_base_iva * 0.21, 2);
  v_calc_total := round(v_calc_neto + v_calc_iva, 2);

  -- 4. Insertar la factura en estado borrador
  insert into facturas (
    tipo,
    punto_venta,
    numero,
    fecha,
    cliente_id,
    neto,
    iva,
    total,
    periodo_desde,
    periodo_hasta,
    lote_id,
    estado_emision,
    concepto
  ) values (
    v_tipo,
    v_punto_venta,
    null,
    current_date,
    v_cliente_id,
    v_calc_neto,
    v_calc_iva,
    v_calc_total,
    v_periodo_desde,
    v_periodo_hasta,
    v_lote_id,
    'borrador'::estado_emision,
    v_concepto
  ) returning * into v_factura;

  -- 5. Actualizar servicios vinculándolos a la factura borrador y aplicando cotización
  for v_elem in select * from jsonb_array_elements(p_servicios)
  loop
    if jsonb_typeof(v_elem) = 'object' then
      v_s_id := (v_elem->>'id')::uuid;
      v_cotiz := nullif(trim(v_elem->>'cotizacion'), '')::numeric(12,4);
    else
      v_s_id := trim(v_elem::text, '"')::uuid;
      v_cotiz := null;
    end if;

    select * into v_serv from servicios where id = v_s_id;

    if v_serv.moneda = 'USD' then
      update servicios
      set factura_id = v_factura.id,
          cotizacion = v_cotiz
      where id = v_s_id;
    else
      update servicios
      set factura_id = v_factura.id
      where id = v_s_id;
    end if;
  end loop;

  return v_factura;
end;
$$;

revoke execute on function public.crear_factura_borrador(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crear_factura_borrador(jsonb, jsonb) to service_role;

