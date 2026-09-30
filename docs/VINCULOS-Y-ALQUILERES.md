# Servicios vinculados, traslados de máquinas y datos de alquileres

> Surge del uso real (sep 2026). Encabezado de cada prompt: "Leé `AGENTS.md`, `docs/DESIGN.md`, `docs/DISEÑO.md` y `docs/VINCULOS-Y-ALQUILERES.md`. Estamos en `main`."
> Reglas de siempre: operaciones de varios pasos como RPC atómicas; relaciones explícitas en todo `select` (esto agrega otra autorreferencia en `servicios`); migración sin comentarios de revisión, mostrarla y **parar**; todas las suites; `git add -N . && git diff > revision.patch`; **no commitear hasta confirmación**.

---

## 1. Qué resuelve

| Reportado                                                                                | Solución                                                                                                                                                             |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vincular servicios (ej.: el traslado de una máquina propia que fue a hacer una descarga) | Un servicio puede tener servicios vinculados                                                                                                                         |
| "Incluye traslado" en alquileres                                                         | Sección **Traslado de la máquina** en el alquiler: no hace falta / incluido en el precio / se cobra aparte, creando el traslado ahí mismo o vinculando uno existente |
| Falta la dirección en los alquileres                                                     | `direccion_trabajo` y `localidad_trabajo`                                                                                                                            |
| Falta qué se va a hacer con la máquina                                                   | `trabajo_a_realizar`                                                                                                                                                 |
| El retiro de la máquina no es un servicio pero hay que registrarlo                       | **Tareas** (opcional, §7)                                                                                                                                            |

## 2. Decisiones

| Tema                 | Decisión                                                                                                                                | Por qué                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vínculo              | `servicios.vinculado_a` → el servicio principal. **Un solo nivel**: un vinculado no puede tener vinculados.                             | Alcanza para "este traslado es de este alquiler" sin armar un grafo.                                                                                                                                                  |
| Rol del vínculo      | `rol_vinculo`: `traslado_maquina` o `relacionado`                                                                                       | El traslado de la máquina tiene reglas propias; "relacionado" cubre el resto.                                                                                                                                         |
| Traslado incluido    | El traslado vinculado queda con **monto 0** y `no_facturable = true`                                                                    | Sigue siendo un viaje para el chofer y el camión, pero no se cobra ni se factura aparte. Con monto 0, al terminarlo el trigger existente lo pasa solo a cobrado (0 ≥ 0) y no queda "pendiente de cobro" para siempre. |
| Traslado aparte      | Monto propio, se cobra y se factura normalmente                                                                                         | Facturación ya agrupa varios servicios del mismo cliente en una factura.                                                                                                                                              |
| Alquiler por hora    | El traslado se crea **ida y vuelta** por defecto                                                                                        | La máquina va y vuelve el mismo día.                                                                                                                                                                                  |
| Alquiler por período | Solo traslado de **ida**; el retiro es una **tarea** (§7), no un servicio                                                               | Confirmado por la dueña.                                                                                                                                                                                              |
| Dirección y trabajo  | Columnas propias, no `destino` ni `descripcion`                                                                                         | `destino` es de traslados; `descripcion` es comercial (factura, presupuesto). El trabajo a realizar es operativo, para el chofer.                                                                                     |
| Presupuestos         | Fuera de alcance: el traslado se sigue cotizando como ítem aparte o como texto "incluye traslado". La vinculación se hace al programar. | Evita complicar `crear_presupuesto` antes de ver cómo se usa.                                                                                                                                                         |

## 3. Modelo de datos

```sql
-- Migración (próximo número libre)

create type rol_vinculo as enum ('traslado_maquina', 'relacionado');

alter table servicios
  add column vinculado_a uuid references servicios(id),
  add column rol_vinculo rol_vinculo,
  add column traslado_incluido boolean not null default false,
  add column direccion_trabajo text,
  add column localidad_trabajo text,
  add column trabajo_a_realizar text;

alter table servicios add constraint vinculo_coherente check (
  (vinculado_a is null and rol_vinculo is null and not traslado_incluido)
  or (vinculado_a is not null and rol_vinculo is not null and vinculado_a <> id)
);
alter table servicios add constraint traslado_incluido_solo_traslados
  check (not traslado_incluido or (tipo = 'traslado' and rol_vinculo = 'traslado_maquina'));
alter table servicios add constraint traslado_incluido_sin_monto
  check (not traslado_incluido or (coalesce(monto, 0) = 0 and no_facturable));

create index servicios_vinculado_idx on servicios (vinculado_a);
-- Un solo nivel: el principal no puede estar vinculado a otro. Se valida en las RPC
-- (un check no puede mirar otra fila).
```

