-- 14-datos-fiscales-empresa.sql: Columnas de datos fiscales en empresa
begin;
select plan(4);

select has_column('public', 'empresa', 'iibb', 'empresa tiene la columna iibb');
select col_type_is('public', 'empresa', 'iibb', 'text', 'empresa.iibb es de tipo text');

select has_column('public', 'empresa', 'inicio_actividades', 'empresa tiene la columna inicio_actividades');
select col_type_is('public', 'empresa', 'inicio_actividades', 'date', 'empresa.inicio_actividades es de tipo date');

select * from finish();
rollback;
