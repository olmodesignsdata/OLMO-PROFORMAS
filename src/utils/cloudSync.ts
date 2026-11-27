import { createInitialProforma, normalizeCompanyDefaults } from '../data/defaults';
import {
  AranSpecTemplate,
  CloudSyncConfig,
  ComputedTotals,
  ProductLineItem,
  ProformaData,
  ProformaType,
  SavedProformaRecord,
  TerminoTemplate,
} from '../types/proforma';
import {
  computeProformaTotals,
  formatProformaNumberLabel,
  isProformaDraft,
} from './formatters';
import { ClientImportRow } from './googleSheets';

/**
 * ============================================================================
 * INTEGRACIÓN CON GOOGLE SHEETS (GOOGLE APPS SCRIPT WEB APP) O WEBHOOK
 * ============================================================================
 *
 * Cómo conectar esta aplicación con un Google Sheet en 4 pasos:
 * 1. Abre tu Google Sheet (por ejemplo "Registro_Proformas_OLMO") y ve a:
 *    Extensiones > Apps Script.
 * 2. Pega el código de la constante GOOGLE_APPS_SCRIPT_TEMPLATE en Code.gs
 *    y guarda el proyecto.
 * 3. Haz clic en: Implementar > Nueva implementación > Tipo: "Aplicación web".
 *    - Ejecutar como: "Yo" (tu cuenta)
 *    - Quién tiene acceso: "Cualquier usuario" (Anyone)
 * 4. Copia la URL terminada en /exec y pégala en la pestaña "Integración"
 *    (y opcionalmente en "Clientes" para sincronizar la pestaña CLIENTES).
 */

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * Google Apps Script (Code.gs) para Registro_Proformas_OLMO.
 * - doPost: guarda/actualiza/elimina cotizaciones en la pestaña "PROFORMAS" (incluyendo Datos_JSON)
 *           y clientes en la pestaña "CLIENTES", evitando duplicados y filas vacías (huecos).
 * - doGet: devuelve registros de la pestaña solicitada ("PROFORMAS" por defecto).
 */
const SECRET_TOKEN = ""; // Opcional: debe coincidir con el token configurado en la app

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function removeBlankRows_(sheet, totalCols) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var cols = Math.max(totalCols || sheet.getLastColumn() || 1, 1);
  var values = sheet.getRange(1, 1, lastRow, cols).getValues();
  for (var r = values.length - 1; r >= 1; r--) {
    var hasValue = false;
    for (var c = 0; c < values[r].length; c++) {
      if (String(values[r][c] || "").trim() !== "") {
        hasValue = true;
        break;
      }
    }
    if (!hasValue) {
      sheet.deleteRow(r + 1);
    }
  }
}

