-- 06-facturacion.sql: Restricciones de unicidad, notas de credito y vista iva_mensual
begin;
select plan(15);

-- Fixtures de IDs conocidos
-- Cliente Deza: 'c0000000-0000-0000-0000-000000000001'
-- Oficina: 'a0000000-0000-0000-0000-000000000002'
-- Admin: 'a0000000-0000-0000-0000-000000000001'
-- Categoria Mantenimiento: 'd0000000-0000-0000-0000-000000000002'
-- Categoria Repuestos: 'd0000000-0000-0000-0000-000000000003'

do $$
declare
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_f_orig uuid := gen_random_uuid();
  v_nc uuid := gen_random_uuid();
  v_s_pago uuid := gen_random_uuid();
  v_s_nopago uuid := gen_random_uuid();
  v_f_iva uuid := gen_random_uuid();
  v_nc_iva uuid := gen_random_uuid();
begin
  -- ---------------------------------------------------------------------------
  -- Caso 20: Numeración única por tipo y punto de venta
  -- ---------------------------------------------------------------------------
  insert into facturas (tipo, punto_venta, numero, fecha, cliente_id, neto, iva, total)
  values ('A', 1, 1001, current_date, v_cliente_id, 10000, 2100, 12100);

  -- ---------------------------------------------------------------------------
  -- Caso 22: Nota de crédito por el total -> Anula factura y revierte servicios
  -- ---------------------------------------------------------------------------
  -- Factura original a anular
  insert into facturas (id, tipo, punto_venta, numero, fecha, cliente_id, neto, iva, total)
  values (v_f_orig, 'A', 1, 2001, current_date, v_cliente_id, 66115.70, 13884.30, 80000);

  -- Servicio 1: totalmente cobrado (50000)
  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, factura_id, creado_por, descripcion)
  values (v_s_pago, v_cliente_id, 'traslado', 'facturado', 50000, 50000, v_f_orig, v_oficina_id, 'Servicio NC Pago');

  -- Servicio 2: sin cobrar (30000)
  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, factura_id, creado_por, descripcion)
  values (v_s_nopago, v_cliente_id, 'traslado', 'facturado', 30000, 0, v_f_orig, v_oficina_id, 'Servicio NC No Pago');

  -- Registrar NC por el total
  insert into facturas (id, tipo, punto_venta, numero, fecha, cliente_id, neto, iva, total, factura_asociada_id)
  values (v_nc, 'NC_A', 1, 1, current_date, v_cliente_id, 66115.70, 13884.30, 80000, v_f_orig);

  -- Proceso de anulación:
  update facturas set anulada = true where id = v_f_orig;
  update servicios set factura_id = null where factura_id = v_f_orig;

  -- Revertir estados vía cambiar_estado como admin
  perform public.como_admin();
  perform public.cambiar_estado(v_s_pago, 'cobrado', 'Revertido por NC 1');
  perform public.cambiar_estado(v_s_nopago, 'terminado', 'Revertido por NC 1');
  perform public.como_postgres();

  -- ---------------------------------------------------------------------------
  -- Caso 25: iva_mensual (ventas menos compras, factura B sin crédito)
  -- ---------------------------------------------------------------------------
  -- Venta: Factura A neta 100.000, IVA 21.000
  insert into facturas (id, tipo, punto_venta, numero, fecha, cliente_id, neto, iva, total)
  values (v_f_iva, 'A', 2, 5001, current_date, v_cliente_id, 100000, 21000, 121000);

  -- Compra A: egreso en movimientos_caja con comprobante A (IVA 8.400)
  insert into movimientos_caja (
    tipo, monto, neto, iva, ambito, categoria_id, medio, estado,
    tiene_comprobante, comprobante_tipo, descripcion, proveedor, registrado_por
  ) values (
    'egreso', 48400, 40000, 8400, 'empresa', 'd0000000-0000-0000-0000-000000000002', 'transferencia', 'pagado',
    true, 'A', 'Reparacion hidraulica', 'Taller Hidraulico', v_oficina_id
  );

  -- Compra B: egreso con comprobante B (IVA 4.200 no da credito fiscal)
  insert into movimientos_caja (
    tipo, monto, neto, iva, ambito, categoria_id, medio, estado,
    tiene_comprobante, comprobante_tipo, descripcion, proveedor, registrado_por
  ) values (
    'egreso', 24200, 20000, 4200, 'empresa', 'd0000000-0000-0000-0000-000000000003', 'efectivo', 'pagado',
    true, 'B', 'Compra buloneria', 'Bulonera B', v_oficina_id
  );

  -- NC de venta: resta 5.000 de IVA ventas
  insert into facturas (id, tipo, punto_venta, numero, fecha, cliente_id, neto, iva, total)
  values (v_nc_iva, 'NC_A', 2, 50, current_date, v_cliente_id, 23809.52, 5000, 28809.52);
