# ELEVAPLUS Gestión — Documento de diseño

> Sistema a medida, un solo cliente (ELEVAPLUS), sin intención de comercializar.
> Objetivo del MVP: **que ningún servicio quede sin cobrar y que la dueña sepa en 10 segundos quién debe qué, desde el celular, sin depender de que haya alguien en la oficina.**

---

## 1. Decisiones tomadas

| Tema | Decisión | Por qué |
|---|---|---|
| Plataforma | **Web app responsive (PWA)** | Choferes marcan estados desde el celu en la calle; la dueña consulta desde cualquier lado. Escritorio obligaría a estar en la PC del galpón, que es lo que se quiere eliminar. |
| Stack | React + TypeScript + Vite (SPA) · **Supabase** (Postgres, Auth, Storage, RLS) · Tailwind + shadcn/ui · deploy estático en Railway | Todo conocido por el desarrollador. Supabase evita escribir un backend para el MVP. Si Fase 2 (ARCA) necesita servidor, se agrega un microservicio Node o Edge Functions. |
| Alquileres | Dos tipos distintos: **alquiler por hora** (la máquina va y vuelve con el chofer) y **alquiler por período** (la máquina queda en el cliente: día/semana/quincena/mes, con renovaciones) | Es la razón por la que en la planilla había una pestaña `Alquiler x m/q/s` separada de `Alquileres`. |
| Precios por cliente | Fuera del MVP. El modelo deja la puerta abierta (`tarifas_cliente`) | Las pestañas de precios Deza no se actualizan hace tiempo; no justifica complejidad inicial. |
| Servicios de inmuebles | **Sí, entra** como módulo chico en Fase 2 (`propiedades` + `vencimientos`) | La dueña quiere ver qué pagó y qué no de casas, galpón y abuelos. Es un tracker de vencimientos, no contabilidad. |
| Facturación | MVP: se sigue facturando a mano en el portal de ARCA; el sistema guarda el número y muestra la lista de "pendientes de facturar". Fase 2: integración por API | Facturación electrónica es un proyecto en sí mismo; no bloquea el valor del MVP. |
| Carga por choferes | **Sí, pero acotada**: el chofer NO escribe texto libre ni precios. Solo toca botones (Iniciar / Terminé / Cobré) y saca fotos. La oficina y la dueña pueden cargar y corregir todo | Resuelve los tres problemas de la app Flutter anterior: escritura ilegible, olvidos, no saber precios. |

### Lecciones de la app Flutter anterior → cómo se resuelven

| Problema detectado | Solución de diseño |
|---|---|
| Escritura ilegible / no se entendía qué quisieron poner | El chofer no escribe. Los servicios los crea la oficina con antelación. El chofer elige de listas, saca foto del remito, y como mucho deja una nota de voz. |
| Se olvidaban de cargar viajes | Los servicios ya existen antes de hacerse (los crea quien atendió la consulta). El chofer ve "Mis servicios de hoy" y solo cambia estados. Para trabajos imprevistos hay un botón "Servicio no planificado" con 3 campos. Al final del día, la dueña ve la lista de "servicios sin cerrar". |
| No sabían los precios | El precio lo define la oficina al presupuestar. El chofer solo registra **cuánto cobró** (si cobró), nunca cuánto vale. |

---

## 2. Roles

| Rol | Quién | Qué puede hacer |
|---|---|---|
| `admin` | La dueña | Todo. Única que puede borrar, editar montos ya cobrados, cambiar parámetros del cotizador, ver reportes de plata. |
| `oficina` | El chico administrativo | Crear/editar clientes y servicios, presupuestar, registrar cobros y cheques, marcar facturado. No borra ni toca parámetros. |
| `chofer` | Los dos choferes | Ver sus servicios asignados, cambiar estado (Iniciar / Terminé), registrar cobro en mano (efectivo/cheque) con foto, crear "servicio no planificado" mínimo. No ve montos de otros servicios ni cuentas corrientes. |

