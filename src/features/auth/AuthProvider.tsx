import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Perfil } from "@/lib/tipos";

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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setPerfil(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    supabase
      .from("perfiles")
      .select("id, nombre, rol, telefono, activo")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setPerfil((data as Perfil) ?? null);
        setCargando(false);
      });
  }, [session]);

  const salir = async () => {
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ session, perfil, cargando, salir }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
