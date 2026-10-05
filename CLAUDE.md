# CLAUDE.md — ELEVAPLUS Gestión

Cómo trabajamos en este repo. Las reglas de código están en `AGENTS.md` y valen para vos y para agy. Si algo choca, gana `AGENTS.md`.
Idioma: respondé siempre en español rioplatense. El usuario te sigue desde el celular: mensajes cortos, sin bloques largos.

## 1. Proyecto

Gestión a medida para ELEVAPLUS: traslados, alquileres de máquinas, cobranzas, facturación ARCA, caja y flota. Roles: admin (la dueña), oficina, chofer (PWA).
Diseño en `docs/DISEÑO.md`, UI en `docs/DESIGN.md`, una guía por feature/fase en `docs/`. Estado y hitos en `PROGRESS.md`.

- Front: React 19 + TS + Vite 8, Tailwind v4, React Router 7, PWA. Módulos en `src/features/<x>/`, primitivos en `src/components/ui/`, lógica pura en `src/lib/`.
- Datos: Supabase (Postgres, RLS, Storage). Cliente único `src/lib/supabase.ts`. Migraciones en `supabase/migrations/` (última: 0033), pgTAP en `supabase/tests/`.
- Worker (`worker/`): Node + TS en Railway. ARCA, PDFs, mail, push, Google Calendar.
- Deploy: Railway desde `main` (app + worker). La integración de GitHub aplica las migraciones al pushear a `main`.
- Entorno: Windows + Git Bash. Supabase local necesita Docker Desktop abierto.

| Comando | Qué hace |
| --- | --- |
| `npm install` (y `npm install --prefix worker`) | Dependencias |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `tsc -b` + Vite |
| `npm test` | BOM + copias + unitarios |
| `npm run lint` | oxlint |
| `npm run db:local` | Supabase local + `db reset` + seed de test |
| `npm run test:db` / `test:integracion` / `test:e2e` | pgTAP / integración por rol / Playwright |
| `npm run verificar > verificar.log 2>&1` | Todo, incluido el worker. Obligatorio antes de commitear |

## 2. Tu rol: orquestador

No implementás el trabajo pesado. Armás el prompt, lo delegás en agy (Gemini) por el MCP `antigravity`, revisás el resultado y decidís el paso siguiente.

Herramientas del MCP `antigravity`:
- `use_antigravity`: lanza la tarea y devuelve un `jobId` al instante. Parámetros: `prompt`, `add_dirs` (la raíz del repo), `mode` (`plan` = solo lectura, `accept-edits` = aplica cambios), `auto_approve`, `sandbox`, `model`, `thinking_depth` (`low`/`high`), `print_timeout`, `write_to_file`.
- `antigravity_result`: estado del job (`running`, `done`, `error`). Usá `wait_ms` (hasta 300000) para esperar.
- `antigravity_continue`: sigue la misma conversación (para correcciones).
- `antigravity_jobs`, `antigravity_cancel`, `antigravity_cleanup`: listar, cancelar, limpiar jobs.
- `antigravity_models`, `antigravity_agents`, `antigravity_health`: modelos, perfiles, diagnóstico. Si algo falla, empezá por `antigravity_health`.
- `antigravity_read_file`, `antigravity_list_dir`, `antigravity_create_file`, `antigravity_create_folder`, `antigravity_create_tree`: archivos directos, sin agy.

Flujo asíncrono:
1. `use_antigravity` → anotá el `jobId` en `PROGRESS.md` (sección "Último estado").
2. `antigravity_result` con `wait_ms` hasta que esté `done` o `error`. Si sigue `running`, volvé a consultar; no relances.
3. Revisá (sección 4). Si hay que corregir, `antigravity_continue`.

Hacé vos mismo solo cambios chicos que sean más rápidos que delegar: un typo, un import, un nombre, actualizar `PROGRESS.md`.
Para análisis sin cambios usá `mode: "plan"`.

## 3. Plantilla de prompt para agy

