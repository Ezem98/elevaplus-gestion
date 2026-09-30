-- =============================================================================
-- ELEVAPLUS Gestión — 0030 Tabla notificaciones y RPC programar_servicio atómica
--
-- 1. Tabla notificaciones con RLS restrictivo (solo service_role)
-- 2. Grants y permisos para notificaciones
-- 3. RPC programar_servicio con cálculo diferencial de choferes y notificaciones
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla notificaciones
-- -----------------------------------------------------------------------------
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  titulo text not null,
  cuerpo text not null,
  url text default '/chofer' not null,
  tag text,
  created_at timestamptz default now() not null,
  enviada_at timestamptz,
  error text
);

create index if not exists notificaciones_usuario_idx on public.notificaciones (usuario_id);
create index if not exists notificaciones_created_idx on public.notificaciones (created_at desc);

alter table public.notificaciones enable row level security;

-- Sin policies para anon ni authenticated: acceso exclusivo para service_role (worker y edge functions)
revoke all on table public.notificaciones from public, anon, authenticated;
grant select, insert, update, delete on table public.notificaciones to service_role;

-- -----------------------------------------------------------------------------
-- 2. RPC programar_servicio
-- -----------------------------------------------------------------------------
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
  v_fecha_anterior date;
  v_hora_anterior time;
  v_estado_anterior estado_servicio;
  v_choferes_actuales uuid[];
  v_choferes_salen uuid[];
  v_choferes_nuevos uuid[];
  v_choferes_siguen uuid[];
  v_cant_paradas int;
  v_choferes_notificar_nuevo uuid[];
  v_cliente_nombre text;
  v_trayecto text;
  v_dia_semana text;
  v_fecha_str text;
  v_hora_str text;
  v_fecha_hora text;
  v_dias text[] := array['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  cid uuid;
  v_cuerpo text;
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
    from unnest(p_choferes) as c_id
    left join perfiles p on p.id = c_id and p.rol = 'chofer' and p.activo = true
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

  -- Guardar valores previos para cálculo diferencial
  v_fecha_anterior := s.fecha_programada;
  v_hora_anterior := s.hora_programada;
  v_estado_anterior := s.estado;

  select coalesce(array_agg(chofer_id), '{}'::uuid[])
  into v_choferes_actuales
  from servicio_choferes
  where servicio_id = s.id;

  -- 5. Actualizar fecha, hora, vehículo y máquina
  update servicios set
    fecha_programada = p_fecha,
    hora_programada  = p_hora,
    vehiculo_id      = coalesce(p_vehiculo_id, vehiculo_id),
    maquina_id       = coalesce(p_maquina_id, maquina_id),
    updated_at       = now()
  where id = s.id
  returning * into s;

  -- 6. Calcular diferencia de choferes
  -- Choferes que salen: estaban asignados y ya no figuran en p_choferes
  select coalesce(array_agg(c), '{}'::uuid[])
  into v_choferes_salen
  from unnest(v_choferes_actuales) as c
  where not (c = any(p_choferes));

  -- Choferes nuevos: figuran en p_choferes y no estaban asignados previamente
  select coalesce(array_agg(distinct c), '{}'::uuid[])
  into v_choferes_nuevos
  from unnest(p_choferes) as c
  where not (c = any(v_choferes_actuales));

  -- Choferes que siguen: permanecen asignados
  select coalesce(array_agg(distinct c), '{}'::uuid[])
  into v_choferes_siguen
  from unnest(p_choferes) as c
  where c = any(v_choferes_actuales);

  -- 7. Actualizar servicio_choferes (borrar los que salen, insertar solo los nuevos)
  if array_length(v_choferes_salen, 1) > 0 then
    delete from servicio_choferes
    where servicio_id = s.id and chofer_id = any(v_choferes_salen);
  end if;

  if array_length(v_choferes_nuevos, 1) > 0 then
    insert into servicio_choferes (servicio_id, chofer_id)
    select s.id, c
    from unnest(v_choferes_nuevos) as c;
  end if;

  -- 8. Si está en consulta, presupuestado o aceptado, transicionar a programado
  if s.estado in ('consulta', 'presupuestado', 'aceptado') then
    s := cambiar_estado(s.id, 'programado'::estado_servicio, 'Programado para ' || to_char(p_fecha, 'DD/MM/YYYY'));
  end if;

  -- 9. Armar textos para notificaciones
  select coalesce(c.nombre, 'Cliente')
  into v_cliente_nombre
  from clientes c
  where c.id = s.cliente_id;

  if v_cliente_nombre is null then
    v_cliente_nombre := 'Cliente';
  end if;

  -- Contar paradas del servicio
  select count(*)::int
  into v_cant_paradas
  from paradas
  where servicio_id = s.id;

  if v_cant_paradas > 0 then
    if s.origen is not null then
      v_trayecto := s.origen || ' → ' || v_cant_paradas || case when v_cant_paradas = 1 then ' parada' else ' paradas' end;
    else
      v_trayecto := v_cant_paradas || case when v_cant_paradas = 1 then ' parada' else ' paradas' end;
    end if;
  elsif s.origen is not null and s.destino is not null then
    v_trayecto := s.origen || ' → ' || s.destino;
  elsif s.destino is not null then
    v_trayecto := s.destino;
  elsif s.origen is not null then
    v_trayecto := s.origen;
  else
    v_trayecto := null;
  end if;

  v_dia_semana := v_dias[extract(dow from p_fecha)::int + 1];
  v_fecha_str := v_dia_semana || ' ' || extract(day from p_fecha)::int || '/' || extract(month from p_fecha)::int;
  if p_hora is not null then
    v_hora_str := to_char(p_hora, 'HH24:MI');
    v_fecha_hora := v_fecha_str || ' ' || v_hora_str;
  else
    v_fecha_hora := v_fecha_str;
  end if;

  -- A) Notificar "Nuevo viaje"
  -- Si el estado anterior no era programado, TODOS los choferes que quedan asignados (nuevos o que ya estaban)
  -- reciben "Nuevo viaje" porque es su primera programación.
  -- Si el estado anterior ya era programado, solo los choferes nuevos reciben "Nuevo viaje".
  if v_estado_anterior != 'programado' then
    select coalesce(array_agg(distinct c), '{}'::uuid[])
    into v_choferes_notificar_nuevo
    from unnest(p_choferes) as c;
  else
    v_choferes_notificar_nuevo := v_choferes_nuevos;
  end if;

  if array_length(v_choferes_notificar_nuevo, 1) > 0 then
    v_cuerpo := v_fecha_hora || ' · ' || v_cliente_nombre;
    if v_trayecto is not null then
      v_cuerpo := v_cuerpo || ' · ' || v_trayecto;
    end if;

    foreach cid in array v_choferes_notificar_nuevo loop
      insert into public.notificaciones (usuario_id, titulo, cuerpo, url, tag)
      values (cid, 'Nuevo viaje', v_cuerpo, '/chofer', 'viaje-' || s.id::text);
    end loop;
  end if;

  -- B) Notificar "Cambió el viaje" a los que siguen solo si el servicio YA estaba programado y cambió fecha u hora
  if (v_fecha_anterior is distinct from p_fecha or v_hora_anterior is distinct from p_hora)
     and v_estado_anterior = 'programado'
     and array_length(v_choferes_siguen, 1) > 0 then

    v_cuerpo := v_fecha_hora;
    if v_trayecto is not null then
      v_cuerpo := v_cuerpo || ' · ' || v_trayecto;
    end if;

    foreach cid in array v_choferes_siguen loop
      insert into public.notificaciones (usuario_id, titulo, cuerpo, url, tag)
      values (cid, 'Cambió el viaje de ' || v_cliente_nombre, v_cuerpo, '/chofer', 'viaje-' || s.id::text);
    end loop;
  end if;

  -- C) Notificar "Te sacaron del viaje de…" a los que salen solo si el servicio YA estaba programado
  if v_estado_anterior = 'programado' and array_length(v_choferes_salen, 1) > 0 then
    v_cuerpo := v_fecha_hora;
    if v_trayecto is not null then
      v_cuerpo := v_cuerpo || ' · ' || v_trayecto;
    end if;

    foreach cid in array v_choferes_salen loop
      insert into public.notificaciones (usuario_id, titulo, cuerpo, url, tag)
      values (cid, 'Te sacaron del viaje de ' || v_cliente_nombre, v_cuerpo, '/chofer', 'viaje-' || s.id::text);
    end loop;
  end if;

  return s;
end $$;

-- ---------- Grants y Revokes ----------
revoke execute on function public.programar_servicio(uuid, date, time, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.programar_servicio(uuid, date, time, uuid, uuid, uuid[]) to authenticated, service_role;
