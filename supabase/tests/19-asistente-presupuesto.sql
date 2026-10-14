-- 19-asistente-presupuesto.sql: Pruebas pgTAP del asistente Chimuelo - propuesta de presupuesto
begin;
select plan(15);

-- Tabla temporal para compartir IDs entre diferentes contextos de rol sin violar RLS
create temp table _test_19_fixtures (
  clave text primary key,
  valor uuid
);
grant all on _test_19_fixtures to authenticated;

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
  v_c_admin uuid := '77700000-0000-0000-0000-000000000031';
  v_c_oficina uuid := '77700000-0000-0000-0000-000000000032';
  v_p_cliente record;
  v_p_prospecto record;
  v_p_fallida record;
  v_p_ajena record;
begin
  -- 2.1 Admin crea conversación y propuesta de presupuesto para cliente existente
  perform public.como_admin();

  insert into public.asistente_conversaciones (id, usuario_id, titulo)
  values (v_c_admin, v_admin_id, 'Conversacion Admin Hito 6c');

  v_p_cliente := public.crear_propuesta(
    v_c_admin,
    'crear_presupuesto',
    jsonb_build_object(
      'presupuesto', jsonb_build_object(
        'cliente_id', v_cliente_id,
        'validez_dias', 15,
        'condiciones', 'Pago 50% al aceptar'
      ),
      'items', jsonb_build_array(
        jsonb_build_object(
          'tipo', 'traslado',
          'descripcion', 'Traslado de la AE-01 de Burzaco a Campana',
          'monto', 350000,
          'moneda', 'ARS',
          'origen', 'Burzaco',
          'destino', 'Campana'
        ),
        jsonb_build_object(
          'tipo', 'alquiler_periodo',
          'descripcion', '3 días de alquiler AE-01',
          'monto', 540000,
          'moneda', 'ARS',
          'alquiler', jsonb_build_object(
            'fecha_desde', (current_date + 2)::text,
            'fecha_hasta', (current_date + 5)::text,
            'unidad', 'dia',
            'cantidad', 3,
            'precio_unidad', 180000
          )
        )
      )
    ),
    'Presupuesto para Deza · 2 ítems · Total: $ 890.000'
  );
  insert into _test_19_fixtures (clave, valor) values ('p_cliente', v_p_cliente.id);

  -- 2.2 Admin crea propuesta de presupuesto para prospecto (sin cliente_id)
  v_p_prospecto := public.crear_propuesta(
    v_c_admin,
    'crear_presupuesto',
    jsonb_build_object(
      'presupuesto', jsonb_build_object(
        'prospecto_nombre', 'Techint S.A.',
        'prospecto_telefono', '1122334455',
        'validez_dias', 10
      ),
      'items', jsonb_build_array(
        jsonb_build_object(
          'tipo', 'traslado',
          'descripcion', 'Traslado a planta Techint Campana',
          'monto', 380000,
          'moneda', 'ARS',
          'origen', 'Burzaco',
          'destino', 'Campana'
        )
      )
    ),
    'Presupuesto para prospecto Techint · Total: $ 380.000'
  );
  insert into _test_19_fixtures (clave, valor) values ('p_prospecto', v_p_prospecto.id);

  -- 2.3 Admin crea propuesta que provocará fallo en crear_presupuesto (sin cliente ni prospecto)
  v_p_fallida := public.crear_propuesta(
    v_c_admin,
    'crear_presupuesto',
    jsonb_build_object(
      'presupuesto', jsonb_build_object(
        'validez_dias', 15
      ),
      'items', jsonb_build_array(
        jsonb_build_object(
          'tipo', 'traslado',
          'descripcion', 'Traslado inválido sin cliente ni prospecto',
          'monto', 100000
        )
      )
    ),
    'Presupuesto inválido para test de fallo'
  );
  insert into _test_19_fixtures (clave, valor) values ('p_fallida', v_p_fallida.id);

  -- 2.4 Oficina crea conversación y propuesta propia para test de propuesta ajena
  perform public.como_oficina();

  insert into public.asistente_conversaciones (id, usuario_id, titulo)
  values (v_c_oficina, v_oficina_id, 'Conversacion Oficina Hito 6c');

  v_p_ajena := public.crear_propuesta(
    v_c_oficina,
    'crear_presupuesto',
    jsonb_build_object(
      'presupuesto', jsonb_build_object(
        'cliente_id', v_cliente_id,
        'validez_dias', 15
      ),
      'items', jsonb_build_array(
        jsonb_build_object(
          'tipo', 'mantenimiento',
          'descripcion', 'Mantenimiento preventivo',
          'monto', 90000
        )
      )
    ),
    'Presupuesto creado por oficina'
  );
  insert into _test_19_fixtures (clave, valor) values ('p_ajena_oficina', v_p_ajena.id);
