-- 20260916000011_agenda_y_cheques_enums.sql
-- Enums y valores nuevos para agenda y cheques.
-- Separado de la migración principal porque PostgreSQL no permite usar valores nuevos de enum
-- dentro de la misma transacción en la que se agregaron con ALTER TYPE ... ADD VALUE.

-- Cheques: estados y datos nuevos
alter type estado_cheque add value if not exists 'emitido';
alter type estado_cheque add value if not exists 'debitado';
alter type estado_cheque add value if not exists 'anulado';
alter type estado_cheque add value if not exists 'descontado';

-- Medios de pago nuevos
alter type medio_pago add value if not exists 'cheque_terceros';
alter type medio_pago add value if not exists 'cheque_propio';
alter type medio_pago add value if not exists 'debito_automatico';

-- Vencimientos recurrentes
do $$
begin
  if not exists (select 1 from pg_type where typname = 'frecuencia_vencimiento') then
    create type frecuencia_vencimiento as enum ('unica', 'semanal', 'quincenal', 'mensual', 'bimestral', 'anual');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_instancia') then
    create type estado_instancia as enum ('pendiente', 'pagado', 'omitido');
  end if;
end $$;
