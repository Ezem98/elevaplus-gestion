-- =============================================================================
-- ELEVAPLUS Gestión — 0022 Registrar servicio realizado (carga retroactiva)
--
-- RPC registrar_servicio_realizado para soportar servicios ya ejecutados
-- en el pasado, o alquileres por período en curso, preservando fechas.
-- =============================================================================

drop function if exists public.registrar_servicio_realizado(uuid, text);
drop function if exists public.registrar_servicio_realizado(uuid, text, estado_servicio);

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
  end if;

  return s;
end $$;

revoke execute on function public.registrar_servicio_realizado(uuid, text, estado_servicio) from public, anon;
grant execute on function public.registrar_servicio_realizado(uuid, text, estado_servicio) to authenticated, service_role;
