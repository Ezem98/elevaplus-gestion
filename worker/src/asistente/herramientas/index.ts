import type { HerramientaAsistente, RolPermitidoAsistente } from "../tipos";
import { herramientaAgendaProxima } from "./agenda";
import { herramientaChequesProximos } from "./cheques";
import { herramientaBuscarCliente, herramientaSaldoCliente } from "./clientes";
import { herramientaPendientesFacturar, herramientaResumenCobranzas } from "./cobranzas";
import { herramientaChoferesDisponibles } from "./choferes";
import { herramientaCotizarTraslado } from "./cotizarTraslado";
import { herramientaEstadoMaquina } from "./maquinas";
import { herramientaProponerServicio } from "./proponerServicio";
import { herramientaResolverFecha } from "./resolverFecha";
import {
  herramientaBuscarServicio,
  herramientaServiciosDelDia,
  herramientaServiciosSinCerrar,
} from "./servicios";

export {
  herramientaAgendaProxima,
  herramientaBuscarCliente,
  herramientaBuscarServicio,
  herramientaChoferesDisponibles,
  herramientaCotizarTraslado,
  herramientaEstadoMaquina,
  herramientaPendientesFacturar,
  herramientaProponerServicio,
  herramientaResolverFecha,
  herramientaResumenCobranzas,
  herramientaSaldoCliente,
  herramientaServiciosDelDia,
  herramientaServiciosSinCerrar,
};

export const TODAS_LAS_HERRAMIENTAS: HerramientaAsistente[] = [
  herramientaResolverFecha,
  herramientaCotizarTraslado,
  herramientaBuscarCliente,
  herramientaSaldoCliente,
  herramientaServiciosDelDia,
  herramientaServiciosSinCerrar,
  herramientaResumenCobranzas,
  herramientaPendientesFacturar,
  herramientaChequesProximos,
  herramientaAgendaProxima,
  herramientaEstadoMaquina,
  herramientaBuscarServicio,
  herramientaChoferesDisponibles,
  herramientaProponerServicio,
];

const MAPA_HERRAMIENTAS = new Map<string, HerramientaAsistente>(
  TODAS_LAS_HERRAMIENTAS.map((h) => [h.nombre, h]),
);

/**
 * Obtiene las herramientas permitidas para el rol del usuario (admin u oficina).
 */
export function obtenerHerramientasPorRol(
  rol: RolPermitidoAsistente,
): HerramientaAsistente[] {
  return TODAS_LAS_HERRAMIENTAS.filter((h) => h.roles.includes(rol));
}

/**
 * Busca una herramienta por su nombre registrado.
 */
export function obtenerHerramientaPorNombre(
  nombre: string,
): HerramientaAsistente | undefined {
  return MAPA_HERRAMIENTAS.get(nombre);
}