end $$;

-- ----------------------------------------------------------------------------
-- 3. Confirmar presupuesto con cliente existente crea presupuesto y servicios
-- ----------------------------------------------------------------------------
select public.como_admin();

do $$
declare
  v_prop_id uuid;
  v_res jsonb;
  v_pres_id uuid;
  v_pres public.presupuestos%rowtype;
  v_cant_servicios int;
  v_suma_montos numeric;
  v_cant_alquileres int;
begin
  select valor into v_prop_id from _test_19_fixtures where clave = 'p_cliente';

  v_res := public.confirmar_propuesta(v_prop_id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'estado') <> 'confirmada' then
    raise exception 'confirmar_propuesta no retorno confirmada: %', v_res;
  end if;

  v_pres_id := (v_res->>'resultado_id')::uuid;
  if v_pres_id is null then
    raise exception 'resultado_id vino nulo';
  end if;
  insert into _test_19_fixtures (clave, valor) values ('pres_cliente_creado', v_pres_id);

  select * into v_pres from public.presupuestos where id = v_pres_id;
  if not found then
    raise exception 'Presupuesto no encontrado en la base';
  end if;

  if v_pres.cliente_id <> 'c0000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'El presupuesto no tiene el cliente esperado (% != c0000000-...)', v_pres.cliente_id;
  end if;

  if v_pres.estado <> 'borrador' then
    raise exception 'El presupuesto no nacio en borrador (estado: %)', v_pres.estado;
  end if;

  -- Verificar servicios vinculados
  select count(*), coalesce(sum(monto), 0)
  into v_cant_servicios, v_suma_montos
  from public.servicios
  where presupuesto_id = v_pres_id;

  if v_cant_servicios <> 2 then
    raise exception 'El presupuesto debe tener 2 servicios asociados (count: %)', v_cant_servicios;
  end if;

  if v_suma_montos <> 890000 then
    raise exception 'La suma de montos no coincide con 890000 (% != 890000)', v_suma_montos;
  end if;

  -- Verificar registro de alquiler
  select count(*) into v_cant_alquileres
  from public.alquileres a
  join public.servicios s on s.id = a.servicio_id
  where s.presupuesto_id = v_pres_id and a.precio_unidad = 180000 and a.cantidad = 3;

  if v_cant_alquileres <> 1 then
    raise exception 'No se creo el registro de alquiler con los datos esperados (count: %)', v_cant_alquileres;
  end if;
end $$;

select pass('confirmar crear_presupuesto con cliente existente crea el presupuesto y sus items con montos exactos');

select is(
  (select estado::text from public.asistente_propuestas where id = (select valor from _test_19_fixtures where clave = 'p_cliente')),
  'confirmada',
  'propuesta de presupuesto para cliente existente queda confirmada'
);

select is(
  (select resultado_id from public.asistente_propuestas where id = (select valor from _test_19_fixtures where clave = 'p_cliente')),
  (select valor from _test_19_fixtures where clave = 'pres_cliente_creado'),
  'resultado_id de la propuesta apunta al presupuesto creado'
);