### RPC (todas `security definer`, admin u oficina, `revoke` de `public`/`anon`, `grant` a `authenticated` y `service_role`)

**`crear_traslado_vinculado(p_servicio_id uuid, p_datos jsonb, p_incluido boolean, p_choferes uuid[] default null) returns servicios`**
Crea un traslado vinculado al servicio principal, en una transacción. Precarga desde el principal: cliente, fecha, destino = `direccion_trabajo` + `localidad_trabajo`, `ida_y_vuelta = true` si el principal es alquiler por hora, `maquina_id`. `p_datos` puede pisar cualquiera (origen, hora, vehículo, monto si no es incluido). Si `p_incluido`: monto 0, `no_facturable = true`, `traslado_incluido = true`. Si vienen `p_choferes` y fecha, llama a `programar_servicio` (que manda los avisos a los choferes). Valida: el principal existe, no está vinculado a otro (un nivel), y no es un traslado de máquina.

**`vincular_servicio(p_servicio_id uuid, p_principal_id uuid, p_rol rol_vinculo, p_incluido boolean default false) returns servicios`**
Vincula uno existente. Valida: ninguno de los dos está vinculado a otro; el que se vincula no tiene vinculados propios; si `p_incluido`, el servicio es un traslado que no está cobrado ni facturado, y le pone monto 0 y `no_facturable`. Con `for update` sobre ambos.

**`desvincular_servicio(p_servicio_id uuid) returns servicios`**
Quita el vínculo. Si era un traslado incluido, queda con monto 0 y `no_facturable`: la interfaz avisa "Cargale un precio si ahora se cobra aparte". No se permite si el traslado incluido ya está cobrado o facturado.

## 4. Formulario de alquiler (por hora y por período)

Nuevos campos, en este orden, debajo de la máquina:

1. **Dirección** y **Localidad** (dónde va la máquina). Obligatoria la dirección.
2. **Trabajo a realizar**: chips rápidos — Descarga · Carga · Movimiento de máquinas · Estiba · Otro — más un campo de texto que se completa con el chip y se puede editar. Ej.: "Descarga de contenedor 40'".
3. **Traslado de la máquina** (`Opcion` de tres): **No hace falta** · **Incluido en el precio** · **Se cobra aparte**. Si se elige alguno de los dos últimos:
   - **"Crear el traslado ahora"** (por defecto): despliega inline origen (por defecto el galpón, configurable en Empresa), hora, vehículo, choferes y — solo si se cobra aparte — precio. El destino y la fecha vienen del alquiler. En alquiler por hora dice "Ida y vuelta".
   - **"Vincular uno ya cargado"**: lista de traslados del mismo cliente (o sin cliente) con fecha ±3 días del alquiler, que no estén vinculados ni facturados. Uno por fila: fecha · hora · origen → destino · chofer.
   - Sin modales: todo inline.

Al guardar: el alquiler se crea como siempre, y después `crear_traslado_vinculado` o `vincular_servicio`. Si esa segunda llamada falla, navegar al detalle del alquiler con el aviso "El alquiler quedó creado pero no se pudo cargar el traslado: <motivo>", como en los demás casos.

En **mantenimiento** también se muestran Dirección y Trabajo a realizar (sin la sección de traslado).

## 5. Dónde se ve

