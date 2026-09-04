# Importación desde la planilla

Pendiente. Plan en `docs/DISEÑO.md` § 6.

Pasos previstos:
1. Exportar cada pestaña relevante (`Clientes`, `Viajes`, `Alquileres`, `Cheques`) a CSV.
2. `normalizar-clientes.ts`: agrupa nombres similares y genera `clientes.csv` limpio para revisión manual.
3. `importar.ts`: inserta con `supabase-js` usando la service role key (nunca la anon).
4. Validar saldos contra la pestaña `Cuentas Corrientes`.
