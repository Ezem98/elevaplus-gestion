# Agenda, cheques y proyección de caja — Diseño y prompts

> Rama: `agenda-cheques` (desde `main`). Requiere que `facturacion-arca` esté mergeada o rebasearla después: usa el worker.
> Encabezado de cada prompt: "Leé `AGENTS.md`, `docs/DESIGN.md`, `docs/DISEÑO.md`, `docs/FACTURACION-ARCA.md` (§4 worker) y `docs/AGENDA-Y-CHEQUES.md`. Estamos en la rama `agenda-cheques`."

---

## 1. Objetivo

Que la dueña vea en un solo lugar **qué tiene que pagar, qué le van a pagar y con qué cuenta**, día por día; que los cheques se puedan usar como plata (endosar, depositar, descontar) sin que la caja mienta; y que todo eso le llegue a su Google Calendar y a su celular sin cargar nada dos veces.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Cheque recibido | Instrumento con ciclo: `en_cartera → depositado → acreditado` · `→ endosado` · `→ descontado` · `→ rechazado`. Solo suma a una cuenta cuando **acredita**. |
| Cheque propio | `emitido → debitado` · `→ rechazado` · `→ anulado`. El egreso queda **pendiente hasta la fecha de pago**; el saldo de la cuenta baja ese día. |
| Pagar con cheque | Dos medios nuevos: **Cheque de terceros** (endoso de uno en cartera) y **Cheque propio** (emisión). Ambos en `FormularioMovimiento`. |
| Vencimientos | Plantilla recurrente (`vencimientos`) + instancias generadas por el worker (`vencimiento_instancias`) a 90 días. Marcar pagado crea el `movimiento_caja`. |
| Eventos derivados | No se guardan: se calculan de `cheques`, `cobros`, `movimientos_caja` pendientes, `alquileres`, `servicios`. Una vista SQL los unifica. |
| Google Calendar | Un sentido, app → Google. OAuth de la dueña una vez en Mi cuenta; el worker crea/actualiza eventos en un calendario "ELEVAPLUS". |
| Recordatorios | Push (infra existente) día anterior 9:00 y día 8:00. Mail resumen los lunes 7:00. |
| Proyección | Vista SQL `proyeccion_caja(dias, cuenta_id)`: saldo actual ± eventos con monto por día, con filtro opcional por cuenta para alertas de fondos. |

## 3. Modelo de datos

La migración se divide en dos archivos porque PostgreSQL no permite utilizar nuevos valores de un `enum` dentro de la misma transacción en la que se agregaron con `ALTER TYPE ... ADD VALUE`.

### 3.1 Migración de tipos y enums (`20260916000011_agenda_y_cheques_enums.sql`)

```sql
-- 20260916000011_agenda_y_cheques_enums.sql
-- Enums y valores nuevos para agenda y cheques.

-- Cheques: estados y datos nuevos
alter type estado_cheque add value if not exists 'emitido';
alter type estado_cheque add value if not exists 'debitado';
alter type estado_cheque add value if not exists 'anulado';
alter type estado_cheque add value if not exists 'descontado';

-- Medios de pago nuevos
alter type medio_pago add value if not exists 'cheque_terceros';
alter type medio_pago add value if not exists 'cheque_propio';
alter type medio_pago add value if not exists 'debito_automatico';

-- Vencimientos recurrentes
do $$
begin
  if not exists (select 1 from pg_type where typname = 'frecuencia_vencimiento') then
    create type frecuencia_vencimiento as enum ('unica', 'semanal', 'quincenal', 'mensual', 'bimestral', 'anual');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_instancia') then
    create type estado_instancia as enum ('pendiente', 'pagado', 'omitido');
  end if;
end $$;
```

### 3.2 Migración de estructura, funciones y vistas (`20260916000012_agenda_y_cheques.sql`)

