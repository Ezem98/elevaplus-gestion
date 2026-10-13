-- 18-asistente-servicio-realizado.sql: Pruebas pgTAP del asistente Chimuelo - servicios ya realizados
begin;
select plan(15);

-- Tabla temporal para compartir IDs entre diferentes contextos de rol sin violar RLS
create temp table _test_18_fixtures (
  clave text primary key,
  valor uuid
);
grant all on _test_18_fixtures to authenticated;

-- ----------------------------------------------------------------------------
-- 1. Verificación de privilegios y permisos de ejecución
-- ----------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.crear_propuesta(uuid, text, jsonb, text)', 'EXECUTE'),
  'anon no puede ejecutar crear_propuesta'
);

select ok(
  not has_function_privilege('anon', 'public.confirmar_propuesta(uuid)', 'EXECUTE'),
  'anon no puede ejecutar confirmar_propuesta'
);

select ok(
  has_function_privilege('authenticated', 'public.crear_propuesta(uuid, text, jsonb, text)', 'EXECUTE'),
  'authenticated conserva EXECUTE en crear_propuesta'
);

select ok(
  has_function_privilege('authenticated', 'public.confirmar_propuesta(uuid)', 'EXECUTE'),
  'authenticated conserva EXECUTE en confirmar_propuesta'
);

-- ----------------------------------------------------------------------------
-- 2. Variables y fixtures para pruebas
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_chofer_id uuid := 'a0000000-0000-0000-0000-000000000003';
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_c_admin uuid := '77700000-0000-0000-0000-000000000021';
  v_c_oficina uuid := '77700000-0000-0000-0000-000000000022';
  v_p_valida record;
  v_p_fallida record;
  v_p_ajena record;
begin
  -- 2.1 Admin crea conversación y propuesta válida de servicio realizado (ayer)
  perform public.como_admin();

  insert into public.asistente_conversaciones (id, usuario_id, titulo)
  values (v_c_admin, v_admin_id, 'Conversacion Admin Hito 6b');

  v_p_valida := public.crear_propuesta(
    v_c_admin,
    'crear_servicio_realizado',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', v_cliente_id,
      'fecha_programada', (current_date - 1)::text,
      'hora_programada', '10:00',
      'origen', 'Burzaco',
      'destino', 'Avellaneda',
      'km', 30,
      'monto', 180000,
      'descripcion', 'Traslado realizado ayer para Deza TEST-6B',
      'choferes', jsonb_build_array(v_chofer_id::text)
    ),
    'Servicio ya realizado · Traslado · Deza · ayer · Burzaco → Avellaneda · Chofer: Mauro · Precio: $ 180.000'
  );
  insert into _test_18_fixtures (clave, valor) values ('p_valida', v_p_valida.id);

  -- 2.2 Admin crea propuesta que provocará fallo en registrar_servicio_realizado (fecha futura)
  v_p_fallida := public.crear_propuesta(
    v_c_admin,
    'crear_servicio_realizado',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', v_cliente_id,
      'fecha_programada', (current_date + 5)::text,
      'origen', 'Temperley',
      'destino', 'Lomas',
      'descripcion', 'Servicio realizado futuro invalido TEST-6B'
    ),
    'Propuesta con fecha futura que debe fallar en registrar_servicio_realizado'
  );
  insert into _test_18_fixtures (clave, valor) values ('p_fallida', v_p_fallida.id);

  -- 2.3 Oficina crea conversación y propuesta propia para test de propuesta ajena
  perform public.como_oficina();

  insert into public.asistente_conversaciones (id, usuario_id, titulo)
  values (v_c_oficina, v_oficina_id, 'Conversacion Oficina Hito 6b');

  v_p_ajena := public.crear_propuesta(
    v_c_oficina,
    'crear_servicio_realizado',
    jsonb_build_object(
      'tipo', 'mantenimiento',
      'cliente_id', v_cliente_id,
      'fecha_programada', (current_date - 2)::text,
      'descripcion', 'Service retroactivo oficina TEST-6B'
    ),
    'Propuesta realizada creada por oficina'
  );
  insert into _test_18_fixtures (clave, valor) values ('p_ajena_oficina', v_p_ajena.id);
end $$;

-- ----------------------------------------------------------------------------
-- 3. Confirmar propuesta válida crea servicio con fecha pasada y lo deja terminado
-- ----------------------------------------------------------------------------
select public.como_admin();

do $$
declare
  v_prop_id uuid;
  v_res jsonb;
  v_serv_id uuid;
  v_serv public.servicios%rowtype;
  v_cant_choferes int;
  v_cant_eventos int;
  v_eventos text[];
