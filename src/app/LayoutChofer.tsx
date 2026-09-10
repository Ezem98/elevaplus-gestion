import { Link, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";

export function LayoutChofer() {
  const { perfil, salir } = useAuth();
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-borde bg-superficie px-4 py-3">
        <Link to="/chofer" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <img src="/icono.svg" alt="" className="h-8 w-8" />
          <span className="font-semibold">ELEVAPLUS</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/mi-cuenta"
            className="text-right leading-tight hover:text-marca transition-colors"
            title="Mi cuenta"
          >
            <div className="text-sm font-semibold text-tinta">{perfil?.nombre}</div>
            <div className="text-xs text-tinta-suave">Mi cuenta</div>
          </Link>
          <button
            onClick={salir}
            className="rounded-md p-1.5 text-tinta-suave transition-colors hover:bg-peligro-suave hover:text-peligro"
            aria-label="Salir"
            title="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
