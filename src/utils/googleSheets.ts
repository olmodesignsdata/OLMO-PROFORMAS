import * as XLSX from 'xlsx';
import { ProductLineItem } from '../types/proforma';

export const DEFAULT_IMPORT_SHEET_NAME = 'EXPORTACION';
export const DEFAULT_CLIENTS_SHEET_NAME = 'CLIENTES';

export interface GoogleSheetsImportResult {
  items: ProductLineItem[];
  ignoredCount: number;
  sheetNameUsed?: string;
}

export interface ClientImportRow {
  cliente: string;
  contacto: string;
  telefono: string;
  correo: string;
  ubicacion: string;
}

export interface ClientsImportResult {
  clients: ClientImportRow[];
  ignoredCount: number;
  sheetNameUsed?: string;
}

export class SpreadsheetSheetNotFoundError extends Error {
  requestedSheet: string;
  availableSheets: string[];
  sourceLabel: string;
  workbook: XLSX.WorkBook;

  constructor(
    requestedSheet: string,
    availableSheets: string[],
    sourceLabel: string,
    workbook: XLSX.WorkBook
  ) {
    const list =
      availableSheets.length > 0 ? availableSheets.join(', ') : 'ninguna';
    super(
      `No se encontró la hoja "${requestedSheet}" en ${sourceLabel}. Hojas disponibles: ${list}.`
    );
    this.name = 'SpreadsheetSheetNotFoundError';
    this.requestedSheet = requestedSheet;
    this.availableSheets = availableSheets;
    this.sourceLabel = sourceLabel;
    this.workbook = workbook;
  }
}

export function normalizeSheetName(name: string): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const CONTROL_ROW_PATTERN =
  /^(total|subtotal|sub\s*-?\s*total|iva|impuesto|resumen)(\b|[\s:(\-%.\/]|$)/i;

/**
 * Detecta filas de totales o control visual (TOTAL, SUBTOTAL, IVA, IMPUESTO, RESUMEN)
 * sin importar mayúsculas, minúsculas o tildes.
 */
export function isControlSummaryRow(producto: string): boolean {
  const normalized = producto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!normalized) return true;
  return CONTROL_ROW_PATTERN.test(normalized);
}

interface ParsedGoogleUrlInfo {
  kind: 'sheet' | 'published_csv' | 'published_html' | 'direct_csv';
  xlsxUrl?: string;
  csvUrls: string[];
}

