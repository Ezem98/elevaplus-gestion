-- ELEVAPLUS Gestión — 0041 Forma de pago editable en presupuestos
-- 1. empresa.presupuesto_forma_pago: texto que va después de "Forma de pago:" en traslados
--    y alquileres por hora. Si es null, los presupuestos dicen "al finalizar el servicio".
-- 2. presupuestos.forma_pago: la de cada presupuesto. Si es null, se usa la de empresa.
-- 3. crear_presupuesto guarda la forma de pago recibida o, si no viene, la de empresa.

alter table public.empresa
  add column if not exists presupuesto_forma_pago text;

grant select, update on table public.empresa to authenticated, service_role;

alter table public.presupuestos
  add column if not exists forma_pago text;

create or replace function public.crear_presupuesto(
  p_datos jsonb,
  p_items jsonb
) returns presupuestos
language plpgsql security definer set search_path = public as $$
declare
  pr presupuestos%rowtype;
  v_cliente_id uuid;
  v_validez int;
  v_forma_pago text;
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

  -- forma_pago por defecto: la de empresa, así el presupuesto no cambia si después se edita la configuración
  select coalesce(
    nullif(trim(p_datos->>'forma_pago'), ''),
    (select nullif(trim(presupuesto_forma_pago), '') from empresa where id = 1)
  ) into v_forma_pago;

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
    forma_pago,
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
    v_forma_pago,
    nullif(trim(p_datos->>'notas'), ''),
    auth.uid()
  ) returning * into pr;

  -- Insertar servicios vía función interna
  perform public._insertar_items_presupuesto(pr.id, v_cliente_id, p_items);

  return pr;
end $$;

revoke execute on function public.crear_presupuesto(jsonb, jsonb) from public, anon;
grant execute on function public.crear_presupuesto(jsonb, jsonb) to authenticated, service_role;
