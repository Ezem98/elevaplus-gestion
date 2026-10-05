-- ============================================================================
-- Tests pgTAP: Vínculos entre servicios, traslados de máquinas y alquileres
-- ============================================================================

begin;

select plan(44);

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

-- Obtener una máquina existente del seed para las pruebas
do $$
declare
  v_mid uuid;
  v_alq_id uuid;
  v_tras_id uuid;
  v_canc_id uuid;
begin
  select id into v_mid from maquinas where activo = true limit 1;
  insert into ids_test (clave, valor) values ('maquina_1', v_mid);

  -- 1. Alquiler por hora principal
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    monto,
    fecha_programada,
    maquina_id,
    direccion_trabajo,
    localidad_trabajo,
    trabajo_a_realizar,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'alquiler_hora',
    'consulta',
    'Alquiler autoelevador 4h',
    120000,
    '2026-10-15'::date,
    v_mid,
    'Av. Mitre 1234',
    'Avellaneda',
    'Descarga de contenedor',
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_alq_id;
  insert into ids_test (clave, valor) values ('alquiler_principal', v_alq_id);

  -- 2. Alquiler cancelado para pruebas de rechazo
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    monto,
    fecha_programada,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'alquiler_hora',
    'cancelado',
    'Alquiler cancelado',
    100000,
    '2026-10-15'::date,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_canc_id;
  insert into ids_test (clave, valor) values ('alquiler_cancelado', v_canc_id);

  -- 3. Traslado libre (no vinculado)
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    monto,
    fecha_programada,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'consulta',
    'Traslado estándar previo',
    80000,
    '2026-10-15'::date,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_tras_id;
  insert into ids_test (clave, valor) values ('traslado_libre', v_tras_id);
end $$;

-- ----------------------------------------------------------------------------
-- 1. Constraints de modelo (§3)
-- ----------------------------------------------------------------------------

-- Test 1: vinculo_coherente falla si vinculado_a está seteado pero rol_vinculo es nulo
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, vinculado_a, rol_vinculo, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-SIN-ROL',
      50000,
      (select valor from ids_test where clave = 'alquiler_principal'),
      null,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint vinculo_coherente rechaza vinculado_a sin rol_vinculo'
);

-- Test 2: vinculo_coherente falla si rol_vinculo está seteado pero vinculado_a es nulo
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, vinculado_a, rol_vinculo, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-SIN-VINCULADO',
      50000,
      null,
      'traslado_maquina',
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint vinculo_coherente rechaza rol_vinculo sin vinculado_a'
);

-- Test 3: vinculo_coherente falla si traslado_incluido = true pero vinculado_a es nulo
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, no_facturable, traslado_incluido, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-INCLUIDO-SIN-PADRE',
      0,
      true,
      true,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint vinculo_coherente rechaza traslado_incluido sin vinculado_a'
);

-- Test 4: vinculo_coherente falla si vinculado_a = id (autorreferencia directa)
select throws_ok(
  $$
    do $b$
    declare
      v_nid uuid := gen_random_uuid();
    begin
      insert into servicios (
        id, cliente_id, tipo, estado, descripcion, monto, vinculado_a, rol_vinculo, creado_por
      ) values (
        v_nid,
        'c0000000-0000-0000-0000-000000000001'::uuid,
        'traslado',
        'consulta',
        'TEST-AUTO-VINCULO',
        50000,
        v_nid,
        'relacionado',
        'a0000000-0000-0000-0000-000000000002'::uuid
      );
    end $b$;
  $$,
  '23514',
  NULL,
  'Constraint vinculo_coherente rechaza que un servicio se vincule a sí mismo'
);

-- Test 5: traslado_incluido_solo_traslados falla si tipo <> traslado
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, no_facturable, vinculado_a, rol_vinculo, traslado_incluido, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'alquiler_hora',
      'consulta',
      'TEST-INCLUIDO-NO-TRASLADO',
      0,
      true,
      (select valor from ids_test where clave = 'alquiler_principal'),
      'traslado_maquina',
      true,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint traslado_incluido_solo_traslados rechaza servicios que no sean de tipo traslado'
);

