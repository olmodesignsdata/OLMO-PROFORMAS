import { Columns2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_OLMO_MAIN_LOGO,
  getProformaTypeMeta,
  GRIFERIA_AUTO_FOOTER_LOGOS,
  isAutoGriferiaFooterLogo,
} from '../data/defaults';
import {
  ComputedTotals,
  LogoAsset,
  ProformaData,
  SavedProformaRecord,
} from '../types/proforma';
import { parseProformaFromJsonInput } from '../utils/cloudSync';
import {
  computeProformaTotals,
  formatDateSpanish,
  formatMoney,
} from '../utils/formatters';
import {
  clampPreviewZoom,
  COMPARE_PREVIEW_ZOOM_STEP,
  CtrlWheelZoomBox,
  DEFAULT_COMPARE_PREVIEW_ZOOM,
  PreviewZoomControls,
} from './PreviewZoomControls';
import { ProformaPreview } from './ProformaPreview';

interface CompareProformasModalProps {
  isOpen: boolean;
  records: SavedProformaRecord[];
  mainLogo: LogoAsset;
  footerLogos: Array<LogoAsset | null>;
  onClose: () => void;
}

interface PreparedCompareItem {
  key: string;
  record: SavedProformaRecord;
  data: ProformaData;
  totals: ComputedTotals;
  displayTotal: number;
  resolvedFooterLogos: Array<LogoAsset | null>;
}

function resolveFooterLogosForProforma(
  data: ProformaData,
  baseFooterLogos: Array<LogoAsset | null>
): Array<LogoAsset | null> {
  if (data.proformaType === 'griferia') {
    const hasCustomNonAuto = baseFooterLogos.some(
      (logo) => logo !== null && !isAutoGriferiaFooterLogo(logo)
    );
    return hasCustomNonAuto
      ? baseFooterLogos
      : [...GRIFERIA_AUTO_FOOTER_LOGOS, null];
  }
  return baseFooterLogos.map((logo) =>
    logo && isAutoGriferiaFooterLogo(logo) ? null : logo
  );
}