function rowJsonMatchesId_(jsonText, targetId) {
  if (!targetId || !jsonText) return false;
  var str = String(jsonText);
  if (str.indexOf('"' + targetId + '"') === -1) return false;
  try {
    var parsed = JSON.parse(str);
    if (parsed && typeof parsed === "object") {
      if (String(parsed.id || "").trim() === targetId) return true;
      if (parsed.proforma && String(parsed.proforma.id || "").trim() === targetId) return true;
    }
  } catch (ignore) {}
  return str.indexOf('"' + targetId + '"') !== -1;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (SECRET_TOKEN && params.token !== SECRET_TOKEN) {
      return jsonResponse({ ok: false, error: "Token inválido" });
    }

    const sheetName = params.sheet || "PROFORMAS";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return jsonResponse({ ok: true, sheet: sheetName, rows: [] });
    }

    const values = sheet.getDataRange().getValues();
    if (!values || values.length < 2) {
      return jsonResponse({ ok: true, sheet: sheetName, rows: [] });
    }

    const headers = values[0].map(function(h) { return String(h || "").trim(); });
    const rows = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var hasValue = row.some(function(cell) { return String(cell || "").trim() !== ""; });
      if (!hasValue) continue;
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        if (headers[c]) obj[headers[c]] = row[c];
      }
      rows.push(obj);
    }

    return jsonResponse({
      ok: true,
      sheet: sheetName,
      spreadsheetUrl: ss.getUrl(),
      rows: rows
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (SECRET_TOKEN && payload.token !== SECRET_TOKEN) {
      return jsonResponse({ ok: false, error: "Token inválido" });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawAction = String(payload.action || "").trim().toLowerCase();
    const rawLegacyAction = String(payload.legacyAction || "").trim().toLowerCase();
    const rawEvent = String(payload.event || "").trim().toLowerCase();

    const isClientReq =
      payload.entity === "client" ||
      rawAction === "upsert_client" ||
      rawAction === "delete_client" ||
      rawLegacyAction === "upsert_client" ||
      rawLegacyAction === "delete_client" ||
      rawEvent === "client_upsert" ||
      rawEvent === "client_delete" ||
      Boolean(payload.clienteData) ||
      (Boolean(payload.client) && !payload.proforma);

    if (isClientReq) {
      const sheetName = payload.sheetName || "CLIENTES";
      const clientObj = payload.clienteData || payload.client || {};
      const isClientDelete =
        rawAction === "delete" ||
        rawAction === "delete_client" ||
        rawLegacyAction === "delete_client" ||
        rawEvent === "client_delete";

      if (isClientDelete) {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) {
          return jsonResponse({ ok: true, deleted: false, sheet: sheetName });
        }
        const targetName = String(clientObj.cliente || payload.cliente || "").trim().toLowerCase();
        const originalName = String(
          clientObj.previousCliente ||
          clientObj.originalCliente ||
          payload.previousCliente ||
          payload.originalCliente ||
          ""
        ).trim().toLowerCase();
        if (!targetName && !originalName) {
          return jsonResponse({ ok: false, error: "Nombre de cliente requerido para eliminar." });
        }
        const values = sheet.getDataRange().getValues();
        let deletedCount = 0;
        for (var dr = values.length - 1; dr >= 1; dr--) {
          var rowClientName = String(values[dr][0] || "").trim().toLowerCase();
          if (
            (targetName && rowClientName === targetName) ||
            (originalName && rowClientName === originalName)
          ) {
            sheet.deleteRow(dr + 1);
            deletedCount++;
          }
        }
        removeBlankRows_(sheet, 6);
        return jsonResponse({
          ok: true,
          deleted: deletedCount > 0,
          deletedCount: deletedCount,
          sheet: sheetName,
          cliente: targetName || originalName
        });
      }

      const c = clientObj;
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        sheet.appendRow(["Cliente", "Contacto", "Telefono", "Correo", "Ubicacion", "Actualizado"]);
        sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
      }

      removeBlankRows_(sheet, 6);
      const values = sheet.getDataRange().getValues();
      const targetName = String(c.cliente || payload.cliente || "").trim().toLowerCase();
      const originalName = String(
        c.previousCliente ||
        c.originalCliente ||
        payload.previousCliente ||
        payload.originalCliente ||
        ""
      ).trim().toLowerCase();
      const matchedRows = [];
      for (var r = 1; r < values.length; r++) {
        var rowClient = String(values[r][0] || "").trim().toLowerCase();
        if (
          (originalName && rowClient === originalName) ||
          (targetName && rowClient === targetName)
        ) {
          matchedRows.push(r + 1);
        }
      }

      const rowValues = [
        c.cliente || payload.cliente || "",
        c.contacto || "",
        c.telefono || "",
        c.correo || "",
        c.ubicacion || "",
        new Date()
      ];

      if (matchedRows.length > 0) {
        sheet.getRange(matchedRows[0], 1, 1, 6).setValues([rowValues]);
        for (var dupC = matchedRows.length - 1; dupC >= 1; dupC--) {
          sheet.deleteRow(matchedRows[dupC]);
        }
      } else {
        sheet.appendRow(rowValues);
      }
      removeBlankRows_(sheet, 6);

      return jsonResponse({ ok: true, sheet: sheetName, cliente: c.cliente || "" });
    }

    let sheet = ss.getSheetByName("PROFORMAS");
    if (!sheet) {
      sheet = ss.insertSheet("PROFORMAS");
      sheet.appendRow([
        "Fecha Registro",
        "Consecutivo",
        "Fecha Proforma",
        "Cliente",
        "Contacto",
        "Telefono",
        "Correo",
        "Ubicacion",
        "Proyecto",
        "Validez",
        "Moneda",
        "Unidades",
        "Subtotal",
        "Impuesto (%)",
        "Impuesto Monto",
        "Total",
        "Desglose Pagos",
        "Datos_JSON"
      ]);
      sheet.getRange(1, 1, 1, 18).setFontWeight("bold");
    }

    const isProformaDelete =
      rawAction === "delete" ||
      rawAction === "delete_proforma" ||
      rawLegacyAction === "delete_proforma" ||
      rawEvent === "proforma_delete";

    if (isProformaDelete) {
      const targetId = String(payload.draftId || payload.id || "").trim();
      const rawTargetNum = payload.consecutivo !== undefined ? String(payload.consecutivo).trim() : "";
      const isNumberedTarget = Boolean(rawTargetNum && rawTargetNum.toLowerCase() !== "borrador" && Number(rawTargetNum) > 0);
      const targetCliente = String(payload.cliente || "").trim().toLowerCase();
      const targetProyecto = String(payload.proyecto || "").trim().toLowerCase();
      const existingDel = sheet.getDataRange().getValues();
      let deletedCount = 0;
      for (var dIdx = existingDel.length - 1; dIdx >= 1; dIdx--) {
        var jsonCell = String(existingDel[dIdx][17] || "");
        var rowNumCell = String(existingDel[dIdx][1] || "").trim();
        var rowClienteCell = String(existingDel[dIdx][3] || "").trim().toLowerCase();
        var rowProyectoCell = String(existingDel[dIdx][8] || "").trim().toLowerCase();
        var matchesId = targetId && rowJsonMatchesId_(jsonCell, targetId);
        var matchesNum = isNumberedTarget && rowNumCell === rawTargetNum;
        var matchesMetaFallback =
          !isNumberedTarget &&
          (rowNumCell === "" || rowNumCell.toLowerCase() === "borrador") &&
          Boolean(targetCliente || targetProyecto) &&
          (!targetCliente || rowClienteCell === targetCliente) &&
          (!targetProyecto || rowProyectoCell === targetProyecto);
        if (matchesId || matchesNum || matchesMetaFallback) {
          sheet.deleteRow(dIdx + 1);
          deletedCount++;
        }
      }
      removeBlankRows_(sheet, 18);
      return jsonResponse({ ok: true, deleted: deletedCount > 0, deletedCount: deletedCount });
    }

    const p = payload.proforma;
    const t = payload.totales;
    const isDraftDoc = Boolean(p.isDraft || payload.isDraft || String(payload.consecutivo || "").toLowerCase() === "borrador" || Number(p.consecutivo || 0) <= 0);
    const targetConsecutivo = isDraftDoc ? "Borrador" : (payload.consecutivo || p.consecutivo);
    const targetDraftId = String(payload.draftId || payload.id || p.id || "").trim();
    const datosJson = payload.Datos_JSON || JSON.stringify(p);
    const rowData = [
      new Date(),
      targetConsecutivo,
      p.clientProject.fecha,
      payload.cliente || p.clientProject.cliente,
      p.clientProject.contacto,
      p.clientProject.telefono || "",
      p.clientProject.correo || "",
      p.clientProject.ubicacion,
      payload.proyecto || p.clientProject.proyecto || "",
      p.clientProject.validez,
      p.clientProject.moneda,
      t.unidadResumen,
      t.subtotal,
      p.taxRate,
      t.impuesto,
      t.total,
      t.paymentRows
        .filter(function(r) { return r.porcentaje > 0; })
        .map(function(r) { return r.concepto + " (" + r.porcentaje + "%)"; })
        .join(" | "),
      datosJson
    ];

    removeBlankRows_(sheet, 18);
    const existing = sheet.getDataRange().getValues();
    const matchedRows = [];
    for (var j = 1; j < existing.length; j++) {
      var matchesDraftId = targetDraftId && rowJsonMatchesId_(existing[j][17], targetDraftId);
      var matchesConsecutivo = !isDraftDoc && String(existing[j][1]).trim() === String(targetConsecutivo).trim();
      if (matchesDraftId || matchesConsecutivo) {
        matchedRows.push(j + 1);
      }
    }

    const allowOverwrite =
      payload.overwrite === false
        ? false
        : (
            payload.overwrite === true ||
            rawAction === "overwrite" ||
            payload.mode === "overwrite" ||
            payload.overwrite === undefined ||
            isDraftDoc
          );

    if (matchedRows.length > 0) {
      if (!allowOverwrite) {
        return jsonResponse({
          ok: false,
          duplicate: true,
          consecutivo: targetConsecutivo,
          error: "La proforma #" + targetConsecutivo + " ya existe en PROFORMAS. Confirma la sobrescritura para reemplazarla."
        });
      }
      sheet.getRange(matchedRows[0], 1, 1, 18).setValues([rowData]);
      for (var dupP = matchedRows.length - 1; dupP >= 1; dupP--) {
        sheet.deleteRow(matchedRows[dupP]);
      }
      removeBlankRows_(sheet, 18);
      return jsonResponse({ ok: true, id: targetDraftId, consecutivo: targetConsecutivo, overwritten: true });
    } else {
      sheet.appendRow(rowData);
      removeBlankRows_(sheet, 18);
      return jsonResponse({ ok: true, id: targetDraftId, consecutivo: targetConsecutivo, overwritten: false });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}`;

export interface CloudSyncPayload {
  entity: 'proforma';
  event: 'proforma_saved';
  action: 'overwrite';
  sentAt: string;
  token?: string;
  id: string;
  consecutivo: number | 'Borrador';
  isDraft: boolean;
  draftId: string;
  overwrite: boolean;
  mode: 'overwrite' | 'create';
  cliente: string;
  proyecto: string;
  Datos_JSON: string;
  proforma: ProformaData;
  totales: ComputedTotals;
}

export function buildCloudPayload(
  proforma: ProformaData,
  totales: ComputedTotals,
  secretToken?: string,
  options?: { overwrite?: boolean }
): CloudSyncPayload {
  const isOverwrite = Boolean(options?.overwrite);
  const draft = isProformaDraft(proforma);
  return {
    entity: 'proforma',
    event: 'proforma_saved',
    action: 'overwrite',
    sentAt: new Date().toISOString(),
    ...(secretToken ? { token: secretToken } : {}),
    id: proforma.id,
    consecutivo: draft ? 'Borrador' : proforma.consecutivo,
    isDraft: draft,
    draftId: proforma.id,
    overwrite: isOverwrite,
    mode: isOverwrite ? 'overwrite' : 'create',
    cliente: (proforma.clientProject.cliente ?? '').trim(),
    proyecto: (proforma.clientProject.proyecto ?? '').trim(),
    Datos_JSON: JSON.stringify(proforma),
    proforma,
    totales,
  };
}

function validateHttpUrl(rawUrl: string): URL | string {
  const url = rawUrl.trim();
  if (!url) {
    return 'Ingresa y guarda una URL válida de Google Apps Script (/exec) o Webhook.';
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'El formato de la URL no es válido. Debe comenzar con https:// o http://';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'La URL debe comenzar con https:// o http://';
  }
  return parsed;
}

export async function sendProformaToWebhook(
  config: CloudSyncConfig,
  proforma: ProformaData,
  totales: ComputedTotals,
  options?: { overwrite?: boolean }
): Promise<{ ok: boolean; message: string; opaque?: boolean }> {
  if (!config.webhookUrl.trim()) {
    return {
      ok: false,
      message:
        'Falta configurar la URL de Google Apps Script (/exec) en la pestaña Integración.',
    };
  }

  const validated = validateHttpUrl(config.webhookUrl);
  if (typeof validated === 'string') {
    return {
      ok: false,
      message: validated,
    };
  }
  const url = validated.toString();

  const isOverwrite = Boolean(options?.overwrite);
  const payload = buildCloudPayload(
    proforma,
    totales,
    config.secretToken.trim(),
    { overwrite: isOverwrite }
  );
  const serializedPayload = JSON.stringify(payload);

  // 1. Intento estándar CORS (permite leer JSON de respuesta si el servidor/GAS lo permite)
  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: serializedPayload,
    });

    const numLabel = formatProformaNumberLabel(proforma);
    if (response.type === 'opaque') {
      return {
        ok: true,
        opaque: true,
        message: isOverwrite
          ? `Proforma ${numLabel} sobrescrita y enviada al Sheet PROFORMAS.`
          : `Proforma ${numLabel} enviada a la URL configurada (modo compatible con Google Apps Script). Verifica el registro en tu hoja de cálculo.`,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        message: `El servidor respondió con estado HTTP ${response.status}. Verifica que la Web App esté publicada con acceso "Cualquier usuario".`,
      };
    }

    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.ok === false) {
        return {
          ok: false,
          message: parsed.error || 'El webhook rechazó el registro.',
        };
      }
    } catch {
      // Algunos webhooks responden texto plano o vacío con HTTP 200
    }

    return {
      ok: true,
      message: isOverwrite
        ? `Proforma ${numLabel} sobrescrita y actualizada en el Sheet PROFORMAS.`
        : `Proforma ${numLabel} enviada y confirmada correctamente.`,
    };
  } catch {
    // 2. Respaldo compatible con Google Apps Script Web Apps (/exec) cuando
    //    la redirección 302 a script.googleusercontent.com bloquea lectura CORS.
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: serializedPayload,
      });

      const numLabel = formatProformaNumberLabel(proforma);
      return {
        ok: true,
        opaque: true,
        message: isOverwrite
          ? `Proforma ${numLabel} sobrescrita en Google Apps Script (modo no-cors).`
          : `Proforma ${numLabel} enviada a Google Apps Script / Webhook (envío en modo no-cors). Revisa tu hoja de cálculo para confirmar la nueva fila.`,
      };
    } catch (fallbackErr) {
      return {
        ok: false,
        message:
          fallbackErr instanceof Error
            ? `No se pudo enviar la proforma a la URL configurada (${fallbackErr.message}). Verifica tu conexión y que la URL sea correcta.`
            : 'Error de conexión al enviar la proforma a la URL configurada.',
      };
    }
  }
}

export async function deleteProformaFromSheet(
  config: CloudSyncConfig,
  record: {
    id?: string;
    consecutivo?: number;
    isDraft?: boolean;
    cliente?: string;
    proyecto?: string;
    data?: ProformaData;
  }
): Promise<{ ok: boolean; message: string; opaque?: boolean }> {
  if (!config.webhookUrl.trim()) {
    return {
      ok: false,
      message:
        'Falta configurar la URL de Google Apps Script (/exec) en la pestaña Integración.',
    };
  }
  const validated = validateHttpUrl(config.webhookUrl);
  if (typeof validated === 'string') {
    return { ok: false, message: validated };
  }
  const url = validated.toString();
  const isDraftDoc = Boolean(
    record.isDraft || !record.consecutivo || record.consecutivo <= 0
  );
  const resolvedId = record.id ?? record.data?.id ?? '';
  const resolvedCliente = (
    record.cliente ??
    record.data?.clientProject?.cliente ??
    ''
  ).trim();
  const resolvedProyecto = (
    record.proyecto ??
    record.data?.clientProject?.proyecto ??
    ''
  ).trim();
  const payload = {
    entity: 'proforma',
    event: 'proforma_delete',
    action: 'delete',
    legacyAction: 'delete_proforma',
    sentAt: new Date().toISOString(),
    ...(config.secretToken.trim() ? { token: config.secretToken.trim() } : {}),
    draftId: resolvedId,
    id: resolvedId,
    isDraft: isDraftDoc,
    consecutivo: isDraftDoc ? 'Borrador' : record.consecutivo,
    cliente: resolvedCliente,
    proyecto: resolvedProyecto,
  };
  const serialized = JSON.stringify(payload);
  const label = formatProformaNumberLabel(record);

  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: serialized,
    });
    if (response.type === 'opaque') {
      return {
        ok: true,
        opaque: true,
        message: `Proforma ${label} eliminada del Sheet PROFORMAS.`,
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        message: `El Apps Script respondió HTTP ${response.status} al eliminar la proforma.`,
      };
    }
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.ok === false) {
        return {
          ok: false,
          message: parsed.error || 'El Apps Script rechazó la eliminación.',
        };
      }
    } catch {
      // ignore non-JSON response
    }
    return {
      ok: true,
      message: `Proforma ${label} eliminada del Sheet PROFORMAS.`,
    };
  } catch {
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: serialized,
      });
      return {
        ok: true,
        opaque: true,
        message: `Proforma ${label} eliminada del Sheet PROFORMAS.`,
      };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? `No se pudo eliminar la proforma del Sheet (${err.message}).`
            : 'Error de conexión al eliminar la proforma del Sheet.',
      };
    }
  }
}

export async function sendClientToGoogleSheet(
  appsScriptUrl: string,
  client: ClientImportRow,
  sheetName = 'CLIENTES',
  originalCliente?: string,
  clientId?: string
): Promise<{ ok: boolean; message: string; opaque?: boolean }> {
  const validated = validateHttpUrl(appsScriptUrl);
  if (typeof validated === 'string') {
    return {
      ok: false,
      message:
        'Configura una URL válida de Google Apps Script (/exec) para Clientes antes de enviar a Google Sheets.',
    };
  }

  if (!client.cliente.trim()) {
    return {
      ok: false,
      message: 'El nombre del cliente es obligatorio para enviarlo al Sheet.',
    };
  }

  const url = validated.toString();
  const cleanCliente = client.cliente.trim();
  const cleanPrevCliente = originalCliente?.trim() || '';
  const clientPayloadObj = {
    id: clientId?.trim() || '',
    cliente: cleanCliente,
    previousCliente: cleanPrevCliente,
    originalCliente: cleanPrevCliente,
    contacto: client.contacto.trim(),
    telefono: client.telefono.trim(),
    correo: client.correo.trim(),
    ubicacion: client.ubicacion.trim(),
  };
  const payload = {
    entity: 'client',
    event: 'client_upsert',
    action: 'update',
    legacyAction: 'upsert_client',
    id: clientId?.trim() || '',
    sheetName: sheetName.trim() || 'CLIENTES',
    sentAt: new Date().toISOString(),
    cliente: cleanCliente,
    previousCliente: cleanPrevCliente,
    originalCliente: cleanPrevCliente,
    clienteData: clientPayloadObj,
    client: clientPayloadObj,
  };
  const serialized = JSON.stringify(payload);

  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: serialized,
    });

    if (response.type === 'opaque') {
      return {
        ok: true,
        opaque: true,
        message: `Cliente "${client.cliente}" enviado a la pestaña "${payload.sheetName}" en Google Sheets.`,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        message: `Google Apps Script respondió con estado HTTP ${response.status}. Verifica que la Web App tenga acceso "Cualquier usuario".`,
      };
    }

    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.ok === false) {
        return {
          ok: false,
          message:
            parsed.error ||
            'El Apps Script rechazó el guardado del cliente.',
        };
      }
    } catch {
      // Respuesta no JSON con HTTP 200
    }

    return {
      ok: true,
      message: `Cliente "${client.cliente}" guardado correctamente en la pestaña "${payload.sheetName}" de Google Sheets.`,
    };
  } catch {
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: serialized,
      });

      return {
        ok: true,
        opaque: true,
        message: `Cliente "${client.cliente}" enviado a Google Apps Script (modo no-cors) para la pestaña "${payload.sheetName}".`,
      };
    } catch (fallbackErr) {
      return {
        ok: false,
        message:
          fallbackErr instanceof Error
            ? `No se pudo enviar el cliente a Google Sheets (${fallbackErr.message}).`
            : 'Error de conexión al enviar el cliente a Google Sheets.',
      };
    }
  }
}

export async function deleteClientFromGoogleSheet(
  appsScriptUrl: string,
  clienteName: string,
  sheetName = 'CLIENTES',
  clientId?: string,
  clientDetails?: Partial<ClientImportRow>
): Promise<{ ok: boolean; message: string; opaque?: boolean }> {
  const validated = validateHttpUrl(appsScriptUrl);
  if (typeof validated === 'string') {
    return {
      ok: false,
      message:
        'Configura una URL válida de Google Apps Script (/exec) para Clientes.',
    };
  }

  const cleanName = clienteName.trim();
  if (!cleanName) {
    return {
      ok: false,
      message: 'Nombre de cliente requerido para eliminar del Sheet.',
    };
  }

  const url = validated.toString();
  const targetSheet = sheetName.trim() || 'CLIENTES';
  const clientDeleteObj = {
    id: clientId?.trim() || '',
    cliente: cleanName,
    previousCliente: cleanName,
    originalCliente: cleanName,
    contacto: clientDetails?.contacto?.trim() || '',
    telefono: clientDetails?.telefono?.trim() || '',
    correo: clientDetails?.correo?.trim() || '',
    ubicacion: clientDetails?.ubicacion?.trim() || '',
  };
  const payload = {
    entity: 'client',
    event: 'client_delete',
    action: 'delete',
    legacyAction: 'delete_client',
    id: clientId?.trim() || '',
    sheetName: targetSheet,
    sentAt: new Date().toISOString(),
    cliente: cleanName,
    previousCliente: cleanName,
    originalCliente: cleanName,
    clienteData: clientDeleteObj,
    client: clientDeleteObj,
  };
  const serialized = JSON.stringify(payload);

  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: serialized,
    });
    if (response.type === 'opaque') {
      return {
        ok: true,
        opaque: true,
        message: `Cliente "${cleanName}" eliminado de la pestaña "${targetSheet}".`,
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        message: `Google Apps Script respondió HTTP ${response.status} al eliminar "${cleanName}".`,
      };
    }
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.ok === false) {
        return {
          ok: false,
          message: parsed.error || 'El Apps Script rechazó la eliminación del cliente.',
        };
      }
    } catch {
      // ignore non-JSON
    }
    return {
      ok: true,
      message: `Cliente "${cleanName}" eliminado correctamente de "${targetSheet}".`,
    };
  } catch {
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: serialized,
      });
      return {
        ok: true,
        opaque: true,
        message: `Cliente "${cleanName}" eliminado de la pestaña "${targetSheet}".`,
      };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? `No se pudo eliminar el cliente del Sheet (${err.message}).`
            : 'Error de conexión al eliminar el cliente del Sheet.',
      };
    }
  }
}

function normalizeRowKey(key: string): string {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function buildNormalizedRowLookup(row: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();
  Object.entries(row).forEach(([k, v]) => {
    const norm = normalizeRowKey(k);
    if (norm && !map.has(norm)) {
      map.set(norm, v);
    }
  });
  return map;
}

function pickRowValue(
  lookup: Map<string, unknown>,
  aliases: string[]
): unknown {
  for (const alias of aliases) {
    const val = lookup.get(normalizeRowKey(alias));
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return val;
    }
  }
  return undefined;
}

function extractRowsArrayFromGetResponse(raw: unknown): Record<string, unknown>[] {
  let candidateList: unknown[] | null = null;

  if (Array.isArray(raw)) {
    candidateList = raw;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (obj.ok === false) {
      throw new Error(
        typeof obj.error === 'string' && obj.error.trim()
          ? obj.error
          : 'Google Apps Script devolvió un error al consultar la hoja.'
      );
    }
    const keys = [
      'rows',
      'proformas',
      'records',
      'data',
      'items',
      'clients',
      'values',
      'aran',
      'bloques',
      'blocks',
      'specs',
      'templates',
    ];
    for (const k of keys) {
      if (Array.isArray(obj[k])) {
        candidateList = obj[k] as unknown[];
        break;
      }
    }
  }

  if (!candidateList) {
    return [];
  }

  if (candidateList.length === 0) return [];

  // Si vino como matriz 2D [[headers], [row1], ...]
  if (Array.isArray(candidateList[0])) {
    const matrix = candidateList as unknown[][];
    if (matrix.length < 2) return [];
    const headers = (matrix[0] ?? []).map((h) => String(h ?? '').trim());
    const out: Record<string, unknown>[] = [];
    for (let r = 1; r < matrix.length; r++) {
      const cells = matrix[r] ?? [];
      if (cells.every((c) => !String(c ?? '').trim())) continue;
      const rec: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        if (h) rec[h] = cells[idx];
      });
      out.push(rec);
    }
    return out;
  }

  return candidateList.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  );
}

function parseLooseNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : fallback;
  }
  const str = String(raw ?? '')
    .replace(/[$₡€£\s]/g, '')
    .replace(/USD|CRC|EUR/gi, '')
    .trim();
  if (!str) return fallback;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');
  let normalized = str;
  if (hasComma && hasDot) {
    normalized =
      str.lastIndexOf(',') > str.lastIndexOf('.')
        ? str.replace(/\./g, '').replace(',', '.')
        : str.replace(/,/g, '');
  } else if (hasComma) {
    const parts = str.split(',');
    normalized =
      parts.length === 2 && parts[1].length <= 2
        ? str.replace(',', '.')
        : str.replace(/,/g, '');
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}

function parseIsoDateString(raw: unknown, fallback: string): string {
  if (!raw) return fallback;
  const str = String(raw).trim();
  if (!str) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year =
      dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }
  return fallback;
}

function parseProformaTypeValue(raw: unknown): ProformaType {
  const norm = normalizeRowKey(String(raw ?? ''));
  if (norm.includes('puerta')) return 'puertas';
  if (norm.includes('grif') || norm.includes('sanit')) return 'griferia';
  if (norm.includes('cielo') || norm.includes('piso')) return 'cielos_pisos';
  return 'mobiliario';
}

function hydrateProformaFromPartial(
  partial: Partial<ProformaData>,
  fallbackConsecutivo: number,
  forceDraft = false
): ProformaData {
  const isDraftDoc = Boolean(
    forceDraft ||
      partial.isDraft ||
      (!(typeof partial.consecutivo === 'number' && partial.consecutivo > 0) &&
        fallbackConsecutivo <= 0)
  );
  const consecutivo = isDraftDoc
    ? 0
    : typeof partial.consecutivo === 'number' && partial.consecutivo > 0
      ? partial.consecutivo
      : fallbackConsecutivo;
  const base = createInitialProforma(consecutivo, true);

  const mergedCp = {
    ...base.clientProject,
    ...(partial.clientProject ?? {}),
  };

  if (!mergedCp.telefono && !mergedCp.correo && mergedCp.telefonoCorreo) {
    const legacy = mergedCp.telefonoCorreo.trim();
    const parts = legacy.split('/').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      mergedCp.correo = parts.find((p) => p.includes('@')) ?? '';
      mergedCp.telefono = parts.find((p) => !p.includes('@')) ?? '';
    } else if (legacy.includes('@')) {
      mergedCp.correo = legacy;
    } else {
      mergedCp.telefono = legacy;
    }
  }

  const items: ProductLineItem[] =
    Array.isArray(partial.items) && partial.items.length > 0
      ? partial.items.map((it, idx) => ({
          id: it.id || `item-sheet-${isDraftDoc ? 'draft' : consecutivo}-${idx}`,
          producto: String(it.producto ?? ''),
          descripcion: String(it.descripcion ?? ''),
          cantidad:
            typeof it.cantidad === 'number' && Number.isFinite(it.cantidad)
              ? it.cantidad
              : 1,
          unidad: String(it.unidad ?? 'und(s)'),
          valor:
            typeof it.valor === 'number' && Number.isFinite(it.valor)
              ? it.valor
              : 0,
          valorUnitario:
            typeof it.valorUnitario === 'number' &&
            Number.isFinite(it.valorUnitario)
              ? it.valorUnitario
              : undefined,
          imagen: typeof it.imagen === 'string' ? it.imagen : undefined,
        }))
      : base.items;

  return {
    ...base,
    ...partial,
    id:
      typeof partial.id === 'string' && partial.id.trim()
        ? partial.id
        : isDraftDoc
          ? `sheet-draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          : `sheet-prof-${consecutivo}`,
    consecutivo,
    isDraft: isDraftDoc,
    proformaType: partial.proformaType ?? base.proformaType,
    tableColumnWidthsByType:
      partial.tableColumnWidthsByType &&
      typeof partial.tableColumnWidthsByType === 'object' &&
      !Array.isArray(partial.tableColumnWidthsByType)
        ? partial.tableColumnWidthsByType
        : base.tableColumnWidthsByType,
    company: normalizeCompanyDefaults({
      ...base.company,
      ...(partial.company ?? {}),
    }),
    clientProject: mergedCp,
    items,
    visualReferences: Array.isArray(partial.visualReferences)
      ? partial.visualReferences
          .filter((r) => r && typeof r.imageDataUrl === 'string')
          .map((r, idx) => ({
            id: r.id || `vref-sheet-${consecutivo}-${idx}`,
            slotIndex: typeof r.slotIndex === 'number' ? r.slotIndex : idx,
            imageDataUrl: String(r.imageDataUrl ?? ''),
            name: typeof r.name === 'string' ? r.name : undefined,
            caption: String(r.caption ?? ''),
            size:
              r.size === 'small' || r.size === 'medium' || r.size === 'large'
                ? r.size
                : undefined,
            rotation:
              r.rotation === 0 ||
              r.rotation === 90 ||
              r.rotation === 180 ||
              r.rotation === 270
                ? r.rotation
                : undefined,
            customWidthPct:
              typeof r.customWidthPct === 'number' &&
              Number.isFinite(r.customWidthPct)
                ? r.customWidthPct
                : undefined,
            customHeightPx:
              typeof r.customHeightPx === 'number' &&
              Number.isFinite(r.customHeightPx)
                ? r.customHeightPx
                : undefined,
            fitMode:
              r.fitMode === 'contain' || r.fitMode === 'cover'
                ? r.fitMode
                : undefined,
            cropZoom:
              typeof r.cropZoom === 'number' && Number.isFinite(r.cropZoom)
                ? r.cropZoom
                : undefined,
            cropX:
              typeof r.cropX === 'number' && Number.isFinite(r.cropX)
                ? r.cropX
                : undefined,
            cropY:
              typeof r.cropY === 'number' && Number.isFinite(r.cropY)
                ? r.cropY
                : undefined,
          }))
      : [],
    taxRate:
      typeof partial.taxRate === 'number' && Number.isFinite(partial.taxRate)
        ? partial.taxRate
        : base.taxRate,
    terminosCondiciones:
      typeof partial.terminosCondiciones === 'string'
        ? partial.terminosCondiciones
        : base.terminosCondiciones,
    specBlocks:
      Array.isArray(partial.specBlocks) && partial.specBlocks.length > 0
        ? partial.specBlocks
        : base.specBlocks,
    bankAccount: {
      ...base.bankAccount,
      ...(partial.bankAccount ?? {}),
    },
    paymentSchedule:
      Array.isArray(partial.paymentSchedule) &&
      partial.paymentSchedule.length > 0
        ? partial.paymentSchedule
        : base.paymentSchedule,
    signatures: {
      ...base.signatures,
      ...(partial.signatures ?? {}),
    },
    notasFinales:
      typeof partial.notasFinales === 'string'
        ? partial.notasFinales
        : base.notasFinales,
    updatedAt:
      typeof partial.updatedAt === 'string' && partial.updatedAt
        ? partial.updatedAt
        : new Date().toISOString(),
  };
}

