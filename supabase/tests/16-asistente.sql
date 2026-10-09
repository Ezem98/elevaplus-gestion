-- 16-asistente.sql: Pruebas pgTAP del asistente Chimuelo (tablas, RLS y RPCs)
begin;
select plan(34);

-- Tabla temporal para compartir IDs entre diferentes contextos de rol sin violar RLS
create temp table _test_asistente_fixtures (
  clave text primary key,
  valor uuid
);
grant all on _test_asistente_fixtures to authenticated;

-- ----------------------------------------------------------------------------
-- 1. Verificación de privilegios y permisos de ejecución
-- ----------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.crear_servicio(jsonb, uuid[])', 'EXECUTE'),
  'anon no puede ejecutar crear_servicio'
);

select ok(
  not has_function_privilege('anon', 'public.crear_propuesta(uuid, text, jsonb, text)', 'EXECUTE'),
  'anon no puede ejecutar crear_propuesta'
);

select ok(
  not has_function_privilege('anon', 'public.confirmar_propuesta(uuid)', 'EXECUTE'),
  'anon no puede ejecutar confirmar_propuesta'
);

select ok(
  not has_function_privilege('anon', 'public.descartar_propuesta(uuid)', 'EXECUTE'),
  'anon no puede ejecutar descartar_propuesta'
);

select ok(
  not has_function_privilege('anon', 'public._insertar_un_servicio(uuid, uuid, jsonb)', 'EXECUTE'),
  'anon no puede ejecutar _insertar_un_servicio'
);

select ok(
  not has_function_privilege('authenticated', 'public._insertar_un_servicio(uuid, uuid, jsonb)', 'EXECUTE'),
  'authenticated no puede ejecutar la funcion interna _insertar_un_servicio'
);

select ok(
  has_function_privilege('authenticated', 'public.crear_servicio(jsonb, uuid[])', 'EXECUTE'),
  'authenticated conserva EXECUTE en crear_servicio'
);

select ok(
  has_function_privilege('authenticated', 'public.crear_propuesta(uuid, text, jsonb, text)', 'EXECUTE'),
  'authenticated conserva EXECUTE en crear_propuesta'
);

select ok(
  has_function_privilege('authenticated', 'public.confirmar_propuesta(uuid)', 'EXECUTE'),
  'authenticated conserva EXECUTE en confirmar_propuesta'
);

select ok(
  has_function_privilege('authenticated', 'public.descartar_propuesta(uuid)', 'EXECUTE'),
  'authenticated conserva EXECUTE en descartar_propuesta'
);

-- ----------------------------------------------------------------------------
-- 2. Variables y fixtures para pruebas de RLS y RPCs
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_chofer1_id uuid := 'a0000000-0000-0000-0000-000000000003';
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_c_admin uuid := '77700000-0000-0000-0000-000000000001';
  v_c_oficina uuid := '77700000-0000-0000-0000-000000000002';
  v_m_admin uuid := '88800000-0000-0000-0000-000000000001';
  v_m_oficina uuid := '88800000-0000-0000-0000-000000000002';
  v_p_admin record;
  v_p_oficina record;
begin
  -- 2.1 Admin inserta conversación, mensaje y propuesta propia
  perform public.como_admin();
  insert into public.asistente_conversaciones (id, usuario_id, titulo)
  values (v_c_admin, v_admin_id, 'Conversacion Admin');

  insert into public.asistente_mensajes (id, conversacion_id, rol, contenido)
  values (v_m_admin, v_c_admin, 'usuario', 'Mensaje de admin');

  v_p_admin := public.crear_propuesta(
    v_c_admin,
    'crear_servicio',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', v_cliente_id,
      'origen', 'Burzaco',
      'destino', 'Avellaneda'
    ),
    'Propuesta admin para traslado'
  );
  insert into _test_asistente_fixtures (clave, valor) values ('p_admin', v_p_admin.id);

  -- 2.2 Oficina inserta conversación, mensaje y propuesta propia
  perform public.como_oficina();
  insert into public.asistente_conversaciones (id, usuario_id, titulo)
  values (v_c_oficina, v_oficina_id, 'Conversacion Oficina');

  insert into public.asistente_mensajes (id, conversacion_id, rol, contenido)
  values (v_m_oficina, v_c_oficina, 'usuario', 'Mensaje de oficina');

  v_p_oficina := public.crear_propuesta(
    v_c_oficina,
    'crear_servicio',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', v_cliente_id,
      'origen', 'Lomas',
      'destino', 'Lanús'
    ),
    'Propuesta oficina para traslado'
  );
  insert into _test_asistente_fixtures (clave, valor) values ('p_oficina', v_p_oficina.id);
