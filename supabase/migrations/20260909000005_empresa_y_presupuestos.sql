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