-- Test 6: traslado_incluido_solo_traslados falla si rol_vinculo <> traslado_maquina
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, no_facturable, vinculado_a, rol_vinculo, traslado_incluido, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-INCLUIDO-ROL-INVALIDO',
      0,
      true,
      (select valor from ids_test where clave = 'alquiler_principal'),
      'relacionado',
      true,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint traslado_incluido_solo_traslados rechaza rol distinto de traslado_maquina'
);

-- Test 7: traslado_incluido_sin_monto falla si monto > 0
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, no_facturable, vinculado_a, rol_vinculo, traslado_incluido, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-INCLUIDO-CON-MONTO',
      50000,
      true,
      (select valor from ids_test where clave = 'alquiler_principal'),
      'traslado_maquina',
      true,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint traslado_incluido_sin_monto rechaza monto > 0 cuando traslado_incluido es true'
);

-- Test 8: traslado_incluido_sin_monto falla si no_facturable es false
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, no_facturable, vinculado_a, rol_vinculo, traslado_incluido, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-INCLUIDO-FACTURABLE',
      0,
      false,
      (select valor from ids_test where clave = 'alquiler_principal'),
      'traslado_maquina',
      true,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint traslado_incluido_sin_monto rechaza no_facturable = false cuando traslado_incluido es true'
);

-- ----------------------------------------------------------------------------
-- 2. Permisos: Un chofer no puede llamar a ninguna de las 3 RPC (§8)
-- ----------------------------------------------------------------------------
select public.como_chofer1();

-- Test 9: chofer no puede llamar a crear_traslado_vinculado
select throws_matching(
  $$
    select public.crear_traslado_vinculado(
      (select valor from ids_test where clave = 'alquiler_principal'),
      '{}'::jsonb,
      false
    )
  $$,
  'No autorizado',
  'Un chofer no puede llamar a crear_traslado_vinculado'
);

-- Test 10: chofer no puede llamar a vincular_servicio
select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_libre'),
      (select valor from ids_test where clave = 'alquiler_principal'),
      'relacionado'
    )
  $$,
  'No autorizado',
  'Un chofer no puede llamar a vincular_servicio'
);

-- Test 11: chofer no puede llamar a desvincular_servicio
select throws_matching(
  $$
    select public.desvincular_servicio(
      (select valor from ids_test where clave = 'traslado_libre')
    )
  $$,
  'No autorizado',
  'Un chofer no puede llamar a desvincular_servicio'
);

-- ----------------------------------------------------------------------------
-- 3. RPC crear_traslado_vinculado (§3, §8 y Ajustes 1 y 4)
-- ----------------------------------------------------------------------------
select public.como_oficina();

-- Test 12: Principal inexistente falla
select throws_matching(
  $$
    select public.crear_traslado_vinculado(
      '00000000-0000-0000-0000-000000000099'::uuid,
      '{}'::jsonb,
      false
    )
  $$,
  'Servicio principal no encontrado',
  'crear_traslado_vinculado falla si el servicio principal no existe'
);

-- Test 13: Principal cancelado rechaza vinculación (Ajuste 4)
select throws_matching(
  $$
    select public.crear_traslado_vinculado(
      (select valor from ids_test where clave = 'alquiler_cancelado'),
      '{}'::jsonb,
      false
    )
  $$,
  'cancelado',
  'crear_traslado_vinculado rechaza crear vinculado si el principal está cancelado'
);

-- Test 14: Crear traslado no incluido con monto (precarga cliente, fecha, destino concatenado, maquina, ida_y_vuelta)
do $$
declare
  v_t servicios%rowtype;
begin
  v_t := public.crear_traslado_vinculado(
    (select valor from ids_test where clave = 'alquiler_principal'),
    jsonb_build_object(
      'origen', 'Galpón Central',
      'monto', 95000
    ),
    false
  );
  insert into ids_test (clave, valor) values ('traslado_creado_pago', v_t.id);
end $$;

select results_eq(
  $$
    select
      cliente_id,
      tipo,
      estado,
      origen,
      destino,
      monto,
      no_facturable,
      ida_y_vuelta,
      maquina_id,
      vinculado_a,
      rol_vinculo,
      traslado_incluido
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_creado_pago')
  $$,
  $$
    values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado'::tipo_servicio,
      'consulta'::estado_servicio,
      'Galpón Central',
      'Av. Mitre 1234, Avellaneda',
      95000.00::numeric,
      false,
      true,
      (select valor from ids_test where clave = 'maquina_1'),
      (select valor from ids_test where clave = 'alquiler_principal'),
      'traslado_maquina'::rol_vinculo,
      false
    )
  $$,
  'crear_traslado_vinculado no incluido precarga datos del principal y respeta monto'
);