end $$;

-- ----------------------------------------------------------------------------
-- 3. RLS: Oficina solo ve lo suyo, no lo de otro usuario
-- ----------------------------------------------------------------------------
select public.como_oficina();

select is(
  (select count(*)::int from public.asistente_conversaciones where id = '77700000-0000-0000-0000-000000000001'::uuid),
  0,
  'RLS: oficina no ve conversacion de admin'
);

select is(
  (select count(*)::int from public.asistente_conversaciones where id = '77700000-0000-0000-0000-000000000002'::uuid),
  1,
  'RLS: oficina ve su propia conversacion'
);

select is(
  (select count(*)::int from public.asistente_mensajes where id = '88800000-0000-0000-0000-000000000001'::uuid),
  0,
  'RLS: oficina no ve mensajes de admin'
);

select is(
  (select count(*)::int from public.asistente_mensajes where id = '88800000-0000-0000-0000-000000000002'::uuid),
  1,
  'RLS: oficina ve sus propios mensajes'
);

select is(
  (select count(*)::int from public.asistente_propuestas where usuario_id = 'a0000000-0000-0000-0000-000000000001'::uuid),
  0,
  'RLS: oficina no ve propuestas de admin'
);

select is(
  (select count(*)::int from public.asistente_propuestas where usuario_id = 'a0000000-0000-0000-0000-000000000002'::uuid),
  1,
  'RLS: oficina ve sus propias propuestas'
);

-- Inserción directa en propuestas bloqueada desde el front para authenticated
select throws_ok(
  $$
    insert into public.asistente_propuestas (
      conversacion_id,
      usuario_id,
      accion,
      datos,
      resumen
    ) values (
      '77700000-0000-0000-0000-000000000002'::uuid,
      'a0000000-0000-0000-0000-000000000002'::uuid,
      'crear_servicio',
      '{}'::jsonb,
      'Intento directo'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "asistente_propuestas"',
  'RLS: nadie inserta propuestas directo desde el front'
);

-- ----------------------------------------------------------------------------
-- 4. RLS: Chofer no tiene acceso a nada en v1
-- ----------------------------------------------------------------------------
select public.como_chofer1();

select is(
  (select count(*)::int from public.asistente_conversaciones),
  0,
  'RLS: chofer no ve ninguna conversacion'
);

select is(
  (select count(*)::int from public.asistente_mensajes),
  0,
  'RLS: chofer no ve ningun mensaje'
);

select is(
  (select count(*)::int from public.asistente_propuestas),
  0,
  'RLS: chofer no ve ninguna propuesta'
);

select throws_ok(
  $$
    select public.crear_servicio(
      jsonb_build_object(
        'tipo', 'traslado',
        'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid
      )
    )
  $$,
  'No autorizado: solo admin u oficina pueden crear servicios',
  'RPC crear_servicio rechaza rol chofer'
);

select throws_ok(
  $$
    select public.crear_propuesta(
      '77700000-0000-0000-0000-000000000002'::uuid,
      'crear_servicio',
      '{}'::jsonb,
      'Intento chofer'
    )
  $$,
  'No autorizado: solo admin u oficina pueden crear propuestas',
  'RPC crear_propuesta rechaza rol chofer'
);

select throws_ok(
  $$
    select public.confirmar_propuesta('77700000-0000-0000-0000-000000000001'::uuid)
  $$,
  'No autorizado: solo admin u oficina pueden confirmar propuestas',
  'RPC confirmar_propuesta rechaza rol chofer'
);

-- ----------------------------------------------------------------------------
-- 5. RPC crear_servicio: crea todo o nada (paradas, choferes -> programado)
-- ----------------------------------------------------------------------------
select public.como_oficina();

-- 5.1 Servicio completo con paradas
do $$
declare
  v_serv record;
  v_cant_paradas int;
begin
  v_serv := public.crear_servicio(
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid,
      'descripcion', 'Traslado completo con paradas',
      'monto', 250000,
      'moneda', 'ARS',
      'nocturno', true,
      'seguro_importe', 12100,
      'direccion_trabajo', 'Calle 10 123',
      'localidad_trabajo', 'Berazategui',
      'trabajo_a_realizar', 'Cargar autoelevador',
      'paradas', jsonb_build_array(
        jsonb_build_object('direccion', 'Parada A 100', 'localidad', 'Quilmes'),
        jsonb_build_object('direccion', 'Parada B 200', 'localidad', 'Bernal')
      )
    )
  );

  select count(*) into v_cant_paradas from public.paradas where servicio_id = v_serv.id;
  if v_serv.estado <> 'consulta' or v_cant_paradas <> 2 or not v_serv.nocturno or v_serv.monto_seguro <> 10000 then
    raise exception 'crear_servicio no persistio paradas o datos correctamente';
  end if;
