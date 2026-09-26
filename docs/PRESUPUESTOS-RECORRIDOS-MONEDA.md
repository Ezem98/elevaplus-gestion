# Presupuestos, recorridos y moneda

> Primer rediseño a partir del uso real (feedback de la dueña, sep 2026).
> Va **antes** de la migración de la planilla y antes de las fases 6, 7 y 8: cambia el modelo de datos, y hoy la base está casi vacía.
> Encabezado de cada prompt: "Leé `AGENTS.md`, `docs/DESIGN.md`, `docs/DISEÑO.md` y `docs/PRESUPUESTOS-RECORRIDOS-MONEDA.md`. Estamos en `main`."

---

## 1. Qué resuelve

| Problema reportado                                                               | Solución                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| El sistema no admite viajes con varias paradas                                   | **Paradas** dentro de un servicio                      |
| No se puede presupuestar a alguien que todavía no es cliente (el PDF se bloquea) | **Presupuesto** como entidad propia, con **prospecto** |
| Un presupuesto puede incluir varias cosas (traslado + alquiler)                  | Un presupuesto agrupa **varios servicios**             |
| Los alquileres por período se cotizan en dólares                                 | **Moneda y cotización** por servicio                   |

## 2. Decisiones

| Tema                   | Decisión                                                                                      | Por qué                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recorrido              | **Un servicio con N paradas**, no N servicios                                                 | Paga un solo cliente y el chofer cierra el recorrido entero. El servicio conserva cliente, monto, estado, cobro y factura; toda la maquinaria existente sigue igual.            |
| Recorrido incompleto   | El servicio pasa a `terminado` igual; las paradas registran hasta dónde llegó                 | Agregar un estado `incompleto` al ciclo arrastra la RPC, los triggers de cobro y la facturación. El detalle vive en las paradas y la oficina decide qué hacer con lo que faltó. |
| Presupuesto            | Entidad propia que **agrupa servicios** en estado `consulta`/`presupuestado`                  | Hoy "presupuesto" es un servicio en cierto estado y no puede tener varios ítems ni un destinatario que no sea cliente.                                                          |
| Líneas del presupuesto | **Son los servicios mismos**, no una tabla aparte                                             | Al aceptar no hay que copiar nada: los servicios avanzan de estado con la RPC existente.                                                                                        |
| Prospecto → cliente    | Se resuelve al **aceptar**, con verificación de duplicados                                    | El sistema admite cobros anticipados y un cobro necesita cliente. Si el cliente naciera al finalizar, no se podría registrar una seña.                                          |
| Moneda                 | Dólares **solo en alquiler por período** (día, semana, quincena, mes); todo lo demás en pesos | Es como cotiza la dueña. Se impone en la base con un `check`, no solo en la interfaz. Un mismo presupuesto puede mezclar un traslado en pesos y un alquiler en dólares.         |
| Monto en pesos         | `servicios.monto` sigue siendo **siempre en pesos** y la fuente de verdad                     | Cobros, cuenta corriente, saldos, facturación e IVA no cambian. El dólar vive en dos columnas nuevas y se convierte.                                                            |

## 3. Modelo de datos

