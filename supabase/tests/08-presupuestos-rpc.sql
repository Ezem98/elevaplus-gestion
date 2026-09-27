-- 08-presupuestos-rpc.sql: Pruebas pgTAP de las RPCs transaccionales de presupuestos
begin;
select plan(22);

create temp table _test_rpc_counts (
  count_antes int,
  count_despues int
);
grant all on _test_rpc_counts to authenticated;

do $$
declare
  v_oficina_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_cliente_deza uuid := 'c0000000-0000-0000-0000-000000000001';
  v_pres_ok record;
  v_pres_rechazar record;
  v_pres_aceptar record;
  v_pres_vacio record;
  v_pres_cuit record;
  v_pres_enviar record;
  v_pres_add_borrador record;
  v_pres_add_enviado record;
  v_pres_desde record;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_s_cancelado uuid;
  v_s_enviar uuid;
  v_s_desde uuid;
  v_count_antes int;
  v_count_despues int;
begin
  perform public.como_oficina();

  -- =========================================================================
  -- 1. crear_presupuesto con ítem inválido: rollback total (no deja nada)
  -- =========================================================================
  begin
    perform public.crear_presupuesto(
      jsonb_build_object(
        'prospecto_nombre', 'TEST-PGTAP-Rollback',
        'validez_dias', 15
      ),
      jsonb_build_array(
        jsonb_build_object(
          'tipo', 'traslado',
          'monto', 88888,
          'descripcion', 'TEST-PGTAP-Servicio-1'
        ),
        jsonb_build_object(
          'tipo', 'tipo_totalmente_invalido_que_falla',
          'monto', 99999
        )
      )
    );
  exception when others then
    -- captura el error esperado para verificar que hizo rollback
    null;
  end;

  -- =========================================================================
  -- 2. rechazar_presupuesto: cancela solo los ítems pendientes
  -- =========================================================================
  select * into v_pres_rechazar from public.crear_presupuesto(
    jsonb_build_object('prospecto_nombre', 'TEST-PGTAP-Rechazar', 'validez_dias', 10),
    jsonb_build_array(
      jsonb_build_object('tipo', 'traslado', 'monto', 50000, 'descripcion', 'Item 1 consulta'),
      jsonb_build_object('tipo', 'alquiler_hora', 'monto', 40000, 'descripcion', 'Item 2 presupuestado'),
      jsonb_build_object('tipo', 'otro', 'monto', 30000, 'descripcion', 'Item 3 ya cancelado')
    )
  );

  -- Poner item 2 en presupuestado e item 3 en cancelado
  select id into v_s2 from servicios where presupuesto_id = v_pres_rechazar.id and monto = 40000;
  select id into v_s3 from servicios where presupuesto_id = v_pres_rechazar.id and monto = 30000;

  perform public.cambiar_estado(v_s2, 'presupuestado', 'Pasar a presupuestado');
  perform public.cambiar_estado(v_s3, 'cancelado', 'Cancelado previamente');

  -- Rechazar presupuesto
  perform public.rechazar_presupuesto(v_pres_rechazar.id, 'Cliente desistió');

  -- =========================================================================
  -- 3. aceptar_presupuesto con cliente nuevo: lo crea y pasa ítems
  -- =========================================================================
  select * into v_pres_aceptar from public.crear_presupuesto(
    jsonb_build_object('prospecto_nombre', 'TEST-PGTAP-Prospecto OK', 'validez_dias', 15),
    jsonb_build_array(
      jsonb_build_object('tipo', 'traslado', 'monto', 75000, 'descripcion', 'Item a aceptar')
    )
  );

  perform public.aceptar_presupuesto(
    v_pres_aceptar.id,
    null,
    jsonb_build_object(
      'nombre', 'TEST-PGTAP-Cliente Creado',
      'cuit', '30-79887766-5',
      'telefono', '1144332211',
      'condicion_iva', 'responsable_inscripto'
    )
  );

  -- =========================================================================
  -- 4. aceptar_presupuesto sin ítems pendientes: rollback (no queda cliente)
  -- =========================================================================
  select * into v_pres_vacio from public.crear_presupuesto(
    jsonb_build_object('prospecto_nombre', 'TEST-PGTAP-Sin Items', 'validez_dias', 15),
    jsonb_build_array(
      jsonb_build_object('tipo', 'traslado', 'monto', 10000, 'descripcion', 'Item cancelado')
    )
  );

  select id into v_s_cancelado from servicios where presupuesto_id = v_pres_vacio.id;
  perform public.cambiar_estado(v_s_cancelado, 'cancelado', 'Cancelado');

  begin
    perform public.aceptar_presupuesto(
      v_pres_vacio.id,
      null,
      jsonb_build_object(
        'nombre', 'TEST-PGTAP-Cliente Que No Debe Quedar',
        'cuit', '30-99887711-2'
      )
    );
  exception when others then
    null;
  end;

  -- =========================================================================
  -- 5. CUIT duplicado: rechazado
  -- =========================================================================
  select * into v_pres_cuit from public.crear_presupuesto(
    jsonb_build_object('prospecto_nombre', 'TEST-PGTAP-Cuit Duplicado', 'validez_dias', 15),
    jsonb_build_array(
      jsonb_build_object('tipo', 'traslado', 'monto', 60000, 'descripcion', 'Item CUIT')
    )
  );

  -- =========================================================================
  -- 6. marcar_presupuesto_enviado: pasa ítems en consulta a presupuestado
  -- =========================================================================
  select * into v_pres_enviar from public.crear_presupuesto(
    jsonb_build_object('prospecto_nombre', 'TEST-PGTAP-Enviar', 'validez_dias', 15),
    jsonb_build_array(
      jsonb_build_object('tipo', 'traslado', 'monto', 125000, 'descripcion', 'Item a enviar')
    )
  );

  perform public.marcar_presupuesto_enviado(v_pres_enviar.id, 'presupuestos/test/doc.pdf');

  -- =========================================================================
  -- 7. agregar_items_presupuesto: en borrador y en enviado
  -- =========================================================================
  select * into v_pres_add_borrador from public.crear_presupuesto(
    jsonb_build_object('prospecto_nombre', 'TEST-PGTAP-Add-Borrador', 'validez_dias', 15),
    jsonb_build_array(
      jsonb_build_object('tipo', 'traslado', 'monto', 30000, 'descripcion', 'Item inicial borrador')
    )
  );

  perform public.agregar_items_presupuesto(
    v_pres_add_borrador.id,
    jsonb_build_array(
      jsonb_build_object('tipo', 'alquiler_hora', 'monto', 35000, 'descripcion', 'Item agregado en borrador')
    )
  );

  select * into v_pres_add_enviado from public.crear_presupuesto(
    jsonb_build_object('prospecto_nombre', 'TEST-PGTAP-Add-Enviado', 'validez_dias', 15),
    jsonb_build_array(
      jsonb_build_object('tipo', 'traslado', 'monto', 40000, 'descripcion', 'Item inicial enviado')
    )
  );

  perform public.marcar_presupuesto_enviado(v_pres_add_enviado.id, 'presupuestos/test/enviado.pdf');

  perform public.agregar_items_presupuesto(
    v_pres_add_enviado.id,
    jsonb_build_array(
      jsonb_build_object('tipo', 'traslado', 'monto', 45000, 'descripcion', 'Item agregado en enviado')
    )
  );

  -- =========================================================================
  -- 8. crear_presupuesto_desde_servicio: vincula servicio sin duplicarlo
  -- =========================================================================
  insert into servicios (
    cliente_id,
    tipo,
    estado,
    descripcion,
    monto,
    fecha_programada,
    creado_por
  ) values (
    v_cliente_deza,
    'traslado',
    'presupuestado',
    'TEST-PGTAP-Servicio-Desde',
    75000,
    current_date,
    v_oficina_id
  ) returning id into v_s_desde;

  select count(*)::int into v_count_antes from servicios;

  select * into v_pres_desde from public.crear_presupuesto_desde_servicio(v_s_desde);

  select count(*)::int into v_count_despues from servicios;

  insert into _test_rpc_counts values (v_count_antes, v_count_despues);

  perform public.como_postgres();
