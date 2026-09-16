-- =============================================================================
-- ELEVAPLUS Gestión — 0011 Permitir a service_role ejecutar cambiar_estado
-- Permite al worker de facturación ARCA (que corre con service_role) marcar
-- servicios como 'facturado'.
-- =============================================================================

create or replace function public.cambiar_estado(
  p_servicio_id uuid,
  p_nuevo estado_servicio,
  p_nota text default null
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  s servicios%rowtype;
  rol rol_usuario := mi_rol();
  es_service_role boolean := (auth.jwt() ->> 'role' = 'service_role' or auth.uid() is null);
  permitido boolean := false;
  es_chofer_asignado boolean;
begin
  select * into s from servicios where id = p_servicio_id for update;
  if not found then raise exception 'Servicio no encontrado'; end if;

  select exists (select 1 from servicio_choferes where servicio_id = s.id and chofer_id = auth.uid())
    into es_chofer_asignado;

  -- Transiciones válidas
  if es_service_role then
    permitido := true;
  elsif p_nuevo = 'cancelado' then
    permitido := rol in ('admin','oficina');
  elsif s.estado = 'consulta' and p_nuevo = 'presupuestado' then permitido := rol in ('admin','oficina');
  elsif s.estado = 'presupuestado' and p_nuevo = 'aceptado' then permitido := rol in ('admin','oficina');
  elsif s.estado in ('aceptado','consulta','presupuestado') and p_nuevo = 'programado' then permitido := rol in ('admin','oficina');
  elsif s.estado = 'programado' and p_nuevo = 'en_curso' then permitido := rol in ('admin','oficina') or es_chofer_asignado;
  elsif s.estado in ('programado','en_curso') and p_nuevo = 'terminado' then permitido := rol in ('admin','oficina') or es_chofer_asignado;
  elsif s.estado in ('terminado','cobrado') and p_nuevo = 'facturado' then permitido := rol in ('admin','oficina');
  elsif rol = 'admin' then permitido := true;  -- admin puede forzar cualquier corrección
  end if;

  if not permitido then
    raise exception 'Transición % → % no permitida para rol %', s.estado, p_nuevo, rol;
  end if;

  update servicios set
    estado = p_nuevo,
    fecha_inicio = case when p_nuevo = 'en_curso' and fecha_inicio is null then now() else fecha_inicio end,
    fecha_fin    = case when p_nuevo = 'terminado' and fecha_fin is null then now() else fecha_fin end
  where id = s.id returning * into s;

  insert into servicio_eventos (servicio_id, estado_anterior, estado_nuevo, usuario_id, nota)
  values (s.id, s.estado, p_nuevo, auth.uid(), p_nota);

  return s;
end $$;
