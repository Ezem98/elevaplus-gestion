-- =============================================================================
-- ELEVAPLUS Gestión — 0001 esquema inicial (MVP)
-- Ver docs/DISEÑO.md para el razonamiento detrás de cada tabla.
-- =============================================================================

-- ---------- Enums ----------
create type rol_usuario as enum ('admin', 'oficina', 'chofer');
create type tipo_cliente as enum ('empresa', 'particular', 'municipio');
create type condicion_iva as enum ('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final');
create type condicion_pago as enum ('contado', 'transferencia_diferida', 'cuenta_corriente');
create type tipo_vehiculo as enum ('camion', 'camioneta', 'trailer');
create type estado_vehiculo as enum ('disponible', 'en_servicio', 'taller', 'baja');
create type tipo_maquina as enum ('autoelevador', 'plataforma', 'zorra', 'apilador', 'escalera', 'otro');
create type estado_maquina as enum ('disponible', 'alquilada', 'taller', 'baja');
create type tipo_servicio as enum ('traslado', 'alquiler_hora', 'alquiler_periodo', 'mantenimiento', 'otro');
create type estado_servicio as enum ('consulta', 'presupuestado', 'aceptado', 'programado', 'en_curso', 'terminado', 'cobrado', 'facturado', 'cancelado');
create type unidad_alquiler as enum ('dia', 'semana', 'quincena', 'mes');
create type medio_pago as enum ('efectivo', 'transferencia', 'cheque', 'echeq', 'otro');
create type estado_cobro as enum ('pendiente', 'acreditado', 'rechazado');
create type tipo_cheque as enum ('recibido', 'emitido');
create type estado_cheque as enum ('en_cartera', 'depositado', 'acreditado', 'rechazado', 'endosado');
create type tipo_factura as enum ('A', 'B', 'C', 'NC_A', 'NC_B', 'ND_A', 'ND_B');

-- ---------- Perfiles ----------
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol rol_usuario not null default 'chofer',
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Al crear un usuario en auth, se crea su perfil (rol chofer por defecto; admin lo cambia)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers de rol para RLS
create or replace function public.mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid()
$$;

create or replace function public.es_admin_u_oficina() returns boolean
language sql stable as $$ select mi_rol() in ('admin', 'oficina') $$;

create or replace function public.es_admin() returns boolean
language sql stable as $$ select mi_rol() = 'admin' $$;

-- ---------- Clientes ----------
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo tipo_cliente not null default 'empresa',
  cuit text,
  condicion_iva condicion_iva,
  telefono text,
  email text,
  direccion text,
  localidad text,
  condicion_pago condicion_pago not null default 'contado',
  dias_pago int not null default 0,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index clientes_nombre_idx on clientes (lower(nombre));

-- ---------- Flota ----------
create table vehiculos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo tipo_vehiculo not null,
  patente text,
  coef_precio numeric(6,3) not null default 1,
  coef_carga_menor_50 numeric(6,3) not null default 1,
  coef_carga_mayor_50 numeric(6,3) not null default 1,
  consumo_l_100km numeric(6,2),
  estado estado_vehiculo not null default 'disponible',
  activo boolean not null default true,
  notas text
);

create table maquinas (
  id uuid primary key default gen_random_uuid(),
  codigo_interno text unique,
  tipo tipo_maquina not null,
  marca text,
  modelo text,
  capacidad text,
  estado estado_maquina not null default 'disponible',
  activo boolean not null default true,
  notas text
);

-- ---------- Facturas (registro manual en MVP) ----------
create table facturas (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_factura not null,
  punto_venta int,
  numero bigint,
  fecha date not null,
  cliente_id uuid references clientes(id),
  neto numeric(14,2) not null,
  iva numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  cae text,
  pdf_path text,
  notas text,
  created_at timestamptz not null default now(),
  unique (tipo, punto_venta, numero)
);

