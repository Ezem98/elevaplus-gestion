import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icono.svg"],
      manifest: {
        name: "ELEVAPLUS Gestión",
        short_name: "ELEVAPLUS",
        description: "Servicios, alquileres y cobranzas de ELEVAPLUS",
        lang: "es-AR",
        theme_color: "#1E4FA8",
        background_color: "#F5F7FA",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        // La app depende de Supabase; cacheamos solo el shell, nunca datos.
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
