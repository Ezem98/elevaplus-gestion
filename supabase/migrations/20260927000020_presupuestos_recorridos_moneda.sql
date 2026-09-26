-- =============================================================================
-- ELEVAPLUS Gestión — 0020 Presupuestos, recorridos y moneda
-- Implementación de entidades de presupuestos, paradas/recorridos y cotización USD.
-- Requiere revisión antes de commitear.
-- =============================================================================

-- ---------- Presupuestos ----------
create type estado_presupuesto as enum ('borrador', 'enviado', 'aceptado', 'rechazado', 'vencido');

create table presupuestos (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  fecha date not null default current_date,
  estado estado_presupuesto not null default 'borrador',
  cliente_id uuid references clientes(id),
  -- prospecto: se usa mientras cliente_id es null
  prospecto_nombre text,
  prospecto_telefono text,
  prospecto_email text,
  prospecto_cuit text,
  validez_dias int not null default 15,
  condiciones text,
  pdf_path text,
  generado_at timestamptz,
  enviado_at timestamptz,
  respondido_at timestamptz,
  notas text,
  creado_por uuid references perfiles(id),
  created_at timestamptz not null default now(),
  check (cliente_id is not null or prospecto_nombre is not null)
);

alter table servicios add column presupuesto_id uuid references presupuestos(id);
create index servicios_presupuesto_idx on servicios (presupuesto_id);

-- Migrar lo existente: cada servicio con datos de presupuesto o en estado consulta/presupuestado
-- genera su presupuesto y se vincula inmediatamente con servicios.presupuesto_id.
do $$
declare
  s record;
  v_presupuesto_id uuid;
  v_estado estado_presupuesto;
  v_prospecto_nombre text;
begin
  for s in
    select id, estado, cliente_id, creado_por, created_at,
           presupuesto_validez_dias, presupuesto_condiciones,
           presupuesto_pdf_path, presupuesto_generado_at
    from servicios
    where presupuesto_pdf_path is not null or estado in ('consulta', 'presupuestado')
    order by coalesce(presupuesto_generado_at, created_at) asc, id asc
  loop
    v_estado := case
      when s.estado in ('consulta', 'presupuestado') then 'enviado'::estado_presupuesto
      when s.estado = 'cancelado' then 'rechazado'::estado_presupuesto
      else 'aceptado'::estado_presupuesto
    end;

    v_prospecto_nombre := case
      when s.cliente_id is null then 'Sin destinatario (completar)'
      else null
    end;

    insert into presupuestos (
      fecha,
      estado,
      cliente_id,
      prospecto_nombre,
      validez_dias,
      condiciones,
      pdf_path,
      generado_at,
      creado_por
    ) values (
      coalesce(s.presupuesto_generado_at::date, s.created_at::date),
      v_estado,
      s.cliente_id,
      v_prospecto_nombre,
      coalesce(s.presupuesto_validez_dias, 15),
      s.presupuesto_condiciones,
      s.presupuesto_pdf_path,
      s.presupuesto_generado_at,
      s.creado_por
    ) returning id into v_presupuesto_id;

    update servicios
    set presupuesto_id = v_presupuesto_id
    where id = s.id;
  end loop;
end $$;

-- Las columnas presupuesto_* de servicios quedan deprecadas: no se borran en esta migración.

-- ---------- Paradas ----------
create type carga_desde as enum ('origen', 'parada_anterior');
create type estado_parada as enum ('pendiente', 'completada', 'no_realizada');

create table paradas (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios(id) on delete cascade,
  orden int not null check (orden >= 1),
  direccion text not null,
  localidad text,
  carga text,                               -- qué se deja en esta parada
  carga_desde carga_desde not null default 'origen',
  estado estado_parada not null default 'pendiente',
  completada_at timestamptz,
  notas text,
  unique (servicio_id, orden) deferrable initially deferred
);

alter table servicios add column continuacion_de uuid references servicios(id);

-- ---------- Moneda ----------
alter table servicios
  add column moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  add column monto_moneda numeric(14,2),      -- monto en la moneda original
  add column cotizacion numeric(12,4);        -- pesos por dólar; null si es ARS

alter table servicios add constraint moneda_usd_solo_alquiler_periodo
  check (moneda = 'ARS' or tipo = 'alquiler_periodo');

alter table servicios add constraint usd_requiere_cotizacion
  check (moneda = 'ARS' or (monto_moneda is not null and cotizacion is not null and cotizacion > 0));

-- Máquinas que no se alquilan por hora (la tijera: mínimo 1 día)
alter table maquinas add column permite_alquiler_hora boolean not null default true;
update maquinas set permite_alquiler_hora = false where tipo = 'plataforma';