/**
 * Lee y valida un objeto o cadena JSON (Datos_JSON de Google Sheets o borrador .json exportado)
 * reconstruyendo una ProformaData completa y editable.
 */
export function parseProformaFromJsonInput(
  raw: unknown,
  fallbackConsecutivo = 2800
): ProformaData | null {
  if (!raw) return null;
  try {
    let candidate: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof candidate === 'string') {
      candidate = JSON.parse(candidate);
    }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }

    const recordObj = candidate as Record<string, unknown>;
    const partial =
      recordObj.proforma &&
      typeof recordObj.proforma === 'object' &&
      !Array.isArray(recordObj.proforma)
        ? (recordObj.proforma as Partial<ProformaData>)
        : (recordObj as Partial<ProformaData>);

    const looksLikeProforma =
      typeof partial.consecutivo === 'number' ||
      Boolean(partial.clientProject && typeof partial.clientProject === 'object') ||
      Array.isArray(partial.items) ||
      Boolean(partial.proformaType) ||
      Boolean(partial.company && typeof partial.company === 'object');

    if (!looksLikeProforma) {
      return null;
    }

    const partialIsDraft = Boolean(
      partial.isDraft ||
        (typeof partial.consecutivo === 'number' && partial.consecutivo <= 0) ||
        fallbackConsecutivo <= 0
    );
    const consecutivo = partialIsDraft
      ? 0
      : typeof partial.consecutivo === 'number' && partial.consecutivo > 0
        ? partial.consecutivo
        : fallbackConsecutivo;

    return hydrateProformaFromPartial(partial, consecutivo, partialIsDraft);
  } catch {
    return null;
  }
}

