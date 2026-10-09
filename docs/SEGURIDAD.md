# Seguridad: controles, secrets e incidentes

Documento operativo de ELEVAPLUS Gestión. No contiene valores de secrets ni detalle explotable de hallazgos abiertos. El plan de la fase está en `docs/FASE-7-AUDITORIA-SEGURIDAD.md`.

## 1. Controles implementados

| Control | Qué hace | Dónde |
| --- | --- | --- |
| Storage por carpeta (H-1) | Cada rol solo accede a su carpeta en los buckets | Migración 0025 |
| `enviar-push` fail-closed (H-2) | Sin `WEBHOOK_SECRET` configurado la función rechaza todo; comparación en tiempo constante | `supabase/functions/enviar-push` |
| Presupuestos compartidos como archivo (H-3) | Se comparte el PDF, no un link público; URLs firmadas a 1 h | App + Storage |
| `anon` sin EXECUTE en funciones `security definer` | Un visitante sin sesión no puede llamar RPCs sensibles | Migración 0036 |
| CSV sin fórmulas | Se neutralizan celdas que empiezan con `=`, `+`, `-`, `@` | `src/lib/` |
| Escape HTML en mails | Los datos de clientes no inyectan HTML en los mails del worker | Worker |
| Credenciales ARCA explícitas en producción | El worker no arranca la emisión sin `ARCA_CERT`/`ARCA_KEY`/`ARCA_CUIT` en producción | Worker |
| `WORKER_SECRET` en tiempo constante | Comparación con `timingSafeEqual` | `worker/src/http/auth.ts` |
| Escaneo de secrets | gitleaks sobre código e historial; falla el CI | `.github/workflows/ci.yml`, `.gitleaks.toml` |
| `npm audit` en CI | Falla con vulnerabilidades altas o críticas en dependencias de producción (app y worker) | `.github/workflows/ci.yml` |
| Dependabot | PRs semanales (npm app, npm worker, GitHub Actions), máx. 5 abiertas por ecosistema | `.github/dependabot.yml` |
| Permisos mínimos en Actions | `permissions: contents: read` en cada workflow | `.github/workflows/` |
| Dependencias nuevas justificadas | Regla en `AGENTS.md` | `AGENTS.md` |
| Limpieza de archivos huérfanos en Storage (Q12) | Cron semanal (domingo 04:00) y tarea `limpiar-storage`: busca en el bucket `adjuntos` archivos sin referencia, de una entidad (servicio, presupuesto, movimiento) que ya no existe y con más de 7 días. Por defecto solo informa en el log. Borra (hasta 200 por corrida) únicamente con `STORAGE_LIMPIEZA_BORRAR=true` en Railway worker. Nunca toca el bucket `facturas` ni carpetas de convención desconocida | `worker/src/storage/` |

## 2. Decisiones tomadas

- **H-4 (service role en el worker)**: no es una vulnerabilidad. El worker es un servicio de backend de confianza y necesita saltear RLS. La clave vive solo en Railway.
- **`enviar-push` con `--no-verify-jwt`**: se mantiene, porque lo invocan los Database Webhooks y no un usuario. La autenticación es el `WEBHOOK_SECRET` en el header `Authorization`.
- **Facturas**: se envían por el mail del worker (Resend), no con links públicos.

## 3. Dónde vive cada secret y cómo rotarlo

Regla general: generar el valor nuevo sin dejarlo en el historial de la terminal ni en el chat, cargarlo en todos los lugares, recién ahí revocar el viejo.