-- Test 15: Crear traslado no incluido sin monto lo deja en null (Ajuste 1)
do $$
declare
  v_t servicios%rowtype;
begin
  v_t := public.crear_traslado_vinculado(
    (select valor from ids_test where clave = 'alquiler_principal'),
    jsonb_build_object('origen', 'Galpón Central'),
    false,
    array['a0000000-0000-0000-0000-000000000003'::uuid]
  );
  insert into ids_test (clave, valor) values ('traslado_aparte_sin_monto', v_t.id);
end $$;

select results_eq(
  $$
    select monto, no_facturable, traslado_incluido, estado
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_aparte_sin_monto')
  $$,
  $$ values (null::numeric, false, false, 'programado'::estado_servicio) $$,
  'crear_traslado_vinculado no incluido sin monto deja monto en null y no_facturable en false'
);

-- Test 16: Crear traslado incluido deja monto 0, no_facturable = true y traslado_incluido = true
do $$
declare
  v_t servicios%rowtype;
begin
  v_t := public.crear_traslado_vinculado(
    (select valor from ids_test where clave = 'alquiler_principal'),
    jsonb_build_object(
      'origen', 'Galpón Central',
      'monto', 50000 -- Debe ser ignorado por p_incluido = true
    ),
    true
  );
  insert into ids_test (clave, valor) values ('traslado_creado_incluido', v_t.id);
end $$;

select results_eq(
  $$
    select monto, no_facturable, traslado_incluido, rol_vinculo
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_creado_incluido')
  $$,
  $$ values (0.00::numeric, true, true, 'traslado_maquina'::rol_vinculo) $$,
  'crear_traslado_vinculado incluido deja monto 0, no_facturable = true y traslado_incluido = true'
);

-- Test 17: No permite vincular si el principal es un traslado de máquina vinculado
select throws_matching(
  $$
    select public.crear_traslado_vinculado(
      (select valor from ids_test where clave = 'traslado_creado_pago'),
      '{}'::jsonb,
      false
    )
  $$,
  'No se permiten vínculos en cadena',
  'crear_traslado_vinculado rechaza crear vinculado si el principal ya es un traslado vinculado'
);

-- Test 18: No permite vincular si el principal ya está vinculado a otro (un solo nivel)
select throws_matching(
  $$
    select public.crear_traslado_vinculado(
      (select valor from ids_test where clave = 'traslado_creado_incluido'),
      '{}'::jsonb,
      false
    )
  $$,
  'No se permiten vínculos en cadena',
  'crear_traslado_vinculado rechaza vincular a un servicio que ya está vinculado'
);

-- Test 19: Con choferes asignados, llama a programar_servicio
do $$
declare
  v_t servicios%rowtype;
begin
  v_t := public.crear_traslado_vinculado(
    (select valor from ids_test where clave = 'alquiler_principal'),
    jsonb_build_object('hora', '08:30'::text),
    true,
    array['a0000000-0000-0000-0000-000000000003'::uuid]
  );
  insert into ids_test (clave, valor) values ('traslado_programado', v_t.id);
end $$;

select results_eq(
  $$
    select estado, hora_programada
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_programado')
  $$,
  $$ values ('programado'::estado_servicio, '08:30:00'::time) $$,
  'crear_traslado_vinculado con choferes y fecha llama a programar_servicio (estado programado)'
);

-- Test 20: Traslado aparte sin monto, al terminarse, queda en terminado y no en cobrado (Ajuste 1)
select public.como_chofer1();

select lives_ok(
  $$
    select public.cambiar_estado(
      (select valor from ids_test where clave = 'traslado_aparte_sin_monto'),
      'en_curso'::estado_servicio
    );
    select public.cambiar_estado(
      (select valor from ids_test where clave = 'traslado_aparte_sin_monto'),
      'terminado'::estado_servicio
    );
  $$,
  'Chofer inicia y termina el traslado aparte sin monto'
);

select results_eq(
  $$
    select estado, monto
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_aparte_sin_monto')
  $$,
  $$ values ('terminado'::estado_servicio, null::numeric) $$,
  'Traslado aparte sin monto queda en terminado (no cobrado)'
);

