-- 20260916000012_agenda_y_cheques.sql
-- Estructura, funciones, vistas y RLS para agenda y cheques.

alter table cheques
  add column if not exists cuenta_id uuid references cuentas(id),            -- propio: chequera de qué cuenta; recibido: dónde se depositó
  add column if not exists fecha_deposito date,
  add column if not exists fecha_acreditacion date,
  add column if not exists fecha_rechazo date,
  add column if not exists motivo_rechazo text,
  add column if not exists endosado_a text,                                    -- a quién se lo dio
  add column if not exists endosado_movimiento_id uuid,                        -- el egreso que pagó con él
  add column if not exists descontado_neto numeric(14,2),                      -- lo que recibió la dueña al descontarlo
  add column if not exists descontado_en text,                                 -- financiera / banco
  add column if not exists pagado_a text,                                      -- propio: beneficiario
  add column if not exists movimiento_id uuid,                                 -- propio: el egreso que originó
  add column if not exists imagen_path text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists cheque_eventos (
  id bigserial primary key,
  cheque_id uuid references cheques(id) on delete cascade,
  estado_anterior estado_cheque,
  estado_nuevo estado_cheque not null,
  usuario_id uuid references perfiles(id),
  nota text,
  created_at timestamptz not null default now()
);

alter table movimientos_caja
  add column if not exists cheque_id uuid references cheques(id);              -- pagado con este cheque (terceros o propio)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cheques_endosado_movimiento_id_fkey') then
    alter table cheques add constraint cheques_endosado_movimiento_id_fkey foreign key (endosado_movimiento_id) references movimientos_caja(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cheques_movimiento_id_fkey') then
    alter table cheques add constraint cheques_movimiento_id_fkey foreign key (movimiento_id) references movimientos_caja(id);
  end if;
end $$;

-- RPC única para cambiar estado de cheque (misma filosofía que cambiar_estado)
create or replace function public.cambiar_estado_cheque(
  p_cheque_id uuid, p_nuevo estado_cheque, p_nota text default null,
  p_cuenta_id uuid default null, p_fecha date default current_date,
  p_endosado_a text default null, p_movimiento_id uuid default null,
  p_descontado_neto numeric default null, p_descontado_en text default null,
  p_motivo text default null
) returns cheques language plpgsql security definer set search_path = public as $$
declare c cheques%rowtype; anterior estado_cheque;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;
  select * into c from cheques where id = p_cheque_id for update;
  if not found then raise exception 'Cheque no encontrado'; end if;
  anterior := c.estado;

  -- Transiciones válidas
  if c.tipo = 'recibido' then
    if not (
      (anterior = 'en_cartera' and p_nuevo in ('depositado','endosado','descontado','rechazado','anulado')) or
      (anterior = 'depositado' and p_nuevo in ('acreditado','rechazado')) or
      (es_admin())
    ) then raise exception 'Transición % → % no permitida', anterior, p_nuevo; end if;
  else
    if not (
      (anterior = 'emitido' and p_nuevo in ('debitado','rechazado','anulado')) or es_admin()
    ) then raise exception 'Transición % → % no permitida', anterior, p_nuevo; end if;
  end if;

  update cheques set
    estado = p_nuevo,
    cuenta_id = coalesce(p_cuenta_id, cuenta_id),
    fecha_deposito = case when p_nuevo = 'depositado' then p_fecha else fecha_deposito end,
    fecha_acreditacion = case when p_nuevo in ('acreditado','debitado') then p_fecha else fecha_acreditacion end,
    fecha_rechazo = case when p_nuevo = 'rechazado' then p_fecha else fecha_rechazo end,
    motivo_rechazo = coalesce(p_motivo, motivo_rechazo),
    endosado_a = coalesce(p_endosado_a, endosado_a),
    endosado_movimiento_id = coalesce(p_movimiento_id, endosado_movimiento_id),
    descontado_neto = coalesce(p_descontado_neto, descontado_neto),
    descontado_en = coalesce(p_descontado_en, descontado_en),
    updated_at = now()
  where id = p_cheque_id returning * into c;

  insert into cheque_eventos (cheque_id, estado_anterior, estado_nuevo, usuario_id, nota)
  values (p_cheque_id, anterior, p_nuevo, auth.uid(), p_nota);

  -- Efectos sobre cobros y movimientos (el trigger cheques_estado_sync existente maneja acreditado/rechazado → cobros)
  if p_nuevo = 'acreditado' and c.tipo = 'recibido' then
    update cobros set cuenta_id = c.cuenta_id where cheque_id = c.id and cuenta_id is null;
  elsif p_nuevo = 'endosado' then
    -- el cobro sigue válido (la dueña recibió el valor) pero nunca entra a una cuenta:
    update cobros set estado = 'acreditado', fecha_acreditacion = p_fecha, cuenta_id = null where cheque_id = c.id;
  elsif p_nuevo = 'descontado' then
    update cobros set estado = 'acreditado', fecha_acreditacion = p_fecha, cuenta_id = c.cuenta_id where cheque_id = c.id;
  elsif p_nuevo = 'debitado' and c.tipo = 'emitido' then
    update movimientos_caja set estado = 'pagado', fecha_acreditacion = p_fecha where id = c.movimiento_id;
  elsif p_nuevo in ('rechazado','anulado') and c.tipo = 'emitido' then
    update movimientos_caja set estado = 'pendiente' where id = c.movimiento_id;  -- sigue debiéndose
  end if;
  return c;
end $$;

-- Saldos: el endoso no entra a ninguna cuenta; el descuento entra por el neto; el propio sale al debitar
-- Columnas idénticas a la vista original de 000007: id, nombre, saldo_inicial, saldo
create or replace view saldos_cuentas as
select c.id, c.nombre, c.saldo_inicial,
  c.saldo_inicial
  + coalesce((select sum(co.monto) from cobros co
       left join cheques ch on ch.id = co.cheque_id
       where co.cuenta_id = c.id and co.estado = 'acreditado'
         and (ch.id is null or ch.estado in ('acreditado'))), 0)
  + coalesce((select sum(ch.descontado_neto) from cheques ch
       where ch.tipo = 'recibido' and ch.estado = 'descontado' and ch.cuenta_id = c.id), 0)
  + coalesce((select sum(m.monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'ingreso' and m.estado = 'pagado'), 0)
  - coalesce((select sum(m.monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'egreso' and m.estado = 'pagado'
       and coalesce(m.medio, 'otro') <> 'cheque_terceros'), 0)
  - coalesce((select sum(m.monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'transferencia'), 0)
  + coalesce((select sum(m.monto) from movimientos_caja m where m.cuenta_destino_id = c.id and m.tipo = 'transferencia'), 0)
  as saldo
from cuentas c where c.activa;
alter view saldos_cuentas set (security_invoker = on);

create table if not exists vencimientos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,                                   -- "Sueldos", "Plan SUSS cuota", "Seguro camión"
  ambito ambito_movimiento not null default 'empresa',
  categoria_id uuid references categorias_movimiento(id),
  proveedor text,
  monto_estimado numeric(14,2),
  cuenta_sugerida_id uuid references cuentas(id),
  medio_sugerido medio_pago,
  frecuencia frecuencia_vencimiento not null default 'mensual',
  dia_del_mes int check (dia_del_mes between 1 and 31),   -- mensual/bimestral
  dia_semana int check (dia_semana between 0 and 6),       -- semanal
  fecha_inicio date not null default current_date,
  fecha_fin date,                                          -- o null
  cuotas_total int,                                        -- planes de pago
  cuotas_pagadas int not null default 0,
  recordar_dias_antes int not null default 1,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists vencimiento_instancias (
  id uuid primary key default gen_random_uuid(),
  vencimiento_id uuid references vencimientos(id) on delete cascade,
  fecha date not null,
  numero_cuota int,
  monto_estimado numeric(14,2),
  estado estado_instancia not null default 'pendiente',
  movimiento_id uuid references movimientos_caja(id),      -- al marcar pagado
  pagado_at timestamptz,
  gcal_event_id text,
  unique (vencimiento_id, fecha)
);
create index if not exists vi_fecha_idx on vencimiento_instancias (fecha, estado);

-- Google Calendar
create table if not exists google_calendar_conexiones (
  usuario_id uuid primary key references perfiles(id) on delete cascade,
  refresh_token text not null,
  calendar_id text,
  email_google text,
  conectado_at timestamptz not null default now(),
  ultimo_sync timestamptz,
  activo boolean not null default true
);
alter table google_calendar_conexiones enable row level security;
-- Sin policies: solo el worker (service role) lee/escribe. El front solo ve un booleano vía RPC:
create or replace function public.tengo_google_calendar() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from google_calendar_conexiones where usuario_id = auth.uid() and activo)
$$;

-- IDs de eventos de Google para los derivados
create table if not exists gcal_eventos_derivados (
  clave text primary key,                                  -- 'cheque:<id>' | 'cobro:<id>' | 'alquiler:<servicio_id>' | 'movimiento:<id>'
  gcal_event_id text not null,
  usuario_id uuid references perfiles(id),
  actualizado_at timestamptz not null default now()
);
alter table gcal_eventos_derivados enable row level security;

-- RLS
alter table vencimientos enable row level security;
alter table vencimiento_instancias enable row level security;
alter table cheque_eventos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'venc_rw' and tablename = 'vencimientos') then
    create policy venc_rw on vencimientos for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'vi_rw' and tablename = 'vencimiento_instancias') then
    create policy vi_rw on vencimiento_instancias for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'che_select' and tablename = 'cheque_eventos') then
    create policy che_select on cheque_eventos for select using (es_admin_u_oficina());
  end if;