end $$;

select pass('crear_servicio inserta datos completos, paradas y seguro correctamente en estado consulta');

-- 5.2 Todo o nada: paradas invalidas provocan rollback total
do $$
declare
  v_count_servicios_antes int;
  v_count_servicios_despues int;
begin
  select count(*) into v_count_servicios_antes from public.servicios where descripcion = 'Traslado paradas invalidas';

  begin
    perform public.crear_servicio(
      jsonb_build_object(
        'tipo', 'traslado',
        'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid,
        'descripcion', 'Traslado paradas invalidas',
        'paradas', jsonb_build_array(
          jsonb_build_object('direccion', 'Parada valida'),
          jsonb_build_object('direccion', '') -- direccion vacia provoca excepcion
        )
      )
    );
  exception when others then
    null;
  end;

  select count(*) into v_count_servicios_despues from public.servicios where descripcion = 'Traslado paradas invalidas';
  if v_count_servicios_antes <> v_count_servicios_despues then
    raise exception 'Rollback fallido: el servicio se creo a pesar de paradas invalidas';
  end if;
end $$;

select pass('crear_servicio es atomico: paradas invalidas hacen rollback total sin dejar filas');

-- 5.3 Con fecha y choferes -> se programa automaticamente
do $$
declare
  v_serv record;
  v_chofer_asignado boolean;
begin
  v_serv := public.crear_servicio(
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid,
      'descripcion', 'Traslado programado directo',
      'fecha_programada', '2026-10-15',
      'hora_programada', '09:00',
      'origen', 'Base ELEVAPLUS',
      'destino', 'Planta Deza'
    ),
    array['a0000000-0000-0000-0000-000000000003'::uuid]
  );

  select exists (
    select 1 from public.servicio_choferes
    where servicio_id = v_serv.id and chofer_id = 'a0000000-0000-0000-0000-000000000003'::uuid
  ) into v_chofer_asignado;

  if v_serv.estado <> 'programado' or not v_chofer_asignado then
    raise exception 'crear_servicio con choferes no paso a programado';
  end if;
end $$;

select pass('crear_servicio con fecha y choferes pasa inmediatamente a estado programado y asigna chofer');

-- ----------------------------------------------------------------------------
-- 6. RPC crear_propuesta y confirmar_propuesta (validaciones de usuario)
-- ----------------------------------------------------------------------------
-- 6.1 Oficina no puede crear propuesta en conversacion de admin
select throws_ok(
  $$
    select public.crear_propuesta(
      '77700000-0000-0000-0000-000000000001'::uuid,
      'crear_servicio',
      '{"tipo":"traslado"}'::jsonb,
      'Intento en conv ajena'
    )
  $$,
  'No autorizado: la conversación no pertenece al usuario',
  'crear_propuesta rechaza asociar a conversacion ajena'
);

-- 6.2 Oficina no puede confirmar propuesta de admin
select throws_ok(
  $$
    select public.confirmar_propuesta(
      (select valor from _test_asistente_fixtures where clave = 'p_admin')
    )
  $$,
  'No autorizado: la propuesta no pertenece al usuario actual',
  'confirmar_propuesta rechaza propuesta perteneciente a otro usuario'
);

-- 6.3 Propuesta vencida no ejecuta
do $$
declare
  v_prop_vencida record;
begin
  perform public.como_admin();
  v_prop_vencida := public.crear_propuesta(
    '77700000-0000-0000-0000-000000000001'::uuid,
    'crear_servicio',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid
    ),
    'Propuesta vencida test'
  );

  insert into _test_asistente_fixtures (clave, valor) values ('p_vencida', v_prop_vencida.id);

  -- Forzar expira_at en el pasado como postgres para eludir RLS en el update directo
  perform public.como_postgres();
  update public.asistente_propuestas
  set expira_at = now() - interval '1 minute'
  where id = v_prop_vencida.id;
end $$;

select public.como_admin();
select is(
  (select public.confirmar_propuesta(
    (select valor from _test_asistente_fixtures where clave = 'p_vencida')
  ) ->> 'estado'),
  'vencida',
  'confirmar_propuesta no ejecuta una propuesta vencida'
);

select is(
  (select estado::text from public.asistente_propuestas
   where id = (select valor from _test_asistente_fixtures where clave = 'p_vencida')),
  'vencida',
  'la propuesta vencida queda marcada como vencida'
);