```sql
-- 20260927000020_presupuestos_recorridos_moneda.sql

-- ---------- Presupuestos ----------
create type estado_presupuesto as enum ('borrador', 'enviado', 'aceptado', 'rechazado', 'vencido');

create table presupuestos (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  fecha date not null default current_date,
  estado estado_presupuesto not null default 'borrador',
  cliente_id uuid references clientes(id),
  -- prospecto: se usa mientras cliente_id es null
  prospecto_nombre text,
  prospecto_telefono text,
  prospecto_email text,
  prospecto_cuit text,
  validez_dias int not null default 15,
  condiciones text,
  pdf_path text,
  generado_at timestamptz,
  enviado_at timestamptz,
  respondido_at timestamptz,
  notas text,
  creado_por uuid references perfiles(id),
  created_at timestamptz not null default now(),
  check (cliente_id is not null or prospecto_nombre is not null)
);

alter table servicios add column presupuesto_id uuid references presupuestos(id);
create index servicios_presupuesto_idx on servicios (presupuesto_id);

-- Migrar lo existente: cada servicio con datos de presupuesto genera su presupuesto
insert into presupuestos (id, fecha, estado, cliente_id, validez_dias, condiciones, pdf_path, generado_at, creado_por)
select gen_random_uuid(), coalesce(s.presupuesto_generado_at::date, s.created_at::date),
       case when s.estado in ('consulta','presupuestado') then 'enviado'::estado_presupuesto
            when s.estado = 'cancelado' then 'rechazado'::estado_presupuesto
            else 'aceptado'::estado_presupuesto end,
       s.cliente_id, coalesce(s.presupuesto_validez_dias, 15), s.presupuesto_condiciones,
       s.presupuesto_pdf_path, s.presupuesto_generado_at, s.creado_por
from servicios s
where s.presupuesto_pdf_path is not null and s.cliente_id is not null;
-- (vincular servicios a esos presupuestos en el mismo paso; ver prompt 1)
-- Las columnas presupuesto_* de servicios quedan deprecadas: no se borran en esta migración.

-- ---------- Paradas ----------
create type carga_desde as enum ('origen', 'parada_anterior');
create type estado_parada as enum ('pendiente', 'completada', 'no_realizada');

create table paradas (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios(id) on delete cascade,
  orden int not null check (orden >= 1),
  direccion text not null,
  localidad text,
  carga text,                               -- qué se deja en esta parada
  carga_desde carga_desde not null default 'origen',
  estado estado_parada not null default 'pendiente',
  completada_at timestamptz,
  notas text,
  unique (servicio_id, orden)
);
-- Un servicio con paradas es un recorrido. servicios.origen es el punto de partida;
-- servicios.destino se ignora cuando hay paradas (la última parada es el destino).

alter table servicios add column continuacion_de uuid references servicios(id);
-- Para reprogramar las paradas que quedaron sin hacer en un servicio nuevo.

-- ---------- Moneda ----------
alter table servicios
  add column moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  add column monto_moneda numeric(14,2),      -- monto en la moneda original
  add column cotizacion numeric(12,4);        -- pesos por dólar; null si es ARS
alter table servicios add constraint moneda_usd_solo_alquiler_periodo
  check (moneda = 'ARS' or tipo = 'alquiler_periodo');
alter table servicios add constraint usd_requiere_cotizacion
  check (moneda = 'ARS' or (monto_moneda is not null and cotizacion is not null and cotizacion > 0));
-- Regla: si moneda = 'USD', monto (pesos) = round(monto_moneda * cotizacion).

-- Máquinas que no se alquilan por hora (la tijera: mínimo 1 día)
alter table maquinas add column permite_alquiler_hora boolean not null default true;
update maquinas set permite_alquiler_hora = false where tipo = 'plataforma';
-- alquileres.precio_unidad se interpreta en la moneda del servicio.

-- ---------- RPC: aceptar presupuesto ----------
create or replace function public.aceptar_presupuesto(
  p_presupuesto_id uuid,
  p_cliente_id uuid            -- cliente existente elegido, o el recién creado desde el prospecto
) returns presupuestos
language plpgsql security definer set search_path = public as $$
declare pr presupuestos%rowtype; s record;
begin
  if not es_admin_u_oficina() then raise exception 'No autorizado'; end if;
  select * into pr from presupuestos where id = p_presupuesto_id for update;
  if not found then raise exception 'Presupuesto no encontrado'; end if;
  if pr.estado not in ('borrador','enviado') then
    raise exception 'El presupuesto ya está %', pr.estado;
  end if;
  if p_cliente_id is null then raise exception 'Hace falta un cliente para aceptar'; end if;

  update presupuestos set estado = 'aceptado', cliente_id = p_cliente_id, respondido_at = now()
  where id = pr.id returning * into pr;

  for s in select id, estado from servicios where presupuesto_id = pr.id loop
    update servicios set cliente_id = p_cliente_id where id = s.id;
    if s.estado = 'consulta' then
      perform cambiar_estado(s.id, 'presupuestado', 'Presupuesto #' || pr.numero);
    end if;
    perform cambiar_estado(s.id, 'aceptado', 'Presupuesto #' || pr.numero || ' aceptado');
  end loop;
  return pr;
end $$;

-- ---------- RPC: cerrar recorrido (la usa el chofer) ----------
create or replace function public.cerrar_recorrido(
  p_servicio_id uuid,
  p_ultima_parada int default null   -- null = completó todas
) returns servicios
language plpgsql security definer set search_path = public as $$
declare total int; realizadas int; resultado servicios%rowtype; nota text;
begin
  select count(*) into total from paradas where servicio_id = p_servicio_id;
  if total = 0 then raise exception 'El servicio no tiene paradas'; end if;

  if p_ultima_parada is null then
    update paradas set estado = 'completada', completada_at = now() where servicio_id = p_servicio_id;
    nota := 'Recorrido completo';
  else
    if p_ultima_parada < 0 or p_ultima_parada > total then raise exception 'Parada inválida'; end if;
    update paradas set estado = 'completada', completada_at = now()
      where servicio_id = p_servicio_id and orden <= p_ultima_parada;
    update paradas set estado = 'no_realizada'
      where servicio_id = p_servicio_id and orden > p_ultima_parada;
    realizadas := p_ultima_parada;
    nota := 'Recorrido incompleto: ' || realizadas || ' de ' || total || ' paradas';
  end if;

  -- cambiar_estado valida que quien llama sea chofer asignado u oficina
  resultado := cambiar_estado(p_servicio_id, 'terminado', nota);
  return resultado;
end $$;

-- ---------- RLS ----------
alter table presupuestos enable row level security;
alter table paradas enable row level security;
create policy pres_rw on presupuestos for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());
create policy par_select on paradas for select using (
  exists (select 1 from servicios s where s.id = paradas.servicio_id)   -- hereda visibilidad de servicios
);
create policy par_write on paradas for all using (es_admin_u_oficina()) with check (es_admin_u_oficina());
-- El chofer solo modifica paradas vía cerrar_recorrido().

-- ---------- Grants (obligatorios desde el 30/10/2026) ----------
grant select, insert, update, delete on presupuestos, paradas to authenticated;
grant all on presupuestos, paradas to service_role;
grant usage, select on sequence presupuestos_numero_seq to authenticated, service_role;

-- ---------- Realtime ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='presupuestos') then
    alter publication supabase_realtime add table presupuestos; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='paradas') then
    alter publication supabase_realtime add table paradas; end if;
end $$;
```

