import React from "react";
import { Document, Page, StyleSheet, Text, View, Image } from "@react-pdf/renderer";
import { registrarFuentes } from "./fuentes";

registrarFuentes();

const COLOR_AZUL = "#1e4fa8";
const COLOR_TINTA = "#17212b";
const COLOR_GRIS = "#5b6b7b";
const COLOR_BORDE = "#d9e0e8";
const COLOR_FONDO_SUAVE = "#f5f7fa";

const estilos = StyleSheet.create({
  pagina: {
    padding: 36, // ~12.7 mm
    fontFamily: "IBM Plex Sans",
    fontSize: 9,
    color: COLOR_TINTA,
    backgroundColor: "#ffffff",
    display: "flex",
    flexDirection: "column",
  },
  // Marco superior del encabezado AFIP
  encabezadoMarco: {
    borderWidth: 1,
    borderColor: COLOR_BORDE,
    display: "flex",
    flexDirection: "row",
    position: "relative",
  },
  columnaEmisor: {
    width: "48%",
    padding: 12,
  },
  recuadroLetra: {
    position: "absolute",
    left: "50%",
    top: -1,
    marginLeft: -25,
    width: 50,
    height: 48,
    borderWidth: 1,
    borderColor: COLOR_BORDE,
    borderTopWidth: 0,
    backgroundColor: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  letraGrande: {
    fontSize: 24,
    fontWeight: 700,
    color: COLOR_TINTA,
    lineHeight: 1,
  },
  codigoCbte: {
    fontSize: 7,
    fontWeight: 600,
    color: COLOR_GRIS,
    marginTop: 2,
  },
  divisorVertical: {
    width: "4%",
  },
  columnaFactura: {
    width: "48%",
    padding: 12,
    borderLeftWidth: 1,
    borderLeftColor: COLOR_BORDE,
  },
  tituloFactura: {
    fontSize: 16,
    fontWeight: 700,
    color: COLOR_AZUL,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  numeroFactura: {
    fontSize: 12,
    fontWeight: 700,
    color: COLOR_TINTA,
    marginTop: 3,
  },
  originalPill: {
    fontSize: 8,
    fontWeight: 700,
    color: COLOR_AZUL,
    marginTop: 4,
  },
  razonSocialEmisor: {
    fontSize: 14,
    fontWeight: 700,
    color: COLOR_TINTA,
    marginBottom: 4,
  },
  textoEmisor: {
    fontSize: 8.5,
    lineHeight: 1.4,
    color: COLOR_GRIS,
  },
  filaMeta: {
    display: "flex",
    flexDirection: "row",
    marginTop: 3,
    fontSize: 8.5,
  },
  etiquetaMeta: {
    color: COLOR_GRIS,
    width: 90,
  },
  valorMeta: {
    fontWeight: 600,
    color: COLOR_TINTA,
  },

  // Período
  seccionPeriodo: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLOR_BORDE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLOR_FONDO_SUAVE,
    fontSize: 8.5,
  },

  // Receptor
  seccionReceptor: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLOR_BORDE,
    padding: 12,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8.5,
  },
  columnaReceptor: {
    width: "48%",
    lineHeight: 1.4,
  },

  // Tabla
  tabla: {
    width: "100%",
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLOR_BORDE,
  },
  filaEncabezado: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: COLOR_FONDO_SUAVE,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_BORDE,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  th: {
    fontSize: 8.5,
    fontWeight: 600,
    color: COLOR_TINTA,
  },
  filaItem: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOR_BORDE,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  colDesc: {
    flex: 1,
  },
  colCant: {
    width: 40,
    textAlign: "right",
  },
  colPrecio: {
    width: 80,
    textAlign: "right",
  },
  colImporte: {
    width: 85,
    textAlign: "right",
  },
  itemFecha: {
    fontSize: 7.5,
    color: COLOR_GRIS,
    marginTop: 1,
  },

  // Totales
  seccionTotales: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  cajaTotales: {
    width: 240,
    borderWidth: 1,
    borderColor: COLOR_BORDE,
    padding: 10,
    backgroundColor: COLOR_FONDO_SUAVE,
  },
  filaTotal: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    fontSize: 9,
  },
  filaTotalDestacada: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLOR_BORDE,
    fontSize: 11,
    fontWeight: 700,
    color: COLOR_AZUL,
  },
  leyendaIvaB: {
    fontSize: 7.5,
    color: COLOR_GRIS,
    marginTop: 4,
    fontStyle: "italic",
    textAlign: "right",
  },

  // Bloque inferior
  piePagina: {
    marginTop: "auto",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLOR_BORDE,
  },
  grillaInferior: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cajaQr: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  imgQr: {
    width: 70,
    height: 70,
  },
  metaCae: {
    fontSize: 8.5,
    lineHeight: 1.4,
  },
  caeDestacado: {
    fontWeight: 700,
    color: COLOR_TINTA,
  },
  cajaPago: {
    borderWidth: 1,
    borderColor: COLOR_BORDE,
    backgroundColor: COLOR_FONDO_SUAVE,
    padding: 8,
    borderRadius: 4,
    fontSize: 8,
    lineHeight: 1.4,
    width: 220,
  },
  tituloPago: {
    fontWeight: 700,
    color: COLOR_AZUL,
    marginBottom: 2,
  },
  textoPieConfig: {
    fontSize: 7.5,
    color: COLOR_GRIS,
    textAlign: "center",
    marginTop: 10,
  },
});

