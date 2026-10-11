-- 17-asistente-cambio-estado.sql: Pruebas pgTAP del asistente Chimuelo - propuesta de cambio de estado
begin;
select plan(13);

-- Tabla temporal para compartir IDs entre diferentes contextos de rol sin violar RLS
create temp table _test_17_fixtures (
  clave text primary key,
  valor uuid
);
grant all on _test_17_fixtures to authenticated;

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
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_c_admin uuid := '77700000-0000-0000-0000-000000000011';
  v_c_oficina uuid := '77700000-0000-0000-0000-000000000012';
  v_serv_valido public.servicios;
  v_p_valida record;
  v_p_ajena record;
begin
  -- 2.1 Admin crea servicio programado
  perform public.como_admin();

  insert into public.asistente_conversaciones (id, usuario_id, titulo)
  values (v_c_admin, v_admin_id, 'Conversacion Admin Hito 6a');

  insert into public.servicios (
    cliente_id, tipo, estado, fecha_programada, hora_programada, origen, destino, descripcion
  ) values (
    v_cliente_id, 'traslado', 'programado', '2026-10-15', '09:00', 'Burzaco', 'Avellaneda', 'Servicio para test cambio estado valido'
  ) returning * into v_serv_valido;

  insert into _test_17_fixtures (clave, valor) values ('serv_valido', v_serv_valido.id);

  -- Admin crea propuesta de cambio de estado a 'terminado'
  v_p_valida := public.crear_propuesta(
    v_c_admin,
    'cambiar_estado',
    jsonb_build_object(
      'servicio_id', v_serv_valido.id,
      'estado_actual', 'programado',
      'nuevo_estado', 'terminado',
      'nota', 'Finalizado según Chimuelo'
    ),
    'Propuesta de cambio de estado a terminado'
  );
  insert into _test_17_fixtures (clave, valor) values ('p_valida', v_p_valida.id);

  -- 2.2 Oficina crea conversación y propuesta propia para test de propuesta ajena
  perform public.como_oficina();

  insert into public.asistente_conversaciones (id, usuario_id, titulo)
  values (v_c_oficina, v_oficina_id, 'Conversacion Oficina Hito 6a');

  v_p_ajena := public.crear_propuesta(
    v_c_oficina,
    'cambiar_estado',
    jsonb_build_object(
      'servicio_id', v_serv_valido.id,
      'estado_actual', 'programado',
      'nuevo_estado', 'terminado'
    ),
    'Propuesta creada por oficina'
  );
  insert into _test_17_fixtures (clave, valor) values ('p_ajena_oficina', v_p_ajena.id);
end $$;

-- ----------------------------------------------------------------------------
-- 3. Confirmar propuesta válida cambia el estado y genera servicio_eventos
-- ----------------------------------------------------------------------------
select public.como_admin();

do $$
declare
  v_prop_id uuid;
  v_serv_id uuid;
  v_res jsonb;
  v_serv public.servicios%rowtype;
  v_evento public.servicio_eventos%rowtype;
begin
  select valor into v_prop_id from _test_17_fixtures where clave = 'p_valida';
  select valor into v_serv_id from _test_17_fixtures where clave = 'serv_valido';

  v_res := public.confirmar_propuesta(v_prop_id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'estado') <> 'confirmada' then
    raise exception 'confirmar_propuesta no retorno estado confirmada: %', v_res;
  end if;

  select * into v_serv from public.servicios where id = v_serv_id;
  if v_serv.estado <> 'terminado' then
    raise exception 'El estado del servicio no cambio a terminado (estado: %)', v_serv.estado;
  end if;

  select * into v_evento from public.servicio_eventos
  where servicio_id = v_serv_id
  order by created_at desc
  limit 1;

  if v_evento.estado_anterior <> 'programado' or v_evento.estado_nuevo <> 'terminado' then
    raise exception 'servicio_eventos no registro la transicion correctamente (% -> %)',
      v_evento.estado_anterior, v_evento.estado_nuevo;
  end if;

  if v_evento.nota <> 'Finalizado según Chimuelo' then
    raise exception 'La nota en servicio_eventos no coincide: %', v_evento.nota;
  end if;
end $$;

select pass('confirmar propuesta de cambio de estado valida cambia el estado y registra el evento con nota');

select is(
  (select estado::text from public.asistente_propuestas where id = (select valor from _test_17_fixtures where clave = 'p_valida')),
  'confirmada',
  'la propuesta valida queda marcada como confirmada'
);

select is(
  (select resultado_id from public.asistente_propuestas where id = (select valor from _test_17_fixtures where clave = 'p_valida')),
  (select valor from _test_17_fixtures where clave = 'serv_valido'),
  'resultado_id apunta al servicio modificado'
);

-- ----------------------------------------------------------------------------
-- 4. Doble confirmación es idempotente y no aplica dos veces
-- ----------------------------------------------------------------------------
do $$
declare
  v_prop_id uuid;
  v_serv_id uuid;
  v_res jsonb;
  v_cant_eventos int;
begin
  select valor into v_prop_id from _test_17_fixtures where clave = 'p_valida';
  select valor into v_serv_id from _test_17_fixtures where clave = 'serv_valido';

  select count(*) into v_cant_eventos from public.servicio_eventos where servicio_id = v_serv_id;

  -- Segundo toque
  v_res := public.confirmar_propuesta(v_prop_id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'ya_confirmada')::boolean is not true then
    raise exception 'Segundo toque no retorno ya_confirmada: %', v_res;
  end if;

  if (select count(*) from public.servicio_eventos where servicio_id = v_serv_id) <> v_cant_eventos then
    raise exception 'Doble confirmacion inserto eventos adicionales en servicio_eventos';
  end if;