function rowToSavedProformaRecord(
  row: Record<string, unknown>,
  rowIndex: number
): SavedProformaRecord | null {
  const lookup = buildNormalizedRowLookup(row);

  const rawConsecutivo = pickRowValue(lookup, [
    'Consecutivo',
    'Numero',
    'No',
    'Proforma',
    'Num',
  ]);
  const rawConsecutivoStr = String(rawConsecutivo ?? '').trim().toLowerCase();
  const isDraftCell = rawConsecutivoStr === 'borrador' || rawConsecutivoStr.includes('borrador');
  const consecutivoNum = isDraftCell ? 0 : Math.floor(parseLooseNumber(rawConsecutivo, 0));

  const rawDatosJson = pickRowValue(lookup, [
    'Datos_JSON',
    'DatosJSON',
    'Datos Json',
    'Data_JSON',
    'Proforma_JSON',
    'JSON',
    'Payload',
  ]);

  let parsedJsonObj: Partial<ProformaData> | null = null;
  let normalizedRawDatosJson: string | undefined;
  if (rawDatosJson) {
    try {
      let candidate: unknown =
        typeof rawDatosJson === 'string'
          ? JSON.parse(rawDatosJson)
          : rawDatosJson;
      if (typeof candidate === 'string') {
        candidate = JSON.parse(candidate);
      }
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const recordObj = candidate as Record<string, unknown>;
        if (recordObj.proforma && typeof recordObj.proforma === 'object') {
          parsedJsonObj = recordObj.proforma as Partial<ProformaData>;
        } else {
          parsedJsonObj = recordObj as Partial<ProformaData>;
        }
        normalizedRawDatosJson =
          typeof rawDatosJson === 'string'
            ? rawDatosJson
            : JSON.stringify(rawDatosJson);
      }
    } catch {
      parsedJsonObj = null;
    }
  }

  const effectiveIsDraft = Boolean(
    isDraftCell ||
      parsedJsonObj?.isDraft ||
      (consecutivoNum <= 0 && (!parsedJsonObj?.consecutivo || parsedJsonObj.consecutivo <= 0))
  );

  const effectiveConsecutivo = effectiveIsDraft
    ? 0
    : (parsedJsonObj?.consecutivo && parsedJsonObj.consecutivo > 0
        ? parsedJsonObj.consecutivo
        : consecutivoNum) || 0;

  const clienteCol = String(
    pickRowValue(lookup, ['Cliente', 'Nombre Cliente', 'Empresa']) ?? ''
  ).trim();

  if (!parsedJsonObj && !effectiveIsDraft && effectiveConsecutivo <= 0 && !clienteCol) {
    return null;
  }

  const safeConsecutivo = effectiveIsDraft ? 0 : effectiveConsecutivo;

  if (parsedJsonObj) {
    const hydrated = hydrateProformaFromPartial(
      {
        ...parsedJsonObj,
        id:
          parsedJsonObj.id ||
          (effectiveIsDraft
            ? `sheet-draft-${rowIndex}-${normalizeRowKey(clienteCol || 'sin') || rowIndex}`
            : undefined),
      },
      safeConsecutivo,
      effectiveIsDraft
    );
    if (!hydrated.clientProject.cliente && clienteCol) {
      hydrated.clientProject.cliente = clienteCol;
    }
    const proyectoCol = String(
      pickRowValue(lookup, ['Proyecto', 'Obra']) ?? ''
    ).trim();
    if (!hydrated.clientProject.proyecto && proyectoCol) {
      hydrated.clientProject.proyecto = proyectoCol;
    }
    const totals = computeProformaTotals(hydrated);
    const colTotal = parseLooseNumber(
      pickRowValue(lookup, ['Total', 'Monto Total']),
      totals.total
    );
    const fechaReg = pickRowValue(lookup, [
      'Fecha Registro',
      'SavedAt',
      'UpdatedAt',
      'Fecha',
    ]);
    const savedAt =
      fechaReg && !Number.isNaN(new Date(String(fechaReg)).getTime())
        ? new Date(String(fechaReg)).toISOString()
        : hydrated.updatedAt;

    return {
      id: hydrated.id,
      consecutivo: hydrated.consecutivo,
      isDraft: Boolean(hydrated.isDraft || hydrated.consecutivo <= 0),
      savedAt,
      data: hydrated,
      total: totals.total > 0 ? totals.total : colTotal,
      source: 'sheet',
      rawDatosJson: normalizedRawDatosJson,
    };
  }

  // Reconstrucción limpia a partir de columnas resumidas cuando Datos_JSON no existe
  const base = createInitialProforma(safeConsecutivo, true);
  const fechaProforma = parseIsoDateString(
    pickRowValue(lookup, ['Fecha Proforma', 'Fecha']),
    base.clientProject.fecha
  );
  const contacto = String(
    pickRowValue(lookup, ['Contacto', 'Atencion']) ?? ''
  ).trim();
  let telefono = String(
    pickRowValue(lookup, ['Telefono', 'Teléfono', 'Tel', 'Celular']) ?? ''
  ).trim();
  let correo = String(
    pickRowValue(lookup, ['Correo', 'Correo electronico', 'Email']) ?? ''
  ).trim();
  const combinedContact = String(
    pickRowValue(lookup, ['Telefono / Correo', 'TelefonoCorreo']) ?? ''
  ).trim();
  if (combinedContact && !telefono && !correo) {
    const parts = combinedContact.split('/').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      correo = parts.find((p) => p.includes('@')) ?? '';
      telefono = parts.find((p) => !p.includes('@')) ?? '';
    } else if (combinedContact.includes('@')) {
      correo = combinedContact;
    } else {
      telefono = combinedContact;
    }
  }

  const ubicacion = String(
    pickRowValue(lookup, ['Ubicacion', 'Ubicación', 'Direccion']) ?? ''
  ).trim();
  const proyecto = String(
    pickRowValue(lookup, ['Proyecto', 'Obra']) ?? ''
  ).trim();
  const validez = String(
    pickRowValue(lookup, ['Validez']) ?? base.clientProject.validez
  ).trim();
  const moneda = String(
    pickRowValue(lookup, ['Moneda']) ?? base.clientProject.moneda
  ).trim();
  const tipoRaw = pickRowValue(lookup, ['Tipo Proforma', 'Tipo']);
  const taxRate = parseLooseNumber(
    pickRowValue(lookup, ['Impuesto (%)', 'Impuesto', 'IVA (%)']),
    base.taxRate
  );
  const subtotal = parseLooseNumber(
    pickRowValue(lookup, ['Subtotal', 'Valor Producto']),
    0
  );
  const totalCol = parseLooseNumber(
    pickRowValue(lookup, ['Total', 'Monto Total']),
    0
  );

  let items: ProductLineItem[] = base.items;
  const rawItemsJson = pickRowValue(lookup, [
    'Lineas de Producto (JSON)',
    'Items_JSON',
    'Items',
    'Productos',
  ]);
  if (rawItemsJson) {
    try {
      const parsedItems =
        typeof rawItemsJson === 'string'
          ? JSON.parse(rawItemsJson)
          : rawItemsJson;
      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        items = parsedItems as ProductLineItem[];
      }
    } catch {
      // mantener reconstrucción por monto
    }
  }

  if (
    items.length === 1 &&
    !items[0].producto.trim() &&
    items[0].valor === 0 &&
    (subtotal > 0 || totalCol > 0)
  ) {
    const computedSubtotal =
      subtotal > 0
        ? subtotal
        : Number((totalCol / (1 + Math.max(0, taxRate) / 100)).toFixed(2));
    items = [
      {
        id: `item-sheet-summary-${effectiveIsDraft ? `draft-${rowIndex}` : safeConsecutivo}`,
        producto:
          proyecto ||
          (effectiveIsDraft
            ? 'Cotización Borrador'
            : `Cotización Nº ${safeConsecutivo}`),
        descripcion: 'Resumen cargado desde la pestaña PROFORMAS en Google Sheets.',
        cantidad: 1,
        unidad: String(pickRowValue(lookup, ['Unidades']) ?? 'und(s)').trim() || 'und(s)',
        valor: computedSubtotal,
        valorUnitario: computedSubtotal,
      },
    ];
  }

  const reconstructed = hydrateProformaFromPartial(
    {
      id: effectiveIsDraft
        ? `sheet-draft-${rowIndex}-${normalizeRowKey(clienteCol || proyecto || 'sin') || rowIndex}`
        : `sheet-prof-${safeConsecutivo}`,
      consecutivo: safeConsecutivo,
      isDraft: effectiveIsDraft,
      proformaType: tipoRaw ? parseProformaTypeValue(tipoRaw) : 'mobiliario',
      clientProject: {
        cliente: clienteCol,
        contacto,
        telefono,
        correo,
        ubicacion,
        proyecto,
        fecha: fechaProforma,
        validez: validez || '15 Días',
        moneda: moneda || 'USD ($)',
      },
      items,
      taxRate,
      updatedAt: new Date().toISOString(),
    },
    safeConsecutivo,
    effectiveIsDraft
  );

  const computedTotals = computeProformaTotals(reconstructed);
  const fechaReg = pickRowValue(lookup, ['Fecha Registro', 'SavedAt']);
  const savedAt =
    fechaReg && !Number.isNaN(new Date(String(fechaReg)).getTime())
      ? new Date(String(fechaReg)).toISOString()
      : reconstructed.updatedAt;

  return {
    id: reconstructed.id,
    consecutivo: reconstructed.consecutivo,
    isDraft: effectiveIsDraft,
    savedAt,
    data: reconstructed,
    total: computedTotals.total > 0 ? computedTotals.total : totalCol,
    source: 'sheet',
  };
}

