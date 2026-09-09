import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import fontRegular from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url";
import fontMedium from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff?url";
import fontSemiBold from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url";
import fontBold from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff?url";
import {
  armarCondiciones,
  armarItems,
  calcularTotalesPresupuesto,
  formatearFechaLarga,
  formatearNumeroPresupuesto,
} from "@/lib/presupuesto";
import { formatearPesos } from "@/lib/formato";
import { ETIQUETA_CONDICION_IVA, type Empresa, type Servicio } from "@/lib/tipos";

Font.register({
  family: "IBM Plex Sans",
  fonts: [
    { src: fontRegular, fontWeight: 400 },
    { src: fontMedium, fontWeight: 500 },
    { src: fontSemiBold, fontWeight: 600 },
    { src: fontBold, fontWeight: 700 },
  ],
});

// Evitar cortes de palabra extraños en español
Font.registerHyphenationCallback((word) => [word]);

const COLOR_AZUL = "#1e4fa8";
const COLOR_TINTA = "#17212b";
const COLOR_GRIS = "#5b6b7b";
const COLOR_BORDE = "#d9e0e8";
const COLOR_FONDO_SUAVE = "#f5f7fa";

const estilos = StyleSheet.create({
  pagina: {
    padding: 56.7, // 20 mm
    fontFamily: "IBM Plex Sans",
    fontSize: 10,
    color: COLOR_TINTA,
    backgroundColor: "#ffffff",
    display: "flex",
    flexDirection: "column",
  },
  // Encabezado
  encabezado: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: COLOR_AZUL,
  },
  logoCaja: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoImg: {
    width: 36,
    height: 36,
  },
  marcaTexto: {
    fontSize: 18,
    fontWeight: 700,
    color: COLOR_TINTA,
    letterSpacing: -0.2,
  },
  metaDoc: {
    textAlign: "right",
  },
  tituloDoc: {
    fontSize: 16,
    fontWeight: 700,
    color: COLOR_AZUL,
  },
  fechaDoc: {
    fontSize: 11,
    fontWeight: 400,
    color: COLOR_GRIS,
    marginTop: 3,
  },

  // Grilla emisor y cliente
  grillaInfo: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_BORDE,
  },
  columnaInfo: {
    width: "48%",
    fontSize: 10,
    lineHeight: 1.5,
    color: COLOR_GRIS,
  },
  emisorRazonSocial: {
    fontSize: 12,
    fontWeight: 700,
    color: COLOR_TINTA,
    marginBottom: 3,
  },
  etiquetaPara: {
    fontSize: 11,
    fontWeight: 600,
    color: COLOR_TINTA,
    marginBottom: 3,
  },
  clienteRazonSocial: {
    fontSize: 12,
    fontWeight: 700,
    color: COLOR_TINTA,
    marginBottom: 2,
  },

  // Tabla
  tabla: {
    width: "100%",
    marginTop: 20,
  },
  filaEncabezado: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: COLOR_FONDO_SUAVE,
    borderTopWidth: 1,
    borderTopColor: COLOR_BORDE,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_BORDE,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  th: {
    fontSize: 10,
    fontWeight: 600,
    color: COLOR_TINTA,
  },
  filaItem: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOR_BORDE,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  colDesc: {
    width: "50%",
    textAlign: "left",
  },
  colCant: {
    width: "14%",
    textAlign: "center",
  },
  colPrecio: {
    width: "18%",
    textAlign: "right",
  },
  colImporte: {
    width: "18%",
    textAlign: "right",
  },
  itemTitulo: {
    fontSize: 11,
    fontWeight: 600,
    color: COLOR_TINTA,
    lineHeight: 1.3,
  },
  itemDetalle: {
    fontSize: 9.5,
    fontWeight: 400,
    color: COLOR_GRIS,
    marginTop: 3,
    lineHeight: 1.35,
  },
  itemTexto: {
    fontSize: 10.5,
    fontWeight: 400,
    color: COLOR_TINTA,
  },

  // Totales
  envolturaTotales: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  cajaTotales: {
    width: 220,
  },
  filaTotal: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  etiquetaTotal: {
    fontSize: 10.5,
    color: COLOR_GRIS,
  },
  valorTotal: {
    fontSize: 10.5,
    fontWeight: 500,
    color: COLOR_TINTA,
  },
  filaGranTotal: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLOR_BORDE,
    borderBottomWidth: 2,
    borderBottomColor: COLOR_TINTA,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 4,
  },
  etiquetaGranTotal: {
    fontSize: 13,
    fontWeight: 700,
    color: COLOR_TINTA,
  },
  valorGranTotal: {
    fontSize: 13,
    fontWeight: 700,
    color: COLOR_TINTA,
  },

  // Condiciones
  cajaCondiciones: {
    marginTop: 24,
    padding: 12,
    backgroundColor: COLOR_FONDO_SUAVE,
    borderLeftWidth: 2,
    borderLeftColor: COLOR_AZUL,
    borderRadius: 3,
  },
  tituloCondiciones: {
    fontSize: 10.5,
    fontWeight: 600,
    color: COLOR_TINTA,
    marginBottom: 6,
  },
  lineaCondicion: {
    fontSize: 9.5,
    lineHeight: 1.45,
    color: COLOR_GRIS,
    marginBottom: 3,
  },

  // Pie
  pie: {
    marginTop: "auto",
    paddingTop: 24,
  },
  notaPie: {
    fontSize: 11,
    fontWeight: 600,
    color: COLOR_TINTA,
  },
  lineaAcentoPie: {
    marginTop: 12,
    height: 2,
    backgroundColor: COLOR_AZUL,
    width: "100%",
  },
});