Implementado con Supabase Auth + tabla `perfiles` + **RLS** en todas las tablas.

---

## 3. Ciclo de vida de un servicio

```
consulta → presupuestado → aceptado → programado → en_curso → terminado → cobrado → facturado
                                                                   ↘ cancelado (desde cualquier estado)
```

| Transición | Quién la hace | Dónde |
|---|---|---|
| consulta → presupuestado | oficina/admin | Cotizador → genera PDF → botón "Enviar por WhatsApp / mail" |
| presupuestado → aceptado | oficina/admin | Cuando el cliente confirma |
| aceptado → programado | oficina/admin | Asigna fecha, chofer, vehículo y/o máquina |
| programado → en_curso | **chofer** | Botón "Iniciar" en el celu |
| en_curso → terminado | **chofer** | Botón "Terminé" + foto de remito (opcional) |
| terminado → cobrado | chofer (si cobra en mano) o admin/oficina (transferencias, diferidos) | Registrar cobro |
| cobrado → facturado | oficina/admin | Cargar número de factura (Fase 2: emitir por API) |

**Nota:** `cobrado` es un estado derivado. Un servicio está cobrado cuando la suma de `cobro_aplicaciones` alcanza el monto. Se materializa en la columna `estado` para simplicidad de consulta, pero la verdad está en los cobros.

Cada cambio de estado se guarda en `servicio_eventos` (quién, cuándo, de qué a qué, nota). Es la trazabilidad y el reemplazo de la columna `control aviso`.

---

## 4. Modelo de datos (Postgres / Supabase)

### 4.1 Enums

```sql
create type rol_usuario as enum ('admin', 'oficina', 'chofer');

create type tipo_cliente as enum ('empresa', 'particular', 'municipio');
create type condicion_iva as enum ('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final');
create type condicion_pago as enum ('contado', 'transferencia_diferida', 'cuenta_corriente');

create type tipo_vehiculo as enum ('camion', 'camioneta', 'trailer');
create type estado_vehiculo as enum ('disponible', 'en_servicio', 'taller', 'baja');

create type tipo_maquina as enum ('autoelevador', 'plataforma', 'zorra', 'apilador', 'escalera', 'otro');
create type estado_maquina as enum ('disponible', 'alquilada', 'taller', 'baja');

create type tipo_servicio as enum (
  'traslado',          -- transporte de vehículos/maquinaria/carga con camión o trailer
  'alquiler_hora',     -- máquina + chofer, por horas, vuelve el mismo día
  'alquiler_periodo',  -- máquina queda en el cliente: día/semana/quincena/mes
  'mantenimiento',     -- service o reparación de autoelevador del cliente
  'otro'
);

create type estado_servicio as enum (
  'consulta', 'presupuestado', 'aceptado', 'programado',
  'en_curso', 'terminado', 'cobrado', 'facturado', 'cancelado'
);

create type unidad_alquiler as enum ('dia', 'semana', 'quincena', 'mes');

create type medio_pago as enum ('efectivo', 'transferencia', 'cheque', 'echeq', 'otro');
create type estado_cobro as enum ('pendiente', 'acreditado', 'rechazado');

create type tipo_cheque as enum ('recibido', 'emitido');
create type estado_cheque as enum ('en_cartera', 'depositado', 'acreditado', 'rechazado', 'endosado');

create type tipo_factura as enum ('A', 'B', 'C', 'NC_A', 'NC_B', 'ND_A', 'ND_B');
```

### 4.2 Tablas núcleo (MVP)

