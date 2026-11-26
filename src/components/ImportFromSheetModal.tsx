import {
  AlertTriangle,
  CheckCircle2,
  CopyPlus,
  Edit3,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getProformaTypeMeta } from '../data/defaults';
import { ProformaData, SavedProformaRecord } from '../types/proforma';
import { parseProformaFromJsonInput } from '../utils/cloudSync';
import {
  computeProformaTotals,
  formatDateSpanish,
  formatMoney,
} from '../utils/formatters';

interface ImportFromSheetModalProps {
  isOpen: boolean;
  mode?: 'import' | 'history';
  initialRecord?: SavedProformaRecord | null;
  records: SavedProformaRecord[];
  isLoading: boolean;
  errorMessage?: string;
  lastSyncedAt?: string;
  hasWebhookUrl: boolean;
  hasUnsavedActiveChanges: boolean;
  activeConsecutivo?: number;
  onRefreshFromSheet: () => void;
  onGoToIntegration: () => void;
  onClose: () => void;
  onConfirmImport: (record: SavedProformaRecord) => void;
  onDuplicateRecord?: (record: SavedProformaRecord) => void;
  onDeleteRecord?: (id: string) => void;
}

export function ImportFromSheetModal({
  isOpen,
  mode = 'import',
  initialRecord = null,
  records,
  isLoading,
  errorMessage,
  lastSyncedAt,
  hasWebhookUrl,
  hasUnsavedActiveChanges,
  activeConsecutivo,
  onRefreshFromSheet,
  onGoToIntegration,
  onClose,
  onConfirmImport,
  onDuplicateRecord,
  onDeleteRecord,
}: ImportFromSheetModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return records;
    return records.filter((rec) => {
      const numStr = String(rec.consecutivo);
      const cli = (rec.data.clientProject.cliente ?? '').toLowerCase();
      const proj = (rec.data.clientProject.proyecto ?? '').toLowerCase();
      const contacto = (rec.data.clientProject.contacto ?? '').toLowerCase();
      return (
        numStr.includes(q) ||
        cli.includes(q) ||
        proj.includes(q) ||
        contacto.includes(q)
      );
    });
  }, [records, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    if (initialRecord) {
      setSelectedId(initialRecord.id);
    } else {
      setSelectedId((prev) => prev || records[0]?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialRecord]);

  useEffect(() => {
    if (!isOpen) return;
    if (filteredRecords.length === 0) {
      setSelectedId('');
      return;
    }
    const stillExists = filteredRecords.some((r) => r.id === selectedId);
    if (!stillExists) {
      setSelectedId(filteredRecords[0].id);
    }
  }, [isOpen, filteredRecords, selectedId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const selectedRecord = useMemo(
    () =>
      filteredRecords.find((r) => r.id === selectedId) ??
      (initialRecord &&
      filteredRecords.find((r) => r.consecutivo === initialRecord.consecutivo)) ??
      filteredRecords[0] ??
      null,
    [filteredRecords, selectedId, initialRecord]
  );

  const previewData = useMemo<ProformaData | null>(() => {
    if (!selectedRecord) return null;
    if (selectedRecord.rawDatosJson) {
      const parsed = parseProformaFromJsonInput(
        selectedRecord.rawDatosJson,
        selectedRecord.consecutivo
      );
      if (parsed) return parsed;
    }
    return selectedRecord.data;
  }, [selectedRecord]);

  const previewTotals = useMemo(
    () => (previewData ? computeProformaTotals(previewData) : null),
    [previewData]
  );

  if (!isOpen) return null;

  const isHistoryMode = mode === 'history';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-sheet-modal-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-[1px] dark:bg-black/75"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#E5E4DF] bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Encabezado */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E4DF] bg-[#FAF9F6] px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/70">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg border border-[#E5E4DF] bg-[#FAF6F1] p-2 text-[#8C5A32] dark:border-zinc-700 dark:bg-zinc-900 dark:text-[#D59B69]">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="import-sheet-modal-title"
                className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {isHistoryMode
                  ? 'Vista Previa de Proforma · PROFORMAS'
                  : 'Importar Proforma desde Google Sheet (PROFORMAS)'}
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {isHistoryMode
                  ? 'Revisa la vista previa de la proforma seleccionada y elige editarla, duplicarla o eliminarla.'
                  : 'Selecciona una cotización del Sheet, revisa su vista previa y confirma su importación al editor.'}
                {lastSyncedAt
                  ? ` · Última lectura: ${new Date(lastSyncedAt).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefreshFromSheet}
              disabled={isLoading || !hasWebhookUrl}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw
                  className="h-3.5 w-3.5 text-[#8C5A32] dark:text-[#D59B69]"
                  aria-hidden="true"
                />
              )}
              <span>{isLoading ? 'Leyendo Sheet...' : 'Actualizar lista'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar ventana"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Estado de error o falta de URL */}
        {((!isHistoryMode && !hasWebhookUrl) || errorMessage) && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span>
                  {errorMessage ||
                    'Falta configurar la URL de Google Apps Script (/exec) para leer la pestaña PROFORMAS.'}
                </span>
              </div>
              {!hasWebhookUrl && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToIntegration();
                  }}
                  className="font-semibold underline hover:opacity-80 cursor-pointer"
                >
                  Ir a Integración
                </button>
              )}
            </div>
          </div>
        )}

        {/* Cuerpo en dos columnas: Lista izquierda + Previsualización derecha */}
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-[#E5E4DF] overflow-hidden md:grid-cols-12 md:divide-x md:divide-y-0 dark:divide-zinc-800">
          {/* Lista de Proformas */}
          <div className="flex min-h-0 flex-col md:col-span-5">
            <div className="border-b border-[#E5E4DF] p-3 dark:border-zinc-800">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por Nº, cliente o proyecto..."
                  className="w-full rounded-md border border-[#DCDAD3] bg-white py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="min-h-[220px] flex-1 space-y-1.5 overflow-y-auto p-2">
              {isLoading && records.length === 0 ? (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin text-[#8C5A32]" />
                  <span>Cargando proformas desde Google Sheets...</span>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300">
                    No se encontraron proformas.
                  </p>
                  <p className="mt-1">
                    {searchQuery.trim()
                      ? 'Prueba con otro criterio de búsqueda.'
                      : 'Haz clic en "Actualizar lista" o verifica la pestaña PROFORMAS.'}
                  </p>
                </div>
              ) : (
                filteredRecords.map((rec) => {
                  const isSelected = selectedRecord?.id === rec.id;
                  const cli =
                    rec.data.clientProject.cliente.trim() ||
                    'Cliente sin definir';
                  const proj =
                    rec.data.clientProject.proyecto.trim() || 'Sin proyecto';
                  const sourceTag =
                    rec.source === 'both'
                      ? 'Local + Sheet'
                      : rec.source === 'sheet'
                        ? 'Google Sheet'
                        : 'Local';
                  return (
                    <button
                      key={`${rec.source ?? 'sheet'}-${rec.id}-${rec.consecutivo}`}
                      type="button"
                      onClick={() => setSelectedId(rec.id)}
                      className={`flex w-full flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-[#8C5A32] bg-[#FAF6F1] ring-1 ring-[#8C5A32]/25 dark:border-[#C68B59] dark:bg-zinc-800 dark:ring-[#C68B59]/25'
                          : 'border-[#E5E4DF] bg-white hover:bg-[#FAF9F6] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                          Proforma Nº {rec.consecutivo}
                        </span>
                        <span className="font-mono text-xs font-semibold text-[#8C5A32] tabular-nums dark:text-[#D59B69]">
                          {formatMoney(rec.total, rec.data.clientProject.moneda)}
                        </span>
                      </div>
                      <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        {cli}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span className="truncate">{proj}</span>
                        <span className="shrink-0 font-mono text-[10px]">
                          {isHistoryMode
                            ? sourceTag
                            : rec.rawDatosJson
                              ? 'Datos completos'
                              : 'Resumen Sheet'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Previsualización clara de la proforma seleccionada */}
          <div className="flex min-h-0 flex-col overflow-y-auto bg-[#FAF9F6]/60 p-4 md:col-span-7 dark:bg-zinc-950/50">
            {!previewData || !previewTotals || !selectedRecord ? (
              <div className="flex h-full min-h-[260px] items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
                Selecciona una proforma de la lista para ver su previsualización.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Encabezado de previsualización */}
                <div className="rounded-lg border border-[#E5E4DF] bg-white p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ECEAE3] pb-3 dark:border-zinc-800">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                          PROFORMA Nº {previewData.consecutivo}
                        </span>
                        <span className="rounded border border-[#DCDAD3] bg-[#FAF6F1] px-2 py-0.5 text-[10px] font-semibold text-[#8C5A32] dark:border-zinc-700 dark:bg-zinc-800 dark:text-[#D59B69]">
                          {getProformaTypeMeta(previewData.proformaType).label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Fecha: {formatDateSpanish(previewData.clientProject.fecha)} · Validez:{' '}
                        {previewData.clientProject.validez || '15 Días'} · Moneda:{' '}
                        {previewData.clientProject.moneda}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Total General
                      </div>
                      <div className="font-mono text-base font-bold text-[#8C5A32] tabular-nums dark:text-[#D59B69]">
                        {formatMoney(previewTotals.total, previewData.clientProject.moneda)}
                      </div>
                    </div>
                  </div>

                  {/* Datos Cliente y Proyecto */}
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                        Cliente:{' '}
                      </span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {previewData.clientProject.cliente.trim() || 'Sin definir'}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                        Proyecto:{' '}
                      </span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {previewData.clientProject.proyecto.trim() || 'Sin definir'}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                        Contacto:{' '}
                      </span>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {previewData.clientProject.contacto.trim() || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                        Ubicación:{' '}
                      </span>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {previewData.clientProject.ubicacion.trim() || '—'}
                      </span>
                    </div>
                    {(previewData.clientProject.telefono.trim() ||
                      previewData.clientProject.correo.trim()) && (
                      <div className="sm:col-span-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                        {[
                          previewData.clientProject.telefono.trim()
                            ? `Tel: ${previewData.clientProject.telefono.trim()}`
                            : '',
                          previewData.clientProject.correo.trim(),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Detalle de Ítems */}
                <div className="overflow-hidden rounded-lg border border-[#E5E4DF] bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between border-b border-[#ECEAE3] bg-[#FAF9F6] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300">
                    <span>Ítems / Partidas ({previewData.items.length})</span>
                    <span className="font-mono">{previewTotals.unidadResumen}</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-zinc-50 text-[10.5px] font-semibold text-zinc-500 dark:bg-zinc-800/40 dark:text-zinc-400">
                        <tr>
                          <th className="w-8 px-3 py-1.5 text-center">#</th>
                          <th className="px-3 py-1.5">Producto / Alcance</th>
                          <th className="w-24 px-3 py-1.5 text-right">Cant.</th>
                          <th className="w-28 px-3 py-1.5 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0EEE8] dark:divide-zinc-800">
                        {previewData.items.map((item, idx) => (
                          <tr key={item.id || idx} className="align-top">
                            <td className="px-3 py-2 text-center font-mono text-[11px] text-zinc-400">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                                {item.producto || 'Sin nombre'}
                              </div>
                              {item.descripcion.trim() && (
                                <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                  {item.descripcion}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-[11px] text-zinc-700 whitespace-nowrap dark:text-zinc-300">
                              {item.cantidad}{' '}
                              {previewData.proformaType === 'cielos_pisos'
                                ? 'm²'
                                : item.unidad || 'und(s)'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-zinc-900 whitespace-nowrap dark:text-zinc-100">
                              {formatMoney(item.valor, previewData.clientProject.moneda)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Subtotal / IVA / Total */}
                  <div className="grid grid-cols-3 divide-x divide-[#ECEAE3] border-t border-[#E5E4DF] bg-[#FAF9F6] text-xs dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <div className="px-3 py-2">
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Subtotal
                      </div>
                      <div className="font-mono font-semibold text-zinc-800 tabular-nums dark:text-zinc-200">
                        {formatMoney(previewTotals.subtotal, previewData.clientProject.moneda)}
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Impuesto ({previewData.taxRate}%)
                      </div>
                      <div className="font-mono font-semibold text-zinc-800 tabular-nums dark:text-zinc-200">
                        {formatMoney(previewTotals.impuesto, previewData.clientProject.moneda)}
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Total
                      </div>
                      <div className="font-mono font-bold text-[#8C5A32] tabular-nums dark:text-[#D59B69]">
                        {formatMoney(previewTotals.total, previewData.clientProject.moneda)}
                      </div>
                    </div>
                  </div>
                </div>

                {selectedRecord.source === 'sheet' && !selectedRecord.rawDatosJson && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Esta fila en el Sheet no incluye columna <code className="font-mono">Datos_JSON</code> completa; se reconstruirá con los campos resumidos disponibles (cliente, proyecto, totales y fechas).
                    </span>
                  </div>
                )}

                {selectedRecord.rawDatosJson && (
                  <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Incluye respaldo completo (<code className="font-mono">Datos_JSON</code>
                      {(previewData.visualReferences?.length ?? 0) > 0
                        ? ` · ${previewData.visualReferences?.length} referencia(s) visual(es)`
                        : ''}
                      ).
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pie del modal */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E4DF] bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {hasUnsavedActiveChanges && activeConsecutivo
              ? `Nota: tienes cambios sin guardar en la Proforma Nº ${activeConsecutivo}; al editar podrás guardarlos antes de reemplazar el editor.`
              : 'La proforma seleccionada se cargará lista para editar en el Editor.'}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isHistoryMode &&
              selectedRecord &&
              selectedRecord.source !== 'sheet' &&
              onDeleteRecord && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteRecord(selectedRecord.id);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-900/60"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Eliminar</span>
                </button>
              )}

            {isHistoryMode && selectedRecord && onDuplicateRecord && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDuplicateRecord(selectedRecord);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Duplicar</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={!selectedRecord}
              onClick={() => {
                if (!selectedRecord) return;
                onConfirmImport(selectedRecord);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {isHistoryMode ? (
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {selectedRecord
                  ? isHistoryMode
                    ? `Seleccionar y Editar Nº ${selectedRecord.consecutivo}`
                    : `Confirmar e importar Nº ${selectedRecord.consecutivo}`
                  : 'Seleccionar y Editar'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
