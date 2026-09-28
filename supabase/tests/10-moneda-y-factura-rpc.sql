-- ============================================================================
-- Tests pgTAP: Moneda, trigger de sincronización y RPC registrar_factura
-- ============================================================================

begin;

select plan(19);

-- Constantes del seed
\set admin_id 'a0000000-0000-0000-0000-000000000001'
\set oficina_id 'a0000000-0000-0000-0000-000000000002'
\set chofer1_id 'a0000000-0000-0000-0000-000000000003'
\set cliente_deza 'c0000000-0000-0000-0000-000000000001'

-- Variables para IDs de prueba
create temporary table ids_test (
  clave text primary key,
  valor uuid
);
grant all on ids_test to authenticated, service_role, public;

-- ============================================================================
-- 1. Trigger de sincronización de moneda y cotización
-- ============================================================================

-- Autenticarse como oficina
select public.como_oficina();

-- Crear alquiler en USD a cotización 1250
do $$
declare
  v_sid uuid;
begin
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    moneda,
    monto_moneda,
    cotizacion,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'alquiler_periodo',
    'aceptado',
    'TEST-USD-Alquiler 1500',
    'USD',
    1500,
    1250,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_sid;

  insert into ids_test (clave, valor) values ('serv_usd', v_sid);
end $$;

-- 1. Monto en pesos calculado automáticamente al insertar (1500 * 1250 = 1875000)
select results_eq(
  $$ select monto from servicios where id = (select valor from ids_test where clave = 'serv_usd') $$,
  $$ values (1875000.00::numeric) $$,
  'Trigger calcula monto en pesos al insertar servicio en USD (1500 * 1250 = 1875000)'
);

-- Actualizar cotización a 1300
update servicios
set cotizacion = 1300
where id = (select valor from ids_test where clave = 'serv_usd');

-- 2. Monto en pesos recalculado automáticamente al cambiar cotización (1500 * 1300 = 1950000)
select results_eq(
  $$ select monto, cotizacion from servicios where id = (select valor from ids_test where clave = 'serv_usd') $$,
  $$ values (1950000.00::numeric, 1300.0000::numeric) $$,
  'Trigger recalcula monto en pesos al actualizar cotización (1500 * 1300 = 1950000)'
);

-- Actualizar monto_moneda a 2000
update servicios
set monto_moneda = 2000
where id = (select valor from ids_test where clave = 'serv_usd');

-- 3. Monto en pesos recalculado automáticamente al cambiar monto_moneda (2000 * 1300 = 2600000)
select results_eq(
  $$ select monto from servicios where id = (select valor from ids_test where clave = 'serv_usd') $$,
  $$ values (2600000.00::numeric) $$,
  'Trigger recalcula monto en pesos al actualizar monto_moneda (2000 * 1300 = 2600000)'
);

-- Cambiar servicio a ARS
update servicios
set moneda = 'ARS',
    monto = 50000
where id = (select valor from ids_test where clave = 'serv_usd');

-- 4. Al pasar a ARS, monto_moneda y cotizacion quedan en null y monto conserva el valor en pesos
select results_eq(
  $$ select monto, monto_moneda, cotizacion from servicios where id = (select valor from ids_test where clave = 'serv_usd') $$,
  $$ values (50000.00::numeric, null::numeric, null::numeric) $$,
  'Al cambiar a ARS, monto_moneda y cotización quedan en null'
);

-- ============================================================================
-- 2. Constraints de moneda
-- ============================================================================

-- 5. Traslado no puede quedar en dólares (constraint moneda_usd_solo_alquiler_periodo)
select throws_matching(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, origen, destino, carga, moneda, monto_moneda, cotizacion
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'Traslado en USD inválido',
      'Origen',
      'Destino',
      'Carga',
      'USD',
      1000,
      1200
    )
  $$,
  'moneda_usd_solo_alquiler_periodo',
  'Constraint impide que un traslado tenga moneda = USD'
);

