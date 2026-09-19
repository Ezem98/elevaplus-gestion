import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada, Selector } from "@/components/ui/Campo";
import { ChipCheque } from "@/components/ui/Chip";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import {
  ConMenuContextual,
  MenuAcciones,
  type AccionMenu,
} from "@/components/ui/MenuAcciones";
import { cambiarEstadoCheque } from "@/lib/cheques";
import {
  formatearFecha,
  formatearFechaHoraCorta,
  formatearPesos,
} from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type { Cheque, ChequeEvento, Cuenta } from "@/lib/tipos";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type TipoExpansion =
  | null
  | "historial"
  | "foto"
  | "depositar"
  | "endosar"
  | "descontar"
  | "rechazar"
  | "anular";

interface FilaChequeProps {
  cheque: Cheque;
  cuentas: Cuenta[];
  saldoProyectado?: number | null;
  vista: "cartera" | "cubrir" | "historial";
  resaltado?: boolean;
  modo: "desktop" | "movil";
  onActualizado: () => void;
  onEndosar: (cheque: Cheque, aQuien: string) => void;
}

export function FilaCheque({
  cheque,
  cuentas,
  saldoProyectado,
  vista,
  resaltado,
  modo,
  onActualizado,
  onEndosar,
}: FilaChequeProps) {
  const [tipoExpansion, setTipoExpansion] = useState<TipoExpansion>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const hoyStr = new Date().toISOString().slice(0, 10);
  const yaPaso =
    cheque.fecha_pago < hoyStr &&
    (cheque.estado === "en_cartera" || cheque.estado === "emitido");

  // Estado para Depositar
  const [cuentaDepositoId, setCuentaDepositoId] = useState<string>(
    cuentas[0]?.id ?? "",
  );
  const [fechaDeposito, setFechaDeposito] = useState<string>(hoyStr);

  // Estado para Endosar
  const [endosadoA, setEndosadoA] = useState<string>(cheque.emisor ?? "");

  // Estado para Descontar
  const [descontadoNeto, setDescontadoNeto] = useState<number | null>(
    cheque.monto,
  );
  const [descontadoEn, setDescontadoEn] = useState<string>("");
  const [cuentaDescuentoId, setCuentaDescuentoId] = useState<string>(
    cuentas[0]?.id ?? "",
  );
  const [fechaDescuento, setFechaDescuento] = useState<string>(hoyStr);

  // Estado para Rechazar
  const [motivoRechazo, setMotivoRechazo] = useState<string>("");
  const [fechaRechazo, setFechaRechazo] = useState<string>(hoyStr);

  // Estado para Anular
  const [notaAnulacion, setNotaAnulacion] = useState<string>("");

  // Historial de eventos
  const [eventos, setEventos] = useState<ChequeEvento[]>([]);
  const [cargandoEventos, setCargandoEventos] = useState(false);

  // Foto del cheque
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [cargandoFoto, setCargandoFoto] = useState(false);

  useEffect(() => {
    if (tipoExpansion === "historial") {
      setCargandoEventos(true);
      supabase
        .from("cheque_eventos")
        .select("*, perfiles(nombre)")
        .eq("cheque_id", cheque.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data) {
            setEventos(data as unknown as ChequeEvento[]);
          }
          setCargandoEventos(false);
        });
    }
  }, [tipoExpansion, cheque.id]);

  useEffect(() => {
    if (tipoExpansion === "foto") {
      if (!cheque.imagen_path) {
        setFotoUrl(null);
        return;
      }
      setCargandoFoto(true);
      supabase.storage
        .from("adjuntos")
        .createSignedUrl(cheque.imagen_path, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) {
            setFotoUrl(data.signedUrl);
          }
          setCargandoFoto(false);
        });
    }
  }, [tipoExpansion, cheque.imagen_path]);

  // Manejadores de acciones
  const handleAcreditarDirecto = async () => {
    if (!window.confirm("¿Confirmás marcar este cheque como acreditado?")) {
      return;
    }
    setGuardando(true);
    try {
      await cambiarEstadoCheque({
        chequeId: cheque.id,
        nuevoEstado: "acreditado",
        fecha: hoyStr,
      });
      onActualizado();
    } catch (err: any) {
      alert("Error al acreditar cheque: " + (err.message || err));
    } finally {
      setGuardando(false);
    }
  };

  const handleDebitarDirecto = async () => {
    if (!window.confirm("¿Confirmás que este cheque propio ya fue debitado?")) {
      return;
    }
    setGuardando(true);
    try {
      await cambiarEstadoCheque({
        chequeId: cheque.id,
        nuevoEstado: "debitado",
        fecha: hoyStr,
      });
      onActualizado();
    } catch (err: any) {
      alert("Error al debitar cheque: " + (err.message || err));
    } finally {
      setGuardando(false);
    }
  };

  const handleConfirmarDeposito = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuentaDepositoId) {
      setErrorAccion("Debés seleccionar una cuenta.");
      return;
    }
    setGuardando(true);
    setErrorAccion(null);
    try {
      await cambiarEstadoCheque({
        chequeId: cheque.id,
        nuevoEstado: "depositado",
        cuentaId: cuentaDepositoId,
        fecha: fechaDeposito,
      });
      setTipoExpansion(null);
      onActualizado();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al depositar cheque.");
    } finally {
      setGuardando(false);
    }
  };

  const handleConfirmarEndoso = (e: React.FormEvent) => {
    e.preventDefault();
    if (!endosadoA.trim()) {
      setErrorAccion("Debés indicar a quién se endosa el cheque.");
      return;
    }
    setTipoExpansion(null);
    onEndosar(cheque, endosadoA.trim());
  };

  const handleConfirmarDescuento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descontadoNeto || descontadoNeto <= 0) {
      setErrorAccion("El importe neto recibido debe ser mayor a cero.");
      return;
    }
    if (descontadoNeto > cheque.monto) {
      setErrorAccion("El neto recibido no puede superar el monto del cheque.");
      return;
    }
    if (!descontadoEn.trim()) {
      setErrorAccion(
        "Debés indicar la entidad o financiera donde se descontó.",
      );
      return;
    }
    if (!cuentaDescuentoId) {
      setErrorAccion("Debés seleccionar la cuenta donde ingresó el dinero.");
      return;
    }

    setGuardando(true);
    setErrorAccion(null);

    try {
      // 1. Buscar categoría de gasto financiero ("Bancarios y comisiones")
      const { data: catData } = await supabase
        .from("categorias_movimiento")
        .select("id")
        .eq("ambito", "empresa")
        .eq("tipo", "egreso")
        .ilike("nombre", "%Bancarios y comisiones%")
        .maybeSingle();

      const categoriaBancariaId = catData?.id ?? null;

      // 2. Cambiar estado del cheque
      await cambiarEstadoCheque({
        chequeId: cheque.id,
        nuevoEstado: "descontado",
        cuentaId: cuentaDescuentoId,
        fecha: fechaDescuento,
        descontadoNeto: descontadoNeto,
        descontadoEn: descontadoEn.trim(),
      });

      // 3. Si hubo diferencia, registrar egreso automático de gastos financieros con cuenta_id = null
      const diferencia = cheque.monto - descontadoNeto;
      if (diferencia > 0) {
        const { error: errorGasto } = await supabase
          .from("movimientos_caja")
          .insert({
            fecha: fechaDescuento,
            tipo: "egreso",
            ambito: "empresa",
            categoria_id: categoriaBancariaId,
            proveedor: descontadoEn.trim(),
            descripcion: `Gasto financiero por descuento cheque #${cheque.numero || ""} en ${descontadoEn.trim()}`,
            monto: diferencia,
            medio: "otro",
            cuenta_id: null,
            estado: "pagado",
            fecha_acreditacion: null,
            tiene_comprobante: false,
          });
        if (errorGasto) throw errorGasto;
      }

      setTipoExpansion(null);
      onActualizado();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al descontar cheque.");
    } finally {
      setGuardando(false);
    }
  };

  const handleConfirmarRechazo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivoRechazo.trim()) {
      setErrorAccion("Debés indicar el motivo del rechazo.");
      return;
    }

    setGuardando(true);
    setErrorAccion(null);
    try {
      await cambiarEstadoCheque({
        chequeId: cheque.id,
        nuevoEstado: "rechazado",
        motivo: motivoRechazo.trim(),
        fecha: fechaRechazo,
      });
      setTipoExpansion(null);
      onActualizado();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al marcar cheque como rechazado.");
    } finally {
      setGuardando(false);
    }
  };

  const handleConfirmarAnulacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrorAccion(null);
    try {
      await cambiarEstadoCheque({
        chequeId: cheque.id,
        nuevoEstado: "anulado",
        nota: notaAnulacion.trim() || null,
        fecha: hoyStr,
      });
      setTipoExpansion(null);
      onActualizado();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al anular cheque.");
    } finally {
      setGuardando(false);
    }
  };

  // Construcción de acciones del menú
  const acciones: AccionMenu[] = [];

  if (cheque.tipo === "recibido") {
    if (cheque.estado === "en_cartera") {
      acciones.push({
        texto: "Depositar",
        onClick: () =>
          setTipoExpansion(tipoExpansion === "depositar" ? null : "depositar"),
      });
      acciones.push({
        texto: "Endosar",
        onClick: () =>
          setTipoExpansion(tipoExpansion === "endosar" ? null : "endosar"),
      });
      acciones.push({
        texto: "Descontar",
        onClick: () =>
          setTipoExpansion(tipoExpansion === "descontar" ? null : "descontar"),
      });
      acciones.push({ separador: true });
      acciones.push({
        texto: "Rechazado",
        onClick: () =>
          setTipoExpansion(tipoExpansion === "rechazar" ? null : "rechazar"),
        peligro: true,
      });
      acciones.push({
        texto: "Anular",
        onClick: () =>
          setTipoExpansion(tipoExpansion === "anular" ? null : "anular"),
        peligro: true,
      });
    } else if (cheque.estado === "depositado") {
      acciones.push({
        texto: "Marcar acreditado",
        onClick: handleAcreditarDirecto,
      });
      acciones.push({ separador: true });
      acciones.push({
        texto: "Rechazado",
        onClick: () =>
          setTipoExpansion(tipoExpansion === "rechazar" ? null : "rechazar"),
        peligro: true,
      });
    }
  } else {
    // tipo === 'emitido'
    if (cheque.estado === "emitido") {
      acciones.push({
        texto: "Marcar debitado",
        onClick: handleDebitarDirecto,
      });
      acciones.push({ separador: true });
      acciones.push({
        texto: "Rechazado",
        onClick: () =>
          setTipoExpansion(tipoExpansion === "rechazar" ? null : "rechazar"),
        peligro: true,
      });
      acciones.push({
        texto: "Anular",
        onClick: () =>
          setTipoExpansion(tipoExpansion === "anular" ? null : "anular"),
        peligro: true,
      });
    }
  }

  // Acciones fijas siempre disponibles
  if (acciones.length > 0) {
    acciones.push({ separador: true });
  }
  acciones.push({
    texto:
      tipoExpansion === "historial" ? "Ocultar historial" : "Ver historial",
    onClick: () =>
      setTipoExpansion(tipoExpansion === "historial" ? null : "historial"),
  });
  acciones.push({
    texto: tipoExpansion === "foto" ? "Ocultar foto" : "Foto del cheque",
    onClick: () => setTipoExpansion(tipoExpansion === "foto" ? null : "foto"),
  });

  const emisorBeneficiario =
    cheque.tipo === "recibido" ? cheque.emisor || "—" : cheque.pagado_a || "—";
  const bancoNombre = cheque.banco || cheque.cuentas?.nombre || "—";

  const renderSeccionExpansion = () => {
    if (!tipoExpansion) return null;

    return (
      <div className="border-t border-borde bg-superficie p-4 text-xs space-y-3 rounded-b-lg">
        {/* Historial de eventos */}
        {tipoExpansion === "historial" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-tinta text-sm">
                Historial de movimientos del cheque
              </span>
              <button
                type="button"
                onClick={() => setTipoExpansion(null)}
                className="text-tinta-suave hover:text-tinta"
              >
                Cerrar
              </button>
            </div>
            {cargandoEventos ? (
              <p className="text-tinta-suave py-2">Cargando eventos...</p>
            ) : eventos.length === 0 ? (
              <p className="text-tinta-suave py-2">
                No hay eventos registrados para este cheque.
              </p>
            ) : (
              <div className="divide-y divide-borde border border-borde rounded-md overflow-hidden bg-fondo">
                {eventos.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-tinta-suave tabular-nums">
                        {formatearFechaHoraCorta(ev.created_at)}
                      </span>
                      {ev.estado_anterior && (
                        <>
                          <ChipCheque estado={ev.estado_anterior} />
                          <span className="text-tinta-suave">→</span>
                        </>
                      )}
                      <ChipCheque estado={ev.estado_nuevo} />
                      {ev.perfiles?.nombre && (
                        <span className="text-tinta-suave">
                          por {ev.perfiles.nombre}
                        </span>
                      )}
                    </div>
                    {ev.nota && (
                      <span className="text-tinta italic sm:text-right">
                        "{ev.nota}"
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Foto del cheque */}
        {tipoExpansion === "foto" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-tinta text-sm">
                Foto del cheque
              </span>
              <button
                type="button"
                onClick={() => setTipoExpansion(null)}
                className="text-tinta-suave hover:text-tinta"
              >
                Cerrar
              </button>
            </div>
            {cargandoFoto ? (
              <p className="text-tinta-suave py-2">Cargando imagen...</p>
            ) : fotoUrl ? (
              <div className="space-y-2">
                <img
                  src={fotoUrl}
                  alt={`Cheque #${cheque.numero || ""}`}
                  className="max-h-72 max-w-full rounded-md border border-borde object-contain bg-fondo"
                />
                <div>
                  <a
                    href={fotoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-marca hover:underline"
                  >
                    Abrir imagen en tamaño completo ↗
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-tinta-suave py-2">
                No hay foto registrada para este cheque.
              </p>
            )}
          </div>
        )}

        {/* Depositar inline */}
        {tipoExpansion === "depositar" && (
          <form
            onSubmit={handleConfirmarDeposito}
            className="space-y-3 max-w-lg"
          >
            <span className="font-semibold text-tinta text-sm block">
              Depositar cheque en cuenta
            </span>
            {errorAccion && <p className="text-peligro">{errorAccion}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo etiqueta="Cuenta bancaria destino" id="deposito_cta">
                <Selector
                  id="deposito_cta"
                  value={cuentaDepositoId}
                  onChange={(e) => setCuentaDepositoId(e.target.value)}
                  required
                >
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Fecha de depósito" id="deposito_fecha">
                <Entrada
                  id="deposito_fecha"
                  type="date"
                  value={fechaDeposito}
                  onChange={(e) => setFechaDeposito(e.target.value)}
                  required
                />
              </Campo>
            </div>
            <div className="flex gap-2 pt-1">
              <Boton type="submit" disabled={guardando}>
                {guardando ? "Guardando..." : "Confirmar depósito"}
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                onClick={() => setTipoExpansion(null)}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        )}

        {/* Endosar inline */}
        {tipoExpansion === "endosar" && (
          <form onSubmit={handleConfirmarEndoso} className="space-y-3 max-w-lg">
            <span className="font-semibold text-tinta text-sm block">
              Endosar cheque a un tercero
            </span>
            <p className="text-tinta-suave">
              Indicá a quién se lo entregás para abrir el formulario de pago del
              gasto prefijado con este cheque por {formatearPesos(cheque.monto)}
              .
            </p>
            {errorAccion && <p className="text-peligro">{errorAccion}</p>}
            <Campo etiqueta="Endosado a" id="endoso_beneficiario">
              <Entrada
                id="endoso_beneficiario"
                placeholder="Persona o empresa a quien se endosa"
                value={endosadoA}
                onChange={(e) => setEndosadoA(e.target.value)}
                required
              />
            </Campo>
            <div className="flex gap-2 pt-1">
              <Boton type="submit">Continuar a registrar gasto</Boton>
              <Boton
                type="button"
                variante="secundario"
                onClick={() => setTipoExpansion(null)}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        )}

        {/* Descontar inline */}
        {tipoExpansion === "descontar" && (
          <form
            onSubmit={handleConfirmarDescuento}
            className="space-y-3 max-w-xl"
          >
            <span className="font-semibold text-tinta text-sm block">
              Descontar cheque (financiera o banco)
            </span>
            <p className="text-tinta-suave">
              El neto ingresa a la cuenta elegida. La diferencia se registra
              automáticamente como egreso en "Bancarios y comisiones" sin restar
              de la cuenta.
            </p>
            {errorAccion && <p className="text-peligro">{errorAccion}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo etiqueta="Neto recibido" id="desc_neto">
                <EntradaMonto
                  id="desc_neto"
                  valor={descontadoNeto}
                  onChange={(val) => setDescontadoNeto(val)}
                  required
                />
              </Campo>
              <Campo etiqueta="Financiera / Banco" id="desc_entidad">
                <Entrada
                  id="desc_entidad"
                  placeholder="Ej: Banco Galicia / Financiera Centro"
                  value={descontadoEn}
                  onChange={(e) => setDescontadoEn(e.target.value)}
                  required
                />
              </Campo>
              <Campo etiqueta="Cuenta acreditación" id="desc_cta">
                <Selector
                  id="desc_cta"
                  value={cuentaDescuentoId}
                  onChange={(e) => setCuentaDescuentoId(e.target.value)}
                  required
                >
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Fecha de acreditación" id="desc_fecha">
                <Entrada
                  id="desc_fecha"
                  type="date"
                  value={fechaDescuento}
                  onChange={(e) => setFechaDescuento(e.target.value)}
                  required
                />
              </Campo>
            </div>
            <div className="bg-fondo p-2.5 rounded border border-borde flex items-center justify-between text-xs">
              <span className="text-tinta-suave">
                Diferencia (gasto financiero automático):
              </span>
              <span className="font-semibold tabular-nums text-tinta">
                {formatearPesos(
                  Math.max(0, cheque.monto - (descontadoNeto ?? 0)),
                )}
              </span>
            </div>
            <div className="flex gap-2 pt-1">
              <Boton type="submit" disabled={guardando}>
                {guardando ? "Guardando..." : "Confirmar descuento"}
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                onClick={() => setTipoExpansion(null)}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        )}

        {/* Rechazar inline */}
        {tipoExpansion === "rechazar" && (
          <form
            onSubmit={handleConfirmarRechazo}
            className="space-y-3 max-w-lg"
          >
            <span className="font-semibold text-peligro text-sm block">
              Marcar cheque como rechazado
            </span>
            <p className="text-tinta-suave">
              {cheque.tipo === "recibido"
                ? "Se rechazará el cobro asociado y recalculará los servicios vinculados."
                : "El egreso volverá a quedar pendiente en caja."}
            </p>
            {errorAccion && <p className="text-peligro">{errorAccion}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Campo etiqueta="Motivo del rechazo" id="rechazo_motivo">
                  <Entrada
                    id="rechazo_motivo"
                    placeholder="Ej: Sin fondos, Defecto de firma, Orden de no pago..."
                    value={motivoRechazo}
                    onChange={(e) => setMotivoRechazo(e.target.value)}
                    required
                  />
                </Campo>
              </div>
              <Campo etiqueta="Fecha de rechazo" id="rechazo_fecha">
                <Entrada
                  id="rechazo_fecha"
                  type="date"
                  value={fechaRechazo}
                  onChange={(e) => setFechaRechazo(e.target.value)}
                  required
                />
              </Campo>
            </div>
            <div className="flex gap-2 pt-1">
              <Boton type="submit" variante="peligro" disabled={guardando}>
                {guardando ? "Guardando..." : "Confirmar rechazo"}
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                onClick={() => setTipoExpansion(null)}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        )}

        {/* Anular inline */}
        {tipoExpansion === "anular" && (
          <form
            onSubmit={handleConfirmarAnulacion}
            className="space-y-3 max-w-lg"
          >
            <span className="font-semibold text-peligro text-sm block">
              Anular cheque
            </span>
            {errorAccion && <p className="text-peligro">{errorAccion}</p>}
            <Campo
              etiqueta="Nota o motivo de anulación (opcional)"
              id="anular_nota"
            >
              <Entrada
                id="anular_nota"
                placeholder="Ej: Error en confección, reemplazado por otro..."
                value={notaAnulacion}
                onChange={(e) => setNotaAnulacion(e.target.value)}
              />
            </Campo>
            <div className="flex gap-2 pt-1">
              <Boton type="submit" variante="peligro" disabled={guardando}>
                {guardando ? "Guardando..." : "Confirmar anulación"}
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                onClick={() => setTipoExpansion(null)}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        )}
      </div>
    );
  };

  if (modo === "desktop") {
    const colSpan = vista === "cubrir" ? 10 : 9;
    return (
      <>
        <ConMenuContextual acciones={acciones}>
          <tr
            className={`hover:bg-fondo transition-colors ${
              resaltado ? "bg-marca-suave/30" : ""
            }`}
          >
            <td
              className={`px-4 py-3 tabular-nums whitespace-nowrap ${
                yaPaso ? "text-alerta font-medium" : "text-tinta-suave"
              }`}
            >
              {formatearFecha(cheque.fecha_pago)}
            </td>
            <td className="px-4 py-3 text-tinta-suave tabular-nums">
              {cheque.numero || "—"}
            </td>
            <td className="px-4 py-3 text-tinta-suave">{bancoNombre}</td>
            <td className="px-4 py-3 text-tinta">{emisorBeneficiario}</td>
            <td className="px-4 py-3 font-medium text-tinta">
              {cheque.cliente_id ? (
                <Link
                  to={`/clientes/${cheque.cliente_id}`}
                  className="hover:underline text-tinta"
                >
                  {cheque.clientes?.nombre ?? "—"}
                </Link>
              ) : (
                (cheque.clientes?.nombre ?? "—")
              )}
            </td>
            <td className="px-4 py-3 text-tinta-suave">
              {cheque.es_echeq ? "Sí" : "—"}
            </td>
            <td className="px-4 py-3 text-right font-semibold text-tinta tabular-nums">
              {formatearPesos(cheque.monto)}
            </td>
            {vista === "cubrir" && (
              <td
                className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${
                  saldoProyectado != null && saldoProyectado < 0
                    ? "text-peligro font-semibold"
                    : "text-tinta-suave"
                }`}
              >
                {saldoProyectado != null ? (
                  saldoProyectado < 0 ? (
                    <span
                      className="inline-flex items-center justify-end gap-1 text-peligro font-semibold"
                      title="Saldo proyectado negativo a la fecha de pago"
                    >
                      <span>⚠️</span>
                      <span>{formatearPesos(saldoProyectado)}</span>
                    </span>
                  ) : (
                    formatearPesos(saldoProyectado)
                  )
                ) : (
                  "—"
                )}
              </td>
            )}
            <td className="px-4 py-3 whitespace-nowrap">
              <ChipCheque estado={cheque.estado} />
            </td>
            <td className="px-2 py-3 text-right">
              <MenuAcciones acciones={acciones} />
            </td>
          </tr>
        </ConMenuContextual>
        {tipoExpansion && (
          <tr>
            <td colSpan={colSpan} className="p-0 border-b border-borde">
              {renderSeccionExpansion()}
            </td>
          </tr>
        )}
      </>
    );
  }

  // Modo Móvil
  return (
    <div
      className={`divide-y divide-borde ${
        resaltado ? "bg-marca-suave/20" : ""
      }`}
    >
      <div className="p-3.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-tinta truncate text-sm">
            {emisorBeneficiario} · {bancoNombre}
          </span>
          <ChipCheque estado={cheque.estado} />
        </div>
        <div className="text-[13px] text-tinta-suave truncate">
          <span className={yaPaso ? "text-alerta font-medium" : ""}>
            Pago {formatearFecha(cheque.fecha_pago)}
          </span>
          {cheque.numero ? ` · Nº ${cheque.numero}` : ""}
          {cheque.clientes?.nombre ? ` · ${cheque.clientes.nombre}` : ""}
          {cheque.es_echeq ? " · E-cheq" : ""}
        </div>
        {vista === "cubrir" && saldoProyectado != null && (
          <div className="text-xs">
            <span className="text-tinta-suave">Saldo proyectado: </span>
            <span
              className={`tabular-nums font-medium ${
                saldoProyectado < 0
                  ? "text-peligro font-semibold inline-flex items-center gap-1"
                  : "text-tinta"
              }`}
            >
              {saldoProyectado < 0 && <span>⚠️</span>}
              {formatearPesos(saldoProyectado)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <span className="text-sm font-semibold tabular-nums text-tinta">
            {formatearPesos(cheque.monto)}
          </span>
          <MenuAcciones acciones={acciones} />
        </div>
      </div>
      {tipoExpansion && renderSeccionExpansion()}
    </div>
  );
}
