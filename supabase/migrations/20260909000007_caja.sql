create type ambito_movimiento as enum ('empresa', 'personal');
create type tipo_movimiento as enum ('ingreso', 'egreso', 'transferencia');
create type estado_movimiento as enum ('pendiente', 'pagado');
create type tipo_comprobante_compra as enum ('A', 'B', 'C', 'M', 'ticket', 'otro');

create table cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  saldo_inicial numeric(14,2) not null default 0,
  activa boolean not null default true,
  orden int not null default 0
);

create table categorias_movimiento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ambito ambito_movimiento not null,
  tipo tipo_movimiento not null check (tipo in ('ingreso','egreso')),
  activa boolean not null default true,
  orden int not null default 0,
  unique (nombre, ambito, tipo)
);

-- Movimientos que NO son cobros de servicios: gastos, ingresos varios, transferencias.
create table movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  tipo tipo_movimiento not null,
  ambito ambito_movimiento not null default 'empresa',
  categoria_id uuid references categorias_movimiento(id),
  proveedor text,                              -- Edesur, YPF, el contador...
  descripcion text,
  medio medio_pago,
  cuenta_id uuid references cuentas(id),       -- de dónde sale / a dónde entra
  cuenta_destino_id uuid references cuentas(id), -- solo transferencias
  monto numeric(14,2) not null check (monto > 0),
  estado estado_movimiento not null default 'pagado',
  fecha_acreditacion date,
  -- comprobante de compra (para IVA compras)
  tiene_comprobante boolean not null default false,
  comprobante_tipo tipo_comprobante_compra,
  comprobante_punto_venta int,
  comprobante_numero bigint,
  proveedor_cuit text,
  neto numeric(14,2),
  iva numeric(14,2),
  comprobante_path text,
  notas text,
  registrado_por uuid references perfiles(id),
  created_at timestamptz not null default now(),
  check (tipo <> 'transferencia' or (cuenta_id is not null and cuenta_destino_id is not null and cuenta_id <> cuenta_destino_id))
);
create index movimientos_fecha_idx on movimientos_caja (fecha);
create index movimientos_cuenta_idx on movimientos_caja (cuenta_id);

-- Los cobros también entran a una cuenta
alter table cobros add column cuenta_id uuid references cuentas(id);

-- RLS: admin y oficina; choferes no ven caja
alter table cuentas enable row level security;
alter table categorias_movimiento enable row level security;
alter table movimientos_caja enable row level security;
create policy cuentas_rw on cuentas for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());
create policy categorias_select on categorias_movimiento for select using (es_admin_u_oficina());
create policy categorias_write on categorias_movimiento for all using (es_admin()) with check (es_admin());
create policy movimientos_select on movimientos_caja for select using (es_admin_u_oficina());
create policy movimientos_insert on movimientos_caja for insert with check (es_admin_u_oficina());
create policy movimientos_update on movimientos_caja for update using (es_admin_u_oficina());
create policy movimientos_delete on movimientos_caja for delete using (es_admin());

-- Saldo por cuenta
create view saldos_cuentas as
select
  c.id, c.nombre, c.saldo_inicial,
  c.saldo_inicial
  + coalesce((select sum(monto) from cobros co where co.cuenta_id = c.id and co.estado = 'acreditado'), 0)
  + coalesce((select sum(monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'ingreso' and m.estado = 'pagado'), 0)
  - coalesce((select sum(monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'egreso' and m.estado = 'pagado'), 0)
  - coalesce((select sum(monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'transferencia'), 0)
  + coalesce((select sum(monto) from movimientos_caja m where m.cuenta_destino_id = c.id and m.tipo = 'transferencia'), 0)
  as saldo
from cuentas c where c.activa;
alter view saldos_cuentas set (security_invoker = on);

-- Posición de IVA por mes
create view iva_mensual as
with ventas as (
  select date_trunc('month', fecha)::date as mes,
         sum(case when tipo in ('A','B','C','ND_A','ND_B') then iva else -iva end) as iva_ventas
  from facturas where not anulada group by 1
), compras as (
  select date_trunc('month', fecha)::date as mes, sum(coalesce(iva,0)) as iva_compras
  from movimientos_caja
  where tipo = 'egreso' and ambito = 'empresa' and tiene_comprobante and comprobante_tipo = 'A'
  group by 1
)
select coalesce(v.mes, c.mes) as mes,
       coalesce(v.iva_ventas, 0) as iva_ventas,
       coalesce(c.iva_compras, 0) as iva_compras,
       coalesce(v.iva_ventas, 0) - coalesce(c.iva_compras, 0) as posicion
from ventas v full outer join compras c on v.mes = c.mes
order by 1 desc;
alter view iva_mensual set (security_invoker = on);

-- Seed
insert into cuentas (nombre, orden) values ('Efectivo', 1), ('Mercado Pago', 2), ('Credicoop', 3), ('Galicia', 4);

insert into categorias_movimiento (nombre, ambito, tipo, orden) values
  ('Combustible', 'empresa', 'egreso', 1),
  ('Mantenimiento y reparaciones', 'empresa', 'egreso', 2),
  ('Repuestos', 'empresa', 'egreso', 3),
  ('Peajes y viáticos', 'empresa', 'egreso', 4),
  ('Tercerizados', 'empresa', 'egreso', 5),
  ('Sueldos y cargas sociales', 'empresa', 'egreso', 6),
  ('Honorarios', 'empresa', 'egreso', 7),
  ('Impuestos y tasas', 'empresa', 'egreso', 8),
  ('Seguros', 'empresa', 'egreso', 9),
  ('Servicios del galpón', 'empresa', 'egreso', 10),
  ('Alquiler del galpón', 'empresa', 'egreso', 11),
  ('Bancarios y comisiones', 'empresa', 'egreso', 12),
  ('Equipamiento', 'empresa', 'egreso', 13),
  ('Otros gastos', 'empresa', 'egreso', 99),
  ('Venta de equipos', 'empresa', 'ingreso', 1),
  ('Otros ingresos', 'empresa', 'ingreso', 99),
  ('Vivienda', 'personal', 'egreso', 1),
  ('Servicios del hogar', 'personal', 'egreso', 2),
  ('Alimentación', 'personal', 'egreso', 3),
  ('Salud', 'personal', 'egreso', 4),
  ('Mascotas', 'personal', 'egreso', 5),
  ('Transporte', 'personal', 'egreso', 6),
  ('Familia', 'personal', 'egreso', 7),
  ('Otros gastos', 'personal', 'egreso', 99),
  ('Retiro de la empresa', 'personal', 'ingreso', 1),
  ('Otros ingresos', 'personal', 'ingreso', 99);
