import { Boton } from "@/components/ui/Boton";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { FormularioMovimiento } from "@/features/caja/FormularioMovimiento";
import { useRealtime } from "@/hooks/use-realtime";
import { formatearFechaCorta, formatearPesos } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type { AmbitoMovimiento, ItemAgenda, Vencimiento } from "@/lib/tipos";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FormularioVencimiento } from "./FormularioVencimiento";
import { ItemAgendaCard } from "./ItemAgendaCard";
import type { ProyeccionDia } from "./ProyeccionCajaGrafico";
import { VistaLista } from "./VistaLista";
import { VistaMes } from "./VistaMes";
import { VistaSemana } from "./VistaSemana";

type TipoVista = "semana" | "mes" | "lista";
type FiltroAmbito = "todos" | "empresa" | "personal";

function obtenerHoyIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function obtenerLunesDeFecha(d: Date): string {
  const diaSemana = d.getDay(); // 0 = dom, 1 = lun, ... 6 = sab
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  const y = lunes.getFullYear();
  const m = String(lunes.getMonth() + 1).padStart(2, "0");
  const dia = String(lunes.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function modificarDias(iso: string, cantDias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + cantDias));
  return f.toISOString().slice(0, 10);
}

function formatearRangoSemana(lunesIso: string): string {
  const [y, m, d] = lunesIso.split("-").map(Number);
  const domingo = new Date(Date.UTC(y, m - 1, d + 6));
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const mesLunes = meses[m - 1];
  const mesDomingo = meses[domingo.getUTCMonth()];
  const diaLunes = d;
  const diaDomingo = domingo.getUTCDate();
  const anio = domingo.getUTCFullYear();

  if (mesLunes === mesDomingo) {
    return `${diaLunes} – ${diaDomingo} de ${mesLunes} ${anio}`;
  }
  return `${diaLunes} de ${mesLunes} – ${diaDomingo} de ${mesDomingo} ${anio}`;
}

function formatearTituloMes(mesIso: string): string {
  const [añoStr, mesStr] = mesIso.split("-");
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const idx = parseInt(mesStr, 10) - 1;
  return `${meses[idx] ?? mesStr} ${añoStr}`;
}

