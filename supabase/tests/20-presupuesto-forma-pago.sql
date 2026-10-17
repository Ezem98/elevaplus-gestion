-- 20-presupuesto-forma-pago.sql: Forma de pago configurable en empresa y en cada presupuesto
begin;
select plan(6);

select has_column('public', 'empresa', 'presupuesto_forma_pago', 'empresa tiene la columna presupuesto_forma_pago');
select col_type_is('public', 'empresa', 'presupuesto_forma_pago', 'text', 'empresa.presupuesto_forma_pago es de tipo text');
select has_column('public', 'presupuestos', 'forma_pago', 'presupuestos tiene la columna forma_pago');
select col_type_is('public', 'presupuestos', 'forma_pago', 'text', 'presupuestos.forma_pago es de tipo text');

update public.empresa set presupuesto_forma_pago = '50% adelantado y 50% al terminar el viaje' where id = 1;

create temp table _forma_pago_creada (caso text, forma_pago text);
grant all on _forma_pago_creada to authenticated;

select public.como_oficina();

insert into _forma_pago_creada
select 'explicita', (public.crear_presupuesto(
  jsonb_build_object('prospecto_nombre', 'TEST-PGTAP-FormaPago-1', 'forma_pago', 'Contado anticipado'),
  jsonb_build_array(jsonb_build_object('tipo', 'traslado', 'monto', 10000))
)).forma_pago;

insert into _forma_pago_creada
select 'por_defecto', (public.crear_presupuesto(
  jsonb_build_object('prospecto_nombre', 'TEST-PGTAP-FormaPago-2'),
  jsonb_build_array(jsonb_build_object('tipo', 'traslado', 'monto', 10000))
)).forma_pago;

reset role;

select is(
  (select forma_pago from _forma_pago_creada where caso = 'explicita'),
  'Contado anticipado',
  'crear_presupuesto guarda la forma de pago recibida'
);

select is(
  (select forma_pago from _forma_pago_creada where caso = 'por_defecto'),
  '50% adelantado y 50% al terminar el viaje',
  'crear_presupuesto copia la forma de pago de empresa si no viene'
);

select * from finish();
rollback;
