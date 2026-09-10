import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellCheck, BellOff, FingerprintPattern as Fingerprint, Info } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Aviso } from "@/components/ui/Aviso";
import { supabase } from "@/lib/supabase";
import { formatearFecha } from "@/lib/formato";
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

interface PasskeyItem {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
}

function derivarNombreDispositivo(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "Celular Android";
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh|mac os x/i.test(ua)) return "Mac";
  if (/linux/i.test(ua)) return "Linux";
  return "Dispositivo";
}

function esCancelacion(err: any): boolean {
  if (!err) return false;
  const name = err.name || err.cause?.name;
  if (name === "NotAllowedError" || name === "AbortError") return true;
  if (err.code === "ERROR_CEREMONY_ABORTED") return true;
  const msg = String(err.message || "").toLowerCase();
  if (
    msg.includes("abort") ||
    msg.includes("cancel") ||
    msg.includes("not allowed") ||
    msg.includes("the operation was aborted") ||
    msg.includes("user cancelled")
  ) {
    return true;
  }
  return false;
}

export function PaginaMiCuenta() {
  const { perfil } = useAuth();

  // Estados de passkeys
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [cargandoPasskeys, setCargandoPasskeys] = useState(true);
  const [registrandoHuella, setRegistrandoHuella] = useState(false);
  const [errorHuella, setErrorHuella] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [soportaWebAuthn, setSoportaWebAuthn] = useState(false);

  // Estados de notificaciones push
  const [estadoPushNotif, setEstadoPushNotif] = useState<EstadoPush | "cargando">("cargando");
  const [procesandoPush, setProcesandoPush] = useState(false);
  const [errorPush, setErrorPush] = useState<string | null>(null);

  const esIosNoInstalado = esIosSinInstalar();
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  const cargarPasskeys = useCallback(async () => {
    setCargandoPasskeys(true);
    try {
      const { data, error } = await supabase.auth.passkey.list();
      if (!error && data) {
        setPasskeys(data as PasskeyItem[]);
      }
    } catch (err) {
      console.error("Error al cargar passkeys:", err);
    } finally {
      setCargandoPasskeys(false);
    }
  }, []);

  const refrescarEstadoPush = async () => {
    try {
      const res = await estadoPush();
      setEstadoPushNotif(res);
    } catch {
      setEstadoPushNotif("inactivo");
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "PublicKeyCredential" in window) {
      setSoportaWebAuthn(true);
    }
    cargarPasskeys();
    refrescarEstadoPush();
  }, [cargarPasskeys]);

  const handleRegistrarHuella = async () => {
    setErrorHuella(null);
    setMensajeExito(null);
    setRegistrandoHuella(true);
    try {
      const { data, error } = await supabase.auth.registerPasskey();
      if (error) {
        if (!esCancelacion(error)) {
          setErrorHuella("No se pudo registrar la huella en este dispositivo.");
        }
        return;
      }

      if (data?.id) {
        const nombreDispositivo = derivarNombreDispositivo();
        try {
          await supabase.auth.passkey.update({
            passkeyId: data.id,
            friendlyName: nombreDispositivo,
          });
        } catch (errActualizar) {
          console.warn("No se pudo actualizar el nombre del passkey:", errActualizar);
        }
      }

      setMensajeExito("Listo. La próxima vez podés entrar con la huella.");
      await cargarPasskeys();
    } catch (err: any) {
      if (!esCancelacion(err)) {
        setErrorHuella("No se pudo registrar la huella en este dispositivo.");
      }
    } finally {
      setRegistrandoHuella(false);
    }
  };

  const handleQuitarPasskey = async (id: string) => {
    const confirmar = window.confirm("¿Seguro que querés quitar este ingreso con huella?");
    if (!confirmar) return;

    setErrorHuella(null);
    setMensajeExito(null);
    try {
      const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
      if (error) {
        setErrorHuella("No se pudo quitar el ingreso con huella.");
        return;
      }
      await cargarPasskeys();
    } catch {
      setErrorHuella("No se pudo quitar el ingreso con huella.");
    }
  };

  const handleActivarPush = async () => {
    setErrorPush(null);
    setProcesandoPush(true);
    try {
      if (!vapidKey) {
        throw new Error(
          "Falta la clave VAPID pública en el entorno (VITE_VAPID_PUBLIC_KEY). Configurala para poder activar notificaciones."
        );
      }
      await suscribirPush(vapidKey);
      await refrescarEstadoPush();
    } catch (err: any) {
      console.error("Error al activar notificaciones:", err);
      setErrorPush(err?.message || "No se pudieron activar las notificaciones");
      await refrescarEstadoPush();
    } finally {
      setProcesandoPush(false);
    }
  };

  const handleDesactivarPush = async () => {
    setErrorPush(null);
    setProcesandoPush(true);
    try {
      await desuscribirPush();
      await refrescarEstadoPush();
    } catch (err: any) {
      console.error("Error al desactivar notificaciones:", err);
      setErrorPush(err?.message || "No se pudieron desactivar las notificaciones");
      await refrescarEstadoPush();
    } finally {
      setProcesandoPush(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {perfil?.rol === "chofer" && (
        <div>
          <Link
            to="/chofer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-marca hover:underline"
          >
            ← Volver a Mis servicios
          </Link>
        </div>
      )}

      <EncabezadoPagina
        titulo="Mi cuenta"
        subtitulo="Perfil de usuario, ingreso biométrico y notificaciones"
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
          <Fingerprint className="size-5 text-marca" />
          <h2 className="text-base font-semibold text-tinta">Ingreso con huella</h2>
        </div>

        <p className="text-sm text-tinta-suave leading-relaxed">
          Iniciá sesión rápidamente con la huella, Face ID o bloqueo de pantalla de este dispositivo, sin escribir tu contraseña.
        </p>

        {!soportaWebAuthn && (
          <Aviso variante="alerta">
            Este dispositivo no permite ingreso con huella.
          </Aviso>
        )}

        {errorHuella && (
          <Aviso variante="peligro">
            {errorHuella}
          </Aviso>
        )}

        {mensajeExito && (
          <div className="rounded-md bg-ok-suave p-3 text-sm text-ok">
            {mensajeExito}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">
            Dispositivos registrados
          </h3>

          {cargandoPasskeys ? (
            <p className="text-sm text-tinta-suave">Cargando dispositivos…</p>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-tinta-suave">No tenés ningún dispositivo registrado.</p>
          ) : (
            <ul className="divide-y divide-borde rounded-md border border-borde bg-superficie">
              {passkeys.map((pk) => (
                <li key={pk.id} className="flex items-center justify-between p-3 text-sm">
                  <div className="min-w-0 flex items-center gap-3">
                    <Fingerprint className="size-5 shrink-0 text-tinta-suave" />
                    <div>
                      <p className="font-medium text-tinta truncate">
                        {pk.friendly_name || "Dispositivo"}
                      </p>
                      <p className="text-xs text-tinta-suave">
                        Registrado el {formatearFecha(pk.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuitarPasskey(pk.id)}
                    className="ml-3 text-xs font-medium text-peligro hover:underline shrink-0"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {soportaWebAuthn && (
          <div className="pt-2">
            <Boton
              type="button"
              variante="primario"
              onClick={handleRegistrarHuella}
              disabled={registrandoHuella}
            >
              <Fingerprint className="size-4 mr-2" />
              {registrandoHuella ? "Registrando…" : "Activar huella en este dispositivo"}
            </Boton>
          </div>
        )}
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

        {errorPush && (
          <Aviso variante="peligro">
            {errorPush}
          </Aviso>
        )}

        {estadoPushNotif === "cargando" && (
          <p className="text-sm text-tinta-suave">Comprobando estado de notificaciones...</p>
        )}

        {estadoPushNotif === "activo" && (
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
                onClick={handleDesactivarPush}
                disabled={procesandoPush}
              >
                {procesandoPush ? "Desactivando..." : "Desactivar"}
              </Boton>
            </div>
          </div>
        )}

        {estadoPushNotif === "inactivo" && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-tinta">
              No activadas
            </p>

            <div>
              <Boton
                type="button"
                onClick={handleActivarPush}
                disabled={procesandoPush}
              >
                <Bell className="size-4 mr-2" />
                {procesandoPush ? "Activando..." : "Activar notificaciones"}
              </Boton>
            </div>
          </div>
        )}

        {estadoPushNotif === "denegado" && (
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

        {estadoPushNotif === "no-soportado" && (
          <p className="text-sm text-tinta-suave">
            Este navegador no las soporta
          </p>
        )}
      </Tarjeta>
    </div>
  );
}