begin
  select valor into v_prop_id from _test_18_fixtures where clave = 'p_valida';

  v_res := public.confirmar_propuesta(v_prop_id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'estado') <> 'confirmada' then
    raise exception 'confirmar_propuesta no retorno confirmada: %', v_res;
  end if;

  v_serv_id := (v_res->>'resultado_id')::uuid;
  if v_serv_id is null then
    raise exception 'resultado_id vino nulo';
  end if;
  insert into _test_18_fixtures (clave, valor) values ('serv_creado', v_serv_id);

  select * into v_serv from public.servicios where id = v_serv_id;
  if not found then
    raise exception 'Servicio no encontrado en la base';
  end if;

  if v_serv.estado <> 'terminado' then
    raise exception 'El servicio no quedo en estado terminado (estado actual: %)', v_serv.estado;
  end if;

  if v_serv.fecha_programada <> (current_date - 1) then
    raise exception 'La fecha programada no es la de ayer (% != %)', v_serv.fecha_programada, current_date - 1;
  end if;

  -- Chofer Mauro asignado
  select count(*) into v_cant_choferes
  from public.servicio_choferes
  where servicio_id = v_serv_id and chofer_id = 'a0000000-0000-0000-0000-000000000003';

  if v_cant_choferes <> 1 then
    raise exception 'El chofer no fue asignado a servicio_choferes (count: %)', v_cant_choferes;
  end if;

  -- Eventos en servicio_eventos: consulta -> programado -> en_curso -> terminado
  select count(*), array_agg(estado_anterior || '->' || estado_nuevo order by id asc)
  into v_cant_eventos, v_eventos
  from public.servicio_eventos
  where servicio_id = v_serv_id;

  if v_cant_eventos < 3 then
    raise exception 'servicio_eventos tiene menos de 3 eventos (count: %, eventos: %)', v_cant_eventos, v_eventos;
  end if;
end $$;

select pass('confirmar crear_servicio_realizado crea el servicio con fecha pasada, lo deja terminado con chofer y eventos');

select is(
  (select estado::text from public.asistente_propuestas where id = (select valor from _test_18_fixtures where clave = 'p_valida')),
  'confirmada',
  'propuesta valida queda marcada como confirmada'
);

select is(
  (select resultado_id from public.asistente_propuestas where id = (select valor from _test_18_fixtures where clave = 'p_valida')),
  (select valor from _test_18_fixtures where clave = 'serv_creado'),
  'resultado_id apunta al servicio creado'
);

-- ----------------------------------------------------------------------------
-- 4. Doble confirmación es idempotente y no duplica servicio ni eventos
-- ----------------------------------------------------------------------------
do $$
declare
  v_prop_id uuid;
  v_serv_id uuid;
  v_res jsonb;
  v_cant_eventos_antes int;
  v_cant_eventos_despues int;
begin
  select valor into v_prop_id from _test_18_fixtures where clave = 'p_valida';
  select valor into v_serv_id from _test_18_fixtures where clave = 'serv_creado';

  select count(*) into v_cant_eventos_antes from public.servicio_eventos where servicio_id = v_serv_id;

  v_res := public.confirmar_propuesta(v_prop_id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'ya_confirmada')::boolean is not true then
    raise exception 'Segundo toque no retorno ya_confirmada: %', v_res;
  end if;

  select count(*) into v_cant_eventos_despues from public.servicio_eventos where servicio_id = v_serv_id;
  if v_cant_eventos_despues <> v_cant_eventos_antes then
    raise exception 'Doble confirmacion agrego eventos duplicados (% != %)', v_cant_eventos_despues, v_cant_eventos_antes;
  end if;
end $$;

select pass('doble confirmacion es idempotente y no duplica servicio ni eventos');

-- ----------------------------------------------------------------------------
-- 5. Si registrar_servicio_realizado falla: todo o nada (propuesta fallida, sin servicio)
-- ----------------------------------------------------------------------------
do $$
declare
  v_prop_id uuid;
  v_res jsonb;
  v_prop_estado text;
  v_prop_error text;
  v_cant_servicios int;
begin
  select valor into v_prop_id from _test_18_fixtures where clave = 'p_fallida';

  v_res := public.confirmar_propuesta(v_prop_id);

  if (v_res->>'ok')::boolean is not false or (v_res->>'estado') <> 'fallida' then
    raise exception 'confirmar_propuesta con fecha futura no retorno fallida: %', v_res;
  end if;

  select estado::text, error into v_prop_estado, v_prop_error
  from public.asistente_propuestas where id = v_prop_id;

  if v_prop_estado <> 'fallida' or v_prop_error is null then
    raise exception 'La propuesta no se guardo como fallida (estado: %, error: %)', v_prop_estado, v_prop_error;
  end if;

  -- Verificar atomicidad: ningun servicio quedo creado
  select count(*) into v_cant_servicios
  from public.servicios
  where descripcion = 'Servicio realizado futuro invalido TEST-6B';

  if v_cant_servicios <> 0 then
    raise exception 'El servicio fue creado a pesar de que registrar_servicio_realizado fallo (count: %)', v_cant_servicios;
  end if;
