import { createBrowserRouter } from "react-router-dom";
import { RutaProtegida } from "@/features/auth/RutaProtegida";
import { PaginaIngresar } from "@/features/auth/PaginaIngresar";
import { LayoutOficina } from "./LayoutOficina";
import { LayoutChofer } from "./LayoutChofer";
import { PaginaHoy } from "@/features/dashboard/PaginaHoy";
import { PaginaServicios } from "@/features/servicios/PaginaServicios";
import { FormularioServicio } from "@/features/servicios/FormularioServicio";
import { PaginaServicio } from "@/features/servicios/PaginaServicio";
import { PaginaCotizador } from "@/features/cotizador/PaginaCotizador";
import { PaginaClientes } from "@/features/clientes/PaginaClientes";
import { FormularioCliente } from "@/features/clientes/FormularioCliente";
import { PaginaCliente } from "@/features/clientes/PaginaCliente";
import { PaginaCobros } from "@/features/cobros/PaginaCobros";
import { PaginaChoferHoy } from "@/features/chofer/PaginaChoferHoy";

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
          { path: "/servicios/nuevo", element: <FormularioServicio /> },
          { path: "/servicios/:id", element: <PaginaServicio /> },
          { path: "/cotizador", element: <PaginaCotizador /> },
          { path: "/clientes", element: <PaginaClientes /> },
          { path: "/clientes/nuevo", element: <FormularioCliente /> },
          { path: "/clientes/:id", element: <PaginaCliente /> },
          { path: "/clientes/:id/editar", element: <FormularioCliente /> },
          { path: "/cobros", element: <PaginaCobros /> },
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
