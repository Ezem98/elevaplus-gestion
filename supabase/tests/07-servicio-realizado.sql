-- 07-servicio-realizado.sql: Pruebas de la RPC registrar_servicio_realizado
begin;
select plan(23);

-- Fixtures de IDs conocidos (de 00-setup.sql y seed)
-- Cliente Deza: 'c0000000-0000-0000-0000-000000000001'
-- Admin: 'a0000000-0000-0000-0000-000000000001'
-- Oficina: 'a0000000-0000-0000-0000-000000000002'
-- Chofer1: 'a0000000-0000-0000-0000-000000000003'
-- Máquina AE-02: 'f0000000-0000-0000-0000-000000000002'

do $$
declare
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_maquina_id uuid := 'f0000000-0000-0000-0000-000000000002';
  v_s_ok uuid := gen_random_uuid();
  v_s_alquiler uuid := gen_random_uuid();
  v_s_nofecha uuid := gen_random_uuid();
  v_s_nofin uuid := gen_random_uuid();
  v_s_noestado uuid := gen_random_uuid();
  v_s_futuro uuid := gen_random_uuid();
  v_s_finmenor uuid := gen_random_uuid();
  v_s_encurso_traslado uuid := gen_random_uuid();
  v_s_chofer uuid := gen_random_uuid();
  v_fecha_ini timestamptz := '2026-09-16 10:00:00-03';
  v_fecha_fin timestamptz := '2026-09-16 12:00:00-03';
begin
  -- 1. Caso feliz: servicio con fechas pasadas en consulta (terminado)
  insert into servicios (
    id, cliente_id, tipo, estado, monto, creado_por, descripcion,
    fecha_programada, hora_programada, fecha_inicio, fecha_fin
  ) values (
    v_s_ok, v_cliente_id, 'traslado', 'consulta', 45000, v_oficina_id, 'Servicio Retroactivo OK',
    '2026-09-16', '10:00', v_fecha_ini, v_fecha_fin
  );

  -- Ejecutar como oficina
  perform public.como_oficina();
  perform public.registrar_servicio_realizado(v_s_ok, 'Carga retroactiva', 'terminado'::estado_servicio);
  perform public.como_postgres();

  -- 2. Caso feliz alquiler en curso: tipo alquiler_periodo, p_estado_final 'en_curso', solo fecha_inicio
  insert into servicios (
    id, cliente_id, tipo, estado, monto, creado_por, descripcion,
    fecha_programada, hora_programada, fecha_inicio, fecha_fin, maquina_id
  ) values (
    v_s_alquiler, v_cliente_id, 'alquiler_periodo', 'consulta', 90000, v_oficina_id, 'Alquiler Retroactivo En Curso',
    '2026-09-16', '10:00', v_fecha_ini, null, v_maquina_id
  );

  insert into alquileres (
    servicio_id, fecha_desde, fecha_hasta, unidad, cantidad, precio_unidad
  ) values (
    v_s_alquiler, '2026-09-16', '2026-10-16', 'mes', 1, 90000
  );

  perform public.como_oficina();
  perform public.registrar_servicio_realizado(v_s_alquiler, 'Carga retroactiva', 'en_curso'::estado_servicio);
  perform public.como_postgres();

  -- 3. Servicio sin fecha_inicio
  insert into servicios (
    id, cliente_id, tipo, estado, monto, creado_por, descripcion
  ) values (
    v_s_nofecha, v_cliente_id, 'traslado', 'consulta', 30000, v_oficina_id, 'Servicio Sin Fechas'
  );

  -- 4. Servicio terminado sin fecha_fin
  insert into servicios (
    id, cliente_id, tipo, estado, monto, creado_por, descripcion,
    fecha_inicio, fecha_fin
  ) values (
    v_s_nofin, v_cliente_id, 'traslado', 'consulta', 30000, v_oficina_id, 'Servicio Sin Fin',
    v_fecha_ini, null
  );

  -- 5. Servicio en estado distinto de consulta
  insert into servicios (
    id, cliente_id, tipo, estado, monto, creado_por, descripcion,
    fecha_inicio, fecha_fin
  ) values (
    v_s_noestado, v_cliente_id, 'traslado', 'programado', 30000, v_oficina_id, 'Servicio Ya Programado',
    v_fecha_ini, v_fecha_fin
  );

  -- 6. Servicio con fecha futura
  insert into servicios (
    id, cliente_id, tipo, estado, monto, creado_por, descripcion,
    fecha_inicio, fecha_fin
  ) values (
    v_s_futuro, v_cliente_id, 'traslado', 'consulta', 30000, v_oficina_id, 'Servicio Con Fecha Futura',
    now() + interval '1 day', now() + interval '1 day 2 hours'
  );

  -- 7. Servicio con fecha_fin anterior a fecha_inicio
  insert into servicios (
    id, cliente_id, tipo, estado, monto, creado_por, descripcion,
    fecha_inicio, fecha_fin
  ) values (
    v_s_finmenor, v_cliente_id, 'traslado', 'consulta', 30000, v_oficina_id, 'Servicio Con Fin Menor',
    '2026-09-16 12:00:00-03', '2026-09-16 10:00:00-03'
  );

  -- 8. Servicio traslado intentando registrar en_curso
  insert into servicios (
    id, cliente_id, tipo, estado, monto, creado_por, descripcion,
    fecha_inicio, fecha_fin
  ) values (
    v_s_encurso_traslado, v_cliente_id, 'traslado', 'consulta', 30000, v_oficina_id, 'Traslado En Curso Invalido',
    v_fecha_ini, null
  );

  -- 9. Servicio para probar que chofer no puede llamar la RPC
  insert into servicios (
    id, cliente_id, tipo, estado, monto, creado_por, descripcion,
    fecha_inicio, fecha_fin
  ) values (
    v_s_chofer, v_cliente_id, 'traslado', 'consulta', 35000, v_oficina_id, 'Servicio Intento Chofer',
    v_fecha_ini, v_fecha_fin
  );