```sql
-- 20260916000012_agenda_y_cheques.sql
-- Estructura, funciones, vistas y RLS para agenda y cheques.

alter table cheques
  add column if not exists cuenta_id uuid references cuentas(id),            -- propio: chequera de qué cuenta; recibido: dónde se depositó
  add column if not exists fecha_deposito date,
  add column if not exists fecha_acreditacion date,
  add column if not exists fecha_rechazo date,
  add column if not exists motivo_rechazo text,
  add column if not exists endosado_a text,                                    -- a quién se lo dio
  add column if not exists endosado_movimiento_id uuid,                        -- el egreso que pagó con él
  add column if not exists descontado_neto numeric(14,2),                      -- lo que recibió la dueña al descontarlo
  add column if not exists descontado_en text,                                 -- financiera / banco
  add column if not exists pagado_a text,                                      -- propio: beneficiario
  add column if not exists movimiento_id uuid,                                 -- propio: el egreso que originó
  add column if not exists imagen_path text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists cheque_eventos (
  id bigserial primary key,
  cheque_id uuid references cheques(id) on delete cascade,
  estado_anterior estado_cheque,
  estado_nuevo estado_cheque not null,
  usuario_id uuid references perfiles(id),
  nota text,
  created_at timestamptz not null default now()
);

alter table movimientos_caja
  add column if not exists cheque_id uuid references cheques(id);              -- pagado con este cheque (terceros o propio)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cheques_endosado_movimiento_id_fkey') then
    alter table cheques add constraint cheques_endosado_movimiento_id_fkey foreign key (endosado_movimiento_id) references movimientos_caja(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cheques_movimiento_id_fkey') then
    alter table cheques add constraint cheques_movimiento_id_fkey foreign key (movimiento_id) references movimientos_caja(id);
  end if;
end $$;

-- RPC única para cambiar estado de cheque (misma filosofía que cambiar_estado)
create or replace function public.cambiar_estado_cheque(
  p_cheque_id uuid, p_nuevo estado_cheque, p_nota text default null,
  p_cuenta_id uuid default null, p_fecha date default current_date,
  p_endosado_a text default null, p_movimiento_id uuid default null,
  p_descontado_neto numeric default null, p_descontado_en text default null,
  p_motivo text default null
) returns cheques language plpgsql security definer set search_path = public as $$
declare c cheques%rowtype; anterior estado_cheque;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;
  select * into c from cheques where id = p_cheque_id for update;
  if not found then raise exception 'Cheque no encontrado'; end if;
  anterior := c.estado;

  -- Transiciones válidas
  if c.tipo = 'recibido' then
    if not (
      (anterior = 'en_cartera' and p_nuevo in ('depositado','endosado','descontado','rechazado','anulado')) or
      (anterior = 'depositado' and p_nuevo in ('acreditado','rechazado')) or
      (es_admin())
    ) then raise exception 'Transición % → % no permitida', anterior, p_nuevo; end if;
  else
    if not (
      (anterior = 'emitido' and p_nuevo in ('debitado','rechazado','anulado')) or es_admin()
    ) then raise exception 'Transición % → % no permitida', anterior, p_nuevo; end if;
  end if;

  update cheques set
    estado = p_nuevo,
    cuenta_id = coalesce(p_cuenta_id, cuenta_id),
    fecha_deposito = case when p_nuevo = 'depositado' then p_fecha else fecha_deposito end,
    fecha_acreditacion = case when p_nuevo in ('acreditado','debitado') then p_fecha else fecha_acreditacion end,
    fecha_rechazo = case when p_nuevo = 'rechazado' then p_fecha else fecha_rechazo end,
    motivo_rechazo = coalesce(p_motivo, motivo_rechazo),
    endosado_a = coalesce(p_endosado_a, endosado_a),
    endosado_movimiento_id = coalesce(p_movimiento_id, endosado_movimiento_id),
    descontado_neto = coalesce(p_descontado_neto, descontado_neto),
    descontado_en = coalesce(p_descontado_en, descontado_en),
    updated_at = now()
  where id = p_cheque_id returning * into c;

  insert into cheque_eventos (cheque_id, estado_anterior, estado_nuevo, usuario_id, nota)
  values (p_cheque_id, anterior, p_nuevo, auth.uid(), p_nota);

  -- Efectos sobre cobros y movimientos (el trigger cheques_estado_sync existente maneja acreditado/rechazado → cobros)
  if p_nuevo = 'acreditado' and c.tipo = 'recibido' then
    update cobros set cuenta_id = c.cuenta_id where cheque_id = c.id and cuenta_id is null;
  elsif p_nuevo = 'endosado' then
    -- el cobro sigue válido (la dueña recibió el valor) pero nunca entra a una cuenta:
    update cobros set estado = 'acreditado', fecha_acreditacion = p_fecha, cuenta_id = null where cheque_id = c.id;
  elsif p_nuevo = 'descontado' then
    update cobros set estado = 'acreditado', fecha_acreditacion = p_fecha, cuenta_id = c.cuenta_id where cheque_id = c.id;
  elsif p_nuevo = 'debitado' and c.tipo = 'emitido' then
    update movimientos_caja set estado = 'pagado', fecha_acreditacion = p_fecha where id = c.movimiento_id;
  elsif p_nuevo in ('rechazado','anulado') and c.tipo = 'emitido' then
    update movimientos_caja set estado = 'pendiente' where id = c.movimiento_id;  -- sigue debiéndose
  end if;
  return c;
end $$;

-- Saldos: el endoso no entra a ninguna cuenta; el descuento entra por el neto; el propio sale al debitar
-- Columnas idénticas a la vista original de 000007: id, nombre, saldo_inicial, saldo
create or replace view saldos_cuentas as
select c.id, c.nombre, c.saldo_inicial,
  c.saldo_inicial
  + coalesce((select sum(co.monto) from cobros co
       left join cheques ch on ch.id = co.cheque_id
       where co.cuenta_id = c.id and co.estado = 'acreditado'
         and (ch.id is null or ch.estado in ('acreditado'))), 0)
  + coalesce((select sum(ch.descontado_neto) from cheques ch
       where ch.tipo = 'recibido' and ch.estado = 'descontado' and ch.cuenta_id = c.id), 0)
  + coalesce((select sum(m.monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'ingreso' and m.estado = 'pagado'), 0)
  - coalesce((select sum(m.monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'egreso' and m.estado = 'pagado'
       and coalesce(m.medio, 'otro') <> 'cheque_terceros'), 0)
  - coalesce((select sum(m.monto) from movimientos_caja m where m.cuenta_id = c.id and m.tipo = 'transferencia'), 0)
  + coalesce((select sum(m.monto) from movimientos_caja m where m.cuenta_destino_id = c.id and m.tipo = 'transferencia'), 0)
  as saldo
from cuentas c where c.activa;
alter view saldos_cuentas set (security_invoker = on);

create table if not exists vencimientos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,                                   -- "Sueldos", "Plan SUSS cuota", "Seguro camión"
  ambito ambito_movimiento not null default 'empresa',
  categoria_id uuid references categorias_movimiento(id),
  proveedor text,
  monto_estimado numeric(14,2),
  cuenta_sugerida_id uuid references cuentas(id),
  medio_sugerido medio_pago,
  frecuencia frecuencia_vencimiento not null default 'mensual',
  dia_del_mes int check (dia_del_mes between 1 and 31),   -- mensual/bimestral
  dia_semana int check (dia_semana between 0 and 6),       -- semanal
  fecha_inicio date not null default current_date,
  fecha_fin date,                                          -- o null
  cuotas_total int,                                        -- planes de pago
  cuotas_pagadas int not null default 0,
  recordar_dias_antes int not null default 1,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists vencimiento_instancias (
  id uuid primary key default gen_random_uuid(),
  vencimiento_id uuid references vencimientos(id) on delete cascade,
  fecha date not null,
  numero_cuota int,
  monto_estimado numeric(14,2),
  estado estado_instancia not null default 'pendiente',
  movimiento_id uuid references movimientos_caja(id),      -- al marcar pagado
  pagado_at timestamptz,
  gcal_event_id text,
  unique (vencimiento_id, fecha)
);
create index if not exists vi_fecha_idx on vencimiento_instancias (fecha, estado);

-- Google Calendar
create table if not exists google_calendar_conexiones (
  usuario_id uuid primary key references perfiles(id) on delete cascade,
  refresh_token text not null,
  calendar_id text,
  email_google text,
  conectado_at timestamptz not null default now(),
  ultimo_sync timestamptz,
  activo boolean not null default true
);
alter table google_calendar_conexiones enable row level security;
-- Sin policies: solo el worker (service role) lee/escribe. El front solo ve un booleano vía RPC:
create or replace function public.tengo_google_calendar() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from google_calendar_conexiones where usuario_id = auth.uid() and activo)
$$;

-- IDs de eventos de Google para los derivados
create table if not exists gcal_eventos_derivados (
  clave text primary key,                                  -- 'cheque:<id>' | 'cobro:<id>' | 'alquiler:<servicio_id>' | 'movimiento:<id>'
  gcal_event_id text not null,
  usuario_id uuid references perfiles(id),
  actualizado_at timestamptz not null default now()
);
alter table gcal_eventos_derivados enable row level security;

-- RLS
alter table vencimientos enable row level security;
alter table vencimiento_instancias enable row level security;
alter table cheque_eventos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'venc_rw' and tablename = 'vencimientos') then
    create policy venc_rw on vencimientos for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'vi_rw' and tablename = 'vencimiento_instancias') then
    create policy vi_rw on vencimiento_instancias for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'che_select' and tablename = 'cheque_eventos') then
    create policy che_select on cheque_eventos for select using (es_admin_u_oficina());
  end if;
end $$;

-- Agenda unificada (eventos derivados + instancias)
create or replace view agenda as
  select 'vencimiento:' || vi.id as clave, vi.fecha, 'egreso' as sentido, v.titulo as titulo,
         v.proveedor as detalle, coalesce(vi.monto_estimado, v.monto_estimado) as monto,
         v.cuenta_sugerida_id as cuenta_id, vi.estado::text as estado, v.ambito::text as ambito,
         '/agenda?vencimiento=' || v.id as url
  from vencimiento_instancias vi join vencimientos v on v.id = vi.vencimiento_id
  where vi.estado = 'pendiente'
union all
  select 'cheque_cobrar:' || ch.id, ch.fecha_pago, 'ingreso', 'Cobrar cheque ' || coalesce(ch.numero,''),
         coalesce(cl.nombre, ch.emisor), ch.monto, null::uuid, ch.estado::text, 'empresa', '/cobros?tab=cheques&cheque=' || ch.id
  from cheques ch left join clientes cl on cl.id = ch.cliente_id
  where ch.tipo = 'recibido' and ch.estado in ('en_cartera','depositado')
union all
  select 'cheque_cubrir:' || ch.id, ch.fecha_pago, 'egreso', 'Cubrir cheque ' || coalesce(ch.numero,''),
         ch.pagado_a, ch.monto, ch.cuenta_id, ch.estado::text, 'empresa', '/cobros?tab=cheques&cheque=' || ch.id
  from cheques ch where ch.tipo = 'emitido' and ch.estado = 'emitido'
union all
  select 'cobro:' || co.id, coalesce(co.fecha_acreditacion, co.fecha), 'ingreso', 'Acreditación ' || co.medio::text,
         cl.nombre, co.monto, co.cuenta_id, co.estado::text, 'empresa', '/cobros'
  from cobros co left join clientes cl on cl.id = co.cliente_id
  where co.estado = 'pendiente' and co.cheque_id is null
union all
  select 'movimiento:' || m.id, coalesce(m.fecha_acreditacion, m.fecha), m.tipo::text, coalesce(m.descripcion, 'Pago pendiente'),
         m.proveedor, m.monto, m.cuenta_id, m.estado::text, m.ambito::text, '/caja?movimiento=' || m.id
  from movimientos_caja m where m.estado = 'pendiente' and m.cheque_id is null and m.tipo in ('ingreso','egreso')
union all
  select 'alquiler:' || a.servicio_id, a.fecha_hasta, 'info', 'Vence alquiler', cl.nombre, s.monto, null::uuid, s.estado::text, 'empresa',
         '/servicios/' || s.id
  from alquileres a join servicios s on s.id = a.servicio_id left join clientes cl on cl.id = s.cliente_id
  where s.estado in ('programado','en_curso');
alter view agenda set (security_invoker = on);

-- Proyección de caja día por día (con filtro opcional por cuenta para alertas de fondos)
create or replace function public.proyeccion_caja(p_dias int default 30, p_cuenta_id uuid default null)
returns table (fecha date, ingresos numeric, egresos numeric, saldo_proyectado numeric)
language sql stable security invoker as $$
  with dias as (select generate_series(current_date, current_date + p_dias, '1 day')::date as fecha),
  base as (
    select coalesce(sum(saldo),0) as saldo
    from saldos_cuentas
    where p_cuenta_id is null or id = p_cuenta_id
  ),
  mov as (
    select a.fecha,
           sum(case when a.sentido='ingreso' then a.monto else 0 end) as ing,
           sum(case when a.sentido='egreso' then a.monto else 0 end) as egr
    from agenda a
    where a.fecha between current_date and current_date + p_dias
      and a.ambito = 'empresa'
      and (p_cuenta_id is null or a.cuenta_id = p_cuenta_id)
    group by a.fecha)
  select d.fecha, coalesce(m.ing,0), coalesce(m.egr,0),
         (select saldo from base) + sum(coalesce(m.ing,0) - coalesce(m.egr,0)) over (order by d.fecha)
  from dias d left join mov m on m.fecha = d.fecha order by d.fecha;
$$;

-- Realtime: cheques ya estaba agregado en 20260910000008_realtime.sql, solo sumamos las tablas nuevas
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cheque_eventos') then
    alter publication supabase_realtime add table cheque_eventos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'vencimientos') then
    alter publication supabase_realtime add table vencimientos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'vencimiento_instancias') then
    alter publication supabase_realtime add table vencimiento_instancias;
  end if;
end $$;
```

