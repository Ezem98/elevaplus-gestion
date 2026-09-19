# Fase 5 — Confiabilidad: tests, CI y monitoreo

> Rama: `fase5-confiabilidad`. No toca features: agrega tests, pipeline y monitoreo.
> Encabezado de cada prompt: "Leé `AGENTS.md`, `docs/DESIGN.md`, `docs/DISEÑO.md` y `docs/FASE-5-CONFIABILIDAD.md`. Estamos en la rama `fase5-confiabilidad`."

---

## 1. Por qué

El sistema tiene 77 tests y todos son de funciones puras (cotizador, formato, fechas, facturación). La lógica que maneja **plata, estados y permisos** vive en Postgres y no tiene ninguno. Dos bugs reales lo demostraron:

| Bug | Lo detectó | Debería haberlo detectado |
|---|---|---|
| `p_nuevo_estado` en vez de `p_nuevo` en la RPC de cheques — rompía **todas** las transiciones | Revisión manual del diff | Test de integración con supabase-js |
| BOM UTF-8 en migraciones — la integración de Supabase falló en producción | El deploy fallido | `supabase db reset` en CI |
| Policy `facturas_leer` duplicada | El deploy fallido | `supabase db reset` en CI |

Y hay una lista de verificaciones manuales que se repite en cada fase (cheque rechazado, endoso, cobro parcial, chofer que no ve precios). Eso es exactamente lo que automatiza esta fase.

## 2. Criterio: qué se testea y qué no

Un solo mantenedor, cuatro usuarios. Perseguir cobertura alta es tiempo tirado. **Se testea lo que, si se rompe, cuesta plata o confianza.**

**Sí:**
- Saldos de cuentas y cuenta corriente (toda la aritmética del dinero).
- Transiciones de estado de servicios y cheques, incluidas las prohibidas.
- Triggers: recálculo de cobros, cheque rechazado, estado de máquina.
- RLS por rol: lo que cada uno puede y **no puede** ver o hacer.
- Firmas de las RPC (parámetros exactos).
- Que las migraciones apliquen desde cero, en orden.
- Facturación: numeración, IVA, idempotencia.
- Los tres recorridos completos que hoy se prueban a mano.

**No:**
- Estilos, textos, layout, responsive.
- Formularios de ABM simples (alta de cliente, de vehículo).
- Contenido de PDFs y mails (sí que se generen sin error).
- Cobertura por cobertura. No hay meta de porcentaje.

## 3. La pirámide

```
      ┌─────────────────────────────┐
      │  Smoke E2E (Playwright)     │  3 recorridos · ~2 min
      ├─────────────────────────────┤
      │  Integración (vitest + JS)  │  RLS, RPC, PostgREST · ~30 tests
      ├─────────────────────────────┤
      │  Base de datos (pgTAP)      │  triggers, vistas, constraints · ~40 tests
      ├─────────────────────────────┤
      │  Unitarios (vitest)         │  ya existen: 77
      └─────────────────────────────┘
```

**Reparto estricto para no duplicar:**
- **pgTAP** prueba lo que vive *dentro* de Postgres y no se ve desde afuera: triggers, funciones, vistas, constraints. Con SQL directo, sin PostgREST.
- **vitest + supabase-js** prueba lo que se ve *desde afuera* con el JWT de cada rol: RLS, firmas de RPC, el camino real que usa la app.
- **Playwright** prueba que las piezas juntas hagan lo que el usuario espera.

## 4. Infraestructura de tests

Todo corre sobre **Supabase local** (`supabase start`), el mismo stack en tu PC y en el runner de GitHub Actions. Base efímera, se destruye al terminar. **Nunca** contra producción ni staging.

### 4.1 Archivos nuevos

```
supabase/
├── tests/                          # pgTAP
│   ├── 00-setup.sql                # helpers: crear usuarios de prueba con rol
│   ├── 01-cobros.sql
│   ├── 02-cheques.sql
│   ├── 03-estados.sql
│   ├── 04-saldos.sql
│   ├── 05-agenda-proyeccion.sql
│   └── 06-facturacion.sql
└── seed-test.sql                   # datos base para tests (distinto de seed.sql)
tests/
├── integracion/                    # vitest + supabase-js
│   ├── setup.ts                    # clientes autenticados por rol
│   ├── rls-chofer.test.ts
│   ├── rls-oficina.test.ts
│   ├── rpc-firmas.test.ts
│   └── flujos.test.ts
└── e2e/                            # Playwright
    ├── fixtures.ts
    ├── 01-servicio-completo.spec.ts
    ├── 02-cobro-y-factura.spec.ts
    └── 03-chofer.spec.ts
playwright.config.ts
.github/workflows/ci.yml
.github/workflows/smoke-produccion.yml
```

