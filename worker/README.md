# ELEVAPLUS Worker

Servicio en segundo plano para tareas asíncronas, emisión de comprobantes en ARCA, recordatorios push, resúmenes semanales y generación periódica de instancias de vencimientos.

## Variables de entorno

| Variable                    | Descripción                                                              | Ejemplo / Valor                                                       |
| --------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `PORT`                      | Puerto de escucha HTTP                                                   | `3001`                                                                |
| `NODE_ENV`                  | Entorno de ejecución (`development`, `staging`, `production`)            | `production`                                                          |
| `TZ`                        | Zona horaria del proceso y crons                                         | `America/Argentina/Buenos_Aires`                                      |
| `SUPABASE_URL`              | URL del proyecto Supabase                                                | `https://xxxx.supabase.co`                                            |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio para operaciones de backend                            | `ey...`                                                               |
| `WORKER_SECRET`             | Secreto compartido para endpoints autenticados                           | `sec_...`                                                             |
| `EDGE_PUSH_URL`             | URL opcional de la Edge Function `enviar-push`                           | Default: `${SUPABASE_URL}/functions/v1/enviar-push`                   |
| `WEBHOOK_SECRET`            | Token secreto para invocar la Edge Function `enviar-push`                | Configurado en Supabase (si no está, usa `SUPABASE_SERVICE_ROLE_KEY`) |
| `RESEND_API_KEY`            | API key de Resend para envío de correos                                  | `re_...`                                                              |
| `RESEND_REMITENTE`          | Remitente por defecto                                                    | `ELEVAPLUS <facturacion@eleva-plus.com.ar>`                           |
| `MAIL_LISTA_BLANCA`         | Lista de emails autorizados en desarrollo / staging (separados por coma) | `admin@empresa.com,test@test.com`                                     |
| `AFIPSDK_ACCESS_TOKEN`      | Token de acceso de Afip SDK (obligatorio en producción)                  | `eyJhbGci...`                                                         |
| `ARCA_CUIT`                 | CUIT emisor de ARCA (obligatorio en producción; debe coincidir con empresa) | `20304050607`                                                      |
| `ARCA_CERT`                 | Certificado X.509 de ARCA en base64 o PEM (obligatorio en producción)       | `LS0tLS1CRUdJTi...`                                                   |
| `ARCA_KEY`                  | Clave privada de ARCA en base64 o PEM (obligatorio en producción)           | `LS0tLS1CRUdJTi...`                                                   |
| `HEARTBEAT_INSTANCIAS`      | URL de heartbeat para generación de instancias (+90 días)                | `https://uptime.betterstack.com/api/v1/heartbeat/...`                 |
| `HEARTBEAT_RECORDATORIOS`   | URL de heartbeat para recordatorios del día y alerta de fondos           | `https://uptime.betterstack.com/api/v1/heartbeat/...`                 |
| `HEARTBEAT_LOTE`            | URL de heartbeat para lote nocturno de facturación                       | `https://uptime.betterstack.com/api/v1/heartbeat/...`                 |
| `HEARTBEAT_SEMANAL`         | URL de heartbeat para resumen semanal por correo                         | `https://uptime.betterstack.com/api/v1/heartbeat/...`                 |
| `HEARTBEAT_CALENDARIO`      | URL de heartbeat para sincronización con Google Calendar (preparada)     | `https://uptime.betterstack.com/api/v1/heartbeat/...`                 |

> **Facturación electrónica en producción:** Cuando `empresa.arca_ambiente = 'produccion'`, las variables `ARCA_CUIT`, `ARCA_CERT`, `ARCA_KEY` y `AFIPSDK_ACCESS_TOKEN` son obligatorias y no admiten valores por defecto. Si alguna falta o si el CUIT configurado no coincide con el CUIT de la empresa, el worker rechaza la emisión con un error explícito. En homologación, ante la ausencia de `ARCA_CUIT` se utiliza el CUIT genérico de prueba de Afip SDK (`20409378472`).

## Monitoreo de Crons (Heartbeats en Better Stack)

Cada tarea programada del worker invoca la función `latir()` al finalizar correctamente. Si Better Stack no recibe el pulso HTTP GET dentro del período y ventana de gracia especificados, reporta un incidente automáticamente.