-- ---------- Servicios ----------
create table servicios (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  cliente_id uuid references clientes(id),
  tipo tipo_servicio not null,
  estado estado_servicio not null default 'consulta',

  descripcion text,
  origen text,
  destino text,
  carga text,
  km numeric(8,1),
  ida_y_vuelta boolean not null default false,

  fecha_programada date,
  hora_programada time,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,

  vehiculo_id uuid references vehiculos(id),
  maquina_id uuid references maquinas(id),

  monto numeric(14,2),
  aplica_iva boolean not null default true,
  monto_cobrado numeric(14,2) not null default 0,

  remito text,
  orden_compra text,
  factura_id uuid references facturas(id),

  tercerizado boolean not null default false,
  tercero_nombre text,
  costo_tercero numeric(14,2),

  notas text,
  no_planificado boolean not null default false,
  creado_por uuid references perfiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index servicios_fecha_idx on servicios (fecha_programada);
create index servicios_cliente_idx on servicios (cliente_id);
create index servicios_estado_idx on servicios (estado);

create table servicio_choferes (
  servicio_id uuid references servicios(id) on delete cascade,
  chofer_id uuid references perfiles(id),
  primary key (servicio_id, chofer_id)
);

create table alquileres (
  servicio_id uuid primary key references servicios(id) on delete cascade,
  fecha_desde date not null,
  fecha_hasta date not null,
  unidad unidad_alquiler not null,
  cantidad int not null default 1,
  precio_unidad numeric(14,2) not null,
  renovacion_automatica boolean not null default false,
  alertar_dias_antes int not null default 5,
  renovado_de uuid references servicios(id),
  check (fecha_hasta >= fecha_desde)
);

create table servicio_eventos (
  id bigserial primary key,
  servicio_id uuid references servicios(id) on delete cascade,
  estado_anterior estado_servicio,
  estado_nuevo estado_servicio not null,
  usuario_id uuid references perfiles(id),
  nota text,
  created_at timestamptz not null default now()
);
create index servicio_eventos_servicio_idx on servicio_eventos (servicio_id, created_at);

-- ---------- Cobros y cheques ----------
create table cheques (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_cheque not null,
  es_echeq boolean not null default false,
  numero text,
  banco text,
  emisor text,
  fecha_emision date,
  fecha_pago date not null,
  monto numeric(14,2) not null,
  estado estado_cheque not null default 'en_cartera',
  cliente_id uuid references clientes(id),
  notas text,
  created_at timestamptz not null default now()
);

create table cobros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  fecha date not null default current_date,
  fecha_acreditacion date,
  monto numeric(14,2) not null check (monto > 0),
  medio medio_pago not null,
  estado estado_cobro not null default 'pendiente',
  referencia text,
  cheque_id uuid references cheques(id),
  registrado_por uuid references perfiles(id),
  notas text,
  created_at timestamptz not null default now()
);

create table cobro_aplicaciones (
  cobro_id uuid references cobros(id) on delete cascade,
  servicio_id uuid references servicios(id),
  monto numeric(14,2) not null check (monto > 0),
  primary key (cobro_id, servicio_id)
);