-- 6. Alquiler por período en dólares sin cotización falla por constraint
select throws_matching(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, moneda, monto_moneda, cotizacion
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'alquiler_periodo',
      'consulta',
      'Alquiler sin cotización inválido',
      'USD',
      1000,
      null
    )
  $$,
  'usd_requiere_cotizacion',
  'Constraint impide alquiler en USD sin cotización'
);

-- ============================================================================
-- 3. RPC registrar_factura atómica
-- ============================================================================

-- Crear un nuevo servicio de prueba en USD en estado terminado para facturar
do $$
declare
  v_sid uuid;
begin
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    moneda,
    monto_moneda,
    cotizacion,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'alquiler_periodo',
    'terminado',
    'Alquiler mensual USD a facturar',
    'USD',
    1500,
    1250,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_sid;

  insert into ids_test (clave, valor) values ('serv_a_facturar', v_sid);
end $$;

-- 7. Registrar factura aplicando cotización final 1300
do $$
declare
  v_sid uuid;
  v_fac facturas;
begin
  select valor into v_sid from ids_test where clave = 'serv_a_facturar';

  select * into v_fac from registrar_factura(
    jsonb_build_object(
      'tipo', 'A',
      'punto_venta', 1,
      'numero', 9901,
      'fecha', '2026-09-27',
      'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'neto', 1950000,
      'iva', 409500,
      'total', 2359500,
      'notas', 'Factura de prueba con cotizacion ajustada'
    ),
    jsonb_build_array(
      jsonb_build_object('id', v_sid, 'cotizacion', 1300)
    )
  );

  insert into ids_test (clave, valor) values ('factura_creada', v_fac.id);
end $$;

-- Verificar datos de la factura creada
select results_eq(
  $$ select tipo, punto_venta, numero, total from facturas where id = (select valor from ids_test where clave = 'factura_creada') $$,
  $$ values ('A'::tipo_factura, 1, 9901::bigint, 2359500.00::numeric) $$,
  'registrar_factura crea la factura con tipo, punto de venta, número y total correctos'
);

-- 8. El servicio queda vinculado a la factura, con cotización 1300, monto recalculado en 1950000 y estado facturado
select results_eq(
  $$
    select
      factura_id = (select valor from ids_test where clave = 'factura_creada'),
      cotizacion,
      monto,
      estado
    from servicios
    where id = (select valor from ids_test where clave = 'serv_a_facturar')
  $$,
  $$ values (true, 1300.0000::numeric, 1950000.00::numeric, 'facturado'::estado_servicio) $$,
  'registrar_factura actualiza cotización a 1300, recalcula monto a 1950000, vincula factura_id y pasa estado a facturado'
);

-- 9. Se registra el evento de cambio de estado a facturado con número de factura
select results_eq(
  $$
    select estado_nuevo, nota
    from servicio_eventos
    where servicio_id = (select valor from ids_test where clave = 'serv_a_facturar')
    order by created_at desc
    limit 1
  $$,
  $$ values ('facturado'::estado_servicio, 'Factura A 0001-00009901') $$,
  'registrar_factura registra el evento de cambio de estado a facturado con la nota correspondiente'
);

-- 10. Intentar volver a facturar el mismo servicio arroja excepción
select throws_matching(
  $$
    select * from registrar_factura(
      jsonb_build_object(
        'tipo', 'A',
        'punto_venta', 1,
        'numero', 9902,
        'cliente_id', 'c0000000-0000-0000-0000-000000000001',
        'neto', 1950000,
        'total', 1950000
      ),
      jsonb_build_array(
        jsonb_build_object('id', (select valor from ids_test where clave = 'serv_a_facturar'), 'cotizacion', 1300)
      )
    )
  $$,
  'ya se encuentra facturado',
  'registrar_factura impide volver a facturar un servicio ya facturado'
);

-- 11. Intentar registrar factura con número duplicado en el mismo punto de venta arroja excepción
select throws_matching(
  $$
    select * from registrar_factura(
      jsonb_build_object(
        'tipo', 'A',
        'punto_venta', 1,
        'numero', 9901,
        'cliente_id', 'c0000000-0000-0000-0000-000000000001',
        'neto', 10000,
        'total', 10000
      ),
      jsonb_build_array(
        jsonb_build_object('id', '53050132-1fd9-4e23-a961-e393c182ed46'::uuid)
      )
    )
  $$,
  'Ya existe una factura con ese número en ese punto de venta',
  'registrar_factura impide números de factura duplicados'
);

