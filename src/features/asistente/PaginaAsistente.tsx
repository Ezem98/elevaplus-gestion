import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ChatAsistente } from "./ChatAsistente";
import { NOMBRE_ASISTENTE } from "./constantes";

export function PaginaAsistente() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-fondo">
      {/* Barra superior de navegación móvil con botón volver */}
      <div className="flex h-12 items-center border-b border-borde bg-superficie px-3 shrink-0">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-medium text-marca hover:underline p-1"
          aria-label="Volver"
        >
          <ArrowLeft className="size-5" />
          <span>Volver</span>
        </button>
        <span className="ml-auto text-xs font-semibold text-tinta-suave">
          {NOMBRE_ASISTENTE} Móvil
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <ChatAsistente onCerrar={() => navigate(-1)} />
      </div>
    </div>
  );
}
