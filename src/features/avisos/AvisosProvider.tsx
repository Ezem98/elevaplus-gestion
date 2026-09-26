import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { Toast, type AvisoItem } from "@/components/ui/Toast";
import { formatearPesos } from "@/lib/formato";
import { ETIQUETA_MEDIO_PAGO, type MedioPago } from "@/lib/tipos";
import { router } from "@/app/router";

export interface EntradaAviso {
  titulo: string;
  detalle?: string;
  accion?: {
    texto: string;
    a: string;
  };
}

interface AvisosContextType {
  mostrarAviso: (aviso: EntradaAviso) => void;
}

const AvisosContext = createContext<AvisosContextType | null>(null);

export function useAvisos() {
  const context = useContext(AvisosContext);
  if (!context) {
    throw new Error("useAvisos debe usarse dentro de un AvisosProvider");
  }
  return context;
}

export function AvisosProvider({ children }: { children: ReactNode }) {
  const { perfil, session } = useAuth();
  const [toasts, setToasts] = useState<AvisoItem[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const cerrarAviso = useCallback((id: string) => {
    const timer = timeoutsRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const mostrarAviso = useCallback(
    (entrada: EntradaAviso) => {
      const id = Math.random().toString(36).slice(2, 9);
      const nuevoAviso: AvisoItem = {
        id,
        titulo: entrada.titulo,
        detalle: entrada.detalle,
        accion: entrada.accion,
      };

      // Si la pestaña está oculta y hay permiso, emitir Notification del sistema
      if (typeof window !== "undefined" && "Notification" in window) {
        if (document.hidden && Notification.permission === "granted") {
          try {
            const notif = new Notification("ELEVAPLUS", {
              body: entrada.titulo,
              icon: "/icono.svg",
            });
            if (entrada.accion?.a) {
              notif.onclick = () => {
                window.focus();
                router.navigate(entrada.accion!.a);
                notif.close();
              };
            }
          } catch (err) {
            console.warn("Error mostrando notificación nativa:", err);
          }
        }
      }

      setToasts((prev) => {
        // Máximo 3 visibles: si ya hay 3, descartamos el más antiguo
        const actualizados = [...prev, nuevoAviso];
        if (actualizados.length > 3) {
          const sobrantes = actualizados.slice(0, actualizados.length - 3);
          sobrantes.forEach((t) => {
            const timer = timeoutsRef.current.get(t.id);
            if (timer) {
              clearTimeout(timer);
              timeoutsRef.current.delete(t.id);
            }
          });
          return actualizados.slice(-3);
        }
        return actualizados;
      });

      // Auto-eliminar a los 8 segundos
      const timer = setTimeout(() => {
        cerrarAviso(id);
      }, 8000);
      timeoutsRef.current.set(id, timer);
    },
    [cerrarAviso]
  );

  // Suscripción en tiempo real para admin y oficina
  useEffect(() => {
    if (!perfil || (perfil.rol !== "admin" && perfil.rol !== "oficina")) {
      return;
    }

    const userIdActual = session?.user?.id ?? perfil.id;
    let activo = true;
    let canal: RealtimeChannel | null = null;

    canal = supabase
      .channel(`avisos-${userIdActual}`)
      // 1. servicio_eventos (INSERT)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "servicio_eventos" },
        async (payload) => {
          if (!activo) return;
          const nuevo = payload.new as {
            servicio_id: string;
            estado_nuevo: string;
            usuario_id: string | null;
          };

          // Solo si no fue generado por el usuario actual
          if (nuevo.usuario_id && nuevo.usuario_id === userIdActual) {
            return;
          }

          if (nuevo.estado_nuevo === "terminado") {
            const [{ data: serv }, { data: perf }] = await Promise.all([
              supabase
                .from("servicios")
                .select("numero, clientes!servicios_cliente_id_fkey(nombre)")
                .eq("id", nuevo.servicio_id)
                .maybeSingle(),
              nuevo.usuario_id
                ? supabase
                    .from("perfiles")
                    .select("nombre")
                    .eq("id", nuevo.usuario_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
            ]);

            if (!activo) return;
            const nombreUsuario = perf?.nombre || "Un chofer";
            const numServ = serv?.numero != null ? `#${serv.numero}` : "un servicio";
            const clienteNombre = (serv as any)?.clientes?.nombre || "Cliente";

            mostrarAviso({
              titulo: `${nombreUsuario} terminó el servicio ${numServ} · ${clienteNombre}`,
              accion: { texto: "Ver", a: `/servicios/${nuevo.servicio_id}` },
            });
          } else if (nuevo.estado_nuevo === "en_curso") {
            const [{ data: serv }, { data: perf }] = await Promise.all([
              supabase
                .from("servicios")
                .select("numero, clientes!servicios_cliente_id_fkey(nombre)")
                .eq("id", nuevo.servicio_id)
                .maybeSingle(),
              nuevo.usuario_id
                ? supabase
                    .from("perfiles")
                    .select("nombre")
                    .eq("id", nuevo.usuario_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
            ]);

            if (!activo) return;
            const nombreUsuario = perf?.nombre || "Un chofer";
            const numServ = serv?.numero != null ? `#${serv.numero}` : "un servicio";
            const clienteNombre = (serv as any)?.clientes?.nombre || "Cliente";

            mostrarAviso({
              titulo: `${nombreUsuario} inició el servicio ${numServ} · ${clienteNombre}`,
            });
          }
        }
      )
      // 2. servicios (INSERT con no_planificado = true)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "servicios" },
        async (payload) => {
          if (!activo) return;
          const nuevo = payload.new as {
            id: string;
            no_planificado: boolean;
            creado_por: string | null;
          };

          if (!nuevo.no_planificado) return;

          const { data: perf } = nuevo.creado_por
            ? await supabase
                .from("perfiles")
                .select("nombre")
                .eq("id", nuevo.creado_por)
                .maybeSingle()
            : { data: null };

          if (!activo) return;
          const nombreChofer = perf?.nombre || "un chofer";

          mostrarAviso({
            titulo: `Servicio no planificado cargado por ${nombreChofer}`,
            accion: { texto: "Completar", a: `/servicios/${nuevo.id}` },
          });
        }
      )
      // 3. cobros (INSERT por otro usuario)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cobros" },
        async (payload) => {
          if (!activo) return;
          const nuevo = payload.new as {
            id: string;
            monto: number;
            medio: string;
            cliente_id: string | null;
            registrado_por: string | null;
          };

          if (nuevo.registrado_por && nuevo.registrado_por === userIdActual) {
            return;
          }

          // Espera breve por aplicaciones de cobro concurrentes
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (!activo) return;

          const [{ data: cli }, { data: apps }] = await Promise.all([
            nuevo.cliente_id
              ? supabase
                  .from("clientes")
                  .select("nombre")
                  .eq("id", nuevo.cliente_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            supabase
              .from("cobro_aplicaciones")
              .select("servicio_id")
              .eq("cobro_id", nuevo.id),
          ]);

          if (!activo) return;
          const clienteNombre = cli?.nombre || "Cliente";
          const montoFormateado = formatearPesos(Number(nuevo.monto));
          const medioTexto =
            ETIQUETA_MEDIO_PAGO[nuevo.medio as MedioPago]?.toLowerCase() || nuevo.medio;

          let destinoA = "/cobros";
          if (apps && apps.length === 1 && apps[0].servicio_id) {
            destinoA = `/servicios/${apps[0].servicio_id}`;
          }

          mostrarAviso({
            titulo: `Cobro registrado: ${montoFormateado} · ${clienteNombre} · ${medioTexto}`,
            accion: { texto: "Ver", a: destinoA },
          });
        }
      )
      .subscribe();

    return () => {
      activo = false;
      if (canal) {
        supabase.removeChannel(canal);
      }
    };
  }, [perfil, session, mostrarAviso]);

  return (
    <AvisosContext.Provider value={{ mostrarAviso }}>
      {children}
      <Toast toasts={toasts} onCerrar={cerrarAviso} />
    </AvisosContext.Provider>
  );
}
