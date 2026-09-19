-- 20260917000015_agenda_alquiler_renovar.sql
-- En vista agenda, el ítem alquiler navega con ?renovar=1 para abrir directamente el formulario de renovación.
-- Requiere revisión antes de commitear.

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
         ('/servicios/' || s.id || '?renovar=1')::text as url
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

