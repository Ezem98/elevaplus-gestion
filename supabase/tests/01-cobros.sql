-- 01-cobros.sql: Pruebas de cobros, aplicaciones y recalculo de estado
begin;
select plan(20);

-- Constantes de fixtures conocidas
-- Cliente Deza: 'c0000000-0000-0000-0000-000000000001'
-- Cuenta Efectivo: 'b0000000-0000-0000-0000-000000000001'
-- Usuario Oficina: 'a0000000-0000-0000-0000-000000000002'

do $$
declare
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_cuenta_efectivo uuid := 'b0000000-0000-0000-0000-000000000001';
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_s1 uuid := gen_random_uuid();
  v_ch1 uuid := gen_random_uuid();
  v_c1 uuid := gen_random_uuid();
  v_s2 uuid := gen_random_uuid();
  v_c2 uuid := gen_random_uuid();
  v_c3 uuid := gen_random_uuid();
  v_s3 uuid := gen_random_uuid();
  v_c4 uuid := gen_random_uuid();
  v_sa uuid := gen_random_uuid();
  v_sb uuid := gen_random_uuid();
  v_sc uuid := gen_random_uuid();
  v_c5 uuid := gen_random_uuid();
begin
  -- ---------------------------------------------------------------------------
  -- Caso 1: Cobro con cheque por el total -> Servicio pasa a 'cobrado'
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, creado_por)
  values (v_s1, v_cliente_id, 'traslado', 'terminado', 50000, 0, v_oficina_id);

  insert into cheques (id, tipo, numero, banco, emisor, fecha_pago, monto, estado, cliente_id)
  values (v_ch1, 'recibido', 'CH-001', 'Galicia', 'Deza Test', current_date + 10, 50000, 'en_cartera', v_cliente_id);

  insert into cobros (id, cliente_id, monto, medio, estado, cheque_id, registrado_por)
  values (v_c1, v_cliente_id, 50000, 'cheque', 'pendiente', v_ch1, v_oficina_id);

  insert into cobro_aplicaciones (cobro_id, servicio_id, monto)
  values (v_c1, v_s1, 50000);

  -- ---------------------------------------------------------------------------
  -- Caso 2: Rechazar ese cheque -> Servicio vuelve a 'terminado', evento 'Cobro revertido'
  -- ---------------------------------------------------------------------------
  perform public.como_oficina();
  perform public.cambiar_estado_cheque(
    p_cheque_id := v_ch1,
    p_nuevo := 'rechazado',
    p_nota := 'Rechazo de prueba',
    p_motivo := 'Sin fondos'
  );
  perform public.como_postgres();

  -- ---------------------------------------------------------------------------
  -- Cobro parcial y segundo cobro que completa
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, creado_por)
  values (v_s2, v_cliente_id, 'traslado', 'terminado', 100000, 0, v_oficina_id);

  insert into cobros (id, cliente_id, monto, medio, estado, cuenta_id, registrado_por)
  values (v_c2, v_cliente_id, 40000, 'efectivo', 'acreditado', v_cuenta_efectivo, v_oficina_id);

  insert into cobro_aplicaciones (cobro_id, servicio_id, monto)
  values (v_c2, v_s2, 40000);

  insert into cobros (id, cliente_id, monto, medio, estado, cuenta_id, registrado_por)
  values (v_c3, v_cliente_id, 60000, 'efectivo', 'acreditado', v_cuenta_efectivo, v_oficina_id);

  insert into cobro_aplicaciones (cobro_id, servicio_id, monto)
  values (v_c3, v_s2, 60000);

  -- ---------------------------------------------------------------------------
  -- Cobro anticipado (en estado 'programado') que se reevalúa al terminar
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, creado_por)
  values (v_s3, v_cliente_id, 'traslado', 'programado', 80000, 0, v_oficina_id);

  insert into cobros (id, cliente_id, monto, medio, estado, cuenta_id, registrado_por)
  values (v_c4, v_cliente_id, 80000, 'efectivo', 'acreditado', v_cuenta_efectivo, v_oficina_id);

  insert into cobro_aplicaciones (cobro_id, servicio_id, monto)
  values (v_c4, v_s3, 80000);

  perform public.como_oficina();
  perform public.cambiar_estado(v_s3, 'en_curso', 'En camino');
  perform public.cambiar_estado(v_s3, 'terminado', 'Servicio terminado');
  perform public.como_postgres();

  -- ---------------------------------------------------------------------------
  -- Un cobro aplicado a 3 servicios
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, creado_por)
  values
    (v_sa, v_cliente_id, 'traslado', 'terminado', 30000, 0, v_oficina_id),
    (v_sb, v_cliente_id, 'traslado', 'terminado', 30000, 0, v_oficina_id),
    (v_sc, v_cliente_id, 'traslado', 'terminado', 30000, 0, v_oficina_id);

  insert into cobros (id, cliente_id, monto, medio, estado, cuenta_id, registrado_por)
  values (v_c5, v_cliente_id, 90000, 'efectivo', 'acreditado', v_cuenta_efectivo, v_oficina_id);

  insert into cobro_aplicaciones (cobro_id, servicio_id, monto)
  values
    (v_c5, v_sa, 30000),
    (v_c5, v_sb, 30000),
    (v_c5, v_sc, 30000);
end $$;

-- Aserciones Caso 1 y Caso 2 (v_s1 y v_ch1)
select is(
  (select estado from cheques where numero = 'CH-001'),
  'rechazado'::estado_cheque,
  'Caso 2: Cheque pasa a rechazado'
);