- **Detalle del principal**: tarjeta **"Servicios vinculados"** con cada uno (tipo, fecha, estado, "Incluido" o su monto), link, y acciones: Crear traslado, Vincular existente, Desvincular (con confirmación inline).
- **Detalle del vinculado**: "Traslado de la máquina para el alquiler #N" con link, y la etiqueta **"Incluido en el alquiler"** si corresponde.
- **Lista de servicios y Hoy**: el traslado muestra "→ alquiler #N"; el principal, un ícono `Link` con la cantidad de vinculados.
- **Chofer**: la tarjeta del traslado muestra la **dirección**, el **trabajo a realizar** del alquiler y "Traslado de la máquina AE-01". Sin montos, como siempre.
- **Facturación**: en Pendientes, un traslado que se cobra aparte aparece junto a su alquiler (mismo cliente); un traslado incluido no aparece.
- **PDF de presupuesto y factura**: si el alquiler tiene un traslado incluido, su descripción dice "(incluye traslado)".

## 6. Casos que la base tiene que cuidar

- Un traslado incluido nunca tiene monto > 0 ni se factura (constraint).
- No hay cadenas: un vinculado no tiene vinculados (RPC).
- Cancelar el principal **no** cancela los vinculados solo: la interfaz pregunta "¿Cancelar también el traslado vinculado?".
- Renovar un alquiler no copia el traslado (la máquina ya está allá).

## 7. Tareas (opcional) — el retiro y "qué se hizo ese día"

Un registro operativo que **no es un servicio**: sin cliente que facture, sin monto, sin estados de cobro.

```sql
create type tipo_tarea as enum ('retiro_maquina', 'entrega', 'otra');
create type estado_tarea as enum ('pendiente', 'hecha', 'cancelada');

create table tareas (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_tarea not null,
  fecha date not null,
  hora time,
  servicio_id uuid references servicios(id),      -- el alquiler del que sale
  vehiculo_id uuid references vehiculos(id),
  descripcion text,
  estado estado_tarea not null default 'pendiente',
  hecha_at timestamptz,
  hecha_por uuid references perfiles(id),
  creado_por uuid references perfiles(id),
  created_at timestamptz not null default now()
);
create table tarea_choferes (
  tarea_id uuid references tareas(id) on delete cascade,
  chofer_id uuid references perfiles(id),
  primary key (tarea_id, chofer_id)
);
-- RLS: admin y oficina todo; el chofer ve las suyas y solo puede marcarlas hechas vía RPC.
-- Grants, realtime.
```

- **Al cargar un alquiler por período**: checkbox "Programar el retiro al terminar" → crea la tarea `retiro_maquina` con fecha = `fecha_hasta`. Al **renovar**, la tarea se mueve a la nueva fecha; al marcar el alquiler terminado antes de tiempo, la interfaz ofrece moverla a hoy.
- **Chofer**: las tareas aparecen en Hoy y Mi semana, con otro formato ("Retiro de AE-01 en Almatec"), y un botón **"Hecho"** (RPC `marcar_tarea_hecha`).
- **Avisos**: asignar una tarea a un chofer inserta en `notificaciones` como los viajes.
- **Agenda**: las tareas pendientes entran en la vista `agenda` como ítems `info`.
- **"Qué se hizo ese día"**: en Hoy de la oficina, una sección "Hoy se hizo" con servicios terminados y tareas hechas del día, por chofer.

## 8. Pruebas

pgTAP: constraints de vínculo y de traslado incluido; `crear_traslado_vinculado` incluido deja monto 0 y al terminarlo pasa a cobrado; `vincular_servicio` rechaza cadenas y un traslado ya facturado; `desvincular_servicio` rechaza uno incluido ya cobrado; un chofer no puede llamar a ninguna. Si se hace §7: `marcar_tarea_hecha` solo para el chofer asignado.

Integración: el chofer ve el traslado vinculado con dirección y trabajo, sin montos; un traslado incluido no aparece en pendientes de facturar.

E2E: cargar un alquiler por hora con traslado incluido creado ahí mismo con chofer → el chofer lo ve y recibe el aviso → terminarlo lo deja cobrado y sin facturar; cargar un alquiler con traslado que se cobra aparte → facturar los dos en la misma factura.

## 9. Prompts

1. **Migración** (§3): columnas, constraints y las tres RPC, con sus tests de pgTAP. Mostrarla y parar.
2. **Formulario de alquiler** (§4).
3. **Visualización** (§5) en detalle, listas, Hoy, chofer, facturación y PDFs.
4. **Tareas** (§7), opcional, con su propia migración.
