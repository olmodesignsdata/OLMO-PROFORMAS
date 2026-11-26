import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Columns2,
  CopyPlus,
  Edit3,
  FileJson,
  FilePlus2,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DEFAULT_OLMO_MAIN_LOGO,
  DEFAULT_PROFORMAS_SHEET_URL,
  GRIFERIA_AUTO_FOOTER_LOGOS,
} from '../data/defaults';
import {
  ComputedTotals,
  LogoAsset,
  SavedProformaRecord,
} from '../types/proforma';
import { getConnectionButtonClasses } from '../utils/connectionStyles';
import {
  computeProformaTotals,
  formatDateSpanish,
  formatMoney,
} from '../utils/formatters';
import { generateProformaPDF } from '../utils/exporters';
import { CompareProformasModal } from './CompareProformasModal';
import { PdfIcon } from './PdfIcon';
import { GoogleSheetShortcutButton } from './GoogleSheetShortcutButton';

interface HistoryViewProps {
  records: SavedProformaRecord[];
  remoteRecords: SavedProformaRecord[];
  activeProformaId: string;
  hasAppsScriptUrl: boolean;
  isSyncingSheet: boolean;
  lastSheetSyncAt?: string;
  sheetSyncFeedback: { ok: boolean; message: string } | null;
  onSyncFromSheet: () => void;
  onGoToIntegration: () => void;
  onPreviewRecord: (record: SavedProformaRecord) => void;
  onOpenRecord: (record: SavedProformaRecord) => void;
  onDuplicateRecord: (record: SavedProformaRecord) => void;
  onDeleteRecord: (id: string) => void;
  onGoToEditor: () => void;
  onNewProforma: () => void;
  proformasSheetUrl?: string;
  mainLogo?: LogoAsset;
  footerLogos?: Array<LogoAsset | null>;
}

type HistoryFilterSource = 'all' | 'local' | 'sheet';

interface EnrichedHistoryRecord {
  record: SavedProformaRecord;
  totals: ComputedTotals;
  displayTotal: number;
  isoDate: string;
  searchText: string;
  normalizedClient: string;
}

function normalizeSearchText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extractIsoDateKey(raw: string): string {
  const str = String(raw ?? '').trim();
  if (!str) return '';
  const isoPrefix = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];

  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return '';
}