## 4. Presupuestos

### 4.1 Flujo

```
Cotizador o "Nuevo presupuesto"
   → presupuesto en borrador con 1 servicio (consulta)
   → "Agregar ítem" suma otro servicio al mismo presupuesto
   → Generar PDF / Enviar por WhatsApp o mail  → estado 'enviado'
   → "Aceptado"  → resolver cliente → RPC aceptar_presupuesto → servicios en 'aceptado'
   → "Rechazado" → servicios a 'cancelado' con nota
   → vencido automático cuando fecha + validez_dias < hoy y sigue 'enviado'
```

### 4.1.1 Puntos de entrada

| Desde                                                      | Qué hace                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Servicios → pestaña Presupuestos → "Nuevo presupuesto"** | El camino principal para presupuestar desde cero. Abre `/presupuestos/nuevo`.                                        |
| **Ficha de cliente → "Nuevo presupuesto"**                 | Igual, con el cliente ya elegido (`/presupuestos/nuevo?cliente=<id>`). Hoy ese botón lleva al cotizador: se corrige. |
| **Cotizador → "Crear presupuesto"**                        | El atajo rápido: crea el presupuesto con un ítem de traslado ya calculado y abre `/presupuestos/:id`.                |
| **FAB en móvil** (en Servicios, pestaña Presupuestos)      | "Nuevo presupuesto".                                                                                                 |

