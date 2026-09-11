-- =============================================================================
-- ELEVAPLUS GESTION: SETUP COMPLETO STAGING
-- Incluye migraciones 01 a 10 + seed + usuario admin de prueba
-- =============================================================================


-- ==========================================
-- MIGRACION: 20260904000001_esquema_inicial.sql
-- ==========================================

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


-- ==========================================
-- MIGRACION: 20260904000002_vista_cuenta_corriente_security_invoker.sql
-- ==========================================

-- La vista debe respetar el RLS del usuario que consulta, no del que la creó.
alter view cuenta_corriente set (security_invoker = on);

-- ==========================================
-- MIGRACION: 20260905000003_cobros_recalculo.sql
-- ==========================================

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


-- ==========================================
-- MIGRACION: 20260908000004_facturacion.sql
-- ==========================================

-- Servicios que por decisión del negocio no se facturan: salen de "pendientes".
alter table servicios add column no_facturable boolean not null default false;

-- Notas de crédito: referencia a la factura que corrigen, y marca de anulación.
alter table facturas add column factura_asociada_id uuid references facturas(id);
alter table facturas add column anulada boolean not null default false;


-- ==========================================
-- MIGRACION: 20260909000005_empresa_y_presupuestos.sql
-- ==========================================

-- Datos de la empresa y parámetros del presupuesto. Una sola fila.
create table empresa (
  id int primary key default 1 check (id = 1),
  razon_social text not null,
  cuit text not null,
  condicion_iva condicion_iva not null default 'responsable_inscripto',
  domicilio text,
  telefono text,
  email text,
  email_secundario text,
  instagram text,
  presupuesto_validez_dias int not null default 15,
  presupuesto_espera_autoelevador text not null default 'La hora de espera se cobra al valor de la hora de alquiler.',
  presupuesto_espera_camion text,
  presupuesto_condiciones_extra text,
  updated_at timestamptz not null default now()
);

alter table empresa enable row level security;
create policy empresa_select on empresa for select using (auth.uid() is not null);
create policy empresa_update on empresa for update using (es_admin());

insert into empresa (razon_social, cuit, domicilio, telefono, email, email_secundario, instagram)
values (
  'ALICIA ELIZABETH GAMARRA', '27-22651487-8',
  'Llavallol, Lomas de Zamora, Provincia de Buenos Aires',
  '+54 9 11 6391-6614', 'elevaplus.one@gmail.com', 'aelgama@yahoo.com', '@elevaplus_'
);

-- Presupuesto generado por servicio
alter table servicios
  add column presupuesto_validez_dias int,
  add column presupuesto_condiciones text,
  add column presupuesto_pdf_path text,
  add column presupuesto_generado_at timestamptz;


-- ==========================================
-- MIGRACION: 20260909000006_precios_espera.sql
-- ==========================================

alter table empresa
  add column precio_hora_espera_camion numeric(14,2),
  add column precio_hora_espera_autoelevador numeric(14,2);


-- ==========================================
-- MIGRACION: 20260909000007_caja.sql
-- ==========================================

create type ambito_movimiento as enum ('empresa', 'personal');
create type tipo_movimiento as enum ('ingreso', 'egreso', 'transferencia');
create type estado_movimiento as enum ('pendiente', 'pagado');
create type tipo_comprobante_compra as enum ('A', 'B', 'C', 'M', 'ticket', 'otro');

create table cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  saldo_inicial numeric(14,2) not null default 0,
  activa boolean not null default true,
  orden int not null default 0
);

create table categorias_movimiento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ambito ambito_movimiento not null,
  tipo tipo_movimiento not null check (tipo in ('ingreso','egreso')),
  activa boolean not null default true,
  orden int not null default 0,
  unique (nombre, ambito, tipo)
);

