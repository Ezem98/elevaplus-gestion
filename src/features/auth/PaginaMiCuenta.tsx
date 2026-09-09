import { useEffect, useState } from "react";
import { Bell, BellCheck, BellOff, Info } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Aviso } from "@/components/ui/Aviso";
import {
  estadoPush,
  suscribirPush,
  desuscribirPush,
  esIosSinInstalar,
  type EstadoPush,
} from "@/features/avisos/push";
import type { Rol } from "@/lib/tipos";

const etiquetasRol: Record<Rol, string> = {
  admin: "Administración",
  oficina: "Oficina",
  chofer: "Chofer",
};

export function PaginaMiCuenta() {
  const { perfil } = useAuth();
  const [estado, setEstado] = useState<EstadoPush | "cargando">("cargando");
  const [procesando, setProcesando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const esIosNoInstalado = esIosSinInstalar();
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  const refrescarEstado = async () => {
    try {
      const res = await estadoPush();
      setEstado(res);
    } catch {
      setEstado("inactivo");
    }
  };

  useEffect(() => {
    refrescarEstado();
  }, []);

  const handleActivar = async () => {
    setErrorMsg(null);
    setProcesando(true);
    try {
      if (!vapidKey) {
        throw new Error(
          "Falta la clave VAPID pública en el entorno (VITE_VAPID_PUBLIC_KEY). Configurala para poder activar notificaciones."
        );
      }
      await suscribirPush(vapidKey);
      await refrescarEstado();
    } catch (err: any) {
      console.error("Error al activar notificaciones:", err);
      setErrorMsg(err?.message || "No se pudieron activar las notificaciones");
      await refrescarEstado();
    } finally {
      setProcesando(false);
    }
  };

  const handleDesactivar = async () => {
    setErrorMsg(null);
    setProcesando(true);
    try {
      await desuscribirPush();
      await refrescarEstado();
    } catch (err: any) {
      console.error("Error al desactivar notificaciones:", err);
      setErrorMsg(err?.message || "No se pudieron desactivar las notificaciones");
      await refrescarEstado();
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <EncabezadoPagina
        titulo="Mi cuenta"
        subtitulo="Perfil de usuario y configuración de notificaciones en este dispositivo"
      />

      <Tarjeta className="p-6 space-y-4">
        <h2 className="text-base font-semibold text-tinta">Datos personales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="block text-xs font-medium text-tinta-suave mb-1">Nombre</span>
            <span className="font-semibold text-tinta">{perfil?.nombre || "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-tinta-suave mb-1">Rol</span>
            <span className="font-semibold text-tinta">
              {perfil?.rol ? etiquetasRol[perfil.rol] : "—"}
            </span>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-marca" />
          <h2 className="text-base font-semibold text-tinta">Notificaciones</h2>
        </div>

        <p className="text-sm text-tinta-suave leading-relaxed">
          Recibí notificaciones en este dispositivo cuando los choferes inicien o terminen servicios, o cuando se registren nuevos cobros o servicios no planificados.
        </p>

        {esIosNoInstalado && (
          <Aviso variante="alerta" className="flex items-start gap-3">
            <Info className="size-5 shrink-0 mt-0.5" />
            <p className="text-sm">
              En iPhone, primero agregá la app a la pantalla de inicio (Compartir → Agregar a inicio) para poder activar notificaciones.
            </p>
          </Aviso>
        )}

        {errorMsg && (
          <Aviso variante="peligro">
            {errorMsg}
          </Aviso>
        )}

        {estado === "cargando" && (
          <p className="text-sm text-tinta-suave">Comprobando estado de notificaciones...</p>
        )}

        {estado === "activo" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-md bg-ok-suave p-3 text-sm text-ok">
              <BellCheck className="size-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Activas en este dispositivo</p>
                <p className="text-xs text-ok/80 mt-0.5">
                  Este navegador está registrado para recibir notificaciones push en tiempo real.
                </p>
              </div>
            </div>

            <div>
              <Boton
                type="button"
                variante="secundario"
                onClick={handleDesactivar}
                disabled={procesando}
              >
                {procesando ? "Desactivando..." : "Desactivar"}
              </Boton>
            </div>
          </div>
        )}

        {estado === "inactivo" && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-tinta">
              No activadas
            </p>

            <div>
              <Boton
                type="button"
                onClick={handleActivar}
                disabled={procesando}
              >
                <Bell className="size-4 mr-2" />
                {procesando ? "Activando..." : "Activar notificaciones"}
              </Boton>
            </div>
          </div>
        )}

        {estado === "denegado" && (
          <Aviso variante="peligro" className="flex items-start gap-3">
            <BellOff className="size-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Bloqueadas: habilitalas desde la configuración del navegador</p>
              <p className="text-xs mt-0.5">
                Para recibirlas, autorizá los permisos de notificaciones para este sitio en la barra de direcciones de tu navegador.
              </p>
            </div>
          </Aviso>
        )}

        {estado === "no-soportado" && (
          <p className="text-sm text-tinta-suave">
            Este navegador no las soporta
          </p>
        )}
      </Tarjeta>
    </div>
  );
}
