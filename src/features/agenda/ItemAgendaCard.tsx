import { MenuAcciones, type AccionMenu } from "@/components/ui/MenuAcciones";
import { formatearPesos } from "@/lib/formato";
import type { ItemAgenda } from "@/lib/tipos";
import {
  ArrowDownLeft,
  Banknote,
  Receipt,
  Truck,
  User,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";

interface ItemAgendaCardProps {
  item: ItemAgenda;
  onMarcarPagado?: (instanciaId: string, item: ItemAgenda) => void;
  onOmitir?: (instanciaId: string, item: ItemAgenda) => void;
  onEditarVencimiento?: (vencimientoId: string) => void;
  modo?: "compacto" | "lista";
}

export function ItemAgendaCard({
  item,
  onMarcarPagado,
  onOmitir,
  onEditarVencimiento,
  modo = "compacto",
}: ItemAgendaCardProps) {
  const esVencimiento = item.clave.startsWith("vencimiento:");
  const instanciaId = esVencimiento ? item.clave.split(":")[1] : null;

  // Determinar ícono según origen
  let Icono = Receipt;
  let colorIcono = "text-tinta-suave";

  if (
    item.clave.startsWith("cheque_cobrar:") ||
    item.clave.startsWith("cheque_cubrir:")
  ) {
    Icono = Banknote;
    colorIcono = item.sentido === "ingreso" ? "text-ok" : "text-marca";
  } else if (item.clave.startsWith("cobro:")) {
    Icono = ArrowDownLeft;
    colorIcono = "text-ok";
  } else if (item.clave.startsWith("alquiler:")) {
    Icono = Truck;
    colorIcono = "text-marca";
  } else if (item.clave.startsWith("novedad:")) {
    Icono = User;
    colorIcono = "text-tinta-tenue";
  } else if (item.clave.startsWith("flota:")) {
    Icono = Wrench;
    colorIcono = "text-alerta";
  } else if (esVencimiento) {
    Icono = Receipt;
    colorIcono = "text-tinta-suave";
  }

  // Acciones para vencimientos
  const acciones: AccionMenu[] = [];
  if (esVencimiento && instanciaId) {
    if (onMarcarPagado) {
      acciones.push({
        texto: "Marcar pagado",
        onClick: () => onMarcarPagado(instanciaId, item),
      });
    }
    if (onOmitir) {
      acciones.push({
        texto: "Omitir vencimiento",
        onClick: () => onOmitir(instanciaId, item),
        peligro: true,
      });
    }
    if (onEditarVencimiento) {
      // url es '/agenda?vencimiento=<vencimiento_id>'
      const vId = item.url.includes("vencimiento=")
        ? item.url.split("vencimiento=")[1]
        : null;
      if (vId) {
        acciones.push({ separador: true });
        acciones.push({
          texto: "Editar vencimiento recurrente",
          onClick: () => onEditarVencimiento(vId),
        });
      }
    }
  }

  const renderContenidoPrincipal = () => (
    <div className="flex items-start gap-1.5 min-w-0">
      <Icono className={`w-3.5 h-3.5 ${colorIcono} mt-0.5 shrink-0`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-tinta leading-snug truncate">
          {item.titulo}
        </p>
        {item.detalle && (
          <p className="text-[11px] text-tinta-suave truncate">
            {item.detalle}
          </p>
        )}
      </div>
    </div>
  );

  const renderMonto = () => {
    if (item.sentido === "info" || item.monto == null) {
      return (
        <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-marca-suave text-marca">
          Informativo
        </span>
      );
    }

    if (item.sentido === "ingreso") {
      return (
        <span className="text-[13px] font-semibold text-ok tabular-nums">
          +{formatearPesos(item.monto)}
        </span>
      );
    }

    return (
      <span className="text-[13px] font-medium text-tinta tabular-nums">
        {formatearPesos(item.monto)}
      </span>
    );
  };

  if (modo === "compacto") {
    return (
      <div className="p-2.5 rounded-[6px] border border-borde bg-superficie hover:border-marca/40 transition-colors shadow-xs">
        <div className="flex items-start justify-between gap-1">
          {esVencimiento ? (
            <div className="min-w-0 flex-1">{renderContenidoPrincipal()}</div>
          ) : (
            <Link
              to={item.url}
              className="min-w-0 flex-1 hover:underline cursor-pointer block"
            >
              {renderContenidoPrincipal()}
            </Link>
          )}
          {acciones.length > 0 && <MenuAcciones acciones={acciones} />}
        </div>

        <div className="mt-2 text-right">{renderMonto()}</div>
      </div>
    );
  }

  // Modo lista
  return (
    <div className="p-3 flex items-center justify-between gap-3 hover:bg-fondo transition-colors">
      <div className="min-w-0 flex-1">
        {esVencimiento ? (
          renderContenidoPrincipal()
        ) : (
          <Link to={item.url} className="hover:underline">
            {renderContenidoPrincipal()}
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">{renderMonto()}</div>
        {acciones.length > 0 && <MenuAcciones acciones={acciones} />}
      </div>
    </div>
  );
}
