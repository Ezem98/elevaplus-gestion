drop policy if exists cuentas_select_todos on cuentas;
create policy cuentas_select_todos on cuentas for select using (auth.uid() is not null);

