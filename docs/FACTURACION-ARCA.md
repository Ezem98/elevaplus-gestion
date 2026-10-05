# Facturación electrónica ARCA — Diseño y plan de implementación

> Rama: `facturacion-arca`. Ambiente de prueba: proyecto Supabase `elevaplus-gestion-staging` + ARCA homologación.
> No se mergea a `main` hasta que las pruebas del §7 pasen completas.

---

## 1. Objetivo

Que la mayor parte de las facturas de ELEVAPLUS se emitan solas, todas las noches, según la política de cada cliente, con el PDF y el mail al cliente enviados automáticamente. La dueña factura a mano solo lo que el sistema descarta o lo que ella decide mantener manual.

## 2. Decisiones

| Tema                      | Decisión                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Proveedor ARCA            | **Afip SDK** (REST). Maneja WSAA/WSFEv1, cambios normativos, homologación y producción.                                                                          |
| PDF                       | Generado por nosotros con `@react-pdf/renderer`, mismo estilo que el presupuesto, con el QR obligatorio.                                                         |
| Dónde corre               | **Worker Node en Railway** (`worker/` en el mismo repo). Cron a las 21:30 (America/Argentina/Buenos_Aires) + endpoints HTTP para emisión a demanda desde la app. |
| Mail                      | **Resend**, remitente `facturacion@eleva-plus.com.ar` (SPF + DKIM en Cloudflare), reply-to al Gmail de la empresa.                                               |
| Política                  | Por cliente: modo (por servicio · diaria · quincenal · mensual · manual), automática sí/no, enviar mail sí/no. **Default: manual y no automática.**              |
| Punto de venta            | Nuevo **0003 tipo web service**, exclusivo de la app. El 0002 sigue siendo del portal.                                                                           |
| Ambientes                 | `empresa.arca_ambiente = 'homologacion'                                                                                                                          | 'produccion'`. Staging siempre en homologación. |
| Seguridad                 | Idempotencia con consulta del último comprobante autorizado; tope diario de cantidad y monto; log completo de cada llamada.                                      |
| Fuente de verdad Afip SDK | Siempre la documentación en Markdown (`docs.afipsdk.com/llms.txt` + páginas `.md`). Nunca la memoria del agente: los códigos y nombres de métodos cambian.       |

## 3. Modelo de datos (migraciones nuevas)

```sql
-- 20260911000010_facturacion_arca.sql

create type modo_facturacion as enum ('por_servicio', 'diaria', 'quincenal', 'mensual', 'manual');
create type estado_emision as enum ('manual', 'borrador', 'emitiendo', 'emitida', 'error');
create type ambiente_arca as enum ('homologacion', 'produccion');

-- Política por cliente
alter table clientes
  add column facturacion_modo modo_facturacion not null default 'manual',
  add column facturacion_automatica boolean not null default false,
  add column enviar_factura_email boolean not null default true,
  add column email_facturacion text;            -- si difiere del email general

-- Parámetros de emisión
alter table empresa
  add column punto_venta_ws int not null default 3,
  add column arca_ambiente ambiente_arca not null default 'homologacion',
  add column tope_diario_facturas int not null default 20,
  add column tope_diario_monto numeric(14,2) not null default 20000000,
  add column cbu text,
  add column alias_cbu text,
  add column banco text,
  add column email_facturacion text default 'facturacion@eleva-plus.com.ar',
  add column texto_pie_factura text;

-- Facturas: datos de emisión electrónica
alter table facturas
  add column estado_emision estado_emision not null default 'manual',
  add column cae_vencimiento date,
  add column concepto int default 2,            -- 2 = servicios
  add column periodo_desde date,
  add column periodo_hasta date,
  add column fecha_vto_pago date,
  add column error_emision text,
  add column emitida_at timestamptz,
  add column enviada_email_at timestamptz,
  add column email_destino text,
  add column lote_id uuid;

-- Corridas del proceso nocturno
create table lotes_emision (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  iniciado_at timestamptz not null default now(),
  finalizado_at timestamptz,
  disparado_por text not null default 'cron',   -- 'cron' | 'manual:<usuario_id>'
  facturas_emitidas int not null default 0,
  monto_total numeric(14,2) not null default 0,
  descartados jsonb not null default '[]',      -- [{cliente_id, cliente, motivo, servicios:[...]}]
  error text
);
alter table facturas add foreign key (lote_id) references lotes_emision(id);

-- Log de cada llamada a ARCA
create table arca_log (
  id bigserial primary key,
  factura_id uuid references facturas(id),
  accion text not null,                          -- 'ultimo_comprobante' | 'crear_comprobante' | 'consultar'
  ambiente ambiente_arca not null,
  request jsonb,
  response jsonb,
  exito boolean not null,
  duracion_ms int,
  created_at timestamptz not null default now()
);

-- RLS
alter table lotes_emision enable row level security;
alter table arca_log enable row level security;
create policy lotes_select on lotes_emision for select using (es_admin_u_oficina());
create policy arca_log_select on arca_log for select using (es_admin());
-- El worker escribe con service role; nadie escribe desde el front.

-- Realtime
alter publication supabase_realtime add table lotes_emision;
```

