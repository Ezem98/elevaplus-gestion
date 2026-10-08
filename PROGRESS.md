# PROGRESS.md — ELEVAPLUS Gestión

Actualizar al cerrar cada hito y al lanzar un job de agy.

## Último estado (08/10/2026)

- Rama: `hito/storage-huerfanos` (desde main con PR #8 mergeado). Tarea `limpiar-storage` lista (worker, cron domingo 04:00): solo informe por defecto; borra con STORAGE_LIMPIEZA_BORRAR=true, tope 200, nunca `facturas`. Yo bajé la página a 500 y ordené la lectura de referencias. `npm run verificar` en verde (08/10). Usuario aprobó (08/10); commit y PR.
- Backups: la org de Supabase está en plan FREE (verificado 08/10 vía MCP, solo lectura): no hay backups automáticos descargables ni PITR. Esperando decisión del usuario sobre cómo respaldar.
- Chimuelo (hito 5) queda para cuando vuelva la cuota de agy (decisión del usuario 08/10).
- 4d mergeado (PR #8): hito 4 cerrado en código.
- 4d listo para checkpoint: gitleaks + npm audit en CI, permisos mínimos, Dependabot, docs/SEGURIDAD.md, regla de dependencias. `.env.test` (claves locales) y `.env.staging` (anon key) verificados por el usuario como públicos: allowlist en `.gitleaks.toml`; gitleaks local sin hallazgos en 99 commits. `npm audit fix` en app y worker + override `compression@1.8.2` (serve 14.2.6 fijaba 1.8.1); ambos audits en 0. `npm run verificar` en verde (08/10). Usuario aprobó (08/10); commit y PR.
- 4c cerrado: migración 0036 (PR #6) y CSV/mails/README (PR #7), mergeados.
- Pasada 1: (último job: `muy5czqo_1bozam`, pasada 1 terminada, 17 de 40 invocaciones; reporte en `~/security-audit/elevaplus/run-1`, fuera del repo).
- 4b triage (07/10): 0 confirmed por la skill, 3 needs_validation. Yo validé el de `cambiar_estado` contra la base local (transacción con rollback): anon sin login cambia el estado de cualquier servicio si conoce su UUID (`auth.uid() is null` = service role, 0018:18, sin revoke a anon). Además anon tiene EXECUTE en 13 funciones security definer (incluye `cambiar_estado_cheque`, `recalcular_*`). Corregir ahora. CSV sin neutralizar fórmulas (`src/lib/csv.ts:16`) y HTML de mails sin escape (`worker/src/mail/plantillas.ts:18`): corregir ahora, chicos. Storage huérfano al borrar: después.
- Facturas: se quedan como están (mail del worker + Descargar), opción B por defecto.
- 4a cerrado: H-2 mergeado (PR #4), función redeployada y WEBHOOK_SECRET rotado por el usuario (función + 3 webhooks + worker, 07/10). H-3 presupuestos mergeado (PR #5). H-4 sin cambios.
- Siguiente después del 4c: 4d (gitleaks, Dependabot, npm audit, docs/SEGURIDAD.md) y limpieza de Storage huérfano.
- Hito 4 partido en 4a (H-2..H-4), 4b (skill + pasada 1 + triage), 4c (correcciones con test), 4d (controles permanentes + SEGURIDAD.md).
- Hito 3: código mergeado (PR #3). Del lado del usuario: falta cargar `ARCA_CERT` en Railway, punto de venta WS y pasar ambiente a producción.
- Orden de hitos validado por el usuario.
- Hito 2 mergeado a `main` (PR #2); migración 0035 aplicada por la integración.
- Hito 1 mergeado a `main` (PR #1, 05/10 17:19 UTC); migraciones 0033 y 0034 aplicadas por la integración.

## Hitos

| # | Hito | Estado |
| --- | --- | --- |
| 1 | Cerrar vínculos y alquileres (UI + migraciones 0033 y 0034) | hecho, mergeado (PR #1) |
| 2 | Datos fiscales de la empresa para el PDF de factura (migración 0035 + Configuración) | hecho, mergeado (PR #2) |
| 3 | ARCA a producción | código mergeado (PR #3); falta ARCA_CERT (usuario) |
| 4 | Fase 7: auditoría de seguridad (H-2 a H-4 + auditoría completa) | en curso: 4a hecho (PR #4 y #5); sigue 4b |
| 5 | Fase 6: asistente Chimuelo en la app | pendiente |
| 6 | Fase 6: asistente por WhatsApp | pendiente |
| 7 | Fase 4: automatizaciones (recordatorios, alertas, indicadores) | pendiente, a confirmar alcance |

### 1. Vínculos y alquileres
Doc: `docs/VINCULOS-Y-ALQUILERES.md` (prompt 2). Base hecha en 0032. Sin commitear en el árbol: `FormularioServicio.tsx`, `PaginaChoferHoy.tsx`, `PaginaConfiguracion.tsx`, `tipos.ts`, E2E `alquileres-traslados.spec.ts`, migración 0033 (`empresa.direccion_galpon`).
Falta: revisión del usuario de la 0033 y del patch, `npm run verificar` completo, commit.
Hallazgos de la revisión (05/10):
- `FormularioServicio.tsx`: después de `crear_traslado_vinculado` / `vincular_servicio` hace un `update` directo al traslado para copiar trabajo y dirección. No es atómico y no chequea el error. Causa: las RPC de la 0032 no copian `trabajo_a_realizar` ni `direccion_trabajo`/`localidad_trabajo` del principal.
- Lectura de `empresa` (galpón) ignora el `error`.
- Búsqueda de candidatos a vincular: si falla, muestra "No hay traslados cargados" (colapsa error con vacío).
Corregido (05/10, agy `muvd9g6o_3h58u1`): migración 0034 `traslado_vinculado_hereda_trabajo` (las dos RPC copian dirección y trabajo del alquiler), 6 casos pgTAP nuevos, sin `update` directo, errores visibles. Además `tests/integracion/setup.ts` ahora limpia los servicios vinculados (dejaba traslados huérfanos y el E2E fallaba en la 2da corrida).
Nota: `npm run verificar` no es repetible sin `npm run db:local` antes (los E2E dejan datos que rompen pgTAP 03 y 04).

### 2. Datos fiscales de la empresa
El worker lee `empresa.iibb` y `empresa.inicio_actividades` (`worker/src/pdf/generar.ts:163`) pero ninguna migración las crea. Migración 0035 con columnas y grants + campos en Configuración. Pausa de revisión de la migración. Los valores los carga el usuario en Configuración (no van en la migración). Ojo: `generar.ts` tiene un CUIT de respaldo `27-22651487-8` distinto del default de `ARCA_CUIT`: revisarlo en el hito 3.

### 3. ARCA a producción
En Railway (worker) ya están `ARCA_CUIT`, `ARCA_KEY` y `AFIPSDK_ACCESS_TOKEN` (dato del usuario, 05/10/2026). Falta que el usuario descargue el `.crt` desde ARCA y lo cargue como `ARCA_CERT`. En código: quitar el CUIT por defecto de `worker/src/config.ts:22` para que falle si falta.

### 4. Fase 7
Doc: `docs/FASE-7-AUDITORIA-SEGURIDAD.md` §8. H-1 hecho. Falta H-2 (`enviar-push` con `--no-verify-jwt`), decidir H-3 y H-4, después la auditoría completa.

### 4a. Diagnóstico H-2 a H-4 (05/10)
- H-2: `enviar-push` compara con `===` (`supabase/functions/enviar-push/index.ts:19-25`) y si no hay WEBHOOK_SECRET ni service role acepta todo (fail-open). No se loguea el secret. Con el secret se pueden mandar push con texto y URL arbitrarios a cualquier rol. Se deploya a mano (`README.md:187`).
- H-3: URLs firmadas a 7 días solo en `src/features/presupuestos/PaginaPresupuesto.tsx:263,404`; se regeneran al abrir el presupuesto.
- H-4: no es vulnerabilidad. Todos los endpoints del worker verifican rol o WORKER_SECRET; la key no aparece en logs, respuestas ni `src/`.

### 5 y 6. Fase 6
Docs: `docs/ASISTENTE-EN-LA-APP.md` (primero en la app) y `docs/FASE-6-ASISTENTE-WHATSAPP.md`. Diseñado, sin código.

### 7. Fase 4
`docs/DISEÑO.md` §7. Parte puede quedar cubierta por la Fase 6.

## Hecho antes de este archivo

Fase 1 (MVP), Fase 2 (facturación ARCA en homologación, caja, cheques, agenda), Fase 3 (flota), Fase 5 (tests, CI, `npm run verificar`), presupuestos/recorridos/moneda (0020 a 0031), vínculos en base (0032), Fase 7 H-1.

## Pendientes chicos

- README §push: falta el webhook `push-notificaciones` (tabla `notificaciones`, INSERT) y los nombres reales de los otros dos (`push-servicio-no-planificado`, `push-servicio-eventos`). Son 3 webhooks a rotar, no 2 (visto en el Dashboard el 07/10).

## Decisiones

| Fecha | Decisión |
| --- | --- |
| 05/10/2026 | Claude orquesta y delega la implementación en agy (MCP `antigravity`). Ver `CLAUDE.md`. |
| 05/10/2026 | Un hito por vez, con checkpoint y OK del usuario antes de seguir. |
| 05/10/2026 | H-2: se mantiene `--no-verify-jwt`; la función rechaza por defecto y compara en tiempo constante; el usuario rota WEBHOOK_SECRET. H-4: no es vulnerabilidad. H-3: en vez de bajar la duración del link, compartir presupuesto y factura como archivo PDF (un cliente desconfió del link firmado). |
| 05/10/2026 | Hito 3: 20409378472 es el CUIT de prueba de Afip SDK (válido solo en homologación). En producción el worker exige ARCA_CUIT, ARCA_CERT, ARCA_KEY y AFIPSDK_ACCESS_TOKEN, y el CUIT de Configuración tiene que coincidir con ARCA_CUIT. Sin CUIT fijo de respaldo en el PDF. |
| 05/10/2026 | Hito 2: `iibb` texto libre, `inicio_actividades` date; los valores los carga el usuario. |
| 05/10/2026 | Hito 1, opción A: migración 0034 hace que las RPC de traslado vinculado copien dirección y trabajo del alquiler. Datos fiscales pasa a 0035. |

## A confirmar con el usuario

- Orden de los hitos 2 a 7.
- Si de Fase 3 (novedades de empleados, tercerizados) y Fase 4 hay algo ya hecho.