-- Movimientos que NO son cobros de servicios: gastos, ingresos varios, transferencias.
create table movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  tipo tipo_movimiento not null,
  ambito ambito_movimiento not null default 'empresa',
  categoria_id uuid references categorias_movimiento(id),
  proveedor text,                              -- Edesur, YPF, el contador...
  descripcion text,
  medio medio_pago,
  cuenta_id uuid references cuentas(id),       -- de dónde sale / a dónde entra
  cuenta_destino_id uuid references cuentas(id), -- solo transferencias
  monto numeric(14,2) not null check (monto > 0),
  estado estado_movimiento not null default 'pagado',
  fecha_acreditacion date,
  -- comprobante de compra (para IVA compras)
  tiene_comprobante boolean not null default false,
  comprobante_tipo tipo_comprobante_compra,
  comprobante_punto_venta int,
  comprobante_numero bigint,
  proveedor_cuit text,
  neto numeric(14,2),
  iva numeric(14,2),
  comprobante_path text,
  notas text,
  registrado_por uuid references perfiles(id),
  created_at timestamptz not null default now(),
  check (tipo <> 'transferencia' or (cuenta_id is not null and cuenta_destino_id is not null and cuenta_id <> cuenta_destino_id))
);
create index movimientos_fecha_idx on movimientos_caja (fecha);
create index movimientos_cuenta_idx on movimientos_caja (cuenta_id);

-- Los cobros también entran a una cuenta
alter table cobros add column cuenta_id uuid references cuentas(id);

-- RLS: admin y oficina; choferes no ven caja
alter table cuentas enable row level security;
alter table categorias_movimiento enable row level security;
alter table movimientos_caja enable row level security;
create policy cuentas_rw on cuentas for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());
create policy categorias_select on categorias_movimiento for select using (es_admin_u_oficina());
create policy categorias_write on categorias_movimiento for all using (es_admin()) with check (es_admin());
create policy movimientos_select on movimientos_caja for select using (es_admin_u_oficina());
create policy movimientos_insert on movimientos_caja for insert with check (es_admin_u_oficina());
create policy movimientos_update on movimientos_caja for update using (es_admin_u_oficina());
create policy movimientos_delete on movimientos_caja for delete using (es_admin());