- **Resiliencia:** Si la variable no está definida, sale en silencio (el worker opera normalmente sin Better Stack).
- **Aislamiento:** Las peticiones tienen un timeout estricto de 5 s y están envueltas en try/catch; un error o caída de Better Stack nunca interrumpe ni rompe la tarea del worker.
- **Homologación:** En ambientes no productivos donde el lote nocturno no emite facturas reales, igualmente late para confirmar que la tarea corrió puntualmente.

| Variable                  | Tarea del worker                   | Período sugerido | Gracia sugerida | Descripción                                          |
| ------------------------- | ---------------------------------- | ---------------- | --------------- | ---------------------------------------------------- |
| `HEARTBEAT_INSTANCIAS`    | `generarInstancias` (00:30 hs)     | 1 día            | 2 h             | Generación de instancias de vencimientos a 90 días   |
| `HEARTBEAT_RECORDATORIOS` | `recordatoriosHoy` (08:00 hs)      | 1 día            | 2 h             | Recordatorios del día y alerta de fondos             |
| `HEARTBEAT_LOTE`          | `correrLote` (21:30 hs)            | 1 día            | 3 h             | Lote de facturación electrónica nocturna ARCA        |
| `HEARTBEAT_SEMANAL`       | `resumenSemanal` (lunes 07:00 hs)  | 7 días           | 6 h             | Resumen semanal enviado a `empresa.email`            |
| `HEARTBEAT_CALENDARIO`    | `sincronizarCalendario` (01:00 hs) | 1 día            | 3 h             | Sincronización Google Calendar _(punto 6 de Agenda)_ |

## Tareas programadas (Crons)

Todas las tareas se ejecutan en la zona horaria `America/Argentina/Buenos_Aires`:

- **00:30 hs diaria (`30 0 * * *`)** — `generarInstancias()`: Genera instancias de vencimientos activos hasta `hoy + 90 días` respetando frecuencias, `fecha_fin` y `cuotas_total`, con `ignoreDuplicates: true` (sin alterar `cuotas_pagadas`).
- **07:00 hs lunes (`0 7 * * 1`)** — `resumenSemanal()`: Envía por email a `empresa.email` el resumen de compromisos de la semana, cheques a cobrar/cubrir, proyección de caja a 7 días y alerta de descubierto si algún día queda negativo.
- **08:00 hs diaria (`0 8 * * *`)** — `recordatoriosHoy()`: Notificación push agregada a roles `admin` y `oficina` con los compromisos del día (hasta 3 títulos + "y N más", tag `agenda-hoy:YYYY-MM-DD`). Además, evalúa **alerta de fondos**: si un cheque a cubrir vence en ≤ 3 días y la cuenta bancaria no cubre según `proyeccion_caja`, envía un push de alerta específico (tag `fondos:<cheque_id>`).
- **09:00 hs diaria (`0 9 * * *`)** — `recordatoriosManana()`: Notificación push agregada para los compromisos de mañana (tag `agenda-manana:YYYY-MM-DD`).
- **21:30 hs diaria (`30 21 * * *`)** — `correrLote('cron')`: Facturación nocturna automática de servicios pendientes en ARCA.

## Endpoints HTTP

### Salud

- `GET /health`: Estado del servicio, ambiente y timestamp.

### Facturación

- `POST /emitir`: Emisión a demanda de servicios específicos (requiere JWT de admin/oficina).
- `POST /lote`: Disparo manual del lote de facturación nocturna (requiere `WORKER_SECRET` o admin).
- `POST /reenviar-mail`: Reenvío de factura emitida por correo (requiere `WORKER_SECRET` o admin).
- `GET /padron/:cuit`: Consulta de constancia de inscripción en ARCA (requiere JWT de admin/oficina).

### Tareas de Agenda y Notificaciones

- `POST /tareas/:nombre`: Disparo manual o forzado de una tarea específica (requiere `WORKER_SECRET` o admin).
  - Tareas válidas: `instancias`, `recordatorios-hoy`, `recordatorios-manana`, `resumen-semanal`.
  - Parámetro de query `?forzar=1`: Omite el control de idempotencia y vuelve a ejecutar la tarea para la fecha/semana actual.

## Idempotencia

Las ejecuciones de tareas de agenda y notificaciones se registran en la tabla `ejecuciones_worker` (`tarea`, `clave`, `ejecutado_at`, `resultado`), evitando ejecuciones duplicadas en caso de reintentos o reinicios del proceso.
