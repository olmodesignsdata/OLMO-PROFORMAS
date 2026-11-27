import {
  CompanyInfo,
  ComputedTotals,
  ProformaData,
  ProformaType,
  TableColumnWidths,
  VisualReferenceFitMode,
  VisualReferenceSize,
} from '../types/proforma';

export function getCurrencySymbol(moneda: string): string {
  if (moneda.includes('₡') || moneda.toUpperCase().includes('CRC')) return '₡';
  if (moneda.includes('€') || moneda.toUpperCase().includes('EUR')) return '€';
  return '$';
}

export function getCurrencyCode(moneda: string): string {
  if (moneda.toUpperCase().includes('CRC') || moneda.includes('₡')) return 'CRC';
  if (moneda.toUpperCase().includes('EUR') || moneda.includes('€')) return 'EUR';
  return 'USD';
}

export function formatMoney(amount: number, moneda: string): string {
  const symbol = getCurrencySymbol(moneda);
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `${symbol} ${formatted}`;
}

export function formatDateSpanish(isoDate: string): string {
  if (!isoDate) return '—';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  const months = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];
  const monthIdx = Number(m) - 1;
  const monthLabel = months[monthIdx] ?? m;
  return `${d} ${monthLabel} ${y}`;
}

export function computeProformaTotals(data: ProformaData): ComputedTotals {
  const subtotal = data.items.reduce((acc, item) => {
    const val = Number(item.valor);
    return acc + (Number.isFinite(val) ? val : 0);
  }, 0);

  const totalUnidades = data.items.reduce((acc, item) => {
    const qty = Number(item.cantidad);
    return acc + (Number.isFinite(qty) ? qty : 0);
  }, 0);

  const nonEmptyUnits = Array.from(
    new Set(
      data.items
        .map((i) => i.unidad.trim())
        .filter((u) => u.length > 0)
    )
  );
  const isCielosPisos = data.proformaType === 'cielos_pisos';
  const unitSuffix = isCielosPisos
    ? 'm²'
    : nonEmptyUnits.length === 1
      ? nonEmptyUnits[0]
      : 'und(s)';
  const roundedQty = Math.round(totalUnidades * 100) / 100;
  const unidadResumen = `${Number.isInteger(roundedQty) ? roundedQty : roundedQty.toFixed(2)} ${unitSuffix}`;

  const rate = Number.isFinite(Number(data.taxRate)) ? Number(data.taxRate) : 0;
  const impuesto = subtotal * (rate / 100);
  const total = subtotal + impuesto;

  const paymentRows = data.paymentSchedule.map((p) => {
    const pct = Number.isFinite(Number(p.porcentaje)) ? Number(p.porcentaje) : 0;
    return {
      ...p,
      porcentaje: pct,
      monto: total * (pct / 100),
    };
  });

  const totalPorcentajePagos = paymentRows.reduce((acc, p) => acc + p.porcentaje, 0);

  return {
    totalUnidades,
    unidadResumen,
    subtotal,
    impuesto,
    total,
    paymentRows,
    totalPorcentajePagos,
  };
}

export function isProformaDraft(
  subject:
    | { consecutivo?: number; isDraft?: boolean; data?: { consecutivo?: number; isDraft?: boolean } }
    | null
    | undefined
): boolean {
  if (!subject) return false;
  if (subject.isDraft || subject.data?.isDraft) return true;
  const num = Number(subject.consecutivo ?? subject.data?.consecutivo ?? 0);
  return !Number.isFinite(num) || num <= 0;
}

export function formatProformaNumberLabel(
  subject:
    | { consecutivo?: number; isDraft?: boolean; data?: { consecutivo?: number; isDraft?: boolean } }
    | null
    | undefined,
  prefix = 'Nº '
): string {
  if (!subject) return 'Borrador';
  if (isProformaDraft(subject)) return 'Borrador';
  const num = Number(subject.consecutivo ?? subject.data?.consecutivo ?? 0);
  return `${prefix}${num}`;
}