export async function fetchRemoteProformasFromAppsScript(
  config: CloudSyncConfig
): Promise<SavedProformaRecord[]> {
  const validated = validateHttpUrl(config.webhookUrl);
  if (typeof validated === 'string') {
    throw new Error(
      'Configura primero la URL de Google Apps Script (/exec) en la pestaña Integración.'
    );
  }

  const getUrl = new URL(validated.toString());
  if (!getUrl.searchParams.has('sheet')) {
    getUrl.searchParams.set('sheet', 'PROFORMAS');
  }
  if (!getUrl.searchParams.has('spreadsheet')) {
    getUrl.searchParams.set('spreadsheet', 'Registro_Proformas_OLMO');
  }
  if (!getUrl.searchParams.has('action')) {
    getUrl.searchParams.set('action', 'list');
  }
  if (config.secretToken.trim() && !getUrl.searchParams.has('token')) {
    getUrl.searchParams.set('token', config.secretToken.trim());
  }

  let response: Response;
  try {
    response = await fetch(getUrl.toString(), {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow',
    });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `No se pudo consultar la pestaña PROFORMAS (${err.message}). Asegúrate de que tu Google Apps Script tenga implementada la función doGet(e) con acceso "Cualquier usuario".`
        : 'No se pudo conectar con Google Apps Script para leer el historial.'
    );
  }

  if (!response.ok) {
    throw new Error(
      `El Apps Script respondió con estado HTTP ${response.status} al leer la pestaña PROFORMAS.`
    );
  }

  const text = await response.text();
  const trimmedLower = text.trim().toLowerCase();
  if (
    trimmedLower.startsWith('<!doctype html') ||
    trimmedLower.startsWith('<html')
  ) {
    throw new Error(
      'El Apps Script devolvió una página HTML en lugar de JSON. Verifica que la función doGet(e) devuelva ContentService JSON y esté publicada con acceso "Cualquier usuario".'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'La respuesta del Google Apps Script no es un JSON válido.'
    );
  }

  const rows = extractRowsArrayFromGetResponse(parsed);
  const mapped: SavedProformaRecord[] = [];

  rows.forEach((row, idx) => {
    const rec = rowToSavedProformaRecord(row, idx);
    if (!rec) return;
    const isRecDraft = rec.isDraft || rec.consecutivo <= 0;
    const matchingIndexes: number[] = [];
    mapped.forEach((m, mIdx) => {
      const sameId = Boolean(rec.id && m.id === rec.id);
      const sameConsecutivo =
        !isRecDraft && !m.isDraft && m.consecutivo === rec.consecutivo;
      if (sameId || sameConsecutivo) {
        matchingIndexes.push(mIdx);
      }
    });

    if (matchingIndexes.length > 0) {
      let winner = rec;
      matchingIndexes.forEach((mIdx) => {
        const existing = mapped[mIdx];
        const existingIsDraft = existing.isDraft || existing.consecutivo <= 0;
        const winnerIsDraft = winner.isDraft || winner.consecutivo <= 0;
        if (!existingIsDraft && winnerIsDraft) {
          winner = existing;
        } else if (existingIsDraft === winnerIsDraft) {
          const existingTime = String(existing.savedAt ?? '');
          const winnerTime = String(winner.savedAt ?? '');
          if (existingTime > winnerTime) {
            winner = existing;
          }
        }
      });
      mapped[matchingIndexes[0]] = winner;
      for (let d = matchingIndexes.length - 1; d >= 1; d--) {
        mapped.splice(matchingIndexes[d], 1);
      }
      return;
    }

    mapped.push(rec);
  });

  mapped.sort((a, b) => {
    if (b.consecutivo !== a.consecutivo) return b.consecutivo - a.consecutivo;
    return String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? ''));
  });
  return mapped;
}

