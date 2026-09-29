-- =============================================================================
-- ELEVAPLUS Gestión — 0029 RPC programar_servicio
--
-- 1. RPC programar_servicio(p_servicio_id, p_fecha, p_hora, p_vehiculo_id, p_maquina_id, p_choferes)
-- 2. Grants y permisos (authenticated, service_role; revoke public, anon)
-- =============================================================================

drop function if exists public.programar_servicio(uuid, date, time, uuid, uuid, uuid[]);

create or replace function public.programar_servicio(
  p_servicio_id uuid,
  p_fecha date,
  p_hora time default null,
  p_vehiculo_id uuid default null,
  p_maquina_id uuid default null,
  p_choferes uuid[] default '{}'
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  s servicios%rowtype;
begin
  -- 1. Validar permisos: solo admin u oficina
  if not es_admin_u_oficina() then
    raise exception 'No autorizado: solo admin u oficina pueden programar servicios';
  end if;

  -- 2. Validar fecha obligatoria
  if p_fecha is null then
    raise exception 'La fecha programada no puede ser nula';
  end if;

  -- 3. Validar choferes: al menos uno
  if p_choferes is null or array_length(p_choferes, 1) is null or array_length(p_choferes, 1) = 0 then
    raise exception 'Debe asignar al menos un chofer';
  end if;

  -- Validar que todos los choferes existan, tengan rol 'chofer' y estén activos
  if exists (
    select 1
    from unnest(p_choferes) as cid
    left join perfiles p on p.id = cid and p.rol = 'chofer' and p.activo = true
    where p.id is null
  ) then
    raise exception 'Uno o más choferes no son válidos o no están activos';
  end if;

  -- 4. Obtener y bloquear el servicio
  select * into s from servicios where id = p_servicio_id for update;
  if not found then
    raise exception 'Servicio no encontrado';
  end if;

  -- Validar estado actual del servicio
  if s.estado not in ('consulta', 'presupuestado', 'aceptado', 'programado') then
    raise exception 'No se puede programar un servicio en estado %', s.estado;
  end if;

  -- 5. Actualizar fecha, hora, vehículo y máquina
  update servicios set
    fecha_programada = p_fecha,
    hora_programada  = p_hora,
    vehiculo_id      = coalesce(p_vehiculo_id, vehiculo_id),
    maquina_id       = coalesce(p_maquina_id, maquina_id),
    updated_at       = now()
  where id = s.id
  returning * into s;

  -- 6. Reemplazar filas en servicio_choferes
  delete from servicio_choferes where servicio_id = s.id;

  insert into servicio_choferes (servicio_id, chofer_id)
  select distinct s.id, c
  from unnest(p_choferes) as c;

  -- 7. Si está en consulta, presupuestado o aceptado, transicionar a programado
  if s.estado in ('consulta', 'presupuestado', 'aceptado') then
    s := cambiar_estado(s.id, 'programado'::estado_servicio, 'Programado para ' || to_char(p_fecha, 'DD/MM/YYYY'));
  end if;

  return s;
end $$;

-- ---------- Grants y Revokes ----------
revoke execute on function public.programar_servicio(uuid, date, time, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.programar_servicio(uuid, date, time, uuid, uuid, uuid[]) to authenticated, service_role;