end $$;

select pass('doble confirmacion es idempotente y no repite la transicion ni eventos');

-- ----------------------------------------------------------------------------
-- 5. Transición inválida deja la propuesta 'fallida' y el servicio sin cambios
-- ----------------------------------------------------------------------------
-- Como oficina: un servicio ya terminado no puede pasar a 'en_curso'
select public.como_oficina();

do $$
declare
  v_c_oficina uuid := '77700000-0000-0000-0000-000000000012';
  v_serv_id uuid;
  v_prop record;
  v_res jsonb;
  v_serv_estado text;
  v_prop_estado text;
  v_prop_error text;
begin
  select valor into v_serv_id from _test_17_fixtures where clave = 'serv_valido';

  -- El servicio esta en 'terminado'. Para oficina, terminado -> en_curso es invalido.
  v_prop := public.crear_propuesta(
    v_c_oficina,
    'cambiar_estado',
    jsonb_build_object(
      'servicio_id', v_serv_id,
      'estado_actual', 'terminado',
      'nuevo_estado', 'en_curso',
      'nota', 'Intento transicion invalida'
    ),
    'Propuesta con transicion invalida'
  );

  v_res := public.confirmar_propuesta(v_prop.id);

  if (v_res->>'ok')::boolean is not false or (v_res->>'estado') <> 'fallida' then
    raise exception 'confirmar_propuesta con transicion invalida no retorno fallida: %', v_res;
  end if;

  select estado::text, error into v_prop_estado, v_prop_error
  from public.asistente_propuestas where id = v_prop.id;

  if v_prop_estado <> 'fallida' or v_prop_error is null then
    raise exception 'La propuesta no se guardo como fallida (estado: %, error: %)', v_prop_estado, v_prop_error;
  end if;

  select estado::text into v_serv_estado from public.servicios where id = v_serv_id;
  if v_serv_estado <> 'terminado' then
    raise exception 'El servicio fue modificado a pesar del error (estado: %)', v_serv_estado;
  end if;
end $$;

select pass('transicion invalida marca la propuesta como fallida y deja el servicio intacto');

-- ----------------------------------------------------------------------------
-- 6. Propuesta ajena no se confirma
-- ----------------------------------------------------------------------------
-- Admin intenta confirmar la propuesta creada por oficina
select public.como_admin();

select throws_ok(
  $$
    select public.confirmar_propuesta((select valor from _test_17_fixtures where clave = 'p_ajena_oficina'))
  $$,
  'No autorizado: la propuesta no pertenece al usuario actual',
  'confirmar_propuesta rechaza propuesta ajena'
);

-- Oficina intenta confirmar la propuesta creada por admin
select public.como_oficina();

do $$
declare
  v_c_admin uuid := '77700000-0000-0000-0000-000000000011';
  v_p_admin_nueva record;
begin
  perform public.como_admin();
  v_p_admin_nueva := public.crear_propuesta(
    v_c_admin,
    'cambiar_estado',
    jsonb_build_object('servicio_id', gen_random_uuid(), 'nuevo_estado', 'cancelado'),
    'Propuesta admin para test ajeno'
  );
  insert into _test_17_fixtures (clave, valor) values ('p_admin_ajena', v_p_admin_nueva.id);
  perform public.como_oficina();
end $$;

select throws_ok(
  $$
    select public.confirmar_propuesta((select valor from _test_17_fixtures where clave = 'p_admin_ajena'))
  $$,
  'No autorizado: la propuesta no pertenece al usuario actual',
  'oficina no puede confirmar propuesta de admin'
);

-- ----------------------------------------------------------------------------
-- 7. Las propuestas de crear_servicio siguen funcionando
-- ----------------------------------------------------------------------------
select public.como_oficina();

do $$
declare
  v_c_oficina uuid := '77700000-0000-0000-0000-000000000012';
  v_cliente_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_prop record;
  v_res jsonb;
  v_serv_creado public.servicios%rowtype;
begin
  v_prop := public.crear_propuesta(
    v_c_oficina,
    'crear_servicio',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', v_cliente_id,
      'descripcion', 'Servicio via crear_propuesta regresion 0038',
      'origen', 'Lanús',
      'destino', 'Banfield'
    ),
    'Propuesta crear_servicio regresion'
  );

  v_res := public.confirmar_propuesta(v_prop.id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'estado') <> 'confirmada' then
    raise exception 'confirmar_propuesta para crear_servicio fallo: %', v_res;
  end if;

  select * into v_serv_creado from public.servicios where id = (v_res->>'resultado_id')::uuid;
  if not found or v_serv_creado.descripcion <> 'Servicio via crear_propuesta regresion 0038' then
    raise exception 'El servicio no fue creado correctamente';
  end if;
end $$;

select pass('propuestas de crear_servicio siguen funcionando correctamente');

-- ----------------------------------------------------------------------------
-- 8. Validaciones de crear_propuesta para accion 'cambiar_estado'
-- ----------------------------------------------------------------------------
select throws_ok(
  $$
    select public.crear_propuesta(
      '77700000-0000-0000-0000-000000000012'::uuid,
      'accion_inexistente',
      '{}'::jsonb,
      'Resumen invalido'
    )
  $$,
  'Acción inválida o no soportada: accion_inexistente',
  'crear_propuesta rechaza acciones fuera del check'
);

select * from finish();
rollback;
