import { createContext, useContext, useState, type ReactNode } from "react";

interface AsistenteContextType {
  panelAbierto: boolean;
  setPanelAbierto: (abierto: boolean) => void;
  abrirPanel: () => void;
  cerrarPanel: () => void;
  alternarPanel: () => void;
}

const AsistenteContext = createContext<AsistenteContextType | null>(null);

export function AsistenteProvider({ children }: { children: ReactNode }) {
  const [panelAbierto, setPanelAbierto] = useState(false);

  return (
    <AsistenteContext.Provider
      value={{
        panelAbierto,
        setPanelAbierto,
        abrirPanel: () => setPanelAbierto(true),
        cerrarPanel: () => setPanelAbierto(false),
        alternarPanel: () => setPanelAbierto((prev) => !prev),
      }}
    >
      {children}
    </AsistenteContext.Provider>
  );
}

export function useAsistente() {
  const ctx = useContext(AsistenteContext);
  if (!ctx) {
    throw new Error("useAsistente debe ser usado dentro de AsistenteProvider");
  }
  return ctx;
}