### 3.3 Impacto de RLS por rol

| Tabla / Objeto | `admin` | `oficina` | `chofer` | Rationale / Seguridad |
|---|---|---|---|---|
| `vencimientos` | Lectura / Escritura (`venc_rw`) | Lectura / Escritura (`venc_rw`) | **Sin acceso** | Solo administración y oficina gestionan los compromisos de pago e impuestos de la empresa. |
| `vencimiento_instancias` | Lectura / Escritura (`vi_rw`) | Lectura / Escritura (`vi_rw`) | **Sin acceso** | Los choferes no interactúan con instancias de pago ni caja. |
| `cheque_eventos` | Lectura (`che_select`) | Lectura (`che_select`) | **Sin acceso** | Historial de auditoría visible para administración; las inserciones son exclusivas de la RPC `cambiar_estado_cheque`. |
| `google_calendar_conexiones` | Vía RPC `tengo_google_calendar()` | Vía RPC `tengo_google_calendar()` | **Sin acceso** | RLS habilitado sin policies públicas; tokens leídos y escritos únicamente por el worker mediante service role. |
| `gcal_eventos_derivados` | **Sin acceso directo** | **Sin acceso directo** | **Sin acceso** | RLS habilitado sin policies; tabla técnica de correlación para el worker. |
| RPC `cambiar_estado_cheque` | Ejecución total (incluso forzar transiciones) | Ejecución permitida según máquina de estados | **Bloqueado** (`No autorizado`) | Choferes no pueden cambiar estados de cheques directamente ni endosar/depositar. |

