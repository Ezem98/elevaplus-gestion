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
