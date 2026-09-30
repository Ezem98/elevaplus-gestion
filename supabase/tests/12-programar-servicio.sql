-- ============================================================================
-- Tests pgTAP: RPC programar_servicio
-- ============================================================================

begin;

select plan(28);

-- Constantes del seed
\set admin_id 'a0000000-0000-0000-0000-000000000001'
\set oficina_id 'a0000000-0000-0000-0000-000000000002'
\set chofer1_id 'a0000000-0000-0000-0000-000000000003'
\set chofer2_id 'a0000000-0000-0000-0000-000000000004'
\set cliente_deza 'c0000000-0000-0000-0000-000000000001'

-- Tabla temporal para IDs de prueba
create temporary table ids_test (
  clave text primary key,
  valor uuid
);
grant all on ids_test to authenticated, service_role, public;

-- Setup inicial como oficina
select public.como_oficina();

do $$
declare
  v_sid uuid;
begin
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    monto,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'consulta',
    'TEST-PROGRAMAR-SERVICIO',
    100000,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_sid;

  insert into ids_test (clave, valor) values ('s1', v_sid);
end $$;

-- ----------------------------------------------------------------------------
-- 1. Un chofer no puede llamar a programar_servicio
-- ----------------------------------------------------------------------------
select public.como_chofer1();

select throws_matching(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 's1'),
      '2026-10-01'::date,
      '09:00'::time,
      null,
      null,
      array['a0000000-0000-0000-0000-000000000003'::uuid]
    )
  $$,
  'No autorizado',
  'Un chofer no puede llamar a programar_servicio'
);

-- ----------------------------------------------------------------------------
-- 2. Sin choferes falla sin tocar nada
-- ----------------------------------------------------------------------------
select public.como_oficina();

select throws_matching(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 's1'),
      '2026-10-01'::date,
      '09:00'::time,
      null,
      null,
      '{}'::uuid[]
    )
  $$,
  'Debe asignar al menos un chofer',
  'Llamar a programar_servicio sin choferes falla con error descriptivo'
);

select results_eq(
  $$ select estado, fecha_programada from servicios where id = (select valor from ids_test where clave = 's1') $$,
  $$ values ('consulta'::estado_servicio, null::date) $$,
  'Al fallar sin choferes, el servicio no fue tocado y sigue en consulta sin fecha'
);

select is_empty(
  $$ select * from servicio_choferes where servicio_id = (select valor from ids_test where clave = 's1') $$,
  'Al fallar sin choferes, servicio_choferes no tiene registros'
);

-- ----------------------------------------------------------------------------
-- 3. Chofer no válido o inactivo falla sin tocar nada
-- ----------------------------------------------------------------------------
select throws_matching(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 's1'),
      '2026-10-01'::date,
      '09:00'::time,
      null,
      null,
      array['00000000-0000-0000-0000-000000000099'::uuid]
    )
  $$,
  'Uno o más choferes no son válidos o no están activos',
  'Llamar con chofer inexistente falla'
);

-- ----------------------------------------------------------------------------
-- 4. Asignar servicio en consulta con Chofer 1 crea aviso "Nuevo viaje"
-- ----------------------------------------------------------------------------
select public.como_oficina();

select lives_ok(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 's1'),
      '2026-10-01'::date,
      '09:00'::time,
      null,
      null,
      array['a0000000-0000-0000-0000-000000000003'::uuid]
    )
  $$,
  'Oficina programa el servicio exitosamente con Chofer 1'
);

select results_eq(
  $$ select estado, fecha_programada, hora_programada from servicios where id = (select valor from ids_test where clave = 's1') $$,
  $$ values ('programado'::estado_servicio, '2026-10-01'::date, '09:00:00'::time) $$,
  'El servicio quedó en estado programado con la fecha y hora indicadas'
);

select results_eq(
  $$ select chofer_id from servicio_choferes where servicio_id = (select valor from ids_test where clave = 's1') $$,
  $$ values ('a0000000-0000-0000-0000-000000000003'::uuid) $$,
  'servicio_choferes tiene asignado a Chofer 1'
);

select public.como_service_role();

select results_eq(
  $$ select usuario_id, titulo from notificaciones where tag = 'viaje-' || (select valor from ids_test where clave = 's1') order by created_at desc limit 1 $$,
  $$ values ('a0000000-0000-0000-0000-000000000003'::uuid, 'Nuevo viaje'::text) $$,
  'Asignar crea un aviso "Nuevo viaje" para Chofer 1'
);

-- ----------------------------------------------------------------------------
-- 5. Reprogramar con el mismo chofer crea solo "Cambió"
-- ----------------------------------------------------------------------------
select public.como_oficina();