-- Test 21: Al terminar el traslado incluido, pasa automáticamente a cobrado (0 >= 0)
select lives_ok(
  $$
    select public.cambiar_estado(
      (select valor from ids_test where clave = 'traslado_programado'),
      'en_curso'::estado_servicio
    );
    select public.cambiar_estado(
      (select valor from ids_test where clave = 'traslado_programado'),
      'terminado'::estado_servicio
    );
  $$,
  'Chofer asignado inicia y termina el traslado incluido'
);

select results_eq(
  $$
    select estado, monto, monto_cobrado
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_programado')
  $$,
  $$ values ('cobrado'::estado_servicio, 0.00::numeric, 0.00::numeric) $$,
  'Al terminar el traslado incluido con monto 0, pasa automáticamente a cobrado'
);

-- ----------------------------------------------------------------------------
-- 4. RPC vincular_servicio (§3, §8 y Ajustes 3 y 4)
-- ----------------------------------------------------------------------------
select public.como_oficina();

-- Test 22: Rechaza auto-vinculación
select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_libre'),
      (select valor from ids_test where clave = 'traslado_libre'),
      'relacionado'
    )
  $$,
  'Un servicio no puede vincularse a sí mismo',
  'vincular_servicio rechaza auto-vinculación'
);

-- Test 23: Rechaza vincular si el principal está cancelado (Ajuste 4)
select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_libre'),
      (select valor from ids_test where clave = 'alquiler_cancelado'),
      'relacionado'
    )
  $$,
  'cancelado',
  'vincular_servicio rechaza vincular si el principal está cancelado'
);

-- Test 24: Rechaza vincular si el principal ya está vinculado a otro (cadenas)
select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_libre'),
      (select valor from ids_test where clave = 'traslado_creado_pago'),
      'relacionado'
    )
  $$,
  'No se permiten vínculos en cadena',
  'vincular_servicio rechaza vincular si el principal ya está vinculado'
);

-- Test 25: Rechaza vincular si el secundario ya está vinculado a otro (cadenas)
select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_creado_pago'),
      (select valor from ids_test where clave = 'alquiler_principal'),
      'relacionado'
    )
  $$,
  'El servicio ya está vinculado a otro',
  'vincular_servicio rechaza vincular si el secundario ya está vinculado'
);

-- Test 26: Rechaza vincular si el secundario ya tiene vinculados propios (cadenas)
do $$
declare
  v_nuevo_padre uuid;
begin
  insert into servicios (
    cliente_id, tipo, estado, descripcion, monto, creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'otro',
    'consulta',
    'Servicio adicional padre',
    30000,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_nuevo_padre;
  insert into ids_test (clave, valor) values ('nuevo_padre', v_nuevo_padre);
end $$;

select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'alquiler_principal'),
      (select valor from ids_test where clave = 'nuevo_padre'),
      'relacionado'
    )
  $$,
  'No se permiten vínculos en cadena',
  'vincular_servicio rechaza vincular un servicio que ya tiene vinculados propios'
);

-- Test 27: Rechaza vincular como incluido un traslado ya facturado
do $$
declare
  v_facturado_id uuid;
  v_factura_id uuid;
begin
  insert into facturas (
    tipo, punto_venta, numero, cliente_id, fecha, neto, iva, total
  ) values (
    'A', 1, 99991, 'c0000000-0000-0000-0000-000000000001'::uuid, current_date, 50000, 10500, 60500
  ) returning id into v_factura_id;

  insert into servicios (
    cliente_id, tipo, estado, descripcion, monto, factura_id, creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'facturado',
    'Traslado ya facturado',
    50000,
    v_factura_id,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_facturado_id;
  insert into ids_test (clave, valor) values ('traslado_facturado', v_facturado_id);
end $$;

select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_facturado'),
      (select valor from ids_test where clave = 'nuevo_padre'),
      'traslado_maquina',
      true
    )
  $$,
  'No se puede incluir un traslado que ya está cobrado o facturado',
  'vincular_servicio rechaza vincular como incluido un traslado ya facturado'
);

-- Test 28: Rechaza vincular como incluido un traslado ya cobrado
do $$
declare
  v_cobrado_id uuid;