end $$;

-- ---------------------------------------------------------------------------
-- ASERCIONES pgTAP
-- ---------------------------------------------------------------------------

-- 1. Rollback de crear_presupuesto con ítem inválido
select is(
  (select count(*)::int from presupuestos where prospecto_nombre = 'TEST-PGTAP-Rollback'),
  0,
  'crear_presupuesto con ítem inválido no crea el presupuesto (rollback)'
);

select is(
  (select count(*)::int from servicios where descripcion = 'TEST-PGTAP-Servicio-1'),
  0,
  'crear_presupuesto con ítem inválido no crea ningún servicio (rollback)'
);

-- 2. rechazar_presupuesto
select is(
  (select estado from presupuestos where prospecto_nombre = 'TEST-PGTAP-Rechazar'),
  'rechazado'::estado_presupuesto,
  'rechazar_presupuesto pasa el estado del presupuesto a rechazado'
);

select is(
  (select count(*)::int from servicios s
   join presupuestos p on p.id = s.presupuesto_id
   where p.prospecto_nombre = 'TEST-PGTAP-Rechazar' and s.estado = 'cancelado'),
  3,
  'rechazar_presupuesto cancela ítems en consulta y presupuestado (y el cancelado sigue cancelado)'
);

-- 3. aceptar_presupuesto con cliente nuevo
select is(
  (select count(*)::int from clientes where nombre = 'TEST-PGTAP-Cliente Creado'),
  1,
  'aceptar_presupuesto crea el nuevo cliente en la base'
);