---

## 4. Worker: tareas nuevas

- **Cron 00:30** `generarInstancias()`: para cada `vencimiento` activo, crea las `vencimiento_instancias` que falten hasta hoy+90 según frecuencia (mensual: `dia_del_mes`, ajustado al último día si el mes es más corto; quincenal: 1 y 16 o día y día+15; semanal: `dia_semana`; anual: mismo día/mes de `fecha_inicio`; única: solo `fecha_inicio`). Respeta `fecha_fin` y `cuotas_total` (numera cuotas y no genera más allá). Marca nada como vencido: "vencido" es `pendiente` con `fecha < hoy`, calculado en la app.
- **Cron 08:00 y 09:00** `recordatorios()`: push a admin/oficina con lo de hoy ("Hoy: Sueldos $ 1.200.000 · Cubrir cheque Galicia $ 350.000 · Cobrar cheque Huma $ 200.000") y a las 9:00 lo de mañana. Un push agregado, no uno por ítem.
- **Cron 07:00 lunes** `resumenSemanal()`: mail a `empresa.email` con la agenda de la semana, cheques a cobrar/cubrir, proyección de caja a 7 días y alerta si algún día queda negativo.
- **Alerta de fondos**: dentro de `recordatorios()`, si un `cheque_cubrir` vence en ≤ 3 días y `proyeccion_caja(dias, cuenta_id)` de esa cuenta ese día es negativa → push "El cheque de Galicia por $ 350.000 vence el jueves y la cuenta no cubre".
- **Google Calendar** (`gcal/`): OAuth con `googleapis` — endpoint `GET /gcal/conectar` (redirige a Google con scope `calendar`), `GET /gcal/callback` (guarda `refresh_token`, crea calendario "ELEVAPLUS" si no existe, guarda `calendar_id`), `POST /gcal/desconectar`. **Cron 01:00** `sincronizarCalendario()`: por cada conexión activa, upsert de eventos para todas las filas de `agenda` de hoy a +90 días y para instancias pagadas de los últimos 7 días (para borrarlas): evento de día completo, título con monto ("Sueldos · $ 1.200.000"), descripción con detalle y link a la app, recordatorio según `recordar_dias_antes` (popup 9:00). Guarda `gcal_event_id` en la instancia o en `gcal_eventos_derivados`; borra eventos cuya clave ya no existe en `agenda`. Además, disparar `sincronizarCalendario()` desde un endpoint `POST /gcal/sync` que la app llama al guardar un vencimiento (con debounce).

