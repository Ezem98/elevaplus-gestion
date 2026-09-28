-- ============================================================================
-- Tests pgTAP: Carga asegurada en traslados
-- ============================================================================

begin;

select plan(13);

-- Constantes del seed
\set admin_id 'a0000000-0000-0000-0000-000000000001'
\set oficina_id 'a0000000-0000-0000-0000-000000000002'
\set cliente_deza 'c0000000-0000-0000-0000-000000000001'

-- Variables para IDs de prueba
create temporary table ids_test (
  clave text primary key,
  valor uuid
);
grant all on ids_test to authenticated, service_role, public;

-- Autenticarse como oficina
select public.como_oficina();

-- ----------------------------------------------------------------------------
-- 1. Cálculo de monto_seguro con y sin IVA
-- ----------------------------------------------------------------------------

-- Traslado con IVA y seguro de 30.000 (monto_seguro = round(30000 / 1.21, 2) = 24793.39)
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
    seguro_importe,
    aplica_iva,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'consulta',
    'TEST-SEGURO-CON-IVA',
    224793.39,
    30000.00,
    true,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_sid;

  insert into ids_test (clave, valor) values ('serv_con_iva', v_sid);
end $$;

select results_eq(
  $$ select seguro_importe, monto_seguro from servicios where id = (select valor from ids_test where clave = 'serv_con_iva') $$,
  $$ values (30000.00::numeric, 24793.39::numeric) $$,
  'Traslado con IVA y seguro de 30.000 queda con monto_seguro = 24793.39'
);

-- Traslado sin IVA y seguro de 30.000 (monto_seguro = 30000.00)
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
    seguro_importe,
    aplica_iva,
    creado_por
  ) values (
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'traslado',
    'consulta',
    'TEST-SEGURO-SIN-IVA',
    230000.00,
    30000.00,
    false,
    'a0000000-0000-0000-0000-000000000002'::uuid
  ) returning id into v_sid;

  insert into ids_test (clave, valor) values ('serv_sin_iva', v_sid);
end $$;

select results_eq(
  $$ select seguro_importe, monto_seguro from servicios where id = (select valor from ids_test where clave = 'serv_sin_iva') $$,
  $$ values (30000.00::numeric, 30000.00::numeric) $$,
  'Traslado sin IVA y seguro de 30.000 queda con monto_seguro = 30000.00'
);

-- ----------------------------------------------------------------------------
-- 2. Constraints de seguro
-- ----------------------------------------------------------------------------

-- Constraint: solo si tipo = 'traslado'
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, seguro_importe, monto_seguro, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'alquiler_hora',
      'consulta',
      'TEST-SEGURO-INVALIDO-TIPO',
      50000,
      10000,
      10000,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint: seguro_importe solo se permite si tipo = traslado'
);

-- Constraint: los dos nulos o los dos con valor (monto_seguro sin seguro_importe)
select public.como_postgres();
alter table servicios disable trigger trg_servicios_sincronizar_seguro;

select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, seguro_importe, monto_seguro, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-SEGURO-UN-SOLO-VALOR',
      50000,
      NULL,
      10000,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint: los dos nulos o los dos con valor (monto_seguro sin seguro_importe)'
);

alter table servicios enable trigger trg_servicios_sincronizar_seguro;
select public.como_oficina();

-- Constraint: monto_seguro > 0
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, seguro_importe, monto_seguro, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-SEGURO-CERO',
      50000,
      0,
      0,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint: monto_seguro debe ser > 0'
);

-- Constraint: monto_seguro <= monto
select throws_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, seguro_importe, monto_seguro, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-SEGURO-MAYOR-QUE-MONTO',
      20000,
      30000,
      24793.39,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  '23514',
  NULL,
  'Constraint: monto_seguro debe ser <= monto'
);

