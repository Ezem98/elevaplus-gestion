-- 02-cheques.sql: Ciclo de vida de cheques recibidos y propios, saldos y excepciones
begin;
select plan(22);

-- Fixtures de IDs conocidos
-- Cliente Deza: 'c0000000-0000-0000-0000-000000000001'
-- Cuenta Galicia: 'b0000000-0000-0000-0000-000000000004'
-- Cuenta Credicoop: 'b0000000-0000-0000-0000-000000000003'
-- Oficina: 'a0000000-0000-0000-0000-000000000002'
-- Chofer1: 'a0000000-0000-0000-0000-000000000003'
-- Categoria Bancarios: 'd0000000-0000-0000-0000-000000000012'
-- Categoria Repuestos: 'd0000000-0000-0000-0000-000000000003'

do $$
declare
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_galicia_id uuid := 'b0000000-0000-0000-0000-000000000004';
  v_credicoop_id uuid := 'b0000000-0000-0000-0000-000000000003';
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_cat_repuestos uuid := 'd0000000-0000-0000-0000-000000000003';
  v_cat_bancarios uuid := 'd0000000-0000-0000-0000-000000000012';

  v_ch_dep uuid := gen_random_uuid();
  v_co_dep uuid := gen_random_uuid();

  v_ch_end uuid := gen_random_uuid();
  v_eg_end uuid := gen_random_uuid();

  v_ch_desc uuid := gen_random_uuid();
  v_co_desc uuid := gen_random_uuid();

  v_ch_propio uuid := gen_random_uuid();
  v_eg_propio uuid := gen_random_uuid();

  v_ch_invalido uuid := gen_random_uuid();
begin
  -- ---------------------------------------------------------------------------
  -- Caso 3, 5, 6: Cheque recibido en_cartera -> depositado -> acreditado
  -- ---------------------------------------------------------------------------
  insert into cheques (id, tipo, numero, banco, emisor, fecha_pago, monto, estado, cliente_id)
  values (v_ch_dep, 'recibido', 'CH-DEP-1', 'Galicia', 'Deza Test', current_date + 5, 50000, 'en_cartera', v_cliente_id);

  insert into cobros (id, cliente_id, monto, medio, estado, cheque_id, registrado_por)
  values (v_co_dep, v_cliente_id, 50000, 'cheque', 'pendiente', v_ch_dep, v_oficina_id);

  -- ---------------------------------------------------------------------------
  -- Caso 4: Endoso de cheque a proveedor
  -- ---------------------------------------------------------------------------
  insert into cheques (id, tipo, numero, banco, emisor, fecha_pago, monto, estado, cliente_id)
  values (v_ch_end, 'recibido', 'CH-END-1', 'Santander', 'Deza Test', current_date + 10, 75000, 'en_cartera', v_cliente_id);

  insert into movimientos_caja (id, tipo, monto, ambito, categoria_id, medio, estado, descripcion, proveedor, registrado_por)
  values (v_eg_end, 'egreso', 75000, 'empresa', v_cat_repuestos, 'cheque_terceros', 'pagado', 'Compra de repuestos', 'Proveedor Repuestos', v_oficina_id);

  perform public.como_oficina();
  perform public.cambiar_estado_cheque(
    p_cheque_id := v_ch_end,
    p_nuevo := 'endosado',
    p_nota := 'Endosado a proveedor',
    p_endosado_a := 'Proveedor Repuestos',
    p_movimiento_id := v_eg_end
  );
  perform public.como_postgres();

  -- ---------------------------------------------------------------------------
  -- Caso 7: Descontar cheque 200.000 -> neto 180.000
  -- ---------------------------------------------------------------------------
  insert into cheques (id, tipo, numero, banco, emisor, fecha_pago, monto, estado, cliente_id)
  values (v_ch_desc, 'recibido', 'CH-DESC-1', 'BBVA', 'Deza Test', current_date + 30, 200000, 'en_cartera', v_cliente_id);

  insert into cobros (id, cliente_id, monto, medio, estado, cheque_id, registrado_por)
  values (v_co_desc, v_cliente_id, 200000, 'cheque', 'pendiente', v_ch_desc, v_oficina_id);

  perform public.como_oficina();
  perform public.cambiar_estado_cheque(
    p_cheque_id := v_ch_desc,
    p_nuevo := 'descontado',
    p_nota := 'Descuento en financiera',
    p_cuenta_id := v_galicia_id,
    p_fecha := current_date,
    p_descontado_neto := 180000,
    p_descontado_en := 'Financiera Centro'
  );
  perform public.como_postgres();

  insert into movimientos_caja (tipo, monto, ambito, categoria_id, medio, estado, descripcion, proveedor, registrado_por)
  values ('egreso', 20000, 'empresa', v_cat_bancarios, 'otro', 'pagado', 'Gasto financiero por descuento', 'Financiera Centro', v_oficina_id);

  -- ---------------------------------------------------------------------------
  -- Caso 8, 9, 10: Cheque propio emitido 350.000 -> debitado -> rechazado
  -- ---------------------------------------------------------------------------
  insert into movimientos_caja (id, tipo, monto, ambito, medio, estado, cuenta_id, fecha, descripcion, proveedor, registrado_por)
  values (v_eg_propio, 'egreso', 350000, 'empresa', 'cheque_propio', 'pendiente', v_credicoop_id, current_date + 15, 'Pago camion', 'Proveedor Camiones', v_oficina_id);

  insert into cheques (id, tipo, numero, banco, monto, estado, cuenta_id, fecha_pago, movimiento_id, pagado_a)
  values (v_ch_propio, 'emitido', 'CHP-001', 'Credicoop', 350000, 'emitido', v_credicoop_id, current_date + 15, v_eg_propio, 'Proveedor Camiones');

  -- Cheque para pruebas de transiciones inválidas
  insert into cheques (id, tipo, numero, banco, emisor, fecha_pago, monto, estado, cliente_id)
  values (v_ch_invalido, 'recibido', 'CH-INV-1', 'Macro', 'Deza Test', current_date + 20, 10000, 'en_cartera', v_cliente_id);