"Nuevo servicio" deja de ofrecer "Presupuesto" como estado inicial: un presupuesto siempre nace como presupuesto.

### 4.1.2 Pantalla `/presupuestos/nuevo`

Una sola pantalla, de arriba a abajo:

1. **Para** — cliente existente o prospecto (§4.2).
2. **Ítems** — lista vacía con dos botones:
   - **"Agregar ítem"**: despliega inline los campos de `FormularioServicio` (tipo, descripción, fechas, máquina, monto, moneda si es alquiler por período, paradas si es un recorrido, nocturno), sin estado inicial ni choferes: todo ítem nace en `consulta` con `presupuesto_id`. Al confirmar, el ítem queda como una fila resumida (tipo · descripción · monto) con editar y quitar.
   - **"Cotizar un traslado"**: abre el cotizador en modo ítem (`/cotizador?presupuesto=<id>`); al confirmar vuelve con el traslado calculado agregado como ítem.
3. **Totales** por moneda, en vivo.
4. **Validez y condiciones** (con los valores por defecto de Configuración).
5. **Acciones**: "Guardar borrador" y "Guardar y generar PDF". El presupuesto se crea recién al guardar (no quedan borradores vacíos).

En `/presupuestos/:id` están los mismos dos botones para agregar ítems mientras el presupuesto esté en `borrador` o `enviado`. Agregar o quitar un ítem de un presupuesto ya enviado lo deja con un aviso: "Cambiaste el presupuesto después de enviarlo. Generá el PDF de nuevo."

### 4.2 Destinatario

En el formulario, un solo campo **"Para"** con dos modos:

- Buscar un **cliente existente** (buscador por nombre, como en el cotizador).
- **"No es cliente todavía"** → Nombre y apellido o razón social (obligatorio), teléfono, email, CUIT (opcional). Con teléfono se habilita WhatsApp; con email, mail.

El PDF usa los datos del prospecto en el bloque "Para:". El bloqueo actual de "no se genera sin cliente" pasa a "no se genera sin cliente **ni** prospecto".

### 4.3 Aceptar con prospecto

Al tocar "Aceptado" en un presupuesto con prospecto, antes de llamar a la RPC:

1. Buscar coincidencias en `clientes` por CUIT (exacto), teléfono (exacto, normalizado) y nombre (`ilike` sobre palabras).
2. Si hay coincidencias: "¿Es alguno de estos?" con las opciones y "No, crear cliente nuevo".
3. Si se crea: formulario de cliente precargado con los datos del prospecto (con el botón "Buscar en ARCA" si hay CUIT).
4. Con el `cliente_id` resuelto, `aceptar_presupuesto`.

### 4.4 Pantallas

- **Servicios → pestaña Presupuestos** pasa a listar **presupuestos** (no servicios): número, fecha, para (cliente o prospecto con badge "Prospecto"), ítems, total por moneda, estado, vence. Filtro por estado.
- **`/presupuestos/:id`**: encabezado con número, estado y destinatario; lista de ítems (cada uno linkea a su servicio); totales; condiciones y validez editables; acciones Generar PDF, Enviar por WhatsApp, Enviar por mail, Agregar ítem, Aceptado, Rechazado.
- **Cotizador**: "Crear presupuesto" crea presupuesto + servicio y navega a `/presupuestos/:id`.
- **Detalle de servicio**: si tiene `presupuesto_id`, link "Presupuesto #N".
- La tarjeta de presupuesto que hoy vive en el detalle de servicio se mueve a la página del presupuesto.