-- Servicio traslado válido sin seguro (ambos nulos)
select lives_ok(
  $$
    insert into servicios (
      cliente_id, tipo, estado, descripcion, monto, seguro_importe, monto_seguro, creado_por
    ) values (
      'c0000000-0000-0000-0000-000000000001'::uuid,
      'traslado',
      'consulta',
      'TEST-SIN-SEGURO-OK',
      100000,
      NULL,
      NULL,
      'a0000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  'Traslado sin seguro inserta correctamente con ambos campos nulos'
);

-- ----------------------------------------------------------------------------
-- 3. Extensión _insertar_items_presupuesto
-- ----------------------------------------------------------------------------

-- Crear presupuesto con ítem de traslado con seguro e IVA
do $$
declare
  v_pr presupuestos%rowtype;
  v_items jsonb;
begin
  v_items := jsonb_build_array(
    jsonb_build_object(
      'tipo', 'traslado',
      'descripcion', 'Traslado presupuestado con carga asegurada',
      'monto', 224793.39,
      'seguro_importe', 30000,
      'aplica_iva', true
    ),
    jsonb_build_object(
      'tipo', 'traslado',
      'descripcion', 'Traslado presupuestado sin IVA con seguro',
      'monto', 230000.00,
      'seguro_importe', 30000,
      'aplica_iva', false
    )
  );

  v_pr := public.crear_presupuesto(
    jsonb_build_object(
      'prospecto_nombre', 'Cliente Seguro SRL',
      'validez_dias', 15
    ),
    v_items
  );

  insert into ids_test (clave, valor) values ('pres_seguro', v_pr.id);
end $$;

-- Verificar ítem 1 (con IVA)
select results_eq(
  $$
    select seguro_importe, monto_seguro
    from servicios
    where presupuesto_id = (select valor from ids_test where clave = 'pres_seguro')
      and aplica_iva = true
  $$,
  $$ values (30000.00::numeric, 24793.39::numeric) $$,
  '_insertar_items_presupuesto guarda seguro_importe 30000 y calcula monto_seguro 24793.39 con IVA'
);

-- Verificar ítem 2 (sin IVA)
select results_eq(
  $$
    select seguro_importe, monto_seguro
    from servicios
    where presupuesto_id = (select valor from ids_test where clave = 'pres_seguro')
      and aplica_iva = false
  $$,
  $$ values (30000.00::numeric, 30000.00::numeric) $$,
  '_insertar_items_presupuesto guarda seguro_importe 30000 y calcula monto_seguro 30000.00 sin IVA'
);

-- 10. Cambiar aplica_iva en un traslado asegurado deja la parte del servicio en 200.000 y el seguro en 30.000
update servicios
set aplica_iva = false
where id = (select valor from ids_test where clave = 'serv_con_iva');

select results_eq(
  $$ select (monto - monto_seguro), monto_seguro, monto from servicios where id = (select valor from ids_test where clave = 'serv_con_iva') $$,
  $$ values (200000.00::numeric, 30000.00::numeric, 230000.00::numeric) $$,
  'Cambiar aplica_iva a false en traslado asegurado deja parte del servicio en 200.000, seguro en 30.000 y total en 230.000'
);

-- 11. Quitar el seguro con un update que solo pone seguro_importe = null deja monto en 200.000
update servicios
set seguro_importe = null
where id = (select valor from ids_test where clave = 'serv_con_iva');

select results_eq(
  $$ select monto, seguro_importe, monto_seguro from servicios where id = (select valor from ids_test where clave = 'serv_con_iva') $$,
  $$ values (200000.00::numeric, NULL::numeric, NULL::numeric) $$,
  'Quitar el seguro con un update que solo pone seguro_importe = null deja monto en 200.000'
);

-- Reincorporar seguro para probar cambio de importe
update servicios
set seguro_importe = 30000.00, aplica_iva = true
where id = (select valor from ids_test where clave = 'serv_con_iva');

-- 12. Cambiar el importe del seguro sin tocar monto ajusta el total manteniendo la parte del servicio en 200.000
update servicios
set seguro_importe = 40000.00
where id = (select valor from ids_test where clave = 'serv_con_iva');

select results_eq(
  $$ select (monto - monto_seguro), monto_seguro, monto from servicios where id = (select valor from ids_test where clave = 'serv_con_iva') $$,
  $$ values (200000.00::numeric, 33057.85::numeric, 233057.85::numeric) $$,
  'Cambiar el importe del seguro sin tocar monto ajusta el total y mantiene el servicio en 200.000'
);

-- 13. Si quien escribió sí cambió monto, respetarlo
update servicios
set monto = 250000.00, seguro_importe = 30000.00
where id = (select valor from ids_test where clave = 'serv_con_iva');

select results_eq(
  $$ select monto, monto_seguro, (monto - monto_seguro) from servicios where id = (select valor from ids_test where clave = 'serv_con_iva') $$,
  $$ values (250000.00::numeric, 24793.39::numeric, 225206.61::numeric) $$,
  'Si quien escribió sí cambió monto, respetarlo'
);

rollback;
