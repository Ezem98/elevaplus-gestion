-- La vista debe respetar el RLS del usuario que consulta, no del que la creó.
alter view cuenta_corriente set (security_invoker = on);