end $$;

-- 1. Estado final es 'terminado' para servicio realizado
select is(
  (select estado from servicios where descripcion = 'Servicio Retroactivo OK'),
  'terminado'::estado_servicio,
  'El estado final del servicio realizado es terminado'
);

-- 2. fecha_inicio queda la del formulario y no now()
select is(
  (select fecha_inicio from servicios where descripcion = 'Servicio Retroactivo OK'),
  '2026-09-16 10:00:00-03'::timestamptz,
  'fecha_inicio se conserva como la del formulario y no se sobreescribe con now()'
);

-- 3. fecha_fin queda la del formulario y no now()
select is(
  (select fecha_fin from servicios where descripcion = 'Servicio Retroactivo OK'),
  '2026-09-16 12:00:00-03'::timestamptz,
  'fecha_fin se conserva como la del formulario y no se sobreescribe con now()'
);

-- 4. Se registraron exactamente 3 eventos de transición para terminado
select is(
  (select count(*)::int from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Servicio Retroactivo OK')),
  3,
  'Se registraron exactamente tres eventos en la auditoría para terminado'
);

-- 5, 6, 7. Los tres eventos tienen transiciones correctas
select is(
  (select estado_anterior || ' -> ' || estado_nuevo
   from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Servicio Retroactivo OK')
   order by id asc offset 0 limit 1),
  'consulta -> programado',
  'Evento 1: consulta -> programado'
);

select is(
  (select estado_anterior || ' -> ' || estado_nuevo
   from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Servicio Retroactivo OK')
   order by id asc offset 1 limit 1),
  'programado -> en_curso',
  'Evento 2: programado -> en_curso'
);

select is(
  (select estado_anterior || ' -> ' || estado_nuevo
   from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Servicio Retroactivo OK')
   order by id asc offset 2 limit 1),
  'en_curso -> terminado',
  'Evento 3: en_curso -> terminado'
);

-- 8. Todos los eventos tienen la nota de carga retroactiva
select is(
  (select count(*)::int from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Servicio Retroactivo OK')
     and nota = 'Carga retroactiva'),
  3,
  'Los tres eventos registran la nota Carga retroactiva'
);

-- 9. Alquiler en curso: estado final es 'en_curso'
select is(
  (select estado from servicios where descripcion = 'Alquiler Retroactivo En Curso'),
  'en_curso'::estado_servicio,
  'El estado final del alquiler registrado en curso es en_curso'
);

-- 10. Alquiler en curso: fecha_inicio se conserva
select is(
  (select fecha_inicio from servicios where descripcion = 'Alquiler Retroactivo En Curso'),
  '2026-09-16 10:00:00-03'::timestamptz,
  'Alquiler en curso: fecha_inicio se conserva como la del formulario'
);

-- 11. Alquiler en curso: fecha_fin permanece null
select ok(
  (select fecha_fin is null from servicios where descripcion = 'Alquiler Retroactivo En Curso'),
  'Alquiler en curso: fecha_fin no es exigida y queda null'
);

-- 12. Alquiler en curso: exactamente 2 eventos de transición
select is(
  (select count(*)::int from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Alquiler Retroactivo En Curso')),
  2,
  'Alquiler en curso: exactamente 2 eventos de transición'
);

-- 13, 14. Transiciones de alquiler en curso
select is(
  (select estado_anterior || ' -> ' || estado_nuevo
   from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Alquiler Retroactivo En Curso')
   order by id asc offset 0 limit 1),
  'consulta -> programado',
  'Alquiler Evento 1: consulta -> programado'
);

select is(
  (select estado_anterior || ' -> ' || estado_nuevo
   from servicio_eventos
   where servicio_id = (select id from servicios where descripcion = 'Alquiler Retroactivo En Curso')
   order by id asc offset 1 limit 1),
  'programado -> en_curso',
  'Alquiler Evento 2: programado -> en_curso'
);

-- 15. Trigger de sincronización de flota: deja la máquina en alquilada
select is(
  (select estado from maquinas where id = 'f0000000-0000-0000-0000-000000000002'),
  'alquilada'::estado_maquina,
  'El trigger de sincronización deja la máquina en estado alquilada'
);

-- 16. Exige que fecha_inicio esté seteada
select public.como_oficina();
select throws_matching(
  format('select public.registrar_servicio_realizado(''%s''::uuid)', (select id from servicios where descripcion = 'Servicio Sin Fechas')),
  'fecha_inicio debe estar seteada',
  'Rechaza si fecha_inicio no está seteada'
);

-- 17. Exige fecha_fin si p_estado_final es terminado
select throws_matching(
  format('select public.registrar_servicio_realizado(''%s''::uuid, ''test'', ''terminado''::estado_servicio)', (select id from servicios where descripcion = 'Servicio Sin Fin')),
  'fecha_inicio y fecha_fin deben estar seteadas',
  'Rechaza terminado si fecha_fin no está seteada'
);

-- 18. Exige que el servicio esté en consulta
select throws_matching(
  format('select public.registrar_servicio_realizado(''%s''::uuid)', (select id from servicios where descripcion = 'Servicio Ya Programado')),
  'El servicio debe estar en estado consulta',
  'Rechaza si el servicio no está en estado consulta'
);

-- 19. Rechaza fecha futura
select throws_matching(
  format('select public.registrar_servicio_realizado(''%s''::uuid)', (select id from servicios where descripcion = 'Servicio Con Fecha Futura')),
  'Un servicio realizado no puede tener fecha futura',
  'Rechaza si fecha_inicio es futura'
);

-- 20. Rechaza fecha_fin menor a fecha_inicio
select throws_matching(
  format('select public.registrar_servicio_realizado(''%s''::uuid)', (select id from servicios where descripcion = 'Servicio Con Fin Menor')),
  'La hora de fin es anterior a la de inicio',
  'Rechaza si fecha_fin es anterior a fecha_inicio'
);

-- 21. Rechaza en_curso si el tipo no es alquiler_periodo
select throws_matching(
  format('select public.registrar_servicio_realizado(''%s''::uuid, ''test'', ''en_curso''::estado_servicio)', (select id from servicios where descripcion = 'Traslado En Curso Invalido')),
  'Solo los alquileres por período pueden registrarse en curso',
  'Rechaza registrar en_curso cuando tipo no es alquiler_periodo'
);

-- 22. Rechaza p_estado_final inválido (ej: cancelado)
select throws_matching(
  format('select public.registrar_servicio_realizado(''%s''::uuid, ''test'', ''cancelado''::estado_servicio)', (select id from servicios where descripcion = 'Servicio Sin Fechas')),
  'p_estado_final inválido',
  'Rechaza p_estado_final que no sea en_curso o terminado'
);
select public.como_postgres();

-- 23. Valida admin u oficina: chofer no tiene permisos
select throws_matching(
  format('select public.como_chofer1(); select public.registrar_servicio_realizado(''%s''::uuid);', (select id from servicios where descripcion = 'Servicio Intento Chofer')),
  'No autorizado',
  'Chofer es rechazado por no ser admin u oficina'
);
select public.como_postgres();

select * from finish();
rollback;
