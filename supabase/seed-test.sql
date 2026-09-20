-- =============================================================================
-- ELEVAPLUS Gestión — Seed determinista para tests locales y de integración
-- IMPORTANTE: Este archivo debe mantenerse sincronizado con tests/fixtures/ids.ts
-- =============================================================================

-- 1. Limpieza en orden de dependencias para permitir reejecuciones idempotentes
delete from cobro_aplicaciones;
delete from adjuntos;
delete from servicio_choferes;
delete from servicio_eventos;
delete from alquileres;
delete from servicios;
delete from facturas;
delete from cobros;
delete from cheques;
delete from movimientos_caja;
delete from cuentas;
delete from categorias_movimiento;
delete from maquinas;
delete from vehiculos;
delete from clientes;
delete from parametros_cotizador;
delete from empresa;
delete from public.perfiles where id in (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000004'
);
delete from auth.users where id in (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000004'
);

-- 2. Usuarios de prueba (contraseña: test1234)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'admin@test.local',
    extensions.crypt('test1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Admin Test"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'oficina@test.local',
    extensions.crypt('test1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Oficina Test"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'chofer1@test.local',
    extensions.crypt('test1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Chofer 1 Test"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'chofer2@test.local',
    extensions.crypt('test1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"nombre":"Chofer 2 Test"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

-- El trigger handle_new_user ya creó las filas en public.perfiles con rol 'chofer'
update public.perfiles set rol = 'admin', nombre = 'Admin Test', activo = true where id = 'a0000000-0000-0000-0000-000000000001';
update public.perfiles set rol = 'oficina', nombre = 'Oficina Test', activo = true where id = 'a0000000-0000-0000-0000-000000000002';
update public.perfiles set rol = 'chofer', nombre = 'Chofer 1 Test', activo = true where id = 'a0000000-0000-0000-0000-000000000003';
update public.perfiles set rol = 'chofer', nombre = 'Chofer 2 Test', activo = true where id = 'a0000000-0000-0000-0000-000000000004';

-- 3. Clientes (3 perfiles fiscales)
insert into public.clientes (id, nombre, tipo, cuit, condicion_iva, condicion_pago, dias_pago, activo) values
  ('c0000000-0000-0000-0000-000000000001', 'Deza Test', 'empresa', '30-50001091-2', 'responsable_inscripto', 'cuenta_corriente', 30, true),
  ('c0000000-0000-0000-0000-000000000002', 'Monotributo Test', 'empresa', '20-22651487-3', 'monotributo', 'contado', 0, true),
  ('c0000000-0000-0000-0000-000000000003', 'Consumidor Test', 'particular', null, 'consumidor_final', 'contado', 0, true);

-- 4. Cuentas (4 cuentas con saldos iniciales definidos)
insert into public.cuentas (id, nombre, saldo_inicial, activa, orden) values
  ('b0000000-0000-0000-0000-000000000001', 'Efectivo', 100000, true, 1),
  ('b0000000-0000-0000-0000-000000000002', 'Mercado Pago', 0, true, 2),
  ('b0000000-0000-0000-0000-000000000003', 'Credicoop', 0, true, 3),
  ('b0000000-0000-0000-0000-000000000004', 'Galicia', 0, true, 4);

-- 5. Flota: 2 vehículos y 2 máquinas con los coeficientes del seed normal
insert into public.vehiculos (id, nombre, tipo, coef_precio, coef_carga_menor_50, coef_carga_mayor_50, consumo_l_100km, activo) values
  ('e0000000-0000-0000-0000-000000000001', 'Ford Cargo', 'camion', 1.80, 1.40, 1.50, 20.0, true),
  ('e0000000-0000-0000-0000-000000000002', 'Ranger', 'camioneta', 1.10, 1.10, 1.20, 11.5, true);

insert into public.maquinas (id, codigo_interno, tipo, marca, modelo, capacidad, activo) values
  ('f0000000-0000-0000-0000-000000000001', 'AE-01', 'autoelevador', 'Toyota', '8FGU25', '2500 kg', true),
  ('f0000000-0000-0000-0000-000000000002', 'AE-02', 'autoelevador', 'Heli', 'CPCD30', '3000 kg', true);

-- 6. Las 26 categorías de movimiento del seed de caja
insert into public.categorias_movimiento (id, nombre, ambito, tipo, orden, activa) values
  ('d0000000-0000-0000-0000-000000000001', 'Combustible', 'empresa', 'egreso', 1, true),
  ('d0000000-0000-0000-0000-000000000002', 'Mantenimiento y reparaciones', 'empresa', 'egreso', 2, true),
  ('d0000000-0000-0000-0000-000000000003', 'Repuestos', 'empresa', 'egreso', 3, true),
  ('d0000000-0000-0000-0000-000000000004', 'Peajes y viáticos', 'empresa', 'egreso', 4, true),
  ('d0000000-0000-0000-0000-000000000005', 'Tercerizados', 'empresa', 'egreso', 5, true),
  ('d0000000-0000-0000-0000-000000000006', 'Sueldos y cargas sociales', 'empresa', 'egreso', 6, true),
  ('d0000000-0000-0000-0000-000000000007', 'Honorarios', 'empresa', 'egreso', 7, true),
  ('d0000000-0000-0000-0000-000000000008', 'Impuestos y tasas', 'empresa', 'egreso', 8, true),
  ('d0000000-0000-0000-0000-000000000009', 'Seguros', 'empresa', 'egreso', 9, true),
  ('d0000000-0000-0000-0000-000000000010', 'Servicios del galpón', 'empresa', 'egreso', 10, true),
  ('d0000000-0000-0000-0000-000000000011', 'Alquiler del galpón', 'empresa', 'egreso', 11, true),
  ('d0000000-0000-0000-0000-000000000012', 'Bancarios y comisiones', 'empresa', 'egreso', 12, true),
  ('d0000000-0000-0000-0000-000000000013', 'Equipamiento', 'empresa', 'egreso', 13, true),
  ('d0000000-0000-0000-0000-000000000014', 'Otros gastos', 'empresa', 'egreso', 99, true),
  ('d0000000-0000-0000-0000-000000000015', 'Venta de equipos', 'empresa', 'ingreso', 1, true),
  ('d0000000-0000-0000-0000-000000000016', 'Otros ingresos', 'empresa', 'ingreso', 99, true),
  ('d0000000-0000-0000-0000-000000000017', 'Vivienda', 'personal', 'egreso', 1, true),
  ('d0000000-0000-0000-0000-000000000018', 'Servicios del hogar', 'personal', 'egreso', 2, true),
  ('d0000000-0000-0000-0000-000000000019', 'Alimentación', 'personal', 'egreso', 3, true),
  ('d0000000-0000-0000-0000-000000000020', 'Salud', 'personal', 'egreso', 4, true),
  ('d0000000-0000-0000-0000-000000000021', 'Mascotas', 'personal', 'egreso', 5, true),
  ('d0000000-0000-0000-0000-000000000022', 'Transporte', 'personal', 'egreso', 6, true),
  ('d0000000-0000-0000-0000-000000000023', 'Familia', 'personal', 'egreso', 7, true),
  ('d0000000-0000-0000-0000-000000000024', 'Otros gastos', 'personal', 'egreso', 99, true),
  ('d0000000-0000-0000-0000-000000000025', 'Retiro de la empresa', 'personal', 'ingreso', 1, true),
  ('d0000000-0000-0000-0000-000000000026', 'Otros ingresos', 'personal', 'ingreso', 99, true);

-- 7. Fila única de empresa
insert into public.empresa (
  id,
  razon_social,
  cuit,
  domicilio,
  telefono,
  email,
  email_secundario,
  instagram
) values (
  1,
  'ALICIA ELIZABETH GAMARRA',
  '27-22651487-8',
  'Llavallol, Lomas de Zamora, Provincia de Buenos Aires',
  '+54 9 11 6391-6614',
  'elevaplus.one@gmail.com',
  'aelgama@yahoo.com',
  '@elevaplus_'
);

-- 8. Fila de parametros_cotizador
insert into public.parametros_cotizador (
  id,
  vigente_desde,
  precio_km,
  monto_minimo,
  km_minimo,
  precio_gasoil,
  notas
) values (
  1,
  current_date,
  1700,
  15000,
  1,
  1600,
  'Valores de prueba (Fase 5)'
);

