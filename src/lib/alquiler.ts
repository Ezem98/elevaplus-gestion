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

export function calcularCantidadAlquiler(dias: number, unidad: UnidadAlquiler): number {
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
