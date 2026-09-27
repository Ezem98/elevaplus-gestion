-- =============================================================================
-- ELEVAPLUS Gestión — 0024 Crear presupuesto desde servicio existente (RPC)
-- Permite vincular un servicio preexistente a un nuevo presupuesto sin duplicarlo.
-- =============================================================================

create or replace function public.crear_presupuesto_desde_servicio(
  p_servicio_id uuid
) returns presupuestos
language plpgsql security definer set search_path = public as $$
declare
  v_serv servicios%rowtype;
  v_pres presupuestos%rowtype;
  v_estado estado_presupuesto;
  v_validez int;
  v_condiciones text;
  v_prospecto_nombre text;
begin
  if not es_admin_u_oficina() then
    raise exception 'No autorizado';
  end if;

  if p_servicio_id is null then
    raise exception 'Debe indicar el ID del servicio';
  end if;

  select * into v_serv from servicios where id = p_servicio_id for update;
  if not found then
    raise exception 'El servicio no existe';
  end if;

  if v_serv.presupuesto_id is not null then
    raise exception 'El servicio ya tiene un presupuesto asociado';
  end if;

  if v_serv.estado not in ('consulta', 'presupuestado', 'aceptado') then
    raise exception 'El estado del servicio (%) no permite crear un presupuesto', v_serv.estado;
  end if;

  if v_serv.estado = 'consulta' then
    v_estado := 'borrador';
  elsif v_serv.estado = 'presupuestado' then
    v_estado := 'enviado';
  else
    v_estado := 'aceptado';
  end if;

  select coalesce(
    (select presupuesto_validez_dias from empresa where id = 1),
    15
  ) into v_validez;

  select coalesce(
    nullif(trim(v_serv.presupuesto_condiciones), ''),
    (select presupuesto_condiciones_extra from empresa where id = 1)
  ) into v_condiciones;

  v_prospecto_nombre := case
    when v_serv.cliente_id is null then 'Sin destinatario'
    else null
  end;

  insert into presupuestos (
    cliente_id,
    prospecto_nombre,
    fecha,
    validez_dias,
    condiciones,
    estado,
    enviado_at,
    respondido_at,
    creado_por
  ) values (
    v_serv.cliente_id,
    v_prospecto_nombre,
    current_date,
    v_validez,
    v_condiciones,
    v_estado,
    case when v_estado in ('enviado', 'aceptado') then now() else null end,
    case when v_estado = 'aceptado' then now() else null end,
    auth.uid()
  ) returning * into v_pres;

  update servicios
  set presupuesto_id = v_pres.id
  where id = v_serv.id;

  return v_pres;
end $$;

revoke execute on function public.crear_presupuesto_desde_servicio(uuid) from public, anon;
grant execute on function public.crear_presupuesto_desde_servicio(uuid) to authenticated, service_role;
