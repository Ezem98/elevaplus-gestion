import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface EncabezadoPaginaProps {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  volverA?: string;
  acciones?: ReactNode;
  className?: string;
}

export function EncabezadoPagina({
  titulo,
  subtitulo,
  volverA,
  acciones,
  className = "",
}: EncabezadoPaginaProps) {
  return (
    <div
      className={`space-y-3 md:space-y-0 md:flex md:items-start md:justify-between md:gap-4 ${className}`}
    >
      <div className="space-y-1 min-w-0">
        {volverA && (
          <Link
            to={volverA}
            className="-ml-2 mb-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-2 text-marca hover:underline md:mb-1.5 md:ml-0 md:min-h-0 md:min-w-0 md:justify-start md:p-0"
            aria-label="Volver"
          >
            <ArrowLeft className="size-6 md:size-5" />
            <span className="hidden text-sm font-medium md:inline">Volver</span>
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-tinta">{titulo}</h1>
        {subtitulo && <p className="text-sm text-tinta-suave">{subtitulo}</p>}
      </div>
      {acciones && (
        <div className="flex flex-wrap items-center gap-2 pt-1 md:pt-0 shrink-0">
          {acciones}
        </div>
      )}
    </div>
  );
}
