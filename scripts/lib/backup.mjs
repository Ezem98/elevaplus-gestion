// Utilidades compartidas por los scripts de backup.

/** Cuenta filas por tabla en un dump con bloques COPY (pg_dump --use-copy). */
export function contarFilas(sql) {
  const conteo = new Map();
  let tabla = null;
  for (const linea of sql.split(/\r?\n/)) {
    if (tabla) {
      if (linea === "\\.") tabla = null;
      else conteo.set(tabla, (conteo.get(tabla) ?? 0) + 1);
      continue;
    }
    const m = /^COPY\s+("?[\w]+"?\."?[\w]+"?)/.exec(linea);
    if (m) {
      tabla = m[1].replaceAll('"', "");
      conteo.set(tabla, conteo.get(tabla) ?? 0);
    }
  }
  return conteo;
}
