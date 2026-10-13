import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";
import { PARAMETROS_PROPONER_SERVICIO } from "./proponerServicio";
import {
  ejecutarPropuestaServicio,
  type EntradaProponerServicio,
} from "./proponerServicioComun";

export const herramientaProponerServicioRealizado: HerramientaAsistente = {
  nombre: "proponer_servicio_realizado",
  descripcion:
    "Valida los datos y arma una propuesta para registrar un servicio ya realizado en el pasado (hasta 90 días hacia atrás) o en el día de hoy. Si falta información obligatoria, devuelve qué falta sin crear nada. Si la fecha es futura, devuelve un error indicando que debe utilizarse proponer_servicio. Resuelve identidades a UUIDs, cotiza traslados si no se indicó precio y crea la propuesta pendiente en la base de datos con acción 'crear_servicio_realizado' para que el usuario la confirme en la app.",
  parametros: PARAMETROS_PROPONER_SERVICIO,
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta, args: EntradaProponerServicio) {
    return ejecutarPropuestaServicio(ctx, args, { esRealizado: true });
  },
};