export async function fetchClientsFromAppsScript(
  appsScriptUrl: string,
  sheetName = 'CLIENTES'
): Promise<ClientImportRow[]> {
  const validated = validateHttpUrl(appsScriptUrl);
  if (typeof validated === 'string') {
    throw new Error(validated);
  }

  const getUrl = new URL(validated.toString());
  getUrl.searchParams.set('sheet', sheetName.trim() || 'CLIENTES');
  getUrl.searchParams.set('action', 'clients');

  const response = await fetch(getUrl.toString(), {
    method: 'GET',
    mode: 'cors',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(
      `Google Apps Script respondió con HTTP ${response.status} al consultar CLIENTES.`
    );
  }

  const text = await response.text();
  const parsed = JSON.parse(text);
  const rows = extractRowsArrayFromGetResponse(parsed);
  const dedupedClients = new Map<string, ClientImportRow>();

  rows.forEach((row) => {
    const lookup = buildNormalizedRowLookup(row);
    const cliente = String(
      pickRowValue(lookup, [
        'Cliente',
        'Nombre Cliente',
        'Empresa',
        'Nombre',
      ]) ?? ''
    ).trim();
    if (!cliente) return;

    const key = cliente.toLowerCase();
    const prev = dedupedClients.get(key);
    dedupedClients.set(key, {
      cliente,
      contacto:
        String(
          pickRowValue(lookup, ['Contacto', 'Atencion']) ?? ''
        ).trim() ||
        prev?.contacto ||
        '',
      telefono:
        String(
          pickRowValue(lookup, ['Telefono', 'Teléfono', 'Tel', 'Celular']) ?? ''
        ).trim() ||
        prev?.telefono ||
        '',
      correo:
        String(
          pickRowValue(lookup, ['Correo', 'Correo electronico', 'Email']) ?? ''
        ).trim() ||
        prev?.correo ||
        '',
      ubicacion:
        String(
          pickRowValue(lookup, ['Ubicacion', 'Ubicación', 'Direccion']) ?? ''
        ).trim() ||
        prev?.ubicacion ||
        '',
    });
  });

  return Array.from(dedupedClients.values());
}

function extractCandidateArrayToObjects(
  candidateList: unknown
): Record<string, unknown>[] {
  if (!Array.isArray(candidateList) || candidateList.length === 0) return [];
  if (Array.isArray(candidateList[0])) {
    const matrix = candidateList as unknown[][];
    if (matrix.length < 2) return [];
    const headers = (matrix[0] ?? []).map((h) => String(h ?? '').trim());
    const out: Record<string, unknown>[] = [];
    for (let r = 1; r < matrix.length; r++) {
      const cells = matrix[r] ?? [];
      if (cells.every((c) => !String(c ?? '').trim())) continue;
      const rec: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        if (h) rec[h] = cells[idx];
      });
      out.push(rec);
    }
    return out;
  }
  return candidateList.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  );
}