-- Adjuntos (Supabase Storage)
create table adjuntos (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references servicios(id) on delete cascade,
  cobro_id uuid references cobros(id) on delete cascade,
  tipo text not null,
  storage_path text not null,
  subido_por uuid references perfiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Cotizador ----------
create table parametros_cotizador (
  id serial primary key,
  vigente_desde date not null default current_date,
  precio_km numeric(12,2) not null,
  monto_minimo numeric(14,2) not null,
  km_minimo numeric(8,1) not null default 1,
  precio_gasoil numeric(12,2),
  notas text
);

-- ---------- Vistas ----------
create view cuenta_corriente as
select
  c.id as cliente_id,
  c.nombre,
  coalesce(sum(s.monto) filter (where s.estado not in ('consulta','presupuestado','cancelado')), 0) as total_servicios,
  coalesce(sum(s.monto_cobrado), 0) as total_cobrado,
  coalesce(sum(s.monto) filter (where s.estado not in ('consulta','presupuestado','cancelado')), 0)
    - coalesce(sum(s.monto_cobrado), 0) as saldo
from clientes c
left join servicios s on s.cliente_id = c.id
group by c.id, c.nombre;

-- ---------- Triggers ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger servicios_updated_at before update on servicios
  for each row execute function public.set_updated_at();

-- Recalcula monto_cobrado del servicio y lo pasa a 'cobrado' si corresponde
create or replace function public.recalcular_cobrado() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := coalesce(new.servicio_id, old.servicio_id);
  total numeric(14,2);
  s servicios%rowtype;
begin
  select coalesce(sum(a.monto), 0) into total
  from cobro_aplicaciones a
  join cobros c on c.id = a.cobro_id and c.estado <> 'rechazado'
  where a.servicio_id = sid;

  update servicios set monto_cobrado = total where id = sid returning * into s;

  if s.monto is not null and total >= s.monto and s.estado in ('terminado') then
    update servicios set estado = 'cobrado' where id = sid;
    insert into servicio_eventos (servicio_id, estado_anterior, estado_nuevo, usuario_id, nota)
    values (sid, 'terminado', 'cobrado', auth.uid(), 'Cobro completo');
  end if;
  return null;
end $$;

create trigger cobro_aplicaciones_recalc
  after insert or update or delete on cobro_aplicaciones
  for each row execute function public.recalcular_cobrado();

-- ---------- RPC: cambiar_estado ----------
-- Única forma permitida de cambiar el estado. Valida transiciones y deja traza.
create or replace function public.cambiar_estado(
  p_servicio_id uuid,
  p_nuevo estado_servicio,
  p_nota text default null
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  s servicios%rowtype;
  rol rol_usuario := mi_rol();
  permitido boolean := false;
  es_chofer_asignado boolean;
begin
  select * into s from servicios where id = p_servicio_id for update;
  if not found then raise exception 'Servicio no encontrado'; end if;

  select exists (select 1 from servicio_choferes where servicio_id = s.id and chofer_id = auth.uid())
    into es_chofer_asignado;

  -- Transiciones válidas
  if p_nuevo = 'cancelado' then
    permitido := rol in ('admin','oficina');
  elsif s.estado = 'consulta' and p_nuevo = 'presupuestado' then permitido := rol in ('admin','oficina');
  elsif s.estado = 'presupuestado' and p_nuevo = 'aceptado' then permitido := rol in ('admin','oficina');
  elsif s.estado in ('aceptado','consulta','presupuestado') and p_nuevo = 'programado' then permitido := rol in ('admin','oficina');
  elsif s.estado = 'programado' and p_nuevo = 'en_curso' then permitido := rol in ('admin','oficina') or es_chofer_asignado;
  elsif s.estado in ('programado','en_curso') and p_nuevo = 'terminado' then permitido := rol in ('admin','oficina') or es_chofer_asignado;
  elsif s.estado in ('terminado','cobrado') and p_nuevo = 'facturado' then permitido := rol in ('admin','oficina');
  elsif rol = 'admin' then permitido := true;  -- admin puede forzar cualquier corrección
  end if;

  if not permitido then
    raise exception 'Transición % → % no permitida para rol %', s.estado, p_nuevo, rol;
  end if;

  update servicios set
    estado = p_nuevo,
    fecha_inicio = case when p_nuevo = 'en_curso' and fecha_inicio is null then now() else fecha_inicio end,
    fecha_fin    = case when p_nuevo = 'terminado' and fecha_fin is null then now() else fecha_fin end
  where id = s.id returning * into s;

  insert into servicio_eventos (servicio_id, estado_anterior, estado_nuevo, usuario_id, nota)
  values (s.id, s.estado, p_nuevo, auth.uid(), p_nota);

  return s;
end $$;

-- ---------- RLS ----------
alter table perfiles enable row level security;
alter table clientes enable row level security;
alter table vehiculos enable row level security;
alter table maquinas enable row level security;
alter table facturas enable row level security;
alter table servicios enable row level security;
alter table servicio_choferes enable row level security;
alter table alquileres enable row level security;
alter table servicio_eventos enable row level security;
alter table cheques enable row level security;
alter table cobros enable row level security;
alter table cobro_aplicaciones enable row level security;
alter table adjuntos enable row level security;
alter table parametros_cotizador enable row level security;

-- perfiles: cada uno ve el suyo; admin/oficina ven todos; solo admin edita roles
create policy perfiles_select on perfiles for select using (id = auth.uid() or es_admin_u_oficina());
create policy perfiles_update_admin on perfiles for update using (es_admin());

-- Catálogos: todos leen, admin/oficina escriben, solo admin borra
create policy clientes_select on clientes for select using (auth.uid() is not null);
create policy clientes_write on clientes for insert with check (es_admin_u_oficina());
create policy clientes_update on clientes for update using (es_admin_u_oficina());
create policy clientes_delete on clientes for delete using (es_admin());

create policy vehiculos_select on vehiculos for select using (auth.uid() is not null);
create policy vehiculos_write on vehiculos for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());

create policy maquinas_select on maquinas for select using (auth.uid() is not null);
create policy maquinas_write on maquinas for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());