## 4. Worker (`worker/`)

Node 20 + TypeScript. Dependencias: `express`, `node-cron`, `@supabase/supabase-js`, `@afipsdk/afip.js`, `@react-pdf/renderer`, `qrcode`, `resend`, `zod`, `pino`.

```
worker/
├── src/
│   ├── index.ts              # express + cron
│   ├── config.ts             # env vars validadas con zod
│   ├── supabase.ts           # cliente con service role
│   ├── arca/
│   │   ├── cliente.ts        # wrapper de Afip SDK: ultimoComprobante, crearComprobante
│   │   ├── mapear.ts         # servicios+cliente → payload WSFEv1 (puro, testeado)
│   │   └── codigos.ts        # tipos de comprobante, doc, condición IVA receptor
│   ├── emision/
│   │   ├── seleccionar.ts    # qué facturar hoy según política (puro, testeado)
│   │   ├── emitir.ts         # emitir una factura: borrador → ARCA → PDF → storage → facturado
│   │   ├── lote.ts           # corrida nocturna completa
│   │   └── topes.ts
│   ├── pdf/
│   │   ├── FacturaPDF.tsx
│   │   └── qr.ts             # URL del QR de ARCA
│   ├── mail/
│   │   ├── enviar.ts
│   │   └── plantillas.ts
│   └── http/
│       ├── auth.ts           # valida JWT de Supabase del usuario que llama
│       └── rutas.ts          # POST /emitir, POST /lote, POST /reenviar-mail, GET /health
├── package.json
├── tsconfig.json
└── Dockerfile
```

