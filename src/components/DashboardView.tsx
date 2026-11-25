import {
  BarChart3,
  FilePlus2,
  FolderKanban,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PROFORMA_TYPE_OPTIONS } from '../data/defaults';
import {
  ProformaType,
  SavedProformaRecord,
  ThemeMode,
} from '../types/proforma';

type CurrencyCode = 'USD' | 'CRC';
import {
  computeProformaTotals,
  formatMoney,
  getCurrencyCode,
} from '../utils/formatters';
import { mergeProformaHistoryRecords } from './HistoryView';

interface DashboardViewProps {
  records: SavedProformaRecord[];
  remoteRecords: SavedProformaRecord[];
  themeMode: ThemeMode;
  onGoToHistory: () => void;
  onGoToEditor: () => void;
}

const MONTH_NAMES_SHORT_ES = [
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

const TYPE_CHART_COLORS: Record<ProformaType, string> = {
  mobiliario: '#8C5A32',
  puertas: '#2E6F5E',
  griferia: '#3B6E8C',
  cielos_pisos: '#A67C52',
};

function parseYearMonthKey(rawDate: string, fallbackIso: string): string {
  const candidates = [String(rawDate ?? '').trim(), String(fallbackIso ?? '').trim()];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const isoPrefix = candidate.match(/^(\d{4})-(\d{2})/);
    if (isoPrefix) {
      return `${isoPrefix[1]}-${isoPrefix[2]}`;
    }
    const dmy = candidate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dmy) {
      const month = dmy[2].padStart(2, '0');
      const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
      return `${year}-${month}`;
    }
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  }
  return 'Sin fecha';
}

function formatMonthLabel(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  const monthShort = MONTH_NAMES_SHORT_ES[monthIdx] ?? m[2];
  return `${monthShort} ${year}`;
}