export function CompareProformasModal({
  isOpen,
  records,
  mainLogo,
  footerLogos,
  onClose,
}: CompareProformasModalProps) {
  const [activeTab, setActiveTab] = useState<'table' | 'previews'>('table');
  const [zoomByKey, setZoomByKey] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('table');
    setZoomByKey({});
  }, [isOpen, records]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const effectiveMainLogo = mainLogo?.dataUrl
    ? mainLogo
    : DEFAULT_OLMO_MAIN_LOGO;

  const preparedItems = useMemo<PreparedCompareItem[]>(() => {
    return records.map((rec, idx) => {
      const parsed = rec.rawDatosJson
        ? parseProformaFromJsonInput(rec.rawDatosJson, rec.consecutivo)
        : null;
      const data = parsed ?? rec.data;
      const totals = computeProformaTotals(data);
      const displayTotal = totals.total > 0 ? totals.total : rec.total;
      const key = `${rec.source ?? 'local'}-${rec.id}-${rec.consecutivo}-${idx}`;
      return {
        key,
        record: rec,
        data,
        totals,
        displayTotal,
        resolvedFooterLogos: resolveFooterLogosForProforma(data, footerLogos),
      };
    });
  }, [records, footerLogos]);

  const comparisonRows = useMemo(() => {
    const buildRow = (
      label: string,
      extractor: (item: PreparedCompareItem) => string,
      highlightTotal = false
    ) => {
      const values = preparedItems.map(extractor);
      const uniqueValues = new Set(values);
      return {
        label,
        values,
        differs: uniqueValues.size > 1,
        highlightTotal,
      };
    };

    return [
      buildRow('Consecutivo', ({ data }) => `Nº ${data.consecutivo}`),
      buildRow('Fecha', ({ data }) =>
        data.clientProject.fecha.trim()
          ? formatDateSpanish(data.clientProject.fecha)
          : 'Sin definir'
      ),
      buildRow(
        'Cliente',
        ({ data }) => data.clientProject.cliente.trim() || 'Sin definir'
      ),
      buildRow(
        'Proyecto',
        ({ data }) => data.clientProject.proyecto.trim() || 'Sin definir'
      ),
      buildRow('Tipo', ({ data }) => getProformaTypeMeta(data.proformaType).label),
      buildRow(
        'Cantidad de ítems',
        ({ data, totals }) =>
          `${data.items.length} ítem(s) (${totals.unidadResumen})`
      ),
      buildRow('Subtotal', ({ data, totals }) =>
        formatMoney(totals.subtotal, data.clientProject.moneda)
      ),
      buildRow(
        'IVA',
        ({ data, totals }) =>
          `${data.taxRate}% (${formatMoney(
            totals.impuesto,
            data.clientProject.moneda
          )})`
      ),
      buildRow(
        'Total',
        ({ data, displayTotal }) =>
          formatMoney(displayTotal, data.clientProject.moneda),
        true
      ),
    ];
  }, [preparedItems]);

  if (!isOpen || preparedItems.length < 2) return null;

  const modalWidthClass =
    activeTab === 'previews' || preparedItems.length >= 3
      ? 'max-w-7xl'
      : 'max-w-4xl';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-proformas-dialog-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/55 p-4 backdrop-blur-[1px] dark:bg-black/75"
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-[#E5E4DF] bg-white shadow-2xl transition-all duration-150 dark:border-zinc-700 dark:bg-zinc-900 ${modalWidthClass}`}
      >
        {/* Encabezado y pestañas internas */}
        <div className="border-b border-[#E5E4DF] bg-[#FAF9F6] px-5 pt-4 pb-3 dark:border-zinc-800 dark:bg-zinc-800/70">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-[#E5E4DF] bg-[#FAF6F1] p-2 text-[#8C5A32] dark:border-zinc-700 dark:bg-zinc-900 dark:text-[#D59B69]">
                <Columns2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="compare-proformas-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Comparar Cotizaciones ({preparedItems.length})
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Comparando{' '}
                  {preparedItems
                    .map((item) => `Nº ${item.data.consecutivo}`)
                    .join(' · ')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar comparación"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 cursor-pointer dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Vistas del comparador de cotizaciones"
            className="mt-3.5 inline-flex items-center rounded-lg border border-[#DCDAD3] bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'table'}
              onClick={() => setActiveTab('table')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'table'
                  ? 'bg-[#FAF6F1] text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              Cuadro comparativo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'previews'}
              onClick={() => setActiveTab('previews')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'previews'
                  ? 'bg-[#FAF6F1] text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              Vistas previas
            </button>
          </div>
        </div>

        {/* Contenido desplazable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'table' ? (
            <div className="overflow-x-auto rounded-lg border border-[#E5E4DF] dark:border-zinc-800">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E5E4DF] bg-[#FAF9F6] text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300">
                    <th className="w-[165px] px-3.5 py-2.5 uppercase tracking-wide">
                      Campo
                    </th>
                    {preparedItems.map((item) => {
                      const sourceLabel =
                        item.record.source === 'both'
                          ? 'Local + Sheet'
                          : item.record.source === 'sheet'
                            ? 'Google Sheet'
                            : 'Local';
                      return (
                        <th key={item.key} className="px-3.5 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                              Proforma Nº {item.data.consecutivo}
                            </span>
                            <span className="rounded border border-[#DCDAD3] bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              {sourceLabel}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6] dark:divide-zinc-800">
                  {comparisonRows.map((row) => (
                    <tr
                      key={row.label}
                      className={
                        row.differs
                          ? 'bg-amber-50/45 dark:bg-amber-950/15'
                          : 'bg-white dark:bg-zinc-900'
                      }
                    >
                      <td className="px-3.5 py-2.5 font-semibold text-zinc-700 dark:text-zinc-300">
                        <span>{row.label}</span>
                        {row.differs && (
                          <span className="ml-1.5 inline-block rounded bg-amber-100 px-1 py-0.5 text-[9.5px] font-bold uppercase text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                            Varía
                          </span>
                        )}
                      </td>
                      {row.values.map((val, colIdx) => (
                        <td
                          key={`${row.label}-${preparedItems[colIdx].key}`}
                          className={`px-3.5 py-2.5 ${
                            row.highlightTotal
                              ? 'font-mono font-bold text-[#8C5A32] tabular-nums dark:text-[#D59B69]'
                              : 'text-zinc-800 dark:text-zinc-200'
                          }`}
                        >
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {preparedItems.map((item, idx) => {
                const zoom = zoomByKey[item.key] ?? DEFAULT_COMPARE_PREVIEW_ZOOM;
                const cliente =
                  item.data.clientProject.cliente.trim() || 'Sin definir';
                const totalStr = formatMoney(
                  item.displayTotal,
                  item.data.clientProject.moneda
                );

                return (
                  <div
                    key={item.key}
                    className="flex flex-col overflow-hidden rounded-lg border border-[#E5E4DF] bg-[#F5F4EF] dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E4DF] bg-[#FAF9F6] px-3.5 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            Proforma Nº {item.data.consecutivo}
                          </span>
                          <span className="text-xs font-semibold text-[#8C5A32] tabular-nums dark:text-[#D59B69]">
                            · {totalStr}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                          {cliente}
                          {item.data.clientProject.proyecto.trim()
                            ? ` · ${item.data.clientProject.proyecto.trim()}`
                            : ''}
                          {item.record.source === 'sheet' &&
                          !item.record.rawDatosJson
                            ? ' (reconstruida de columnas)'
                            : ''}
                        </div>
                      </div>

                      <PreviewZoomControls
                        zoom={zoom}
                        defaultZoom={DEFAULT_COMPARE_PREVIEW_ZOOM}
                        contextLabel={`Proforma Nº ${item.data.consecutivo}`}
                        onChangeZoom={(nextZoom) =>
                          setZoomByKey((prev) => ({
                            ...prev,
                            [item.key]: nextZoom,
                          }))
                        }
                      />
                    </div>

                    <CtrlWheelZoomBox
                      onZoomStep={(dir) =>
                        setZoomByKey((prev) => {
                          const current =
                            prev[item.key] ?? DEFAULT_COMPARE_PREVIEW_ZOOM;
                          return {
                            ...prev,
                            [item.key]: clampPreviewZoom(
                              current + dir * COMPARE_PREVIEW_ZOOM_STEP
                            ),
                          };
                        })
                      }
                      className="h-[52vh] overflow-auto p-3"
                    >
                      <div
                        className="mx-auto w-[816px]"
                        style={{ zoom }}
                      >
                        <ProformaPreview
                          data={item.data}
                          totals={item.totals}
                          mainLogo={effectiveMainLogo}
                          footerLogos={item.resolvedFooterLogos}
                          compactReadOnly
                          idPrefix={`cmp-multi-${idx}-`}
                        />
                      </div>
                    </CtrlWheelZoomBox>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="flex items-center justify-between gap-3 border-t border-[#E5E4DF] bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {activeTab === 'previews'
              ? 'Usa los controles (- / % / + / Ajustar) de cada tarjeta para acercar o alejar cada proforma de forma independiente.'
              : 'Los campos resaltados indican diferencias entre las cotizaciones seleccionadas.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