function parseTerminosRows(rawTerminos: unknown): TerminoTemplate[] {
  const rows = extractCandidateArrayToObjects(rawTerminos);
  const terminos: TerminoTemplate[] = [];

  rows.forEach((row, idx) => {
    const lookup = buildNormalizedRowLookup(row);
    const tipoCotizacion = String(
      pickRowValue(lookup, [
        'tipoCotizacion',
        'tipo_cotizacion',
        'Tipo de Cotizacion',
        'Tipo de Cotización',
        'Tipo Cotizacion',
        'Tipo',
        'Categoria',
        'Categoría',
        'ProformaType',
      ]) ?? ''
    ).trim();
    const titulo = String(
      pickRowValue(lookup, [
        'titulo',
        'Título',
        'Nombre',
        'Title',
        'Concepto',
      ]) ?? ''
    ).trim();
    const contenido = String(
      pickRowValue(lookup, [
        'contenido',
        'Contenido',
        'Terminos',
        'Términos',
        'Terminos y Condiciones',
        'Términos y Condiciones',
        'Texto',
        'Descripcion',
        'Descripción',
        'Content',
      ]) ?? ''
    ).trim();

    if (!tipoCotizacion && !titulo && !contenido) return;

    const safeTitulo =
      titulo || tipoCotizacion || `Términos ${idx + 1}`;
    terminos.push({
      id: `term-${idx}-${normalizeRowKey(tipoCotizacion || safeTitulo).slice(0, 24) || idx}`,
      tipoCotizacion,
      titulo: safeTitulo,
      contenido,
    });
  });

  return terminos;
}

