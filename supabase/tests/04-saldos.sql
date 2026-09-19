-- 04-saldos.sql: Saldos de cuentas, movimientos, IVA mensual y cuenta corriente
begin;
select plan(17);

-- Fixtures de IDs conocidos
-- Cliente Deza: 'c0000000-0000-0000-0000-000000000001'
-- Cuentas:
--   Efectivo: 'b0000000-0000-0000-0000-000000000001' (saldo_inicial: 100000)
--   Mercado Pago: 'b0000000-0000-0000-0000-000000000002' (saldo_inicial: 0)
--   Credicoop: 'b0000000-0000-0000-0000-000000000003' (saldo_inicial: 0)
--   Galicia: 'b0000000-0000-0000-0000-000000000004' (saldo_inicial: 0)
-- Oficina: 'a0000000-0000-0000-0000-000000000002'
-- Categorias:
--   Combustible: 'd0000000-0000-0000-0000-000000000001'
--   Mantenimiento: 'd0000000-0000-0000-0000-000000000002'
--   Repuestos: 'd0000000-0000-0000-0000-000000000003'

-- Caso 33: Saldo inicial de una cuenta
select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000001'),
  100000.00::numeric,
  'Caso 33: Saldo inicial de Efectivo es 100000'
);

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000004'),
  0.00::numeric,
  'Caso 33: Saldo inicial de Galicia es 0'
);

-- Caso 34: Gasto en efectivo -> Efectivo baja
insert into movimientos_caja (
  tipo, monto, ambito, categoria_id, medio, cuenta_id, estado,
  descripcion, proveedor, registrado_por
) values (
  'egreso', 20000, 'empresa', 'd0000000-0000-0000-0000-000000000001', 'efectivo',
  'b0000000-0000-0000-0000-000000000001', 'pagado', 'Carga YPF', 'YPF Centro',
  'a0000000-0000-0000-0000-000000000002'
);

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000001'),
  80000.00::numeric,
  'Caso 34: Gasto en efectivo de 20000 baja saldo de Efectivo a 80000'
);

-- Caso 35: Gasto con factura A, neto 100.000 -> suma a IVA compras 21.000
insert into movimientos_caja (
  tipo, monto, neto, iva, ambito, categoria_id, medio, cuenta_id, estado,
  tiene_comprobante, comprobante_tipo, descripcion, proveedor, registrado_por
) values (
  'egreso', 121000, 100000, 21000, 'empresa', 'd0000000-0000-0000-0000-000000000002', 'transferencia',
  'b0000000-0000-0000-0000-000000000001', 'pagado', true, 'A', 'Mantenimiento taller', 'Taller Norte',
  'a0000000-0000-0000-0000-000000000002'
);

select is(
  (select iva_compras from iva_mensual where mes = date_trunc('month', current_date)::date),
  21000.00::numeric,
  'Caso 35: Gasto con Factura A suma 21000 a IVA compras'
);

-- Caso 36: Gasto con factura B -> NO suma a IVA compras
insert into movimientos_caja (
  tipo, monto, neto, iva, ambito, categoria_id, medio, cuenta_id, estado,
  tiene_comprobante, comprobante_tipo, descripcion, proveedor, registrado_por
) values (
  'egreso', 121000, 100000, 21000, 'empresa', 'd0000000-0000-0000-0000-000000000003', 'efectivo',
  'b0000000-0000-0000-0000-000000000001', 'pagado', true, 'B', 'Compra ferreteria', 'Ferreteria B',
  'a0000000-0000-0000-0000-000000000002'
);

select is(
  (select iva_compras from iva_mensual where mes = date_trunc('month', current_date)::date),
  21000.00::numeric,
  'Caso 36: Gasto con Factura B NO da credito fiscal (IVA compras se mantiene en 21000)'
);

-- Caso 37: Transferencia entre cuentas (Efectivo -> Mercado Pago 30.000)
do $$
declare
  v_saldo_antes numeric;
begin
  select sum(saldo) into v_saldo_antes from saldos_cuentas;

  insert into movimientos_caja (
    tipo, monto, ambito, cuenta_id, cuenta_destino_id, estado,
    descripcion, registrado_por
  ) values (
    'transferencia', 30000, 'empresa', 'b0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002', 'pagado',
    'Fondeo Mercado Pago', 'a0000000-0000-0000-0000-000000000002'
  );
end $$;

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000001'),
  -192000.00::numeric,
  'Caso 37: Efectivo baja 30000 por transferencia (80000 - 121000 - 121000 - 30000 = -192000)'
);

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000002'),
  30000.00::numeric,
  'Caso 37: Mercado Pago sube 30000 por transferencia recibida'
);

select is(
  (select sum(saldo) from saldos_cuentas),
  -162000.00::numeric,
  'Caso 37: Suma total de cuentas se mantiene invariante tras transferencia'
);

-- Cobro acreditado vs pendiente
insert into cobros (cliente_id, monto, medio, estado, cuenta_id, registrado_por)
values ('c0000000-0000-0000-0000-000000000001', 15000, 'transferencia', 'acreditado', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002');

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000004'),
  15000.00::numeric,
  'Cobro acreditado suma a Galicia (+15000)'
);

