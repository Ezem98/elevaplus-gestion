-- 15-anon-sin-execute.sql: Verificación de revocación de EXECUTE para anon y control de acceso
begin;
select plan(29);

-- ----------------------------------------------------------------------------
-- 1. Ninguna función security definer de public es ejecutable por anon (0 filas)
-- ----------------------------------------------------------------------------
select is_empty(
  $$
    select p.proname, pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'Ninguna funcion security definer de public es ejecutable por anon'
);

-- ----------------------------------------------------------------------------
-- 2. authenticated conserva EXECUTE en funciones requeridas por la aplicación
-- ----------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.cambiar_estado(uuid, estado_servicio, text)', 'EXECUTE'),
  'authenticated conserva EXECUTE en cambiar_estado'
);

select ok(
  has_function_privilege('authenticated', 'public.cambiar_estado_cheque(uuid, estado_cheque, text, uuid, date, text, uuid, numeric, text, text)', 'EXECUTE'),
  'authenticated conserva EXECUTE en cambiar_estado_cheque'
);

select ok(
  has_function_privilege('authenticated', 'public.mi_rol()', 'EXECUTE'),
  'authenticated conserva EXECUTE en mi_rol'
);

select ok(
  has_function_privilege('authenticated', 'public.tengo_google_calendar()', 'EXECUTE'),
  'authenticated conserva EXECUTE en tengo_google_calendar'
);

select ok(
  has_function_privilege('authenticated', 'public.crear_presupuesto(jsonb, jsonb)', 'EXECUTE'),
  'authenticated conserva EXECUTE en crear_presupuesto'
);

select ok(
  has_function_privilege('authenticated', 'public.aceptar_presupuesto(uuid, uuid, jsonb)', 'EXECUTE'),
  'authenticated conserva EXECUTE en aceptar_presupuesto'
);

select ok(
  has_function_privilege('authenticated', 'public.rechazar_presupuesto(uuid, text)', 'EXECUTE'),
  'authenticated conserva EXECUTE en rechazar_presupuesto'
);

select ok(
  has_function_privilege('authenticated', 'public.agregar_items_presupuesto(uuid, jsonb)', 'EXECUTE'),
  'authenticated conserva EXECUTE en agregar_items_presupuesto'
);

select ok(
  has_function_privilege('authenticated', 'public.crear_presupuesto_desde_servicio(uuid)', 'EXECUTE'),
  'authenticated conserva EXECUTE en crear_presupuesto_desde_servicio'
);

select ok(
  has_function_privilege('authenticated', 'public.marcar_presupuesto_enviado(uuid, text)', 'EXECUTE'),
  'authenticated conserva EXECUTE en marcar_presupuesto_enviado'
);

select ok(
  has_function_privilege('authenticated', 'public.programar_servicio(uuid, date, time without time zone, uuid, uuid, uuid[])', 'EXECUTE'),
  'authenticated conserva EXECUTE en programar_servicio'
);

select ok(
  has_function_privilege('authenticated', 'public.registrar_servicio_realizado(uuid, text, estado_servicio)', 'EXECUTE'),
  'authenticated conserva EXECUTE en registrar_servicio_realizado'
);

select ok(
  has_function_privilege('authenticated', 'public.guardar_paradas(uuid, jsonb)', 'EXECUTE'),
  'authenticated conserva EXECUTE en guardar_paradas'
);

select ok(
  has_function_privilege('authenticated', 'public.cerrar_recorrido(uuid, integer)', 'EXECUTE'),
  'authenticated conserva EXECUTE en cerrar_recorrido'
);

select ok(
  has_function_privilege('authenticated', 'public.reprogramar_paradas_pendientes(uuid)', 'EXECUTE'),
  'authenticated conserva EXECUTE en reprogramar_paradas_pendientes'
);

select ok(
  has_function_privilege('authenticated', 'public.registrar_factura(jsonb, jsonb)', 'EXECUTE'),
  'authenticated conserva EXECUTE en registrar_factura'
);

select ok(
  has_function_privilege('authenticated', 'public.vincular_servicio(uuid, uuid, rol_vinculo, boolean)', 'EXECUTE'),
  'authenticated conserva EXECUTE en vincular_servicio'
);

select ok(
  has_function_privilege('authenticated', 'public.desvincular_servicio(uuid)', 'EXECUTE'),
  'authenticated conserva EXECUTE en desvincular_servicio'
);

select ok(
  has_function_privilege('authenticated', 'public.crear_traslado_vinculado(uuid, jsonb, boolean, uuid[])', 'EXECUTE'),
  'authenticated conserva EXECUTE en crear_traslado_vinculado'
);

-- ----------------------------------------------------------------------------
-- 3. Funciones no accesibles para authenticated (triggers o worker)
-- ----------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'authenticated no puede ejecutar trigger handle_new_user'
);

select ok(
  not has_function_privilege('authenticated', 'public.crear_factura_borrador(jsonb, jsonb)', 'EXECUTE'),
  'authenticated no puede ejecutar crear_factura_borrador'
);

select ok(
  not has_function_privilege('authenticated', 'public.recalcular_servicio_cobrado(uuid)', 'EXECUTE'),
  'authenticated no puede ejecutar recalcular_servicio_cobrado'
);

-- ----------------------------------------------------------------------------
-- 4. Reproducción del ataque: rol anon no puede invocar cambiar_estado
-- ----------------------------------------------------------------------------
do $$
begin
  insert into servicios (id, cliente_id, tipo, estado, descripcion)
  values (
    'e0000000-0000-0000-0000-000000000099'::uuid,
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'consulta',
    'TEST-ATAQUE-ANON'
  );
end $$;

-- Simular el llamador PostgREST anon: set local role anon + claims role=anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.cambiar_estado('e0000000-0000-0000-0000-000000000099'::uuid, 'programado'::estado_servicio, 'Ataque anon')$$,
  '42501',
  'permission denied for function cambiar_estado',
  'Llamada como anon a cambiar_estado es rechazada con permission denied (42501)'
);

-- Restaurar rol de sesion
reset role;
select set_config('request.jwt.claims', '', true);

-- Verificar que el estado del servicio no cambió
select is(
  (select estado from servicios where id = 'e0000000-0000-0000-0000-000000000099'::uuid),
  'consulta'::estado_servicio,
  'El estado del servicio no cambio tras el intento de ataque de anon'
);

-- ----------------------------------------------------------------------------
-- 5. Con claims de service_role sigue funcionando
-- ----------------------------------------------------------------------------
select public.como_service_role();

select lives_ok(
  $$select public.cambiar_estado('e0000000-0000-0000-0000-000000000099'::uuid, 'programado'::estado_servicio, 'Cambio valido service_role')$$,
  'Service role puede cambiar estado del servicio'
);

select is(
  (select estado from servicios where id = 'e0000000-0000-0000-0000-000000000099'::uuid),
  'programado'::estado_servicio,
  'Estado del servicio actualizado a programado por service_role'
);

-- ----------------------------------------------------------------------------
-- 6. Llamada directa por postgres sin JWT sigue funcionando
-- ----------------------------------------------------------------------------
select public.como_postgres();

select lives_ok(
  $$select public.cambiar_estado('e0000000-0000-0000-0000-000000000099'::uuid, 'en_curso'::estado_servicio, 'Cambio valido postgres')$$,
  'Llamada directa por postgres sin JWT puede cambiar estado'
);

select is(
  (select estado from servicios where id = 'e0000000-0000-0000-0000-000000000099'::uuid),
  'en_curso'::estado_servicio,
  'Estado del servicio actualizado a en_curso por postgres sin JWT'
);

select * from finish();
rollback;
