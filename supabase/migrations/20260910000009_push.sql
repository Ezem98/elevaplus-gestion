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