### 4.5 PDF multilínea

Una fila por servicio del presupuesto (el diseño de Stitch ya contemplaba varias). Si un servicio tiene paradas, el detalle lista el recorrido ("Burzaco → Lanús → Quilmes → Avellaneda"). Totales **agrupados por moneda**: si hay ítems en pesos y en dólares, dos bloques de totales separados, nunca sumados.

## 5. Recorridos

### 5.1 Cargar

En `FormularioServicio` (y en el cotizador), debajo del destino, botón **"+ Agregar parada"**:

- Al tocarlo por primera vez, el campo Destino se convierte en **Parada 1** y aparece **Parada 2**, con el foco ahí.
- Cada parada: dirección (obligatoria), localidad, qué se deja, **"se carga en"** (Origen / Parada anterior), notas.
- Reordenar con flechas ↑ ↓ (sin drag and drop, que en el celu es impreciso); quitar con ×.
- El **km** del servicio es el total del recorrido (lo usa el cotizador).

### 5.2 Ver

- **Detalle**: el recorrido como lista vertical numerada — Origen → 1 → 2 → 3 — con lo que se deja en cada una, y el estado de cada parada una vez cerrado.
- **Lista de servicios**: en vez de "Origen → Destino", muestra "Origen → 3 paradas" con ícono `Route`; al expandir, las paradas.
- **Hoy**: igual que la lista.

### 5.3 Chofer

- La tarjeta muestra el recorrido completo en orden, con lo que se deja en cada parada.
- Al tocar **"Terminé"** en un servicio con paradas: **"¿Hiciste todo el recorrido?"** → **Sí** / **No, llegué hasta…**
- Si es No: lista de las paradas para tocar la última a la que llegó (o "No llegué a ninguna").
- Llama a `cerrar_recorrido(servicio_id, ultima_parada)`. Después sigue a "¿Cobraste?" como siempre.
- Sin paradas, "Terminé" funciona como hoy.

### 5.4 Recorrido incompleto (oficina)

- En el detalle: `Aviso` alerta **"Recorrido incompleto: llegó a 2 de 4 paradas"** con las no realizadas marcadas.
- Acción **"Reprogramar paradas pendientes"**: crea un servicio nuevo para el mismo cliente con las paradas no realizadas, `continuacion_de` apuntando al original, origen = la última parada alcanzada (editable), monto vacío para que se defina, en estado `aceptado`. Navega al nuevo para programarlo.
- El monto del original lo ajusta la oficina si corresponde; el sistema no lo prorratea solo.
- **Hoy**: si hay recorridos incompletos sin reprogramar, un aviso con el conteo.
- Filtro "Recorridos incompletos" en Servicios.

## 6. Moneda

**Alcance confirmado:** en dólares se cotizan **solo los alquileres por período** (día, semana, quincena, mes). Traslados, alquiler por hora, mantenimiento y todo lo demás, siempre en pesos.

**La plataforma tijera se alquila mínimo por un día**, así que siempre es alquiler por período y siempre va en dólares. Se marca con `maquinas.permite_alquiler_hora = false`: en un servicio de alquiler por hora, el selector de máquina no la ofrece. Si se intenta de todos modos, aviso "La tijera se alquila mínimo por día: cargalo como alquiler por período". El flag es editable desde Flota, por si mañana otra máquina tiene la misma regla.

**Supuesto a confirmar:** esos alquileres se **facturan y cobran en pesos** al tipo de cambio que ella fija (el vendedor del día, típicamente). Si alguna vez factura directo en dólares, cambia la sección 6.3.

### 6.1 Cargar

