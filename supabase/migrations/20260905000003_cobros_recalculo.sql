-- Recalcula monto_cobrado y estado de UN servicio a partir de sus aplicaciones.
-- Va en ambas direcciones: terminado→cobrado y cobrado→terminado (cheque rechazado).
create or replace function public.recalcular_servicio_cobrado(sid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  total numeric(14,2);
  s servicios%rowtype;
begin
  select coalesce(sum(a.monto), 0) into total
  from cobro_aplicaciones a
  join cobros c on c.id = a.cobro_id and c.estado <> 'rechazado'
  where a.servicio_id = sid;

  update servicios set monto_cobrado = total where id = sid returning * into s;

  if s.monto is not null and total >= s.monto and s.estado = 'terminado' then
    update servicios set estado = 'cobrado' where id = sid;
    insert into servicio_eventos (servicio_id, estado_anterior, estado_nuevo, usuario_id, nota)
    values (sid, 'terminado', 'cobrado', auth.uid(), 'Cobro completo');
  elsif s.monto is not null and total < s.monto and s.estado = 'cobrado' then
    update servicios set estado = 'terminado' where id = sid;
    insert into servicio_eventos (servicio_id, estado_anterior, estado_nuevo, usuario_id, nota)
    values (sid, 'cobrado', 'terminado', auth.uid(), 'Cobro revertido');
  end if;
end $$;

-- 1) Cambios en aplicaciones (reemplaza la función existente, mismo trigger)
create or replace function public.recalcular_cobrado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recalcular_servicio_cobrado(coalesce(new.servicio_id, old.servicio_id));
  return null;
end $$;

-- 2) Cambio de estado de un cobro (rechazado / acreditado) → recalcular sus servicios
create or replace function public.recalcular_por_cobro() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if new.estado <> old.estado then
    for a in select servicio_id from cobro_aplicaciones where cobro_id = new.id loop
      perform recalcular_servicio_cobrado(a.servicio_id);
    end loop;
  end if;
  return null;
end $$;

create trigger cobros_estado_recalc
  after update of estado on cobros
  for each row execute function public.recalcular_por_cobro();

-- 3) El estado del cheque arrastra al cobro
create or replace function public.sincronizar_cobro_desde_cheque() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado <> old.estado then
    if new.estado = 'rechazado' then
      update cobros set estado = 'rechazado' where cheque_id = new.id;
    elsif new.estado = 'acreditado' then
      update cobros set estado = 'acreditado', fecha_acreditacion = coalesce(fecha_acreditacion, current_date)
      where cheque_id = new.id;
    end if;
  end if;
  return null;
end $$;

create trigger cheques_estado_sync
  after update of estado on cheques
  for each row execute function public.sincronizar_cobro_desde_cheque();

-- 4) Al pasar a 'terminado', reevaluar (cubre el pago anticipado)
create or replace function public.reevaluar_al_terminar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recalcular_servicio_cobrado(new.id);
  return null;
end $$;

create trigger servicios_terminado_recalc
  after update of estado on servicios
  for each row when (new.estado = 'terminado' and old.estado <> 'terminado')
  execute function public.reevaluar_al_terminar();
