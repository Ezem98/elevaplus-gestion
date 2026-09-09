import { supabase } from "@/lib/supabase";

export type EstadoPush = "no-soportado" | "denegado" | "activo" | "inactivo";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function obtenerDispositivo(): string {
  if (typeof navigator === "undefined") return "Dispositivo web";
  const ua = navigator.userAgent;
  let plataforma = "Navegador web";
  if (/iPad|iPhone|iPod/.test(ua)) plataforma = "iPhone/iPad";
  else if (/Android/.test(ua)) plataforma = "Android";
  else if (/Macintosh|Mac OS X/.test(ua)) plataforma = "macOS";
  else if (/Windows NT/.test(ua)) plataforma = "Windows";
  else if (/Linux/.test(ua)) plataforma = "Linux";

  let navegador = "";
  if (/Edg\//.test(ua)) navegador = "Edge";
  else if (/Chrome\//.test(ua)) navegador = "Chrome";
  else if (/Safari\//.test(ua)) navegador = "Safari";
  else if (/Firefox\//.test(ua)) navegador = "Firefox";

  return navegador ? `${plataforma} · ${navegador}` : plataforma;
}

export function esIosSinInstalar(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const esIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone;
  return esIos && standalone === false;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "no-soportado";
  }

  if (Notification.permission === "denied") {
    return "denegado";
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      return "activo";
    }
  } catch (err) {
    console.warn("Error consultando estado de push:", err);
  }

  return "inactivo";
}

export async function suscribirPush(vapidPublicKey: string) {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    throw new Error("Este navegador no soporta notificaciones push");
  }

  if (!vapidPublicKey) {
    throw new Error("Falta configurar la clave VAPID pública (VITE_VAPID_PUBLIC_KEY)");
  }

  // 1. Pide permiso explícito al usuario
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error("El permiso de notificaciones fue denegado");
  }

  // 2. Obtiene registro del service worker y suscribe con pushManager
  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  const json = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh =
    json.keys?.p256dh ||
    (subscription.getKey("p256dh")
      ? arrayBufferToBase64(subscription.getKey("p256dh")!)
      : "");
  const auth =
    json.keys?.auth ||
    (subscription.getKey("auth")
      ? arrayBufferToBase64(subscription.getKey("auth")!)
      : "");

  if (!endpoint || !p256dh || !auth) {
    throw new Error("No se pudieron obtener las credenciales completas de la suscripción");
  }

  // 3. Obtiene usuario actual de Supabase
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No hay una sesión activa para asociar la suscripción");
  }

  const dispositivo = obtenerDispositivo();

  // 4. Upsert en push_suscripciones por endpoint
  const { error } = await supabase.from("push_suscripciones").upsert(
    {
      usuario_id: user.id,
      endpoint,
      p256dh,
      auth,
      dispositivo,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("Error guardando suscripción push en base de datos:", error);
    throw error;
  }

  return subscription;
}

export async function desuscribirPush() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const { error } = await supabase
        .from("push_suscripciones")
        .delete()
        .eq("endpoint", endpoint);

      if (error) {
        console.warn("Error eliminando fila en push_suscripciones:", error);
      }
    }
  } catch (err) {
    console.warn("Error al desuscribir push:", err);
    throw err;
  }
}