export interface ItemFacturaPDF {
  numeroServicio: number;
  fecha?: string | null;
  descripcion: string;
  monto: number;
  aplicaIva?: boolean;
}

export interface FacturaPDFProps {
  tipo: "A" | "B";
  puntoVenta: number;
  numero: number;
  fechaEmision: string;
  cae: string;
  caeVencimiento: string;
  periodoDesde?: string | null;
  periodoHasta?: string | null;
  fechaVtoPago?: string | null;
  qrDataUrl: string;
  emisor: {
    razonSocial: string;
    cuit: string;
    condicionIva: string;
    domicilio?: string | null;
    iibb?: string | null;
    inicioActividades?: string | null;
    cbu?: string | null;
    aliasCbu?: string | null;
    banco?: string | null;
    textoPie?: string | null;
  };
  receptor: {
    razonSocial: string;
    cuit?: string | null;
    condicionIva?: string | null;
    domicilio?: string | null;
    condicionPago?: string | null;
  };
  items: ItemFacturaPDF[];
  totales: {
    neto: number;
    iva: number;
    total: number;
  };
}

function formatearPesos(monto: number | null | undefined): string {
  if (monto === null || monto === undefined || isNaN(monto)) return "$ 0,00";
  const abs = Math.abs(monto);
  const partes = abs.toFixed(2).split(".");
  const enteroConPuntos = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const signo = monto < 0 ? "-" : "";
  return `${signo}$ ${enteroConPuntos},${partes[1]}`;
}