select is(
  (select estado from cobros where cheque_id = (select id from cheques where numero = 'CH-001')),
  'rechazado'::estado_cobro,
  'Caso 2: Cobro asociado se sincroniza a rechazado'
);

select is(
  (select monto_cobrado from servicios where remito is null and monto = 50000 limit 1),
  0.00::numeric,
  'Caso 2: Monto cobrado del servicio vuelve a 0 tras rechazo'
);

select is(
  (select estado from servicios where remito is null and monto = 50000 limit 1),
  'terminado'::estado_servicio,
  'Caso 2: Servicio vuelve a estado terminado tras rechazo de cheque'
);

select ok(
  exists (
    select 1 from servicio_eventos se
    join servicios s on s.id = se.servicio_id
    where s.monto = 50000 and se.nota = 'Cobro completo'
  ),
  'Caso 1: Evento Cobro completo registrado al aplicar cheque'
);

select ok(
  exists (
    select 1 from servicio_eventos se
    join servicios s on s.id = se.servicio_id
    where s.monto = 50000 and se.nota = 'Cobro revertido'
  ),
  'Caso 2: Evento Cobro revertido registrado tras rechazo'
);

-- Aserciones cobro parcial y completado (v_s2 con monto 100000)
select is(
  (select monto_cobrado from servicios where monto = 100000 limit 1),
  100000.00::numeric,
  'Cobro completo: monto_cobrado acumula 100000'
);

select is(
  (select estado from servicios where monto = 100000 limit 1),
  'cobrado'::estado_servicio,
  'Cobro completo: servicio pasa a cobrado con dos cobros'
);

select ok(
  exists (
    select 1 from servicio_eventos se
    join servicios s on s.id = se.servicio_id
    where s.monto = 100000 and se.nota = 'Cobro completo'
  ),
  'Cobro completo: evento Cobro completo registrado'
);

-- Aserciones cobro anticipado (v_s3 con monto 80000)
select is(
  (select monto_cobrado from servicios where monto = 80000 limit 1),
  80000.00::numeric,
  'Cobro anticipado: monto_cobrado es 80000'
);

select is(
  (select estado from servicios where monto = 80000 limit 1),
  'cobrado'::estado_servicio,
  'Cobro anticipado: al pasar por terminado se reevalua automaticamente a cobrado'
);

-- Aserciones un cobro aplicado a 3 servicios (monto 30000 cada uno)
select is(
  (select count(*) from servicios where monto = 30000 and monto_cobrado = 30000 and estado = 'cobrado'),
  3::bigint,
  'Un cobro a 3 servicios: los 3 reciben su parte y pasan a cobrado'
);

select is(
  (select count(*) from cobro_aplicaciones ca
   join servicios s on s.id = ca.servicio_id
   where s.monto = 30000),
  3::bigint,
  'Un cobro a 3 servicios: 3 aplicaciones registradas'
);

-- Aserciones de validación de cobro parcial individual
do $$
declare
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_cuenta_efectivo uuid := 'b0000000-0000-0000-0000-000000000001';
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_sparcial uuid := gen_random_uuid();
  v_cparcial uuid := gen_random_uuid();
begin
  insert into servicios (id, cliente_id, tipo, estado, monto, monto_cobrado, creado_por, descripcion)
  values (v_sparcial, v_cliente_id, 'traslado', 'terminado', 70000, 0, v_oficina_id, 'Servicio Solo Parcial');

  insert into cobros (id, cliente_id, monto, medio, estado, cuenta_id, registrado_por)
  values (v_cparcial, v_cliente_id, 30000, 'efectivo', 'acreditado', v_cuenta_efectivo, v_oficina_id);

  insert into cobro_aplicaciones (cobro_id, servicio_id, monto)
  values (v_cparcial, v_sparcial, 30000);
end $$;

select is(
  (select monto_cobrado from servicios where descripcion = 'Servicio Solo Parcial'),
  30000.00::numeric,
  'Cobro parcial: monto_cobrado actualizado a 30000'
);

select is(
  (select estado from servicios where descripcion = 'Servicio Solo Parcial'),
  'terminado'::estado_servicio,
  'Cobro parcial: servicio sigue en estado terminado'
);

-- Aserciones de constraint cobro_aplicaciones.monto > 0
select throws_ok(
  'insert into cobro_aplicaciones (cobro_id, servicio_id, monto) values (gen_random_uuid(), gen_random_uuid(), 0)',
  '23514',
  null,
  'cobro_aplicaciones con monto = 0 falla por check_violation'
);

select throws_ok(
  'insert into cobro_aplicaciones (cobro_id, servicio_id, monto) values (gen_random_uuid(), gen_random_uuid(), -500)',
  '23514',
  null,
  'cobro_aplicaciones con monto negativo falla por check_violation'
);

select throws_ok(
  'insert into cobros (cliente_id, monto, medio, estado) values (''c0000000-0000-0000-0000-000000000001'', 0, ''efectivo'', ''acreditado'')',
  '23514',
  null,
  'cobros con monto = 0 falla por check_violation'
);

select throws_ok(
  'insert into cobros (cliente_id, monto, medio, estado) values (''c0000000-0000-0000-0000-000000000001'', -100, ''efectivo'', ''acreditado'')',
  '23514',
  null,
  'cobros con monto negativo falla por check_violation'
);

select ok(true, 'Fin de pruebas 01-cobros');

select * from finish();
rollback;