| Secret | Dónde vive | Cómo rotarlo | Qué se rompe mientras tanto | Última rotación |
| --- | --- | --- | --- | --- |
| `WEBHOOK_SECRET` | Supabase Edge Function secrets (`enviar-push`), header `Authorization` de los 3 Database Webhooks (Dashboard), Railway worker | Generar uno nuevo; `npx supabase secrets set`; editar el header de `push-servicio-no-planificado`, `push-servicio-eventos` y `push-notificaciones`; actualizar la variable en `elevaplus-worker`. Detalle en el README | Las notificaciones push fallan (401) hasta que los tres lugares coincidan | 07/10/2026 |
| `WORKER_SECRET` | Railway worker (y quien llama al worker: app/webhooks internos según el endpoint) | Generar uno nuevo, actualizar en Railway worker y en los llamadores, redeploy | Las llamadas internas al worker devuelven 401 | sin registrar |
| `SUPABASE_SERVICE_ROLE_KEY` | Railway worker, Supabase Edge Function secrets (la inyecta Supabase) | Rotar en Supabase (Project Settings, API), actualizar en Railway worker y redeploy | El worker pierde acceso administrativo a la base: no hay lote ARCA, PDFs ni mails | sin registrar |
| `ARCA_CERT` / `ARCA_KEY` | Railway worker | Generar CSR y certificado nuevos en ARCA, cargar ambos en Railway y redeploy; revocar el certificado viejo | No se puede emitir facturación electrónica | sin registrar |
| `ARCA_CUIT` | Railway worker | No es secreto, cambia solo si cambia el emisor | Emisión de facturas | no aplica |
| `AFIPSDK_ACCESS_TOKEN` | Railway worker | Regenerar en el panel de Afip SDK, actualizar en Railway | Falla la comunicación con ARCA | sin registrar |
| `RESEND_API_KEY` | Railway worker | Crear key nueva en Resend, actualizar en Railway, borrar la vieja | No salen mails (facturas, recordatorios) | sin registrar |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Supabase Edge Function secrets; la pública también como `VITE_VAPID_PUBLIC_KEY` en Railway app | Generar par nuevo con `npx web-push generate-vapid-keys`, cargar ambos lados, redeploy de la app | Todas las suscripciones push existentes quedan inválidas; hay que volver a suscribirse | sin registrar |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Railway worker | Crear secreto nuevo en Google Cloud Console, actualizar en Railway, borrar el viejo | La sincronización con Google Calendar deja de funcionar y puede pedir reconectar | sin registrar |
| `VITE_SUPABASE_ANON_KEY` | Railway app (es pública por diseño; la protege RLS) | Rotar en Supabase si hace falta, actualizar en Railway y redeploy | La app no puede conectarse hasta el redeploy | sin registrar |
| Tokens de GitHub Actions | GitHub, Settings, Secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, opcionales) | Actualizar el secret en GitHub | El smoke de producción usa los valores por defecto | sin registrar |

## 4. Respuesta ante incidente

1. **Cortar acceso.** En Supabase: revocar sesiones (cerrar sesión de todos los usuarios) y rotar las keys (publishable, service role y, si hace falta, JWT secret). Al rotar el JWT secret todos los usuarios deben volver a ingresar y hay que actualizar las keys en Railway app y worker. Si el problema es el worker, pausar el servicio en Railway.
2. **Rotar secrets.** Orden sugerido para no dejar el sistema caído: primero `SUPABASE_SERVICE_ROLE_KEY` y claves de Supabase, después `WEBHOOK_SECRET` y `WORKER_SECRET`, luego `RESEND_API_KEY`, `AFIPSDK_ACCESS_TOKEN`, `ARCA_CERT`/`ARCA_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET` y VAPID. Seguir la tabla de la sección 3 y redeployar app y worker al final.
3. **Restaurar.** El proyecto está en el plan Free de Supabase: **no hay backups automáticos** en el Dashboard. Se restaura desde el último dump manual (punto 4) en un proyecto nuevo de Supabase, con `psql --single-transaction -v ON_ERROR_STOP=1 -f roles.sql -f schema.sql -c 'SET session_replication_role = replica' -f data.sql "<url de la base nueva>"`, y después se apuntan app y worker al proyecto nuevo. Se pierde todo lo escrito después del dump; hay que revisar servicios, cobros y facturas de ese intervalo. Los archivos de Storage (PDF, fotos) no están en el dump.
4. **Backups (decisión del 08/10/2026: dump manual mensual).**
   - Primer día hábil de cada mes: `node scripts/backup-produccion.mjs`. Pide la contraseña de la base y deja `roles.sql`, `schema.sql` y `data.sql` en `~/backups/elevaplus/AAAA-MM-DD`, fuera del repo. Solo lee producción.
   - Probarlo: `node scripts/probar-restauracion.mjs ~/backups/elevaplus/AAAA-MM-DD`. Resetea la base **local** sin seed, carga el dump y compara filas por tabla. Después, `npm run db:local` para volver a la base de tests.
   - Guardar una copia del dump fuera de la PC (disco externo o nube privada): tiene datos de clientes, no subirlo a ningún repo.
   - Último backup: sin registrar. Última restauración probada: sin registrar.
   - Si el negocio no tolera perder hasta un mes de datos, pasar a Supabase Pro (backups diarios).
5. **Obligaciones.** Si se filtran datos de clientes, puede corresponder informar según la Ley 25.326 de protección de datos personales. Consultar con el contador o un abogado y dejar la referencia escrita acá.

## 5. Cómo correr la auditoría

- Skill `security-audit`, sobre el repo completo (app, worker y migraciones).
- El resultado va **fuera del repo**: `~/security-audit/elevaplus/run-N`. No commitear `findings.json`, `REPORT.md` ni `FINDINGS-DETAIL.md` mientras haya hallazgos abiertos.
- Pasada 1: hecha el 07/10/2026.
- Próximas pasadas: pasada 2 sobre la landing (`elevate-your-work`) y pasada 3 sobre el asistente de WhatsApp después de la Fase 6. Conviene repetir la pasada 1 antes de cambios grandes.
- Los leads `needs_validation` se validan a mano; no son "no existe".