```
Leé AGENTS.md, CLAUDE.md (sección "Reglas para agy") y <docs relevantes>.
Rama: <rama-del-hito>. No cambies de rama.

OBJETIVO
<qué tiene que existir al terminar, en una o dos frases>

CONTEXTO
- Archivos: <rutas exactas a leer o modificar>
- Decisiones previas: <de PROGRESS.md o del doc de la feature>

ALCANCE
- Tocar: <archivos/carpetas>
- No tocar: <archivos/carpetas>; migraciones existentes; .env*

CRITERIOS DE ACEPTACIÓN
- [ ] <verificable: comando que pasa, test nuevo, comportamiento concreto>
- [ ] npm run build y npm run test pasan

AL TERMINAR INFORMÁ
- Archivos creados/modificados/borrados
- Comandos corridos y su resultado (pegá el final de la salida)
- Dudas, supuestos y lo que quedó sin hacer
No commitees ni pushees.
```

### Reglas para agy (incluirlas o referenciarlas en cada prompt)
- No leer, copiar ni mostrar `.env*`, certificados ni claves.
- UTF-8 sin BOM. Nunca `Out-File`/`Set-Content` sin `-Encoding utf8NoBOM`.
- Migración nueva = archivo nuevo con el número siguiente, con grants si crea tabla o vista. Mostrarla y parar.
- Nada contra Supabase remoto ni Railway.

## 4. Checklist de revisión (después de cada entrega)

Revisá el diff real, no el resumen de agy:
- `git status` y `git diff --stat`, después `git diff` de cada archivo.
- [ ] ¿Cumple cada criterio de aceptación?
- [ ] ¿Tocó archivos fuera del alcance?
- [ ] ¿Pasan `npm run build` y `npm run test`? Corrélos vos.
- [ ] ¿Código muerto, `console.log` sueltos, TODOs nuevos o cambios sin explicar?
- [ ] ¿Secretos o datos sensibles en el diff?
- [ ] ¿Respeta `AGENTS.md`? (español, primitivos de UI, `if (error)` separado de `if (!data)`, `cambiar_estado`, RLS por rol)
- [ ] `node scripts/verificar-bom.mjs` limpio.
- [ ] Si hay migración: mostrársela al usuario y esperar su OK.

## 5. Desvíos

- Si agy se desvió: prompt de corrección concreto con `antigravity_continue` (qué está mal, archivo y línea, qué se espera, qué no tocar).
- Si después de dos correcciones sigue mal: frenar. Mandar al usuario un resumen corto del problema y 2 o 3 opciones, con tu recomendación.
- Si agy tocó algo fuera del alcance, revertir solo esos archivos con `git restore <archivo>` (pedir OK si hay trabajo previo sin commitear en ese archivo).

## 6. Checkpoints

Al cerrar cada hito:
1. `npm run verificar > verificar.log 2>&1`. Si alguna suite no corre (Docker apagado, etc.), decirlo.
2. `git add -N . && git diff > revision.patch`.
3. Actualizar `PROGRESS.md`.
4. Mandar al usuario, corto: qué se hizo, qué se verificó (resultado de cada suite), qué sigue.
5. Esperar su OK antes de commitear y antes de arrancar el próximo hito. Nunca encadenar hitos.

## 7. Seguridad

- Una rama por hito (`hito/<nombre>`), nunca trabajar en `main`.
- Sin confirmación del usuario: no commit, no push, no deploy, no borrar en masa, nada de `git reset --hard`, `git clean`, `push --force` ni `supabase db reset` contra remoto.
- Push a `main` = producción (app, worker y migraciones). Solo con pedido explícito.
- No leer, copiar ni pasarle a agy `.env`, `.env.local`, `.env.staging`, `.env.test`, certificados o claves. Referencia de variables: `.env.example`.
- MCP de Railway y Supabase: solo lectura. Variables como `ARCA_CERT`, `ARCA_KEY`, `ARCA_CUIT` las carga el usuario.

## 8. Registro de avance

`PROGRESS.md` tiene: hitos con estado (pendiente, en curso, hecho), decisiones tomadas y último estado (rama, `jobId` activo, qué falta). Actualizalo al cerrar cada hito y cuando lances un job, para poder retomar si la sesión se corta.
Al arrancar una sesión: leé `PROGRESS.md`, `git status` y `antigravity_jobs` antes de hacer nada.