### 4.1 Variables de entorno del worker

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AFIPSDK_ACCESS_TOKEN= # obligatorio en producción; en homologación opcional (Afip SDK provee token dev)
ARCA_CUIT=            # obligatorio en producción (debe coincidir con empresa.cuit); en homologación usa 20409378472 por defecto
ARCA_CERT=            # contenido del .crt (base64 o PEM) — obligatorio en producción
ARCA_KEY=             # contenido del .key (base64 o PEM) — obligatorio en producción
RESEND_API_KEY=
WORKER_SECRET=        # para /lote manual desde la app
TZ=America/Argentina/Buenos_Aires
PORT=
```

> **Validación estricta en producción:** Si `empresa.arca_ambiente = 'produccion'`, las variables `ARCA_CUIT`, `ARCA_CERT`, `ARCA_KEY` y `AFIPSDK_ACCESS_TOKEN` son estrictamente obligatorias y no tienen defaults. Si falta alguna, el worker aborta la emisión indicando qué variables faltan. Además, se valida que `empresa.cuit` (solo dígitos) coincida exactamente con `ARCA_CUIT` configurado antes de llamar a ARCA.


### 4.2 Selección (`seleccionar.ts`)

Entrada: fecha de hoy, lista de clientes con política, servicios facturables (`estado in (terminado, cobrado)`, `factura_id is null`, `no_facturable = false`, `monto is not null`, `cliente_id is not null`).

Reglas:

- `manual` o `facturacion_automatica = false` → nunca.
- `por_servicio` → cada servicio es una factura.
- `diaria` → todos los servicios del cliente con `fecha_fin::date <= hoy` en una factura.
- `quincenal` → solo si hoy es 1 o 16; toma servicios con `fecha_fin` en la quincena anterior (1–15 o 16–fin de mes).
- `mensual` → solo si hoy es 1; toma servicios del mes anterior.

Descarta con motivo: cliente RI sin CUIT → `sin_cuit`; sin `condicion_iva` → `sin_condicion_iva`; Factura B a consumidor final con total > tope legal de identificación sin DNI → `requiere_dni`; servicio sin monto → `sin_monto`.

Salida: `{ aEmitir: [{cliente, servicios, tipo, periodo}], descartados: [...] }`.

### 4.3 Emisión (`emitir.ts`) — orden estricto

1. `insert facturas` con `estado_emision = 'borrador'`, `tipo`, `punto_venta = empresa.punto_venta_ws`, `numero = null`, `cliente_id`, `neto`, `iva`, `total`, `periodo_*`, `lote_id`. Vincular servicios (`factura_id`) **ya**, para que otro proceso no los tome.
2. `update estado_emision = 'emitiendo'`.
3. `ultimoComprobante(ptoVta, tipo)` en ARCA → `numero = ultimo + 1`. Log.
4. `crearComprobante(payload)` → CAE, vencimiento. Log.
5. `update facturas set numero, cae, cae_vencimiento, estado_emision = 'emitida', emitida_at`.
6. Por cada servicio: `cambiar_estado(id, 'facturado', 'Factura <formateada> · CAE <cae>')` (el worker llama la RPC con service role; la RPC acepta porque es `security definer`; el evento queda con `usuario_id` null → mostrar "Sistema" en la línea de tiempo).
7. Generar PDF → subir a Storage `facturas/<factura_id>/<tipo>-<pv>-<numero>.pdf` → `pdf_path`.
8. Si corresponde: enviar mail → `enviada_email_at`, `email_destino`.

Ante error en 3 o 4: `estado_emision = 'error'`, `error_emision`, **desvincular servicios** (`factura_id = null`) para que vuelvan a pendientes. Ante error en 7 u 8: la factura queda `emitida` (es válida); el PDF/mail se reintentan con `POST /reenviar-mail`.

**Idempotencia**: si al arrancar hay facturas en `emitiendo` de más de 10 minutos, consultar en ARCA el último comprobante; si su número es `ultimo+1` y coincide el total, recuperar CAE con `consultar(numero)`; si no, marcar `error` y desvincular.

### 4.4 Payload WSFEv1 (`mapear.ts`)

- `CbteTipo`: A = 1, B = 6. `PtoVta`: `empresa.punto_venta_ws`. `Concepto`: 2 (servicios) → requiere `FchServDesde`, `FchServHasta`, `FchVtoPago` (usar `periodo_desde/hasta` o `fecha_fin` del servicio, y vencimiento = fecha + `dias_pago` del cliente, mínimo hoy).
- `DocTipo`: 80 (CUIT) si el cliente tiene CUIT; 99 (sin identificar) para consumidor final por debajo del tope; 96 (DNI) si se cargó.
- `CondicionIVAReceptorId`: RI = 1, exento = 4, consumidor final = 5, monotributo = 6.
- `ImpNeto`, `ImpIVA`, `ImpTotal`; `Iva: [{ Id: 5, BaseImp: neto, Importe: iva }]` (21 %). Si `aplica_iva = false` en todos los servicios de una A → no debería pasar: la selección descarta A con neto sin IVA (`sin_iva_en_a`). En B, el total va con IVA incluido igual.
- `MonId: 'PES'`, `MonCotiz: 1`.
- Los nombres de campos y códigos salen **exclusivamente** de las páginas `factura-a.md` y `factura-b.md` de Afip SDK; la tabla de arriba es orientativa.

### 4.5 QR (`qr.ts`)

JSON `{ ver: 1, fecha, cuit, ptoVta, tipoCmp, nroCmp, importe, moneda: 'PES', ctz: 1, tipoDocRec, nroDocRec, tipoCodAut: 'E', codAut: cae }` → base64 → URL de verificación oficial según `codigo-qr.md` de Afip SDK → `qrcode.toDataURL()` → imagen en el PDF.

### 4.6 PDF (`FacturaPDF.tsx`)

Misma estructura visual que el presupuesto. Encabezado con recuadro de letra (A/B) grande al centro, "Factura" y número `0003-00000042`, fecha, CAE y vencimiento, "Original". Emisor (razón social, CUIT, condición IVA, domicilio, inicio de actividades si está), receptor (razón social, CUIT/DNI, condición IVA, domicilio), período facturado, tabla de servicios (descripción con fecha del servicio, cantidad, precio unitario, importe), totales (A: neto / IVA 21 % / total; B: total con IVA incluido y leyenda), QR abajo a la izquierda, texto de pie configurable, y bloque "Datos para el pago" con CBU, alias y banco. Sin mayúsculas salvo razones sociales. Fuente IBM Plex Sans registrada desde `@fontsource`.

### 4.7 Mail (`plantillas.ts`)

Asunto: `Factura A 0003-00000042 · ELEVAPLUS · $ 456.218`. Cuerpo en texto plano + HTML simple (sin frameworks): saludo, "Te enviamos la factura por los siguientes servicios:" lista con fecha y descripción, total, **datos para pagar** (CBU, alias, banco), "Si ya lo pagaste, ignorá este mensaje", firma con teléfono. Adjunto: el PDF. Reply-to `empresa.email`. Destino: `clientes.email_facturacion ?? clientes.email`.

### 4.8 Endpoints

- `GET /health` → 200.
- `POST /emitir` `{ cliente_id, servicio_ids[] }` — requiere `Authorization: Bearer <JWT del usuario>`; el worker valida el JWT contra Supabase (`auth.getUser`) y exige rol admin u oficina. Emite una factura con esos servicios (misma función que el lote). Responde `{ factura_id, numero, cae }` o `{ error }`.
- `POST /lote` — requiere `WORKER_SECRET`. Dispara la corrida nocturna a demanda (para pruebas y para el botón "Correr ahora" de admin).
- `POST /reenviar-mail` `{ factura_id }` — JWT de usuario. Regenera PDF si falta y reenvía.
- `GET /padron/:cuit` — JWT de usuario (admin u oficina). Consulta el padrón de constancia de inscripción de ARCA y devuelve `{ razon_social, condicion_iva, domicilio, activo }`. Cachear 24 h en memoria por CUIT.

### 4.9 Cron

`30 21 * * *` en `TZ` de Buenos Aires → `correrLote('cron')`. Al terminar, insertar en `lotes_emision` y disparar push a admin/oficina vía la Edge Function existente (`enviar-push`) con el resumen: "Se emitieron N facturas por $ X · M pendientes por revisar". Si `facturas_emitidas = 0` y `descartados = []`, no notificar.

Topes: si `aEmitir.length > empresa.tope_diario_facturas` o la suma supera `tope_diario_monto`, **no emitir nada**, registrar el lote con `error = 'tope_superado'` y notificar. La dueña revisa y corre a mano.

## 5. Cambios en la app

- **Ficha y formulario de cliente**: sección "Facturación": modo (`Selector`), automática (checkbox con caption "El sistema emite solo, todas las noches a las 21:30"), enviar por mail (checkbox), email de facturación (opcional). Si automática y RI sin CUIT → `Aviso` bloqueante.
- **Facturación → Pendientes**: si `empresa.arca_ambiente` está configurado y el worker responde `/health`, el botón "Facturar seleccionados" pasa a ofrecer dos acciones: **"Emitir en ARCA"** (llama `POST /emitir`, muestra progreso "Emitiendo… · Generando PDF… · Enviando mail…", y al terminar el número y CAE) y "Registrar factura del portal" (el flujo manual actual). Mostrar el ambiente como pill: "Homologación" en ámbar, nada en producción.
- **Facturación → Facturas**: columnas CAE y Estado de emisión (chip: Emitida / Error / Manual); acciones "Descargar PDF", "Reenviar mail", "Ver log ARCA" (admin).
- **Facturación → Emisiones automáticas** (pestaña nueva): lista de `lotes_emision` con fecha, cantidad, monto, descartados desplegables con motivo y link al servicio; botón admin "Correr ahora".
- **Configuración → Facturación electrónica**: ambiente (con confirmación al pasar a producción), punto de venta ws, topes, CBU/alias/banco, email remitente, texto de pie.
- **Configuración → Usuarios**: nada.
- **Hoy**: si el último lote tuvo descartados, aviso "N servicios no se pudieron facturar anoche" con link.

## 6. Setup de ambientes

1. `git checkout -b facturacion-arca`.
2. Supabase: proyecto `elevaplus-gestion-staging` (São Paulo). Correr **todas** las migraciones existentes + las nuevas por SQL Editor (no conectar GitHub a staging). Seed + un usuario admin de prueba.
3. `.env.staging` en la app con URL y publishable key de staging. Script `dev:staging` en `package.json`: `vite --mode staging`.
4. Railway: servicio `elevaplus-worker-staging` desde la rama `facturacion-arca`, root `worker/`, con las variables de staging y certificado de **homologación**. (Producción se crea después del merge, desde `main`.)
5. ARCA homologación: Afip SDK provee CUIT y certificado de prueba en modo dev; usar eso hasta tener el certificado real.
6. Resend: verificar dominio `eleva-plus.com.ar` (DNS en Cloudflare). En staging, enviar solo a una lista blanca de mails (variable `MAIL_LISTA_BLANCA`) para no mandarle facturas de prueba a un cliente real.

## 7. Pruebas antes de mergear

- [ ] Factura A a RI con dos servicios → CAE, PDF con QR que escanea y abre la verificación, mail recibido con adjunto.
- [ ] Factura B a consumidor final → total con IVA incluido, sin CUIT.
- [ ] Cliente quincenal: servicios del 1 al 15 → lote del día 16 los toma; los del 16 no.
- [ ] Cliente mensual: lote del 1 toma el mes anterior completo.
- [ ] Cliente manual: nunca aparece en el lote.
- [ ] Cliente RI sin CUIT → descartado con motivo, visible en la app.
- [ ] Matar el worker entre "emitiendo" y "emitida" → al reiniciar recupera o desvincula, nunca duplica.
- [ ] Tope diario superado → no emite, lote con error, push recibido.
- [ ] `/emitir` con JWT de chofer → 403.
- [ ] Nota de crédito manual sobre una factura emitida → los servicios vuelven a pendientes (flujo existente).
- [ ] Log ARCA completo por cada emisión.

## 8. Orden de prompts para `agy`

Cada prompt arranca con este encabezado, textual:

> Leé `AGENTS.md`, `docs/DESIGN.md`, `docs/DISEÑO.md` y `docs/FACTURACION-ARCA.md`. Estamos en la rama `facturacion-arca`. Para todo lo que sea Afip SDK, **no uses memoria**: leé `https://docs.afipsdk.com/llms.txt` y de ahí las páginas que correspondan (Railway, Factura A, Factura B, Código QR, Crear PDF, Errores frecuentes) agregando `.md` a la URL. Usá los nombres de métodos y códigos exactamente como figuran ahí.

