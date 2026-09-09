import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
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
  disparador?: ReactNode;
}

export interface ConMenuContextualProps {
  acciones: AccionMenu[];
  children: ReactNode;
}

interface ListaAccionesProps {
  acciones: AccionMenu[];
  ItemComponent: typeof DropdownMenu.Item | typeof ContextMenu.Item;
  SeparatorComponent: typeof DropdownMenu.Separator | typeof ContextMenu.Separator;
}

function ListaAcciones({ acciones, ItemComponent, SeparatorComponent }: ListaAccionesProps) {
  const Item = ItemComponent as any;
  const Separator = SeparatorComponent as any;

  return (
    <>
      {acciones.map((accion, i) =>
        accion.separador ? (
          <Separator key={i} className="my-1 h-px bg-borde" />
        ) : (
          <Item
            key={i}
            onSelect={(e: Event) => {
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
          </Item>
        ),
      )}
    </>
  );
}

export function MenuAcciones({ acciones, abierto, onAbiertoChange, disparador }: MenuAccionesProps) {
  const rootProps = abierto !== undefined ? { open: abierto, onOpenChange: onAbiertoChange } : {};

  return (
    <DropdownMenu.Root {...rootProps}>
      <DropdownMenu.Trigger asChild onClick={(e) => e.stopPropagation()}>
        {disparador ?? (
          <button
            type="button"
            aria-label="Acciones"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-tinta-suave hover:bg-fondo transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-44 rounded-lg border border-borde bg-superficie py-1 shadow-[0_8px_24px_rgba(23,33,43,0.10)] focus:outline-none"
        >
          <ListaAcciones
            acciones={acciones}
            ItemComponent={DropdownMenu.Item}
            SeparatorComponent={DropdownMenu.Separator}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ConMenuContextual({ acciones, children }: ConMenuContextualProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-44 rounded-lg border border-borde bg-superficie py-1 shadow-[0_8px_24px_rgba(23,33,43,0.10)] focus:outline-none"
        >
          <ListaAcciones
            acciones={acciones}
            ItemComponent={ContextMenu.Item}
            SeparatorComponent={ContextMenu.Separator}
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}