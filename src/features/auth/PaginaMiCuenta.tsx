import { useState } from "react";
import { Bell, BellCheck, BellOff } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Aviso } from "@/components/ui/Aviso";
import type { Rol } from "@/lib/tipos";

const etiquetasRol: Record<Rol, string> = {
  admin: "Administración",
  oficina: "Oficina",
  chofer: "Chofer",
};

export function PaginaMiCuenta() {
  const { perfil } = useAuth();

  const [permisoNotif, setPermisoNotif] = useState<NotificationPermission | "no_soportado">(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "no_soportado";
  });

  const [solicitando, setSolicitando] = useState(false);

  const solicitarPermiso = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setSolicitando(true);
    try {
      const resultado = await Notification.requestPermission();
      setPermisoNotif(resultado);
    } catch (err) {
      console.warn("Error al pedir permiso de notificaciones:", err);
    } finally {
      setSolicitando(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <EncabezadoPagina
        titulo="Mi cuenta"
        subtitulo="Perfil de usuario y configuración de avisos en este dispositivo"
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
          <h2 className="text-base font-semibold text-tinta">Avisos y notificaciones</h2>
        </div>

        <p className="text-sm text-tinta-suave leading-relaxed">
          Recibí avisos del sistema en este dispositivo cuando los choferes inicien o terminen servicios, o cuando se registren nuevos cobros o servicios no planificados.
        </p>

        {permisoNotif === "granted" && (
          <div className="flex items-start gap-3 rounded-md bg-ok-suave p-3 text-sm text-ok">
            <BellCheck className="size-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Avisos activados en este dispositivo</p>
              <p className="text-xs text-ok/80 mt-0.5">
                Vas a recibir notificaciones del sistema cuando la pestaña no esté visible.
              </p>
            </div>
          </div>
        )}

        {permisoNotif === "denied" && (
          <Aviso variante="peligro" className="flex items-start gap-3">
            <BellOff className="size-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Avisos bloqueados en el navegador</p>
              <p className="text-xs mt-0.5">
                Para recibirlos, habilitá los permisos de notificaciones para este sitio desde la barra de direcciones o la configuración del navegador.
              </p>
            </div>
          </Aviso>
        )}

        {permisoNotif === "default" && (
          <div className="pt-2">
            <Boton
              type="button"
              onClick={solicitarPermiso}
              disabled={solicitando}
            >
              <Bell className="size-4 mr-2" />
              {solicitando ? "Activando..." : "Activar avisos en este dispositivo"}
            </Boton>
          </div>
        )}

        {permisoNotif === "no_soportado" && (
          <p className="text-sm text-tinta-suave">
            Este navegador no soporta notificaciones de escritorio.
          </p>
        )}
      </Tarjeta>
    </div>
  );
}
