import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";

export type AccionMenu =
  | {
      texto: string;
      onClick: () => void;
      peligro?: boolean;
      separador?: never;
    }
  | {
      separador: true;
      texto?: never;
      onClick?: never;
      peligro?: never;
    };

export interface MenuAccionesProps {
  acciones: AccionMenu[];
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
}

export function MenuAcciones({ acciones, abierto, onAbiertoChange }: MenuAccionesProps) {
  const rootProps = abierto !== undefined ? { open: abierto, onOpenChange: onAbiertoChange } : {};

  return (
    <DropdownMenu.Root {...rootProps}>
      <DropdownMenu.Trigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Acciones"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-tinta-suave hover:bg-fondo transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-44 rounded-lg border border-borde bg-superficie py-1 shadow-[0_8px_24px_rgba(23,33,43,0.10)] focus:outline-none"
        >
          {acciones.map((accion, i) =>
            accion.separador ? (
              <DropdownMenu.Separator key={i} className="my-1 h-px bg-borde" />
            ) : (
              <DropdownMenu.Item
                key={i}
                onSelect={(e) => {
                  e.stopPropagation();
                  accion.onClick();
                }}
                className={`px-3 py-2 text-sm cursor-pointer outline-none select-none transition-colors ${
                  accion.peligro
                    ? "text-peligro data-[highlighted]:bg-peligro-suave"
                    : "text-tinta data-[highlighted]:bg-fondo"
                }`}
              >
                {accion.texto}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}