Variables nuevas: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`.

## 5. Cambios en la app

### 5.1 Cheques (dentro de Cobros → pestaña **Cheques**, que pasa a ser el módulo)

Sub-pestañas: **En cartera** (recibidos en_cartera/depositado, por fecha de pago) · **A cubrir** (propios emitidos, por fecha, con columna "Saldo proyectado" de la cuenta ese día en `text-peligro` si no alcanza) · **Historial** (todos, filtros por estado/cliente/mes).

Fila: fecha de pago (en `text-alerta` si ya pasó y sigue en cartera/emitido), número, banco, emisor o beneficiario, cliente, monto, e-cheq, chip de estado, `MenuAcciones` según estado:
- Recibido en cartera: **Depositar** (pide cuenta) · **Endosar** (pide "a quién" y abre `FormularioMovimiento` prefijado con medio Cheque de terceros, cheque seleccionado, monto fijo) · **Descontar** (pide neto recibido, financiera, cuenta destino; la diferencia se registra sola como egreso "Gastos financieros") · **Rechazado** (motivo) · **Anular**.
- Depositado: **Acreditado** · **Rechazado**.
- Propio emitido: **Debitado** · **Rechazado** · **Anular**.
- Siempre: **Ver historial** (expande `cheque_eventos`) · **Foto del cheque** (Storage).

Todo por `cambiar_estado_cheque`. Sacar de `PaginaCobros` cualquier `update cheques set estado` directo.

### 5.2 Caja: pagar con cheque

En `FormularioMovimiento`, medios nuevos en el `Opcion`: **Cheque de terceros** y **Cheque propio** (además de Débito automático).
- Cheque de terceros: `Selector` de cheques recibidos `en_cartera` ("Huma S.A. · Galicia 1234 · $ 200.000 · vence 20/09"). Al elegir, el monto se fija al del cheque (no editable) y aparece "Endosado a" (texto, obligatorio; default el proveedor). Al guardar: insert del movimiento con `cheque_id`, `medio = cheque_terceros`, `estado = pagado`, `cuenta_id = null`; luego `cambiar_estado_cheque(id, 'endosado', ..., p_endosado_a, p_movimiento_id)`.
- Cheque propio: campos Número, Banco (`Selector` de cuentas bancarias), Fecha de pago, E-cheq (checkbox). Al guardar: insert `cheques` (tipo emitido, estado emitido, cuenta_id, pagado_a = proveedor, monto, fecha_emision hoy, fecha_pago) → insert movimiento con `cheque_id`, `medio = cheque_propio`, `estado = pendiente`, `fecha_acreditacion = fecha_pago`, `cuenta_id` = la del cheque → `update cheques set movimiento_id`.
- Débito automático: igual que transferencia pero medio distinto (para los resúmenes).

### 5.3 Agenda (`/agenda`, nav: sidebar después de Caja, ícono `CalendarDays`; en móvil reemplaza a "Clientes" en la barra y Clientes pasa a "Más")

Encabezado con `Opcion` **Semana · Mes · Lista** y filtro de ámbito (reusar el de Caja). Botón "Nuevo vencimiento".

- **Semana** (default): 7 columnas (lun-dom), hoy resaltada, cada día con sus ítems de `agenda` como tarjetas chicas: título, detalle, monto (ingresos `text-ok` con +, egresos sin signo), ícono por tipo (`Receipt` vencimiento, `Banknote` cheque, `ArrowDownToLine` acreditación, `Truck` alquiler). Vencidos (pendientes con fecha pasada) en una franja arriba en `alerta-suave`: "3 vencidos". Al pie de cada columna: neto del día. Debajo de la grilla, **Proyección de caja**: gráfico de barras simple (sin librerías) de `proyeccion_caja(14)`: saldo proyectado por día, barras en `bg-marca`, en `bg-peligro` si negativo, con el saldo actual como línea de referencia y los valores en `tabular-nums`. En móvil, la semana se muestra como lista agrupada por día.
- **Mes**: grilla calendario con puntos por tipo y monto total del día; tocar un día abre la lista de ese día.
- **Lista**: tabla de `agenda` ordenada por fecha, con filtros.

Acciones sobre una instancia de vencimiento: **Marcar pagado** → abre `FormularioMovimiento` prefijado (egreso, ámbito, categoría, proveedor, monto estimado editable, cuenta sugerida, medio sugerido) y al guardar `update vencimiento_instancias set estado='pagado', movimiento_id, pagado_at` y `vencimientos.cuotas_pagadas + 1` si tiene cuotas · **Omitir** (con nota) · **Editar vencimiento**. Los derivados linkean a su origen (`url`).

**`FormularioVencimiento`**: título, ámbito, categoría, proveedor, monto estimado, cuenta sugerida, medio sugerido, frecuencia (`Opcion`), día del mes / día de semana según frecuencia, fecha de inicio, "termina": nunca / en fecha / después de N cuotas (para planes: "Plan SUSS · 36 cuotas · pagadas 14" → `cuotas_total` 36, `cuotas_pagadas` 14, y las instancias arrancan en la 15), recordar N días antes, notas. Al guardar, llamar `POST /gcal/sync` del worker si `tengo_google_calendar()`.

Seed sugerido (la dueña confirma montos): Sueldos (día 5), Cargas sociales (día 10), Autónomos (día 20), IVA (día 20), Alquiler galpón (día 10), Seguro flota (día 15), Edesur galpón (mensual), Plan SUSS (cuota mensual). Se cargan desde la app, no por SQL.

### 5.4 Hoy

Debajo de "Servicios de hoy", bloque **"Vence hoy"** con los ítems de `agenda` de hoy (máx. 5, link a Agenda). Si hay vencidos: `Aviso` "N vencimientos atrasados".

### 5.5 Caja → Resumen semanal

`Opcion` **Semana · Mes** arriba del resumen. En Semana: navegación ‹ › por semanas, tres cifras (ingresos, egresos, resultado), y un gráfico de barras por día (lun-dom) con ingresos en `bg-ok` y egresos en `bg-peligro/70`, apiladas o lado a lado, valores en `tabular-nums`, sin librerías. Debajo, la lista de movimientos de la semana.

### 5.6 Mi cuenta → Google Calendar

`Tarjeta` "Google Calendar": si `tengo_google_calendar()` → "Conectado como <email>" + "Sincronizar ahora" + "Desconectar"; si no → botón "Conectar Google Calendar" que abre `GET /gcal/conectar?usuario=<jwt>` del worker. Texto: "Se crea un calendario 'ELEVAPLUS' en tu cuenta con los vencimientos, cheques y cobros. La app escribe en él; lo que cambies en Google no vuelve a la app."

## 6. Pruebas antes de mergear

- [ ] Recibo cheque de Huma $ 200.000 → en cartera; no suma a ninguna cuenta.
- [ ] Lo endoso al seguro → egreso pagado con medio cheque de terceros, cheque endosado, saldos intactos, cobro de Huma acreditado sin cuenta.
- [ ] Recibo otro, lo deposito en Galicia → sigue sin sumar; lo acredito → Galicia sube.
- [ ] Lo descuento: neto $ 180.000 en Credicoop → Credicoop +180.000, egreso "Gastos financieros" $ 20.000 automático.
- [ ] Emito cheque propio Galicia $ 350.000 al 25/09 → egreso pendiente, saldo Galicia igual hoy, aparece en A cubrir y en Agenda; el 25/09 lo debito → saldo baja.
- [ ] Cheque propio rechazado → egreso vuelve a pendiente.
- [ ] Vencimiento mensual día 5 → el worker genera instancias; marcar pagado crea el gasto y avanza la cuota.
- [ ] Plan de 36 cuotas con 14 pagadas → instancias numeradas desde la 15, y termina en la 36.
- [ ] Proyección: con un cheque a cubrir mayor al saldo, el día queda en rojo y llega el push de fondos.
- [ ] Google Calendar: conectar, ver el calendario "ELEVAPLUS" con los eventos, marcar pagado en la app → el evento desaparece en el próximo sync.
- [ ] Lunes 7:00 llega el mail resumen.

## 7. Prompts para `agy`

1. **Migración** (§3 completa, partida en `...000011_agenda_y_cheques_enums.sql` y `...000012_agenda_y_cheques.sql`). Sin `--dangerously-skip-permissions`. Crear los archivos y PARAR.
2. **Cheques** (§5.1 y §5.2). Incluye reemplazar el `saldos_cuentas` viejo por el nuevo si la migración no lo hizo, y refactorizar `PaginaCobros` para que todo cambio de estado pase por `cambiar_estado_cheque`.
3. **Agenda** (§5.3, §5.4) sin Google Calendar todavía. Incluye `FormularioVencimiento`, las tres vistas y la proyección.
4. **Worker: instancias, recordatorios, alerta de fondos, mail semanal** (§4, salvo gcal). Tests de la generación de instancias (mensual con día 31, cuotas, fecha_fin, quincenal).
5. **Caja semanal** (§5.5).
6. **Google Calendar** (§4 gcal + §5.6). Documentar en README: crear proyecto en Google Cloud, habilitar Calendar API, cliente OAuth tipo web con redirect al worker, pantalla de consentimiento en modo prueba con el mail de la dueña como usuario de prueba.