### 4.2 `seed-test.sql`

Datos mínimos y **deterministas** (ids fijos, no `gen_random_uuid()`), para que los tests puedan referenciarlos:
- 4 usuarios en `auth.users` + `perfiles`: `admin@test`, `oficina@test`, `chofer1@test`, `chofer2@test`, con contraseña conocida.
- 3 clientes: uno RI con CUIT, uno monotributo, uno consumidor final sin CUIT.
- 4 cuentas con saldo inicial conocido (Efectivo 100.000, resto 0).
- 2 vehículos y 2 máquinas.
- Parámetros del cotizador y fila de `empresa`.
- Categorías de movimiento (las del seed normal).

Sin servicios, cobros ni facturas: cada test crea los suyos.

### 4.3 pgTAP — casos

**`01-cobros.sql`**
- Cobro parcial: `monto_cobrado` se actualiza, el servicio sigue `terminado`.
- Cobro completo: pasa a `cobrado` y se registra el evento.
- Segundo cobro que completa: idem.
- Cobro con cheque → rechazar el cheque → el servicio **vuelve a `terminado`**, `monto_cobrado` baja, evento "Cobro revertido".
- Cobro anticipado (servicio `programado`) → al pasar a `terminado` se reevalúa y queda `cobrado`.
- Un cobro aplicado a tres servicios: cada uno recibe su parte.
- `cobro_aplicaciones` con monto ≤ 0 → falla por constraint.

**`02-cheques.sql`**
- Transiciones válidas de recibido: `en_cartera → depositado → acreditado`; `→ endosado`; `→ descontado`; `→ rechazado`.
- Transiciones **inválidas**: `acreditado → depositado`, `endosado → acreditado` → la RPC levanta excepción.
- Propio: `emitido → debitado` marca el movimiento como pagado; `→ rechazado` lo vuelve a pendiente.
- Cada transición deja fila en `cheque_eventos` con el estado anterior correcto.
- Un chofer llamando la RPC → excepción "No autorizado".

**`03-estados.sql`**
- Todas las transiciones válidas de `cambiar_estado` por rol (matriz completa).
- Las inválidas levantan excepción con el mensaje correcto.
- Un chofer solo puede mover sus servicios asignados.
- `servicio_eventos` guarda `estado_anterior` distinto de `estado_nuevo` (**hay un bug conocido acá**: la función guarda el nuevo en ambas columnas; este test tiene que fallar primero y después se corrige con una migración).
- Trigger de máquina: alquiler `en_curso` → máquina `alquilada`; cerrado → `disponible`; con dos alquileres activos, cerrar uno no la libera.

**`04-saldos.sql`** — el más importante:
- Saldo inicial sin movimientos.
- Ingreso, egreso, transferencia entre cuentas (el total no cambia).
- Cobro acreditado suma; pendiente no.
- **Cheque endosado no suma a ninguna cuenta** y el egreso que paga tampoco resta.
- Cheque descontado suma el neto, no el monto.
- Cheque propio: el egreso pendiente no resta hasta `debitado`.
- `cuenta_corriente`: servicios menos cobros por cliente; `presupuestado` y `cancelado` no cuentan.

**`05-agenda-proyeccion.sql`**
- `agenda` devuelve las 8 ramas con las claves correctas.
- Novedad multidía aparece una vez por día.
- `proyeccion_caja(7)` devuelve 8 filas; el acumulado es correcto; con `p_cuenta_id` filtra.
- Un día con egreso mayor al saldo queda negativo.

**`06-facturacion.sql`**
- Numeración única por tipo y punto de venta (el duplicado falla).
- Nota de crédito total → factura anulada, servicios desvinculados y de vuelta a `terminado`/`cobrado`.
- `iva_mensual`: ventas menos compras; factura B de compra no suma crédito fiscal.

### 4.4 Integración (vitest + supabase-js) — casos

`setup.ts` crea un cliente de Supabase autenticado por rol (login con los usuarios del seed) y expone `comoAdmin()`, `comoOficina()`, `comoChofer(1|2)`, `comoAnonimo()`.