-- ----------------------------------------------------------------------------
-- 4. Doble confirmación es idempotente y no duplica
-- ----------------------------------------------------------------------------
do $$
declare
  v_prop_id uuid;
  v_pres_id uuid;
  v_res jsonb;
  v_cant_servicios_antes int;
  v_cant_servicios_despues int;
begin
  select valor into v_prop_id from _test_19_fixtures where clave = 'p_cliente';
  select valor into v_pres_id from _test_19_fixtures where clave = 'pres_cliente_creado';

  select count(*) into v_cant_servicios_antes from public.servicios where presupuesto_id = v_pres_id;

  v_res := public.confirmar_propuesta(v_prop_id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'ya_confirmada')::boolean is not true then
    raise exception 'Segundo toque no retorno ya_confirmada: %', v_res;
  end if;

  select count(*) into v_cant_servicios_despues from public.servicios where presupuesto_id = v_pres_id;
  if v_cant_servicios_despues <> v_cant_servicios_antes then
    raise exception 'Doble confirmacion agrego items duplicados (% != %)', v_cant_servicios_despues, v_cant_servicios_antes;
  end if;
end $$;

select pass('doble confirmacion es idempotente y no duplica presupuesto ni servicios');

-- ----------------------------------------------------------------------------
-- 5. Confirmar presupuesto para prospecto
-- ----------------------------------------------------------------------------
do $$
declare
  v_prop_id uuid;
  v_res jsonb;
  v_pres_id uuid;
  v_pres public.presupuestos%rowtype;
  v_cant_servicios int;
begin
  select valor into v_prop_id from _test_19_fixtures where clave = 'p_prospecto';

  v_res := public.confirmar_propuesta(v_prop_id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'estado') <> 'confirmada' then
    raise exception 'confirmar_propuesta con prospecto no retorno confirmada: %', v_res;
  end if;

  v_pres_id := (v_res->>'resultado_id')::uuid;
  select * into v_pres from public.presupuestos where id = v_pres_id;

  if v_pres.cliente_id is not null then
    raise exception 'El cliente_id del prospecto debe ser nulo (cliente_id: %)', v_pres.cliente_id;
  end if;

  if v_pres.prospecto_nombre <> 'Techint S.A.' then
    raise exception 'El prospecto_nombre no coincide (% != Techint S.A.)', v_pres.prospecto_nombre;
  end if;

  select count(*) into v_cant_servicios from public.servicios where presupuesto_id = v_pres_id;
  if v_cant_servicios <> 1 then
    raise exception 'El presupuesto del prospecto debe tener 1 servicio asociado';
  end if;
end $$;

select pass('confirmar crear_presupuesto para prospecto crea presupuesto con prospecto_nombre y sus items');

-- ----------------------------------------------------------------------------
-- 6. Si crear_presupuesto falla: todo o nada (propuesta fallida, nada creado)
-- ----------------------------------------------------------------------------
do $$
declare
  v_prop_id uuid;
  v_res jsonb;
  v_prop_estado text;
  v_prop_error text;
  v_cant_servicios int;
begin
  select valor into v_prop_id from _test_19_fixtures where clave = 'p_fallida';

  v_res := public.confirmar_propuesta(v_prop_id);

  if (v_res->>'ok')::boolean is not false or (v_res->>'estado') <> 'fallida' then
    raise exception 'confirmar_propuesta inválida no retorno fallida: %', v_res;
  end if;

  select estado::text, error into v_prop_estado, v_prop_error
  from public.asistente_propuestas where id = v_prop_id;

  if v_prop_estado <> 'fallida' or v_prop_error is null then
    raise exception 'La propuesta no se guardo como fallida (estado: %, error: %)', v_prop_estado, v_prop_error;
  end if;

  select count(*) into v_cant_servicios
  from public.servicios
  where descripcion = 'Traslado inválido sin cliente ni prospecto';

  if v_cant_servicios <> 0 then
    raise exception 'El servicio fue creado a pesar del fallo en crear_presupuesto (count: %)', v_cant_servicios;
  end if;