select is(
  (select p.estado from presupuestos p where p.prospecto_nombre = 'TEST-PGTAP-Prospecto OK'),
  'aceptado'::estado_presupuesto,
  'aceptar_presupuesto pasa el estado a aceptado'
);

select is(
  (select s.estado from servicios s
   join presupuestos p on p.id = s.presupuesto_id
   where p.prospecto_nombre = 'TEST-PGTAP-Prospecto OK'),
  'aceptado'::estado_servicio,
  'aceptar_presupuesto pasa el ítem activo a aceptado'
);

select is(
  (select s.cliente_id from servicios s
   join presupuestos p on p.id = s.presupuesto_id
   where p.prospecto_nombre = 'TEST-PGTAP-Prospecto OK'),
  (select id from clientes where nombre = 'TEST-PGTAP-Cliente Creado'),
  'aceptar_presupuesto vincula el servicio con el cliente nuevo'
);

-- 4. aceptar_presupuesto sin ítems: rollback total (no queda ni el cliente)
select is(
  (select count(*)::int from clientes where nombre = 'TEST-PGTAP-Cliente Que No Debe Quedar'),
  0,
  'aceptar_presupuesto sin ítems pendientes hace rollback y no crea el cliente'
);

-- 5. CUIT duplicado rechazado con mensaje exacto
select public.como_oficina();

select throws_ok(
  format(
    $$select public.aceptar_presupuesto('%s'::uuid, null, '{"nombre":"TEST Dup","cuit":"30-50001091-2"}'::jsonb)$$,
    (select id from presupuestos where prospecto_nombre = 'TEST-PGTAP-Cuit Duplicado')
  ),
  'Ya existe un cliente con ese CUIT: Deza Test',
  'aceptar_presupuesto con CUIT duplicado es rechazado con el nombre del cliente existente'
);

select public.como_postgres();

