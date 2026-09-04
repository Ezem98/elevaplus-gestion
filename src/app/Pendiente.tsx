export function Pendiente({ nombre }: { nombre: string }) {
  return (
    <div className="grid h-64 place-items-center rounded-lg border border-dashed border-borde text-tinta-suave">
      {nombre}: pendiente de implementar
    </div>
  );
}