select lives_ok(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 's1'),
      '2026-10-02'::date,
      '10:30'::time,
      null,
      null,
      array['a0000000-0000-0000-0000-000000000003'::uuid]
    )
  $$,
  'Reprogramar el servicio con el mismo Chofer 1 y nueva fecha/hora'
);

select public.como_service_role();

select results_eq(
  $$ select usuario_id, titulo from notificaciones where tag = 'viaje-' || (select valor from ids_test where clave = 's1') and titulo like 'Cambió%' $$,
  $$ values ('a0000000-0000-0000-0000-000000000003'::uuid, 'Cambió el viaje de ' || (select c.nombre from clientes c join servicios s on s.cliente_id = c.id where s.id = (select valor from ids_test where clave = 's1'))::text) $$,
  'Reprogramar con el mismo chofer crea solo "Cambió"'
);

select is(
  (select count(*)::int from notificaciones where tag = 'viaje-' || (select valor from ids_test where clave = 's1') and titulo = 'Nuevo viaje'),
  1,
  'No se creó ningún aviso "Nuevo viaje" adicional al reprogramar con el mismo chofer'
);

-- ----------------------------------------------------------------------------
-- 6. Programar sin cambios no crea nada
-- ----------------------------------------------------------------------------
select public.como_oficina();

select lives_ok(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 's1'),
      '2026-10-02'::date,
      '10:30'::time,
      null,
      null,
      array['a0000000-0000-0000-0000-000000000003'::uuid]
    )
  $$,
  'Llamar a programar_servicio con los mismos datos exactamente'
);

select public.como_service_role();

select is(
  (select count(*)::int from notificaciones where tag = 'viaje-' || (select valor from ids_test where clave = 's1')),
  2,
  'Programar sin cambios no crea nada en notificaciones'
);

-- ----------------------------------------------------------------------------
-- 7. Cambiar de chofer crea un "Nuevo" y un "Te sacaron"
-- ----------------------------------------------------------------------------
select public.como_oficina();

select lives_ok(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 's1'),
      '2026-10-03'::date,
      '14:30'::time,
      null,
      null,
      array['a0000000-0000-0000-0000-000000000004'::uuid]
    )
  $$,
  'Reprogramar el servicio reemplazando Chofer 1 por Chofer 2'
);

select results_eq(
  $$ select chofer_id from servicio_choferes where servicio_id = (select valor from ids_test where clave = 's1') order by chofer_id $$,
  $$ values ('a0000000-0000-0000-0000-000000000004'::uuid) $$,
  'servicio_choferes ahora solo contiene a Chofer 2 (Chofer 1 fue reemplazado)'
);

select public.como_service_role();

select results_eq(
  $$ select usuario_id, titulo from notificaciones where tag = 'viaje-' || (select valor from ids_test where clave = 's1') and usuario_id = 'a0000000-0000-0000-0000-000000000004'::uuid and titulo = 'Nuevo viaje' $$,
  $$ values ('a0000000-0000-0000-0000-000000000004'::uuid, 'Nuevo viaje'::text) $$,
  'Cambiar de chofer crea aviso "Nuevo viaje" para Chofer 2'
);

select results_eq(
  $$ select usuario_id, titulo from notificaciones where tag = 'viaje-' || (select valor from ids_test where clave = 's1') and usuario_id = 'a0000000-0000-0000-0000-000000000003'::uuid and titulo like 'Te sacaron%' $$,
  $$ values ('a0000000-0000-0000-0000-000000000003'::uuid, 'Te sacaron del viaje de ' || (select c.nombre from clientes c join servicios s on s.cliente_id = c.id where s.id = (select valor from ids_test where clave = 's1'))::text) $$,
  'Cambiar de chofer crea aviso "Te sacaron del viaje de…" para Chofer 1'
);

-- ----------------------------------------------------------------------------
-- 8. Programar un alquiler sin pasar p_maquina_id conserva la máquina,
--    y el trigger de flota la deja en alquilada cuando corresponde (en_curso)
-- ----------------------------------------------------------------------------
select public.como_oficina();

do $$
declare
  v_salq uuid;
begin
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    monto,
    maquina_id,
    vehiculo_id,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'alquiler_periodo',
    'aceptado',
    'TEST-ALQUILER-MAQUINA',
    150000,
    'f0000000-0000-0000-0000-000000000002'::uuid,
    'e0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_salq;

  insert into alquileres (
    servicio_id, fecha_desde, fecha_hasta, unidad, cantidad, precio_unidad
  ) values (
    v_salq, current_date, current_date + 30, 'mes', 1, 150000
  );

  insert into ids_test (clave, valor) values ('salq', v_salq);
end $$;

-- Programar sin pasar p_maquina_id ni p_vehiculo_id (ambos null)
select lives_ok(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 'salq'),
      '2026-10-05'::date,
      '08:00'::time,
      null,
      null,
      array['a0000000-0000-0000-0000-000000000003'::uuid]
    )
  $$,
  'Programar alquiler sin pasar p_maquina_id se ejecuta correctamente'
);

