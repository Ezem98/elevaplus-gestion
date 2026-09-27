import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLIENTES,
  comoAdmin,
  comoChofer1,
  comoChofer2,
  comoOficina,
  limpiarRegistrosTest,
  USUARIOS,
} from "./setup";

describe("RLS Storage — Bucket adjuntos (H-1)", () => {
  const PREFIJO = "TEST-STORAGE-RLS-";
  const archivosParaLimpiar: string[] = [];

  beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
    archivosParaLimpiar.length = 0;
  });

  afterEach(async () => {
    const admin = await comoAdmin();
    if (archivosParaLimpiar.length > 0) {
      await admin.storage.from("adjuntos").remove(archivosParaLimpiar);
      archivosParaLimpiar.length = 0;
    }
    await limpiarRegistrosTest(PREFIJO);
  });

  it("Chofer no puede leer un PDF de presupuestos/", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();

    // 1. Admin crea un presupuesto y sube un PDF de prueba a Storage
    const { data: pres, error: errPres } = await admin
      .from("presupuestos")
      .insert({
        cliente_id: CLIENTES.deza.id,
        prospecto_nombre: `${PREFIJO}Presupuesto Confidencial`,
        validez_dias: 15,
        creado_por: USUARIOS.admin.id,
      })
      .select("id, numero")
      .single();

    expect(errPres).toBeNull();
    expect(pres).toBeDefined();

    const pdfPath = `presupuestos/${pres!.id}/presupuesto-${pres!.numero}.pdf`;
    const contenidoPdf = Buffer.from("%PDF-1.4 Presupuesto Confidencial Monto: $5.000.000");

    const { error: errUploadAdmin } = await admin.storage
      .from("adjuntos")
      .upload(pdfPath, contenidoPdf, {
        contentType: "application/pdf",
        upsert: true,
      });

    expect(errUploadAdmin).toBeNull();
    archivosParaLimpiar.push(pdfPath);

    // 2. Chofer intenta descargar el PDF: RLS bloquea la lectura
    const { data: dataDescarga, error: errDescarga } = await chofer1.storage
      .from("adjuntos")
      .download(pdfPath);

    expect(errDescarga).not.toBeNull();
    expect(dataDescarga).toBeNull();

    // 3. Chofer tampoco puede generar URL firmada para este PDF
    const { data: dataSigned, error: errSigned } = await chofer1.storage
      .from("adjuntos")
      .createSignedUrl(pdfPath, 3600);

    expect(errSigned).not.toBeNull();
    expect(dataSigned?.signedUrl).toBeUndefined();

    // 4. Chofer tampoco puede subir ni sobreescribir archivos en presupuestos/
    const { error: errUploadChofer } = await chofer1.storage
      .from("adjuntos")
      .upload(`presupuestos/${pres!.id}/intruso.pdf`, Buffer.from("pdf-ilegitimo"), {
        contentType: "application/pdf",
      });

    expect(errUploadChofer).not.toBeNull();
  });

  it("Chofer no puede leer ni subir un adjunto de un servicio ajeno", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Admin crea un servicio asignado únicamente a Chofer 2
    const { data: servAjeno, error: errServ } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio exclusivo Chofer 2`,
        monto: 85000,
        fecha_programada: hoy,
        creado_por: USUARIOS.admin.id,
      })
      .select("id")
      .single();

    expect(errServ).toBeNull();
    expect(servAjeno).toBeDefined();

    // Asignar exclusivamente a Chofer 2
    const { error: errAsign } = await admin.from("servicio_choferes").insert({
      servicio_id: servAjeno!.id,
      chofer_id: USUARIOS.chofer2.id,
    });
    expect(errAsign).toBeNull();

    // 2. Admin sube un remito de prueba para ese servicio
    const pathRemitoAjeno = `servicios/${servAjeno!.id}/remito-chofer2.jpg`;
    const contenidoFoto = Buffer.from("foto-remito-servicio-chofer2");

    const { error: errUploadAdmin } = await admin.storage
      .from("adjuntos")
      .upload(pathRemitoAjeno, contenidoFoto, {
        contentType: "image/jpeg",
        upsert: true,
      });

    expect(errUploadAdmin).toBeNull();
    archivosParaLimpiar.push(pathRemitoAjeno);

    // 3. Chofer 1 intenta descargar el archivo de un servicio que NO tiene asignado: RLS lo impide
    const { data: dataDescarga, error: errDescarga } = await chofer1.storage
      .from("adjuntos")
      .download(pathRemitoAjeno);

    expect(errDescarga).not.toBeNull();
    expect(dataDescarga).toBeNull();

    // 4. Chofer 1 tampoco puede listar la carpeta del servicio ajeno
    const { data: listaArchivos } = await chofer1.storage
      .from("adjuntos")
      .list(`servicios/${servAjeno!.id}`);

    expect(listaArchivos?.length ?? 0).toBe(0);

    // 5. Chofer 1 intenta subir un archivo al servicio ajeno: RLS lo rechaza
    const pathIntruso = `servicios/${servAjeno!.id}/remito-intruso.jpg`;
    const { error: errUploadChofer } = await chofer1.storage
      .from("adjuntos")
      .upload(pathIntruso, Buffer.from("foto-no-autorizada"), {
        contentType: "image/jpeg",
      });

    expect(errUploadChofer).not.toBeNull();
  });

  it("Chofer sí puede leer y subir en un servicio propio", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Admin crea un servicio y se lo asigna a Chofer 1
    const { data: servPropio, error: errServ } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio asignado a Chofer 1`,
        monto: 70000,
        fecha_programada: hoy,
        creado_por: USUARIOS.admin.id,
      })
      .select("id")
      .single();

    expect(errServ).toBeNull();
    expect(servPropio).toBeDefined();

    const { error: errAsign } = await admin.from("servicio_choferes").insert({
      servicio_id: servPropio!.id,
      chofer_id: USUARIOS.chofer1.id,
    });
    expect(errAsign).toBeNull();

    // 2. Chofer 1 sube foto de remito al servicio asignado
    const pathRemitoPropio = `servicios/${servPropio!.id}/remito-chofer1.jpg`;
    const contenidoOriginal = Buffer.from("foto-remito-legitima-chofer1");

    const { error: errUpload } = await chofer1.storage
      .from("adjuntos")
      .upload(pathRemitoPropio, contenidoOriginal, {
        contentType: "image/jpeg",
      });

    expect(errUpload).toBeNull();
    archivosParaLimpiar.push(pathRemitoPropio);

    // 3. Chofer 1 puede leer y descargar el archivo subido
    const { data: blobDescarga, error: errDownload } = await chofer1.storage
      .from("adjuntos")
      .download(pathRemitoPropio);

    expect(errDownload).toBeNull();
    expect(blobDescarga).not.toBeNull();
    const arrayBuffer = await blobDescarga!.arrayBuffer();
    expect(Buffer.from(arrayBuffer).toString()).toBe("foto-remito-legitima-chofer1");

    // 4. Chofer 1 puede sobreescribir con upsert: true (actualización permitida)
    const contenidoActualizado = Buffer.from("foto-remito-actualizada");
    const { error: errUpsert } = await chofer1.storage
      .from("adjuntos")
      .upload(pathRemitoPropio, contenidoActualizado, {
        contentType: "image/jpeg",
        upsert: true,
      });

    expect(errUpsert).toBeNull();
  });

  it("Chofer no puede borrar un archivo de su propio servicio (las fotos y remitos son evidencia)", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Admin crea un servicio asignado a Chofer 1
    const { data: servPropio, error: errServ } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio con remito para prueba de borrado`,
        monto: 65000,
        fecha_programada: hoy,
        creado_por: USUARIOS.admin.id,
      })
      .select("id")
      .single();

    expect(errServ).toBeNull();
    expect(servPropio).toBeDefined();

    await admin.from("servicio_choferes").insert({
      servicio_id: servPropio!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    // 2. Chofer sube una foto de remito
    const pathRemito = `servicios/${servPropio!.id}/remito-evidencia.jpg`;
    const { error: errUpload } = await chofer1.storage
      .from("adjuntos")
      .upload(pathRemito, Buffer.from("remito-inalterable-evidencia"), {
        contentType: "image/jpeg",
      });
    expect(errUpload).toBeNull();
    archivosParaLimpiar.push(pathRemito);

    // 3. Chofer intenta borrar el archivo: RLS no tiene policy de DELETE para chofer
    const { data: dataRemove, error: errRemove } = await chofer1.storage
      .from("adjuntos")
      .remove([pathRemito]);

    // En Supabase Storage, si RLS no permite DELETE, remove devuelve error o lista vacía sin borrar
    if (dataRemove) {
      expect(dataRemove.length).toBe(0);
    } else {
      expect(errRemove).not.toBeNull();
    }

    // 4. Verificación crucial: el archivo sigue existiendo intacto en Storage
    const { data: dataCheck, error: errCheck } = await chofer1.storage
      .from("adjuntos")
      .download(pathRemito);

    expect(errCheck).toBeNull();
    expect(dataCheck).not.toBeNull();
    const buf = Buffer.from(await dataCheck!.arrayBuffer());
    expect(buf.toString()).toBe("remito-inalterable-evidencia");
  });

  it("Oficina lee todo (presupuestos, comprobantes, y servicios propios o ajenos)", async () => {
    const admin = await comoAdmin();
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Crear un presupuesto con PDF
    const { data: pres } = await admin
      .from("presupuestos")
      .insert({
        cliente_id: CLIENTES.deza.id,
        prospecto_nombre: `${PREFIJO}Presupuesto Oficina`,
        validez_dias: 15,
        creado_por: USUARIOS.admin.id,
      })
      .select("id, numero")
      .single();

    const pdfPath = `presupuestos/${pres!.id}/presupuesto-${pres!.numero}.pdf`;
    await admin.storage
      .from("adjuntos")
      .upload(pdfPath, Buffer.from("%PDF-1.4 Presupuesto Para Oficina"), {
        contentType: "application/pdf",
        upsert: true,
      });
    archivosParaLimpiar.push(pdfPath);

    // 2. Crear un servicio asignado solo a Chofer 2 con un archivo
    const { data: serv } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio de Chofer 2`,
        monto: 40000,
        fecha_programada: hoy,
        creado_por: USUARIOS.admin.id,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: serv!.id,
      chofer_id: USUARIOS.chofer2.id,
    });

    const remitoPath = `servicios/${serv!.id}/remito-chofer2.jpg`;
    await admin.storage
      .from("adjuntos")
      .upload(remitoPath, Buffer.from("remito-chofer2-imagen"), {
        contentType: "image/jpeg",
        upsert: true,
      });
    archivosParaLimpiar.push(remitoPath);

    // 3. Crear comprobante de caja
    const comprobantePath = `comprobantes/reg-test-1/factura-proveedor.pdf`;
    const { error: errUploadComprobante } = await oficina.storage
      .from("adjuntos")
      .upload(comprobantePath, Buffer.from("%PDF-1.4 Comprobante Compra"), {
        contentType: "application/pdf",
        upsert: true,
      });
    expect(errUploadComprobante).toBeNull();
    archivosParaLimpiar.push(comprobantePath);

    // 4. Oficina lee el presupuesto
    const { data: dataPdf, error: errPdf } = await oficina.storage
      .from("adjuntos")
      .download(pdfPath);
    expect(errPdf).toBeNull();
    expect(dataPdf).not.toBeNull();

    // 5. Oficina lee el remito del servicio (aunque esté asignado a Chofer 2)
    const { data: dataRemito, error: errRemito } = await oficina.storage
      .from("adjuntos")
      .download(remitoPath);
    expect(errRemito).toBeNull();
    expect(dataRemito).not.toBeNull();

    // 6. Oficina lee el comprobante de caja
    const { data: dataComp, error: errComp } = await oficina.storage
      .from("adjuntos")
      .download(comprobantePath);
    expect(errComp).toBeNull();
    expect(dataComp).not.toBeNull();
  });
});
