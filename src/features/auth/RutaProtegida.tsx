import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { Rol } from "@/lib/tipos";

export function RutaProtegida({ roles }: { roles?: Rol[] }) {
  const { session, perfil, cargando } = useAuth();

  if (cargando) {
    return <div className="grid h-full place-items-center text-tinta-suave">Cargando…</div>;
  }
  if (!session) return <Navigate to="/ingresar" replace />;
  if (!perfil?.activo) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-tinta-suave">
        Tu usuario todavía no está habilitado. Pedile a la administradora que lo active.
      </div>
    );
  }
  if (roles && !roles.includes(perfil.rol)) {
    return <Navigate to={perfil.rol === "chofer" ? "/chofer" : "/"} replace />;
  }
  return <Outlet />;
}
