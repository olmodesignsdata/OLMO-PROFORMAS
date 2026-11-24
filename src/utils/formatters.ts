import { ComputedTotals, ProformaData } from '../types/proforma';

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

export function buildPdfFileName(consecutivo: number, cliente: string, ext = 'pdf'): string {
  const cleanClient = String(cliente ?? '')
    .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const clientPart = cleanClient || 'Cliente';
  return `Proforma#${consecutivo} ${clientPart}.${ext}`;
}
