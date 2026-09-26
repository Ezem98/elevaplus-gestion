import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada, Selector } from "@/components/ui/Campo";
import { ChipMovimiento } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { MenuAcciones, type AccionMenu } from "@/components/ui/MenuAcciones";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRealtime } from "@/hooks/use-realtime";
import {
  formatearFecha,
  formatearMes,
  formatearPesos,
  formatearRangoSemana,
  formatearSemanaCorta,
  modificarDias,
  obtenerLunesSemana,
} from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type {
  AmbitoMovimiento,
  CategoriaMovimiento,
  Cuenta,
  EstadoMovimiento,
  MovimientoCaja,
  SaldoCuenta,
  TipoMovimiento,
} from "@/lib/tipos";
import {
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FormularioMovimiento } from "./FormularioMovimiento";
import {
  GraficoSemanalCaja,
  type DiaResumenSemanal,
} from "./GraficoSemanalCaja";

type ClavePestana = "movimientos" | "resumen" | "cuentas";
type PeriodoModo = "mes" | "semana";

interface ItemUnificado {
  id: string;
  esCobro: boolean;
  fecha: string;
  tipo: TipoMovimiento;
  ambito: AmbitoMovimiento;
  categoriaId?: string | null;
  categoriaNombre: string;
  cuentaId?: string | null;
  cuentaNombre: string;
  cuentaDestinoNombre?: string | null;
  descripcion: string;
  origenProveedor: string | null;
  monto: number;
  estado: EstadoMovimiento;
  linkCobro?: string;
  movimientoOriginal?: MovimientoCaja;
}

function normalizarPestana(param: string | null): ClavePestana {
  if (param === "resumen" || param === "cuentas" || param === "movimientos") {
    return param;
  }
  return "movimientos";
}

function normalizarAmbito(param: string | null): "todo" | AmbitoMovimiento {
  if (param === "empresa" || param === "personal") {
    return param;
  }
  return "todo";
}

function normalizarPeriodo(param: string | null): PeriodoModo {
  if (param === "semana") {
    return "semana";
  }
  return "mes";
}