```sql
-- Usuarios: extiende auth.users de Supabase
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol rol_usuario not null default 'chofer',
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                    -- razón social o nombre
  tipo tipo_cliente not null default 'empresa',
  cuit text,
  condicion_iva condicion_iva,
  telefono text,
  email text,
  direccion text,
  localidad text,
  condicion_pago condicion_pago not null default 'contado',
  dias_pago int default 0,                 -- para transferencia_diferida / cta cte
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index on clientes (lower(nombre));

-- Flota de transporte (camiones, camionetas, trailers)
create table vehiculos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                    -- "Ford Cargo", "Ranger", "VW 1517"
  tipo tipo_vehiculo not null,
  patente text,
  -- coeficientes del cotizador (vienen de la planilla "Calcular importe viajes")
  coef_precio numeric(6,3) not null default 1,
  coef_carga_menor_50 numeric(6,3) not null default 1,
  coef_carga_mayor_50 numeric(6,3) not null default 1,
  consumo_l_100km numeric(6,2),
  estado estado_vehiculo not null default 'disponible',
  activo boolean not null default true,
  notas text
);

-- Equipos que se alquilan (autoelevadores, plataformas, zorras...)
create table maquinas (
  id uuid primary key default gen_random_uuid(),
  codigo_interno text unique,              -- "AE-01"
  tipo tipo_maquina not null,
  marca text,
  modelo text,
  capacidad text,                          -- "2500 kg", "12 m"
  estado estado_maquina not null default 'disponible',
  activo boolean not null default true,
  notas text
);

create table servicios (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,                    -- correlativo humano (#1042)
  cliente_id uuid references clientes(id),
  tipo tipo_servicio not null,
  estado estado_servicio not null default 'consulta',

  -- qué se hace
  descripcion text,
  origen text,
  destino text,
  carga text,                              -- "autoelevador 2.5t", "caja militar"
  km numeric(8,1),
  ida_y_vuelta boolean default false,

  -- cuándo
  fecha_programada date,
  hora_programada time,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,

  -- con qué y quién
  vehiculo_id uuid references vehiculos(id),
  maquina_id uuid references maquinas(id),
  -- choferes: tabla n:m servicio_choferes (a veces van dos)

  -- plata
  monto numeric(14,2),                     -- neto acordado
  aplica_iva boolean not null default true,
  monto_cobrado numeric(14,2) not null default 0,  -- cache: sum(cobro_aplicaciones)

  -- documentación
  remito text,
  orden_compra text,
  factura_id uuid,                         -- fk a facturas (se agrega abajo)

  -- tercerización
  tercerizado boolean not null default false,
  tercero_nombre text,
  costo_tercero numeric(14,2),

  notas text,
  no_planificado boolean not null default false,  -- lo creó un chofer en la calle
  creado_por uuid references perfiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on servicios (fecha_programada);
create index on servicios (cliente_id);
create index on servicios (estado);

create table servicio_choferes (
  servicio_id uuid references servicios(id) on delete cascade,
  chofer_id uuid references perfiles(id),
  primary key (servicio_id, chofer_id)
);

-- Extensión 1:1 para servicios tipo alquiler_periodo
create table alquileres (
  servicio_id uuid primary key references servicios(id) on delete cascade,
  fecha_desde date not null,
  fecha_hasta date not null,
  unidad unidad_alquiler not null,
  cantidad int not null default 1,
  precio_unidad numeric(14,2) not null,
  renovacion_automatica boolean not null default false,
  alertar_dias_antes int not null default 5,
  renovado_de uuid references servicios(id)  -- cadena de renovaciones
);

-- Trazabilidad de cambios de estado
create table servicio_eventos (
  id bigserial primary key,
  servicio_id uuid references servicios(id) on delete cascade,
  estado_anterior estado_servicio,
  estado_nuevo estado_servicio not null,
  usuario_id uuid references perfiles(id),
  nota text,
  created_at timestamptz not null default now()
);

-- Adjuntos: remitos, fotos de cheques, comprobantes, notas de voz
create table adjuntos (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references servicios(id) on delete cascade,
  cobro_id uuid,                           -- fk a cobros (abajo)
  tipo text not null,                      -- 'remito' | 'cheque' | 'comprobante' | 'foto' | 'audio'
  storage_path text not null,              -- Supabase Storage
  subido_por uuid references perfiles(id),
  created_at timestamptz not null default now()
);
```

