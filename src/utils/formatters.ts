import {
  CompanyInfo,
  ComputedTotals,
  ProformaData,
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

export function buildPdfFileName(
  consecutivo: number,
  proyecto: string,
  ext = 'pdf',
  clienteFallback = ''
): string {
  const sanitize = (val: string) =>
    String(val ?? '')
      .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const projectPart = sanitize(proyecto);
  const clientPart = sanitize(clienteFallback);
  const namePart = projectPart || clientPart || 'Cliente';
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

export function getVisualReferenceColumnWeight(
  size?: VisualReferenceSize
): number {
  const normalized = normalizeVisualReferenceSize(size);
  if (normalized === 'small') return 2; // hasta 3 por fila (6 / 2 = 3)
  if (normalized === 'large') return 6; // 1 por fila (6 / 6 = 1)
  return 3; // mediano: hasta 2 por fila (6 / 3 = 2)
}

export function packVisualReferenceRows<
  T extends { size?: VisualReferenceSize },
>(items: T[]): T[][] {
  const rows: T[][] = [];
  let currentRow: T[] = [];
  let currentWeight = 0;

  for (const item of items) {
    const weight = getVisualReferenceColumnWeight(item.size);
    if (currentRow.length > 0 && currentWeight + weight > 6) {
      rows.push(currentRow);
      currentRow = [item];
      currentWeight = weight;
    } else {
      currentRow.push(item);
      currentWeight += weight;
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