-- ----------------------------------------------------------------------------
-- 7. confirmar_propuesta: exito e idempotencia (doble toque no duplica)
-- ----------------------------------------------------------------------------
select public.como_oficina();

do $$
declare
  v_prop record;
  v_res1 jsonb;
  v_res2 jsonb;
  v_serv_id uuid;
  v_cant_servicios int;
begin
  v_prop := public.crear_propuesta(
    '77700000-0000-0000-0000-000000000002'::uuid,
    'crear_servicio',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid,
      'descripcion', 'Traslado via propuesta Chimuelo',
      'fecha_programada', '2026-10-20',
      'origen', 'Dock Sud',
      'destino', 'Avellaneda',
      'choferes', jsonb_build_array('a0000000-0000-0000-0000-000000000003')
    ),
    'Propuesta doble toque test'
  );

  -- Primer toque
  v_res1 := public.confirmar_propuesta(v_prop.id);
  v_serv_id := (v_res1->>'resultado_id')::uuid;

  if (v_res1->>'ok')::boolean is not true or (v_res1->>'estado') <> 'confirmada' or v_serv_id is null then
    raise exception 'Primer confirmar_propuesta no retorno confirmada exitosamente';
  end if;

  -- Segundo toque (simula doble click / retry de red)
  v_res2 := public.confirmar_propuesta(v_prop.id);

  if (v_res2->>'ok')::boolean is not true or (v_res2->>'ya_confirmada')::boolean is not true or (v_res2->>'resultado_id')::uuid <> v_serv_id then
    raise exception 'Segundo confirmar_propuesta no fue idempotente';
  end if;

  select count(*) into v_cant_servicios from public.servicios where descripcion = 'Traslado via propuesta Chimuelo';
  if v_cant_servicios <> 1 then
    raise exception 'Doble toque creo mas de un servicio (encontrados: %)', v_cant_servicios;
  end if;
end $$;

select pass('confirmar_propuesta es idempotente ante doble toque y no crea servicios duplicados');

-- ----------------------------------------------------------------------------
-- 8. confirmar_propuesta: marca 'fallida' si crear_servicio rechaza sin abortar tx
-- ----------------------------------------------------------------------------
do $$
declare
  v_prop record;
  v_res jsonb;
  v_estado_final text;
  v_error_final text;
begin
  -- Creamos propuesta con datos invalidos (paradas con direccion vacia)
  v_prop := public.crear_propuesta(
    '77700000-0000-0000-0000-000000000002'::uuid,
    'crear_servicio',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid,
      'descripcion', 'Traslado condenado a fallar',
      'paradas', jsonb_build_array(
        jsonb_build_object('direccion', '')
      )
    ),
    'Propuesta fallida test'
  );

  -- Al confirmar, crear_servicio arroja excepcion pero confirmar_propuesta la captura
  v_res := public.confirmar_propuesta(v_prop.id);

  if (v_res->>'ok')::boolean is not false or (v_res->>'estado') <> 'fallida' then
    raise exception 'confirmar_propuesta no retorno resultado fallido esperado';
  end if;

  select estado, error into v_estado_final, v_error_final
  from public.asistente_propuestas
  where id = v_prop.id;

  if v_estado_final <> 'fallida' or v_error_final is null then
    raise exception 'La propuesta no quedo marcada como fallida en la base (estado: %, error: %)', v_estado_final, v_error_final;
  end if;
end $$;

select pass('confirmar_propuesta marca la propuesta como fallida con el error sin abortar la transaccion');

-- ----------------------------------------------------------------------------
-- 9. descartar_propuesta: marca descartada y rechaza si ya esta confirmada
-- ----------------------------------------------------------------------------
do $$
declare
  v_prop record;
  v_desc record;
begin
  v_prop := public.crear_propuesta(
    '77700000-0000-0000-0000-000000000002'::uuid,
    'crear_servicio',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid
    ),
    'Propuesta a descartar'
  );

  v_desc := public.descartar_propuesta(v_prop.id);
  if v_desc.estado <> 'descartada' then
    raise exception 'descartar_propuesta no cambio estado a descartada';
  end if;
end $$;

select pass('descartar_propuesta marca la propuesta como descartada correctamente');

select throws_ok(
  $$
    select public.descartar_propuesta(
      (select id from public.asistente_propuestas where resumen = 'Propuesta doble toque test')
    )
  $$,
  'No se puede descartar una propuesta ya confirmada',
  'descartar_propuesta rechaza propuesta que ya esta confirmada'
);

select * from finish();
rollback;
