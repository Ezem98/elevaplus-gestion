const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatearPesos(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return pesos.format(valor);
}

export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatearFechaHoraCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = d.getMonth() + 1;
  const horas = String(d.getHours()).padStart(2, "0");
  const minutos = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes} ${horas}:${minutos}`;
}

export function formatearNumeroFactura(
  tipo: string | null | undefined,
  puntoVenta: number | null | undefined,
  numero: number | string | null | undefined
): string {
  const pv = String(puntoVenta ?? 0).padStart(4, "0");
  const num = String(numero ?? 0).padStart(8, "0");
  const t = tipo ?? "";
  let prefijo = t;
  if (t.startsWith("NC_")) {
    prefijo = `NC ${t.slice(3)}`;
  } else if (t.startsWith("ND_")) {
    prefijo = `ND ${t.slice(3)}`;
  }
  return `${prefijo} ${pv}-${num}`.trim();
}
