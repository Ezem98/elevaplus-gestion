-- 03-estados.sql: Matriz de transiciones por rol, triggers de máquinas y auditoría de eventos
begin;
select plan(16);

-- Fixtures de IDs conocidos
-- Cliente Deza: 'c0000000-0000-0000-0000-000000000001'
-- Admin: 'a0000000-0000-0000-0000-000000000001'
-- Oficina: 'a0000000-0000-0000-0000-000000000002'
-- Chofer1: 'a0000000-0000-0000-0000-000000000003'
-- Chofer2: 'a0000000-0000-0000-0000-000000000004'
-- Máquina AE-01: 'f0000000-0000-0000-0000-000000000001'

do $$
declare
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_chofer1_id uuid := 'a0000000-0000-0000-0000-000000000003';
  v_chofer2_id uuid := 'a0000000-0000-0000-0000-000000000004';
  v_maquina_id uuid := 'f0000000-0000-0000-0000-000000000001';

  v_s_ofi uuid := gen_random_uuid();
  v_s_canc uuid := gen_random_uuid();
  v_s_ch1 uuid := gen_random_uuid();
  v_s_ch2 uuid := gen_random_uuid();
  v_s_srv uuid := gen_random_uuid();
  v_s_adm uuid := gen_random_uuid();

  v_s_alq1 uuid := gen_random_uuid();
  v_s_alq2 uuid := gen_random_uuid();

  v_s_bug uuid := gen_random_uuid();
begin
  -- ---------------------------------------------------------------------------
  -- 1. Transiciones válidas para rol oficina
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, creado_por, descripcion)
  values (v_s_ofi, v_cliente_id, 'traslado', 'consulta', 50000, v_oficina_id, 'Servicio Oficina Flujo');

  perform public.como_oficina();
  perform public.cambiar_estado(v_s_ofi, 'presupuestado', 'Cotizado');
  perform public.cambiar_estado(v_s_ofi, 'aceptado', 'Cliente acepto');
  perform public.cambiar_estado(v_s_ofi, 'programado', 'Programado en fecha');
  perform public.cambiar_estado(v_s_ofi, 'en_curso', 'En viaje');
  perform public.cambiar_estado(v_s_ofi, 'terminado', 'Descargado');
  perform public.cambiar_estado(v_s_ofi, 'facturado', 'Facturado');
  perform public.como_postgres();

  -- Cancelado desde consulta
  insert into servicios (id, cliente_id, tipo, estado, monto, creado_por, descripcion)
  values (v_s_canc, v_cliente_id, 'traslado', 'consulta', 50000, v_oficina_id, 'Servicio Cancelado');

  perform public.como_oficina();
  perform public.cambiar_estado(v_s_canc, 'cancelado', 'Cliente desistio');
  perform public.como_postgres();

  -- ---------------------------------------------------------------------------
  -- 2. Transiciones válidas para chofer asignado
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, creado_por, descripcion)
  values (v_s_ch1, v_cliente_id, 'traslado', 'programado', 60000, v_oficina_id, 'Servicio Chofer 1 Asignado');

  insert into servicio_choferes (servicio_id, chofer_id)
  values (v_s_ch1, v_chofer1_id);

  perform public.como_chofer1();
  perform public.cambiar_estado(v_s_ch1, 'en_curso', 'Chofer 1 inicio');
  perform public.cambiar_estado(v_s_ch1, 'terminado', 'Chofer 1 termino');
  perform public.como_postgres();

  -- ---------------------------------------------------------------------------
  -- 3. Servicio asignado a chofer 2 (para probar restricción a chofer 1)
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, creado_por, descripcion)
  values (v_s_ch2, v_cliente_id, 'traslado', 'programado', 60000, v_oficina_id, 'Servicio Chofer 2');

  insert into servicio_choferes (servicio_id, chofer_id)
  values (v_s_ch2, v_chofer2_id);

  -- ---------------------------------------------------------------------------
  -- 4. Admin forzando corrección (terminado -> programado)
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, creado_por, descripcion)
  values (v_s_adm, v_cliente_id, 'traslado', 'terminado', 40000, v_oficina_id, 'Servicio Correccion Admin');

  perform public.como_admin();
  perform public.cambiar_estado(v_s_adm, 'programado', 'Admin corrige a programado');
  perform public.como_postgres();

  -- ---------------------------------------------------------------------------
  -- 5. Service Role marcando facturado
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, creado_por, descripcion)
  values (v_s_srv, v_cliente_id, 'traslado', 'terminado', 45000, v_oficina_id, 'Servicio Worker ARCA');

  perform public.como_service_role();
  perform public.cambiar_estado(v_s_srv, 'facturado', 'Facturado por worker');
  perform public.como_postgres();

  -- ---------------------------------------------------------------------------
  -- 6. Casos 49 y 51: Triggers de sincronización de máquina en alquileres
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, maquina_id, creado_por, descripcion)
  values (v_s_alq1, v_cliente_id, 'alquiler_periodo', 'programado', 150000, v_maquina_id, v_oficina_id, 'Alquiler 1');

  insert into alquileres (servicio_id, fecha_desde, fecha_hasta, unidad, cantidad, precio_unidad)
  values (v_s_alq1, current_date, current_date + 30, 'mes', 1, 150000);

  insert into servicios (id, cliente_id, tipo, estado, monto, maquina_id, creado_por, descripcion)
  values (v_s_alq2, v_cliente_id, 'alquiler_periodo', 'programado', 150000, v_maquina_id, v_oficina_id, 'Alquiler 2 Renovacion');

  insert into alquileres (servicio_id, fecha_desde, fecha_hasta, unidad, cantidad, precio_unidad, renovado_de)
  values (v_s_alq2, current_date + 30, current_date + 60, 'mes', 1, 150000, v_s_alq1);

  -- ---------------------------------------------------------------------------
  -- 7. Bug conocido en servicio_eventos (captura de estado_anterior)
  -- ---------------------------------------------------------------------------
  insert into servicios (id, cliente_id, tipo, estado, monto, creado_por, descripcion)
  values (v_s_bug, v_cliente_id, 'traslado', 'programado', 50000, v_oficina_id, 'Servicio Para Test Bug Evento');

  perform public.como_oficina();
  perform public.cambiar_estado(v_s_bug, 'en_curso', 'Iniciando viaje test bug');
  perform public.como_postgres();
