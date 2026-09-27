-- =============================================================================
-- ELEVAPLUS Gestión — 0025 Políticas RLS de Storage para el bucket adjuntos
-- Aislamiento estricto de archivos por rol y asignación de servicio.
--
-- Impacto por rol:
-- - admin y oficina: lectura y escritura (SELECT, INSERT, UPDATE, DELETE) en todo
--   el bucket 'adjuntos' (presupuestos/, comprobantes/, facturas/, servicios/ y
--   cualquier otra ruta).
-- - chofer: lectura, subida y actualización (SELECT, INSERT, UPDATE) ÚNICAMENTE
--   en la ruta 'servicios/<servicio_id>/...' siempre que el chofer esté asignado
--   a dicho servicio en servicio_choferes.
--   Sin permiso de borrado (DELETE): las fotos de remitos y cheques son evidencia.
--   Sin acceso a presupuestos/, comprobantes/, facturas/ ni servicios ajenos.
-- - anon: sin acceso (políticas to authenticated).
-- =============================================================================

drop policy if exists "adjuntos_subir" on storage.objects;
drop policy if exists "adjuntos_leer" on storage.objects;
drop policy if exists "adjuntos_actualizar" on storage.objects;
drop policy if exists "adjuntos_borrar" on storage.objects;
drop policy if exists "adjuntos_admin_oficina_todo" on storage.objects;
drop policy if exists "adjuntos_chofer_servicios_todo" on storage.objects;
drop policy if exists "adjuntos_chofer_servicios_select" on storage.objects;
drop policy if exists "adjuntos_chofer_servicios_insert" on storage.objects;
drop policy if exists "adjuntos_chofer_servicios_update" on storage.objects;
drop policy if exists "adjuntos_chofer_servicios_delete" on storage.objects;

-- 1. Admin y oficina: acceso total al bucket adjuntos (lectura y escritura en cualquier ruta)
create policy "adjuntos_admin_oficina_todo"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'adjuntos'
    and public.es_admin_u_oficina()
  )
  with check (
    bucket_id = 'adjuntos'
    and public.es_admin_u_oficina()
  );

-- 2. Chofer: lectura (SELECT) solo en servicios/<servicio_id>/ asignados en servicio_choferes
create policy "adjuntos_chofer_servicios_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = 'servicios'
    and exists (
      select 1 from public.servicio_choferes sc
      where sc.chofer_id = auth.uid()
        and sc.servicio_id::text = (storage.foldername(name))[2]
    )
  );

-- 3. Chofer: inserción (INSERT) solo en servicios/<servicio_id>/ asignados en servicio_choferes
create policy "adjuntos_chofer_servicios_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = 'servicios'
    and exists (
      select 1 from public.servicio_choferes sc
      where sc.chofer_id = auth.uid()
        and sc.servicio_id::text = (storage.foldername(name))[2]
    )
  );

-- 4. Chofer: actualización (UPDATE) solo en servicios/<servicio_id>/ asignados en servicio_choferes
create policy "adjuntos_chofer_servicios_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = 'servicios'
    and exists (
      select 1 from public.servicio_choferes sc
      where sc.chofer_id = auth.uid()
        and sc.servicio_id::text = (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = 'servicios'
    and exists (
      select 1 from public.servicio_choferes sc
      where sc.chofer_id = auth.uid()
        and sc.servicio_id::text = (storage.foldername(name))[2]
    )
  );
