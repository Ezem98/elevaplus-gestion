-- Servicios que por decisión del negocio no se facturan: salen de "pendientes".
alter table servicios add column no_facturable boolean not null default false;

-- Notas de crédito: referencia a la factura que corrigen, y marca de anulación.
alter table facturas add column factura_asociada_id uuid references facturas(id);
alter table facturas add column anulada boolean not null default false;