Páginas de Afip SDK relevantes por prompt (todas bajo `https://docs.afipsdk.com/`, agregar `.md`):

| Prompt   | Páginas                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2        | `integracion/node.js/railway`, `siguientes-pasos/web-services/factura-electronica`, `.../factura-electronica/factura-a`, `.../factura-b`, `recursos/errores-frecuentes` |
| 3        | `.../factura-electronica/codigo-qr`, `.../factura-electronica/crear-pdf`                                                                                                |
| 4        | `recursos/otros-metodos-utiles` (último comprobante, consultar comprobante)                                                                                             |
| 6        | `siguientes-pasos/web-services/padron-de-constancia-de-inscripcion`, `.../nota-de-credito-a`, `.../nota-de-credito-b`                                                   |
| Trámites | `recursos/tutoriales-pagina-de-arca/*`, `siguientes-pasos/ir-a-produccion`                                                                                              |

1. **Migración + cliente** (§3 y la parte de cliente de §5). Sin `--dangerously-skip-permissions`.
2. **Worker: esqueleto + ARCA en homologación** (§4.1–4.4, `/health`, `/emitir` emitiendo contra Afip SDK dev; tests de `mapear.ts` y `seleccionar.ts`; Dockerfile). Sin cron todavía.
3. **PDF + QR + Storage** (§4.5–4.6).
4. **Lote nocturno + topes + idempotencia + push** (§4.3 recuperación, §4.9).
5. **Mail con Resend** (§4.7, `/reenviar-mail`, lista blanca en staging).
6. **App: Facturación y Configuración** (§5 completo) + **validación de clientes contra el padrón de ARCA**: en el formulario de cliente, al cargar un CUIT, botón "Buscar en ARCA" que llama a un endpoint del worker (`GET /padron/:cuit`, JWT de usuario) que usa el web service de constancia de inscripción y devuelve razón social, condición IVA y domicilio fiscal para precompletar (editable). Si el CUIT no existe o está inactivo, `Aviso` alerta.

## 9. Trámites (sin código)

- Certificado digital de producción en ARCA con la clave fiscal de la titular; autorizar servicio `wsfe` al certificado. Guías con capturas: `docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/` (habilitar administrador de certificados, obtener certificado, autorizar web service) y `docs.afipsdk.com/siguientes-pasos/ir-a-produccion`.
- Punto de venta 0003 tipo web service. Guía: `docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/crear-punto-de-venta`.
- Cuenta Afip SDK (token) y cuenta Resend (API key, dominio verificado).
- Configuración en Railway (producción): variables `ARCA_CUIT`, `ARCA_CERT`, `ARCA_KEY` y `AFIPSDK_ACCESS_TOKEN` obligatorias (el worker bloquea la emisión si falta alguna o si el CUIT no coincide con el de la empresa).
- CBU/alias/banco para el pie de factura y el mail.
- Confirmar con el contador: que la app emita por 0003 y el portal siga en 0002 no le complica los libros (no debería; son puntos de venta distintos del mismo contribuyente).