export function buildPdfFileName(
  consecutivo: number,
  proyecto: string,
  ext = 'pdf',
  clienteFallback = '',
  isDraft = false
): string {
  const sanitize = (val: string) =>
    String(val ?? '')
      .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const projectPart = sanitize(proyecto);
  const clientPart = sanitize(clienteFallback);
  const namePart = projectPart || clientPart || 'Cliente';
  if (isDraft || !Number.isFinite(consecutivo) || consecutivo <= 0) {
    return `Proforma Borrador - ${namePart}.${ext}`;
  }
  return `Proforma #${consecutivo} - ${namePart}.${ext}`;
}

/**
 * Normaliza saltos de línea simples innecesarios y espacios múltiples provenientes
 * de celdas de Excel o Google Sheets, preservando saltos de párrafo dobles (\n\n)
 * y viñetas o listas numeradas para que los párrafos alcancen el margen derecho limpiamente.
 */
export function normalizeSpreadsheetParagraphs(rawText: string): string {
  const raw = String(rawText ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .trim();
  if (!raw) return '';

  const bulletOrListStart = /^(?:[•\-\*▪‣◦–—]|(?:\d{1,3}|[a-zA-Z])[.)]\s+)/;
  const paragraphs = raw.split(/\n\s*\n+/);

  return paragraphs
    .map((para) => {
      const lines = para
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter((line) => line.length > 0);

      if (lines.length === 0) return '';

      const rebuilt: string[] = [];
      lines.forEach((line, idx) => {
        if (idx === 0) {
          rebuilt.push(line);
          return;
        }
        if (bulletOrListStart.test(line)) {
          rebuilt.push(`\n${line}`);
        } else {
          rebuilt[rebuilt.length - 1] = `${rebuilt[rebuilt.length - 1]} ${line}`;
        }
      });
      return rebuilt.join('');
    })
    .filter(Boolean)
    .join('\n\n');
}