begin
  insert into servicios (
    cliente_id, tipo, estado, descripcion, monto, monto_cobrado, creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'cobrado',
    'Traslado ya cobrado',
    50000,
    50000,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_cobrado_id;
  insert into ids_test (clave, valor) values ('traslado_cobrado', v_cobrado_id);
end $$;

select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_cobrado'),
      (select valor from ids_test where clave = 'nuevo_padre'),
      'traslado_maquina',
      true
    )
  $$,
  'No se puede incluir un traslado que ya está cobrado o facturado',
  'vincular_servicio rechaza vincular como incluido un traslado ya cobrado'
);

-- Test 29: Rechaza rol traslado_maquina si el servicio no es traslado (incluso con p_incluido = false) (Ajuste 3)
do $$
declare
  v_otro_id uuid;
begin
  insert into servicios (
    cliente_id, tipo, estado, descripcion, monto, creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'mantenimiento',
    'consulta',
    'Service de autoelevador',
    40000,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_otro_id;
  insert into ids_test (clave, valor) values ('servicio_mantenimiento', v_otro_id);
end $$;

select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'servicio_mantenimiento'),
      (select valor from ids_test where clave = 'nuevo_padre'),
      'traslado_maquina',
      false
    )
  $$,
  'Solo un traslado puede tener el rol traslado_maquina',
  'vincular_servicio con rol traslado_maquina rechaza servicios no traslado aun no siendo incluido'
);

-- Test 30: Rechaza vincular como incluido si p_rol no es traslado_maquina
select throws_matching(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_libre'),
      (select valor from ids_test where clave = 'nuevo_padre'),
      'relacionado',
      true
    )
  $$,
  'Un traslado incluido debe tener el rol traslado_maquina',
  'vincular_servicio rechaza traslado incluido con rol distinto a traslado_maquina'
);

-- Test 31: Vincula correctamente un traslado existente como incluido (pone monto 0 y no_facturable = true)
select lives_ok(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_libre'),
      (select valor from ids_test where clave = 'nuevo_padre'),
      'traslado_maquina',
      true
    )
  $$,
  'vincular_servicio vincula traslado libre como incluido exitosamente'
);

select results_eq(
  $$
    select vinculado_a, rol_vinculo, traslado_incluido, monto, no_facturable
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_libre')
  $$,
  $$
    values (
      (select valor from ids_test where clave = 'nuevo_padre'),
      'traslado_maquina'::rol_vinculo,
      true,
      0.00::numeric,
      true
    )
  $$,
  'Traslado vinculado como incluido tiene vinculado_a, rol traslado_maquina, monto 0 y no_facturable'
);

-- ----------------------------------------------------------------------------
-- 5. RPC desvincular_servicio (§3, §8 y Ajuste 2)
-- ----------------------------------------------------------------------------

-- Test 32: Rechaza desvincular un servicio que no está vinculado
select throws_matching(
  $$
    select public.desvincular_servicio(
      (select valor from ids_test where clave = 'nuevo_padre')
    )
  $$,
  'El servicio no está vinculado a ningún otro',
  'desvincular_servicio rechaza desvincular un servicio que no tiene vínculo'
);

-- Test 33: Rechaza desvincular un traslado incluido si ya está cobrado
select throws_matching(
  $$
    select public.desvincular_servicio(
      (select valor from ids_test where clave = 'traslado_programado')
    )
  $$,
  'No se puede desvincular un traslado incluido que ya está cobrado o facturado',
  'desvincular_servicio rechaza desvincular traslado incluido ya cobrado'
);

-- Test 34: Desvincula correctamente un traslado incluido no cobrado: monto = null y no_facturable = false (Ajuste 2)
select lives_ok(
  $$
    select public.desvincular_servicio(
      (select valor from ids_test where clave = 'traslado_libre')
    )
  $$,
  'desvincular_servicio ejecuta exitosamente sobre traslado_libre'
);

select results_eq(
  $$
    select vinculado_a, rol_vinculo, traslado_incluido, monto, no_facturable
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_libre')
  $$,
  $$ values (null::uuid, null::rol_vinculo, false, null::numeric, false) $$,
  'Traslado desvinculado queda sin vinculo, traslado_incluido=false, monto null y no_facturable false'
);

-- ----------------------------------------------------------------------------
-- 6. Herencia atómica de dirección y trabajo a realizar (0034)
-- ----------------------------------------------------------------------------

