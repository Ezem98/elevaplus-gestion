-- ============================================================================
-- Tests pgTAP: RPC programar_servicio
-- ============================================================================

begin;

select plan(15);

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
-- 4. Programar servicio en consulta con Chofer 1 (transiciona a programado)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 5. Reprogramar reemplaza los choferes (no duplica ni deja viejos)
-- ----------------------------------------------------------------------------
select lives_ok(
  $$
    select public.programar_servicio(
      (select valor from ids_test where clave = 's1'),
      '2026-10-02'::date,
      '14:30'::time,
      null,
      null,
      array['a0000000-0000-0000-0000-000000000004'::uuid]
    )
  $$,
  'Reprogramar el servicio con Chofer 2 reemplaza la asignación previa'
);

select results_eq(
  $$ select chofer_id from servicio_choferes where servicio_id = (select valor from ids_test where clave = 's1') order by chofer_id $$,
  $$ values ('a0000000-0000-0000-0000-000000000004'::uuid) $$,
  'servicio_choferes ahora solo contiene a Chofer 2 (Chofer 1 fue reemplazado)'
);

-- ----------------------------------------------------------------------------
-- 6. Programar un alquiler sin pasar p_maquina_id conserva la máquina,
--    y el trigger de flota la deja en alquilada cuando corresponde (en_curso)
-- ----------------------------------------------------------------------------
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

select * from finish();

rollback;