export function getCompanyHeaderLines(company: CompanyInfo): string[] {
  const razon = (company.razonSocial ?? '').trim();
  const cedula = (company.cedulaJuridica ?? '').trim();
  const tel = (company.telefono ?? '').trim();
  const correo = (company.correo ?? '').trim();
  const web = (company.sitioWeb ?? '').trim();
  const direccion = (company.direccion ?? '').trim();

  const line2 = [
    cedula ? `Céd. Jur.: ${cedula}` : '',
    tel ? `Tel: ${tel}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  const line3 = [correo, web].filter(Boolean).join('  ·  ');

  return [razon, line2, line3, direccion].filter(Boolean);
}

export function getCompanyFooterText(company: CompanyInfo): string {
  return [
    (company.razonSocial ?? '').trim(),
    (company.correo ?? '').trim(),
    (company.telefono ?? '').trim(),
  ]
    .filter(Boolean)
    .join('  ·  ');
}

export function normalizeVisualReferenceSize(
  size?: string
): VisualReferenceSize {
  if (size === 'small' || size === 'large' || size === 'medium') {
    return size;
  }
  return 'medium';
}

export function normalizeVisualReferenceFitMode(
  fitMode?: string
): VisualReferenceFitMode {
  return fitMode === 'cover' ? 'cover' : 'contain';
}

export function clampVisualReferenceWidthPct(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.max(25, Math.min(100, Math.round(value * 10) / 10));
}

export function clampVisualReferenceHeightPx(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 204;
  return Math.max(100, Math.min(420, Math.round(value)));
}

export function getVisualReferenceWidthPct(item: {
  size?: VisualReferenceSize;
  customWidthPct?: number;
}): number {
  if (
    typeof item.customWidthPct === 'number' &&
    Number.isFinite(item.customWidthPct)
  ) {
    return clampVisualReferenceWidthPct(item.customWidthPct);
  }
  const normalized = normalizeVisualReferenceSize(item.size);
  if (normalized === 'small') return 33.333;
  if (normalized === 'large') return 100;
  return 50;
}

export function getVisualReferenceBoxHeightPx(item: {
  size?: VisualReferenceSize;
  customHeightPx?: number;
}): number {
  if (
    typeof item.customHeightPx === 'number' &&
    Number.isFinite(item.customHeightPx)
  ) {
    return clampVisualReferenceHeightPx(item.customHeightPx);
  }
  const normalized = normalizeVisualReferenceSize(item.size);
  if (normalized === 'small') return 152;
  if (normalized === 'large') return 210;
  return 204;
}

export function getVisualReferenceColumnWeight(
  size?: VisualReferenceSize
): number {
  const normalized = normalizeVisualReferenceSize(size);
  if (normalized === 'small') return 2; // hasta 3 por fila (6 / 2 = 3)
  if (normalized === 'large') return 6; // 1 por fila (6 / 6 = 1)
  return 3; // mediano: hasta 2 por fila (6 / 3 = 2)
}

export function packVisualReferenceRows<
  T extends { size?: VisualReferenceSize; customWidthPct?: number },
>(items: T[]): T[][] {
  const rows: T[][] = [];
  let currentRow: T[] = [];
  let currentPct = 0;

  for (const item of items) {
    const pct = getVisualReferenceWidthPct(item);
    if (currentRow.length > 0 && currentPct + pct > 100.3) {
      rows.push(currentRow);
      currentRow = [item];
      currentPct = pct;
    } else {
      currentRow.push(item);
      currentPct += pct;
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

export const TABLE_INDEX_COL_PCT = 5;
export const TABLE_EDITABLE_TOTAL_PCT = 100 - TABLE_INDEX_COL_PCT; // 95%

export interface ResolvedTableColumnWidths {
  indexPct: number;
  productoPct: number;
  imagenPct: number;
  descripcionPct: number;
  cantidadPct: number;
  valorUnitarioPct: number;
  valorPct: number;
}

export type EditableTableColumnKey =
  | 'productoPct'
  | 'imagenPct'
  | 'descripcionPct'
  | 'cantidadPct'
  | 'valorUnitarioPct'
  | 'valorPct';

const DEFAULT_WIDTHS_BY_TYPE: Record<ProformaType, ResolvedTableColumnWidths> = {
  mobiliario: {
    indexPct: TABLE_INDEX_COL_PCT,
    productoPct: 13,
    imagenPct: 0,
    descripcionPct: 57,
    cantidadPct: 11,
    valorUnitarioPct: 0,
    valorPct: 14,
  },
  puertas: {
    indexPct: TABLE_INDEX_COL_PCT,
    productoPct: 17,
    imagenPct: 0,
    descripcionPct: 53,
    cantidadPct: 11,
    valorUnitarioPct: 0,
    valorPct: 14,
  },
  griferia: {
    indexPct: TABLE_INDEX_COL_PCT,
    productoPct: 15,
    imagenPct: 11,
    descripcionPct: 44,
    cantidadPct: 11,
    valorUnitarioPct: 0,
    valorPct: 14,
  },
  cielos_pisos: {
    indexPct: TABLE_INDEX_COL_PCT,
    productoPct: 16,
    imagenPct: 0,
    descripcionPct: 39,
    cantidadPct: 12,
    valorUnitarioPct: 13,
    valorPct: 15,
  },
};

export function getEditableTableColumnKeys(
  proformaType: ProformaType
): EditableTableColumnKey[] {
  if (proformaType === 'griferia') {
    return [
      'productoPct',
      'imagenPct',
      'descripcionPct',
      'cantidadPct',
      'valorPct',
    ];
  }
  if (proformaType === 'cielos_pisos') {
    return [
      'productoPct',
      'descripcionPct',
      'cantidadPct',
      'valorUnitarioPct',
      'valorPct',
    ];
  }
  return ['productoPct', 'descripcionPct', 'cantidadPct', 'valorPct'];
}

export function getColumnMinWidthPct(key: EditableTableColumnKey): number {
  return key === 'descripcionPct' ? 20 : 8;
}

export function resolveTableColumnWidths(
  proformaType: ProformaType,
  storedByType?: Partial<Record<ProformaType, TableColumnWidths>>
): ResolvedTableColumnWidths {
  const defaults = DEFAULT_WIDTHS_BY_TYPE[proformaType] ?? DEFAULT_WIDTHS_BY_TYPE.mobiliario;
  const override = storedByType?.[proformaType];
  if (!override) {
    return { ...defaults };
  }

  const keys = getEditableTableColumnKeys(proformaType);
  const rawValues: Record<EditableTableColumnKey, number> = {
    productoPct: defaults.productoPct,
    imagenPct: defaults.imagenPct,
    descripcionPct: defaults.descripcionPct,
    cantidadPct: defaults.cantidadPct,
    valorUnitarioPct: defaults.valorUnitarioPct,
    valorPct: defaults.valorPct,
  };

  keys.forEach((k) => {
    const val = override[k];
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      rawValues[k] = Math.max(getColumnMinWidthPct(k), val);
    }
  });

  const sum = keys.reduce((acc, k) => acc + rawValues[k], 0);
  if (sum <= 0) {
    return { ...defaults };
  }

  const normalized: ResolvedTableColumnWidths = {
    indexPct: TABLE_INDEX_COL_PCT,
    productoPct: 0,
    imagenPct: 0,
    descripcionPct: 0,
    cantidadPct: 0,
    valorUnitarioPct: 0,
    valorPct: 0,
  };

  let running = 0;
  keys.forEach((k, idx) => {
    if (idx === keys.length - 1) {
      normalized[k] = Math.max(
        getColumnMinWidthPct(k),
        Math.round((TABLE_EDITABLE_TOTAL_PCT - running) * 10) / 10
      );
    } else {
      const scaled =
        Math.round(((rawValues[k] / sum) * TABLE_EDITABLE_TOTAL_PCT) * 10) / 10;
      normalized[k] = scaled;
      running += scaled;
    }
  });

  return normalized;
}

export function adjustTableColumnWidth(
  proformaType: ProformaType,
  storedByType: Partial<Record<ProformaType, TableColumnWidths>> | undefined,
  targetKey: EditableTableColumnKey,
  requestedValue: number
): TableColumnWidths {
  const current = resolveTableColumnWidths(proformaType, storedByType);
  const keys = getEditableTableColumnKeys(proformaType);
  const otherKeys = keys.filter((k) => k !== targetKey);
  const minOthersSum = otherKeys.reduce(
    (acc, k) => acc + getColumnMinWidthPct(k),
    0
  );
  const minTarget = getColumnMinWidthPct(targetKey);
  const maxTarget = TABLE_EDITABLE_TOTAL_PCT - minOthersSum;
  const clampedTarget = Math.max(
    minTarget,
    Math.min(maxTarget, Math.round(requestedValue * 10) / 10)
  );

  let deltaToDistribute = clampedTarget - current[targetKey];
  const nextVals: Record<EditableTableColumnKey, number> = {
    productoPct: current.productoPct,
    imagenPct: current.imagenPct,
    descripcionPct: current.descripcionPct,
    cantidadPct: current.cantidadPct,
    valorUnitarioPct: current.valorUnitarioPct,
    valorPct: current.valorPct,
  };
  nextVals[targetKey] = clampedTarget;

  // Priorizar compensar primero contra Descripción (o Producto si se ajusta Descripción)
  const priorityOthers: EditableTableColumnKey[] =
    targetKey === 'descripcionPct'
      ? ['productoPct', ...otherKeys.filter((k) => k !== 'productoPct')]
      : ['descripcionPct', ...otherKeys.filter((k) => k !== 'descripcionPct')];

  for (const k of priorityOthers) {
    if (Math.abs(deltaToDistribute) < 0.05) break;
    const minK = getColumnMinWidthPct(k);
    if (deltaToDistribute > 0) {
      const reducible = Math.max(0, nextVals[k] - minK);
      const take = Math.min(reducible, deltaToDistribute);
      nextVals[k] = Math.round((nextVals[k] - take) * 10) / 10;
      deltaToDistribute = Math.round((deltaToDistribute - take) * 10) / 10;
    } else {
      const add = -deltaToDistribute;
      nextVals[k] = Math.round((nextVals[k] + add) * 10) / 10;
      deltaToDistribute = 0;
    }
  }

  const out: TableColumnWidths = {};
  keys.forEach((k) => {
    out[k] = nextVals[k];
  });
  return out;
}

