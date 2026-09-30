-- Actualizar RPC marcar_presupuesto_enviado para soportar presupuestos en estado 'aceptado'.
-- Al regenerar o generar el PDF de un presupuesto ya aceptado, solo se actualizan
-- pdf_path y generado_at, sin alterar el estado ni los ítems asociados.

create or replace function public.marcar_presupuesto_enviado(
  p_presupuesto_id uuid,
  p_pdf_path text
) returns presupuestos
language plpgsql security definer set search_path = public as $$
declare
  pr presupuestos%rowtype;
  s record;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;

  select * into pr from presupuestos where id = p_presupuesto_id for update;
  if not found then raise exception 'Presupuesto no encontrado'; end if;

  if pr.estado not in ('borrador', 'enviado', 'aceptado') then
    raise exception 'El presupuesto no se puede enviar porque su estado actual es %', pr.estado;
  end if;

  if p_pdf_path is null or trim(p_pdf_path) = '' then
    raise exception 'La ruta del PDF es obligatoria';
  end if;

  -- Si el presupuesto ya está aceptado, solo se actualiza el PDF y la fecha de generación
  -- sin alterar el estado ni los ítems asociados.
  if pr.estado = 'aceptado' then
    update presupuestos
    set pdf_path = trim(p_pdf_path),
        generado_at = now()
    where id = pr.id
    returning * into pr;

    return pr;
  end if;

  -- Pasar ítems en consulta a presupuestado vía cambiar_estado
  for s in
    select id
    from servicios
    where presupuesto_id = pr.id and estado = 'consulta'
  loop
    perform cambiar_estado(s.id, 'presupuestado', 'Presupuesto #' || pr.numero);
  end loop;

  update presupuestos
  set estado = 'enviado',
      pdf_path = trim(p_pdf_path),
      generado_at = now(),
      enviado_at = coalesce(pr.enviado_at, now())
  where id = pr.id
  returning * into pr;

  return pr;
end $$;

revoke execute on function public.marcar_presupuesto_enviado(uuid, text) from public, anon;
grant execute on function public.marcar_presupuesto_enviado(uuid, text) to authenticated, service_role;
