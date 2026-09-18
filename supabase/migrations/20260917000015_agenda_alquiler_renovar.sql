-- 20260917000015_agenda_alquiler_renovar.sql
-- En vista agenda, el ítem alquiler navega con ?renovar=1 para abrir directamente el formulario de renovación.
-- Requiere revisión antes de commitear.

create or replace view agenda as
  select 'vencimiento:' || vi.id as clave, vi.fecha, 'egreso' as sentido, v.titulo as titulo,
         v.proveedor as detalle, coalesce(vi.monto_estimado, v.monto_estimado) as monto,
         v.cuenta_sugerida_id as cuenta_id, vi.estado::text as estado, v.ambito::text as ambito,
         '/agenda?vencimiento=' || v.id as url
  from vencimiento_instancias vi join vencimientos v on v.id = vi.vencimiento_id
  where vi.estado = 'pendiente'
union all
  select 'cheque_cobrar:' || ch.id, ch.fecha_pago, 'ingreso', 'Cobrar cheque ' || coalesce(ch.numero,''),
         coalesce(cl.nombre, ch.emisor), ch.monto, null::uuid, ch.estado::text, 'empresa', '/cobros?tab=cheques&cheque=' || ch.id
  from cheques ch left join clientes cl on cl.id = ch.cliente_id
  where ch.tipo = 'recibido' and ch.estado in ('en_cartera','depositado')
union all
  select 'cheque_cubrir:' || ch.id, ch.fecha_pago, 'egreso', 'Cubrir cheque ' || coalesce(ch.numero,''),
         ch.pagado_a, ch.monto, ch.cuenta_id, ch.estado::text, 'empresa', '/cobros?tab=cheques&cheque=' || ch.id
  from cheques ch where ch.tipo = 'emitido' and ch.estado = 'emitido'
union all
  select 'cobro:' || co.id, coalesce(co.fecha_acreditacion, co.fecha), 'ingreso', 'Acreditación ' || co.medio::text,
         cl.nombre, co.monto, co.cuenta_id, co.estado::text, 'empresa', '/cobros'
  from cobros co left join clientes cl on cl.id = co.cliente_id
  where co.estado = 'pendiente' and co.cheque_id is null
union all
  select 'movimiento:' || m.id, coalesce(m.fecha_acreditacion, m.fecha), m.tipo::text, coalesce(m.descripcion, 'Pago pendiente'),
         m.proveedor, m.monto, m.cuenta_id, m.estado::text, m.ambito::text, '/caja?movimiento=' || m.id
  from movimientos_caja m where m.estado = 'pendiente' and m.cheque_id is null and m.tipo in ('ingreso','egreso')
union all
  select 'alquiler:' || a.servicio_id, a.fecha_hasta, 'info', 'Vence alquiler', cl.nombre, s.monto, null::uuid, s.estado::text, 'empresa',
         '/servicios/' || s.id || '?renovar=1' as url
  from alquileres a join servicios s on s.id = a.servicio_id left join clientes cl on cl.id = s.cliente_id
  where s.estado in ('programado','en_curso')
union all
  select 'flota:' || e.id as clave, e.proximo_vencimiento as fecha, 'egreso' as sentido,
         case e.tipo
           when 'vtv' then 'VTV'
           when 'neumaticos' then 'Neumáticos'
           when 'reparacion' then 'Reparación'
           else initcap(e.tipo::text)
         end || ' · ' || coalesce(v.nombre, m.codigo_interno) as titulo,
         e.proveedor as detalle, e.costo as monto, null::uuid as cuenta_id, 'pendiente' as estado,
         'empresa' as ambito, '/flota?evento=' || e.id as url
  from eventos_flota e
  left join vehiculos v on v.id = e.vehiculo_id
  left join maquinas m on m.id = e.maquina_id
  where e.proximo_vencimiento is not null and e.proximo_vencimiento >= current_date - 30
union all
  select 'novedad:' || n.id || ':' || d::date as clave, d::date as fecha, 'info' as sentido,
         coalesce(p.nombre, n.empleado_nombre) || ' · ' ||
           case n.tipo when 'medico' then 'Médico' else initcap(n.tipo::text) end as titulo,
         n.notas as detalle, null::numeric as monto, null::uuid as cuenta_id, 'info' as estado,
         'empresa' as ambito, '/agenda' as url
  from novedades_empleado n
  left join perfiles p on p.id = n.empleado_id
  cross join lateral generate_series(n.fecha, coalesce(n.fecha_hasta, n.fecha), '1 day') as d
  where coalesce(n.fecha_hasta, n.fecha) >= current_date - 30;

alter view agenda set (security_invoker = on);