**`rls-chofer.test.ts`** — lo que un chofer **no** puede:
- Leer `cuenta_corriente`, `facturas`, `movimientos_caja`, `cheques` (salvo insertar), `vencimientos`, `arca_log`.
- Ver servicios no asignados.
- Editar un servicio (update directo).
- Cambiar el estado de un servicio ajeno vía RPC.
- Insertar un cobro por transferencia (solo efectivo y cheque).
- Leer las novedades de otro empleado.
Y lo que **sí**:
- Ver sus servicios, insertar cobro en efectivo, insertar cheque, subir adjunto, crear servicio no planificado, leer `cuentas`, insertar evento de flota tipo taller.

**`rls-oficina.test.ts`**
- Puede todo lo operativo; **no** puede borrar servicios ni facturas, ni tocar `parametros_cotizador` ni `empresa`.

**`rpc-firmas.test.ts`** — el bug que tuvimos:
- Llama cada RPC (`cambiar_estado`, `cambiar_estado_cheque`, `proyeccion_caja`, `tengo_google_calendar`) con los parámetros que usa la app y verifica que **no** devuelva `PGRST202` (función no encontrada). Es el test que hubiera atrapado `p_nuevo_estado`.

**`flujos.test.ts`** — recorridos por API, sin navegador (más rápidos y estables que E2E):
- Presupuesto → aceptado → programado → terminado → cobrado → facturado, verificando estado y saldos en cada paso.
- Cobro con cheque → endoso → saldos.
- Facturación de 3 servicios de un cliente en una factura.

### 4.5 Playwright — 3 smoke tests

Solo los recorridos que atraviesan la UI completa. Nada de aserciones sobre estilos.

**`01-servicio-completo.spec.ts`** (como oficina): login → Cotizador → cotizar un traslado → Crear presupuesto → en el detalle, Aceptado → Programar con fecha y chofer → verificar que aparece en Servicios con chip Programado.

**`02-cobro-y-factura.spec.ts`** (como oficina): tomar el servicio anterior → Terminé → Registrar cobro en efectivo → verificar chip Cobrado y que el Total a cobrar de Hoy bajó → Facturación → Pendientes → registrar factura manual → verificar chip Facturado.

**`03-chofer.spec.ts`** (como chofer, viewport 390×844): login → Mis servicios → Iniciar → Terminé sin foto → ¿Cobraste? Efectivo → verificar "Cobro registrado" → **verificar que en toda la pantalla no aparece ningún `$`** (regla: el chofer no ve precios).

Configuración: `webServer` de Playwright levanta `npm run preview` con las variables apuntando a la Supabase local. `fullyParallel: false` (los tests comparten base). Traces y screenshots solo en fallo.

## 5. CI — GitHub Actions

### 5.1 `ci.yml` — en cada push y PR a `main`

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  verificar:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - uses: supabase/setup-cli@v1
        with: { version: latest }

      - run: npm ci
      - run: npm ci --prefix worker

      # Calidad estática
      - run: node scripts/verificar-bom.mjs
      - run: node scripts/verificar-copias.mjs
      - run: npm run lint
      - run: npm run build
      - run: npm run build --prefix worker

      # Base de datos desde cero: aplica las 17 migraciones en orden
      - run: supabase start
      - run: supabase db reset            # falla si alguna migración está mal
      - run: psql "$DB_URL" -f supabase/seed-test.sql

      # Tests
      - run: npm run test:unit
      - run: npm run test:unit --prefix worker
      - run: supabase test db             # pgTAP
      - run: npm run test:integracion
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e

      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }
```

Scripts en `package.json` raíz:
```json
"test": "node scripts/verificar-bom.mjs && node scripts/verificar-copias.mjs && vitest run --dir src",
"test:unit": "vitest run --dir src",
"test:integracion": "vitest run --dir tests/integracion",
"test:e2e": "playwright test"
```

`supabase start` levanta el stack completo en el runner (Postgres, Auth, PostgREST, Storage). Todo corre ahí: **no depende de ninguna máquina encendida**.

### 5.2 `smoke-produccion.yml` — después de cada deploy

Disparado por `workflow_run` del CI en `main` (o por `schedule` cada 6 h). **Solo lectura, nada de escribir**:
- `GET https://gestion.eleva-plus.com.ar` → 200 y el HTML contiene el título.
- `GET https://eleva-plus.com.ar` → 200.
- `GET <worker>/health` → 200 y `status: ok`.
- `GET <supabase>/rest/v1/` con la publishable key → 200.
Si algo falla, el workflow falla y GitHub te manda mail. Es el complemento del monitoreo continuo.

