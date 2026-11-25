import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudUpload,
  CopyPlus,
  Edit3,
  FileJson,
  FilePlus2,
  FileSpreadsheet,
  Filter,
  Loader2,
  PenLine,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { GRIFERIA_AUTO_FOOTER_LOGOS } from '../data/defaults';
import { ComputedTotals, SavedProformaRecord } from '../types/proforma';
import { getConnectionButtonClasses } from '../utils/connectionStyles';
import {
  computeProformaTotals,
  formatDateSpanish,
  formatMoney,
} from '../utils/formatters';
import {
  exportProformaToCSV,
  exportProformaToJSON,
  generateProformaPDF,
} from '../utils/exporters';
import { PdfIcon } from './PdfIcon';
import { GoogleSheetShortcutButton } from './GoogleSheetShortcutButton';

interface HistoryViewProps {
  records: SavedProformaRecord[];
  remoteRecords: SavedProformaRecord[];
  activeProformaId: string;
  activeConsecutivo: number;
  hasAppsScriptUrl: boolean;
  isSyncingSheet: boolean;
  isSendingToSheet?: boolean;
  hasCloudSendError?: boolean;
  lastSheetSyncAt?: string;
  sheetSyncFeedback: { ok: boolean; message: string } | null;
  onSyncFromSheet: () => void;
  onSendProforma?: () => void;
  onGoToIntegration: () => void;
  onOpenRecord: (record: SavedProformaRecord) => void;
  onDuplicateRecord: (record: SavedProformaRecord) => void;
  onDeleteRecord: (id: string) => void;
  onGoToEditor: () => void;
  onNewProforma: () => void;
  onImportDraftFile?: (file: File) => void;
  proformasSheetUrl?: string;
  onSaveProformasSheetUrl?: (url: string) => void;
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
  activeConsecutivo,
  hasAppsScriptUrl,
  isSyncingSheet,
  isSendingToSheet = false,
  lastSheetSyncAt,
  sheetSyncFeedback,
  onSyncFromSheet,
  onSendProforma,
  onGoToIntegration,
  onOpenRecord,
  onDuplicateRecord,
  onDeleteRecord,
  onGoToEditor,
  onNewProforma,
  onImportDraftFile,
  hasCloudSendError = false,
  proformasSheetUrl = '',
  onSaveProformasSheetUrl,
}: HistoryViewProps) {
  const cardSurface =
    'rounded-xl border border-[#E3E1DA] bg-white shadow-[0_1px_3px_rgba(24,24,27,0.04)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none';
  const isSheetSyncReady =
    hasAppsScriptUrl && sheetSyncFeedback?.ok !== false;
  const isCloudSendReady = hasAppsScriptUrl && !hasCloudSendError;
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<HistoryFilterSource>('all');
  const [clientFilter, setClientFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minTotal, setMinTotal] = useState('');
  const [maxTotal, setMaxTotal] = useState('');

  const combinedRecords = useMemo<SavedProformaRecord[]>(
    () => mergeProformaHistoryRecords(records, remoteRecords),
    [records, remoteRecords]
  );

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
    <div className="mx-auto max-w-[1200px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
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

          {onSaveProformasSheetUrl && (
            <GoogleSheetShortcutButton
              label="Abrir Sheet Proformas"
              sheetUrl={proformasSheetUrl}
              onSaveSheetUrl={onSaveProformasSheetUrl}
            />
          )}

          {onSendProforma && (
            <button
              type="button"
              onClick={onSendProforma}
              disabled={isSendingToSheet}
              title={`Enviar la Proforma Nº ${activeConsecutivo} al Google Sheet configurado`}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer ${getConnectionButtonClasses(isCloudSendReady, 'outline')}`}
            >
              {isSendingToSheet ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {isSendingToSheet ? 'Enviando Proforma...' : 'Enviar Proforma'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onGoToEditor}
            title="Volver al editor de la cotización activa"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PenLine className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
            <span>Ir al Editor (Nº {activeConsecutivo})</span>
          </button>

          {onImportDraftFile && (
            <>
              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onImportDraftFile(file);
                }}
                className="hidden"
                aria-label="Importar borrador JSON"
              />
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                title="Importar archivo de borrador (.json) enviado desde otra computadora"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
                <span>Importar Borrador (.json)</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onNewProforma}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Nueva Cotización</span>
          </button>
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
        <div className={`overflow-x-auto ${cardSurface}`}>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5E4DF] bg-[#FAF9F6] text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300">
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

                return (
                  <tr
                    key={`${rec.source ?? 'local'}-${rec.id}-${rec.consecutivo}`}
                    className={`transition-colors hover:bg-[#FAF9F6]/70 dark:hover:bg-zinc-800/60 ${
                      isCurrent ? 'bg-[#FAF9F6] dark:bg-zinc-800/40' : ''
                    }`}
                  >
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
                        {rec.data.clientProject.cliente || 'Cliente sin nombre'}
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
                      {formatMoney(displayTotal, rec.data.clientProject.moneda)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenRecord(rec)}
                          title="Leer Datos_JSON y cargar todos los datos editables en el formulario principal"
                          className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
                          <span>Cargar / Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateRecord(rec)}
                          title="Duplicar con siguiente consecutivo"
                          className="inline-flex items-center gap-1 rounded border border-[#E5E4DF] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap cursor-pointer"
                        >
                          <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" />
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
                          onClick={() => exportProformaToJSON(rec.data, totals)}
                          title="Exportar JSON"
                          aria-label={`Exportar JSON Proforma ${rec.consecutivo}`}
                          className="rounded border border-[#E5E4DF] bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                          <FileJson className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => exportProformaToCSV(rec.data, totals)}
                          title="Exportar CSV / Excel"
                          aria-label={`Exportar CSV Proforma ${rec.consecutivo}`}
                          className={`rounded p-1.5 transition-colors cursor-pointer ${getConnectionButtonClasses(true, 'icon')}`}
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
      )}
    </div>
  );
}
