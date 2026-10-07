import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compartirArchivo,
  descargarBlob,
  puedeCompartirArchivo,
} from "./compartir";

describe("compartir", () => {
  const archivoMock = new File(["contenido de prueba"], "presupuesto.pdf", {
    type: "application/pdf",
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("puedeCompartirArchivo", () => {
    it("retorna false si navigator no está definido", () => {
      vi.stubGlobal("navigator", undefined);
      expect(puedeCompartirArchivo(archivoMock)).toBe(false);
    });

    it("retorna false si navigator.canShare no es una función", () => {
      vi.stubGlobal("navigator", {});
      expect(puedeCompartirArchivo(archivoMock)).toBe(false);
    });

    it("retorna false si navigator.canShare retorna false", () => {
      const canShareMock = vi.fn().mockReturnValue(false);
      vi.stubGlobal("navigator", { canShare: canShareMock });

      expect(puedeCompartirArchivo(archivoMock)).toBe(false);
      expect(canShareMock).toHaveBeenCalledWith({ files: [archivoMock] });
    });

    it("retorna true si navigator.canShare({ files: [archivo] }) es true", () => {
      const canShareMock = vi.fn().mockReturnValue(true);
      vi.stubGlobal("navigator", { canShare: canShareMock });

      expect(puedeCompartirArchivo(archivoMock)).toBe(true);
      expect(canShareMock).toHaveBeenCalledWith({ files: [archivoMock] });
    });

    it("retorna false si navigator.canShare lanza una excepción", () => {
      const canShareMock = vi.fn().mockImplementation(() => {
        throw new TypeError("Error inesperado en canShare");
      });
      vi.stubGlobal("navigator", { canShare: canShareMock });

      expect(puedeCompartirArchivo(archivoMock)).toBe(false);
    });
  });

  describe("compartirArchivo", () => {
    it("retorna 'no_soportado' si puedeCompartirArchivo da false", async () => {
      vi.stubGlobal("navigator", {
        canShare: () => false,
        share: vi.fn(),
      });

      const resultado = await compartirArchivo({
        archivo: archivoMock,
        titulo: "Presupuesto",
        texto: "Hola",
      });

      expect(resultado).toBe("no_soportado");
    });

    it("retorna 'no_soportado' si navigator.share no existe", async () => {
      vi.stubGlobal("navigator", {
        canShare: () => true,
      });

      const resultado = await compartirArchivo({
        archivo: archivoMock,
        titulo: "Presupuesto",
        texto: "Hola",
      });

      expect(resultado).toBe("no_soportado");
    });

    it("retorna 'compartido' si navigator.share se resuelve exitosamente", async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", {
        canShare: () => true,
        share: shareMock,
      });

      const resultado = await compartirArchivo({
        archivo: archivoMock,
        titulo: "Presupuesto N° 0001",
        texto: "Hola, te paso el presupuesto",
      });

      expect(resultado).toBe("compartido");
      expect(shareMock).toHaveBeenCalledWith({
        files: [archivoMock],
        title: "Presupuesto N° 0001",
        text: "Hola, te paso el presupuesto",
      });
    });

    it("retorna 'cancelado' si el usuario descarta el diálogo (AbortError)", async () => {
      const shareMock = vi.fn().mockRejectedValue({
        name: "AbortError",
        message: "Share canceled",
      });
      vi.stubGlobal("navigator", {
        canShare: () => true,
        share: shareMock,
      });

      const resultado = await compartirArchivo({
        archivo: archivoMock,
        titulo: "Presupuesto",
        texto: "Hola",
      });

      expect(resultado).toBe("cancelado");
    });

    it("retorna 'no_soportado' si navigator.share falla con otro error", async () => {
      const shareMock = vi.fn().mockRejectedValue(new Error("Permission denied"));
      vi.stubGlobal("navigator", {
        canShare: () => true,
        share: shareMock,
      });

      const resultado = await compartirArchivo({
        archivo: archivoMock,
        titulo: "Presupuesto",
        texto: "Hola",
      });

      expect(resultado).toBe("no_soportado");
    });

    it("retorna 'sin_activacion' si el navegador rechaza por falta de gesto del usuario (NotAllowedError)", async () => {
      const error = new Error("Must be handling a user gesture");
      error.name = "NotAllowedError";
      vi.stubGlobal("navigator", {
        canShare: () => true,
        share: vi.fn().mockRejectedValue(error),
      });

      const resultado = await compartirArchivo({
        archivo: archivoMock,
        titulo: "Presupuesto",
        texto: "Hola",
      });

      expect(resultado).toBe("sin_activacion");
    });
  });

  describe("descargarBlob", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("crea un elemento ancla, dispara la descarga y revoca la URL después de un tiempo", () => {
      const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/1234");
      const revokeObjectURLMock = vi.fn();
      vi.stubGlobal("URL", {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      });

      const clickMock = vi.fn();
      const mockElement = {
        href: "",
        download: "",
        click: clickMock,
      };

      const appendChildMock = vi.fn();
      const removeChildMock = vi.fn();

      vi.stubGlobal("document", {
        createElement: vi.fn().mockReturnValue(mockElement),
        body: {
          appendChild: appendChildMock,
          removeChild: removeChildMock,
        },
      });

      const blob = new Blob(["test"], { type: "application/pdf" });
      descargarBlob(blob, "Presupuesto-0042.pdf");

      expect(createObjectURLMock).toHaveBeenCalledWith(blob);
      expect(mockElement.href).toBe("blob:http://localhost/1234");
      expect(mockElement.download).toBe("Presupuesto-0042.pdf");
      expect(appendChildMock).toHaveBeenCalledWith(mockElement);
      expect(clickMock).toHaveBeenCalled();
      expect(removeChildMock).toHaveBeenCalledWith(mockElement);

      // Avanzar temporizador para verificar la revocación de la URL
      vi.advanceTimersByTime(5000);
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:http://localhost/1234");
    });
  });
});