export function PaginaAgenda() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Estados de vista y navegación
  const [vista, setVista] = useState<TipoVista>("semana");
  const [ambito, setAmbito] = useState<FiltroAmbito>("todos");

  // Rango temporal activo
  const hoyIso = useMemo(() => obtenerHoyIso(), []);
  const [lunesSemana, setLunesSemana] = useState<string>(() =>
    obtenerLunesDeFecha(new Date()),
  );
  const [mesActual, setMesActual] = useState<string>(() => hoyIso.slice(0, 7));

  // Datos
  const [items, setItems] = useState<ItemAgenda[]>([]);
  const [itemsAtrasados, setItemsAtrasados] = useState<ItemAgenda[]>([]);
  const [proyeccion, setProyeccion] = useState<ProyeccionDia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoProyeccion, setCargandoProyeccion] = useState(true);

  // Paneles inline
  const [mostrarFormVencimiento, setMostrarFormVencimiento] = useState(false);
  const [vencimientoEditando, setVencimientoEditando] =
    useState<Vencimiento | null>(null);

  const [instanciaPagando, setInstanciaPagando] = useState<{
    id: string;
    item: ItemAgenda;
  } | null>(null);

  const [instanciaOmitiendo, setInstanciaOmitiendo] = useState<{
    id: string;
    item: ItemAgenda;
  } | null>(null);
  const [notaOmitir, setNotaOmitir] = useState("");
  const [guardandoOmitir, setGuardandoOmitir] = useState(false);

  const [mostrarAtrasadosExpandidos, setMostrarAtrasadosExpandidos] =
    useState(false);

  // Comprobar si viene ?vencimiento=<id> en la URL
  useEffect(() => {
    const vId = searchParams.get("vencimiento");
    if (vId) {
      void (async () => {
        const { data, error } = await supabase
          .from("vencimientos")
          .select("*")
          .eq("id", vId)
          .single();
        if (!error && data) {
          setVencimientoEditando(data as Vencimiento);
          setMostrarFormVencimiento(true);
        }
      })();
    }
  }, [searchParams]);

  // Cargar datos
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      // 1. Calcular fechas límites según la vista actual
      let desde = lunesSemana;
      let hasta = modificarDias(lunesSemana, 6);

      if (vista === "mes") {
        const [año, mes] = mesActual.split("-").map(Number);
        // Traer desde unos días antes hasta unos días después para el calendario mensual completo
        const primerDia = new Date(Date.UTC(año, mes - 1, 1));
        const ultimoDia = new Date(Date.UTC(año, mes, 0));
        desde = modificarDias(primerDia.toISOString().slice(0, 10), -7);
        hasta = modificarDias(ultimoDia.toISOString().slice(0, 10), 14);
      } else if (vista === "lista") {
        // En lista traer rango amplio (ej. 30 días atrás a 60 días adelante)
        desde = modificarDias(hoyIso, -30);
        hasta = modificarDias(hoyIso, 60);
      }

      // 2. Query de agenda en el rango
      let query = supabase
        .from("agenda")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: true });

      if (ambito !== "todos") {
        query = query.eq("ambito", ambito);
      }

      const { data: dataAgenda, error: errAgenda } = await query;
      if (!errAgenda && dataAgenda) {
        setItems(dataAgenda as ItemAgenda[]);
      }

      // 3. Query de atrasados (fecha < hoy y sentido !== 'info')
      let queryAtrasados = supabase
        .from("agenda")
        .select("*")
        .lt("fecha", hoyIso)
        .neq("sentido", "info")
        .order("fecha", { ascending: false });

      if (ambito !== "todos") {
        queryAtrasados = queryAtrasados.eq("ambito", ambito);
      }

      const { data: dataAtrasados, error: errAtrasados } = await queryAtrasados;
      if (!errAtrasados && dataAtrasados) {
        setItemsAtrasados(dataAtrasados as ItemAgenda[]);
      }
    } catch (e) {
      console.error("Error al cargar agenda:", e);
    } finally {
      setCargando(false);
    }
  }, [vista, ambito, lunesSemana, mesActual, hoyIso]);

  // Cargar proyección de caja (14 días, sin cuenta)
  const cargarProyeccion = useCallback(async () => {
    setCargandoProyeccion(true);
    try {
      const { data, error } = await supabase.rpc("proyeccion_caja", {
        p_dias: 14,
        p_cuenta_id: null,
      });
      if (!error && data) {
        setProyeccion(data as ProyeccionDia[]);
      }
    } catch (e) {
      console.error("Error al cargar proyeccion_caja:", e);
    } finally {
      setCargandoProyeccion(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    void cargarProyeccion();
  }, [cargarProyeccion]);

  // Realtime en las 8 tablas relacionadas
  useRealtime(
    [
      "vencimientos",
      "vencimiento_instancias",
      "cheques",
      "cobros",
      "movimientos_caja",
      "servicios",
      "eventos_flota",
      "novedades_empleado",
    ],
    () => {
      void cargarDatos();
      void cargarProyeccion();
    },
  );

  // Navegación temporal
  const navegarAtras = () => {
    if (vista === "semana") {
      setLunesSemana((prev) => modificarDias(prev, -7));
    } else if (vista === "mes") {
      const [año, mes] = mesActual.split("-").map(Number);
      const d = new Date(Date.UTC(año, mes - 2, 1));
      setMesActual(d.toISOString().slice(0, 7));
    }
  };

  const navegarAdelante = () => {
    if (vista === "semana") {
      setLunesSemana((prev) => modificarDias(prev, 7));
    } else if (vista === "mes") {
      const [año, mes] = mesActual.split("-").map(Number);
      const d = new Date(Date.UTC(año, mes, 1));
      setMesActual(d.toISOString().slice(0, 7));
    }
  };

  // Handlers para acciones sobre vencimientos
  const handleMarcarPagado = (instanciaId: string, item: ItemAgenda) => {
    setInstanciaPagando({ id: instanciaId, item });
  };

  const handleOmitir = (instanciaId: string, item: ItemAgenda) => {
    setNotaOmitir("");
    setInstanciaOmitiendo({ id: instanciaId, item });
  };

  const handleEditarVencimiento = async (vencimientoId: string) => {
    const { data } = await supabase
      .from("vencimientos")
      .select("*")
      .eq("id", vencimientoId)
      .single();
    if (data) {
      setVencimientoEditando(data as Vencimiento);
      setMostrarFormVencimiento(true);
    }
  };

  // Confirmar omitir
  const confirmarOmitir = async () => {
    if (!instanciaOmitiendo) return;
    setGuardandoOmitir(true);
    try {
      await supabase
        .from("vencimiento_instancias")
        .update({
          estado: "omitido",
          nota: notaOmitir.trim() || null,
        })
        .eq("id", instanciaOmitiendo.id);

      setInstanciaOmitiendo(null);
      await cargarDatos();
    } catch (e) {
      console.error("Error al omitir instancia:", e);
    } finally {
      setGuardandoOmitir(false);
    }
  };

  // Confirmar pago desde FormularioMovimiento
  const confirmarPagoInstancia = async (movimientoId: string) => {
    if (!instanciaPagando) return;
    try {
      // 1. Obtener la instancia para verificar vencimiento_id
      const { data: inst } = await supabase
        .from("vencimiento_instancias")
        .select("vencimiento_id")
        .eq("id", instanciaPagando.id)
        .single();

      // 2. Actualizar la instancia
      await supabase
        .from("vencimiento_instancias")
        .update({
          estado: "pagado",
          pagado_at: new Date().toISOString(),
          movimiento_id: movimientoId,
        })
        .eq("id", instanciaPagando.id);

      // 3. Si el vencimiento tiene cuotas_total, incrementar cuotas_pagadas
      if (inst?.vencimiento_id) {
        const { data: venc } = await supabase
          .from("vencimientos")
          .select("cuotas_total, cuotas_pagadas")
          .eq("id", inst.vencimiento_id)
          .single();

        if (venc?.cuotas_total != null) {
          await supabase
            .from("vencimientos")
            .update({
              cuotas_pagadas: (venc.cuotas_pagadas || 0) + 1,
            })
            .eq("id", inst.vencimiento_id);
        }
      }

      setInstanciaPagando(null);
      await cargarDatos();
      await cargarProyeccion();
    } catch (e) {
      console.error("Error al marcar pagada la instancia:", e);
    }
  };

  // Cálculo de atrasados para la franja de aviso
  const totalAtrasadosMonto = useMemo(() => {
    return itemsAtrasados.reduce((acc, it) => acc + (it.monto || 0), 0);
  }, [itemsAtrasados]);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Franja ámbar discreta de avisos (atrasados: fecha < hoy && sentido !== 'info') */}
      {itemsAtrasados.length > 0 && (
        <div className="bg-alerta-suave border border-alerta/30 rounded-[6px] p-3 text-[13px] text-alerta">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0 text-alerta" />
              <div className="truncate">
                <strong>
                  {itemsAtrasados.length}{" "}
                  {itemsAtrasados.length === 1
                    ? "vencimiento atrasado"
                    : "vencimientos atrasados"}
                </strong>
                {totalAtrasadosMonto > 0 && (
                  <span> · {formatearPesos(totalAtrasadosMonto)} total</span>
                )}
                <span className="hidden sm:inline text-tinta-suave">
                  {" "}
                  ·{" "}
                  {itemsAtrasados
                    .slice(0, 3)
                    .map(
                      (it) =>
                        `${it.titulo}${
                          it.monto ? ` (${formatearPesos(it.monto)})` : ""
                        }`,
                    )
                    .join(", ")}
                  {itemsAtrasados.length > 3 && "..."}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMostrarAtrasadosExpandidos((prev) => !prev)}
              className="text-[13px] font-semibold text-alerta hover:underline shrink-0 cursor-pointer"
            >
              {mostrarAtrasadosExpandidos ? "Ocultar" : "Ver pendientes"}
            </button>
          </div>

          {/* Panel inline con lista de atrasados si se expande */}
          {mostrarAtrasadosExpandidos && (
            <div className="mt-3 pt-3 border-t border-alerta/20 space-y-2">
              <p className="text-[12px] font-medium text-alerta">
                Compromisos vencidos no regularizados:
              </p>
              <div className="divide-y divide-alerta/15 bg-superficie rounded-[6px] border border-alerta/30 overflow-hidden">
                {itemsAtrasados.map((it) => (
                  <ItemAgendaCard
                    key={it.clave}
                    item={it}
                    onMarcarPagado={handleMarcarPagado}
                    onOmitir={handleOmitir}
                    onEditarVencimiento={handleEditarVencimiento}
                    modo="lista"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Encabezado de página y controles principales */}
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-marca" />
              <h1 className="text-[22px] lg:text-[24px] font-semibold text-tinta tracking-tight">
                Agenda
              </h1>
            </div>
            <p className="text-[13px] text-tinta-suave mt-0.5">
              Control de vencimientos, compromisos financieros, novedades y
              cobros previstos.
            </p>
          </div>

          {/* Barra de controles a la derecha */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Toggle de vista */}
            <div className="inline-flex bg-superficie border border-borde rounded-[6px] p-0.5 h-9 lg:h-10 text-[13px]">
              <button
                type="button"
                onClick={() => setVista("semana")}
                className={`px-3 py-1 font-medium rounded-[4px] transition-colors ${
                  vista === "semana"
                    ? "bg-marca-suave text-marca font-semibold"
                    : "text-tinta-suave hover:text-tinta"
                }`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setVista("mes")}
                className={`px-3 py-1 font-medium rounded-[4px] transition-colors ${
                  vista === "mes"
                    ? "bg-marca-suave text-marca font-semibold"
                    : "text-tinta-suave hover:text-tinta"
                }`}
              >
                Mes
              </button>
              <button
                type="button"
                onClick={() => setVista("lista")}
                className={`px-3 py-1 font-medium rounded-[4px] transition-colors ${
                  vista === "lista"
                    ? "bg-marca-suave text-marca font-semibold"
                    : "text-tinta-suave hover:text-tinta"
                }`}
              >
                Lista
              </button>
            </div>

            {/* Toggle de ámbito */}
            <div className="inline-flex bg-superficie border border-borde rounded-[6px] p-0.5 h-9 lg:h-10 text-[13px]">
              <button
                type="button"
                onClick={() => setAmbito("todos")}
                className={`px-2.5 lg:px-3 py-1 font-medium rounded-[4px] transition-colors ${
                  ambito === "todos"
                    ? "bg-marca-suave text-marca font-semibold"
                    : "text-tinta-suave hover:text-tinta"
                }`}
              >
                Todo
              </button>
              <button
                type="button"
                onClick={() => setAmbito("empresa")}
                className={`px-2.5 lg:px-3 py-1 font-medium rounded-[4px] transition-colors ${
                  ambito === "empresa"
                    ? "bg-marca-suave text-marca font-semibold"
                    : "text-tinta-suave hover:text-tinta"
                }`}
              >
                Empresa
              </button>
              <button
                type="button"
                onClick={() => setAmbito("personal")}
                className={`px-2.5 lg:px-3 py-1 font-medium rounded-[4px] transition-colors ${
                  ambito === "personal"
                    ? "bg-marca-suave text-marca font-semibold"
                    : "text-tinta-suave hover:text-tinta"
                }`}
              >
                Personal
              </button>
            </div>

            {/* Navegador temporal (Semana o Mes) */}
            {vista !== "lista" && (
              <div className="flex items-center bg-superficie border border-borde rounded-[6px] h-9 lg:h-10 px-1.5 gap-1">
                <button
                  type="button"
                  onClick={navegarAtras}
                  title="Anterior"
                  className="p-1 hover:bg-fondo rounded text-tinta-suave hover:text-tinta"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[12px] lg:text-[13px] font-medium text-tinta px-1 whitespace-nowrap">
                  {vista === "semana"
                    ? formatearRangoSemana(lunesSemana)
                    : formatearTituloMes(mesActual)}
                </span>
                <button
                  type="button"
                  onClick={navegarAdelante}
                  title="Siguiente"
                  className="p-1 hover:bg-fondo rounded text-tinta-suave hover:text-tinta"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Botón primario: Nuevo vencimiento */}
            <Boton
              variante="primario"
              tamano="md"
              onClick={() => {
                setVencimientoEditando(null);
                setMostrarFormVencimiento(true);
              }}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo vencimiento</span>
            </Boton>
          </div>
        </div>
      </header>

      {/* 3. Panel inline: Formulario de Nuevo / Editar Vencimiento */}
      {mostrarFormVencimiento && (
        <Tarjeta className="p-4 lg:p-6 border-marca/40 ring-1 ring-marca/20 shadow-sm">
          <div className="flex items-center justify-between mb-4 border-b border-borde pb-3">
            <div>
              <h2 className="text-[16px] font-semibold text-tinta">
                {vencimientoEditando
                  ? `Editar vencimiento: ${vencimientoEditando.titulo}`
                  : "Nuevo vencimiento recurrente o único"}
              </h2>
              <p className="text-[12px] text-tinta-suave">
                {vencimientoEditando
                  ? "Modificá la configuración del compromiso y sus próximas cuotas."
                  : "Configurá un compromiso que generará instancias automáticas en la agenda."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMostrarFormVencimiento(false);
                setVencimientoEditando(null);
                if (searchParams.has("vencimiento")) {
                  searchParams.delete("vencimiento");
                  setSearchParams(searchParams, { replace: true });
                }
              }}
              className="p-1 text-tinta-suave hover:text-tinta rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <FormularioVencimiento
            vencimientoAEditar={vencimientoEditando}
            onGuardado={async () => {
              setMostrarFormVencimiento(false);
              setVencimientoEditando(null);
              if (searchParams.has("vencimiento")) {
                searchParams.delete("vencimiento");
                setSearchParams(searchParams, { replace: true });
              }
              await cargarDatos();
              await cargarProyeccion();
            }}
            onCancelar={() => {
              setMostrarFormVencimiento(false);
              setVencimientoEditando(null);
              if (searchParams.has("vencimiento")) {
                searchParams.delete("vencimiento");
                setSearchParams(searchParams, { replace: true });
              }
            }}
          />
        </Tarjeta>
      )}

      {/* 4. Panel inline: Registrar Pago de una Instancia (con FormularioMovimiento) */}
      {instanciaPagando && (
        <Tarjeta className="p-4 lg:p-6 border-ok/40 ring-1 ring-ok/20 shadow-sm">
          <div className="flex items-center justify-between mb-4 border-b border-borde pb-3">
            <div>
              <h2 className="text-[16px] font-semibold text-tinta">
                Registrar pago: {instanciaPagando.item.titulo}
              </h2>
              <p className="text-[12px] text-tinta-suave">
                Se registrará un egreso de caja y la instancia quedará marcada
                como pagada.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInstanciaPagando(null)}
              className="p-1 text-tinta-suave hover:text-tinta rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <FormularioMovimiento
            tipoInicial="egreso"
            ambitoInicial={
              (instanciaPagando.item.ambito as AmbitoMovimiento) ?? "empresa"
            }
            montoInicial={
              instanciaPagando.item.monto
                ? Number(instanciaPagando.item.monto)
                : null
            }
            descripcionInicial={instanciaPagando.item.titulo}
            proveedorInicial={instanciaPagando.item.detalle ?? undefined}
            cuentaInicialId={instanciaPagando.item.cuenta_id ?? undefined}
            onGuardadoConId={async (movId) => {
              await confirmarPagoInstancia(movId);
            }}
            onGuardado={() => {
              setInstanciaPagando(null);
            }}
            onCancelar={() => {
              setInstanciaPagando(null);
            }}
          />
        </Tarjeta>
      )}

      {/* 5. Panel inline: Confirmar Omitir Vencimiento */}
      {instanciaOmitiendo && (
        <div className="p-4 bg-superficie border border-alerta/40 rounded-[10px] space-y-3 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-tinta">
                Omitir vencimiento: {instanciaOmitiendo.item.titulo}
              </h3>
              <p className="text-[12px] text-tinta-suave mt-0.5">
                Esta cuota de{" "}
                <strong>
                  {instanciaOmitiendo.item.monto
                    ? formatearPesos(instanciaOmitiendo.item.monto)
                    : "sin monto"}
                </strong>{" "}
                del {formatearFechaCorta(instanciaOmitiendo.item.fecha)} no se
                computará como pagada ni aparecerá como pendiente en la agenda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInstanciaOmitiendo(null)}
              className="p-1 text-tinta-suave hover:text-tinta rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-tinta-suave mb-1">
              Nota o motivo (opcional)
            </label>
            <input
              type="text"
              value={notaOmitir}
              onChange={(e) => setNotaOmitir(e.target.value)}
              placeholder="Ej: Bonificado, postergado a la próxima cuota, no corresponde pagar..."
              className="w-full px-3 py-1.5 text-[13px] bg-fondo border border-borde rounded-[6px] focus:outline-none focus:border-marca text-tinta"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Boton
              variante="secundario"
              tamano="md"
              onClick={() => setInstanciaOmitiendo(null)}
            >
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              tamano="md"
              disabled={guardandoOmitir}
              onClick={confirmarOmitir}
            >
              {guardandoOmitir ? "Omitiendo..." : "Confirmar omitir"}
            </Boton>
          </div>
        </div>
      )}

      {/* 6. Vistas principales */}
      {vista === "semana" && (
        <VistaSemana
          fechaInicioSemana={lunesSemana}
          items={items}
          cargando={cargando}
          onMarcarPagado={handleMarcarPagado}
          onOmitir={handleOmitir}
          onEditarVencimiento={handleEditarVencimiento}
          proyeccion={proyeccion}
          cargandoProyeccion={cargandoProyeccion}
        />
      )}

      {vista === "mes" && (
        <VistaMes
          mesIso={mesActual}
          items={items}
          cargando={cargando}
          onMarcarPagado={handleMarcarPagado}
          onOmitir={handleOmitir}
          onEditarVencimiento={handleEditarVencimiento}
        />
      )}

      {vista === "lista" && (
        <VistaLista
          items={items}
          cargando={cargando}
          onMarcarPagado={handleMarcarPagado}
          onOmitir={handleOmitir}
          onEditarVencimiento={handleEditarVencimiento}
        />
      )}
    </div>
  );
}