end $$;

select pass('si registrar_servicio_realizado falla no queda ningun servicio creado y la propuesta queda fallida');

-- ----------------------------------------------------------------------------
-- 6. Propuesta ajena no se confirma
-- ----------------------------------------------------------------------------
-- Admin intenta confirmar propuesta creada por oficina
select public.como_admin();

select throws_ok(
  $$
    select public.confirmar_propuesta((select valor from _test_18_fixtures where clave = 'p_ajena_oficina'))
  $$,
  'No autorizado: la propuesta no pertenece al usuario actual',
  'admin no puede confirmar propuesta ajena creada por oficina'
);

-- Oficina intenta confirmar propuesta de admin
select public.como_oficina();

select throws_ok(
  $$
    select public.confirmar_propuesta((select valor from _test_18_fixtures where clave = 'p_valida'))
  $$,
  'No autorizado: la propuesta no pertenece al usuario actual',
  'oficina no puede confirmar propuesta ajena creada por admin'
);

-- ----------------------------------------------------------------------------
-- 7. Chofer no puede confirmar propuestas
-- ----------------------------------------------------------------------------
select public.como_chofer1();

select throws_ok(
  $$
    select public.confirmar_propuesta((select valor from _test_18_fixtures where clave = 'p_valida'))
  $$,
  'No autorizado: solo admin u oficina pueden confirmar propuestas',
  'chofer no puede confirmar propuestas'
);

-- ----------------------------------------------------------------------------
-- 8. Regresión: crear_servicio y cambiar_estado siguen funcionando
-- ----------------------------------------------------------------------------
select public.como_admin();

-- 8.1 crear_servicio estándar (futuro)
do $$
declare
  v_c_admin uuid := '77700000-0000-0000-0000-000000000021';
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_prop record;
  v_res jsonb;
  v_serv public.servicios%rowtype;
begin
  v_prop := public.crear_propuesta(
    v_c_admin,
    'crear_servicio',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', v_cliente_id,
      'fecha_programada', (current_date + 3)::text,
      'origen', 'Lomas',
      'destino', 'Banfield',
      'descripcion', 'Regresion crear_servicio 0039'
    ),
    'Propuesta crear_servicio regresion 0039'
  );

  v_res := public.confirmar_propuesta(v_prop.id);
  if (v_res->>'ok')::boolean is not true or (v_res->>'estado') <> 'confirmada' then
    raise exception 'Regresion crear_servicio fallo: %', v_res;
  end if;

  select * into v_serv from public.servicios where id = (v_res->>'resultado_id')::uuid;
  if not found or v_serv.descripcion <> 'Regresion crear_servicio 0039' then
    raise exception 'Servicio de regresion no encontrado';
  end if;

  insert into _test_18_fixtures (clave, valor) values ('serv_regresion', v_serv.id);
end $$;

select pass('regresion: crear_servicio sigue funcionando correctamente');

-- 8.2 cambiar_estado estándar
do $$
declare
  v_c_admin uuid := '77700000-0000-0000-0000-000000000021';
  v_serv_id uuid;
  v_prop record;
  v_res jsonb;
  v_serv public.servicios%rowtype;
begin
  select valor into v_serv_id from _test_18_fixtures where clave = 'serv_regresion';

  v_prop := public.crear_propuesta(
    v_c_admin,
    'cambiar_estado',
    jsonb_build_object(
      'servicio_id', v_serv_id,
      'nuevo_estado', 'cancelado',
      'nota', 'Cancelacion de regresion'
    ),
    'Propuesta cambiar_estado regresion 0039'
  );

  v_res := public.confirmar_propuesta(v_prop.id);
  if (v_res->>'ok')::boolean is not true or (v_res->>'estado') <> 'confirmada' then
    raise exception 'Regresion cambiar_estado fallo: %', v_res;
  end if;

  select * into v_serv from public.servicios where id = v_serv_id;
  if v_serv.estado <> 'cancelado' then
    raise exception 'Servicio no cambio a cancelado (estado: %)', v_serv.estado;
  end if;
end $$;

select pass('regresion: cambiar_estado sigue funcionando correctamente');

-- ----------------------------------------------------------------------------
-- 9. Validación del check de crear_propuesta
-- ----------------------------------------------------------------------------
select throws_ok(
  $$
    select public.crear_propuesta(
      '77700000-0000-0000-0000-000000000021'::uuid,
      'accion_loca',
      '{}'::jsonb,
      'Resumen invalido'
    )
  $$,
  'Acción inválida o no soportada: accion_loca',
  'crear_propuesta rechaza acciones fuera del check'
);

select * from finish();
rollback;
