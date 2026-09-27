# Fase 7 — Auditoría de seguridad

> Rama: `fase7-seguridad`. No agrega features: audita, corrige y deja controles permanentes.
> Herramienta base: [`cloudflare/security-audit-skill`](https://github.com/cloudflare/security-audit-skill) (MIT).

---

## 1. Por qué

El sistema maneja los datos financieros de una empresa real: saldos, deudas de clientes, CUIT, facturación electrónica, datos bancarios. Y tiene tres superficies expuestas a internet: la app, la landing y el worker. Una filtración no es un problema técnico, es un problema para la dueña y para sus clientes.

Además, la Fase 5 ya demostró que hay errores que solo aparecen cuando alguien los busca a propósito. Esta fase aplica el mismo principio a la seguridad.

**Alcance:** los dos repos (`elevaplus-gestion` con su worker, y `elevate-your-work`), la configuración de Supabase (RLS, policies de Storage, Edge Functions), la de Railway y la de Cloudflare.

## 2. Lo que ya sabemos (no hace falta auditar para encontrarlo)

Se corrige **antes** de la primera pasada, para que la auditoría no gaste ciclos en lo conocido.

### H-1 · Bucket `adjuntos` legible por cualquier autenticado — **alta**

En `20260904000001_esquema_inicial.sql`:

```sql
create policy "adjuntos_leer" on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos');
```

Un chofer autenticado puede descargar **cualquier** archivo del bucket: presupuestos de todos los clientes, comprobantes de compra con CUIT y montos, fotos de cheques con número y banco. El chofer no debería ver más que los adjuntos de sus propios servicios.

Corrección: policy por carpeta usando `storage.foldername(name)`, con el mismo criterio que la tabla `adjuntos`:

- `presupuestos/<servicio_id>/…` y `servicios/<servicio_id>/…` → admin y oficina siempre; chofer solo si tiene ese servicio asignado.
- `comprobantes/…` y `facturas/…` → solo admin y oficina.
- Escritura: cada rol solo en las carpetas que le corresponden.

### H-2 · Edge Function `enviar-push` con `--no-verify-jwt` — **media**

Desplegada sin verificación de JWT: cualquiera en internet puede invocarla. La única defensa es el `WEBHOOK_SECRET` en el header `Authorization`. Si ese secret se filtra (logs, historial de terminal, un `curl` pegado en un chat), un tercero puede enviar notificaciones push a los dispositivos de la dueña y los choferes.

A verificar: que el secret nunca se loguee, que se rote, y evaluar si conviene además validar el origen de los webhooks de base de datos.

### H-3 · URLs firmadas de presupuestos a 7 días — **baja, por diseño**

`createSignedUrl(path, 604800)` genera un link público sin autenticación durante una semana. Es intencional (se manda por WhatsApp al cliente), pero: quien tenga el link ve el PDF, y el PDF trae razón social, CUIT y montos. Evaluar bajar a 72 h y regenerar bajo demanda.

### H-4 · Service role en el worker — **a evaluar**

El worker opera con `SUPABASE_SERVICE_ROLE_KEY`, que saltea todo RLS. Es necesario (corre sin sesión de usuario), pero conviene revisar que cada consulta esté acotada por código y que la key no viaje a ningún lado más.

## 3. Lo que va a auditar la skill

M�dulos relevantes de la skill para este sistema:

| Módulo                         | Qué revisa acá                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `DATA-ISOLATION-AND-LIFECYCLE` | RLS por rol, aislamiento entre choferes, Storage, exportaciones CSV, borrados                 |
| `CLOUD-AND-DEPLOYMENT`         | Variables de Railway, secrets de Supabase, configuración de Edge Functions, DNS de Cloudflare |
| `PROTOCOLS-RPC-AND-MESSAGING`  | Webhooks de base de datos, endpoints del worker, firma de payloads, idempotencia              |
| `WEB-PROTOCOL-AND-AUTH`        | Sesiones de Supabase Auth, passkeys, rutas protegidas, expiración de tokens                   |
| `SUPPLY-CHAIN-AND-RELEASE`     | Dependencias, GitHub Actions, permisos del workflow, secrets en CI                            |
| `CLIENT-SIDE`                  | XSS en campos que muestran datos cargados por usuarios, PDFs generados en el navegador        |
| `AI-AND-LLM`                   | **Segunda pasada**: prompt injection, tools del asistente, confirmaciones                     |
| `RESOURCE-EXHAUSTION`          | Topes del worker, límites de la Cloud API, costos descontrolados                              |

### 3.1 Preguntas que la auditoría tiene que responder sí o sí

Se listan acá para poder contrastar el reporte; si alguna queda sin respuesta, se pide otra pasada dirigida.

1. ¿Puede un chofer leer, por cualquier vía, el saldo o la deuda de un cliente?
2. ¿Puede un chofer descargar un adjunto de un servicio que no es suyo?
3. ¿Puede un usuario autenticado escalar a admin modificando su propio `perfiles.rol`?
4. ¿Hay alguna RPC `security definer` que no valide el rol de quien la llama?
5. ¿Alguna vista expone datos salteando RLS (`security_invoker` faltante)?
6. ¿Se puede provocar una emisión de factura en ARCA sin autorización?
7. ¿Qué pasa si alguien descubre la URL del worker y llama a `/tareas/:nombre` sin el secret?
8. ¿Hay secrets en el bundle del frontend, en el repo, en los logs o en el historial de git?
9. ¿Un cliente con nombre malicioso (`<script>`, `'; drop`, `{{7*7}}`) rompe algo en la app, el PDF o el CSV?
10. ¿Los workflows de GitHub Actions exponen secrets en artefactos o logs?
11. ¿Se puede agotar el free tier de Supabase, Railway u OpenAI desde afuera?
12. ¿Qué datos quedan en Storage tras borrar un servicio o un cliente?

## 4. Cómo se corre

### 4.1 Preparación

```bash
npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit --global
```

Requisitos que sí se tienen: agente con sub-agentes paralelos (`agy`), Node para los validadores.

Requisito que **no** se tiene: sandbox del sistema operativo con red deshabilitada para ejecutar código del target. Sin eso, los leads que necesiten ejecución quedan como `needs_validation` en vez de `confirmed`. **No es bloqueante**: la skill igual reporta, pero hay que validar esos leads a mano. Anotarlo en el reporte y no tratar un `needs_validation` como "no existe".

### 4.2 Aislar el output

El reporte va a contener rutas, fragmentos de código y posibles vulnerabilidades **no corregidas**. No puede terminar en el repo.

- Directorio de salida: `~/security-audit/elevaplus/run-N`, fuera del repo.
- Nunca commitear `findings.json`, `REPORT.md` ni `FINDINGS-DETAIL.md` mientras haya hallazgos abiertos.
- Al repo va solo un `docs/SEGURIDAD.md` con los controles implementados y las decisiones tomadas, sin detalle explotable.

### 4.3 Las tres pasadas

| Pasada | Cuándo                               | Alcance                                                                                            |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **1**  | Ahora, después de corregir H-1 y H-2 | `elevaplus-gestion` completo (app + worker + migraciones)                                          |
| **2**  | Después de la pasada 1               | `elevate-your-work` (landing) — más chico, pero es la superficie pública que recibe tráfico de Ads |
| **3**  | Después de la Fase 6                 | El asistente de WhatsApp, con foco en `AI-AND-LLM` y `PROTOCOLS-RPC-AND-MESSAGING`                 |

La skill es aditiva entre corridas: usa los ledgers previos para cubrir huecos. Si el presupuesto de tokens lo permite, correr la pasada 1 **dos veces** (la propia documentación dice que una sola corrida encuentra ~la mitad).

### 4.4 Costo

Cada pasada lanza varios sub-agentes en paralelo sobre un repo de ~200 archivos. Esperar consumo alto de la cuota de `agy`. Correrla cuando no estés en medio de otra cosa, y revisar `/usage` antes y después para dimensionar la próxima.

## 5. Qué hacer con los hallazgos

**Criterio de severidad** (el de la skill, aplicado a este contexto): probabilidad × impacto. Un hallazgo es serio si un usuario con credenciales válidas —un chofer— o alguien de afuera puede **leer datos que no le corresponden**, **modificar plata** o **dejar el sistema fuera de servicio**.

**No son vulnerabilidades**, y hay que rechazarlas explícitamente para no perder tiempo:

- Que el worker use service role: es necesario y está acotado por código.
- Que la publishable key esté en el bundle: es su propósito, la protección es RLS.
- Que la landing sea pública.
- Que admin pueda hacer todo: es la dueña.
- Faltas de defensa en profundidad donde la capa que importa ya bloquea.

**Cada hallazgo confirmado se cierra con un test.** Igual que en la Fase 5: la corrección viene acompañada de un test en `tests/integracion/` o `supabase/tests/` que reproduce el ataque y verifica que ya no funciona. Así no vuelve.

## 6. Controles permanentes

Además de corregir, la fase deja mecanismos que sostienen la seguridad sin depender de acordarse:

| Control                             | Qué hace                                                  | Dónde                                     |
| ----------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| **Escaneo de secrets**              | Falla el CI si aparece una key, token o CUIT en el código | `.github/workflows/ci.yml` con `gitleaks` |
| **Dependabot**                      | PRs automáticos por dependencias vulnerables              | `.github/dependabot.yml`, los dos repos   |
| **`npm audit` en CI**               | Falla con vulnerabilidades altas o críticas               | Paso del workflow                         |
| **Permisos mínimos en Actions**     | `permissions: contents: read` explícito en cada workflow  | Los dos repos                             |
| **Tests de seguridad**              | Los casos de §3.1 como tests permanentes                  | `tests/integracion/seguridad.test.ts`     |
| **Rotación de secrets**             | Procedimiento documentado y fecha de última rotación      | `docs/SEGURIDAD.md`                       |
| **Alertas de Supabase**             | Avisos de uso anómalo de la API                           | Panel de Supabase                         |
| **Revisión de dependencias nuevas** | Regla en `AGENTS.md`: toda dependencia nueva se justifica | `AGENTS.md`                               |

## 7. Respuesta ante incidente

Documentar en `docs/SEGURIDAD.md`, porque a las 3 de la mañana nadie improvisa bien:

1. **Cortar acceso**: cómo revocar todas las sesiones de Supabase, rotar las keys (publishable, service role, JWT secret) y qué se rompe al hacerlo.
2. **Rotar secrets**: lista completa de dónde vive cada uno (Railway app, Railway worker, Supabase secrets, GitHub Actions, OpenAI, Meta) y el orden para rotarlos sin dejar el sistema caído.
3. **Restaurar**: cómo volver a un backup de Supabase y qué se pierde.
4. **Backups**: **verificar que existan y probar una restauración**. El plan free de Supabase tiene retención limitada; si no alcanza, definir un dump periódico desde el worker a Storage o a otro lado.
5. **Obligaciones**: qué corresponde informar y a quién si se filtran datos de clientes (Ley 25.326 de protección de datos personales en Argentina). Consultar con el contador o un abogado; dejar la referencia escrita.

## 8. Orden de trabajo

1. **Corregir H-1** (policies de Storage por carpeta) — migración con pausa de revisión + tests de que un chofer no accede a lo ajeno.
2. **Revisar H-2, H-3 y H-4** y decidir qué se cambia.
3. **Instalar la skill** y correr la **pasada 1** sobre `elevaplus-gestion`.
4. **Triage del reporte**: clasificar en corregir ahora / corregir después / rechazar, con el criterio del §5.
5. **Corregir lo confirmado**, cada uno con su test.
6. **Pasada 2** sobre la landing.
7. **Controles permanentes** del §6.
8. **`docs/SEGURIDAD.md`** con lo del §7 y las decisiones tomadas.
9. **Pasada 3** después de la Fase 6.

## 9. Lo que esta fase no cubre

Para tenerlo dicho: una auditoría automatizada de código no reemplaza a un pentest sobre el sistema corriendo, ni cubre la seguridad física de los dispositivos, ni el factor humano (que alguien le saque la clave a la dueña por teléfono). Para el tamaño y el riesgo de ELEVAPLUS, esto es proporcionado; si el sistema algún día maneja datos de terceros a escala, la conversación cambia.