function classifyGoogleSheetUrl(
  rawUrl: string,
  targetSheetName: string
): ParsedGoogleUrlInfo {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Pega el enlace de tu Google Sheet antes de importar.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      'El enlace ingresado no es una URL válida. Debe comenzar con https://'
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('El enlace debe comenzar con https://');
  }

  const href = parsed.href;

  let gid = parsed.searchParams.get('gid') || '';
  if (!gid && parsed.hash) {
    const hashMatch = parsed.hash.match(/gid=(\d+)/);
    if (hashMatch) gid = hashMatch[1];
  }

  // Caso 1: Enlace publicado (/spreadsheets/d/e/<PUB_ID>/pub...)
  const pubMatch = href.match(
    /https?:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/
  );
  if (pubMatch) {
    const pubId = pubMatch[1];
    const baseCsv = `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv`;
    const csvUrl = gid ? `${baseCsv}&single=true&gid=${gid}` : baseCsv;
    const isExplicitCsv =
      parsed.searchParams.get('output')?.toLowerCase() === 'csv';

    if (isExplicitCsv) {
      return {
        kind: 'published_csv',
        csvUrls: [csvUrl],
      };
    }

    return {
      kind: 'published_html',
      xlsxUrl: `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=xlsx`,
      csvUrls: [csvUrl],
    };
  }

  // Caso 2: Enlace normal de Google Sheets (/spreadsheets/d/<SHEET_ID>/...)
  const sheetMatch = href.match(
    /https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  );
  if (sheetMatch) {
    const sheetId = sheetMatch[1];
    const gidParam = gid ? `&gid=${gid}` : '';
    const sheetParam = targetSheetName
      ? `&sheet=${encodeURIComponent(targetSheetName)}`
      : '';

    return {
      kind: 'sheet',
      xlsxUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`,
      csvUrls: [
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv${sheetParam}${gidParam}`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`,
      ],
    };
  }

  // Caso 3: URL CSV directa o ya preparada
  return {
    kind: 'direct_csv',
    csvUrls: [href],
  };
}

/**
 * Convierte un enlace normal de Google Sheets o un enlace publicado como CSV
 * en una o más URLs candidatas para descarga CSV en el navegador.
 */
export function resolveGoogleSheetCsvUrls(
  rawUrl: string,
  targetSheetName = DEFAULT_IMPORT_SHEET_NAME
): string[] {
  return classifyGoogleSheetUrl(rawUrl, targetSheetName).csvUrls;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function detectDelimiter(csvText: string): string {
  const firstLine = csvText.split(/\r?\n/)[0] || '';
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semicolons++;
    }
  }
  return semicolons > commas ? ';' : ',';
}

export function parseCsvMatrix(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Parsea estrictamente un valor numérico desde número nativo de Excel o texto formateado.
 * Devuelve null si está vacío o no es un número válido.
 */
function parseStrictNumericValue(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  const cleaned = String(raw ?? '')
    .replace(/[$₡€£\s]/g, '')
    .replace(/USD|CRC|EUR/gi, '')
    .trim();

  if (!cleaned) return null;

  if (!/^-?[\d.,]+$/.test(cleaned)) {
    return null;
  }

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = cleaned.replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Procesa una matriz tabular (proveniente de Google Sheets CSV, archivo CSV o XLSX)
 * leyendo Producto, Descripcion, Cantidad, Unidad y Valor, e ignorando filas vacías,
 * con Valor 0 / no numérico o filas de control/totales.
 */
export function parseProductMatrix(
  matrix: unknown[][],
  sheetNameUsed?: string
): GoogleSheetsImportResult {
  if (matrix.length < 2) {
    throw new Error(
      'La hoja o archivo no contiene filas de datos debajo del encabezado.'
    );
  }

  let headerRowIdx = -1;
  let colMap = {
    producto: -1,
    descripcion: -1,
    cantidad: -1,
    unidad: -1,
    valor: -1,
    valorUnitario: -1,
    imagen: -1,
  };

  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const normalizedCells = (matrix[r] ?? []).map(normalizeHeader);
    const prodIdx = normalizedCells.findIndex((h) =>
      [
        'producto',
        'product',
        'nombre',
        'item',
        'mueble',
        'espacio',
        'codigo',
        'codigoproducto',
      ].includes(h)
    );
    const valIdx = normalizedCells.findIndex((h) =>
      [
        'valor',
        'valorusd',
        'precio',
        'monto',
        'total',
        'value',
        'price',
      ].includes(h)
    );

    if (prodIdx !== -1 && valIdx !== -1) {
      headerRowIdx = r;
      colMap = {
        producto: prodIdx,
        descripcion: normalizedCells.findIndex((h) =>
          [
            'descripcion',
            'descripciondelproducto',
            'description',
            'detalle',
            'detalles',
            'acabado',
          ].includes(h)
        ),
        cantidad: normalizedCells.findIndex((h) =>
          ['cantidad', 'cantidadm2', 'cant', 'qty', 'quantity'].includes(h)
        ),
        unidad: normalizedCells.findIndex((h) =>
          ['unidad', 'unit', 'und', 'unidades'].includes(h)
        ),
        valor: valIdx,
        valorUnitario: normalizedCells.findIndex((h) =>
          ['valorunitario', 'preciounitario', 'unitario'].includes(h)
        ),
        imagen: normalizedCells.findIndex((h) =>
          ['imagen', 'image', 'foto', 'urlimagen'].includes(h)
        ),
      };
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'No se encontraron las columnas requeridas (Producto, Descripcion, Cantidad, Unidad, Valor) en el encabezado.'
    );
  }

  const items: ProductLineItem[] = [];
  let ignoredCount = 0;

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (row.every((c) => !String(c ?? '').trim())) continue;

    const producto = String(row[colMap.producto] ?? '').trim();
    const valorRaw = row[colMap.valor];
    const valorParsed = parseStrictNumericValue(valorRaw);

    if (
      !producto ||
      isControlSummaryRow(producto) ||
      valorParsed === null ||
      valorParsed <= 0
    ) {
      ignoredCount++;
      continue;
    }

    const descripcion =
      colMap.descripcion >= 0
        ? String(row[colMap.descripcion] ?? '').trim()
        : '';
    const cantidadRaw =
      colMap.cantidad >= 0 ? row[colMap.cantidad] : 1;
    const cantidadParsed = parseStrictNumericValue(cantidadRaw);
    const cantidad =
      cantidadParsed !== null && cantidadParsed > 0 ? cantidadParsed : 1;
    const unidad =
      (colMap.unidad >= 0
        ? String(row[colMap.unidad] ?? '').trim()
        : '') || 'und(s)';
    const unitRaw =
      colMap.valorUnitario >= 0 ? row[colMap.valorUnitario] : null;
    const unitParsed =
      unitRaw !== null ? parseStrictNumericValue(unitRaw) : null;
    const imagen =
      colMap.imagen >= 0 ? String(row[colMap.imagen] ?? '').trim() : '';

    items.push({
      id: `item-imp-${Date.now()}-${r}-${Math.random().toString(36).slice(2, 5)}`,
      producto,
      descripcion,
      cantidad,
      unidad,
      valor: valorParsed,
      valorUnitario:
        unitParsed !== null && unitParsed >= 0
          ? unitParsed
          : cantidad > 0
            ? Number((valorParsed / cantidad).toFixed(2))
            : 0,
      imagen: imagen || undefined,
    });
  }

  if (items.length === 0) {
    throw new Error(
      'No se encontraron filas válidas (todas tenían Producto vacío, palabra de total/resumen o Valor en 0 / no numérico).'
    );
  }

  return { items, ignoredCount, sheetNameUsed };
}

/**
 * Lee una pestaña específica de un libro XLSX/XLS buscando el nombre de forma flexible
 * (sin distinguir mayúsculas/minúsculas, tildes ni espacios extra).
 */
export function parseWorkbookSheetByName(
  workbook: XLSX.WorkBook,
  requestedSheetName: string,
  sourceLabel = 'el libro'
): GoogleSheetsImportResult {
  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) {
    throw new Error('El libro no contiene hojas visibles.');
  }

  const target =
    (requestedSheetName ?? '').trim() || DEFAULT_IMPORT_SHEET_NAME;
  const normalizedTarget = normalizeSheetName(target);

  const matchedSheetName = sheetNames.find(
    (name) => normalizeSheetName(name) === normalizedTarget
  );

  if (!matchedSheetName) {
    throw new SpreadsheetSheetNotFoundError(
      target,
      sheetNames,
      sourceLabel,
      workbook
    );
  }

  const sheet = workbook.Sheets[matchedSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });
  return parseProductMatrix(matrix, matchedSheetName);
}

function bufferLooksLikeHtml(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer.slice(0, 256));
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(view)
    .trim()
    .toLowerCase();
  return text.startsWith('<!doctype html') || text.startsWith('<html');
}

export async function fetchAndParseGoogleSheetProducts(
  sheetUrl: string,
  requestedSheetName = DEFAULT_IMPORT_SHEET_NAME
): Promise<GoogleSheetsImportResult> {
  const targetSheet =
    (requestedSheetName ?? '').trim() || DEFAULT_IMPORT_SHEET_NAME;
  const info = classifyGoogleSheetUrl(sheetUrl, targetSheet);

  // 1. Para hojas normales o publicadas como libro, intentar XLSX completo primero
  //    para identificar exactamente la pestaña por nombre (p. ej. "EXPORTACION") sin importar su orden.
  if (info.xlsxUrl) {
    try {
      const response = await fetch(info.xlsxUrl, {
        method: 'GET',
        mode: 'cors',
      });
      if (response.ok) {
        const contentType = (
          response.headers.get('content-type') || ''
        ).toLowerCase();
        const buffer = await response.arrayBuffer();
        if (
          buffer.byteLength > 0 &&
          !contentType.includes('text/html') &&
          !bufferLooksLikeHtml(buffer)
        ) {
          const workbook = XLSX.read(buffer, { type: 'array' });
          if ((workbook.SheetNames ?? []).length > 0) {
            return parseWorkbookSheetByName(
              workbook,
              targetSheet,
              'el enlace de Google Sheets'
            );
          }
        }
      }
    } catch (err) {
      if (err instanceof SpreadsheetSheetNotFoundError) {
        throw err;
      }
      // Si falla descarga XLSX (CORS / formato / publicación parcial), continuar con CSV directo
    }
  }

  // 2. Fallback / CSV publicado directo: leer CSV sin fallar por ausencia de nombres de pestañas
  let csvText = '';
  let lastError = '';

  for (const url of info.csvUrls) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const text = await response.text();
      const trimmedLower = text.trim().toLowerCase();
      if (
        trimmedLower.startsWith('<!doctype html') ||
        trimmedLower.startsWith('<html')
      ) {
        lastError =
          'Google Sheets devolvió una página HTML en lugar de datos tabulares. Verifica que el documento esté compartido públicamente o publicado como CSV.';
        continue;
      }
      csvText = text;
      break;
    } catch (err) {
      lastError =
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con Google Sheets.';
    }
  }

  if (!csvText) {
    throw new Error(
      lastError ||
        'No se pudo leer el Google Sheet. Asegúrate de que esté publicado como CSV o compartido como "Cualquier usuario con el enlace (Lector)".'
    );
  }

  const matrix = parseCsvMatrix(csvText);
  return parseProductMatrix(matrix);
}

export interface LoadedExcelWorkbook {
  fileName: string;
  workbook: XLSX.WorkBook;
  sheetNames: string[];
  defaultSheet: string;
}

export function isSpreadsheetExcelFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  );
}

export function isSpreadsheetCsvFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith('.csv') ||
    file.type === 'text/csv' ||
    file.type === 'application/csv'
  );
}

/**
 * Lee un archivo Excel (.xlsx / .xls), extrae la lista completa de nombres de hojas
 * y preselecciona prioritySheetName (por defecto "EXPORTACION", o "CLIENTES" en directorio)
 * si existe en el libro (sin importar mayúsculas/espacios).
 */
export async function readExcelWorkbookFile(
  file: File,
  fallbackPreferredSheet = DEFAULT_IMPORT_SHEET_NAME,
  prioritySheetName = DEFAULT_IMPORT_SHEET_NAME
): Promise<LoadedExcelWorkbook> {
  if (!isSpreadsheetExcelFile(file)) {
    throw new Error(
      'Formato no compatible para selección de hojas. Sube un archivo .xlsx o .xls.'
    );
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetNames = (workbook.SheetNames ?? []).filter((name) =>
    Boolean(String(name ?? '').trim())
  );

  if (sheetNames.length === 0) {
    throw new Error(`El archivo "${file.name}" no contiene hojas visibles.`);
  }

  const priorityMatch = prioritySheetName.trim()
    ? sheetNames.find(
        (name) =>
          normalizeSheetName(name) === normalizeSheetName(prioritySheetName)
      )
    : undefined;
  const preferredMatch = fallbackPreferredSheet.trim()
    ? sheetNames.find(
        (name) =>
          normalizeSheetName(name) === normalizeSheetName(fallbackPreferredSheet)
      )
    : undefined;

  const defaultSheet = priorityMatch || preferredMatch || sheetNames[0];

  return {
    fileName: file.name,
    workbook,
    sheetNames,
    defaultSheet,
  };
}

/**
 * Lee un archivo local .csv o .xlsx / .xls y extrae las filas de productos válidas.
 * En archivos Excel busca por defecto la hoja indicada (ej. "EXPORTACION").
 * En archivos CSV lee los datos directamente sin fallar.
 */
export async function parseUploadedSpreadsheetFile(
  file: File,
  requestedSheetName = DEFAULT_IMPORT_SHEET_NAME
): Promise<GoogleSheetsImportResult> {
  const isCsv = isSpreadsheetCsvFile(file);
  const isExcel = isSpreadsheetExcelFile(file);

  if (!isCsv && !isExcel) {
    throw new Error(
      'Formato de archivo no compatible. Sube un archivo .csv o .xlsx.'
    );
  }

  if (isCsv) {
    const text = await file.text();
    const matrix = parseCsvMatrix(text);
    return parseProductMatrix(matrix);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return parseWorkbookSheetByName(
    workbook,
    requestedSheetName,
    `el archivo "${file.name}"`
  );
}

/**
 * Procesa una matriz tabular de clientes leyendo Cliente, Contacto, Telefono, Correo y Ubicacion
 * (aceptando variantes comunes de encabezados) e ignorando filas vacías o sin nombre de cliente.
 */
export function parseClientsMatrix(
  matrix: unknown[][],
  sheetNameUsed?: string
): ClientsImportResult {
  if (matrix.length < 2) {
    throw new Error(
      'La hoja o archivo no contiene filas de clientes debajo del encabezado.'
    );
  }

  let headerRowIdx = -1;
  let colMap = {
    cliente: -1,
    contacto: -1,
    telefono: -1,
    correo: -1,
    ubicacion: -1,
  };

  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const normalizedCells = (matrix[r] ?? []).map(normalizeHeader);
    let clienteIdx = normalizedCells.findIndex((h) =>
      [
        'cliente',
        'nombrecliente',
        'clienteempresa',
        'empresa',
        'razonsocial',
        'client',
        'customer',
      ].includes(h)
    );
    if (clienteIdx === -1) {
      clienteIdx = normalizedCells.findIndex((h) =>
        ['nombre', 'nombrecompleto'].includes(h)
      );
    }

    if (clienteIdx !== -1) {
      headerRowIdx = r;
      colMap = {
        cliente: clienteIdx,
        contacto: normalizedCells.findIndex((h) =>
          [
            'contacto',
            'contact',
            'personadecontacto',
            'personacontacto',
            'atencion',
            'atenciona',
            'representante',
            'arquitecto',
            'encargado',
          ].includes(h)
        ),
        telefono: normalizedCells.findIndex((h) =>
          [
            'telefono',
            'telefonocontacto',
            'tel',
            'celular',
            'movil',
            'whatsapp',
            'phone',
            'telephone',
            'numero',
          ].includes(h)
        ),
        correo: normalizedCells.findIndex((h) =>
          [
            'correo',
            'correoelectronico',
            'correocontacto',
            'email',
            'mail',
            'emailcontacto',
            'correoel',
          ].includes(h)
        ),
        ubicacion: normalizedCells.findIndex((h) =>
          [
            'ubicacion',
            'direccion',
            'location',
            'address',
            'lugar',
            'ciudad',
            'provincia',
            'canton',
            'domicilio',
            'sector',
          ].includes(h)
        ),
      };
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'No se encontró la columna "Cliente" en el encabezado. Columnas esperadas: Cliente, Contacto, Telefono, Correo, Ubicacion.'
    );
  }

  const clients: ClientImportRow[] = [];
  let ignoredCount = 0;

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (row.every((c) => !String(c ?? '').trim())) continue;

    const cliente = String(row[colMap.cliente] ?? '').trim();
    if (!cliente) {
      ignoredCount++;
      continue;
    }

    const contacto =
      colMap.contacto >= 0 ? String(row[colMap.contacto] ?? '').trim() : '';
    const telefono =
      colMap.telefono >= 0 ? String(row[colMap.telefono] ?? '').trim() : '';
    const correo =
      colMap.correo >= 0 ? String(row[colMap.correo] ?? '').trim() : '';
    const ubicacion =
      colMap.ubicacion >= 0 ? String(row[colMap.ubicacion] ?? '').trim() : '';

    clients.push({
      cliente,
      contacto,
      telefono,
      correo,
      ubicacion,
    });
  }

  if (clients.length === 0) {
    throw new Error(
      'No se encontraron clientes válidos (todas las filas estaban vacías o sin nombre en la columna Cliente).'
    );
  }

  return { clients, ignoredCount, sheetNameUsed };
}

export function parseClientsWorkbookSheetByName(
  workbook: XLSX.WorkBook,
  requestedSheetName = DEFAULT_CLIENTS_SHEET_NAME,
  sourceLabel = 'el libro'
): ClientsImportResult {
  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) {
    throw new Error('El libro no contiene hojas visibles.');
  }

  const target =
    (requestedSheetName ?? '').trim() || DEFAULT_CLIENTS_SHEET_NAME;
  const normalizedTarget = normalizeSheetName(target);

  const matchedSheetName = sheetNames.find(
    (name) => normalizeSheetName(name) === normalizedTarget
  );

  if (!matchedSheetName) {
    if (
      sheetNames.length === 1 &&
      normalizedTarget === normalizeSheetName(DEFAULT_CLIENTS_SHEET_NAME)
    ) {
      const onlySheet = sheetNames[0];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(
        workbook.Sheets[onlySheet],
        { header: 1, raw: true, defval: '' }
      );
      return parseClientsMatrix(matrix, onlySheet);
    }
    throw new SpreadsheetSheetNotFoundError(
      target,
      sheetNames,
      sourceLabel,
      workbook
    );
  }

  const sheet = workbook.Sheets[matchedSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });
  return parseClientsMatrix(matrix, matchedSheetName);
}

export async function fetchAndParseGoogleSheetClients(
  sheetUrl: string,
  requestedSheetName = DEFAULT_CLIENTS_SHEET_NAME
): Promise<ClientsImportResult> {
  const targetSheet =
    (requestedSheetName ?? '').trim() || DEFAULT_CLIENTS_SHEET_NAME;
  const info = classifyGoogleSheetUrl(sheetUrl, targetSheet);

  if (info.xlsxUrl) {
    try {
      const response = await fetch(info.xlsxUrl, {
        method: 'GET',
        mode: 'cors',
      });
      if (response.ok) {
        const contentType = (
          response.headers.get('content-type') || ''
        ).toLowerCase();
        const buffer = await response.arrayBuffer();
        if (
          buffer.byteLength > 0 &&
          !contentType.includes('text/html') &&
          !bufferLooksLikeHtml(buffer)
        ) {
          const workbook = XLSX.read(buffer, { type: 'array' });
          if ((workbook.SheetNames ?? []).length > 0) {
            return parseClientsWorkbookSheetByName(
              workbook,
              targetSheet,
              'el enlace de Google Sheets'
            );
          }
        }
      }
    } catch (err) {
      if (err instanceof SpreadsheetSheetNotFoundError) {
        throw err;
      }
    }
  }

  let csvText = '';
  let lastError = '';

  for (const url of info.csvUrls) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const text = await response.text();
      const trimmedLower = text.trim().toLowerCase();
      if (
        trimmedLower.startsWith('<!doctype html') ||
        trimmedLower.startsWith('<html')
      ) {
        lastError =
          'Google Sheets devolvió una página HTML en lugar de datos tabulares. Verifica que el documento esté compartido públicamente o publicado como CSV.';
        continue;
      }
      csvText = text;
      break;
    } catch (err) {
      lastError =
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con Google Sheets.';
    }
  }

  if (!csvText) {
    throw new Error(
      lastError ||
        'No se pudo leer el Google Sheet. Asegúrate de que esté publicado como CSV o compartido como "Cualquier usuario con el enlace (Lector)".'
    );
  }

  const matrix = parseCsvMatrix(csvText);
  return parseClientsMatrix(matrix);
}

export async function parseUploadedClientsSpreadsheetFile(
  file: File,
  requestedSheetName = DEFAULT_CLIENTS_SHEET_NAME
): Promise<ClientsImportResult> {
  const isCsv = isSpreadsheetCsvFile(file);
  const isExcel = isSpreadsheetExcelFile(file);

  if (!isCsv && !isExcel) {
    throw new Error(
      'Formato de archivo no compatible. Sube un archivo .csv, .xlsx o .xls.'
    );
  }

  if (isCsv) {
    const text = await file.text();
    const matrix = parseCsvMatrix(text);
    return parseClientsMatrix(matrix);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return parseClientsWorkbookSheetByName(
    workbook,
    requestedSheetName,
    `el archivo "${file.name}"`
  );
}
