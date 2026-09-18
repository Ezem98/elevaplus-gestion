import type { UnidadAlquiler } from "./tipos";

export function calcularDiasAlquiler(desde: string, hasta: string): number {
  if (!desde || !hasta) return 0;
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  if (t2 < t1) return 0;
  const diffMs = t2 - t1;
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export function calcularCantidadAlquiler(
  dias: number,
  unidad: UnidadAlquiler,
): number {
  if (dias <= 0) return 0;
  switch (unidad) {
    case "dia":
      return dias;
    case "semana":
      return Math.ceil(dias / 7);
    case "quincena":
      return Math.ceil(dias / 15);
    case "mes":
      return Math.ceil(dias / 30);
  }
}

export function calcularRangoRenovacion(
  desdeOriginal: string,
  hastaOriginal: string,
): { nuevaDesde: string; nuevaHasta: string } {
  const dias = calcularDiasAlquiler(desdeOriginal, hastaOriginal);
  if (!hastaOriginal) return { nuevaDesde: "", nuevaHasta: "" };

  const [yH, mH, dH] = hastaOriginal.split("-").map(Number);
  const dDesde = new Date(Date.UTC(yH, mH - 1, dH + 1));
  const nuevaDesde = dDesde.toISOString().slice(0, 10);

  const [yD, mD, dD] = nuevaDesde.split("-").map(Number);
  const dHasta = new Date(Date.UTC(yD, mD - 1, dD + Math.max(0, dias - 1)));
  const nuevaHasta = dHasta.toISOString().slice(0, 10);

  return { nuevaDesde, nuevaHasta };
}