insert into cobros (cliente_id, monto, medio, estado, cuenta_id, registrado_por)
values ('c0000000-0000-0000-0000-000000000001', 25000, 'transferencia', 'pendiente', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002');

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000004'),
  15000.00::numeric,
  'Cobro pendiente NO suma a la cuenta'
);

-- Cheque endosado no suma ni resta
do $$
declare
  v_ch uuid := gen_random_uuid();
  v_eg uuid := gen_random_uuid();
begin
  insert into cheques (id, tipo, numero, emisor, fecha_pago, monto, estado, cliente_id)
  values (v_ch, 'recibido', 'CH-SAL-1', 'Deza Test', current_date + 10, 50000, 'en_cartera', 'c0000000-0000-0000-0000-000000000001');

  insert into movimientos_caja (id, tipo, monto, ambito, categoria_id, medio, estado, descripcion, proveedor)
  values (v_eg, 'egreso', 50000, 'empresa', 'd0000000-0000-0000-0000-000000000003', 'cheque_terceros', 'pagado', 'Compra con endoso', 'Proveedor X');

  perform public.como_oficina();
  perform public.cambiar_estado_cheque(v_ch, 'endosado', 'Endosado', null, current_date, 'Proveedor X', v_eg);
  perform public.como_postgres();
end $$;

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000004'),
  15000.00::numeric,
  'Cheque endosado mantiene saldos intactos'
);

-- Cheque descontado suma el neto
do $$
declare
  v_ch uuid := gen_random_uuid();
  v_co uuid := gen_random_uuid();
begin
  insert into cheques (id, tipo, numero, emisor, fecha_pago, monto, estado, cliente_id)
  values (v_ch, 'recibido', 'CH-DESC-2', 'Deza Test', current_date + 20, 100000, 'en_cartera', 'c0000000-0000-0000-0000-000000000001');

  insert into cobros (id, cliente_id, monto, medio, estado, cheque_id)
  values (v_co, 'c0000000-0000-0000-0000-000000000001', 100000, 'cheque', 'pendiente', v_ch);

  perform public.como_oficina();
  perform public.cambiar_estado_cheque(
    v_ch, 'descontado', 'Descuento', 'b0000000-0000-0000-0000-000000000004',
    current_date, null, null, 90000, 'Cueva'
  );
  perform public.como_postgres();
end $$;

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000004'),
  105000.00::numeric,
  'Cheque descontado suma el neto (15000 + 90000 = 105000)'
);

-- Cheque propio: egreso pendiente no resta hasta debitado
do $$
declare
  v_ch uuid := gen_random_uuid();
  v_eg uuid := gen_random_uuid();
begin
  insert into movimientos_caja (id, tipo, monto, ambito, medio, estado, cuenta_id, fecha, descripcion)
  values (v_eg, 'egreso', 40000, 'empresa', 'cheque_propio', 'pendiente', 'b0000000-0000-0000-0000-000000000003', current_date + 10, 'Cheque a 10 dias');

  insert into cheques (id, tipo, numero, monto, estado, cuenta_id, fecha_pago, movimiento_id)
  values (v_ch, 'emitido', 'CHP-S1', 40000, 'emitido', 'b0000000-0000-0000-0000-000000000003', current_date + 10, v_eg);
end $$;

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000003'),
  0.00::numeric,
  'Cheque propio emitido no resta mientras este pendiente'
);

select public.como_oficina();
select public.cambiar_estado_cheque(
  (select id from cheques where numero = 'CHP-S1'),
  'debitado'
);
select public.como_postgres();

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000003'),
  -40000.00::numeric,
  'Cheque propio debitado pasa egreso a pagado y resta el saldo'
);

-- Vista cuenta_corriente: cliente Deza
do $$
declare
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_s_ok uuid := gen_random_uuid();
  v_s_pres uuid := gen_random_uuid();
  v_s_canc uuid := gen_random_uuid();
  v_cobro uuid := gen_random_uuid();
begin
  -- Servicio computable (terminado)
  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, descripcion)
  values (v_s_ok, v_cliente_id, 'traslado', 'terminado', 100000, 40000, 'Servicio CC Terminado');

  -- Servicios no computables
  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, descripcion)
  values (v_s_pres, v_cliente_id, 'traslado', 'presupuestado', 50000, 0, 'Servicio CC Presupuestado');

  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, descripcion)
  values (v_s_canc, v_cliente_id, 'traslado', 'cancelado', 30000, 0, 'Servicio CC Cancelado');
end $$;

select is(
  (select total_servicios from cuenta_corriente where cliente_id = 'c0000000-0000-0000-0000-000000000001'),
  100000.00::numeric,
  'cuenta_corriente: excluye servicios presupuestados y cancelados de total_servicios'
);

select is(
  (select total_cobrado from cuenta_corriente where cliente_id = 'c0000000-0000-0000-0000-000000000001'),
  40000.00::numeric,
  'cuenta_corriente: total_cobrado refleja monto cobrado de servicios'
);

select is(
  (select saldo from cuenta_corriente where cliente_id = 'c0000000-0000-0000-0000-000000000001'),
  60000.00::numeric,
  'cuenta_corriente: saldo es total_servicios - total_cobrado (100000 - 40000 = 60000)'
);

select * from finish();
rollback;

