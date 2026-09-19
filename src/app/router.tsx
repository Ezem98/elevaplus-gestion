import { PaginaAgenda } from "@/features/agenda/PaginaAgenda";
import { useAuth } from "@/features/auth/AuthProvider";
import { PaginaIngresar } from "@/features/auth/PaginaIngresar";
import { PaginaMiCuenta } from "@/features/auth/PaginaMiCuenta";
import { RutaProtegida } from "@/features/auth/RutaProtegida";
import { PaginaCaja } from "@/features/caja/PaginaCaja";
import { PaginaChoferHoy } from "@/features/chofer/PaginaChoferHoy";
import { FormularioCliente } from "@/features/clientes/FormularioCliente";
import { PaginaCliente } from "@/features/clientes/PaginaCliente";
import { PaginaClientes } from "@/features/clientes/PaginaClientes";
import { PaginaCobros } from "@/features/cobros/PaginaCobros";
import { PaginaConfiguracion } from "@/features/configuracion/PaginaConfiguracion";
import { PaginaCotizador } from "@/features/cotizador/PaginaCotizador";
import { PaginaHoy } from "@/features/dashboard/PaginaHoy";
import { PaginaFacturacion } from "@/features/facturacion/PaginaFacturacion";
import { PaginaFlota } from "@/features/flota/PaginaFlota";
import { FormularioServicio } from "@/features/servicios/FormularioServicio";
import { PaginaServicio } from "@/features/servicios/PaginaServicio";
import { PaginaServicios } from "@/features/servicios/PaginaServicios";
import { createBrowserRouter } from "react-router-dom";
import { LayoutChofer } from "./LayoutChofer";
import { LayoutOficina } from "./LayoutOficina";

function LayoutSegunRol() {
  const { perfil } = useAuth();
  if (perfil?.rol === "chofer") {
    return <LayoutChofer />;
  }
  return <LayoutOficina />;
}

export const router = createBrowserRouter([
  { path: "/ingresar", element: <PaginaIngresar /> },
  {
    element: <RutaProtegida roles={["admin", "oficina", "chofer"]} />,
    children: [
      {
        element: <LayoutSegunRol />,
        children: [{ path: "/mi-cuenta", element: <PaginaMiCuenta /> }],
      },
    ],
  },
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
          { path: "/caja", element: <PaginaCaja /> },
          { path: "/agenda", element: <PaginaAgenda /> },
          { path: "/facturacion", element: <PaginaFacturacion /> },
          { path: "/flota", element: <PaginaFlota /> },
          {
            element: <RutaProtegida roles={["admin"]} />,
            children: [
              { path: "/configuracion", element: <PaginaConfiguracion /> },
            ],
          },
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