export function mergeProformaHistoryRecords(
  records: SavedProformaRecord[],
  remoteRecords: SavedProformaRecord[]
): SavedProformaRecord[] {
  const map = new Map<string, SavedProformaRecord>();
  const keyOf = (rec: SavedProformaRecord) =>
    rec.consecutivo > 0 ? `num:${rec.consecutivo}` : `id:${rec.id}`;

  records.forEach((rec) => {
    map.set(keyOf(rec), { ...rec, source: 'local' });
  });

  remoteRecords.forEach((remote) => {
    const k = keyOf(remote);
    const existing = map.get(k);
    if (existing) {
      map.set(k, {
        ...existing,
        source: 'both',
      });
    } else {
      map.set(k, {
        ...remote,
        source: 'sheet',
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    if (b.consecutivo !== a.consecutivo) return b.consecutivo - a.consecutivo;
    return b.savedAt.localeCompare(a.savedAt);
  });
}

export function HistoryView({
  records,
  remoteRecords,
  activeProformaId,
  hasAppsScriptUrl,
  isSyncingSheet,
  lastSheetSyncAt,
  sheetSyncFeedback,
  onSyncFromSheet,
  onGoToIntegration,
  onPreviewRecord,
  onOpenRecord,
  onDuplicateRecord,
  onDeleteRecord,
  onGoToEditor,
  onNewProforma,
  proformasSheetUrl = '',
  mainLogo = DEFAULT_OLMO_MAIN_LOGO,
  footerLogos = [],
}: HistoryViewProps) {
  const cardSurface =
    'rounded-xl border border-[#E3E1DA] bg-white shadow-[0_1px_3px_rgba(24,24,27,0.04)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none';
  const isSheetSyncReady =
    hasAppsScriptUrl && sheetSyncFeedback?.ok !== false;
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<HistoryFilterSource>('all');
  const [clientFilter, setClientFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minTotal, setMinTotal] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [selectedCompareKeys, setSelectedCompareKeys] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const getRecordRowKey = (rec: SavedProformaRecord) =>
    `${rec.source ?? 'local'}-${rec.id}-${rec.consecutivo}`;

  const getCompareSelectionKey = (rec: SavedProformaRecord) =>
    rec.consecutivo > 0 ? `num:${rec.consecutivo}` : `id:${rec.id}`;

  const combinedRecords = useMemo<SavedProformaRecord[]>(
    () => mergeProformaHistoryRecords(records, remoteRecords),
    [records, remoteRecords]
  );

  const selectedCompareRecords = useMemo<SavedProformaRecord[]>(() => {
    const byKey = new Map<string, SavedProformaRecord>();
    combinedRecords.forEach((rec) => {
      byKey.set(getCompareSelectionKey(rec), rec);
    });
    return selectedCompareKeys
      .map((key) => byKey.get(key))
      .filter((rec): rec is SavedProformaRecord => Boolean(rec))
      .slice(0, 4);
  }, [combinedRecords, selectedCompareKeys]);

  const selectedCompareKeySet = useMemo(
    () => new Set(selectedCompareRecords.map(getCompareSelectionKey)),
    [selectedCompareRecords]
  );

  const handleToggleCompareRecord = (rec: SavedProformaRecord) => {
    const key = getCompareSelectionKey(rec);
    setSelectedCompareKeys((prev) => {
      const validKeys = new Set(combinedRecords.map(getCompareSelectionKey));
      const normalizedPrev = prev.filter((k) => validKeys.has(k));
      if (normalizedPrev.includes(key)) {
        return normalizedPrev.filter((k) => k !== key);
      }
      if (normalizedPrev.length >= 4) {
        return normalizedPrev;
      }
      return [...normalizedPrev, key];
    });
  };

  const canCompareSelected =
    selectedCompareRecords.length >= 2 && selectedCompareRecords.length <= 4;

  const enrichedRecords = useMemo<EnrichedHistoryRecord[]>(() => {
    return combinedRecords.map((rec) => {
      const totals = computeProformaTotals(rec.data);
      const displayTotal = totals.total > 0 ? totals.total : rec.total;
      const cp = rec.data.clientProject;
      const itemsText = rec.data.items
        .map((it) => `${it.producto} ${it.descripcion}`)
        .join(' ');
      const searchText = normalizeSearchText(
        [
          String(rec.consecutivo),
          cp.cliente,
          cp.proyecto,
          cp.contacto,
          cp.ubicacion,
          cp.correo,
          cp.telefono,
          itemsText,
        ].join(' ')
      );
      return {
        record: rec,
        totals,
        displayTotal,
        isoDate: extractIsoDateKey(cp.fecha),
        searchText,
        normalizedClient: normalizeSearchText(cp.cliente),
      };
    });
  }, [combinedRecords]);

  const uniqueClients = useMemo<Array<{ value: string; label: string }>>(() => {
    const clientMap = new Map<string, string>();
    enrichedRecords.forEach(({ record, normalizedClient }) => {
      const rawName = record.data.clientProject.cliente.trim();
      if (normalizedClient && rawName && !clientMap.has(normalizedClient)) {
        clientMap.set(normalizedClient, rawName);
      }
    });
    return Array.from(clientMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [enrichedRecords]);

  const hasActiveFilters = Boolean(
    query.trim() ||
      sourceFilter !== 'all' ||
      clientFilter ||
      dateFrom ||
      dateTo ||
      minTotal.trim() ||
      maxTotal.trim()
  );

  const handleClearFilters = () => {
    setQuery('');
    setSourceFilter('all');
    setClientFilter('');
    setDateFrom('');
    setDateTo('');
    setMinTotal('');
    setMaxTotal('');
  };

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query);
    const parsedMin =
      minTotal.trim() !== '' && Number.isFinite(Number(minTotal))
        ? Number(minTotal)
        : null;
    const parsedMax =
      maxTotal.trim() !== '' && Number.isFinite(Number(maxTotal))
        ? Number(maxTotal)
        : null;

    return enrichedRecords.filter((entry) => {
      const { record, displayTotal, isoDate, searchText, normalizedClient } =
        entry;

      if (
        sourceFilter === 'local' &&
        record.source !== 'local' &&
        record.source !== 'both'
      ) {
        return false;
      }
      if (
        sourceFilter === 'sheet' &&
        record.source !== 'sheet' &&
        record.source !== 'both'
      ) {
        return false;
      }

      if (clientFilter && normalizedClient !== clientFilter) {
        return false;
      }

      if (dateFrom) {
        if (!isoDate || isoDate < dateFrom) {
          return false;
        }
      }
      if (dateTo) {
        if (!isoDate || isoDate > dateTo) {
          return false;
        }
      }

      if (parsedMin !== null && displayTotal < parsedMin) {
        return false;
      }
      if (parsedMax !== null && displayTotal > parsedMax) {
        return false;
      }

      if (q && !searchText.includes(q)) {
        return false;
      }

      return true;
    });
  }, [
    enrichedRecords,
    query,
    sourceFilter,
    clientFilter,
    dateFrom,
    dateTo,
    minTotal,
    maxTotal,
  ]);

  const localCount = records.length;
  const sheetCount = remoteRecords.length;

  return (
    <div className="w-full space-y-5">
      <div className="space-y-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Historial de Cotizaciones
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Consulta cotizaciones guardadas localmente en este navegador y
            sincroniza los registros de la hoja{' '}
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
              Registro_Proformas_OLMO
            </strong>{' '}
            (pestaña <span className="font-mono text-xs">PROFORMAS</span>).
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={onNewProforma}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              <span>Nueva Cotización</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onSyncFromSheet}
            disabled={isSyncingSheet}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer ${getConnectionButtonClasses(isSheetSyncReady, 'outline')}`}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                isSyncingSheet ? 'animate-spin' : ''
              }`}
              aria-hidden="true"
            />
            <span>
              {isSyncingSheet
                ? 'Sincronizando...'
                : 'Actualizar desde Sheet'}
            </span>
          </button>

          <GoogleSheetShortcutButton
            label="Abrir Sheet Proformas"
            sheetUrl={proformasSheetUrl}
            defaultSheetUrl={DEFAULT_PROFORMAS_SHEET_URL}
          />
        </div>
      </div>

      {/* Estado de sincronización con Google Sheet PROFORMAS */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs ${cardSurface}`}>
        <div className="flex flex-wrap items-center gap-2.5 text-zinc-600 dark:text-zinc-400">
          <Cloud className="h-4 w-4 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
          {hasAppsScriptUrl ? (
            <span>
              Conexión configurada en Integración ·{' '}
              <strong className="text-zinc-800 dark:text-zinc-200">
                {sheetCount} registro(s) cargado(s) desde PROFORMAS
              </strong>
              {lastSheetSyncAt && (
                <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                  (última consulta:{' '}
                  {new Date(lastSheetSyncAt).toLocaleString('es-CR')})
                </span>
              )}
            </span>
          ) : (
            <span>
              Para sincronizar con{' '}
              <strong className="text-zinc-800 dark:text-zinc-200">Registro_Proformas_OLMO</strong>,
              configura la URL de Google Apps Script (/exec) en Integración.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!hasAppsScriptUrl && (
            <button
              type="button"
              onClick={onGoToIntegration}
              className="inline-flex items-center gap-1.5 rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ir a Integración</span>
            </button>
          )}

          {combinedRecords.length > 0 && (
            <div className="inline-flex items-center rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setSourceFilter('all')}
                className={`rounded px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                  sourceFilter === 'all'
                    ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-zinc-100'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                Todas ({combinedRecords.length})
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter('local')}
                className={`rounded px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                  sourceFilter === 'local'
                    ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-zinc-100'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                Locales ({localCount})
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter('sheet')}
                className={`rounded px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                  sourceFilter === 'sheet'
                    ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-zinc-100'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                Google Sheet ({sheetCount})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Barra de búsqueda y filtros por cliente, fecha y rango de totales */}
      <div className={`p-4 ${cardSurface}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Búsqueda general */}
          <div className="lg:col-span-4">
            <label
              htmlFor="history-search"
              className="mb-1 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400"
            >
              Buscar cotización
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                aria-hidden="true"
              />
              <input
                id="history-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nº, cliente, proyecto, contacto o ítem..."
                className="w-full rounded-md border border-[#DCDAD3] bg-white py-1.5 pl-8 pr-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filtro por cliente */}
          <div className="lg:col-span-3">
            <label
              htmlFor="history-client-filter"
              className="mb-1 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400"
            >
              Cliente
            </label>
            <select
              id="history-client-filter"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="w-full rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500"
            >
              <option value="">Todos los clientes ({uniqueClients.length})</option>
              {uniqueClients.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por rango de fechas */}
          <div className="grid grid-cols-2 gap-2 lg:col-span-3">
            <div>
              <label
                htmlFor="history-date-from"
                className="mb-1 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400"
              >
                Fecha desde
              </label>
              <input
                id="history-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-md border border-[#DCDAD3] bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500"
              />
            </div>
            <div>
              <label
                htmlFor="history-date-to"
                className="mb-1 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400"
              >
                Fecha hasta
              </label>
              <input
                id="history-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-md border border-[#DCDAD3] bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500"
              />
            </div>
          </div>

          {/* Filtro por rango de totales */}
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <div>
              <label
                htmlFor="history-total-min"
                className="mb-1 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400"
              >
                Total mín.
              </label>
              <input
                id="history-total-min"
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={minTotal}
                onChange={(e) => setMinTotal(e.target.value)}
                className="w-full rounded-md border border-[#DCDAD3] bg-white px-2 py-1.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
              />
            </div>
            <div>
              <label
                htmlFor="history-total-max"
                className="mb-1 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400"
              >
                Total máx.
              </label>
              <input
                id="history-total-max"
                type="number"
                min="0"
                step="any"
                placeholder="Sin límite"
                value={maxTotal}
                onChange={(e) => setMaxTotal(e.target.value)}
                className="w-full rounded-md border border-[#DCDAD3] bg-white px-2 py-1.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {(hasActiveFilters || combinedRecords.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#F0EFEA] pt-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
              <span>
                Mostrando{' '}
                <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {filtered.length}
                </strong>{' '}
                de{' '}
                <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {combinedRecords.length}
                </strong>{' '}
                proforma(s) (Local + Google Sheet)
              </span>
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                <span>Limpiar filtros</span>
              </button>
            )}
          </div>
        )}
      </div>

      {sheetSyncFeedback && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3.5 py-2.5 text-xs ${
            sheetSyncFeedback.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-200'
          }`}
        >
          {sheetSyncFeedback.ok ? (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
          ) : (
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-400"
              aria-hidden="true"
            />
          )}
          <span>{sheetSyncFeedback.message}</span>
        </div>
      )}

      {combinedRecords.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#DCDAD3] bg-white px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Aún no hay cotizaciones guardadas en el historial
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Guarda una proforma localmente desde el editor o usa{' '}
            &ldquo;Actualizar desde Sheet&rdquo; para cargar las cotizaciones de
            la pestaña PROFORMAS.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onSyncFromSheet}
              disabled={isSyncingSheet}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${getConnectionButtonClasses(isSheetSyncReady, 'outline')}`}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  isSyncingSheet ? 'animate-spin' : ''
                }`}
                aria-hidden="true"
              />
              <span>Actualizar desde Sheet</span>
            </button>
            <button
              type="button"
              onClick={onNewProforma}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Nueva Cotización</span>
            </button>
            <button
              type="button"
              onClick={onGoToEditor}
              className="rounded-md border border-[#DCDAD3] bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Ir al Editor
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#E5E4DF] bg-white px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            No se encontraron cotizaciones con los criterios seleccionados
            {query ? ` ("${query}")` : ''}.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-3.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Limpiar filtros y ver todas</span>
            </button>
          )}
        </div>
      ) : (
        <div className={`overflow-hidden ${cardSurface}`}>
          {/* Barra de comparación de cotizaciones seleccionadas */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E4DF] bg-[#FAF9F6] px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/45">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <Columns2
                className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400 shrink-0"
                aria-hidden="true"
              />
              <span>
                {selectedCompareRecords.length === 0
                  ? 'Selecciona entre 2 y 4 cotizaciones para compararlas lado a lado.'
                  : selectedCompareRecords.length === 1
                    ? '1 cotización seleccionada. Marca al menos 1 más (máximo 4) para comparar.'
                    : `${selectedCompareRecords.length} de 4 cotizaciones seleccionadas para comparar (${selectedCompareRecords
                        .map((r) => `Nº ${r.consecutivo}`)
                        .join(', ')}).`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCompareRecords.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCompareKeys([])}
                  className="inline-flex items-center gap-1 rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Limpiar selección</span>
                </button>
              )}

              <button
                type="button"
                disabled={!canCompareSelected}
                onClick={() => setShowCompareModal(true)}
                title={
                  canCompareSelected
                    ? `Comparar ${selectedCompareRecords.length} cotizaciones seleccionadas`
                    : 'Selecciona entre 2 y 4 cotizaciones para habilitar la comparación'
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Comparar seleccionadas
                  {selectedCompareRecords.length > 0
                    ? ` (${selectedCompareRecords.length}/4)`
                    : ''}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5E4DF] bg-[#FAF9F6] text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300">
                  <th
                    className="w-10 px-3 py-3 text-center"
                    title="Selecciona hasta 4 cotizaciones para comparar"
                  >
                    <span className="sr-only">Comparar</span>
                    <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                      {selectedCompareRecords.length}/4
                    </span>
                  </th>
                  <th className="px-4 py-3">Consecutivo</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Proyecto</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Ítems</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DF] dark:divide-zinc-800">
                {filtered.map(({ record: rec, totals, displayTotal }) => {
                  const isCurrent = rec.id === activeProformaId;
                  const rowKey = getRecordRowKey(rec);
                  const compareKey = getCompareSelectionKey(rec);
                  const isChecked = selectedCompareKeySet.has(compareKey);
                  const isSelectionDisabled =
                    !isChecked && selectedCompareRecords.length >= 4;

                  return (
                    <tr
                      key={rowKey}
                      onClick={() => onPreviewRecord(rec)}
                      title="Clic para abrir la vista previa de esta proforma"
                      className={`cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-[#FAF6F1] hover:bg-[#F5EFE6] dark:bg-amber-950/20 dark:hover:bg-amber-950/30'
                          : isCurrent
                            ? 'bg-[#FAF9F6] hover:bg-[#F5EFE6]/70 dark:bg-zinc-800/40 dark:hover:bg-zinc-800/70'
                            : 'hover:bg-[#FAF9F6]/90 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <td
                        className="px-3 py-3.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isSelectionDisabled}
                          onChange={() => handleToggleCompareRecord(rec)}
                          aria-label={`Seleccionar Proforma Nº ${rec.consecutivo} para comparar`}
                          title={
                            isSelectionDisabled
                              ? 'Máximo 4 cotizaciones seleccionadas para comparar'
                              : isChecked
                                ? `Quitar Proforma Nº ${rec.consecutivo} de la comparación`
                                : `Seleccionar Proforma Nº ${rec.consecutivo} para comparar`
                          }
                          className="h-4 w-4 rounded border-[#CFCBC0] text-[#8C5A32] accent-[#8C5A32] focus:ring-[#8C5A32] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer dark:border-zinc-600 dark:bg-zinc-900"
                        />
                      </td>
                      <td className="px-4 py-3.5 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap tabular-nums">
                        Nº {rec.consecutivo}
                        {isCurrent && (
                          <span className="ml-2 text-[11px] font-sans font-normal text-[#8C5A32] dark:text-amber-400">
                            · En edición
                          </span>
                        )}
                      </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {rec.data.clientProject.cliente ||
                          'Cliente sin nombre'}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs text-zinc-700 dark:text-zinc-300">
                        {rec.data.clientProject.proyecto.trim() || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {rec.source === 'both' ? (
                        <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                          Local + Sheet
                        </span>
                      ) : rec.source === 'sheet' ? (
                        <span className="inline-flex items-center rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2 py-0.5 text-[11px] font-semibold text-[#8C5A32] dark:border-zinc-700 dark:bg-zinc-800 dark:text-amber-400">
                          Google Sheet
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          Local
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap tabular-nums">
                      {formatDateSpanish(rec.data.clientProject.fecha)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap tabular-nums">
                      {totals.unidadResumen}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap tabular-nums">
                      {formatMoney(
                        displayTotal,
                        rec.data.clientProject.moneda
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenRecord(rec)}
                          title="Leer Datos_JSON y cargar todos los datos editables en el formulario principal"
                          className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap cursor-pointer"
                        >
                          <Edit3
                            className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400"
                            aria-hidden="true"
                          />
                          <span>Cargar / Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateRecord(rec)}
                          title="Duplicar con siguiente consecutivo"
                          className="inline-flex items-center gap-1 rounded border border-[#E5E4DF] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap cursor-pointer"
                        >
                          <CopyPlus
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span>Duplicar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            generateProformaPDF(
                              rec.data,
                              totals,
                              undefined,
                              rec.data.proformaType === 'griferia'
                                ? [...GRIFERIA_AUTO_FOOTER_LOGOS, null]
                                : []
                            )
                          }
                          title="Descargar PDF"
                          aria-label={`Descargar PDF Proforma ${rec.consecutivo}`}
                          className="rounded border border-black bg-black p-1.5 text-white hover:bg-zinc-800 dark:border-zinc-700 dark:bg-black dark:hover:bg-zinc-900 cursor-pointer"
                        >
                          <PdfIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Exportar .json (no disponible por ahora)"
                          aria-label={`Exportar .json Proforma ${rec.consecutivo} (no disponible por ahora)`}
                          className="rounded border border-[#E5E4DF] bg-zinc-100 p-1.5 text-zinc-400 opacity-50 cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-500"
                        >
                          <FileJson className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Exportar CSV (no disponible por ahora)"
                          aria-label={`Exportar CSV Proforma ${rec.consecutivo} (no disponible por ahora)`}
                          className="rounded border border-[#E5E4DF] bg-zinc-100 p-1.5 text-zinc-400 opacity-50 cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-500"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </button>
                        {rec.source !== 'sheet' && (
                          <button
                            type="button"
                            onClick={() => onDeleteRecord(rec.id)}
                            title="Eliminar del historial local"
                            aria-label={`Eliminar Proforma ${rec.consecutivo}`}
                            className="rounded border border-[#E5E4DF] bg-white p-1.5 text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-red-800 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CompareProformasModal
        isOpen={showCompareModal}
        records={selectedCompareRecords}
        mainLogo={mainLogo}
        footerLogos={footerLogos}
        onClose={() => setShowCompareModal(false)}
      />
    </div>
  );
}