### 4.3 Cobros y tesorería

```sql
-- Un cobro es plata que entra. Puede aplicarse a uno o varios servicios (y parcialmente).
create table cobros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  fecha date not null default current_date,        -- cuándo se registró / recibió
  fecha_acreditacion date,                          -- cuándo la plata está disponible (diferidos, cheques)
  monto numeric(14,2) not null,
  medio medio_pago not null,
  estado estado_cobro not null default 'pendiente',
  referencia text,                                  -- nro de operación, banco, etc.
  cheque_id uuid,                                   -- fk a cheques si medio in (cheque, echeq)
  registrado_por uuid references perfiles(id),
  notas text,
  created_at timestamptz not null default now()
);

create table cobro_aplicaciones (
  cobro_id uuid references cobros(id) on delete cascade,
  servicio_id uuid references servicios(id),
  monto numeric(14,2) not null,
  primary key (cobro_id, servicio_id)
);

create table cheques (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_cheque not null,
  es_echeq boolean not null default false,
  numero text,
  banco text,
  emisor text,                                      -- quién lo firmó
  fecha_emision date,
  fecha_pago date not null,                         -- fecha de cobro
  monto numeric(14,2) not null,
  estado estado_cheque not null default 'en_cartera',
  cliente_id uuid references clientes(id),          -- si es recibido
  notas text,
  created_at timestamptz not null default now()
);
alter table cobros add foreign key (cheque_id) references cheques(id);
alter table adjuntos add foreign key (cobro_id) references cobros(id) on delete cascade;
```

**Cuenta corriente** = vista, no tabla:

```sql
create view cuenta_corriente as
select
  c.id as cliente_id,
  c.nombre,
  coalesce(sum(s.monto) filter (where s.estado not in ('consulta','presupuestado','cancelado')), 0) as total_servicios,
  coalesce(sum(s.monto_cobrado), 0) as total_cobrado,
  coalesce(sum(s.monto) filter (where s.estado not in ('consulta','presupuestado','cancelado')), 0)
    - coalesce(sum(s.monto_cobrado), 0) as saldo
from clientes c
left join servicios s on s.cliente_id = c.id
group by c.id, c.nombre;
```

### 4.4 Facturación (MVP: registro manual)

```sql
create table facturas (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_factura not null,
  punto_venta int,
  numero bigint,
  fecha date not null,
  cliente_id uuid references clientes(id),
  neto numeric(14,2) not null,
  iva numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  cae text,                                         -- Fase 2
  pdf_path text,
  notas text,
  created_at timestamptz not null default now(),
  unique (tipo, punto_venta, numero)
);
alter table servicios add foreign key (factura_id) references facturas(id);
```

### 4.5 Cotizador

```sql
-- Parámetros con historial (cuando sube el gasoil se crea una fila nueva)
create table parametros_cotizador (
  id serial primary key,
  vigente_desde date not null default current_date,
  precio_km numeric(12,2) not null,
  monto_minimo numeric(14,2) not null,
  km_minimo numeric(8,1) not null default 1,
  precio_gasoil numeric(12,2),
  notas text
);
```

Fórmula (versión limpia):

```
kmFacturables = max(km, km_minimo) × (ida_y_vuelta ? factor_ida_vuelta : 1)
base          = kmFacturables × precio_km
coef          = vehiculo.coef_precio × (carga < 50% ? coef_carga_menor_50 : coef_carga_mayor_50)
importe       = max(base × coef, monto_minimo)
```

