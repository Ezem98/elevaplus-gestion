/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// Precache de assets generados por Vite / Workbox
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navegación SPA (excepto llamadas a la API)
const handler = createHandlerBoundToURL("/index.html");
const navigationRoute = new NavigationRoute(handler, {
  denylist: [/^\/api/],
});
registerRoute(navigationRoute);

// Evento push: recibe el payload y muestra la notificación del sistema
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json() as {
      titulo?: string;
      cuerpo?: string;
      body?: string;
      url?: string;
      tag?: string;
    };

    const titulo = payload.titulo || "ELEVAPLUS";
    const body = payload.cuerpo || payload.body || "";
    const url = payload.url || "/";
    const tag = payload.tag;

    event.waitUntil(
      self.registration.showNotification(titulo, {
        body,
        icon: "/icono-192.png",
        badge: "/icono-192.png",
        tag,
        data: { url },
      })
    );
  } catch (err) {
    console.warn("Error al procesar push notification:", err);
  }
});

// Evento notificationclick: enfoca una ventana abierta o abre una nueva con la URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlParaAbrir = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(urlParaAbrir);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlParaAbrir);
      }
    })
  );
});
