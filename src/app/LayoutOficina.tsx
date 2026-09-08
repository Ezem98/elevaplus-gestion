import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Truck, Calculator, Users, Wallet, Receipt, LogOut } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";

import type { Rol } from "@/lib/tipos";

const etiquetasRol: Record<Rol, string> = {
  admin: "Administración",
  oficina: "Oficina",
  chofer: "Chofer",
};

const enlacesSidebar = [
  { a: "/", texto: "Hoy", Icono: LayoutDashboard },
  { a: "/servicios", texto: "Servicios", Icono: Truck },
  { a: "/cotizador", texto: "Cotizador", Icono: Calculator },
  { a: "/clientes", texto: "Clientes", Icono: Users },
  { a: "/cobros", texto: "Cobros", Icono: Wallet },
  { a: "/facturacion", texto: "Facturación", Icono: Receipt },
];

const enlacesMovil = [
  { a: "/", texto: "Hoy", Icono: LayoutDashboard },
  { a: "/servicios", texto: "Servicios", Icono: Truck },
  { a: "/clientes", texto: "Clientes", Icono: Users },
  { a: "/cobros", texto: "Cobros", Icono: Wallet },
  { a: "/facturacion", texto: "Facturación", Icono: Receipt },
];

export function LayoutOficina() {
  const { perfil, salir } = useAuth();
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex items-center justify-between border-b border-borde bg-superficie px-4 py-3 md:w-60 md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-3 md:py-5">
        <div className="flex items-center gap-2.5 md:mb-6 md:px-2">
          <img src="/icono.svg" alt="" className="h-8 w-8" />
          <span className="font-semibold">ELEVAPLUS</span>
        </div>
        <nav className="hidden flex-1 flex-col gap-1 md:flex">
          {enlacesSidebar.map(({ a, texto, Icono }) => (
            <NavLink
              key={a}
              to={a}
              end={a === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-marca-suave text-marca" : "text-tinta-suave hover:bg-fondo hover:text-tinta"
                }`
              }
            >
              <Icono className="h-4 w-4" />
              {texto}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-3 text-sm md:mt-auto md:border-t md:border-borde md:px-2 md:pt-4">
          <div className="hidden min-w-0 flex-col md:flex">
            <span className="truncate font-medium text-tinta">{perfil?.nombre}</span>
            {perfil?.rol && (
              <span className="truncate text-xs text-tinta-suave">{etiquetasRol[perfil.rol]}</span>
            )}
          </div>
          <button
            onClick={salir}
            className="ml-auto rounded-md p-2 text-tinta-suave transition-colors hover:bg-peligro-suave hover:text-peligro md:ml-0"
            aria-label="Salir"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>

      {/* Navegación inferior en celular */}
      <nav className="sticky bottom-0 flex border-t border-borde bg-superficie md:hidden">
        {enlacesMovil.map(({ a, texto, Icono }) => (
          <NavLink
            key={a}
            to={a}
            end={a === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium ${isActive ? "text-marca" : "text-tinta-suave"}`
            }
          >
            <Icono className="h-5 w-5" />
            {texto}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