-- 12. Chofer no puede llamar a registrar_factura
select public.como_chofer1();
select throws_matching(
  $$
    select * from registrar_factura(
      jsonb_build_object(
        'tipo', 'B',
        'punto_venta', 1,
        'numero', 9903,
        'cliente_id', 'c0000000-0000-0000-0000-000000000001',
        'neto', 10000,
        'total', 10000
      ),
      jsonb_build_array('53050132-1fd9-4e23-a961-e393c182ed46')
    )
  $$,
  'No autorizado',
  'Chofer no puede ejecutar registrar_factura'
);
select public.como_oficina();

-- ============================================================================
-- 4. Tests para los 4 ajustes requeridos
-- ============================================================================

-- Crear un servicio adicional en USD para probar ajustes
do $$
declare
  v_sid uuid;
begin
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    moneda,
    monto_moneda,
    cotizacion,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'alquiler_periodo',
    'terminado',
    'Alquiler para pruebas de ajustes',
    'USD',
    1000,
    1200,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_sid;

  insert into ids_test (clave, valor) values ('serv_ajustes', v_sid);
end $$;

-- 13. Ajuste 1: Si p_datos trae totales y difieren más de 1 centavo de los calculados en la base -> error
select throws_matching(
  $$
    select * from registrar_factura(
      jsonb_build_object(
        'tipo', 'B',
        'punto_venta', 2,
        'numero', 1001,
        'cliente_id', 'c0000000-0000-0000-0000-000000000001',
        'neto', 500000, -- Difere de los 1250000 reales
        'total', 605000
      ),
      jsonb_build_array(
        jsonb_build_object('id', (select valor from ids_test where clave = 'serv_ajustes'), 'cotizacion', 1250)
      )
    )
  $$,
  'Los totales no coinciden con los servicios',
  'Ajuste 1: registrar_factura rechaza totales del cliente que difieren de los calculados en la base'
);

-- 14. Ajuste 2: punto_venta es obligatorio y sin valor por defecto
select throws_matching(
  $$
    select * from registrar_factura(
      jsonb_build_object(
        'tipo', 'B',
        'numero', 1002,
        'cliente_id', 'c0000000-0000-0000-0000-000000000001'
      ),
      jsonb_build_array(
        jsonb_build_object('id', (select valor from ids_test where clave = 'serv_ajustes'), 'cotizacion', 1250)
      )
    )
  $$,
  'El punto de venta es obligatorio',
  'Ajuste 2: registrar_factura exige punto_venta obligatorio sin valor por defecto'
);

-- 15. Ajuste 3: Servicios en dólares exigen cotización explícita en p_servicios mayor a cero
select throws_matching(
  $$
    select * from registrar_factura(
      jsonb_build_object(
        'tipo', 'B',
        'punto_venta', 2,
        'numero', 1003,
        'cliente_id', 'c0000000-0000-0000-0000-000000000001'
      ),
      jsonb_build_array(
        jsonb_build_object('id', (select valor from ids_test where clave = 'serv_ajustes'))
        -- cotizacion omitida
      )
    )
  $$,
  'Falta la cotización del día para el servicio #',
  'Ajuste 3: registrar_factura exige cotización explícita > 0 para servicios en USD'
);

-- 16. Ajuste 4: Cotización soporta 4 decimales numeric(12,4) y calcula monto con redondeo a 2 decimales
do $$
declare
  v_sid uuid;
  v_fac facturas;
begin
  select valor into v_sid from ids_test where clave = 'serv_ajustes';

  -- Facturar con cotización de 4 decimales: 1250.5555
  -- 1000 * 1250.5555 = 1250555.50 neto
  -- IVA 21% = 262616.66
  -- Total = 1513172.16
  select * into v_fac from registrar_factura(
    jsonb_build_object(
      'tipo', 'B',
      'punto_venta', 2,
      'numero', 1004,
      'cliente_id', 'c0000000-0000-0000-0000-000000000001'
    ),
    jsonb_build_array(
      jsonb_build_object('id', v_sid, 'cotizacion', 1250.5555)
    )
  );

  insert into ids_test (clave, valor) values ('fac_ajustes_4dec', v_fac.id);
