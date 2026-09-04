import { createBrowserRouter } from "react-router-dom";
import { RutaProtegida } from "@/features/auth/RutaProtegida";
import { PaginaIngresar } from "@/features/auth/PaginaIngresar";
import { LayoutOficina } from "./LayoutOficina";
import { LayoutChofer } from "./LayoutChofer";
import { PaginaHoy } from "@/features/dashboard/PaginaHoy";
import { PaginaServicios } from "@/features/servicios/PaginaServicios";
import { PaginaCotizador } from "@/features/cotizador/PaginaCotizador";
import { PaginaChoferHoy } from "@/features/chofer/PaginaChoferHoy";
import { Pendiente } from "./Pendiente";

export const router = createBrowserRouter([
  { path: "/ingresar", element: <PaginaIngresar /> },
  {
    element: <RutaProtegida roles={["admin", "oficina"]} />,
    children: [
      {
        element: <LayoutOficina />,
        children: [
          { path: "/", element: <PaginaHoy /> },
          { path: "/servicios", element: <PaginaServicios /> },
          { path: "/servicios/nuevo", element: <Pendiente nombre="Nuevo servicio" /> },
          { path: "/servicios/:id", element: <Pendiente nombre="Detalle de servicio" /> },
          { path: "/cotizador", element: <PaginaCotizador /> },
          { path: "/clientes", element: <Pendiente nombre="Clientes" /> },
          { path: "/cobros", element: <Pendiente nombre="Cobros" /> },
        ],
      },
    ],
  },
  {
    element: <RutaProtegida roles={["chofer", "admin"]} />,
    children: [
      {
        element: <LayoutChofer />,
        children: [{ path: "/chofer", element: <PaginaChoferHoy /> }],
      },
    ],
  },
]);
