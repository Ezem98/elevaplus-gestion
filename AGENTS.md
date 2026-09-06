# Convenciones del proyecto ELEVAPLUS Gestión

Antes de cualquier cambio, leé docs/DISEÑO.md y README.md.

- Código, nombres de archivos, variables y textos de UI en español rioplatense. Sin anglicismos en nombres de dominio (servicio, cobro, cliente, chofer).
- UI: usar los primitivos de src/components/ui (Boton, Campo, Tarjeta, ChipEstado) y los tokens de src/index.css. No instalar librerías de componentes con estilos propios (shadcn, MUI, etc.). Sí se permiten primitivos headless de @radix-ui/*, siempre envueltos en un componente propio en src/components/ui con los tokens del proyecto.
- Datos: acceso a Supabase solo desde src/lib/supabase.ts. El estado de un servicio se cambia ÚNICAMENTE con la RPC `cambiar_estado`, nunca con update directo.
- Nunca modificar archivos en supabase/migrations existentes. Un cambio de esquema = un archivo nuevo con formato <timestamp>\_nombre.sql, y avisar explícitamente que requiere revisión antes de commitear.
- No tocar RLS sin explicar el impacto por rol (admin, oficina, chofer).
- Después de cada cambio correr `npm run build` y `npm run test` y confirmar que pasan.
- Una feature por tarea. Si el pedido implica más de un módulo, decirlo y proponer el corte antes de empezar.