end $$;

select results_eq(
  $$
    select
      cotizacion,
      monto
    from servicios
    where id = (select valor from ids_test where clave = 'serv_ajustes')
  $$,
  $$ values (1250.5555::numeric, 1250555.50::numeric) $$,
  'Ajuste 4: registrar_factura guarda cotización con 4 decimales (numeric 12,4) y calcula monto'
);

-- ============================================================================
-- 5. Tests para RPC crear_factura_borrador (emisión electrónica ARCA)
-- ============================================================================

-- Crear un nuevo servicio en USD para probar crear_factura_borrador
do $$
declare
  v_sid uuid;
begin
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    moneda,
    monto_moneda,
    cotizacion,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'alquiler_periodo',
    'terminado',
    'Alquiler para prueba crear_factura_borrador',
    'USD',
    800,
    1200,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_sid;

  insert into ids_test (clave, valor) values ('serv_borrador_usd', v_sid);
end $$;

-- 17. Usuario de oficina no puede llamar a crear_factura_borrador directo (permiso exclusivo de service_role)
select throws_matching(
  $$
    select * from crear_factura_borrador(
      jsonb_build_object(
        'tipo', 'A',
        'punto_venta', 3,
        'cliente_id', 'c0000000-0000-0000-0000-000000000001'
      ),
      jsonb_build_array(
        jsonb_build_object('id', (select valor from ids_test where clave = 'serv_borrador_usd'))
      )
    )
  $$,
  'permission denied',
  'Oficina no puede ejecutar crear_factura_borrador directo (exclusivo service_role)'
);

-- Ejecutar pruebas de crear_factura_borrador bajo service_role
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

-- 18. crear_factura_borrador rechaza servicio en dólares si falta la cotización del día
select throws_matching(
  $$
    select * from crear_factura_borrador(
      jsonb_build_object(
        'tipo', 'A',
        'punto_venta', 3,
        'cliente_id', 'c0000000-0000-0000-0000-000000000001'
      ),
      jsonb_build_array(
        jsonb_build_object('id', (select valor from ids_test where clave = 'serv_borrador_usd'))
        -- cotizacion omitida
      )
    )
  $$,
  'Falta la cotización del día para el servicio #',
  'crear_factura_borrador rechaza servicios en USD sin cotización del día'
);

-- 19. crear_factura_borrador crea factura en estado borrador, numero null, totales calculados y actualiza servicio
do $$
declare
  v_sid uuid;
  v_fac facturas;
begin
  select valor into v_sid from ids_test where clave = 'serv_borrador_usd';

  -- 800 USD * 1350 = 1080000 neto
  -- IVA 21% = 226800
  -- Total = 1306800
  select * into v_fac from crear_factura_borrador(
    jsonb_build_object(
      'tipo', 'A',
      'punto_venta', 3,
      'cliente_id', 'c0000000-0000-0000-0000-000000000001',
      'concepto', 2
    ),
    jsonb_build_array(
      jsonb_build_object('id', v_sid, 'cotizacion', 1350)
    )
  );

  insert into ids_test (clave, valor) values ('fac_borrador_creada', v_fac.id);
end $$;

select results_eq(
  $$
    select
      f.estado_emision,
      f.numero is null,
      f.neto,
      f.total,
      s.factura_id = f.id,
      s.cotizacion,
      s.monto
    from facturas f
    join servicios s on s.id = (select valor from ids_test where clave = 'serv_borrador_usd')
    where f.id = (select valor from ids_test where clave = 'fac_borrador_creada')
  $$,
  $$ values ('borrador'::estado_emision, true, 1080000.00::numeric, 1306800.00::numeric, true, 1350.0000::numeric, 1080000.00::numeric) $$,
  'crear_factura_borrador crea factura borrador sin número, totales calculados y servicio actualizado'
);

select * from finish();

rollback;
