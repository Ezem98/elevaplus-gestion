-- 20260918000016_instancia_nota.sql
-- Agrega columna nota a vencimiento_instancias para registrar motivos al omitir o comentarios por instancia.
-- Requiere revisión antes de commitear.

alter table vencimiento_instancias add column if not exists nota text;