end $$;

-- Agenda unificada (eventos derivados + instancias)
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
  where s.estado in ('programado','en_curso');
alter view agenda set (security_invoker = on);

-- Proyección de caja día por día (con filtro opcional por cuenta)
create or replace function public.proyeccion_caja(p_dias int default 30, p_cuenta_id uuid default null)
returns table (fecha date, ingresos numeric, egresos numeric, saldo_proyectado numeric)
language sql stable security invoker as $$
  with dias as (select generate_series(current_date, current_date + p_dias, '1 day')::date as fecha),
  base as (
    select coalesce(sum(saldo),0) as saldo
    from saldos_cuentas
    where p_cuenta_id is null or id = p_cuenta_id
  ),
  mov as (
    select a.fecha,
           sum(case when a.sentido='ingreso' then a.monto else 0 end) as ing,
           sum(case when a.sentido='egreso' then a.monto else 0 end) as egr
    from agenda a
    where a.fecha between current_date and current_date + p_dias
      and a.ambito = 'empresa'
      and (p_cuenta_id is null or a.cuenta_id = p_cuenta_id)
    group by a.fecha)
  select d.fecha, coalesce(m.ing,0), coalesce(m.egr,0),
         (select saldo from base) + sum(coalesce(m.ing,0) - coalesce(m.egr,0)) over (order by d.fecha)
  from dias d left join mov m on m.fecha = d.fecha order by d.fecha;
$$;

-- Realtime: cheques ya estaba agregado en 20260910000008_realtime.sql, solo sumamos las tablas nuevas
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cheque_eventos') then
    alter publication supabase_realtime add table cheque_eventos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'vencimientos') then
    alter publication supabase_realtime add table vencimientos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'vencimiento_instancias') then
    alter publication supabase_realtime add table vencimiento_instancias;
  end if;
end $$;
