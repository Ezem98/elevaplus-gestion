import { Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";

export function LayoutChofer() {
  const { perfil, salir } = useAuth();
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-borde bg-superficie px-4 py-3">
        <div className="flex items-center gap-2.5">
          <img src="/icono.svg" alt="" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="font-semibold">ELEVAPLUS</div>
            <div className="text-xs text-tinta-suave">{perfil?.nombre}</div>
          </div>
        </div>
        <button onClick={salir} className="text-tinta-suave" aria-label="Salir">
          <LogOut className="h-5 w-5" />
        </button>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
