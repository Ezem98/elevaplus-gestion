import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Truck, Calculator, Users, Wallet, Landmark, Receipt, Settings, LogOut, Plus, Menu } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { MenuAcciones, type AccionMenu } from "@/components/ui/MenuAcciones";

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
  { a: "/caja", texto: "Caja", Icono: Landmark },
  { a: "/facturacion", texto: "Facturación", Icono: Receipt },
];

const enlacesMovil = [
  { a: "/", texto: "Hoy", Icono: LayoutDashboard },
  { a: "/servicios", texto: "Servicios", Icono: Truck },
  { a: "/clientes", texto: "Clientes", Icono: Users },
  { a: "/caja", texto: "Caja", Icono: Landmark },
];

export function LayoutOficina() {
  const { perfil, salir } = useAuth();
  const primerNombre = perfil?.nombre ? perfil.nombre.trim().split(/\s+/)[0] : "";

  const location = useLocation();
  const navigate = useNavigate();
  const rutasConFab = ["/", "/servicios", "/clientes"];
  const mostrarFab = rutasConFab.includes(location.pathname);
  const destinoFab = location.pathname === "/clientes" ? "/clientes/nuevo" : "/servicios/nuevo";
  const etiquetaFab = location.pathname === "/clientes" ? "Nuevo cliente" : "Nuevo servicio";

  const accionesMas: AccionMenu[] = [
    { texto: "Cobros", onClick: () => navigate("/cobros") },
    { texto: "Facturación", onClick: () => navigate("/facturacion") },
    { texto: "Cotizador", onClick: () => navigate("/cotizador") },
    ...(perfil?.rol === "admin"
      ? [{ texto: "Configuración", onClick: () => navigate("/configuracion") }]
      : []),
  ];

  const esRutaMas = ["/cobros", "/facturacion", "/cotizador", "/configuracion"].some(
    (r) => location.pathname.startsWith(r)
  );

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
          {perfil?.rol === "admin" && (
            <NavLink
              to="/configuracion"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-marca-suave text-marca" : "text-tinta-suave hover:bg-fondo hover:text-tinta"
                }`
              }
            >
              <Settings className="h-4 w-4" />
              Configuración
            </NavLink>
          )}
        </nav>
        <div className="flex items-center justify-between gap-3 text-sm md:mt-auto md:border-t md:border-borde md:px-2 md:pt-4">
          {primerNombre && (
            <span className="text-sm font-semibold text-tinta md:hidden">
              Hola, {primerNombre}
            </span>
          )}
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

      <main className="flex-1 p-4 pb-[76px] md:p-8 md:pb-8">
        <Outlet />
      </main>

      {/* Botón flotante solo en listas de celular */}
      {mostrarFab && (
        <Link
          to={destinoFab}
          aria-label={etiquetaFab}
          className="fixed right-4 bottom-[76px] z-30 h-14 w-14 rounded-full bg-marca text-white grid place-items-center hover:bg-marca-oscuro active:scale-95 transition-transform shadow-lg md:hidden"
        >
          <Plus className="h-[26px] w-[26px]" strokeWidth={2.5} />
        </Link>
      )}

      {/* Navegación inferior en celular: Hoy · Servicios · Clientes · Caja · Más */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[60px] border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)] md:hidden">
        {enlacesMovil.map(({ a, texto, Icono }) => (
          <NavLink
            key={a}
            to={a}
            end={a === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium ${isActive ? "text-marca" : "text-tinta-suave"}`
            }
          >
            <Icono className="h-5 w-5" />
            {texto}
          </NavLink>
        ))}
        <MenuAcciones
          acciones={accionesMas}
          disparador={
            <button
              type="button"
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium transition-colors ${
                esRutaMas ? "text-marca" : "text-tinta-suave"
              }`}
            >
              <Menu className="h-5 w-5" />
              Más
            </button>
          }
        />
      </nav>
    </div>
  );
}
