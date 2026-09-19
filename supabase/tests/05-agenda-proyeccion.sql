-- 05-agenda-proyeccion.sql: Vista unificada de agenda (8 ramas) y funcion proyeccion_caja
begin;
select plan(15);

-- Fixtures de IDs conocidos
-- Cliente Deza: 'c0000000-0000-0000-0000-000000000001'
-- Vehiculo Ford Cargo: 'e0000000-0000-0000-0000-000000000001'
-- Chofer 1: 'a0000000-0000-0000-0000-000000000003'
-- Cuenta Efectivo: 'b0000000-0000-0000-0000-000000000001'
-- Cuenta Galicia: 'b0000000-0000-0000-0000-000000000004'

do $$
declare
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_ford_id uuid := 'e0000000-0000-0000-0000-000000000001';
  v_chofer1_id uuid := 'a0000000-0000-0000-0000-000000000003';
  v_efectivo_id uuid := 'b0000000-0000-0000-0000-000000000001';
  v_galicia_id uuid := 'b0000000-0000-0000-0000-000000000004';

  v_venc_id uuid := gen_random_uuid();
  v_vi_id uuid := gen_random_uuid();
  v_ch_rec uuid := gen_random_uuid();
  v_ch_emi uuid := gen_random_uuid();
  v_cobro_id uuid := gen_random_uuid();
  v_mov_id uuid := gen_random_uuid();
  v_srv_alq uuid := gen_random_uuid();
  v_flota_id uuid := gen_random_uuid();
  v_nov_id uuid := gen_random_uuid();
begin
  -- 1. Rama vencimiento
  insert into vencimientos (id, titulo, ambito, monto_estimado, cuenta_sugerida_id, frecuencia, dia_del_mes)
  values (v_venc_id, 'Seguro Ford', 'empresa', 45000, v_efectivo_id, 'mensual', 10);

  insert into vencimiento_instancias (id, vencimiento_id, fecha, monto_estimado, estado)
  values (v_vi_id, v_venc_id, current_date + 5, 45000, 'pendiente');

  -- 2. Rama cheque_cobrar
  insert into cheques (id, tipo, numero, banco, emisor, fecha_pago, monto, estado, cliente_id)
  values (v_ch_rec, 'recibido', 'CH-AG-1', 'Galicia', 'Deza Test', current_date + 4, 30000, 'en_cartera', v_cliente_id);

  -- 3. Rama cheque_cubrir
  insert into cheques (id, tipo, numero, banco, fecha_pago, monto, estado, cuenta_id, pagado_a)
  values (v_ch_emi, 'emitido', 'CHP-AG-1', 'Galicia', current_date + 6, 20000, 'emitido', v_galicia_id, 'Proveedor Seguro');

  -- 4. Rama cobro (pendiente sin cheque)
  insert into cobros (id, cliente_id, monto, medio, estado, cuenta_id, fecha, fecha_acreditacion)
  values (v_cobro_id, v_cliente_id, 15000, 'transferencia', 'pendiente', v_galicia_id, current_date, current_date + 2);

  -- 5. Rama movimiento_caja (pendiente)
  insert into movimientos_caja (id, tipo, monto, ambito, medio, estado, cuenta_id, fecha, descripcion)
  values (v_mov_id, 'egreso', 10000, 'empresa', 'transferencia', 'pendiente', v_efectivo_id, current_date + 3, 'Gasto luz galpon');

  -- 6. Rama alquiler
  insert into servicios (id, cliente_id, tipo, estado, monto, descripcion)
  values (v_srv_alq, v_cliente_id, 'alquiler_periodo', 'en_curso', 80000, 'Alquiler autoelevador agenda');

  insert into alquileres (servicio_id, fecha_desde, fecha_hasta, unidad, cantidad, precio_unidad)
  values (v_srv_alq, current_date - 5, current_date + 10, 'mes', 1, 80000);

  -- 7. Rama flota (Caso 53: VTV a menos de 30 dias)
  insert into eventos_flota (id, vehiculo_id, tipo, fecha, costo, proximo_vencimiento, proveedor)
  values (v_flota_id, v_ford_id, 'vtv', current_date, 25000, current_date + 15, 'VTV Planta');

  -- 8. Rama novedad (Caso 58: Novedad multidia)
  insert into novedades_empleado (id, empleado_id, tipo, fecha, fecha_hasta, notas)
  values (v_nov_id, v_chofer1_id, 'vacaciones', current_date + 1, current_date + 3, 'Vacaciones chofer 1');