-- Verificar que se conservan maquina_id y vehiculo_id
select results_eq(
  $$ select maquina_id, vehiculo_id, estado from servicios where id = (select valor from ids_test where clave = 'salq') $$,
  $$ values (
    'f0000000-0000-0000-0000-000000000002'::uuid,
    'e0000000-0000-0000-0000-000000000001'::uuid,
    'programado'::estado_servicio
  ) $$,
  'Programar sin pasar p_maquina_id ni p_vehiculo_id conserva la maquina y vehiculo del servicio'
);

-- Maquina AE-02 está disponible antes de pasar a en_curso
select results_eq(
  $$ select estado from maquinas where id = 'f0000000-0000-0000-0000-000000000002' $$,
  $$ values ('disponible'::estado_maquina) $$,
  'Maquina AE-02 inicialmente disponible'
);

-- Pasar a en_curso: el trigger servicios_maquina_estado debe pasar AE-02 a alquilada
select lives_ok(
  $$
    select public.cambiar_estado(
      (select valor from ids_test where clave = 'salq'),
      'en_curso'::estado_servicio,
      'Inicio de alquiler'
    )
  $$,
  'Pasar alquiler a en_curso'
);

select results_eq(
  $$ select estado from maquinas where id = 'f0000000-0000-0000-0000-000000000002' $$,
  $$ values ('alquilada'::estado_maquina) $$,
  'El trigger de flota pasa maquina AE-02 a alquilada porque el servicio conservo la maquina'
);

-- ----------------------------------------------------------------------------
-- 9. Si el estado anterior no era programado, los choferes que siguen
--    reciben "Nuevo viaje" (es su primera programación)
-- ----------------------------------------------------------------------------
select public.como_oficina();

do $$
declare
  v_spre uuid;
begin
  insert into servicios (
    cliente_id, tipo, estado, descripcion, monto, creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'aceptado',
    'TEST-PREASIGNADO',
    120000,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_spre;

  -- Pre-asignar Chofer 1 mientras el servicio está en aceptado
  insert into servicio_choferes (servicio_id, chofer_id)
  values (v_spre, 'a0000000-0000-0000-0000-000000000003'::uuid);

  insert into ids_test (clave, valor) values ('spre', v_spre);
end $$;

select lives_ok(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 'spre'),
      '2026-10-06'::date,
      '08:00'::time,
      null,
      null,
      array['a0000000-0000-0000-0000-000000000003'::uuid]
    )
  $$,
  'Programar servicio aceptado con chofer previamente asignado'
);

select public.como_service_role();

select results_eq(
  $$ select usuario_id, titulo from notificaciones where tag = 'viaje-' || (select valor from ids_test where clave = 'spre') $$,
  $$ values ('a0000000-0000-0000-0000-000000000003'::uuid, 'Nuevo viaje'::text) $$,
  'Chofer que ya estaba asignado recibe "Nuevo viaje" en su primera programación'
);

select is_empty(
  $$ select * from notificaciones where tag = 'viaje-' || (select valor from ids_test where clave = 'spre') and titulo like 'Cambió%' $$,
  'No se genera aviso de "Cambió el viaje" cuando la programación previa no era programado'
);

-- ----------------------------------------------------------------------------
-- 10. Si el servicio tiene paradas, el trayecto del aviso es "origen → N paradas"
-- ----------------------------------------------------------------------------
select public.como_oficina();

do $$
declare
  v_spar uuid;
begin
  insert into servicios (
    cliente_id, tipo, estado, descripcion, origen, destino, monto, creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'consulta',
    'TEST-PARADAS-NOTIF',
    'Burzaco',
    'Avellaneda',
    150000,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_spar;

  insert into paradas (servicio_id, orden, direccion, localidad)
  values
    (v_spar, 1, 'Calle 1 123', 'Quilmes'),
    (v_spar, 2, 'Calle 2 456', 'Avellaneda');

  insert into ids_test (clave, valor) values ('spar', v_spar);
end $$;

select lives_ok(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 'spar'),
      '2026-10-07'::date,
      '11:00'::time,
      null,
      null,
      array['a0000000-0000-0000-0000-000000000004'::uuid]
    )
  $$,
  'Programar servicio con paradas'
);

select public.como_service_role();

select results_eq(
  $$ select count(*)::int from notificaciones where tag = 'viaje-' || (select valor from ids_test where clave = 'spar') and cuerpo like '%Burzaco → 2 paradas%' $$,
  $$ values (1::int) $$,
  'El trayecto del aviso con paradas es "origen → N paradas"'
);

select * from finish();

rollback;
