-- 09-recorridos-rpc.sql: Pruebas pgTAP de recorridos, reprogramación, carga retroactiva y presupuestos
begin;
select plan(20);

create temp table _test_recorridos_ids (
  s_orig_id uuid,
  s_nuevo_id uuid,
  s_retro_id uuid,
  s_presup_id uuid,
  s_sin_pendientes_id uuid,
  s_alquiler_id uuid
);
grant all on _test_recorridos_ids to authenticated;

do $$
declare
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_s_orig uuid := gen_random_uuid();
  v_s_nuevo record;
  v_s_retro uuid := gen_random_uuid();
  v_s_sin_pendientes uuid := gen_random_uuid();
  v_s_alquiler uuid := gen_random_uuid();
  v_pres record;
  v_fecha_ini timestamptz := '2026-09-20 10:00:00-03';
  v_fecha_fin timestamptz := '2026-09-20 13:00:00-03';
begin
  -- -------------------------------------------------------------------------
  -- 1. Setup para reprogramar_paradas_pendientes
  -- -------------------------------------------------------------------------
  -- Servicio original en estado terminado, con 4 paradas (2 completadas, 2 no_realizadas)
  insert into servicios (
    id, cliente_id, tipo, estado, descripcion, origen, destino, monto, creado_por
  ) values (
    v_s_orig, v_cliente_id, 'traslado', 'terminado', 'Recorrido original 4 paradas',
    'Base Burzaco', 'Destino Final', 120000, v_oficina_id
  );

  insert into paradas (servicio_id, orden, direccion, localidad, carga, carga_desde, estado, completada_at)
  values
    (v_s_orig, 1, 'Calle 1, Quilmes', 'Quilmes', 'Pallet 1', 'origen', 'completada', now() - interval '2 hours'),
    (v_s_orig, 2, 'Av. Mitre 500, Avellaneda', 'Avellaneda', 'Pallet 2', 'origen', 'completada', now() - interval '1 hour'),
    (v_s_orig, 3, 'Calle 3, Lanús', 'Lanús', 'Pallet 3', 'origen', 'no_realizada', null),
    (v_s_orig, 4, 'Calle 4, Lomas', 'Lomas de Zamora', 'Pallet 4', 'origen', 'no_realizada', null);

  -- Ejecutar reprogramación como oficina
  perform public.como_oficina();
  select * into v_s_nuevo from public.reprogramar_paradas_pendientes(v_s_orig);
  perform public.como_postgres();

  -- -------------------------------------------------------------------------
  -- 2. Setup servicio sin paradas pendientes (todas completadas)
  -- -------------------------------------------------------------------------
  insert into servicios (
    id, cliente_id, tipo, estado, descripcion, origen, destino, monto, creado_por
  ) values (
    v_s_sin_pendientes, v_cliente_id, 'traslado', 'terminado', 'Recorrido completo',
    'Base Burzaco', 'Destino', 80000, v_oficina_id
  );

  insert into paradas (servicio_id, orden, direccion, localidad, estado, completada_at)
  values
    (v_s_sin_pendientes, 1, 'Parada A', 'Localidad A', 'completada', now()),
    (v_s_sin_pendientes, 2, 'Parada B', 'Localidad B', 'completada', now());

  -- -------------------------------------------------------------------------
  -- 3. Setup servicio de tipo alquiler_hora (para probar restricción solo en traslados)
  -- -------------------------------------------------------------------------
  insert into servicios (
    id, cliente_id, tipo, estado, descripcion, monto, creado_por
  ) values (
    v_s_alquiler, v_cliente_id, 'alquiler_hora', 'programado', 'Alquiler autoelevador', 50000, v_oficina_id
  );

  -- -------------------------------------------------------------------------
  -- 4. Setup para carga retroactiva con paradas
  -- -------------------------------------------------------------------------
  insert into servicios (
    id, cliente_id, tipo, estado, descripcion, origen, destino, monto,
    fecha_programada, hora_programada, fecha_inicio, fecha_fin, creado_por
  ) values (
    v_s_retro, v_cliente_id, 'traslado', 'consulta', 'Carga retroactiva con paradas',
    'Galpón', 'Destino', 95000, '2026-09-20', '10:00', v_fecha_ini, v_fecha_fin, v_oficina_id
  );

  insert into paradas (servicio_id, orden, direccion, localidad, estado)
  values
    (v_s_retro, 1, 'Retro 1, Berazategui', 'Berazategui', 'pendiente'),
    (v_s_retro, 2, 'Retro 2, Florencio Varela', 'Florencio Varela', 'pendiente'),
    (v_s_retro, 3, 'Retro 3, Quilmes', 'Quilmes', 'pendiente');

  perform public.como_oficina();
  perform public.registrar_servicio_realizado(v_s_retro, 'Carga retroactiva test', 'terminado'::estado_servicio);
  perform public.como_postgres();

  -- -------------------------------------------------------------------------
  -- 5. Setup para ítem de presupuesto con paradas
  -- -------------------------------------------------------------------------
  perform public.como_oficina();
  select * into v_pres from public.crear_presupuesto(
    jsonb_build_object(
      'cliente_id', v_cliente_id::text,
      'validez_dias', 15
    ),
    jsonb_build_array(
      jsonb_build_object(
        'tipo', 'traslado',
        'descripcion', 'Traslado presupuestado con 3 paradas',
        'origen', 'Origen Presupuesto',
        'monto', 150000,
        'paradas', jsonb_build_array(
          jsonb_build_object('direccion', 'Presup Parada 1', 'localidad', 'Lanús', 'carga', 'Caja 1'),
          jsonb_build_object('direccion', 'Presup Parada 2', 'localidad', 'Banfield', 'carga', 'Caja 2'),
          jsonb_build_object('direccion', 'Presup Parada 3', 'localidad', 'Temperley', 'carga', 'Caja 3')
        )
      )
    )
  );
  perform public.como_postgres();

  insert into _test_recorridos_ids values (
    v_s_orig,
    v_s_nuevo.id,
    v_s_retro,
    (select id from servicios where presupuesto_id = v_pres.id limit 1),
    v_s_sin_pendientes,
    v_s_alquiler
  );
