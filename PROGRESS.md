# PROGRESS.md — ELEVAPLUS Gestión

Actualizar al cerrar cada hito y al lanzar un job de agy.

## Último estado (05/10/2026)

- Rama: `hito/datos-fiscales-empresa` (sale de `hito/vinculos-alquileres` para que la 0035 vaya después de la 0034).
- Job de agy activo: ninguno (último: `muvidaei_9u468m`, terminado).
- Orden de hitos validado por el usuario.
- Hito 2 hecho y pusheado en `hito/datos-fiscales-empresa` (apilado sobre hito 1). Siguiente: hito 3 cuando el usuario dé el OK.
- Hito 1 hecho y pusheado en `hito/vinculos-alquileres`; PR a abrir (`gh` instalado el 05/10 pero falta `gh auth login`).

## Hitos

| # | Hito | Estado |
| --- | --- | --- |
| 1 | Cerrar vínculos y alquileres (UI + migraciones 0033 y 0034) | hecho, pusheado, PR pendiente de merge |
| 2 | Datos fiscales de la empresa para el PDF de factura (migración 0035 + Configuración) | hecho, pusheado, PR pendiente de merge |
| 3 | ARCA a producción | pendiente |
| 4 | Fase 7: auditoría de seguridad (H-2 a H-4 + auditoría completa) | pendiente |
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
En Railway (worker) ya están `ARCA_CUIT` y `ARCA_KEY` (dato del usuario, 05/10/2026). Falta que el usuario descargue el `.crt` desde ARCA y lo cargue como `ARCA_CERT`. En código: quitar el CUIT por defecto de `worker/src/config.ts:22` para que falle si falta.

### 4. Fase 7
Doc: `docs/FASE-7-AUDITORIA-SEGURIDAD.md` §8. H-1 hecho. Falta H-2 (`enviar-push` con `--no-verify-jwt`), decidir H-3 y H-4, después la auditoría completa.

### 5 y 6. Fase 6
Docs: `docs/ASISTENTE-EN-LA-APP.md` (primero en la app) y `docs/FASE-6-ASISTENTE-WHATSAPP.md`. Diseñado, sin código.

### 7. Fase 4
`docs/DISEÑO.md` §7. Parte puede quedar cubierta por la Fase 6.

## Hecho antes de este archivo

Fase 1 (MVP), Fase 2 (facturación ARCA en homologación, caja, cheques, agenda), Fase 3 (flota), Fase 5 (tests, CI, `npm run verificar`), presupuestos/recorridos/moneda (0020 a 0031), vínculos en base (0032), Fase 7 H-1.

## Decisiones

| Fecha | Decisión |
| --- | --- |
| 05/10/2026 | Claude orquesta y delega la implementación en agy (MCP `antigravity`). Ver `CLAUDE.md`. |
| 05/10/2026 | Un hito por vez, con checkpoint y OK del usuario antes de seguir. |
| 05/10/2026 | Hito 2: `iibb` texto libre, `inicio_actividades` date; los valores los carga el usuario. |
| 05/10/2026 | Hito 1, opción A: migración 0034 hace que las RPC de traslado vinculado copien dirección y trabajo del alquiler. Datos fiscales pasa a 0035. |

## A confirmar con el usuario

- Orden de los hitos 2 a 7.
- Si de Fase 3 (novedades de empleados, tercerizados) y Fase 4 hay algo ya hecho.