**Pendiente de verificar:** la planilla original da **$243.054** para Ford Cargo / 30 km / carga <50 % / ida y vuelta, y esa cifra **no se reproduce** con ninguna combinación simple de los coeficientes visibles (la fórmula de arriba da $257.040 con factor 2, o $128.520 sin ida y vuelta). Hay que abrir la fórmula real de la celda F18 y portarla tal cual antes de dar el cotizador por terminado. Mientras tanto se usa la versión limpia, que tiene la ventaja de ser explicable: el cotizador muestra el desglose para que la dueña entienda de dónde sale el número y pueda pisarlo a mano.

### 4.6 Fase 2 — tablas adicionales

```sql
-- Gastos generales, gasoil, reparaciones
create table gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  categoria text not null,                          -- 'gasoil' | 'reparacion' | 'seguro' | 'impuesto' | 'sueldo' | 'otro'
  descripcion text,
  monto numeric(14,2) not null,
  medio medio_pago,
  proveedor text,
  vehiculo_id uuid references vehiculos(id),
  maquina_id uuid references maquinas(id),
  cheque_id uuid references cheques(id),            -- si se pagó con cheque emitido
  comprobante_path text,
  created_at timestamptz not null default now()
);

-- Servicios de inmuebles (casa, galpón, abuelos)
create table propiedades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                             -- "Galpón Matienzo 34"
  direccion text
);
create table servicios_inmueble (
  id uuid primary key default gen_random_uuid(),
  propiedad_id uuid references propiedades(id),
  tipo text not null,                               -- 'luz' | 'gas' | 'agua' | 'abl' | 'internet' | 'otro'
  proveedor text,
  numero_cliente text,
  periodicidad text not null default 'mensual'
);
create table vencimientos_inmueble (
  id uuid primary key default gen_random_uuid(),
  servicio_inmueble_id uuid references servicios_inmueble(id),
  periodo text not null,                            -- '2026-09'
  fecha_vencimiento date not null,
  monto numeric(14,2),
  pagado boolean not null default false,
  fecha_pago date,
  comprobante_path text
);

-- Precios negociados por cliente (opcional)
create table tarifas_cliente (
  cliente_id uuid references clientes(id),
  tipo tipo_servicio not null,
  descripcion text,
  precio numeric(14,2),
  coeficiente numeric(6,3),
  vigente_desde date not null default current_date,
  primary key (cliente_id, tipo, vigente_desde)
);
```

### 4.7 Fase 3 — gente y flota

```sql
create table novedades_empleado (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references perfiles(id),
  fecha date not null,
  tipo text not null,                               -- 'ausente' | 'medico' | 'vacaciones' | 'adelanto' | 'franco'
  monto numeric(14,2),                              -- para adelantos
  notas text
);

create table eventos_flota (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid references vehiculos(id),
  maquina_id uuid references maquinas(id),
  fecha date not null,
  tipo text not null,                               -- 'taller' | 'service' | 'vtv' | 'seguro' | 'reparacion'
  descripcion text,
  costo numeric(14,2),
  proximo_vencimiento date,                         -- para alertas
  gasto_id uuid references gastos(id)
);
```

### 4.8 RLS (esquema)

- `admin` y `oficina`: acceso total de lectura; `oficina` no puede `delete` ni tocar `parametros_cotizador`.
- `chofer`: `select` en `servicios` solo donde exista fila en `servicio_choferes` con su id **o** `no_planificado = true and creado_por = auth.uid()`. `update` solo sobre `estado`, `fecha_inicio`, `fecha_fin`. `insert` en `cobros`/`cobro_aplicaciones`/`adjuntos` solo para sus servicios. Sin acceso a `cuenta_corriente`, `facturas`, `cheques` (excepto insert del que recibe en mano), `gastos`.
- Los cambios de `estado` en `servicios` se hacen vía **función RPC** `cambiar_estado(servicio_id, nuevo_estado, nota)` que valida la transición y escribe en `servicio_eventos`. No se permite `update` directo de `estado`.

---

## 5. Pantallas del MVP

### Admin / Oficina (desktop-first, funciona en celu)

