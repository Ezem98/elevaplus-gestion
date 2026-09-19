-- 00-setup.sql: Helpers de autenticación para pruebas pgTAP
begin;
select plan(6);

create or replace function public.como_admin() returns void language plpgsql as $$
begin
  reset role;
  set role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
end;
$$;

create or replace function public.como_oficina() returns void language plpgsql as $$
begin
  reset role;
  set role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
end;
$$;

create or replace function public.como_chofer1() returns void language plpgsql as $$
begin
  reset role;
  set role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
end;
$$;

create or replace function public.como_chofer2() returns void language plpgsql as $$
begin
  reset role;
  set role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
end;
$$;

create or replace function public.como_service_role() returns void language plpgsql as $$
begin
  reset role;
  set role service_role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end;
$$;

create or replace function public.como_postgres() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on function public.como_admin() to public, authenticated, anon, service_role;
grant execute on function public.como_oficina() to public, authenticated, anon, service_role;
grant execute on function public.como_chofer1() to public, authenticated, anon, service_role;
grant execute on function public.como_chofer2() to public, authenticated, anon, service_role;
grant execute on function public.como_service_role() to public, authenticated, anon, service_role;
grant execute on function public.como_postgres() to public, authenticated, anon, service_role;

select has_function('public', 'como_admin', 'como_admin helper creado');
select has_function('public', 'como_oficina', 'como_oficina helper creado');
select has_function('public', 'como_chofer1', 'como_chofer1 helper creado');
select has_function('public', 'como_chofer2', 'como_chofer2 helper creado');
select has_function('public', 'como_service_role', 'como_service_role helper creado');
select has_function('public', 'como_postgres', 'como_postgres helper creado');

select * from finish();
commit;

