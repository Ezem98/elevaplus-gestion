-- ELEVAPLUS Gestión — 0035 Datos fiscales de la empresa (IIBB e inicio de actividades)

alter table public.empresa
  add column if not exists iibb text,
  add column if not exists inicio_actividades date;

grant select, update on table public.empresa to authenticated, service_role;