end $$;

-- Caso 3: Cheque recibido en_cartera no suma a Galicia
select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000004'),
  180000.00::numeric,
  'Caso 3: Cheque en_cartera no suma a cuenta (solo tiene el descuento de 180000)'
);

-- Caso 5: Depositar cheque en Galicia y verificar que sigue sin sumar
select public.como_oficina();
select public.cambiar_estado_cheque(
  p_cheque_id := (select id from cheques where numero = 'CH-DEP-1'),
  p_nuevo := 'depositado',
  p_cuenta_id := 'b0000000-0000-0000-0000-000000000004'
);
select public.como_postgres();

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000004'),
  180000.00::numeric,
  'Caso 5: Cheque depositado en Galicia sigue sin sumar hasta acreditar'
);

-- Caso 6: Acreditar cheque y verificar que Galicia sube 50000
select public.como_oficina();
select public.cambiar_estado_cheque(
  p_cheque_id := (select id from cheques where numero = 'CH-DEP-1'),
  p_nuevo := 'acreditado',
  p_cuenta_id := 'b0000000-0000-0000-0000-000000000004'
);
select public.como_postgres();

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000004'),
  230000.00::numeric,
  'Caso 6: Cheque acreditado suma los 50000 a Galicia (180000 + 50000 = 230000)'
);

-- Caso 4: Endoso
select is(
  (select estado from cheques where numero = 'CH-END-1'),
  'endosado'::estado_cheque,
  'Caso 4: Cheque endosado queda en estado endosado'
);

select is(
  (select endosado_a from cheques where numero = 'CH-END-1'),
  'Proveedor Repuestos',
  'Caso 4: Cheque endosado tiene registrado endosado_a'
);

select ok(
  (select endosado_movimiento_id is not null from cheques where numero = 'CH-END-1'),
  'Caso 4: Cheque endosado tiene endosado_movimiento_id con valor'
);

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000001'),
  100000.00::numeric,
  'Caso 4: Endoso mantiene saldos intactos (Efectivo sigue 100000)'
);

-- Caso 7: Descuento de cheque
select is(
  (select estado from cheques where numero = 'CH-DESC-1'),
  'descontado'::estado_cheque,
  'Caso 7: Cheque descontado tiene estado descontado'
);

select is(
  (select descontado_neto from cheques where numero = 'CH-DESC-1'),
  180000.00::numeric,
  'Caso 7: Cheque descontado tiene registrado el neto 180000'
);

