-- ELEVAPLUS Gestión — 0033 Dirección del galpón en empresa
-- Origen por defecto para los traslados de máquinas en alquileres

alter table public.empresa
  add column if not exists direccion_galpon text;

grant select, update on table public.empresa to authenticated, service_role;