end $$;

-- 1 a 8: Verificar que las 8 ramas devuelven filas en la vista agenda con sus prefijos correctos
select ok(
  exists (select 1 from agenda where clave like 'vencimiento:%'),
  'Agenda Rama 1: Instancias de vencimientos presentes (vencimiento:*)'
);

select ok(
  exists (select 1 from agenda where clave like 'cheque_cobrar:%'),
  'Agenda Rama 2: Cheques a cobrar presentes (cheque_cobrar:*)'
);

select ok(
  exists (select 1 from agenda where clave like 'cheque_cubrir:%'),
  'Agenda Rama 3: Cheques a cubrir presentes (cheque_cubrir:*)'
);

select ok(
  exists (select 1 from agenda where clave like 'cobro:%'),
  'Agenda Rama 4: Cobros pendientes presentes (cobro:*)'
);

select ok(
  exists (select 1 from agenda where clave like 'movimiento:%'),
  'Agenda Rama 5: Movimientos pendientes presentes (movimiento:*)'
);

select ok(
  exists (select 1 from agenda where clave like 'alquiler:%'),
  'Agenda Rama 6: Alquileres activos presentes (alquiler:*)'
);

select ok(
  exists (select 1 from agenda where clave like 'flota:%'),
  'Agenda Rama 7: Eventos de flota presentes (flota:*)'
);

select ok(
  exists (select 1 from agenda where clave like 'novedad:%'),
  'Agenda Rama 8: Novedades de empleados presentes (novedad:*)'
);

-- Caso 53: VTV que vence en menos de 30 días
select ok(
  exists (
    select 1 from agenda
    where clave like 'flota:%'
      and fecha = current_date + 15
      and sentido = 'egreso'
      and titulo like 'VTV · Ford Cargo'
  ),
  'Caso 53: VTV que vence en menos de 30 dias aparece en Agenda como egreso y titulo del vehiculo'
);

-- Caso 58: Novedad multidía (3 días)
select is(
  (select count(*) from agenda where clave like 'novedad:%' and titulo like '%Vacaciones%'),
  3::bigint,
  'Caso 58: Novedad de 3 dias expande exactamente 3 filas en agenda (una por dia)'
);

select is(
  (select count(distinct fecha) from agenda where clave like 'novedad:%' and titulo like '%Vacaciones%'),
  3::bigint,
  'Caso 58: Novedad multidia tiene 3 fechas distintas consecutivas'
);

-- Proyección de caja: filas totales
select is(
  (select count(*) from public.proyeccion_caja(7)),
  8::bigint,
  'proyeccion_caja(7) devuelve exactamente 8 filas (current_date a +7)'
);

select is(
  (select saldo_proyectado from public.proyeccion_caja(0)),
  (select sum(saldo) from saldos_cuentas),
  'proyeccion_caja(0) coincide con el saldo total base de saldos_cuentas'
);

select is(
  (select count(*) from public.proyeccion_caja(7, 'b0000000-0000-0000-0000-000000000004')),
  8::bigint,
  'proyeccion_caja con filtro p_cuenta_id devuelve 8 filas'
);

-- Proyección negativa: insertar un egreso futuro gigantesco
insert into movimientos_caja (
  tipo, monto, ambito, medio, estado, cuenta_id, fecha, descripcion
) values (
  'egreso', 1000000, 'empresa', 'transferencia', 'pendiente',
  'b0000000-0000-0000-0000-000000000001', current_date + 2, 'Compra extraordinaria'
);

select ok(
  exists (
    select 1 from public.proyeccion_caja(7)
    where fecha >= current_date + 2 and saldo_proyectado < 0
  ),
  'proyeccion_caja: egreso futuro superior a los fondos deja saldo proyectado negativo'
);

select * from finish();
rollback;