export interface PresupuestoPDFProps {
  empresa: Empresa;
  servicio: Servicio;
  validezDias?: number;
  extra?: string | null;
  fecha?: string | Date | null;
}

export function PresupuestoPDF({
  empresa,
  servicio,
  validezDias,
  extra,
  fecha,
}: PresupuestoPDFProps) {
  const diasValidez = validezDias ?? servicio.presupuesto_validez_dias ?? empresa.presupuesto_validez_dias ?? 15;
  const condicionesExtra = extra !== undefined ? extra : servicio.presupuesto_condiciones ?? empresa.presupuesto_condiciones_extra;

  const condiciones = armarCondiciones({
    empresa,
    servicio,
    validezDias: diasValidez,
    extra: condicionesExtra,
  });

  const items = armarItems(servicio);
  const totales = calcularTotalesPresupuesto(servicio);
  const numeroTexto = formatearNumeroPresupuesto(servicio.numero);
  const fechaTexto = formatearFechaLarga(fecha ?? servicio.presupuesto_generado_at ?? new Date());

  const logoUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/icono-192.png`
      : "/icono-192.png";

  const cliente = servicio.clientes;
  const clienteCondicion = cliente?.condicion_iva
    ? ETIQUETA_CONDICION_IVA[cliente.condicion_iva] ?? cliente.condicion_iva
    : null;

  const lineaCuitCondicionCliente = [
    cliente?.cuit ? `CUIT ${cliente.cuit}` : null,
    clienteCondicion,
  ]
    .filter(Boolean)
    .join(" · ");

  const lineaDireccionCliente = [cliente?.direccion, cliente?.localidad]
    .filter(Boolean)
    .join(", ");

  const contactoEmisor = [empresa.telefono, empresa.instagram, empresa.email]
    .filter(Boolean)
    .join(" · ");

  const condicionIvaEmisor =
    ETIQUETA_CONDICION_IVA[empresa.condicion_iva] ?? empresa.condicion_iva;

  return (
    <Document>
      <Page size="A4" style={estilos.pagina}>
        {/* Encabezado */}
        <View style={estilos.encabezado}>
          <View style={estilos.logoCaja}>
            <Image src={logoUrl} style={estilos.logoImg} />
            <Text style={estilos.marcaTexto}>ELEVAPLUS</Text>
          </View>
          <View style={estilos.metaDoc}>
            <Text style={estilos.tituloDoc}>Presupuesto {numeroTexto}</Text>
            <Text style={estilos.fechaDoc}>{fechaTexto}</Text>
          </View>
        </View>

        {/* Grilla Emisor / Cliente */}
        <View style={estilos.grillaInfo}>
          {/* Emisor */}
          <View style={estilos.columnaInfo}>
            <Text style={estilos.emisorRazonSocial}>{empresa.razon_social}</Text>
            <Text>
              CUIT {empresa.cuit} · {condicionIvaEmisor}
            </Text>
            {empresa.domicilio && <Text>{empresa.domicilio}</Text>}
            {contactoEmisor && <Text>{contactoEmisor}</Text>}
          </View>

          {/* Cliente */}
          <View style={estilos.columnaInfo}>
            <Text style={estilos.etiquetaPara}>Para:</Text>
            <Text style={estilos.clienteRazonSocial}>
              {cliente?.nombre || "Cliente"}
            </Text>
            {lineaCuitCondicionCliente && <Text>{lineaCuitCondicionCliente}</Text>}
            {lineaDireccionCliente && <Text>{lineaDireccionCliente}</Text>}
          </View>
        </View>

        {/* Tabla de ítems */}
        <View style={estilos.tabla}>
          <View style={estilos.filaEncabezado}>
            <Text style={[estilos.th, estilos.colDesc]}>Descripción</Text>
            <Text style={[estilos.th, estilos.colCant]}>Cantidad</Text>
            <Text style={[estilos.th, estilos.colPrecio]}>Precio unitario</Text>
            <Text style={[estilos.th, estilos.colImporte]}>Importe</Text>
          </View>

          {items.map((item, idx) => (
            <View key={idx} style={estilos.filaItem}>
              <View style={estilos.colDesc}>
                <Text style={estilos.itemTitulo}>{item.descripcion}</Text>
                {item.detalle ? (
                  <Text style={estilos.itemDetalle}>{item.detalle}</Text>
                ) : null}
              </View>
              <View style={estilos.colCant}>
                <Text style={estilos.itemTexto}>{item.cantidad}</Text>
              </View>
              <View style={estilos.colPrecio}>
                <Text style={estilos.itemTexto}>
                  {formatearPesos(item.precioUnitario)}
                </Text>
              </View>
              <View style={estilos.colImporte}>
                <Text style={estilos.itemTexto}>
                  {formatearPesos(item.importe)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Totales */}
        <View style={estilos.envolturaTotales}>
          <View style={estilos.cajaTotales}>
            {servicio.aplica_iva ? (
              <>
                <View style={estilos.filaTotal}>
                  <Text style={estilos.etiquetaTotal}>Subtotal neto</Text>
                  <Text style={estilos.valorTotal}>
                    {formatearPesos(totales.neto)}
                  </Text>
                </View>
                <View style={estilos.filaTotal}>
                  <Text style={estilos.etiquetaTotal}>IVA (21 %)</Text>
                  <Text style={estilos.valorTotal}>
                    {formatearPesos(totales.iva)}
                  </Text>
                </View>
              </>
            ) : null}

            <View style={estilos.filaGranTotal}>
              <Text style={estilos.etiquetaGranTotal}>Total</Text>
              <Text style={estilos.valorGranTotal}>
                {formatearPesos(totales.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Condiciones */}
        {condiciones.length > 0 && (
          <View style={estilos.cajaCondiciones}>
            <Text style={estilos.tituloCondiciones}>Condiciones</Text>
            {condiciones.map((linea, idx) => (
              <Text key={idx} style={estilos.lineaCondicion}>
                • {linea}
              </Text>
            ))}
          </View>
        )}

        {/* Pie */}
        <View style={estilos.pie}>
          <Text style={estilos.notaPie}>Gracias por consultarnos.</Text>
          <View style={estilos.lineaAcentoPie} />
        </View>
      </Page>
    </Document>
  );
}