1. **Hoy** — dashboard: servicios del día por estado, "sin cerrar" de días anteriores, cobros pendientes de acreditar esta semana, cheques que vencen, alquileres a renovar, saldo total a cobrar.
2. **Servicios** — tabla con filtros (estado, cliente, chofer, fecha). Crear/editar. Vista detalle con timeline de eventos y adjuntos.
3. **Cotizador** — formulario (cliente, tipo, km, vehículo, carga, ida/vuelta) → desglose → botón "Crear presupuesto" (crea servicio en `presupuestado`) → PDF → compartir por WhatsApp (`wa.me` con texto + link al PDF en Storage) o mail.
4. **Clientes** — lista con saldo. Detalle = ficha + cuenta corriente (servicios y cobros intercalados, saldo acumulado) + botón "Registrar cobro".
5. **Cobros** — lista, alta con aplicación a servicios (multi-select con montos), cheques recibidos con estado y fecha de pago.
6. **Flota** — vehículos y máquinas con estado. Cambiar a "taller".
7. **Alquileres** — calendario/lista de máquinas alquiladas, fechas, alertas de renovación, botón "Renovar" (crea nuevo servicio encadenado).
8. **Facturación** — lista "terminados/cobrados sin factura" para batch en ARCA; cargar número.
9. **Configuración** — parámetros del cotizador, coeficientes por vehículo, usuarios.

### Chofer (mobile-only, 3 pantallas)

1. **Mis servicios de hoy** — tarjetas grandes: cliente, origen → destino, carga, hora. Botón **Iniciar**.
2. **Servicio en curso** — botón **Terminé** (pide foto de remito opcional) → pregunta **¿Cobraste?** → No / Efectivo (monto) / Cheque (monto + foto) → listo.
3. **Servicio no planificado** — cliente (buscador o "nuevo: nombre"), tipo (4 botones), foto, nota de voz opcional. Se crea en `terminado` con `monto = null` y `no_planificado = true`; la oficina lo completa.

Sin texto libre obligatorio en ningún lado. Sin precios visibles.

---

## 6. Importación desde la planilla

Fuente: `Base de datos Principal` (Google Sheets).

| Pestaña | Destino | Notas |
|---|---|---|
| `Clientes`, `Correos Clientes` | `clientes` | Normalizar nombres (`Huma`, `huma`, `Huma SA` → uno). Revisión manual de ~50-100 nombres, se hace una vez. |
| `Viajes` | `servicios` tipo `traslado` | Mapeo: FECHA→fecha_programada, TRASLADO→descripcion, CARGA→carga, REMITO, O/C→orden_compra, CAMION→vehiculo_id (por nombre), CHOFER→servicio_choferes, MONTO→monto, ESTADO Pago/Debe→estado cobrado/terminado, METODO DE PAGO→cobro, FACTURA→facturas. **Filas "Taller" / "ausente"** → no son servicios: van a `eventos_flota` / `novedades_empleado` en Fase 3 o se descartan. |
| `Alquileres`, `Alquiler x m/q/s`, `Renovaciones` | `servicios` + `alquileres` | Ver estructura real antes de mapear. |
| `Cheques`, `Chequera Propia` | `cheques` | Recibidos / emitidos. |
| `Cuentas Corrientes`, `Detalle <cliente>` | **No se importan** | La cuenta corriente se deriva de servicios y cobros. Sirven para **validar** que los saldos importados cuadren. |
| Resto | Fase 2/3 o descartar | `Gastos`, `Gasoil`, `Sueldos`, `Iva *`, `Plan *`, etc. |

**Recomendación:** importar los últimos 24 meses de `Viajes` completos; lo anterior a 2024 solo si la dueña lo pide. Menos ruido, menos nombres viejos que limpiar, y el sistema arranca con historia relevante.

---

## 7. Roadmap