-- Saldo por cuenta
create view saldos_cuentas as
select
  c.id, c.nombre, c.saldo_inicial,
  c.saldo_inicial
  + coalesce((select sum(monto) from cobros co where co.cuenta_id = c.id and co.estado = 'acreditado'), 0)
  + coalesce((select sum(monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'ingreso' and m.estado = 'pagado'), 0)
  - coalesce((select sum(monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'egreso' and m.estado = 'pagado'), 0)
  - coalesce((select sum(monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'transferencia'), 0)
  + coalesce((select sum(monto) from movimientos_caja m where m.cuenta_destino_id = c.id and m.tipo = 'transferencia'), 0)
  as saldo
from cuentas c where c.activa;
alter view saldos_cuentas set (security_invoker = on);

-- Posición de IVA por mes
create view iva_mensual as
with ventas as (
  select date_trunc('month', fecha)::date as mes,
         sum(case when tipo in ('A','B','C','ND_A','ND_B') then iva else -iva end) as iva_ventas
  from facturas where not anulada group by 1
), compras as (
  select date_trunc('month', fecha)::date as mes, sum(coalesce(iva,0)) as iva_compras
  from movimientos_caja
  where tipo = 'egreso' and ambito = 'empresa' and tiene_comprobante and comprobante_tipo = 'A'
  group by 1
)
select coalesce(v.mes, c.mes) as mes,
       coalesce(v.iva_ventas, 0) as iva_ventas,
       coalesce(c.iva_compras, 0) as iva_compras,
       coalesce(v.iva_ventas, 0) - coalesce(c.iva_compras, 0) as posicion
from ventas v full outer join compras c on v.mes = c.mes
order by 1 desc;
alter view iva_mensual set (security_invoker = on);

-- Seed
insert into cuentas (nombre, orden) values ('Efectivo', 1), ('Mercado Pago', 2), ('Credicoop', 3), ('Galicia', 4);

insert into categorias_movimiento (nombre, ambito, tipo, orden) values
  ('Combustible', 'empresa', 'egreso', 1),
  ('Mantenimiento y reparaciones', 'empresa', 'egreso', 2),
  ('Repuestos', 'empresa', 'egreso', 3),
  ('Peajes y viáticos', 'empresa', 'egreso', 4),
  ('Tercerizados', 'empresa', 'egreso', 5),
  ('Sueldos y cargas sociales', 'empresa', 'egreso', 6),
  ('Honorarios', 'empresa', 'egreso', 7),
  ('Impuestos y tasas', 'empresa', 'egreso', 8),
  ('Seguros', 'empresa', 'egreso', 9),
  ('Servicios del galpón', 'empresa', 'egreso', 10),
  ('Alquiler del galpón', 'empresa', 'egreso', 11),
  ('Bancarios y comisiones', 'empresa', 'egreso', 12),
  ('Equipamiento', 'empresa', 'egreso', 13),
  ('Otros gastos', 'empresa', 'egreso', 99),
  ('Venta de equipos', 'empresa', 'ingreso', 1),
  ('Otros ingresos', 'empresa', 'ingreso', 99),
  ('Vivienda', 'personal', 'egreso', 1),
  ('Servicios del hogar', 'personal', 'egreso', 2),
  ('Alimentación', 'personal', 'egreso', 3),
  ('Salud', 'personal', 'egreso', 4),
  ('Mascotas', 'personal', 'egreso', 5),
  ('Transporte', 'personal', 'egreso', 6),
  ('Familia', 'personal', 'egreso', 7),
  ('Otros gastos', 'personal', 'egreso', 99),
  ('Retiro de la empresa', 'personal', 'ingreso', 1),
  ('Otros ingresos', 'personal', 'ingreso', 99);


-- ==========================================
-- MIGRACION: 20260910000008_realtime.sql
-- ==========================================

alter publication supabase_realtime add table
  servicios, servicio_eventos, cobros, cobro_aplicaciones, cheques,
  facturas, movimientos_caja, alquileres, clientes, cuentas, adjuntos, servicio_choferes;


-- ==========================================
-- MIGRACION: 20260910000009_push.sql
-- ==========================================

create table push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  created_at timestamptz not null default now(),
  ultimo_envio timestamptz
);
alter table push_suscripciones enable row level security;
create policy push_propias on push_suscripciones for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());


-- ==========================================
-- MIGRACION: 20260911000010_facturacion_arca.sql
-- ==========================================

-- =============================================================================
-- ELEVAPLUS Gestión — 0010 Facturación electrónica ARCA
-- Ver docs/FACTURACION-ARCA.md para detalles y diseño.
-- =============================================================================

create type modo_facturacion as enum ('por_servicio', 'diaria', 'quincenal', 'mensual', 'manual');
create type estado_emision as enum ('manual', 'borrador', 'emitiendo', 'emitida', 'error');
create type ambiente_arca as enum ('homologacion', 'produccion');

-- Política por cliente
alter table clientes
  add column facturacion_modo modo_facturacion not null default 'manual',
  add column facturacion_automatica boolean not null default false,
  add column enviar_factura_email boolean not null default true,
  add column email_facturacion text;            -- si difiere del email general

-- Parámetros de emisión
alter table empresa
  add column punto_venta_ws int not null default 3,
  add column arca_ambiente ambiente_arca not null default 'homologacion',
  add column tope_diario_facturas int not null default 20,
  add column tope_diario_monto numeric(14,2) not null default 20000000,
  add column cbu text,
  add column alias_cbu text,
  add column banco text,
  add column email_facturacion text default 'facturacion@eleva-plus.com.ar',
  add column texto_pie_factura text;

-- Facturas: datos de emisión electrónica
alter table facturas
  add column estado_emision estado_emision not null default 'manual',
  add column cae_vencimiento date,
  add column concepto int default 2,            -- 2 = servicios
  add column periodo_desde date,
  add column periodo_hasta date,
  add column fecha_vto_pago date,
  add column error_emision text,
  add column emitida_at timestamptz,
  add column enviada_email_at timestamptz,
  add column email_destino text,
  add column lote_id uuid;

-- Corridas del proceso nocturno
create table lotes_emision (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  iniciado_at timestamptz not null default now(),
  finalizado_at timestamptz,
  disparado_por text not null default 'cron',   -- 'cron' | 'manual:<usuario_id>'
  facturas_emitidas int not null default 0,
  monto_total numeric(14,2) not null default 0,
  descartados jsonb not null default '[]',      -- [{cliente_id, cliente, motivo, servicios:[...]}]
  error text
);
alter table facturas add foreign key (lote_id) references lotes_emision(id);

-- Log de cada llamada a ARCA
create table arca_log (
  id bigserial primary key,
  factura_id uuid references facturas(id),
  accion text not null,                          -- 'ultimo_comprobante' | 'crear_comprobante' | 'consultar'
  ambiente ambiente_arca not null,
  request jsonb,
  response jsonb,
  exito boolean not null,
  duracion_ms int,
  created_at timestamptz not null default now()
);

-- RLS
alter table lotes_emision enable row level security;
alter table arca_log enable row level security;
create policy lotes_select on lotes_emision for select using (es_admin_u_oficina());
create policy arca_log_select on arca_log for select using (es_admin());
-- El worker escribe con service role; nadie escribe desde el front.

-- Realtime
alter publication supabase_realtime add table lotes_emision;


-- ==========================================
-- SEED INICIAL
-- ==========================================

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


-- ==========================================
-- USUARIO ADMIN DE PRUEBA (admin@eleva-plus.com.ar / AdminStaging2026!)
-- ==========================================

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
  confirmation_token
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@eleva-plus.com.ar',
  crypt('AdminStaging2026!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"nombre":"Admin Staging"}',
  now(),
  now(),
  ''
) on conflict (email) do nothing;

update public.perfiles
set rol = 'admin', activo = true
where id in (select id from auth.users where email = 'admin@eleva-plus.com.ar');

-- 0011 Permitir a service_role cambiar estado
create or replace function public.cambiar_estado(
  p_servicio_id uuid,
  p_nuevo estado_servicio,
  p_nota text default null
) returns servicios
language plpgsql security definer set search_path = public as $$
declare
  s servicios%rowtype;
  rol rol_usuario := mi_rol();
  es_service_role boolean := (auth.jwt() ->> 'role' = 'service_role' or auth.uid() is null);
  permitido boolean := false;
  es_chofer_asignado boolean;
begin
  select * into s from servicios where id = p_servicio_id for update;
  if not found then raise exception 'Servicio no encontrado'; end if;

  select exists (select 1 from servicio_choferes where servicio_id = s.id and chofer_id = auth.uid())
    into es_chofer_asignado;

  -- Transiciones válidas
  if es_service_role then
    permitido := true;
  elsif p_nuevo = 'cancelado' then
    permitido := rol in ('admin','oficina');
  elsif s.estado = 'consulta' and p_nuevo = 'presupuestado' then permitido := rol in ('admin','oficina');
  elsif s.estado = 'presupuestado' and p_nuevo = 'aceptado' then permitido := rol in ('admin','oficina');
  elsif s.estado in ('aceptado','consulta','presupuestado') and p_nuevo = 'programado' then permitido := rol in ('admin','oficina');
  elsif s.estado = 'programado' and p_nuevo = 'en_curso' then permitido := rol in ('admin','oficina') or es_chofer_asignado;
  elsif s.estado in ('programado','en_curso') and p_nuevo = 'terminado' then permitido := rol in ('admin','oficina') or es_chofer_asignado;
  elsif s.estado in ('terminado','cobrado') and p_nuevo = 'facturado' then permitido := rol in ('admin','oficina');
  elsif rol = 'admin' then permitido := true;
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

-- 0012 Bucket de Storage para facturas
insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict do nothing;

create policy "facturas_leer" on storage.objects for select to authenticated
  using (bucket_id = 'facturas' and es_admin_u_oficina());

create policy "facturas_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas' and es_admin_u_oficina());
