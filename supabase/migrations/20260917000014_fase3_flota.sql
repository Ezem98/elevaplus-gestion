-- 20260917000014_fase3_flota.sql
-- Fase 3: Novedades de personal, eventos de flota, tercerizados y sincronización de estados.
-- Requiere revisión antes de commitear.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_novedad') then
    create type tipo_novedad as enum ('ausente', 'medico', 'vacaciones', 'franco', 'feriado', 'adelanto', 'licencia', 'otro');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_evento_flota') then
    create type tipo_evento_flota as enum ('taller', 'service', 'reparacion', 'vtv', 'seguro', 'patente', 'neumaticos', 'otro');
  end if;
end $$;

create table if not exists novedades_empleado (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references perfiles(id),
  empleado_nombre text,
  fecha date not null,
  fecha_hasta date,
  tipo tipo_novedad not null,
  monto numeric(14,2),
  movimiento_id uuid references movimientos_caja(id),
  notas text,
  creado_por uuid references perfiles(id),
  created_at timestamptz not null default now()
);

create table if not exists eventos_flota (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid references vehiculos(id),
  maquina_id uuid references maquinas(id),
  fecha date not null,
  fecha_fin date,
  tipo tipo_evento_flota not null,
  descripcion text,
  km numeric(10,1),
  horas numeric(10,1),
  costo numeric(14,2),
  movimiento_id uuid references movimientos_caja(id),
  proximo_vencimiento date,
  proveedor text,
  creado_por uuid references perfiles(id),
  created_at timestamptz not null default now(),
  check (vehiculo_id is not null or maquina_id is not null)
);
create index if not exists ef_prox_idx on eventos_flota (proximo_vencimiento) where proximo_vencimiento is not null;

create table if not exists tercerizados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  cuit text,
  tipo text,
  notas text,
  activo boolean not null default true
);

alter table servicios add column if not exists tercerizado_id uuid references tercerizados(id);

-- Datos ampliados de vehículos y máquinas
alter table vehiculos
  add column if not exists marca text,
  add column if not exists modelo text,
  add column if not exists anio int,
  add column if not exists km_actual numeric(10,1),
  add column if not exists vtv_vence date,
  add column if not exists seguro_vence date,
  add column if not exists seguro_compania text,
  add column if not exists notas_flota text;

alter table maquinas
  add column if not exists anio int,
  add column if not exists horas_actual numeric(10,1),
  add column if not exists numero_serie text,
  add column if not exists combustible text,
  add column if not exists ultimo_service date,
  add column if not exists proximo_service date;

-- Sincronización automática de estado de máquinas en alquileres por período
create or replace function public.sincronizar_estado_maquina() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.maquina_id is null or new.tipo <> 'alquiler_periodo' then return null; end if;
  if new.estado = 'en_curso' then
    update maquinas set estado = 'alquilada' where id = new.maquina_id and estado = 'disponible';
  elsif new.estado in ('terminado','cobrado','facturado','cancelado') and old.estado = 'en_curso' then
    update maquinas set estado = 'disponible' where id = new.maquina_id and estado = 'alquilada'
      and not exists (select 1 from servicios s where s.maquina_id = new.maquina_id and s.estado = 'en_curso' and s.id <> new.id);
  end if;
  return null;
end $$;

drop trigger if exists servicios_maquina_estado on servicios;
create trigger servicios_maquina_estado after update of estado on servicios
  for each row execute function public.sincronizar_estado_maquina();

-- Reescritura completa de agenda sumando eventos de flota y novedades de empleados expandidas
create or replace view agenda as
  select ('vencimiento:' || vi.id)::text as clave, vi.fecha::date as fecha, 'egreso'::text as sentido, v.titulo::text as titulo,
         v.proveedor::text as detalle, coalesce(vi.monto_estimado, v.monto_estimado)::numeric(14,2) as monto,
         v.cuenta_sugerida_id::uuid as cuenta_id, vi.estado::text as estado, v.ambito::text as ambito,
         ('/agenda?vencimiento=' || v.id)::text as url
  from vencimiento_instancias vi join vencimientos v on v.id = vi.vencimiento_id
  where vi.estado = 'pendiente'
union all
  select ('cheque_cobrar:' || ch.id)::text, ch.fecha_pago::date, 'ingreso'::text, ('Cobrar cheque ' || coalesce(ch.numero,''))::text,
         coalesce(cl.nombre, ch.emisor)::text, ch.monto::numeric(14,2), null::uuid, ch.estado::text, 'empresa'::text, ('/cobros?tab=cheques&cheque=' || ch.id)::text
  from cheques ch left join clientes cl on cl.id = ch.cliente_id
  where ch.tipo = 'recibido' and ch.estado in ('en_cartera','depositado')