export function PaginaCaja() {
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === "admin";

  const [searchParams, setSearchParams] = useSearchParams();
  const pestanaActiva = normalizarPestana(searchParams.get("tab"));
  const ambitoFiltro = normalizarAmbito(searchParams.get("ambito"));

  // Período de Resumen (Semana · Mes)
  const periodoModo = normalizarPeriodo(searchParams.get("periodo"));
  const desdeParam = searchParams.get("desde");
  const [lunesFiltro, setLunesFiltro] = useState<string>(() =>
    desdeParam
      ? obtenerLunesSemana(desdeParam)
      : obtenerLunesSemana(new Date()),
  );

  // Filtros de Movimientos
  const mesActualStr = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const [mesFiltro, setMesFiltro] = useState<string>(
    searchParams.get("mes") || mesActualStr,
  );
  const [cuentaFiltro, setCuentaFiltro] = useState<string>("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("");
  const movimientoDestacadoId = searchParams.get("movimiento");

  useEffect(() => {
    const mesParam = searchParams.get("mes");
    if (mesParam) {
      setMesFiltro(mesParam);
    }
    const dParam = searchParams.get("desde");
    if (dParam) {
      setLunesFiltro(obtenerLunesSemana(dParam));
    }
  }, [searchParams]);

  // Cuentas y Categorías activas
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [categorias, setCategorias] = useState<CategoriaMovimiento[]>([]);
  const [saldosCuentas, setSaldosCuentas] = useState<SaldoCuenta[]>([]);

  // Datos
  const [itemsUnificados, setItemsUnificados] = useState<ItemUnificado[]>([]);
  const [cargando, setCargando] = useState(true);

  // Formulario inline
  const [tipoFormulario, setTipoFormulario] = useState<TipoMovimiento | null>(
    null,
  );
  const [movimientoAEditar, setMovimientoAEditar] =
    useState<MovimientoCaja | null>(null);

  // Edición inline de saldo inicial en Cuentas
  const [editandoCuentaId, setEditandoCuentaId] = useState<string | null>(null);
  const [valorSaldoInicial, setValorSaldoInicial] = useState<number | null>(
    null,
  );
  const [guardandoSaldoInicial, setGuardandoSaldoInicial] = useState(false);

  // Alta de nueva cuenta
  const [creandoCuenta, setCreandoCuenta] = useState(false);
  const [nombreNuevaCuenta, setNombreNuevaCuenta] = useState("");
  const [saldoInicialNuevaCuenta, setSaldoInicialNuevaCuenta] = useState<
    number | null
  >(null);
  const [guardandoNuevaCuenta, setGuardandoNuevaCuenta] = useState(false);

  // 12 meses para el selector
  const mesesOpciones = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const valor = d.toISOString().slice(0, 7);
    const etiqueta = formatearMes(valor);
    return { valor, etiqueta };
  });

  const cambiarPestana = (tab: ClavePestana) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  const cambiarAmbito = (amb: "todo" | AmbitoMovimiento) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (amb === "todo") {
        next.delete("ambito");
      } else {
        next.set("ambito", amb);
      }
      return next;
    });
  };

  const cambiarPeriodoModo = (nuevoModo: PeriodoModo) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nuevoModo === "semana") {
        next.set("periodo", "semana");
        next.set("desde", lunesFiltro);
      } else {
        next.delete("periodo");
        next.delete("desde");
        next.set("mes", mesFiltro);
      }
      return next;
    });
  };

  const navegarPeriodoAnterior = () => {
    if (periodoModo === "semana") {
      const nuevoLunes = modificarDias(lunesFiltro, -7);
      setLunesFiltro(nuevoLunes);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("periodo", "semana");
        next.set("desde", nuevoLunes);
        return next;
      });
    } else {
      const [y, m] = mesFiltro.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 2, 1));
      const nuevoMes = d.toISOString().slice(0, 7);
      setMesFiltro(nuevoMes);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("mes", nuevoMes);
        return next;
      });
    }
  };

  const navegarPeriodoSiguiente = () => {
    if (periodoModo === "semana") {
      const nuevoLunes = modificarDias(lunesFiltro, 7);
      setLunesFiltro(nuevoLunes);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("periodo", "semana");
        next.set("desde", nuevoLunes);
        return next;
      });
    } else {
      const [y, m] = mesFiltro.split("-").map(Number);
      const d = new Date(Date.UTC(y, m, 1));
      const nuevoMes = d.toISOString().slice(0, 7);
      setMesFiltro(nuevoMes);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("mes", nuevoMes);
        return next;
      });
    }
  };

  const irAHoy = () => {
    if (periodoModo === "semana") {
      const hoyLunes = obtenerLunesSemana(new Date());
      setLunesFiltro(hoyLunes);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("periodo", "semana");
        next.set("desde", hoyLunes);
        return next;
      });
    } else {
      const hoyMes = new Date().toISOString().slice(0, 7);
      setMesFiltro(hoyMes);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("mes", hoyMes);
        return next;
      });
    }
  };

  // Cargar cuentas y categorías
  const cargarCatalogos = useCallback(async () => {
    const [cRes, catRes, sRes] = await Promise.all([
      supabase
        .from("cuentas")
        .select("*")
        .eq("activa", true)
        .order("orden", { ascending: true }),
      supabase
        .from("categorias_movimiento")
        .select("*")
        .eq("activa", true)
        .order("orden", { ascending: true }),
      supabase.from("saldos_cuentas").select("*"),
    ]);

    if (cRes.data) setCuentas(cRes.data);
    if (catRes.data) setCategorias(catRes.data);
    if (sRes.data) setSaldosCuentas(sRes.data);
  }, []);

  // Cargar movimientos del período (mes o semana) y cobros acreditados
  const cargarDatos = useCallback(
    async (mostrarSpinner = false) => {
      if (mostrarSpinner) setCargando(true);
      await cargarCatalogos();

      let primerDia: string;
      let ultimoDia: string;

      if (pestanaActiva === "resumen" && periodoModo === "semana") {
        primerDia = lunesFiltro;
        ultimoDia = modificarDias(lunesFiltro, 6);
      } else {
        const [añoStr, mesStr] = mesFiltro.split("-");
        const año = parseInt(añoStr, 10);
        const mesNum = parseInt(mesStr, 10);
        primerDia = `${mesFiltro}-01`;
        ultimoDia = new Date(año, mesNum, 0).toISOString().slice(0, 10);
      }

      const [movsRes, cobrosRes, cData, catData] = await Promise.all([
        supabase
          .from("movimientos_caja")
          .select("*")
          .gte("fecha", primerDia)
          .lte("fecha", ultimoDia)
          .order("fecha", { ascending: false }),
        supabase
          .from("cobros")
          .select(
            "id, fecha, fecha_acreditacion, monto, medio, estado, referencia, cuenta_id, cliente_id, clientes(nombre)",
          )
          .eq("estado", "acreditado")
          .or(
            `and(fecha_acreditacion.gte.${primerDia},fecha_acreditacion.lte.${ultimoDia}),and(fecha_acreditacion.is.null,fecha.gte.${primerDia},fecha.lte.${ultimoDia})`,
          ),
        supabase.from("cuentas").select("id, nombre"),
        supabase.from("categorias_movimiento").select("id, nombre"),
      ]);

      const cuentasMap = new Map<string, string>(
        (cData.data ?? []).map((c) => [c.id, c.nombre]),
      );
      const categoriasMap = new Map<string, string>(
        (catData.data ?? []).map((cat) => [cat.id, cat.nombre]),
      );

      const movsList = (movsRes.data as MovimientoCaja[]) ?? [];
      const listaUnificada: ItemUnificado[] = [];

      // Agregar movimientos_caja
      movsList.forEach((m) => {
        listaUnificada.push({
          id: m.id,
          esCobro: false,
          fecha: m.fecha,
          tipo: m.tipo,
          ambito: m.ambito,
          categoriaId: m.categoria_id,
          categoriaNombre: m.categoria_id
            ? (categoriasMap.get(m.categoria_id) ?? "Sin categoría")
            : m.tipo === "transferencia"
              ? "Transferencia"
              : "—",
          cuentaId: m.cuenta_id,
          cuentaNombre: m.cuenta_id
            ? (cuentasMap.get(m.cuenta_id) ?? "—")
            : "—",
          cuentaDestinoNombre: m.cuenta_destino_id
            ? (cuentasMap.get(m.cuenta_destino_id) ?? "—")
            : null,
          descripcion:
            m.descripcion ||
            (m.tipo === "transferencia"
              ? "Transferencia entre cuentas"
              : "Sin descripción"),
          origenProveedor: m.proveedor,
          monto: m.monto,
          estado: m.estado,
          movimientoOriginal: m,
        });
      });

      // Agregar cobros acreditados (solo si el ámbito no es personal)
      if (ambitoFiltro !== "personal") {
        const cobrosList = cobrosRes.data ?? [];
        cobrosList.forEach((c: any) => {
          const fechaCobro = c.fecha_acreditacion || c.fecha;
          if (fechaCobro >= primerDia && fechaCobro <= ultimoDia) {
            listaUnificada.push({
              id: c.id,
              esCobro: true,
              fecha: fechaCobro,
              tipo: "ingreso",
              ambito: "empresa",
              categoriaId: "cobro_servicio",
              categoriaNombre: "Cobro de servicio",
              cuentaId: c.cuenta_id,
              cuentaNombre: c.cuenta_id
                ? (cuentasMap.get(c.cuenta_id) ?? "—")
                : "—",
              descripcion: c.referencia
                ? `Cobro (${c.referencia})`
                : "Cobro de servicio",
              origenProveedor: c.clientes?.nombre ?? "Cliente",
              monto: Number(c.monto),
              estado: "pagado",
              linkCobro: "/cobros?tab=todos",
            });
          }
        });
      }

      // Ordenar fecha desc
      listaUnificada.sort((a, b) => b.fecha.localeCompare(a.fecha));

      setItemsUnificados(listaUnificada);
      setCargando(false);
    },
    [
      pestanaActiva,
      periodoModo,
      lunesFiltro,
      mesFiltro,
      ambitoFiltro,
      cargarCatalogos,
    ],
  );

  const cargar = useCallback(() => {
    return cargarDatos(false);
  }, [cargarDatos]);

  useEffect(() => {
    cargarDatos(true);
  }, [cargarDatos]);

  useRealtime(["movimientos_caja", "cobros", "cuentas"], cargar);

  // Filtrado final de items unificados
  const itemsFiltrados = itemsUnificados.filter((item) => {
    if (ambitoFiltro !== "todo" && item.ambito !== ambitoFiltro) {
      return false;
    }
    if (cuentaFiltro) {
      if (item.tipo === "transferencia") {
        if (
          item.cuentaId !== cuentaFiltro &&
          item.movimientoOriginal?.cuenta_destino_id !== cuentaFiltro
        ) {
          return false;
        }
      } else if (item.cuentaId !== cuentaFiltro) {
        return false;
      }
    }
    if (categoriaFiltro) {
      if (categoriaFiltro === "cobro_servicio") {
        if (!item.esCobro) return false;
      } else {
        if (item.categoriaId !== categoriaFiltro) return false;
      }
    }
    return true;
  });

  // Acciones sobre movimientos
  const marcarPagado = async (movId: string) => {
    try {
      const { error } = await supabase
        .from("movimientos_caja")
        .update({ estado: "pagado" })
        .eq("id", movId);
      if (error) throw error;
      cargarDatos();
    } catch (err: any) {
      alert("Error al marcar como pagado: " + (err.message || err));
    }
  };

  const eliminarMovimiento = async (movId: string) => {
    if (!window.confirm("¿Seguro que querés eliminar este movimiento?")) {
      return;
    }
    try {
      const { error } = await supabase
        .from("movimientos_caja")
        .delete()
        .eq("id", movId);
      if (error) throw error;
      cargarDatos();
    } catch (err: any) {
      alert("Error al eliminar el movimiento: " + (err.message || err));
    }
  };

  // Guardar saldo inicial de cuenta inline
  const guardarSaldoInicialInline = async (cuentaId: string) => {
    setGuardandoSaldoInicial(true);
    try {
      const nuevo = valorSaldoInicial ?? 0;
      const { error } = await supabase
        .from("cuentas")
        .update({ saldo_inicial: nuevo })
        .eq("id", cuentaId);
      if (error) throw error;
      setEditandoCuentaId(null);
      await cargarCatalogos();
    } catch (err: any) {
      alert("Error al guardar saldo inicial: " + (err.message || err));
    } finally {
      setGuardandoSaldoInicial(false);
    }
  };

  // Crear nueva cuenta
  const handleCrearCuenta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreNuevaCuenta.trim()) return;
    setGuardandoNuevaCuenta(true);
    try {
      const saldoInicial = saldoInicialNuevaCuenta ?? 0;
      const { error } = await supabase.from("cuentas").insert({
        nombre: nombreNuevaCuenta.trim(),
        saldo_inicial: saldoInicial,
        orden: cuentas.length + 1,
      });
      if (error) throw error;
      setNombreNuevaCuenta("");
      setSaldoInicialNuevaCuenta(null);
      setCreandoCuenta(false);
      await cargarCatalogos();
    } catch (err: any) {
      alert("Error al crear cuenta: " + (err.message || err));
    } finally {
      setGuardandoNuevaCuenta(false);
    }
  };

  // Cálculos de Resumen
  const totalIngresosResumen = itemsUnificados
    .filter(
      (i) =>
        i.tipo === "ingreso" &&
        (ambitoFiltro === "todo" || i.ambito === ambitoFiltro),
    )
    .reduce((acc, i) => acc + i.monto, 0);

  const totalEgresosResumen = itemsUnificados
    .filter(
      (i) =>
        i.tipo === "egreso" &&
        (ambitoFiltro === "todo" || i.ambito === ambitoFiltro),
    )
    .reduce((acc, i) => acc + i.monto, 0);

  const resultadoResumen = totalIngresosResumen - totalEgresosResumen;

  // Egresos por categoría
  const egresosPorCategoriaMap = new Map<string, number>();
  itemsUnificados
    .filter(
      (i) =>
        i.tipo === "egreso" &&
        (ambitoFiltro === "todo" || i.ambito === ambitoFiltro),
    )
    .forEach((i) => {
      const cat = i.categoriaNombre || "Sin categoría";
      egresosPorCategoriaMap.set(
        cat,
        (egresosPorCategoriaMap.get(cat) ?? 0) + i.monto,
      );
    });

  const egresosPorCategoria = Array.from(egresosPorCategoriaMap.entries())
    .map(([categoria, monto]) => ({ categoria, monto }))
    .sort((a, b) => b.monto - a.monto);

  const mayorMontoEgreso = Math.max(
    ...egresosPorCategoria.map((c) => c.monto),
    1,
  );

  // Ingresos por origen: cobros agrupados por cliente + ingresos por categoría
  const ingresosPorOrigenMap = new Map<string, number>();
  itemsUnificados
    .filter(
      (i) =>
        i.tipo === "ingreso" &&
        (ambitoFiltro === "todo" || i.ambito === ambitoFiltro),
    )
    .forEach((i) => {
      const origen = i.esCobro
        ? i.origenProveedor || "Cliente sin nombre"
        : i.categoriaNombre || "Otros ingresos";
      ingresosPorOrigenMap.set(
        origen,
        (ingresosPorOrigenMap.get(origen) ?? 0) + i.monto,
      );
    });

  const ingresosPorOrigen = Array.from(ingresosPorOrigenMap.entries())
    .map(([origen, monto]) => ({ origen, monto }))
    .sort((a, b) => b.monto - a.monto);

  // Días para el gráfico de barras en modo semanal
  const diasSemanaGrafico = useMemo<DiaResumenSemanal[]>(() => {
    const DIAS_ABREV = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
    const hoyIso = new Date().toISOString().slice(0, 10);

    return Array.from({ length: 7 }).map((_, i) => {
      const fecha = modificarDias(lunesFiltro, i);
      const diaNum = parseInt(fecha.slice(8, 10), 10);
      const etiquetaDia = `${DIAS_ABREV[i]} ${diaNum}`;
      const esHoy = fecha === hoyIso;

      const itemsDia = itemsUnificados.filter(
        (it) =>
          it.fecha === fecha &&
          (ambitoFiltro === "todo" || it.ambito === ambitoFiltro),
      );

      const ingresos = itemsDia
        .filter((it) => it.tipo === "ingreso")
        .reduce((sum, it) => sum + it.monto, 0);

      const egresos = itemsDia
        .filter((it) => it.tipo === "egreso")
        .reduce((sum, it) => sum + it.monto, 0);

      return {
        fecha,
        etiquetaDia,
        esHoy,
        ingresos,
        egresos,
      };
    });
  }, [lunesFiltro, itemsUnificados, ambitoFiltro]);

  // Comparación de los últimos 6 meses (en modo mes)
  const [comparacion6Meses, setComparacion6Meses] = useState<
    {
      mesKey: string;
      mesNombre: string;
      ingresos: number;
      egresos: number;
      resultado: number;
    }[]
  >([]);

  useEffect(() => {
    async function cargar6Meses() {
      const hoy = new Date();
      const mesesList = Array.from({ length: 6 }).map((_, i) => {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - (5 - i), 1);
        return d.toISOString().slice(0, 7);
      });

      const primerMes = `${mesesList[0]}-01`;
      const finUltimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);

      const [mRes, cRes] = await Promise.all([
        supabase
          .from("movimientos_caja")
          .select("fecha, tipo, ambito, monto, estado")
          .gte("fecha", primerMes)
          .lte("fecha", finUltimo),
        supabase
          .from("cobros")
          .select("fecha, fecha_acreditacion, monto, estado")
          .eq("estado", "acreditado")
          .or(
            `and(fecha_acreditacion.gte.${primerMes},fecha_acreditacion.lte.${finUltimo}),and(fecha_acreditacion.is.null,fecha.gte.${primerMes},fecha.lte.${finUltimo})`,
          ),
      ]);

      const movs = mRes.data ?? [];
      const cobros = cRes.data ?? [];

      const resultadoMeses = mesesList.map((mKey) => {
        let ing = 0;
        let egr = 0;

        movs.forEach((m: any) => {
          const mMes = m.fecha.slice(0, 7);
          if (mMes === mKey) {
            if (ambitoFiltro === "todo" || m.ambito === ambitoFiltro) {
              if (m.tipo === "ingreso" && m.estado === "pagado")
                ing += Number(m.monto);
              if (m.tipo === "egreso" && m.estado === "pagado")
                egr += Number(m.monto);
            }
          }
        });

        if (ambitoFiltro !== "personal") {
          cobros.forEach((c: any) => {
            const f = c.fecha_acreditacion || c.fecha;
            if (f.slice(0, 7) === mKey) {
              ing += Number(c.monto);
            }
          });
        }

        return {
          mesKey: mKey,
          mesNombre: formatearMes(mKey),
          ingresos: ing,
          egresos: egr,
          resultado: ing - egr,
        };
      });

      setComparacion6Meses(resultadoMeses);
    }

    if (pestanaActiva === "resumen" && periodoModo === "mes") {
      cargar6Meses();
    }
  }, [pestanaActiva, periodoModo, ambitoFiltro]);

  // Comparación de las últimas 6 semanas (en modo semana)
  const [comparacion6Semanas, setComparacion6Semanas] = useState<
    {
      semanaKey: string;
      semanaNombre: string;
      ingresos: number;
      egresos: number;
      resultado: number;
    }[]
  >([]);

  useEffect(() => {
    async function cargar6Semanas() {
      const semanasList = Array.from({ length: 6 }).map((_, i) => {
        return modificarDias(lunesFiltro, (i - 5) * 7);
      });

      const primerDia = semanasList[0];
      const ultimoDia = modificarDias(semanasList[5], 6);

      const [mRes, cRes] = await Promise.all([
        supabase
          .from("movimientos_caja")
          .select("fecha, tipo, ambito, monto, estado")
          .gte("fecha", primerDia)
          .lte("fecha", ultimoDia),
        supabase
          .from("cobros")
          .select("fecha, fecha_acreditacion, monto, estado")
          .eq("estado", "acreditado")
          .or(
            `and(fecha_acreditacion.gte.${primerDia},fecha_acreditacion.lte.${ultimoDia}),and(fecha_acreditacion.is.null,fecha.gte.${primerDia},fecha.lte.${ultimoDia})`,
          ),
      ]);

      const movs = mRes.data ?? [];
      const cobros = cRes.data ?? [];

      const resultadoSemanas = semanasList.map((sKey) => {
        const finSemana = modificarDias(sKey, 6);
        let ing = 0;
        let egr = 0;

        movs.forEach((m: any) => {
          if (m.fecha >= sKey && m.fecha <= finSemana) {
            if (ambitoFiltro === "todo" || m.ambito === ambitoFiltro) {
              if (m.tipo === "ingreso" && m.estado === "pagado")
                ing += Number(m.monto);
              if (m.tipo === "egreso" && m.estado === "pagado")
                egr += Number(m.monto);
            }
          }
        });

        if (ambitoFiltro !== "personal") {
          cobros.forEach((c: any) => {
            const f = c.fecha_acreditacion || c.fecha;
            if (f >= sKey && f <= finSemana) {
              ing += Number(c.monto);
            }
          });
        }

        return {
          semanaKey: sKey,
          semanaNombre: formatearSemanaCorta(sKey),
          ingresos: ing,
          egresos: egr,
          resultado: ing - egr,
        };
      });

      setComparacion6Semanas(resultadoSemanas);
    }

    if (pestanaActiva === "resumen" && periodoModo === "semana") {
      cargar6Semanas();
    }
  }, [pestanaActiva, periodoModo, lunesFiltro, ambitoFiltro]);

  // Total general de saldos de cuentas
  const totalGeneralSaldos = saldosCuentas.reduce(
    (acc, s) => acc + (Number(s.saldo) || 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Encabezado y filtro de ámbito a la derecha */}
      <EncabezadoPagina
        titulo="Caja"
        acciones={
          <div className="flex items-center gap-1.5 p-1 rounded-md border border-borde bg-superficie">
            <button
              type="button"
              onClick={() => cambiarAmbito("todo")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                ambitoFiltro === "todo"
                  ? "bg-marca-suave text-marca"
                  : "text-tinta-suave hover:text-tinta"
              }`}
            >
              Todo
            </button>
            <button
              type="button"
              onClick={() => cambiarAmbito("empresa")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                ambitoFiltro === "empresa"
                  ? "bg-marca-suave text-marca"
                  : "text-tinta-suave hover:text-tinta"
              }`}
            >
              Empresa
            </button>
            <button
              type="button"
              onClick={() => cambiarAmbito("personal")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                ambitoFiltro === "personal"
                  ? "bg-marca-suave text-marca"
                  : "text-tinta-suave hover:text-tinta"
              }`}
            >
              Personal
            </button>
          </div>
        }
      />

      {/* Pestañas: Movimientos · Resumen · Cuentas */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cambiarPestana("movimientos")}
          aria-pressed={pestanaActiva === "movimientos"}
          className={`h-10 px-4 rounded-md border text-sm font-medium transition-colors ${
            pestanaActiva === "movimientos"
              ? "border-marca bg-marca-suave text-marca"
              : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
          }`}
        >
          Movimientos
        </button>
        <button
          type="button"
          onClick={() => cambiarPestana("resumen")}
          aria-pressed={pestanaActiva === "resumen"}
          className={`h-10 px-4 rounded-md border text-sm font-medium transition-colors ${
            pestanaActiva === "resumen"
              ? "border-marca bg-marca-suave text-marca"
              : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
          }`}
        >
          Resumen
        </button>
        <button
          type="button"
          onClick={() => cambiarPestana("cuentas")}
          aria-pressed={pestanaActiva === "cuentas"}
          className={`h-10 px-4 rounded-md border text-sm font-medium transition-colors ${
            pestanaActiva === "cuentas"
              ? "border-marca bg-marca-suave text-marca"
              : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
          }`}
        >
          Cuentas
        </button>
      </div>

      {/* Formulario inline si se activa algún botón o edición */}
      {(tipoFormulario || movimientoAEditar) && (
        <FormularioMovimiento
          tipoInicial={tipoFormulario ?? movimientoAEditar?.tipo ?? "egreso"}
          ambitoInicial={
            movimientoAEditar
              ? movimientoAEditar.ambito
              : ambitoFiltro === "empresa"
                ? "empresa"
                : ambitoFiltro === "personal"
                  ? "personal"
                  : null
          }
          movimientoAEditar={movimientoAEditar}
          onGuardado={() => {
            setTipoFormulario(null);
            setMovimientoAEditar(null);
            cargarDatos();
          }}
          onCancelar={() => {
            setTipoFormulario(null);
            setMovimientoAEditar(null);
          }}
        />
      )}

      {/* 1. Pestaña Movimientos */}
      {pestanaActiva === "movimientos" && (
        <div className="space-y-4">
          {/* Botones de acción y filtros */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <Boton
                type="button"
                onClick={() => {
                  setMovimientoAEditar(null);
                  setTipoFormulario("egreso");
                }}
              >
                <Plus className="size-4 mr-1.5" />
                Nuevo gasto
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                onClick={() => {
                  setMovimientoAEditar(null);
                  setTipoFormulario("ingreso");
                }}
              >
                <Plus className="size-4 mr-1.5" />
                Nuevo ingreso
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                onClick={() => {
                  setMovimientoAEditar(null);
                  setTipoFormulario("transferencia");
                }}
              >
                <ArrowRightLeft className="size-4 mr-1.5" />
                Transferencia
              </Boton>
            </div>

            {/* Filtros: mes, cuenta, categoría */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-40 sm:w-44">
                <Selector
                  value={mesFiltro}
                  onChange={(e) => setMesFiltro(e.target.value)}
                  className="h-9 text-xs"
                >
                  {mesesOpciones.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.etiqueta}
                    </option>
                  ))}
                </Selector>
              </div>

              <div className="w-36 sm:w-40">
                <Selector
                  value={cuentaFiltro}
                  onChange={(e) => setCuentaFiltro(e.target.value)}
                  className="h-9 text-xs"
                >
                  <option value="">Todas las cuentas</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Selector>
              </div>

              <div className="w-36 sm:w-40">
                <Selector
                  value={categoriaFiltro}
                  onChange={(e) => setCategoriaFiltro(e.target.value)}
                  className="h-9 text-xs"
                >
                  <option value="">Todas las categorías</option>
                  {ambitoFiltro !== "personal" && (
                    <option value="cobro_servicio">Cobro de servicio</option>
                  )}
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nombre}
                    </option>
                  ))}
                </Selector>
              </div>
            </div>
          </div>

          {/* Listado unificado */}
          {cargando ? (
            <div className="py-12 text-center text-tinta-suave">
              Cargando movimientos...
            </div>
          ) : itemsFiltrados.length === 0 ? (
            <Tarjeta className="p-8 text-center text-tinta-suave">
              No hay movimientos en este período.
            </Tarjeta>
          ) : (
            <Tarjeta>
              {/* Tarjetas en < md */}
              <div className="divide-y divide-borde md:hidden">
                {itemsFiltrados.map((item) => {
                  const acciones: AccionMenu[] = [];
                  if (!item.esCobro && item.movimientoOriginal) {
                    acciones.push({
                      texto: "Editar",
                      onClick: () => {
                        setTipoFormulario(null);
                        setMovimientoAEditar(item.movimientoOriginal!);
                      },
                    });
                    if (item.estado === "pendiente") {
                      acciones.push({
                        texto: "Marcar pagado",
                        onClick: () => marcarPagado(item.id),
                      });
                    }
                    if (esAdmin) {
                      acciones.push({ separador: true });
                      acciones.push({
                        texto: "Eliminar",
                        peligro: true,
                        onClick: () => eliminarMovimiento(item.id),
                      });
                    }
                  }

                  const esDestacado = item.id === movimientoDestacadoId;

                  return (
                    <div
                      key={item.id}
                      id={`movimiento-${item.id}`}
                      className={`p-3.5 space-y-1.5 transition-colors ${
                        esDestacado
                          ? "bg-marca-suave/30 ring-1 ring-marca rounded-md"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          {item.esCobro && item.linkCobro ? (
                            <Link
                              to={item.linkCobro}
                              className="font-medium text-tinta text-sm hover:underline truncate block"
                            >
                              {item.descripcion}
                            </Link>
                          ) : (
                            <span className="font-medium text-tinta text-sm truncate block">
                              {item.descripcion}
                            </span>
                          )}
                          {item.origenProveedor && (
                            <span className="text-xs text-tinta-suave block truncate">
                              {item.origenProveedor}
                            </span>
                          )}
                        </div>
                        {item.estado === "pendiente" && (
                          <ChipMovimiento estado={item.estado} />
                        )}
                      </div>

                      <div className="text-[13px] text-tinta-suave flex flex-wrap gap-x-2">
                        <span>{formatearFecha(item.fecha)}</span>
                        <span>·</span>
                        <span>{item.categoriaNombre}</span>
                        <span>·</span>
                        <span>
                          {item.cuentaNombre}
                          {item.cuentaDestinoNombre
                            ? ` → ${item.cuentaDestinoNombre}`
                            : ""}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="font-semibold text-sm tabular-nums">
                          {item.tipo === "ingreso" && (
                            <span className="text-ok">
                              + {formatearPesos(item.monto)}
                            </span>
                          )}
                          {item.tipo === "egreso" && (
                            <span className="text-tinta">
                              − {formatearPesos(item.monto)}
                            </span>
                          )}
                          {item.tipo === "transferencia" && (
                            <span className="text-tinta-suave">
                              {formatearPesos(item.monto)} →{" "}
                              {item.cuentaDestinoNombre}
                            </span>
                          )}
                        </div>

                        {acciones.length > 0 && (
                          <MenuAcciones acciones={acciones} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tabla en md+ */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-tinta-suave">
                    <tr className="border-b border-borde">
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Descripción</th>
                      <th className="px-4 py-3 font-medium">Categoría</th>
                      <th className="px-4 py-3 font-medium">Cuenta</th>
                      <th className="px-4 py-3 text-right font-medium">
                        Monto
                      </th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="w-12 px-2 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {itemsFiltrados.map((item) => {
                      const acciones: AccionMenu[] = [];
                      if (!item.esCobro && item.movimientoOriginal) {
                        acciones.push({
                          texto: "Editar",
                          onClick: () => {
                            setTipoFormulario(null);
                            setMovimientoAEditar(item.movimientoOriginal!);
                          },
                        });
                        if (item.estado === "pendiente") {
                          acciones.push({
                            texto: "Marcar pagado",
                            onClick: () => marcarPagado(item.id),
                          });
                        }
                        if (esAdmin) {
                          acciones.push({ separador: true });
                          acciones.push({
                            texto: "Eliminar",
                            peligro: true,
                            onClick: () => eliminarMovimiento(item.id),
                          });
                        }
                      }

                      const esDestacado = item.id === movimientoDestacadoId;

                      return (
                        <tr
                          key={item.id}
                          id={`movimiento-${item.id}`}
                          className={`hover:bg-fondo transition-colors ${
                            esDestacado
                              ? "bg-marca-suave/30 ring-1 ring-marca"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-3 text-tinta-suave tabular-nums whitespace-nowrap">
                            {formatearFecha(item.fecha)}
                          </td>
                          <td className="px-4 py-3">
                            {item.esCobro && item.linkCobro ? (
                              <Link
                                to={item.linkCobro}
                                className="font-medium text-tinta hover:underline"
                              >
                                {item.descripcion}
                              </Link>
                            ) : (
                              <span className="font-medium text-tinta">
                                {item.descripcion}
                              </span>
                            )}
                            {item.origenProveedor && (
                              <div className="text-xs text-tinta-suave">
                                {item.origenProveedor}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-tinta-suave whitespace-nowrap">
                            {item.categoriaNombre}
                          </td>
                          <td className="px-4 py-3 text-tinta-suave whitespace-nowrap">
                            {item.cuentaNombre}
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap">
                            {item.tipo === "ingreso" && (
                              <span className="text-ok font-semibold">
                                + {formatearPesos(item.monto)}
                              </span>
                            )}
                            {item.tipo === "egreso" && (
                              <span className="text-tinta font-semibold">
                                − {formatearPesos(item.monto)}
                              </span>
                            )}
                            {item.tipo === "transferencia" && (
                              <span className="text-tinta-suave">
                                {formatearPesos(item.monto)} →{" "}
                                {item.cuentaDestinoNombre}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {item.estado === "pendiente" ? (
                              <ChipMovimiento estado={item.estado} />
                            ) : null}
                          </td>
                          <td className="px-2 py-3 text-right">
                            {acciones.length > 0 && (
                              <MenuAcciones acciones={acciones} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}
        </div>
      )}

      {/* 2. Pestaña Resumen */}
      {pestanaActiva === "resumen" && (
        <div className="space-y-6">
          {/* Header de navegación en Resumen: Toggle Semana · Mes + Flechas + Hoy */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Toggle Semana · Mes */}
              <div className="inline-flex bg-superficie border border-borde rounded-[6px] p-0.5 h-9 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => cambiarPeriodoModo("semana")}
                  className={`px-3 py-1 rounded-[4px] transition-colors ${
                    periodoModo === "semana"
                      ? "bg-marca-suave text-marca font-semibold"
                      : "text-tinta-suave hover:text-tinta"
                  }`}
                >
                  Semana
                </button>
                <button
                  type="button"
                  onClick={() => cambiarPeriodoModo("mes")}
                  className={`px-3 py-1 rounded-[4px] transition-colors ${
                    periodoModo === "mes"
                      ? "bg-marca-suave text-marca font-semibold"
                      : "text-tinta-suave hover:text-tinta"
                  }`}
                >
                  Mes
                </button>
              </div>

              {/* Navegación temporal ‹ › */}
              <div className="flex items-center bg-superficie border border-borde rounded-[6px] h-9 px-1.5 gap-1">
                <button
                  type="button"
                  onClick={navegarPeriodoAnterior}
                  title="Anterior"
                  className="p-1 hover:bg-fondo rounded text-tinta-suave hover:text-tinta transition-colors"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-xs font-medium text-tinta px-1.5 whitespace-nowrap">
                  {periodoModo === "semana"
                    ? formatearRangoSemana(lunesFiltro)
                    : formatearMes(mesFiltro)}
                </span>
                <button
                  type="button"
                  onClick={navegarPeriodoSiguiente}
                  title="Siguiente"
                  className="p-1 hover:bg-fondo rounded text-tinta-suave hover:text-tinta transition-colors"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              {/* Botón Hoy */}
              <button
                type="button"
                onClick={irAHoy}
                className="h-9 px-3 rounded-[6px] border border-borde bg-superficie text-xs font-medium text-tinta-suave hover:text-tinta hover:bg-fondo transition-colors"
              >
                Hoy
              </button>
            </div>

            {/* Selector rápido de mes en modo Mes */}
            {periodoModo === "mes" && (
              <div className="w-44">
                <Selector
                  value={mesFiltro}
                  onChange={(e) => {
                    const nuevoMes = e.target.value;
                    setMesFiltro(nuevoMes);
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.set("mes", nuevoMes);
                      return next;
                    });
                  }}
                  className="h-9 text-xs"
                >
                  {mesesOpciones.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.etiqueta}
                    </option>
                  ))}
                </Selector>
              </div>
            )}
          </div>

          {/* Tres cifras arriba */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Tarjeta className="p-5">
              <div className="flex items-center justify-between text-tinta-suave text-xs font-medium">
                <span>Ingresos</span>
                <TrendingUp className="size-4 text-ok" />
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-tinta tabular-nums">
                {formatearPesos(totalIngresosResumen)}
              </div>
              <p className="text-[11px] text-tinta-suave mt-1">
                Cobros acreditados + otros ingresos
              </p>
            </Tarjeta>

            <Tarjeta className="p-5">
              <div className="flex items-center justify-between text-tinta-suave text-xs font-medium">
                <span>Egresos</span>
                <TrendingDown className="size-4 text-peligro" />
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-tinta tabular-nums">
                {formatearPesos(totalEgresosResumen)}
              </div>
              <p className="text-[11px] text-tinta-suave mt-1">
                Gastos del período
              </p>
            </Tarjeta>

            <Tarjeta className="p-5">
              <div className="text-tinta-suave text-xs font-medium">
                Resultado
              </div>
              <div
                className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${
                  resultadoResumen >= 0 ? "text-ok" : "text-peligro"
                }`}
              >
                {formatearPesos(resultadoResumen)}
              </div>
              <p className="text-[11px] text-tinta-suave mt-1">
                {resultadoResumen >= 0
                  ? periodoModo === "semana"
                    ? "Superávit de la semana"
                    : "Superávit del mes"
                  : periodoModo === "semana"
                    ? "Déficit de la semana"
                    : "Déficit del mes"}
              </p>
            </Tarjeta>
          </div>

          {/* Gráfico semanal de ingresos y egresos diarios */}
          {periodoModo === "semana" && (
            <GraficoSemanalCaja dias={diasSemanaGrafico} />
          )}

          {/* Dos tarjetas debajo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Egresos por categoría */}
            <Tarjeta className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-tinta">
                Egresos por categoría
              </h3>
              {egresosPorCategoria.length === 0 ? (
                <p className="text-xs text-tinta-suave py-4">
                  No hay egresos en este período.
                </p>
              ) : (
                <div className="divide-y divide-borde">
                  {egresosPorCategoria.map((cat) => {
                    const porcentaje = (cat.monto / mayorMontoEgreso) * 100;
                    return (
                      <div
                        key={cat.categoria}
                        className="py-2.5 space-y-1.5 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-tinta">
                            {cat.categoria}
                          </span>
                          <span className="font-semibold text-tinta tabular-nums">
                            {formatearPesos(cat.monto)}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-marca-suave overflow-hidden">
                          <div
                            className="h-full rounded-full bg-marca transition-all duration-300"
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Tarjeta>

            {/* Ingresos por origen */}
            <Tarjeta className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-tinta">
                Ingresos por origen
              </h3>
              {ingresosPorOrigen.length === 0 ? (
                <p className="text-xs text-tinta-suave py-4">
                  No hay ingresos en este período.
                </p>
              ) : (
                <div className="divide-y divide-borde">
                  {ingresosPorOrigen.map((orig) => (
                    <div
                      key={orig.origen}
                      className="py-2.5 flex items-center justify-between text-sm first:pt-0 last:pb-0"
                    >
                      <span className="font-medium text-tinta">
                        {orig.origen}
                      </span>
                      <span className="font-semibold text-ok tabular-nums">
                        {formatearPesos(orig.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Tarjeta>
          </div>

          {/* Comparación: 6 meses en modo Mes, 6 semanas en modo Semana */}
          {periodoModo === "mes" ? (
            <Tarjeta className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-tinta">
                Comparación de los últimos 6 meses
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-tinta-suave border-b border-borde">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Mes</th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Ingresos
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Egresos
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Resultado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {comparacion6Meses.map((c) => (
                      <tr
                        key={c.mesKey}
                        className="hover:bg-fondo transition-colors"
                      >
                        <td className="px-4 py-2.5 font-medium text-tinta">
                          {c.mesNombre}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ok">
                          {formatearPesos(c.ingresos)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-tinta">
                          {formatearPesos(c.egresos)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                            c.resultado >= 0 ? "text-ok" : "text-peligro"
                          }`}
                        >
                          {formatearPesos(c.resultado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          ) : (
            <Tarjeta className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-tinta">
                Comparación de las últimas 6 semanas
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-tinta-suave border-b border-borde">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Semana</th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Ingresos
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Egresos
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Resultado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {comparacion6Semanas.map((c) => {
                      const esSeleccionada = c.semanaKey === lunesFiltro;
                      return (
                        <tr
                          key={c.semanaKey}
                          onClick={() => {
                            setLunesFiltro(c.semanaKey);
                            setSearchParams((prev) => {
                              const next = new URLSearchParams(prev);
                              next.set("periodo", "semana");
                              next.set("desde", c.semanaKey);
                              return next;
                            });
                          }}
                          className={`hover:bg-fondo cursor-pointer transition-colors ${
                            esSeleccionada
                              ? "bg-marca-suave/30 font-medium"
                              : ""
                          }`}
                          title="Hacé clic para ver esta semana"
                        >
                          <td className="px-4 py-2.5 font-medium text-tinta">
                            {c.semanaNombre}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-ok">
                            {formatearPesos(c.ingresos)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-tinta">
                            {formatearPesos(c.egresos)}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                              c.resultado >= 0 ? "text-ok" : "text-peligro"
                            }`}
                          >
                            {formatearPesos(c.resultado)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}

          {/* Lista de movimientos de la semana (solo en modo Semana) */}
          {periodoModo === "semana" && (
            <Tarjeta className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-tinta">
                Movimientos de la semana
              </h3>

              {itemsFiltrados.length === 0 ? (
                <p className="text-xs text-tinta-suave py-2">
                  No hay movimientos registrados en esta semana.
                </p>
              ) : (
                <>
                  {/* Tarjetas móvil */}
                  <div className="divide-y divide-borde md:hidden">
                    {itemsFiltrados.map((item) => {
                      const acciones: AccionMenu[] = [];
                      if (!item.esCobro && item.movimientoOriginal) {
                        acciones.push({
                          texto: "Editar",
                          onClick: () => {
                            setTipoFormulario(null);
                            setMovimientoAEditar(item.movimientoOriginal!);
                          },
                        });
                        if (item.estado === "pendiente") {
                          acciones.push({
                            texto: "Marcar pagado",
                            onClick: () => marcarPagado(item.id),
                          });
                        }
                        if (esAdmin) {
                          acciones.push({ separador: true });
                          acciones.push({
                            texto: "Eliminar",
                            peligro: true,
                            onClick: () => eliminarMovimiento(item.id),
                          });
                        }
                      }

                      return (
                        <div
                          key={item.id}
                          className="py-3 space-y-1.5 first:pt-0 last:pb-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              {item.esCobro && item.linkCobro ? (
                                <Link
                                  to={item.linkCobro}
                                  className="font-medium text-sm text-tinta hover:underline truncate block"
                                >
                                  {item.descripcion}
                                </Link>
                              ) : (
                                <span className="font-medium text-sm text-tinta truncate block">
                                  {item.descripcion}
                                </span>
                              )}
                              {item.origenProveedor && (
                                <div className="text-xs text-tinta-suave">
                                  {item.origenProveedor}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.tipo === "ingreso" && (
                                <span className="text-sm font-semibold text-ok tabular-nums">
                                  + {formatearPesos(item.monto)}
                                </span>
                              )}
                              {item.tipo === "egreso" && (
                                <span className="text-sm font-semibold text-tinta tabular-nums">
                                  − {formatearPesos(item.monto)}
                                </span>
                              )}
                              {item.tipo === "transferencia" && (
                                <span className="text-sm font-medium text-tinta-suave tabular-nums">
                                  {formatearPesos(item.monto)}
                                </span>
                              )}
                              {acciones.length > 0 && (
                                <MenuAcciones acciones={acciones} />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-tinta-suave">
                            <span>
                              {formatearFecha(item.fecha)} ·{" "}
                              {item.categoriaNombre} · {item.cuentaNombre}
                            </span>
                            {item.estado === "pendiente" && (
                              <ChipMovimiento estado={item.estado} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tabla desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-tinta-suave border-b border-borde">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Fecha</th>
                          <th className="px-4 py-2.5 font-medium">
                            Descripción
                          </th>
                          <th className="px-4 py-2.5 font-medium">Categoría</th>
                          <th className="px-4 py-2.5 font-medium">Cuenta</th>
                          <th className="px-4 py-2.5 text-right font-medium">
                            Monto
                          </th>
                          <th className="px-4 py-2.5 font-medium">Estado</th>
                          <th className="w-10 px-2 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-borde">
                        {itemsFiltrados.map((item) => {
                          const acciones: AccionMenu[] = [];
                          if (!item.esCobro && item.movimientoOriginal) {
                            acciones.push({
                              texto: "Editar",
                              onClick: () => {
                                setTipoFormulario(null);
                                setMovimientoAEditar(item.movimientoOriginal!);
                              },
                            });
                            if (item.estado === "pendiente") {
                              acciones.push({
                                texto: "Marcar pagado",
                                onClick: () => marcarPagado(item.id),
                              });
                            }
                            if (esAdmin) {
                              acciones.push({ separador: true });
                              acciones.push({
                                texto: "Eliminar",
                                peligro: true,
                                onClick: () => eliminarMovimiento(item.id),
                              });
                            }
                          }

                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-fondo transition-colors"
                            >
                              <td className="px-4 py-2.5 text-tinta-suave tabular-nums whitespace-nowrap">
                                {formatearFecha(item.fecha)}
                              </td>
                              <td className="px-4 py-2.5">
                                {item.esCobro && item.linkCobro ? (
                                  <Link
                                    to={item.linkCobro}
                                    className="font-medium text-tinta hover:underline"
                                  >
                                    {item.descripcion}
                                  </Link>
                                ) : (
                                  <span className="font-medium text-tinta">
                                    {item.descripcion}
                                  </span>
                                )}
                                {item.origenProveedor && (
                                  <div className="text-xs text-tinta-suave">
                                    {item.origenProveedor}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-tinta-suave whitespace-nowrap">
                                {item.categoriaNombre}
                              </td>
                              <td className="px-4 py-2.5 text-tinta-suave whitespace-nowrap">
                                {item.cuentaNombre}
                              </td>
                              <td className="px-4 py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                                {item.tipo === "ingreso" && (
                                  <span className="text-ok font-semibold">
                                    + {formatearPesos(item.monto)}
                                  </span>
                                )}
                                {item.tipo === "egreso" && (
                                  <span className="text-tinta font-semibold">
                                    − {formatearPesos(item.monto)}
                                  </span>
                                )}
                                {item.tipo === "transferencia" && (
                                  <span className="text-tinta-suave">
                                    {formatearPesos(item.monto)} →{" "}
                                    {item.cuentaDestinoNombre}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                {item.estado === "pendiente" ? (
                                  <ChipMovimiento estado={item.estado} />
                                ) : null}
                              </td>
                              <td className="px-2 py-2.5 text-right">
                                {acciones.length > 0 && (
                                  <MenuAcciones acciones={acciones} />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Tarjeta>
          )}
        </div>
      )}

      {/* 3. Pestaña Cuentas */}
      {pestanaActiva === "cuentas" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-tinta">
              Cuentas y saldos
            </h2>
            {esAdmin && !creandoCuenta && (
              <Boton type="button" onClick={() => setCreandoCuenta(true)}>
                <Plus className="size-4 mr-1.5" />
                Nueva cuenta
              </Boton>
            )}
          </div>

          {/* Formulario para crear cuenta */}
          {creandoCuenta && (
            <Tarjeta className="p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-borde">
                <h3 className="text-sm font-semibold text-tinta">
                  Nueva cuenta
                </h3>
                <button
                  type="button"
                  onClick={() => setCreandoCuenta(false)}
                  className="text-xs text-tinta-suave hover:text-tinta"
                >
                  Cancelar
                </button>
              </div>
              <form onSubmit={handleCrearCuenta} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Campo etiqueta="Nombre de la cuenta" id="nombre_cuenta">
                    <Entrada
                      id="nombre_cuenta"
                      required
                      placeholder="Ej. BBVA, Caja fuerte..."
                      value={nombreNuevaCuenta}
                      onChange={(e) => setNombreNuevaCuenta(e.target.value)}
                    />
                  </Campo>
                  <Campo etiqueta="Saldo inicial" id="saldo_inicial_cuenta">
                    <EntradaMonto
                      id="saldo_inicial_cuenta"
                      valor={saldoInicialNuevaCuenta}
                      onChange={setSaldoInicialNuevaCuenta}
                    />
                  </Campo>
                </div>
                <div className="flex justify-end gap-2">
                  <Boton
                    type="button"
                    variante="secundario"
                    onClick={() => setCreandoCuenta(false)}
                    disabled={guardandoNuevaCuenta}
                  >
                    Cancelar
                  </Boton>
                  <Boton type="submit" disabled={guardandoNuevaCuenta}>
                    {guardandoNuevaCuenta ? "Guardando..." : "Crear cuenta"}
                  </Boton>
                </div>
              </form>
            </Tarjeta>
          )}

          {/* Grilla de cuentas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {saldosCuentas.map((cta) => {
              const estaEditando = editandoCuentaId === cta.id;

              return (
                <Tarjeta
                  key={cta.id}
                  className="p-5 flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-tinta text-base">
                        {cta.nombre}
                      </span>
                    </div>
                    <div className="mt-3">
                      <span className="text-xs text-tinta-suave block">
                        Saldo actual
                      </span>
                      <span className="text-2xl font-bold tracking-tight text-tinta tabular-nums block mt-0.5">
                        {formatearPesos(cta.saldo)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-borde">
                    <span className="text-xs text-tinta-suave block mb-1">
                      Saldo inicial
                    </span>
                    {estaEditando ? (
                      <div className="flex items-center gap-2">
                        <div className="w-36">
                          <EntradaMonto
                            valor={valorSaldoInicial}
                            onChange={setValorSaldoInicial}
                            className="h-8 text-xs"
                            autoFocus
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => guardarSaldoInicialInline(cta.id)}
                          disabled={guardandoSaldoInicial}
                          className="size-8 rounded-md bg-ok-suave text-ok flex items-center justify-center hover:bg-ok hover:text-white transition-colors"
                          title="Guardar"
                        >
                          <Check className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoCuentaId(null)}
                          className="size-8 rounded-md bg-fondo text-tinta-suave flex items-center justify-center hover:text-tinta transition-colors"
                          title="Cancelar"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-tinta tabular-nums">
                          {formatearPesos(cta.saldo_inicial)}
                        </span>
                        {esAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditandoCuentaId(cta.id);
                              setValorSaldoInicial(cta.saldo_inicial ?? null);
                            }}
                            className="text-xs text-marca hover:underline flex items-center gap-1"
                          >
                            <Pencil className="size-3" />
                            Editar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </Tarjeta>
              );
            })}
          </div>

          {/* Total general abajo */}
          <Tarjeta className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-superficie border-t-2 border-marca">
            <div>
              <div className="text-sm font-semibold text-tinta">
                Total general
              </div>
              <div className="text-xs text-tinta-suave">
                Suma de saldos en todas las cuentas activas
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-marca tabular-nums">
              {formatearPesos(totalGeneralSaldos)}
            </div>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}
