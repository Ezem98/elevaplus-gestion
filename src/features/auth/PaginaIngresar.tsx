import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada } from "@/components/ui/Campo";

export function PaginaIngresar() {
  const { session, perfil, cargando } = useAuth();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!cargando && session && perfil) {
    return <Navigate to={perfil.rol === "chofer" ? "/chofer" : "/"} replace />;
  }

  async function ingresar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) setError("Email o contraseña incorrectos.");
    setEnviando(false);
  }

  return (
    <main className="grid min-h-full place-items-center p-6">
      <form onSubmit={ingresar} className="w-full max-w-sm space-y-5">
        <div className="mb-8 flex items-center gap-3">
          <img src="/icono.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-semibold leading-tight">ELEVAPLUS</h1>
            <p className="text-sm text-tinta-suave">Gestión</p>
          </div>
        </div>
        <Campo etiqueta="Email" id="email">
          <Entrada id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Campo>
        <Campo etiqueta="Contraseña" id="clave">
          <Entrada id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
        </Campo>
        {error && <p className="text-sm text-peligro">{error}</p>}
        <Boton type="submit" className="w-full" tamano="lg" disabled={enviando}>
          {enviando ? "Ingresando…" : "Ingresar"}
        </Boton>
      </form>
    </main>
  );
}