union all
  select ('cheque_cubrir:' || ch.id)::text, ch.fecha_pago::date, 'egreso'::text, ('Cubrir cheque ' || coalesce(ch.numero,''))::text,
         ch.pagado_a::text, ch.monto::numeric(14,2), ch.cuenta_id::uuid, ch.estado::text, 'empresa'::text, ('/cobros?tab=cheques&cheque=' || ch.id)::text
  from cheques ch where ch.tipo = 'emitido' and ch.estado = 'emitido'
union all
  select ('cobro:' || co.id)::text, coalesce(co.fecha_acreditacion, co.fecha)::date, 'ingreso'::text, ('Acreditación ' || co.medio::text)::text,
         cl.nombre::text, co.monto::numeric(14,2), co.cuenta_id::uuid, co.estado::text, 'empresa'::text, '/cobros'::text
  from cobros co left join clientes cl on cl.id = co.cliente_id
  where co.estado = 'pendiente' and co.cheque_id is null
union all
  select ('movimiento:' || m.id)::text, coalesce(m.fecha_acreditacion, m.fecha)::date, m.tipo::text, coalesce(m.descripcion, 'Pago pendiente')::text,
         m.proveedor::text, m.monto::numeric(14,2), m.cuenta_id::uuid, m.estado::text, m.ambito::text, ('/caja?movimiento=' || m.id)::text
  from movimientos_caja m where m.estado = 'pendiente' and m.cheque_id is null and m.tipo in ('ingreso','egreso')
union all
  select ('alquiler:' || a.servicio_id)::text, a.fecha_hasta::date, 'info'::text, 'Vence alquiler'::text, cl.nombre::text, s.monto::numeric(14,2), null::uuid, s.estado::text, 'empresa'::text,
         ('/servicios/' || s.id)::text
  from alquileres a join servicios s on s.id = a.servicio_id left join clientes cl on cl.id = s.cliente_id
  where s.estado in ('programado','en_curso')
union all
  select ('flota:' || e.id)::text as clave, e.proximo_vencimiento::date as fecha, 'egreso'::text as sentido,
         (case e.tipo
           when 'vtv' then 'VTV'
           when 'neumaticos' then 'Neumáticos'
           when 'reparacion' then 'Reparación'
           else initcap(e.tipo::text)
         end || ' · ' || coalesce(v.nombre, m.codigo_interno))::text as titulo,
         e.proveedor::text as detalle, e.costo::numeric(14,2) as monto, null::uuid as cuenta_id, 'pendiente'::text as estado,
         'empresa'::text as ambito, ('/flota?evento=' || e.id)::text as url
  from eventos_flota e
  left join vehiculos v on v.id = e.vehiculo_id
  left join maquinas m on m.id = e.maquina_id
  where e.proximo_vencimiento is not null and e.proximo_vencimiento >= current_date - 30
union all
  select ('novedad:' || n.id || ':' || d::date)::text as clave, d::date as fecha, 'info'::text as sentido,
         (coalesce(p.nombre, n.empleado_nombre) || ' · ' ||
           case n.tipo when 'medico' then 'Médico' else initcap(n.tipo::text) end)::text as titulo,
         n.notas::text as detalle, null::numeric(14,2) as monto, null::uuid as cuenta_id, 'info'::text as estado,
         'empresa'::text as ambito, '/agenda'::text as url
  from novedades_empleado n
  left join perfiles p on p.id = n.empleado_id
  cross join lateral generate_series(n.fecha, coalesce(n.fecha_hasta, n.fecha), '1 day') as d
  where coalesce(n.fecha_hasta, n.fecha) >= current_date - 30;

alter view agenda set (security_invoker = on);

-- RLS
alter table novedades_empleado enable row level security;
alter table eventos_flota enable row level security;
alter table tercerizados enable row level security;

drop policy if exists nov_rw on novedades_empleado;
create policy nov_rw on novedades_empleado for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());

drop policy if exists nov_chofer_select on novedades_empleado;
create policy nov_chofer_select on novedades_empleado for select using (empleado_id = auth.uid());

drop policy if exists ef_rw on eventos_flota;
create policy ef_rw on eventos_flota for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());

drop policy if exists ef_chofer_insert on eventos_flota;
create policy ef_chofer_insert on eventos_flota for insert with check (creado_por = auth.uid() and tipo in ('taller','reparacion'));

drop policy if exists terc_rw on tercerizados;
create policy terc_rw on tercerizados for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());

-- Realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='eventos_flota') then
    alter publication supabase_realtime add table eventos_flota;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='novedades_empleado') then
    alter publication supabase_realtime add table novedades_empleado;
  end if;
end $$;

