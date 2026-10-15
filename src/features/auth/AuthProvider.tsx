import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Perfil } from "@/lib/tipos";
import { limpiarTodosLosBorradores } from "@/hooks/useBorrador";

interface AuthCtx {
  session: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  salir: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ session: null, perfil: null, cargando: true, salir: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        limpiarTodosLosBorradores();
      }
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Supabase vuelve a emitir SIGNED_IN / TOKEN_REFRESHED con un objeto de sesión
  // nuevo cada vez que la pestaña recupera el foco. Si dependiéramos de `session`,
  // `cargando` pasaría a true, RutaProtegida mostraría "Cargando…" y se desmontaría
  // toda la pantalla (formularios a medio cargar, chat de Chimuelo). Por eso el
  // perfil se busca solo cuando cambia el usuario.
  const usuarioId = session?.user.id ?? null;

  useEffect(() => {
    if (!usuarioId) {
      setPerfil(null);
      setCargando(false);
      return;
    }
    let vigente = true;
    setCargando(true);
    supabase
      .from("perfiles")
      .select("id, nombre, rol, telefono, activo")
      .eq("id", usuarioId)
      .single()
      .then(({ data }) => {
        if (!vigente) return;
        setPerfil((data as Perfil) ?? null);
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [usuarioId]);

  const salir = async () => {
    limpiarTodosLosBorradores();
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ session, perfil, cargando, salir }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