end $$;

-- =============================================================================
-- TEST SUITE 1: reprogramar_paradas_pendientes
-- =============================================================================

-- 1.1 Estado del nuevo servicio es 'aceptado'
select is(
  (select estado::text from servicios where id = (select s_nuevo_id from _test_recorridos_ids)),
  'aceptado',
  'reprogramar_paradas_pendientes crea el nuevo servicio en estado aceptado'
);

-- 1.2 continuacion_de apunta al original
select is(
  (select continuacion_de from servicios where id = (select s_nuevo_id from _test_recorridos_ids)),
  (select s_orig_id from _test_recorridos_ids),
  'reprogramar_paradas_pendientes vincula continuacion_de al servicio original'
);

-- 1.3 Monto del nuevo servicio queda en null (para definirse)
select is(
  (select monto from servicios where id = (select s_nuevo_id from _test_recorridos_ids)),
  null::numeric,
  'reprogramar_paradas_pendientes deja monto en null para definir por oficina'
);

-- 1.4 Origen es la última parada completada ('Av. Mitre 500, Avellaneda, Avellaneda')
select is(
  (select origen from servicios where id = (select s_nuevo_id from _test_recorridos_ids)),
  'Av. Mitre 500, Avellaneda, Avellaneda',
  'reprogramar_paradas_pendientes establece origen como la última parada completada'
);

-- 1.5 Destino es la última parada no realizada ('Calle 4, Lomas, Lomas de Zamora')
select is(
  (select destino from servicios where id = (select s_nuevo_id from _test_recorridos_ids)),
  'Calle 4, Lomas, Lomas de Zamora',
  'reprogramar_paradas_pendientes establece destino como la última parada pendiente'
);

-- 1.6 Cantidad de paradas copiadas: 2 paradas
select is(
  (select count(*)::int from paradas where servicio_id = (select s_nuevo_id from _test_recorridos_ids)),
  2,
  'reprogramar_paradas_pendientes copia exactamente las paradas no realizadas'
);

-- 1.7 Todas las paradas del nuevo servicio están en estado 'pendiente' y ordenadas 1, 2
select is(
  (select count(*)::int from paradas where servicio_id = (select s_nuevo_id from _test_recorridos_ids) and estado = 'pendiente'),
  2,
  'las paradas reprogramadas tienen estado pendiente'
);

-- 1.8 Traza en servicio_eventos para el nuevo servicio
select is(
  (select count(*)::int from servicio_eventos where servicio_id = (select s_nuevo_id from _test_recorridos_ids) and estado_nuevo = 'aceptado'),
  1,
  'reprogramar_paradas_pendientes registra evento de auditoría en servicio_eventos'
);

-- 1.9 Validar que no se puede reprogramar dos veces el mismo servicio
select public.como_oficina();
select throws_ok(
  format(
    $$select public.reprogramar_paradas_pendientes('%s'::uuid)$$,
    (select s_orig_id from _test_recorridos_ids)
  ),
  'Este recorrido ya tiene paradas reprogramadas',
  'reprogramar_paradas_pendientes falla si el recorrido ya fue reprogramado'
);

