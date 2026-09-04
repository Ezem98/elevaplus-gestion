-- =============================================================================
-- Seed inicial — valores tomados de la planilla "Calcular importe viajes"
-- Correr después de las migraciones. Ajustar patentes y máquinas reales.
-- =============================================================================

insert into vehiculos (nombre, tipo, coef_precio, coef_carga_menor_50, coef_carga_mayor_50, consumo_l_100km) values
  ('Ranger + Trailer', 'trailer',   1.35, 1.25, 1.35, 11.5),
  ('Ranger',           'camioneta', 1.10, 1.10, 1.20, 11.5),
  ('Ford Cargo',       'camion',    1.80, 1.40, 1.50, 20.0),
  ('Mercedes 1114',    'camion',    1.45, 1.35, 1.45, null),
  ('VW 1517',          'camion',    2.00, 1.60, 1.70, null),
  ('Fiorino',          'camioneta', 0.95, 1.10, 1.20, null);

insert into parametros_cotizador (precio_km, monto_minimo, km_minimo, precio_gasoil, notas) values
  (1700, 15000, 1, 1600, 'Valores iniciales importados de la planilla (sep 2026)');

-- Máquinas: completar con la flota real
insert into maquinas (codigo_interno, tipo, marca, modelo, capacidad) values
  ('AE-01', 'autoelevador', null, null, null),
  ('AE-02', 'autoelevador', null, null, null),
  ('PL-01', 'plataforma',   null, null, null);