select ok(
  (select count(*) = 1 from movimientos_caja where descripcion = 'Gasto financiero por descuento' and monto = 20000),
  'Caso 7: Egreso automatico de 20000 en bancarios registrado'
);

-- Caso 8: Cheque propio emitido
select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000003'),
  0.00::numeric,
  'Caso 8: Cheque emitido con egreso pendiente no descuenta saldo hoy (Credicoop sigue en 0)'
);

select ok(
  exists (
    select 1 from agenda
    where clave = ('cheque_cubrir:' || (select id from cheques where numero = 'CHP-001'))
      and sentido = 'egreso' and monto = 350000
  ),
  'Caso 8: Cheque emitido aparece en agenda como cheque_cubrir'
);

-- Caso 9: Debitar cheque propio
select public.como_oficina();
select public.cambiar_estado_cheque(
  p_cheque_id := (select id from cheques where numero = 'CHP-001'),
  p_nuevo := 'debitado'
);
select public.como_postgres();

select is(
  (select estado from cheques where numero = 'CHP-001'),
  'debitado'::estado_cheque,
  'Caso 9: Cheque propio pasa a debitado'
);

select is(
  (select estado from movimientos_caja where id = (select movimiento_id from cheques where numero = 'CHP-001')),
  'pagado'::estado_movimiento,
  'Caso 9: Movimiento de caja asociado pasa a pagado'
);

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000003'),
  -350000.00::numeric,
  'Caso 9: Al debitar el cheque propio el saldo de Credicoop baja 350000'
);

-- Caso 10: Rechazar cheque propio
select public.como_admin();
select public.cambiar_estado_cheque(
  p_cheque_id := (select id from cheques where numero = 'CHP-001'),
  p_nuevo := 'rechazado',
  p_motivo := 'Sin fondos'
);
select public.como_postgres();

select is(
  (select estado from cheques where numero = 'CHP-001'),
  'rechazado'::estado_cheque,
  'Caso 10: Cheque propio pasa a rechazado'
);

select is(
  (select estado from movimientos_caja where id = (select movimiento_id from cheques where numero = 'CHP-001')),
  'pendiente'::estado_movimiento,
  'Caso 10: Al rechazar cheque propio el egreso vuelve a pendiente'
);

select is(
  (select saldo from saldos_cuentas where id = 'b0000000-0000-0000-0000-000000000003'),
  0.00::numeric,
  'Caso 10: Saldo de Credicoop vuelve a 0 al volver el egreso a pendiente'
);

-- Caso 12: Transiciones inválidas
-- 1. Intentar pasar cheque acreditado a depositado (como oficina)
select public.como_oficina();
select throws_matching(
  format('select public.cambiar_estado_cheque(''%s''::uuid, ''depositado''::estado_cheque)', (select id from cheques where numero = 'CH-DEP-1')),
  'Transición acreditado → depositado no permitida',
  'Caso 12: Transicion invalida acreditado -> depositado rechazada'
);

-- 2. Intentar pasar cheque endosado a acreditado (como oficina)
select throws_matching(
  format('select public.cambiar_estado_cheque(''%s''::uuid, ''acreditado''::estado_cheque)', (select id from cheques where numero = 'CH-END-1')),
  'Transición endosado → acreditado no permitida',
  'Caso 12: Transicion invalida endosado -> acreditado rechazada'
);
select public.como_postgres();

-- 3. Chofer llamando cambiar_estado_cheque
select public.como_postgres();
select throws_matching(
  format('select public.como_chofer1(); select public.cambiar_estado_cheque(''%s''::uuid, ''rechazado''::estado_cheque);', (select id from cheques where numero = 'CH-DEP-1')),
  'No autorizado',
  'Caso 12: Chofer llamando cambiar_estado_cheque recibe No autorizado'
);
select public.como_postgres();

-- Auditoría en cheque_eventos
select ok(
  exists (
    select 1 from cheque_eventos
    where cheque_id = (select id from cheques where numero = 'CH-DEP-1')
      and estado_anterior = 'en_cartera' and estado_nuevo = 'depositado'
  ),
  'Auditoría: cheque_eventos registra estado_anterior en_cartera -> depositado'
);

select * from finish();
rollback;
