import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { FingerprintPattern as Fingerprint } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada } from "@/components/ui/Campo";

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

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    buffer[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

function uint8ArrayToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function serializarCredencial(cred: PublicKeyCredential): any {
  if (typeof (cred as any).toJSON === "function") {
    return (cred as any).toJSON();
  }
  const raw = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: uint8ArrayToBase64Url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: uint8ArrayToBase64Url(raw.authenticatorData),
      clientDataJSON: uint8ArrayToBase64Url(raw.clientDataJSON),
      signature: uint8ArrayToBase64Url(raw.signature),
      userHandle: raw.userHandle ? uint8ArrayToBase64Url(raw.userHandle) : null,
    },
  };
}

export function PaginaIngresar() {
  const { session, perfil, cargando } = useAuth();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ingresandoHuella, setIngresandoHuella] = useState(false);
  const [soportaWebAuthn, setSoportaWebAuthn] = useState(false);
  const condicionalAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "PublicKeyCredential" in window) {
      setSoportaWebAuthn(true);
    }
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("PublicKeyCredential" in window) ||
      typeof PublicKeyCredential.isConditionalMediationAvailable !== "function"
    ) {
      return;
    }

    let cancelado = false;
    const abortController = new AbortController();
    condicionalAbortRef.current = abortController;

    async function iniciarUiCondicional() {
      try {
        const disponible = await PublicKeyCredential.isConditionalMediationAvailable();
        if (!disponible || cancelado) return;

        const { data: options, error: errorOpciones } =
          await supabase.auth.passkey.startAuthentication();
        if (errorOpciones || !options || cancelado) return;

        const publicKeyOptions =
          typeof (PublicKeyCredential as any).parseRequestOptionsFromJSON === "function"
            ? (PublicKeyCredential as any).parseRequestOptionsFromJSON(options.options)
            : {
                ...options.options,
                challenge: base64UrlToUint8Array(options.options.challenge).buffer,
                allowCredentials: options.options.allowCredentials?.map((c: any) => ({
                  ...c,
                  id: base64UrlToUint8Array(c.id).buffer,
                })),
              };

        const cred = (await navigator.credentials.get({
          publicKey: publicKeyOptions,
          mediation: "conditional",
          signal: abortController.signal,
        } as CredentialRequestOptions)) as PublicKeyCredential | null;

        if (!cred || cancelado) return;

        const credSerializada = serializarCredencial(cred);
        await supabase.auth.passkey.verifyAuthentication({
          challengeId: options.challenge_id,
          credential: credSerializada,
        });
      } catch {
        // En mediación condicional silenciosa no mostramos error
      }
    }

    iniciarUiCondicional();

    return () => {
      cancelado = true;
      abortController.abort();
    };
  }, []);

  if (!cargando && session && perfil) {
    return <Navigate to={perfil.rol === "chofer" ? "/chofer" : "/"} replace />;
  }

  async function ingresar(e: FormEvent) {
    e.preventDefault();
    if (condicionalAbortRef.current) {
      condicionalAbortRef.current.abort();
    }
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) setError("Email o contraseña incorrectos.");
    setEnviando(false);
  }

  async function ingresarConHuella() {
    if (condicionalAbortRef.current) {
      condicionalAbortRef.current.abort();
    }
    setError(null);
    setIngresandoHuella(true);
    try {
      const metodoSignIn =
        typeof (supabase.auth as any).signInWithPasskey === "function"
          ? (supabase.auth as any).signInWithPasskey.bind(supabase.auth)
          : (supabase.auth.passkey as any)?.signInWithPasskey?.bind(supabase.auth.passkey);

      if (!metodoSignIn) {
        throw new Error("signInWithPasskey no disponible");
      }

      const { error: errorPasskey } = await metodoSignIn();
      if (errorPasskey) {
        if (!esCancelacion(errorPasskey)) {
          setError("No se pudo ingresar con huella. Probá con tu contraseña.");
        }
      }
    } catch (err: any) {
      if (!esCancelacion(err)) {
        setError("No se pudo ingresar con huella. Probá con tu contraseña.");
      }
    } finally {
      setIngresandoHuella(false);
    }
  }

  return (
    <main className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="mb-8 flex items-center gap-3">
          <img src="/icono.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-semibold leading-tight">ELEVAPLUS</h1>
            <p className="text-sm text-tinta-suave">Gestión</p>
          </div>
        </div>

        <form onSubmit={ingresar} className="space-y-5">
          <Campo etiqueta="Email" id="email">
            <Entrada
              id="email"
              type="email"
              autoComplete="username webauthn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Campo>
          <Campo etiqueta="Contraseña" id="clave">
            <Entrada
              id="clave"
              type="password"
              autoComplete="current-password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              required
            />
          </Campo>
          {error && <p className="text-sm text-peligro">{error}</p>}
          <Boton
            type="submit"
            className="w-full"
            tamano="lg"
            disabled={enviando || ingresandoHuella}
          >
            {enviando ? "Ingresando…" : "Ingresar"}
          </Boton>
        </form>

        {soportaWebAuthn && (
          <div className="space-y-5">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-borde" />
              </div>
              <span className="relative bg-fondo px-3 text-xs uppercase text-tinta-suave">o</span>
            </div>
            <Boton
              type="button"
              variante="secundario"
              tamano="lg"
              className="w-full"
              disabled={enviando || ingresandoHuella}
              onClick={ingresarConHuella}
            >
              <Fingerprint className="h-5 w-5" />
              {ingresandoHuella ? "Ingresando…" : "Ingresar con huella"}
            </Boton>
          </div>
        )}
      </div>
    </main>
  );
}
