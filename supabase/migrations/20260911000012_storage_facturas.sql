-- =============================================================================
-- ELEVAPLUS Gestión — 0012 Bucket de Storage para facturas electrónicas
-- Permite almacenar y descargar los PDFs generados con CAE y QR.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict do nothing;

drop policy if exists "facturas_leer" on storage.objects;
create policy "facturas_leer" on storage.objects for select to authenticated
  using (bucket_id = 'facturas' and es_admin_u_oficina());

drop policy if exists "facturas_subir" on storage.objects;
create policy "facturas_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas' and es_admin_u_oficina());