function formatearFecha(fechaStr?: string | null): string {
  if (!fechaStr) return "—";
  const limpia = fechaStr.slice(0, 10);
  const partes = limpia.split("-");
  if (partes.length !== 3) return fechaStr;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

export function FacturaDocumento(props: FacturaPDFProps) {
  const {
    tipo,
    puntoVenta,
    numero,
    fechaEmision,
    cae,
    caeVencimiento,
    periodoDesde,
    periodoHasta,
    fechaVtoPago,
    qrDataUrl,
    emisor,
    receptor,
    items,
    totales,
  } = props;

  const numeroFormateado = `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
  const codigoComprobante = tipo === "A" ? "COD. 01" : "COD. 06";

  return (
    <Document title={`Factura ${tipo} ${numeroFormateado} - ${emisor.razonSocial}`}>
      <Page size="A4" style={estilos.pagina}>
        {/* Encabezado oficial */}
        <View style={estilos.encabezadoMarco}>
          {/* Recuadro central con letra */}
          <View style={estilos.recuadroLetra}>
            <Text style={estilos.letraGrande}>{tipo}</Text>
            <Text style={estilos.codigoCbte}>{codigoComprobante}</Text>
          </View>

          {/* Columna Emisor */}
          <View style={estilos.columnaEmisor}>
            <Text style={estilos.razonSocialEmisor}>{emisor.razonSocial}</Text>
            <Text style={estilos.textoEmisor}>{emisor.domicilio || "Buenos Aires, Argentina"}</Text>
            <Text style={estilos.textoEmisor}>Condición frente al IVA: {emisor.condicionIva}</Text>
          </View>

          {/* Separador central */}
          <View style={estilos.divisorVertical} />

          {/* Columna Factura */}
          <View style={estilos.columnaFactura}>
            <Text style={estilos.tituloFactura}>Factura</Text>
            <Text style={estilos.numeroFactura}>Nº {numeroFormateado}</Text>
            <Text style={estilos.originalPill}>ORIGINAL</Text>

            <View style={{ marginTop: 8 }}>
              <View style={estilos.filaMeta}>
                <Text style={estilos.etiquetaMeta}>Fecha de emisión:</Text>
                <Text style={estilos.valorMeta}>{formatearFecha(fechaEmision)}</Text>
              </View>
              <View style={estilos.filaMeta}>
                <Text style={estilos.etiquetaMeta}>CUIT:</Text>
                <Text style={estilos.valorMeta}>{emisor.cuit}</Text>
              </View>
              {emisor.iibb && (
                <View style={estilos.filaMeta}>
                  <Text style={estilos.etiquetaMeta}>Ingresos brutos:</Text>
                  <Text style={estilos.valorMeta}>{emisor.iibb}</Text>
                </View>
              )}
              {emisor.inicioActividades && (
                <View style={estilos.filaMeta}>
                  <Text style={estilos.etiquetaMeta}>Inicio actividades:</Text>
                  <Text style={estilos.valorMeta}>{formatearFecha(emisor.inicioActividades)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Período de servicio y vencimiento */}
        <View style={estilos.seccionPeriodo}>
          <Text>
            Período facturado desde: <Text style={{ fontWeight: 600 }}>{formatearFecha(periodoDesde || fechaEmision)}</Text> hasta:{" "}
            <Text style={{ fontWeight: 600 }}>{formatearFecha(periodoHasta || fechaEmision)}</Text>
          </Text>
          <Text>
            Vencimiento para el pago: <Text style={{ fontWeight: 600 }}>{formatearFecha(fechaVtoPago || fechaEmision)}</Text>
          </Text>
        </View>

        {/* Datos del Receptor / Cliente */}
        <View style={estilos.seccionReceptor}>
          <View style={estilos.columnaReceptor}>
            <View style={estilos.filaMeta}>
              <Text style={{ width: 110, color: COLOR_GRIS }}>CUIT / Documento:</Text>
              <Text style={{ fontWeight: 600 }}>{receptor.cuit || "Consumidor final"}</Text>
            </View>
            <View style={estilos.filaMeta}>
              <Text style={{ width: 110, color: COLOR_GRIS }}>Razón social / Nombre:</Text>
              <Text style={{ fontWeight: 600 }}>{receptor.razonSocial}</Text>
            </View>
          </View>

          <View style={estilos.columnaReceptor}>
            <View style={estilos.filaMeta}>
              <Text style={{ width: 110, color: COLOR_GRIS }}>Condición frente al IVA:</Text>
              <Text style={{ fontWeight: 600 }}>{receptor.condicionIva || "Consumidor final"}</Text>
            </View>
            <View style={estilos.filaMeta}>
              <Text style={{ width: 110, color: COLOR_GRIS }}>Domicilio comercial:</Text>
              <Text>{receptor.domicilio || "—"}</Text>
            </View>
          </View>
        </View>

        {/* Tabla de ítems */}
        <View style={estilos.tabla}>
          <View style={estilos.filaEncabezado}>
            <Text style={[estilos.th, estilos.colDesc]}>Descripción / Servicio</Text>
            <Text style={[estilos.th, estilos.colCant]}>Cant.</Text>
            <Text style={[estilos.th, estilos.colPrecio]}>Precio unit.</Text>
            <Text style={[estilos.th, estilos.colImporte]}>Subtotal</Text>
          </View>

          {items.map((item, idx) => (
            <View key={idx} style={estilos.filaItem}>
              <View style={estilos.colDesc}>
                <Text>{item.descripcion}</Text>
                {item.fecha && (
                  <Text style={estilos.itemFecha}>Fecha del servicio: {formatearFecha(item.fecha)}</Text>
                )}
              </View>
              <Text style={estilos.colCant}>1</Text>
              <Text style={estilos.colPrecio}>{formatearPesos(item.monto)}</Text>
              <Text style={estilos.colImporte}>{formatearPesos(item.monto)}</Text>
            </View>
          ))}
        </View>

        {/* Cuadro de totales */}
        <View style={estilos.seccionTotales}>
          <View style={estilos.cajaTotales}>
            {tipo === "A" ? (
              <>
                <View style={estilos.filaTotal}>
                  <Text style={{ color: COLOR_GRIS }}>Importe neto gravado:</Text>
                  <Text style={{ fontWeight: 600 }}>{formatearPesos(totales.neto)}</Text>
                </View>
                <View style={estilos.filaTotal}>
                  <Text style={{ color: COLOR_GRIS }}>IVA (21 %):</Text>
                  <Text style={{ fontWeight: 600 }}>{formatearPesos(totales.iva)}</Text>
                </View>
                <View style={estilos.filaTotalDestacada}>
                  <Text>Importe total:</Text>
                  <Text>{formatearPesos(totales.total)}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={estilos.filaTotalDestacada}>
                  <Text>Importe total:</Text>
                  <Text>{formatearPesos(totales.total)}</Text>
                </View>
                <Text style={estilos.leyendaIvaB}>
                  El monto incluye el Impuesto al Valor Agregado (IVA).
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Pie de página con QR, CAE y Datos de pago */}
        <View style={estilos.piePagina}>
          <View style={estilos.grillaInferior}>
            {/* QR y CAE */}
            <View style={estilos.cajaQr}>
              {qrDataUrl && <Image src={qrDataUrl} style={estilos.imgQr} />}
              <View style={estilos.metaCae}>
                <Text style={estilos.caeDestacado}>CAE Nº: {cae}</Text>
                <Text style={{ color: COLOR_GRIS }}>Fecha de vto. de CAE: {formatearFecha(caeVencimiento)}</Text>
                <Text style={{ fontSize: 7, color: COLOR_GRIS, marginTop: 4 }}>
                  Comprobante autorizado por ARCA
                </Text>
              </View>
            </View>

            {/* Datos para el pago */}
            {(emisor.cbu || emisor.aliasCbu) && (
              <View style={estilos.cajaPago}>
                <Text style={estilos.tituloPago}>Datos para el pago</Text>
                {emisor.banco && <Text>Banco: {emisor.banco}</Text>}
                {emisor.cbu && <Text>CBU: {emisor.cbu}</Text>}
                {emisor.aliasCbu && <Text>Alias: {emisor.aliasCbu}</Text>}
              </View>
            )}
          </View>

          {emisor.textoPie && (
            <Text style={estilos.textoPieConfig}>{emisor.textoPie}</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