## 6. Monitoreo — Better Stack

Plan gratuito: 10 monitores, 10 heartbeats, 1 status page, chequeos cada 3 minutos desde varias regiones (crea el incidente solo si falla desde al menos tres, así que casi no hay falsos positivos).

### 6.1 Monitores de disponibilidad (5 de 10)

| Monitor | URL | Espera | Notas |
|---|---|---|---|
| App de gestión | `https://gestion.eleva-plus.com.ar` | 200 + texto "ELEVAPLUS" | El crítico |
| Worker | `https://elevaplus-worker-production.up.railway.app/health` | 200 + `"status":"ok"` | |
| Landing | `https://eleva-plus.com.ar` | 200 | Recibe tráfico de Ads |
| Supabase REST | `https://<ref>.supabase.co/rest/v1/` | 200 | Header `apikey` con la publishable |
| SSL + dominio | `eleva-plus.com.ar` | monitor de certificado y vencimiento de dominio | Avisa antes de que expire |

Alertas: mail y **push a la app móvil de Better Stack** (iOS/Android, gratis). A Ezequiel, no a la dueña.

### 6.2 Heartbeats de los crons (5 de 10)

Esto es lo que hoy **no existe**: si el cron del worker no corre, nadie se entera. Cada tarea hace un `GET` a su URL de heartbeat al terminar bien; si Better Stack no lo recibe en la ventana esperada, crea un incidente.

| Heartbeat | Tarea del worker | Período | Gracia |
|---|---|---|---|
| Instancias de vencimientos | `generarInstancias` 00:30 | 1 día | 2 h |
| Recordatorio del día | `recordatoriosHoy` 08:00 | 1 día | 2 h |
| Lote de facturación | `correrLote` 21:30 | 1 día | 3 h |
| Resumen semanal | `resumenSemanal` lunes 07:00 | 7 días | 6 h |
| Sincronización de calendario | `sincronizarCalendario` 01:00 | 1 día | 3 h |

Implementación en el worker: helper `latir(nombre)` que hace `fetch(process.env[`HEARTBEAT_${NOMBRE}`])` con try/catch silencioso (un heartbeat caído nunca debe romper la tarea). Se llama **al final** de cada tarea, solo si terminó sin error. Variables: `HEARTBEAT_INSTANCIAS`, `HEARTBEAT_RECORDATORIOS`, `HEARTBEAT_LOTE`, `HEARTBEAT_SEMANAL`, `HEARTBEAT_CALENDARIO`.

Better Stack también soporta el modo "start/finish" para medir duración; útil para el lote de facturación. Opcional.

### 6.3 Status page

Una pública en `status.eleva-plus.com.ar` (CNAME en Cloudflare) con los monitores de app, landing y worker. Sirve para dos cosas: que la dueña o los choferes puedan mirar si "se cayó" antes de escribirte, y como registro de disponibilidad.

### 6.4 Lo que NO se monitorea

Errores de JavaScript en el navegador, performance, logs. Better Stack los ofrece pero el free tier es chico y para cuatro usuarios no vale la complejidad. Si algún día hace falta, se suma.

## 7. Orden de prompts

1. **Infraestructura local**: `supabase/config.toml` para tests, `seed-test.sql`, scripts de `package.json`, documentación en README de cómo correr todo localmente. Verificar que `supabase db reset` aplica las 17 migraciones sin error — **si falla, ese es el primer bug a arreglar**.
2. **pgTAP**: los 6 archivos de `supabase/tests/` con los casos del §4.3. Incluye el test del bug de `servicio_eventos.estado_anterior`, que va a fallar; la corrección va en una migración aparte con pausa de revisión.
3. **Integración**: `tests/integracion/` con los 4 archivos del §4.4.
4. **Playwright**: config y los 3 specs del §4.5.
5. **CI**: los dos workflows del §5, más los badges en el README.
6. **Heartbeats en el worker**: helper `latir()` y las llamadas en las 5 tareas (§6.2). Documentar las variables.

Better Stack (monitores, heartbeats, status page) se configura a mano en su panel — no hay código salvo el punto 6.

## 8. Después

Cuando esto esté, la regla de trabajo cambia: **una feature nueva no se mergea si CI está en rojo**, y cada bug que aparezca en producción se arregla escribiendo primero el test que lo reproduce. Eso es lo que hace que el sistema aguante los próximos dos años sin que tengas que acordarte de nada.