end $$;

-- 1 a 6: Verificaciones de flujo completo de oficina
select is(
  (select estado from servicios where descripcion = 'Servicio Oficina Flujo'),
  'facturado'::estado_servicio,
  'Oficina: transiciones consulta -> presupuestado -> aceptado -> programado -> en_curso -> terminado -> facturado'
);

select is(
  (select estado from servicios where descripcion = 'Servicio Cancelado'),
  'cancelado'::estado_servicio,
  'Oficina: consulta -> cancelado permitido'
);

-- 8 y 9: Verificaciones de chofer asignado
select is(
  (select estado from servicios where descripcion = 'Servicio Chofer 1 Asignado'),
  'terminado'::estado_servicio,
  'Chofer asignado: transiciones programado -> en_curso -> terminado permitidas'
);

-- 10: Admin forzando corrección
select is(
  (select estado from servicios where descripcion = 'Servicio Correccion Admin'),
  'programado'::estado_servicio,
  'Admin: puede forzar correccion de terminado a programado'
);

-- 11: Service role
select is(
  (select estado from servicios where descripcion = 'Servicio Worker ARCA'),
  'facturado'::estado_servicio,
  'Service role: puede marcar servicio como facturado'
);

-- 12 y 13: Transiciones inválidas para oficina
select public.como_oficina();
select throws_matching(
  format('select public.cambiar_estado(''%s''::uuid, ''en_curso''::estado_servicio)', (select id from servicios where descripcion = 'Servicio Worker ARCA')),
  'Transición facturado → en_curso no permitida para rol oficina',
  'Oficina: transicion invalida facturado -> en_curso rechazada con mensaje exacto'
);