- El selector **Moneda** Pesos / Dólares aparece **solo cuando el tipo es alquiler por período**, con Dólares por defecto. Para cualquier otro tipo no se muestra y el servicio queda en pesos. Si se cambia el tipo de un servicio en dólares a otro tipo, se pasa a pesos usando el equivalente calculado, con aviso.
- En dólares: campo **Monto en U$S** y **Cotización** (default: la última usada; editable siempre). Se muestra el equivalente en pesos debajo, calculado.
- `monto` en pesos se guarda calculado; `monto_moneda` y `cotizacion` guardan el original.

### 6.2 Mostrar

- En listas y detalle: **U$S 1.500** con el equivalente en pesos debajo en gris ("$ 1.875.000 a $ 1.250").
- Cuenta corriente, saldos, Hoy y Caja: siempre en pesos (lo que manda es `monto`).
- PDF de presupuesto: en la moneda original.

### 6.3 Facturar

- En `FormularioFactura`, si algún servicio es en dólares: fila "U$S 1.500 × cotización [1.250] = $ 1.875.000" con la cotización editable. Al guardar, se actualiza `cotizacion` y `monto` del servicio con el valor facturado. Así la factura y la cuenta corriente coinciden.
- La factura se emite en pesos.

### 6.4 Renovar alquiler

La renovación copia `moneda` y `monto_moneda` y **pide la cotización nueva** (el precio en dólares se mantiene, el equivalente en pesos cambia cada mes).

## 7. Pruebas

pgTAP:

- [ ] `aceptar_presupuesto` sin cliente → excepción.
- [ ] `aceptar_presupuesto` pasa todos los servicios del presupuesto a `aceptado` y les asigna el cliente.
- [ ] Presupuesto ya aceptado no se puede aceptar de nuevo.
- [ ] `cerrar_recorrido` sin parámetro → todas `completada`, servicio `terminado`.
- [ ] `cerrar_recorrido` con 2 de 4 → 1-2 `completada`, 3-4 `no_realizada`, nota con "2 de 4".
- [ ] Chofer no asignado llamando `cerrar_recorrido` → excepción (vía `cambiar_estado`).
- [ ] `unique (servicio_id, orden)` impide dos paradas con el mismo orden.
- [ ] Servicio en dólares: la cuenta corriente suma `monto` en pesos, no `monto_moneda`.
- [ ] Un traslado (o cualquier tipo que no sea alquiler por período) con `moneda = 'USD'` → falla por constraint.
- [ ] Alquiler por período en dólares sin cotización → falla por constraint.
- [ ] En alquiler por hora, el selector de máquina no ofrece las que tienen `permite_alquiler_hora = false`.

Integración:

- [ ] Oficina crea presupuesto con prospecto, genera PDF, lo acepta creando cliente → servicios con cliente.
- [ ] Chofer ve las paradas de su servicio y no las de otros.
- [ ] Chofer no puede hacer `update` directo en `paradas`.

E2E:

- [ ] Cargar un recorrido de 3 paradas desde el formulario y verlo en el detalle en orden.
- [ ] Chofer: Terminé → "No, llegué hasta la 2" → detalle muestra el aviso de incompleto → Reprogramar crea el servicio con la parada 3.
- [ ] Presupuesto con un traslado en pesos y un alquiler en dólares → PDF con dos bloques de totales.

## 8. Prompts para `agy`

1. **Migración** (§3), incluyendo la vinculación de los servicios existentes a los presupuestos migrados. Crear y **PARAR** para revisión. Verificar después con `supabase db reset` que las 20 migraciones aplican desde cero.
2. **Presupuestos** (§4): páginas, cotizador, destinatario con prospecto, aceptación con verificación de duplicados, PDF multilínea.
3. **Recorridos** (§5): paradas en el formulario, detalle, listas, pantalla del chofer con `cerrar_recorrido`, reprogramación de pendientes.
4. **Moneda** (§6): formularios, visualización, facturación con cotización, renovación.
5. **Tests** (§7).

El 2 y el 3 son independientes entre sí; el 4 depende de los dos.