-- Test 35: crear_traslado_vinculado copia direccion_trabajo, localidad_trabajo y trabajo_a_realizar del principal
do $$
declare
  v_t servicios%rowtype;
begin
  v_t := public.crear_traslado_vinculado(
    (select valor from ids_test where clave = 'alquiler_principal'),
    jsonb_build_object('origen', 'Galpón Central'),
    false
  );
  insert into ids_test (clave, valor) values ('traslado_hereda_campos', v_t.id);
end $$;

select results_eq(
  $$
    select direccion_trabajo, localidad_trabajo, trabajo_a_realizar
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_hereda_campos')
  $$,
  $$
    values (
      'Av. Mitre 1234'::text,
      'Avellaneda'::text,
      'Descarga de contenedor'::text
    )
  $$,
  'crear_traslado_vinculado hereda direccion, localidad y trabajo del principal'
);

-- Test 36: crear_traslado_vinculado permite que p_datos pise los tres campos
do $$
declare
  v_t servicios%rowtype;
begin
  v_t := public.crear_traslado_vinculado(
    (select valor from ids_test where clave = 'alquiler_principal'),
    jsonb_build_object(
      'origen', 'Galpón Central',
      'direccion_trabajo', 'Calle Pisada 999',
      'localidad_trabajo', 'Quilmes',
      'trabajo_a_realizar', 'Carga de mercadería'
    ),
    false
  );
  insert into ids_test (clave, valor) values ('traslado_pisa_campos', v_t.id);
end $$;

select results_eq(
  $$
    select direccion_trabajo, localidad_trabajo, trabajo_a_realizar
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_pisa_campos')
  $$,
  $$
    values (
      'Calle Pisada 999'::text,
      'Quilmes'::text,
      'Carga de mercadería'::text
    )
  $$,
  'crear_traslado_vinculado permite que p_datos pise direccion, localidad y trabajo'
);

-- Test 37: vincular_servicio copia direccion, localidad y trabajo si en el traslado están vacíos (null o '')
do $$
declare
  v_tv uuid;
begin
  insert into servicios (
    cliente_id, tipo, estado, descripcion, monto, direccion_trabajo, localidad_trabajo, trabajo_a_realizar, creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'consulta',
    'Traslado campos vacíos',
    40000,
    null,
    '',
    null,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_tv;
  insert into ids_test (clave, valor) values ('traslado_vacio', v_tv);
end $$;

select lives_ok(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_vacio'),
      (select valor from ids_test where clave = 'alquiler_principal'),
      'traslado_maquina',
      false
    )
  $$,
  'vincular_servicio vincula traslado con campos vacíos'
);

select results_eq(
  $$
    select direccion_trabajo, localidad_trabajo, trabajo_a_realizar
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_vacio')
  $$,
  $$
    values (
      'Av. Mitre 1234'::text,
      'Avellaneda'::text,
      'Descarga de contenedor'::text
    )
  $$,
  'vincular_servicio copia direccion, localidad y trabajo si el traslado los tenía vacíos'
);

-- Test 38: vincular_servicio no pisa direccion, localidad ni trabajo si el traslado ya los tenía
do $$
declare
  v_tcd uuid;
begin
  insert into servicios (
    cliente_id, tipo, estado, descripcion, monto, direccion_trabajo, localidad_trabajo, trabajo_a_realizar, creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'consulta',
    'Traslado campos propios',
    50000,
    'Ruta 2 Km 40',
    'Berazategui',
    'Movimiento interno de stock',
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_tcd;
  insert into ids_test (clave, valor) values ('traslado_con_datos', v_tcd);
end $$;

select lives_ok(
  $$
    select public.vincular_servicio(
      (select valor from ids_test where clave = 'traslado_con_datos'),
      (select valor from ids_test where clave = 'alquiler_principal'),
      'traslado_maquina',
      false
    )
  $$,
  'vincular_servicio vincula traslado con datos propios'
);

select results_eq(
  $$
    select direccion_trabajo, localidad_trabajo, trabajo_a_realizar
    from servicios
    where id = (select valor from ids_test where clave = 'traslado_con_datos')
  $$,
  $$
    values (
      'Ruta 2 Km 40'::text,
      'Berazategui'::text,
      'Movimiento interno de stock'::text
    )
  $$,
  'vincular_servicio no pisa direccion, localidad ni trabajo si el traslado ya los tenía'
);

select * from finish();
rollback;