-- ---------- RPC: aceptar presupuesto ----------
create or replace function public.aceptar_presupuesto(
  p_presupuesto_id uuid,
  p_cliente_id uuid            -- cliente existente elegido, o el recién creado desde el prospecto
) returns presupuestos
language plpgsql security definer set search_path = public as $$
declare
  pr presupuestos%rowtype;
  s record;
  v_items_procesados int := 0;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;
  select * into pr from presupuestos where id = p_presupuesto_id for update;
  if not found then raise exception 'Presupuesto no encontrado'; end if;
  if pr.estado not in ('borrador','enviado') then
    raise exception 'El presupuesto ya está %', pr.estado;
  end if;
  if p_cliente_id is null then raise exception 'Hace falta un cliente para aceptar'; end if;

  update presupuestos set estado = 'aceptado', cliente_id = p_cliente_id, respondido_at = now()
  where id = pr.id returning * into pr;

  for s in
    select id, estado
    from servicios
    where presupuesto_id = pr.id and estado in ('consulta','presupuestado')
  loop
    v_items_procesados := v_items_procesados + 1;
    update servicios set cliente_id = p_cliente_id where id = s.id;
    if s.estado = 'consulta' then
      perform cambiar_estado(s.id, 'presupuestado', 'Presupuesto #' || pr.numero);
    end if;
    perform cambiar_estado(s.id, 'aceptado', 'Presupuesto #' || pr.numero || ' aceptado');
  end loop;

  if v_items_procesados = 0 then
    raise exception 'El presupuesto no tiene ítems para aceptar';
  end if;

  return pr;
end $$;

-- ---------- RPC: cerrar recorrido (la usa el chofer) ----------
create or replace function public.cerrar_recorrido(
  p_servicio_id uuid,
  p_ultima_parada int default null   -- null = completó todas
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  s_actual servicios%rowtype;
  total int;
  realizadas int;
  resultado servicios%rowtype;
  nota text;
begin
  select * into s_actual from servicios where id = p_servicio_id for update;
  if not found then raise exception 'Servicio no encontrado'; end if;
  if s_actual.estado not in ('programado', 'en_curso') then
    raise exception 'El servicio no está en curso ni programado (estado actual: %)', s_actual.estado;
  end if;

  select count(*) into total from paradas where servicio_id = p_servicio_id;
  if total = 0 then raise exception 'El servicio no tiene paradas'; end if;

  if p_ultima_parada is null then
    update paradas set estado = 'completada', completada_at = now() where servicio_id = p_servicio_id;
    nota := 'Recorrido completo';
  else
    if p_ultima_parada < 0 or p_ultima_parada > total then raise exception 'Parada inválida'; end if;
    update paradas set estado = 'completada', completada_at = now()
      where servicio_id = p_servicio_id and orden <= p_ultima_parada;
    update paradas set estado = 'no_realizada'
      where servicio_id = p_servicio_id and orden > p_ultima_parada;
    realizadas := p_ultima_parada;
    nota := 'Recorrido incompleto: ' || realizadas || ' de ' || total || ' paradas';
  end if;

  -- cambiar_estado valida que quien llama sea chofer asignado u oficina
  resultado := cambiar_estado(p_servicio_id, 'terminado', nota);
  return resultado;
end $$;

-- ---------- RPC: guardar paradas (reemplazo completo) ----------
create or replace function public.guardar_paradas(
  p_servicio_id uuid,
  p_paradas jsonb
) returns setof paradas
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;
  if not exists (select 1 from servicios where id = p_servicio_id) then
    raise exception 'Servicio no encontrado';
  end if;

  if exists (
    select 1 from paradas
    where servicio_id = p_servicio_id and estado in ('completada', 'no_realizada')
  ) then
    raise exception 'No se pueden editar las paradas de un recorrido cerrado';
  end if;

  if p_paradas is not null and jsonb_typeof(p_paradas) <> 'array' then
    raise exception 'El formato de paradas debe ser un arreglo JSON';
  end if;

  delete from paradas where servicio_id = p_servicio_id;

  if p_paradas is not null and jsonb_array_length(p_paradas) > 0 then
    return query
    insert into paradas (
      servicio_id,
      orden,
      direccion,
      localidad,
      carga,
      carga_desde,
      notas
    )
    select
      p_servicio_id,
      elem.ord::int,
      (elem.val ->> 'direccion')::text,
      nullif(trim(elem.val ->> 'localidad'), ''),
      nullif(trim(elem.val ->> 'carga'), ''),
      coalesce((elem.val ->> 'carga_desde')::carga_desde, 'origen'::carga_desde),
      nullif(trim(elem.val ->> 'notas'), '')
    from jsonb_array_elements(p_paradas) with ordinality as elem(val, ord)
    returning *;
  end if;
end $$;

-- ---------- RLS ----------
alter table presupuestos enable row level security;
alter table paradas enable row level security;

drop policy if exists pres_rw on presupuestos;
create policy pres_rw on presupuestos for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());

drop policy if exists par_select on paradas;
create policy par_select on paradas for select using (
  exists (select 1 from servicios s where s.id = paradas.servicio_id)   -- hereda visibilidad de servicios
);

drop policy if exists par_write on paradas;
create policy par_write on paradas for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());

-- ---------- Hardening y Grants (obligatorios desde el 30/10/2026) ----------
revoke execute on function public.aceptar_presupuesto(uuid, uuid) from public, anon;
revoke execute on function public.cerrar_recorrido(uuid, int) from public, anon;
revoke execute on function public.guardar_paradas(uuid, jsonb) from public, anon;

grant select, insert, update, delete on table presupuestos, paradas to authenticated;
grant all on table presupuestos, paradas to service_role;
grant usage, select on sequence presupuestos_numero_seq to authenticated, service_role;
grant execute on function public.aceptar_presupuesto(uuid, uuid) to authenticated, service_role;
grant execute on function public.cerrar_recorrido(uuid, int) to authenticated, service_role;
grant execute on function public.guardar_paradas(uuid, jsonb) to authenticated, service_role;

-- ---------- Realtime ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='presupuestos') then
    alter publication supabase_realtime add table presupuestos; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='paradas') then
    alter publication supabase_realtime add table paradas; end if;
end $$;