select throws_matching(
  format('select public.cambiar_estado(''%s''::uuid, ''en_curso''::estado_servicio)', (select id from servicios where descripcion = 'Servicio Cancelado')),
  'Transición cancelado → en_curso no permitida para rol oficina',
  'Oficina: transicion invalida cancelado -> en_curso rechazada'
);
select public.como_postgres();

-- 14 y 15: Restricciones de chofer
select throws_matching(
  format('select public.como_chofer1(); select public.cambiar_estado(''%s''::uuid, ''en_curso''::estado_servicio);', (select id from servicios where descripcion = 'Servicio Chofer 2')),
  'Transición programado → en_curso no permitida para rol chofer',
  'Chofer 1: no puede mover servicio asignado a Chofer 2'
);

select throws_matching(
  format('select public.como_chofer1(); select public.cambiar_estado(''%s''::uuid, ''facturado''::estado_servicio);', (select id from servicios where descripcion = 'Servicio Chofer 1 Asignado')),
  'Transición terminado → facturado no permitida para rol chofer',
  'Chofer 1: no puede mover servicio a facturado'
);
select public.como_postgres();

-- 16, 17, 18: Casos 49 y 51 de sincronización de máquina
-- Inicialmente máquina AE-01 está disponible
select is(
  (select estado from maquinas where id = 'f0000000-0000-0000-0000-000000000001'),
  'disponible'::estado_maquina,
  'Maquina AE-01 inicialmente disponible'
);

-- Caso 49: Pasar Alquiler 1 a en_curso -> maquina pasa a alquilada
select public.como_oficina();
select public.cambiar_estado(
  (select id from servicios where descripcion = 'Alquiler 1'),
  'en_curso'::estado_servicio,
  'Inicia alquiler 1'
);
select public.como_postgres();

select is(
  (select estado from maquinas where id = 'f0000000-0000-0000-0000-000000000001'),
  'alquilada'::estado_maquina,
  'Caso 49: Alquiler periodo en_curso pasa maquina a alquilada'
);

-- Caso 51: Pasar Alquiler 2 a en_curso, y terminar Alquiler 1 -> maquina SIGUE alquilada
select public.como_oficina();
select public.cambiar_estado(
  (select id from servicios where descripcion = 'Alquiler 2 Renovacion'),
  'en_curso'::estado_servicio,
  'Inicia alquiler renovacion'
);
select public.cambiar_estado(
  (select id from servicios where descripcion = 'Alquiler 1'),
  'terminado'::estado_servicio,
  'Termina alquiler 1 original'
);
select public.como_postgres();

select is(
  (select estado from maquinas where id = 'f0000000-0000-0000-0000-000000000001'),
  'alquilada'::estado_maquina,
  'Caso 51: Cerrar alquiler original con renovacion activa mantiene maquina alquilada'
);

-- Cerrar Alquiler 2 -> maquina vuelve a disponible
select public.como_oficina();
select public.cambiar_estado(
  (select id from servicios where descripcion = 'Alquiler 2 Renovacion'),
  'terminado'::estado_servicio,
  'Termina alquiler 2'
);
select public.como_postgres();

select is(
  (select estado from maquinas where id = 'f0000000-0000-0000-0000-000000000001'),
  'disponible'::estado_maquina,
  'Al terminar todos los alquileres activos de la maquina vuelve a disponible'
);

-- 19, 20, 21: Bug conocido en servicio_eventos: estado_anterior vs estado_nuevo
select is(
  (select estado_nuevo from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Servicio Para Test Bug Evento')
   order by id desc limit 1),
  'en_curso'::estado_servicio,
  'Auditoria: estado_nuevo registrado correctamente como en_curso'
);

select is(
  (select estado_anterior from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Servicio Para Test Bug Evento')
   order by id desc limit 1),
  'programado'::estado_servicio,
  'BUG CONOCIDO: estado_anterior debe ser programado, no en_curso'
);

select isnt(
  (select estado_anterior from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Servicio Para Test Bug Evento')
   order by id desc limit 1),
  (select estado_nuevo from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Servicio Para Test Bug Evento')
   order by id desc limit 1),
  'BUG CONOCIDO: estado_anterior debe ser distinto de estado_nuevo'
);

select * from finish();
rollback;