### Fase 1 — MVP (cobranza y control)
- Auth + roles + RLS
- Clientes, Servicios (todos los tipos), Alquileres, Flota
- Cotizador con PDF y compartir por WhatsApp/mail
- Cobros + aplicaciones + cheques recibidos
- Cuenta corriente por cliente
- App chofer (3 pantallas) + PWA instalable
- Dashboard "Hoy"
- Importación de Clientes, Viajes (24 meses), Alquileres, Cheques
- Registro manual de facturas

**Criterio de listo:** la dueña deja de abrir la planilla `Viajes` y la de `Cuentas Corrientes`.

### Fase 2 — Plata
- **Estado:** Implementada (facturación electrónica, caja, agenda, cheques), pendiente de trámites ARCA para pasar a producción.
- Facturación electrónica ARCA por API (Afip SDK) — factura A/B, NC, ND, CAE, PDF con QR, lotes nocturnos y mail automático por Resend.
- Gastos, gasoil, reparaciones, cuentas y movimientos de caja (empresa y personal).
- Cheques recibidos y propios: ciclo completo (cartera, depósito, acreditación, endoso, descuento y débito).
- Agenda de vencimientos recurrentes y proyección de caja día a día.
- Sincronización unidireccional con Google Calendar vía worker.
- Reporte mensual: facturado, cobrado, pendiente, gastos, resultado.
- Exportación para el contador (IVA ventas/compras).

### Fase 3 — Gente y flota
- Novedades de empleados (ausencias, vacaciones, adelantos)
- Eventos de flota con alertas (VTV, seguro, service programado de máquinas)
- Tercerizados como proveedores con su propia cuenta

### Fase 4 — Automatizar
- WhatsApp Business API: recibir consulta → crear `consulta` automáticamente; avisar al cliente cuando el chofer marca "Iniciar" y "Terminé"
- Recordatorios de cobro automáticos a X días
- Alertas push a la dueña: servicio sin cerrar, cheque que vence, alquiler a renovar
- Dashboard de indicadores (servicios/semana, ticket promedio, % cobrado en término)

---

## 8. Estructura de proyecto sugerida

```
elevaplus-gestion/
├── supabase/
│   ├── migrations/          # SQL de este documento, en orden
│   ├── seed.sql             # vehículos, máquinas, parámetros iniciales
│   └── functions/           # Edge Functions (Fase 2: ARCA)
├── scripts/
│   └── importar-planilla/   # scripts de importación (Node o Python)
├── src/
│   ├── app/                 # rutas (TanStack Router o React Router)
│   ├── features/
│   │   ├── servicios/
│   │   ├── clientes/
│   │   ├── cobros/
│   │   ├── cotizador/
│   │   ├── flota/
│   │   ├── alquileres/
│   │   └── chofer/          # UI mobile del chofer
│   ├── components/ui/       # shadcn
│   ├── lib/supabase.ts
│   └── lib/cotizador.ts     # fórmula pura, testeada
├── docs/
│   └── DISEÑO.md            # este documento
└── package.json
```

---

## 9. Riesgos y cómo mitigarlos

| Riesgo | Mitigación |
|---|---|
| La dueña no adopta y sigue con la planilla | Importar historia real desde el día uno. Que la primera semana la use en paralelo y el sistema le muestre algo que la planilla no puede (saldo por cliente al instante). |
| Choferes no lo usan | Solo 3 pantallas, botones grandes, cero texto. Y la oficina puede cargar todo igual: el chofer es un acelerador, no una dependencia. |
| Scope creep (48 pestañas tientan) | El MVP tiene un criterio de listo escrito. Lo que no está en Fase 1 no se toca hasta que la dueña use lo de Fase 1. |
| Facturación ARCA se complica | Está aislada en Fase 2. El MVP funciona con facturación manual como hoy. |
| Datos sucios de la planilla | Importación de 24 meses, normalización de clientes con revisión manual, `Cuentas Corrientes` como validación. |
