# Convenciones del proyecto ELEVAPLUS Gestión

Antes de cualquier cambio, leé docs/DISEÑO.md y README.md.

- Código, nombres de archivos, variables y textos de UI en español rioplatense. Sin anglicismos en nombres de dominio (servicio, cobro, cliente, chofer).
- UI: usar los primitivos de src/components/ui (Boton, Campo, Tarjeta, ChipEstado) y los tokens de src/index.css. No instalar librerías de componentes con estilos propios (shadcn, MUI, etc.). Sí se permiten primitivos headless de @radix-ui/\*, siempre envueltos en un componente propio en src/components/ui con los tokens del proyecto. Excepciones: @react-pdf/renderer para generar el PDF del presupuesto en el navegador, y @fontsource/ibm-plex-sans para la tipografía del PDF. No usar @react-pdf para nada que no sea documentos.
- Datos: acceso a Supabase solo desde src/lib/supabase.ts. El estado de un servicio se cambia ÚNICAMENTE con la RPC `cambiar_estado`, nunca con update directo.
- Nunca modificar archivos en supabase/migrations existentes. Un cambio de esquema = un archivo nuevo con formato <timestamp>\_nombre.sql, y avisar explícitamente que requiere revisión antes de commitear. Las migraciones no llevan comentarios de 'requiere revisión'. La pausa para revisar se pide en el chat; el archivo queda para siempre en el historial de la base.
- Nunca aplicar migraciones a producción a mano (supabase db push, migration up contra el proyecto remoto, ni SQL directo). Las aplica solo la integración de GitHub al pushear a main. Contra la base local sí se puede usar cualquier comando.
- Toda migración que cree una tabla o vista en public debe incluir, en el mismo archivo, los grant correspondientes (authenticated y service_role; nunca anon). Desde el 30/10/2026 Supabase no los otorga solo, y sin ellos la tabla es inalcanzable por PostgREST — falla supabase db reset y los tests de integración.
- No tocar RLS sin explicar el impacto por rol (admin, oficina, chofer). En migraciones con policies (especialmente en storage.objects), usar siempre sentencias idempotentes (`drop policy if exists ...` antes de `create policy` o guardas `if not exists`) para evitar errores de duplicate_object.
- Después de cada cambio correr `npm run build` y `npm run test` y confirmar que pasan.
- Antes de cualquier commit, correr `npm run verificar` completo y pegar el resultado de cada suite. Si no se puede correr alguna (por ejemplo, Supabase local apagado), decirlo y no commitear.
- Todos los archivos se escriben en UTF-8 sin BOM. En PowerShell nunca usar Out-File ni Set-Content sin -Encoding utf8NoBOM; preferir fs.writeFileSync de Node. El migrador de Supabase falla con BOM.
- Una feature por tarea. Si el pedido implica más de un módulo, decirlo y proponer el corte antes de empezar.
- Tests de RLS: ningún test de "no puede ver X" vale si la tabla está vacía. Siempre insertar el dato con un rol permitido antes de verificar que el rol restringido no lo ve (para evitar falsos positivos por tablas vacías).
- Nunca colapsar el error de una consulta con la ausencia del dato. `if (error) { … }` va siempre separado de `if (!data) { … }`, y el mensaje de error tiene que incluir `error.message`. Un select con una columna inexistente falla con 42703 y esa causa tiene que ser visible en el log.