export function DashboardView({
  records,
  remoteRecords,
  themeMode,
  onGoToHistory,
  onGoToEditor,
}: DashboardViewProps) {
  const cardSurface =
    'rounded-xl border border-[#E3E1DA] bg-white shadow-[0_1px_3px_rgba(24,24,27,0.04)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none';

  const combined = useMemo(
    () => mergeProformaHistoryRecords(records, remoteRecords),
    [records, remoteRecords]
  );

  const enriched = useMemo(() => {
    return combined.map((rec) => {
      const totals = computeProformaTotals(rec.data);
      const totalValue = totals.total > 0 ? totals.total : rec.total;
      const rawCode = getCurrencyCode(rec.data.clientProject.moneda);
      const currency: CurrencyCode = rawCode === 'CRC' ? 'CRC' : 'USD';
      const type: ProformaType = rec.data.proformaType ?? 'mobiliario';
      const monthKey = parseYearMonthKey(
        rec.data.clientProject.fecha,
        rec.savedAt
      );
      return {
        record: rec,
        totalValue,
        currency,
        type,
        monthKey,
      };
    });
  }, [combined]);

  const availableCurrencies = useMemo<CurrencyCode[]>(() => {
    const counts: Record<CurrencyCode, number> = { USD: 0, CRC: 0 };
    enriched.forEach((e) => {
      counts[e.currency] += 1;
    });
    const list: CurrencyCode[] = [];
    if (counts.USD > 0) list.push('USD');
    if (counts.CRC > 0) list.push('CRC');
    return list.length > 0 ? list : ['USD'];
  }, [enriched]);

  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(() =>
    availableCurrencies[0] ?? 'USD'
  );

  const activeCurrency: CurrencyCode = availableCurrencies.includes(
    selectedCurrency
  )
    ? selectedCurrency
    : availableCurrencies[0];

  const currencyEntries = useMemo(
    () => enriched.filter((e) => e.currency === activeCurrency),
    [enriched, activeCurrency]
  );

  const monthlySalesData = useMemo(() => {
    const byMonth = new Map<
      string,
      { monthKey: string; label: string; total: number; count: number }
    >();

    currencyEntries.forEach((entry) => {
      const existing = byMonth.get(entry.monthKey);
      if (existing) {
        existing.total += entry.totalValue;
        existing.count += 1;
      } else {
        byMonth.set(entry.monthKey, {
          monthKey: entry.monthKey,
          label: formatMonthLabel(entry.monthKey),
          total: entry.totalValue,
          count: 1,
        });
      }
    });

    return Array.from(byMonth.values())
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((item) => ({
        ...item,
        total: Number(item.total.toFixed(2)),
      }));
  }, [currencyEntries]);

  const typeFrequencyData = useMemo(() => {
    const counts = new Map<
      ProformaType,
      { type: ProformaType; label: string; count: number; totalAmount: number }
    >();
    PROFORMA_TYPE_OPTIONS.forEach((opt) => {
      counts.set(opt.value, {
        type: opt.value,
        label: opt.label,
        count: 0,
        totalAmount: 0,
      });
    });

    enriched.forEach((entry) => {
      const bucket = counts.get(entry.type);
      if (bucket) {
        bucket.count += 1;
        if (entry.currency === activeCurrency) {
          bucket.totalAmount += entry.totalValue;
        }
      }
    });

    return Array.from(counts.values());
  }, [enriched, activeCurrency]);

  const kpis = useMemo(() => {
    const totalSales = currencyEntries.reduce(
      (sum, e) => sum + e.totalValue,
      0
    );
    const avgTicket =
      currencyEntries.length > 0 ? totalSales / currencyEntries.length : 0;
    const peakMonth = monthlySalesData.reduce<{
      label: string;
      total: number;
    } | null>((best, curr) => {
      if (!best || curr.total > best.total) {
        return { label: curr.label, total: curr.total };
      }
      return best;
    }, null);

    return {
      totalQuotes: enriched.length,
      currencyQuotes: currencyEntries.length,
      totalSales,
      avgTicket,
      peakMonth,
    };
  }, [enriched.length, currencyEntries, monthlySalesData]);

  const isDark = themeMode === 'dark';
  const axisTickColor = isDark ? '#A1A1AA' : '#52525B';
  const gridStroke = isDark ? '#27272A' : '#ECEAE3';
  const barFill = isDark ? '#C68B59' : '#8C5A32';

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Dashboard de Cotizaciones
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Resumen mensual de ventas cotizadas y frecuencia por tipo de
            cotización a partir del historial local y PROFORMAS.
          </p>
        </div>

        {availableCurrencies.length > 1 && (
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Filtrar métricas de ventas por moneda"
              className="inline-flex items-center rounded-md border border-[#DCDAD3] bg-[#FAF9F6] p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {availableCurrencies.map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setSelectedCurrency(cur)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    activeCurrency === cur
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-zinc-100'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  {cur === 'CRC' ? 'Colones (₡)' : 'Dólares ($)'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {enriched.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#DCDAD3] bg-white px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <BarChart3
            className="mx-auto h-8 w-8 text-[#8C5A32] dark:text-[#C68B59]"
            aria-hidden="true"
          />
          <p className="mt-3 font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Sin datos en el historial para graficar
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Guarda cotizaciones o sincroniza desde la hoja PROFORMAS para
            visualizar ventas mensuales y tipos de cotización.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onGoToHistory}
              className="rounded-md border border-[#DCDAD3] bg-white px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Ir a PROFORMAS
            </button>
            <button
              type="button"
              onClick={onGoToEditor}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ir al Editor</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* KPIs resumen */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`p-4 ${cardSurface}`}>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Total Proformas (Historial)
              </span>
              <p className="mt-1.5 font-mono text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                {kpis.totalQuotes}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {kpis.currencyQuotes} cotización(es) en {activeCurrency}
              </p>
            </div>

            <div className={`p-4 ${cardSurface}`}>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Ventas Totales ({activeCurrency})
              </span>
              <p className="mt-1.5 font-mono text-2xl font-bold text-[#8C5A32] tabular-nums dark:text-[#D59B69]">
                {formatMoney(kpis.totalSales, activeCurrency)}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Suma acumulada de proformas
              </p>
            </div>

            <div className={`p-4 ${cardSurface}`}>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Ticket Promedio ({activeCurrency})
              </span>
              <p className="mt-1.5 font-mono text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                {formatMoney(kpis.avgTicket, activeCurrency)}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Promedio por proforma
              </p>
            </div>

            <div className={`p-4 ${cardSurface}`}>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Mes Pico ({activeCurrency})
              </span>
              <p className="mt-1.5 font-display text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {kpis.peakMonth ? kpis.peakMonth.label : '—'}
              </p>
              <p className="mt-1 font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                {kpis.peakMonth
                  ? formatMoney(kpis.peakMonth.total, activeCurrency)
                  : 'Sin registros'}
              </p>
            </div>
          </div>

          {/* Gráficos Recharts */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* (a) Ventas totales mensuales */}
            <section
              aria-label="Ventas totales mensuales"
              className={`p-5 lg:col-span-7 ${cardSurface}`}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp
                    className="h-4 w-4 text-[#8C5A32] dark:text-[#C68B59]"
                    aria-hidden="true"
                  />
                  <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Ventas Totales Mensuales ({activeCurrency})
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                  {monthlySalesData.length} mes(es)
                </span>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlySalesData}
                    margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={gridStroke}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={{ stroke: gridStroke }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={72}
                      tickFormatter={(val: number) =>
                        val >= 1000
                          ? `${activeCurrency === 'CRC' ? '₡' : '$'}${(val / 1000).toFixed(0)}k`
                          : `${activeCurrency === 'CRC' ? '₡' : '$'}${val}`
                      }
                    />
                    <Tooltip
                      cursor={{
                        fill: isDark
                          ? 'rgba(255,255,255,0.04)'
                          : 'rgba(140,90,50,0.06)',
                      }}
                      contentStyle={{
                        backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                        borderColor: isDark ? '#3F3F46' : '#E3E1DA',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: isDark ? '#F4F4F5' : '#18181B',
                      }}
                      formatter={(value: unknown, _name, item) => {
                        const num = Number(value ?? 0);
                        const cnt = item?.payload?.count ?? 0;
                        return [
                          `${formatMoney(num, activeCurrency)} (${cnt} proforma${cnt === 1 ? '' : 's'})`,
                          'Total mensual',
                        ];
                      }}
                    />
                    <Bar
                      dataKey="total"
                      fill={barFill}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* (b) Frecuencia de proformas por tipo de cotización */}
            <section
              aria-label="Frecuencia de proformas por tipo de cotización"
              className={`p-5 lg:col-span-5 ${cardSurface}`}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FolderKanban
                    className="h-4 w-4 text-[#8C5A32] dark:text-[#C68B59]"
                    aria-hidden="true"
                  />
                  <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Frecuencia por Tipo de Cotización
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                  {kpis.totalQuotes} total
                </span>
              </div>

              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={typeFrequencyData}
                    layout="vertical"
                    margin={{ top: 4, right: 18, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={gridStroke}
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={{ stroke: gridStroke }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={132}
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{
                        fill: isDark
                          ? 'rgba(255,255,255,0.04)'
                          : 'rgba(140,90,50,0.06)',
                      }}
                      contentStyle={{
                        backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                        borderColor: isDark ? '#3F3F46' : '#E3E1DA',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: isDark ? '#F4F4F5' : '#18181B',
                      }}
                      formatter={(value: unknown) => [
                        `${Number(value ?? 0)} proforma(s)`,
                        'Frecuencia',
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
                      {typeFrequencyData.map((entry) => (
                        <Cell
                          key={entry.type}
                          fill={TYPE_CHART_COLORS[entry.type]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 divide-y divide-[#F0EFEA] border-t border-[#F0EFEA] text-xs dark:divide-zinc-800 dark:border-zinc-800">
                {typeFrequencyData.map((row) => (
                  <div
                    key={row.type}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="flex items-center gap-2 font-medium text-zinc-700 dark:text-zinc-300">
                      <span
                        className="h-2.5 w-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: TYPE_CHART_COLORS[row.type] }}
                        aria-hidden="true"
                      />
                      <span>{row.label}</span>
                    </span>
                    <span className="font-mono font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