create policy parametros_select on parametros_cotizador for select using (auth.uid() is not null);
create policy parametros_write on parametros_cotizador for all using (es_admin()) with check (es_admin());

-- servicios: admin/oficina todo; chofer solo los suyos (asignados o creados por él como no planificados)
create policy servicios_select on servicios for select using (
  es_admin_u_oficina()
  or exists (select 1 from servicio_choferes sc where sc.servicio_id = servicios.id and sc.chofer_id = auth.uid())
  or (no_planificado and creado_por = auth.uid())
);
create policy servicios_insert on servicios for insert with check (
  es_admin_u_oficina() or (no_planificado and creado_por = auth.uid() and estado = 'terminado')
);
create policy servicios_update on servicios for update using (es_admin_u_oficina());
create policy servicios_delete on servicios for delete using (es_admin());

create policy sc_select on servicio_choferes for select using (auth.uid() is not null);
create policy sc_write on servicio_choferes for all using (es_admin_u_oficina()) with check (es_admin_u_oficina() or chofer_id = auth.uid());

create policy alquileres_select on alquileres for select using (
  exists (select 1 from servicios s where s.id = alquileres.servicio_id)  -- hereda visibilidad de servicios
);
create policy alquileres_write on alquileres for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());

create policy eventos_select on servicio_eventos for select using (
  exists (select 1 from servicios s where s.id = servicio_eventos.servicio_id)
);
-- inserts solo vía RPC (security definer); nadie inserta directo

-- cobros: admin/oficina todo; chofer inserta lo que cobra en mano y ve solo eso
create policy cobros_select on cobros for select using (es_admin_u_oficina() or registrado_por = auth.uid());
create policy cobros_insert on cobros for insert with check (
  es_admin_u_oficina() or (registrado_por = auth.uid() and medio in ('efectivo','cheque'))
);
create policy cobros_update on cobros for update using (es_admin_u_oficina());
create policy cobros_delete on cobros for delete using (es_admin());

create policy aplic_select on cobro_aplicaciones for select using (
  exists (select 1 from cobros c where c.id = cobro_aplicaciones.cobro_id)
);
create policy aplic_insert on cobro_aplicaciones for insert with check (
  exists (select 1 from cobros c where c.id = cobro_aplicaciones.cobro_id and (es_admin_u_oficina() or c.registrado_por = auth.uid()))
);
create policy aplic_write on cobro_aplicaciones for update using (es_admin_u_oficina());
create policy aplic_delete on cobro_aplicaciones for delete using (es_admin());

create policy cheques_select on cheques for select using (es_admin_u_oficina());
create policy cheques_insert on cheques for insert with check (auth.uid() is not null);
create policy cheques_update on cheques for update using (es_admin_u_oficina());
create policy cheques_delete on cheques for delete using (es_admin());

create policy facturas_all on facturas for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());

create policy adjuntos_select on adjuntos for select using (
  es_admin_u_oficina() or subido_por = auth.uid()
);
create policy adjuntos_insert on adjuntos for insert with check (subido_por = auth.uid());
create policy adjuntos_delete on adjuntos for delete using (es_admin_u_oficina());

-- La vista hereda RLS de servicios/clientes; choferes no la usan
grant select on cuenta_corriente to authenticated;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', false)
on conflict do nothing;

create policy "adjuntos_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos');
create policy "adjuntos_leer" on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos');