end $$;

select pass('si crear_presupuesto falla, la propuesta queda fallida y nada es creado');

-- ----------------------------------------------------------------------------
-- 7. Propuesta ajena no puede confirmarse
-- ----------------------------------------------------------------------------
select public.como_admin();

select throws_ok(
  $$
    select public.confirmar_propuesta((select valor from _test_19_fixtures where clave = 'p_ajena_oficina'))
  $$,
  'No autorizado: la propuesta no pertenece al usuario actual',
  'confirmar_propuesta rechaza propuesta ajena'
);

-- ----------------------------------------------------------------------------
-- 8. Chofer no puede crear ni confirmar propuestas
-- ----------------------------------------------------------------------------
select public.como_chofer1();

select throws_ok(
  $$
    select public.crear_propuesta(
      '77700000-0000-0000-0000-000000000031'::uuid,
      'crear_presupuesto',
      '{}'::jsonb,
      'Resumen chofer no autorizado'
    )
  $$,
  'No autorizado: solo admin u oficina pueden crear propuestas',
  'chofer no puede ejecutar crear_propuesta'
);

select throws_ok(
  $$
    select public.confirmar_propuesta((select valor from _test_19_fixtures where clave = 'p_cliente'))
  $$,
  'No autorizado: solo admin u oficina pueden confirmar propuestas',
  'chofer no puede ejecutar confirmar_propuesta'
);

-- ----------------------------------------------------------------------------
-- 9. Acciones anteriores siguen andando
-- ----------------------------------------------------------------------------
select public.como_admin();

-- 9.1 crear_servicio
do $$
declare
  v_conv_id uuid := '77700000-0000-0000-0000-000000000031';
  v_prop record;
  v_res jsonb;
  v_serv_creado public.servicios;
begin
  v_prop := public.crear_propuesta(
    v_conv_id,
    'crear_servicio',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid,
      'fecha_programada', (current_date + 1)::text,
      'origen', 'Burzaco',
      'destino', 'Avellaneda',
      'descripcion', 'Servicio regresion hito 6c'
    ),
    'Regresion crear_servicio'
  );

  v_res := public.confirmar_propuesta(v_prop.id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'estado') <> 'confirmada' then
    raise exception 'confirmar_propuesta para crear_servicio fallo: %', v_res;
  end if;

  select * into v_serv_creado from public.servicios where id = (v_res->>'resultado_id')::uuid;
  if not found or v_serv_creado.descripcion <> 'Servicio regresion hito 6c' then
    raise exception 'El servicio no fue creado correctamente';
  end if;
end $$;

select pass('propuestas de crear_servicio siguen funcionando correctamente');

-- 9.2 crear_servicio_realizado
do $$
declare
  v_conv_id uuid := '77700000-0000-0000-0000-000000000031';
  v_prop record;
  v_res jsonb;
  v_serv_creado public.servicios;
begin
  v_prop := public.crear_propuesta(
    v_conv_id,
    'crear_servicio_realizado',
    jsonb_build_object(
      'tipo', 'traslado',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001'::uuid,
      'fecha_programada', (current_date - 1)::text,
      'origen', 'Burzaco',
      'destino', 'Avellaneda',
      'descripcion', 'Servicio realizado regresion hito 6c'
    ),
    'Regresion crear_servicio_realizado'
  );

  v_res := public.confirmar_propuesta(v_prop.id);

  if (v_res->>'ok')::boolean is not true or (v_res->>'estado') <> 'confirmada' then
    raise exception 'confirmar_propuesta para crear_servicio_realizado fallo: %', v_res;
  end if;

  select * into v_serv_creado from public.servicios where id = (v_res->>'resultado_id')::uuid;
  if not found or v_serv_creado.estado <> 'terminado' then
    raise exception 'El servicio realizado no quedo en estado terminado';
  end if;
end $$;

select pass('propuestas de crear_servicio_realizado siguen funcionando correctamente');

select * from finish();
rollback;
