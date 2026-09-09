import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { AvisosProvider } from "@/features/avisos/AvisosProvider";
import { router } from "@/app/router";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AvisosProvider>
        <RouterProvider router={router} />
      </AvisosProvider>
    </AuthProvider>
  </StrictMode>,
);