-- 1.10 Validar que falla si no hay paradas no_realizada
select throws_ok(
  format(
    $$select public.reprogramar_paradas_pendientes('%s'::uuid)$$,
    (select s_sin_pendientes_id from _test_recorridos_ids)
  ),
  'No hay paradas pendientes para reprogramar',
  'reprogramar_paradas_pendientes falla si no hay paradas no_realizada'
);

-- 1.11 Validar que chofer no puede reprogramar
select public.como_chofer1();
select throws_ok(
  format(
    $$select public.reprogramar_paradas_pendientes('%s'::uuid)$$,
    (select s_sin_pendientes_id from _test_recorridos_ids)
  ),
  'No autorizado: solo admin u oficina pueden reprogramar paradas',
  'reprogramar_paradas_pendientes prohibido para rol chofer'
);
select public.como_postgres();

-- =============================================================================
-- TEST SUITE 2: Carga retroactiva con paradas (registrar_servicio_realizado)
-- =============================================================================

-- 2.1 Todas las paradas del servicio retroactivo pasaron a 'completada'
select is(
  (select count(*)::int from paradas where servicio_id = (select s_retro_id from _test_recorridos_ids) and estado = 'completada'),
  3,
  'registrar_servicio_realizado marca todas las paradas en completada en la misma transacción'
);

-- 2.2 Todas tienen completada_at seteado
select is(
  (select count(*)::int from paradas where servicio_id = (select s_retro_id from _test_recorridos_ids) and completada_at is not null),
  3,
  'registrar_servicio_realizado asigna completada_at a todas las paradas'
);

-- =============================================================================
-- TEST SUITE 3: Presupuestos con ítems con paradas (_insertar_items_presupuesto)
-- =============================================================================

-- 3.1 El servicio del presupuesto tiene las 3 paradas insertadas
select is(
  (select count(*)::int from paradas where servicio_id = (select s_presup_id from _test_recorridos_ids)),
  3,
  '_insertar_items_presupuesto inserta las paradas del ítem de presupuesto en la misma transacción'
);

-- 3.2 Todas las paradas del presupuesto están en estado pendiente
select is(
  (select count(*)::int from paradas where servicio_id = (select s_presup_id from _test_recorridos_ids) and estado = 'pendiente'),
  3,
  'las paradas del ítem de presupuesto se crean en estado pendiente'
);

-- 3.3 El orden de las paradas es 1, 2, 3
select is(
  (select array_agg(orden order by orden) from paradas where servicio_id = (select s_presup_id from _test_recorridos_ids)),
  array[1, 2, 3],
  'las paradas del ítem de presupuesto preservan el orden correlativo 1..N'
);

-- 3.4 Validar que paradas en presupuesto solo se permiten en traslados
select public.como_oficina();
select throws_ok(
  $$select public.crear_presupuesto(
    '{"prospecto_nombre": "Test Fallo No Traslado", "validez_dias": 15}'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'tipo', 'alquiler_hora',
        'monto', 50000,
        'paradas', jsonb_build_array(jsonb_build_object('direccion', 'Parada Inválida'))
      )
    )
  )$$,
  'Solo los traslados pueden tener paradas',
  'crear_presupuesto falla si un ítem no traslado tiene paradas'
);

-- 3.5 Validar que cada parada en presupuesto necesita dirección no vacía
select throws_ok(
  $$select public.crear_presupuesto(
    '{"prospecto_nombre": "Test Fallo Sin Direccion", "validez_dias": 15}'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'tipo', 'traslado',
        'monto', 50000,
        'paradas', jsonb_build_array(jsonb_build_object('direccion', '   '))
      )
    )
  )$$,
  'Cada parada necesita una dirección',
  'crear_presupuesto falla si una parada tiene dirección vacía'
);

-- =============================================================================
-- TEST SUITE 4: Validaciones en guardar_paradas
-- =============================================================================

-- 4.1 guardar_paradas falla en servicios que no son de tipo traslado
select throws_ok(
  format(
    $$select public.guardar_paradas('%s'::uuid, '[{"direccion": "Parada Test"}]'::jsonb)$$,
    (select s_alquiler_id from _test_recorridos_ids)
  ),
  'Solo los traslados pueden tener paradas',
  'guardar_paradas falla si el servicio no es de tipo traslado'
);

-- 4.2 guardar_paradas falla si alguna parada no tiene dirección o está vacía
select throws_ok(
  format(
    $$select public.guardar_paradas('%s'::uuid, '[{"direccion": ""}]'::jsonb)$$,
    (select s_nuevo_id from _test_recorridos_ids)
  ),
  'Cada parada necesita una dirección',
  'guardar_paradas falla si una parada tiene dirección vacía'
);

select public.como_postgres();

select * from finish();
rollback;