-- 6. marcar_presupuesto_enviado
select is(
  (select estado from presupuestos where prospecto_nombre = 'TEST-PGTAP-Enviar'),
  'enviado'::estado_presupuesto,
  'marcar_presupuesto_enviado pasa el presupuesto a enviado'
);

select is(
  (select pdf_path from presupuestos where prospecto_nombre = 'TEST-PGTAP-Enviar'),
  'presupuestos/test/doc.pdf',
  'marcar_presupuesto_enviado guarda el pdf_path'
);

select is(
  (select s.estado from servicios s
   join presupuestos p on p.id = s.presupuesto_id
   where p.prospecto_nombre = 'TEST-PGTAP-Enviar'),
  'presupuestado'::estado_servicio,
  'marcar_presupuesto_enviado pasa los ítems en consulta a presupuestado'
);

-- 7. agregar_items_presupuesto
select is(
  (select count(*)::int from servicios s
   join presupuestos p on p.id = s.presupuesto_id
   where p.prospecto_nombre = 'TEST-PGTAP-Add-Borrador' and s.descripcion = 'Item agregado en borrador' and s.estado = 'consulta'),
  1,
  'agregar_items_presupuesto agrega ítem en consulta a presupuesto borrador'
);

select is(
  (select p.estado from presupuestos p where p.prospecto_nombre = 'TEST-PGTAP-Add-Enviado'),
  'enviado'::estado_presupuesto,
  'agregar_items_presupuesto a presupuesto enviado lo mantiene en enviado'
);

select is(
  (select count(*)::int from servicios s
   join presupuestos p on p.id = s.presupuesto_id
   where p.prospecto_nombre = 'TEST-PGTAP-Add-Enviado' and s.descripcion = 'Item agregado en enviado' and s.estado = 'consulta'),
  1,
  'agregar_items_presupuesto agrega ítem en consulta a presupuesto enviado'
);

select public.como_oficina();

select throws_ok(
  format(
    $$select * from public.agregar_items_presupuesto('%s'::uuid, '[{"tipo":"traslado","monto":10000}]'::jsonb)$$,
    (select id from presupuestos where prospecto_nombre = 'TEST-PGTAP-Prospecto OK')
  ),
  'No se pueden agregar ítems porque el presupuesto está aceptado',
  'agregar_items_presupuesto en presupuesto aceptado es rechazado'
);

select public.como_postgres();

-- 8. crear_presupuesto_desde_servicio
select is(
  (select count_despues from _test_rpc_counts),
  (select count_antes from _test_rpc_counts),
  'crear_presupuesto_desde_servicio no cambia la cantidad de servicios'
);

select is(
  (select p.estado from presupuestos p
   join servicios s on s.presupuesto_id = p.id
   where s.descripcion = 'TEST-PGTAP-Servicio-Desde'),
  'enviado'::estado_presupuesto,
  'crear_presupuesto_desde_servicio genera presupuesto en enviado para servicio presupuestado'
);

select is(
  (select s.presupuesto_id is not null from servicios s
   where s.descripcion = 'TEST-PGTAP-Servicio-Desde'),
  true,
  'crear_presupuesto_desde_servicio asigna presupuesto_id al servicio existente'
);

select public.como_oficina();

select throws_ok(
  format(
    $$select public.crear_presupuesto_desde_servicio('%s'::uuid)$$,
    (select id from servicios where descripcion = 'TEST-PGTAP-Servicio-Desde')
  ),
  'El servicio ya tiene un presupuesto asociado',
  'crear_presupuesto_desde_servicio falla si el servicio ya tiene un presupuesto asociado'
);

select public.como_chofer1();

select throws_ok(
  $$select public.crear_presupuesto_desde_servicio('00000000-0000-0000-0000-000000000001'::uuid)$$,
  'No autorizado',
  'crear_presupuesto_desde_servicio rechazado para chofer con No autorizado'
);

select public.como_postgres();

select * from finish();
rollback;