export function terminosMatchesProformaType(
  rawTipoCotizacion: string,
  targetType: ProformaType
): boolean {
  const norm = normalizeRowKey(rawTipoCotizacion);
  if (!norm) return false;
  if (targetType === 'mobiliario') {
    return (
      norm === 'mobiliario' ||
      norm.includes('mobiliario') ||
      norm.includes('mueble')
    );
  }
  if (targetType === 'puertas') {
    return norm === 'puertas' || norm.includes('puerta');
  }
  if (targetType === 'griferia') {
    return (
      norm === 'griferia' ||
      norm.includes('grif') ||
      norm.includes('sanit') ||
      norm.includes('losa')
    );
  }
  if (targetType === 'cielos_pisos') {
    return (
      norm === 'cielospisos' ||
      norm.includes('cielo') ||
      norm.includes('piso')
    );
  }
  return false;
}

export function findBestTerminoForProformaType(
  terminos: TerminoTemplate[],
  targetType: ProformaType
): TerminoTemplate | undefined {
  if (!terminos.length) return undefined;
  const exact = terminos.find((t) =>
    terminosMatchesProformaType(t.tipoCotizacion, targetType)
  );
  if (exact) return exact;
  return terminos.find((t) => {
    const norm = normalizeRowKey(t.tipoCotizacion);
    return !norm || norm === 'general' || norm === 'todos';
  });
}

function extractSpreadsheetUrlFromGetResponse(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const candidates = [
    obj.spreadsheetUrl,
    obj.sheetUrl,
    obj.spreadsheet_url,
    obj.url,
  ];
  for (const cand of candidates) {
    if (
      typeof cand === 'string' &&
      cand.trim().startsWith('https://docs.google.com/spreadsheets/')
    ) {
      return cand.trim();
    }
  }
  return undefined;
}

export interface SpecsAndTerminosSyncResult {
  specs: AranSpecTemplate[];
  terminos: TerminoTemplate[];
  spreadsheetUrl?: string;
}

export async function fetchEspecificacionesYTerminosFromAppsScript(
  specsScriptUrl: string,
  secretToken?: string
): Promise<SpecsAndTerminosSyncResult> {
  const validated = validateHttpUrl(specsScriptUrl);
  if (typeof validated === 'string') {
    throw new Error(
      'Configura primero una URL válida de Google Apps Script (/exec) para la hoja "ESPECIFICACIONES" en Integración.'
    );
  }

  const getUrl = new URL(validated.toString());
  if (!getUrl.searchParams.has('sheet')) {
    getUrl.searchParams.set('sheet', 'ESPECIFICACIONES');
  }
  if (secretToken?.trim() && !getUrl.searchParams.has('token')) {
    getUrl.searchParams.set('token', secretToken.trim());
  }

  let response: Response;
  try {
    response = await fetch(getUrl.toString(), {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow',
    });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `No se pudo consultar la hoja "ESPECIFICACIONES" (${err.message}). Verifica que el script esté publicado con acceso "Cualquier usuario".`
        : 'No se pudo conectar con Google Apps Script para leer la hoja "ESPECIFICACIONES".'
    );
  }

  if (!response.ok) {
    throw new Error(
      `El Apps Script de "ESPECIFICACIONES" respondió con estado HTTP ${response.status}.`
    );
  }

  const text = await response.text();
  const trimmedLower = text.trim().toLowerCase();
  if (
    trimmedLower.startsWith('<!doctype html') ||
    trimmedLower.startsWith('<html')
  ) {
    throw new Error(
      'El script de "ESPECIFICACIONES" devolvió una página HTML en lugar de JSON. Verifica que doGet(e) devuelva ContentService JSON con acceso "Cualquier usuario".'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'La respuesta del Google Apps Script de "ESPECIFICACIONES" no es un JSON válido.'
    );
  }

  const rows = extractRowsArrayFromGetResponse(parsed);
  const templates: AranSpecTemplate[] = [];

  rows.forEach((row, idx) => {
    const lookup = buildNormalizedRowLookup(row);
    const titulo = String(
      pickRowValue(lookup, [
        'Titulo',
        'Título',
        'Titulo del bloque',
        'Título del bloque',
        'Nombre',
        'Bloque',
        'Seccion',
        'Sección',
        'Title',
        'Concepto',
      ]) ?? ''
    ).trim();
    const subtitulo = String(
      pickRowValue(lookup, [
        'Subtitulo',
        'Subtítulo',
        'Sub titulo',
        'Sub título',
        'Subtitle',
        'Sub',
        'Detalle corto',
        'Resumen',
      ]) ?? ''
    ).trim();
    const contenido = String(
      pickRowValue(lookup, [
        'Especificaciones y acabados',
        'Especificaciones',
        'Acabados',
        'Contenido',
        'Descripcion',
        'Descripción',
        'Detalle',
        'Detalles',
        'Texto',
        'Specs',
        'Content',
        'Especificacion',
      ]) ?? ''
    ).trim();

    if (!titulo && !subtitulo && !contenido) {
      return;
    }

    const safeTitulo = titulo || subtitulo || `Especificación ${idx + 1}`;
    templates.push({
      id: `spec-sheet-${idx}-${normalizeRowKey(safeTitulo).slice(0, 24) || idx}`,
      titulo: safeTitulo,
      subtitulo,
      contenido,
    });
  });

  let terminos: TerminoTemplate[] = [];
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const rawTerminos =
      obj.terminos ??
      obj.terminosCondiciones ??
      obj.terms ??
      obj.TERMINOS_Y_CONDICIONES;
    if (rawTerminos !== undefined) {
      terminos = parseTerminosRows(rawTerminos);
    } else {
      // Respaldo opcional si el script requiere ?sheet=TERMINOS_Y_CONDICIONES por separado
      try {
        const termsUrl = new URL(validated.toString());
        termsUrl.searchParams.set('sheet', 'TERMINOS_Y_CONDICIONES');
        if (secretToken?.trim()) {
          termsUrl.searchParams.set('token', secretToken.trim());
        }
        const termsRes = await fetch(termsUrl.toString(), {
          method: 'GET',
          mode: 'cors',
          redirect: 'follow',
        });
        if (termsRes.ok) {
          const termsText = await termsRes.text();
          const termsJson = JSON.parse(termsText);
          const termsRows = extractRowsArrayFromGetResponse(termsJson);
          terminos = parseTerminosRows(termsRows);
        }
      } catch {
        // Silencioso si el endpoint no soporta consulta separada
      }
    }
  }

  return {
    specs: templates,
    terminos,
    spreadsheetUrl: extractSpreadsheetUrlFromGetResponse(parsed),
  };
}

export async function fetchAranSpecTemplatesFromAppsScript(
  aranScriptUrl: string,
  secretToken?: string
): Promise<AranSpecTemplate[]> {
  const result = await fetchEspecificacionesYTerminosFromAppsScript(
    aranScriptUrl,
    secretToken
  );
  return result.specs;
}