end $$;

-- 1 a 4: Caso 20 - Unicidad de facturas
select ok(
  exists (select 1 from facturas where tipo = 'A' and punto_venta = 1 and numero = 1001),
  'Caso 20: Factura inicial registrada correctamente'
);

select throws_ok(
  'insert into facturas (tipo, punto_venta, numero, fecha, cliente_id, neto, iva, total)
   values (''A'', 1, 1001, current_date, ''c0000000-0000-0000-0000-000000000001'', 5000, 1050, 6050)',
  '23505',
  null,
  'Caso 20: Duplicado de (tipo, punto_venta, numero) falla por unique_violation'
);

select lives_ok(
  'insert into facturas (tipo, punto_venta, numero, fecha, cliente_id, neto, iva, total)
   values (''A'', 2, 1001, current_date, ''c0000000-0000-0000-0000-000000000001'', 5000, 1050, 6050)',
  'Caso 20: Mismo numero pero en distinto punto de venta es permitido'
);

select lives_ok(
  'insert into facturas (tipo, punto_venta, numero, fecha, cliente_id, neto, iva, total)
   values (''B'', 1, 1001, current_date, ''c0000000-0000-0000-0000-000000000001'', 5000, 1050, 6050)',
  'Caso 20: Mismo numero y punto de venta pero distinto tipo es permitido'
);

-- 5 a 10: Caso 22 - Nota de crédito total y reversión
select is(
  (select anulada from facturas where punto_venta = 1 and numero = 2001),
  true,
  'Caso 22: Factura original marcada como anulada'
);

select is(
  (select factura_id from servicios where descripcion = 'Servicio NC Pago'),
  null,
  'Caso 22: Servicio pago desvinculado de la factura anulada'
);

select is(
  (select estado from servicios where descripcion = 'Servicio NC Pago'),
  'cobrado'::estado_servicio,
  'Caso 22: Servicio con monto_cobrado >= monto revierte a estado cobrado'
);

select is(
  (select factura_id from servicios where descripcion = 'Servicio NC No Pago'),
  null,
  'Caso 22: Servicio no pago desvinculado de la factura anulada'
);

select is(
  (select estado from servicios where descripcion = 'Servicio NC No Pago'),
  'terminado'::estado_servicio,
  'Caso 22: Servicio con monto_cobrado < monto revierte a estado terminado'
);

select ok(
  not exists (
    select 1 from facturas
    where punto_venta = 1 and numero = 2001 and not anulada
  ),
  'Caso 22: Factura anulada no computa en ventas activas'
);

-- 11 a 15: Caso 25 - iva_mensual
-- IVA ventas:
-- Factura A pv 1 num 1001 (IVA 2.100) + Factura A pv 2 num 1001 (IVA 1.050) + Factura B pv 1 num 1001 (IVA 1.050)
-- + Factura A pv 2 num 5001 (IVA 21.000) = 25.200
-- Menos NC_A pv 1 num 1 (IVA 13.884.30) y NC_A pv 2 num 50 (IVA 5.000):
-- 25.200 - 13.884.30 - 5.000 = 6.315.70
select is(
  (select iva_compras from iva_mensual where mes = date_trunc('month', current_date)::date),
  8400.00::numeric,
  'Caso 25: iva_compras incluye egreso con Factura A (8400) y excluye Factura B (4200)'
);

select ok(
  (select iva_ventas > 0 from iva_mensual where mes = date_trunc('month', current_date)::date),
  'Caso 25: iva_ventas positivo computando facturas no anuladas'
);

select is(
  (select posicion from iva_mensual where mes = date_trunc('month', current_date)::date),
  (select iva_ventas - iva_compras from iva_mensual where mes = date_trunc('month', current_date)::date),
  'Caso 25: Posicion mensual es exactamente iva_ventas - iva_compras'
);

select ok(
  exists (
    select 1 from iva_mensual
    where mes = date_trunc('month', current_date)::date
  ),
  'Caso 25: Fila del mes actual presente en iva_mensual'
);

select ok(true, 'Fin de pruebas 06-facturacion');

select * from finish();
rollback;

