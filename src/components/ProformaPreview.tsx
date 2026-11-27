import {
  AlertTriangle,
  Columns3,
  GripVertical,
  Maximize2,
  RotateCcw,
} from 'lucide-react';
import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_OLMO_MAIN_LOGO,
  getProformaTypeMeta,
} from '../data/defaults';
import {
  ComputedTotals,
  LogoAsset,
  ProformaData,
  ProformaType,
  TableColumnWidths,
  VisualReferenceItem,
  VisualReferenceSize,
} from '../types/proforma';
import {
  adjustTableColumnWidth,
  clampVisualReferenceHeightPx,
  clampVisualReferenceWidthPct,
  EditableTableColumnKey,
  formatDateSpanish,
  formatMoney,
  formatProformaNumberLabel,
  getColumnMinWidthPct,
  getCompanyHeaderLines,
  getCurrencyCode,
  getEditableTableColumnKeys,
  getVisualReferenceBoxHeightPx,
  getVisualReferenceWidthPct,
  isProformaDraft,
  normalizeSpreadsheetParagraphs,
  normalizeVisualReferenceSize,
  packVisualReferenceRows,
  resolveTableColumnWidths,
  TABLE_EDITABLE_TOTAL_PCT,
} from '../utils/formatters';
import {
  clampPreviewZoom,
  CtrlWheelZoomBox,
  PreviewZoomControls,
} from './PreviewZoomControls';
import { ResilientImage } from './ResilientImage';
import { VisualRefImageFrame } from './VisualRefImageFrame';

interface ProformaPreviewProps {
  data: ProformaData;
  totals: ComputedTotals;
  mainLogo: LogoAsset;
  footerLogos: Array<LogoAsset | null>;
  canEditVisualRefs?: boolean;
  showPageThumbnails?: boolean;
  compactReadOnly?: boolean;
  idPrefix?: string;
  onChangeVisualReferenceSize?: (
    refId: string,
    nextSize: VisualReferenceSize
  ) => void;
  onUpdateVisualReference?: (
    refId: string,
    patch: Partial<VisualReferenceItem>
  ) => void;
  onReorderVisualReferences?: (fromId: string, toId: string) => void;
  onChangeTableColumnWidths?: (
    proformaType: ProformaType,
    widths: TableColumnWidths
  ) => void;
}

const COLUMN_LABELS_BY_TYPE: Record<
  ProformaType,
  Partial<Record<EditableTableColumnKey, string>>
> = {
  mobiliario: {
    productoPct: 'Producto',
    descripcionPct: 'Descripción',
    cantidadPct: 'Cantidad',
    valorPct: 'Valor',
  },
  puertas: {
    productoPct: 'Producto',
    descripcionPct: 'Descripción del producto',
    cantidadPct: 'Cantidad',
    valorPct: 'Valor',
  },
  griferia: {
    productoPct: 'Código producto',
    imagenPct: 'Imagen',
    descripcionPct: 'Descripción',
    cantidadPct: 'Cantidad',
    valorPct: 'Valor',
  },
  cielos_pisos: {
    productoPct: 'Espacio',
    descripcionPct: 'Acabado',
    cantidadPct: 'Cantidad (m²)',
    valorUnitarioPct: 'Valor unitario',
    valorPct: 'Valor',
  },
};

export function ProformaPreview({
  data,
  totals,
  mainLogo,
  footerLogos,
  canEditVisualRefs = false,
  showPageThumbnails = false,
  compactReadOnly = false,
  idPrefix = '',
  onChangeVisualReferenceSize,
  onUpdateVisualReference,
  onReorderVisualReferences,
  onChangeTableColumnWidths,
}: ProformaPreviewProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [activePageId, setActivePageId] = useState<string>(`${idPrefix}proforma-page-1`);
  const [draggedRefId, setDraggedRefId] = useState<string | null>(null);
  const [dragOverRefId, setDragOverRefId] = useState<string | null>(null);
  const [showColumnAdjuster, setShowColumnAdjuster] = useState(false);
  const [resizingRefId, setResizingRefId] = useState<string | null>(null);

  const resizeSessionRef = useRef<{
    refId: string;
    startX: number;
    startY: number;
    startWidthPct: number;
    startHeightPx: number;
    rowWidthPx: number;
    zoomFactor: number;
  } | null>(null);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const session = resizeSessionRef.current;
      if (!session || !onUpdateVisualReference) return;

      const scale = Math.max(0.25, session.zoomFactor);
      const dxPx = (e.clientX - session.startX) / scale;
      const dyPx = (e.clientY - session.startY) / scale;

      const rowWidth = Math.max(240, session.rowWidthPx);
      const deltaPct = (dxPx / rowWidth) * 100;
      const nextWidthPct = clampVisualReferenceWidthPct(
        session.startWidthPct + deltaPct
      );
      const nextHeightPx = clampVisualReferenceHeightPx(
        session.startHeightPx + dyPx
      );

      onUpdateVisualReference(session.refId, {
        customWidthPct: nextWidthPct,
        customHeightPx: nextHeightPx,
      });
    };

    const handlePointerUp = () => {
      if (resizeSessionRef.current) {
        resizeSessionRef.current = null;
        setResizingRefId(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onUpdateVisualReference]);

  const startResizeVisualRef = (
    ref: VisualReferenceItem,
    e: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!onUpdateVisualReference) return;
    e.preventDefault();
    e.stopPropagation();
    const cardEl = e.currentTarget.closest('figure');
    const rowEl = cardEl?.parentElement;
    const rowWidthPx = rowEl ? rowEl.getBoundingClientRect().width : 728;
    const zoomFactor = !compactReadOnly ? zoom / 100 : 1;

    setResizingRefId(ref.id);
    resizeSessionRef.current = {
      refId: ref.id,
      startX: e.clientX,
      startY: e.clientY,
      startWidthPct: getVisualReferenceWidthPct(ref),
      startHeightPx: getVisualReferenceBoxHeightPx(ref),
      rowWidthPx: rowWidthPx / Math.max(0.25, zoomFactor),
      zoomFactor,
    };
  };

  const proformaType = data.proformaType ?? 'mobiliario';
  const typeMeta = getProformaTypeMeta(proformaType);
  const currencyCode = getCurrencyCode(data.clientProject.moneda);
  const colWidths = resolveTableColumnWidths(
    proformaType,
    data.tableColumnWidthsByType
  );
  const editableColumnKeys = getEditableTableColumnKeys(proformaType);

  const effectiveMainLogo = mainLogo?.dataUrl ? mainLogo : DEFAULT_OLMO_MAIN_LOGO;
  const activeFooterLogos = footerLogos.filter(
    (logo): logo is LogoAsset => logo !== null && Boolean(logo.dataUrl)
  );
  const companyHeaderLines = getCompanyHeaderLines(data.company);

  const loadedVisualRefs = [...(data.visualReferences ?? [])]
    .filter((ref) => Boolean(ref.imageDataUrl?.trim()))
    .sort((a, b) => a.slotIndex - b.slotIndex);

  const packedVisualRows = packVisualReferenceRows(loadedVisualRefs);
  const visualRefPages: VisualReferenceItem[][][] = [];
  const maxBodyBudgetPx = activeFooterLogos.length > 0 ? 790 : 830;
  let currentPageRows: VisualReferenceItem[][] = [];
  let currentPageHeightPx = 0;

  for (const row of packedVisualRows) {
    const imgBoxHeightPx = Math.max(
      ...row.map((r) => getVisualReferenceBoxHeightPx(r))
    );
    const maxCaptionLines = row.reduce((maxLines, item) => {
      const cap = item.caption.trim();
      if (!cap) return maxLines;
      const widthPct = getVisualReferenceWidthPct(item);
      const charsPerLine = Math.max(20, Math.round((widthPct / 100) * 92));
      return Math.max(maxLines, Math.ceil(cap.length / charsPerLine));
    }, 0);
    const captionPx = maxCaptionLines > 0 ? 18 + maxCaptionLines * 16 : 0;
    const estimatedRowPx = imgBoxHeightPx + captionPx + 16;

    if (
      currentPageRows.length > 0 &&
      currentPageHeightPx + estimatedRowPx > maxBodyBudgetPx
    ) {
      visualRefPages.push(currentPageRows);
      currentPageRows = [row];
      currentPageHeightPx = estimatedRowPx;
    } else {
      currentPageRows.push(row);
      currentPageHeightPx += estimatedRowPx;
    }
  }
  if (currentPageRows.length > 0) {
    visualRefPages.push(currentPageRows);
  }

  const totalPages = 3 + visualRefPages.length;
  const termsPageNumber = 2 + visualRefPages.length;
  const bankPageNumber = 3 + visualRefPages.length;

  const activePayments = totals.paymentRows.filter((p) => p.porcentaje > 0);
  const displayedPayments =
    activePayments.length > 0 ? activePayments : totals.paymentRows;

  const scrollToPage = (pageId: string) => {
    setActivePageId(pageId);
    const el = document.getElementById(pageId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  type ThumbnailKind = 'products' | 'refs' | 'terms' | 'bank';
  const pageThumbnails: Array<{
    id: string;
    pageNumber: number;
    shortTitle: string;
    navLabel: string;
    kind: ThumbnailKind;
    pageRefs?: VisualReferenceItem[][];
    pageIdx?: number;
  }> = [
    {
      id: `${idPrefix}proforma-page-1`,
      pageNumber: 1,
      shortTitle: 'Productos y Totales',
      navLabel: 'Pág. 1 · Productos',
      kind: 'products',
    },
    ...visualRefPages.map((pageRows, pageIdx) => ({
      id: `${idPrefix}proforma-page-refs-${pageIdx}`,
      pageNumber: 2 + pageIdx,
      shortTitle:
        pageIdx === 0 ? 'Referencias Visuales' : 'Referencias (cont.)',
      navLabel:
        pageIdx === 0
          ? `Pág. ${2 + pageIdx} · Referencias`
          : `Pág. ${2 + pageIdx} · Ref. (${pageIdx + 1})`,
      kind: 'refs' as const,
      pageRefs: pageRows,
      pageIdx,
    })),
    {
      id: `${idPrefix}proforma-page-2`,
      pageNumber: termsPageNumber,
      shortTitle: 'Términos y Especif.',
      navLabel: `Pág. ${termsPageNumber} · Términos`,
      kind: 'terms',
    },
    {
      id: `${idPrefix}proforma-page-3`,
      pageNumber: bankPageNumber,
      shortTitle: 'Banco, Pagos y Firmas',
      navLabel: `Pág. ${bankPageNumber} · Banco y Firmas`,
      kind: 'bank',
    },
  ];

  const pageIdsKey = pageThumbnails.map((p) => p.id).join('|');

  useEffect(() => {
    if (!showPageThumbnails) return;
    const ids = pageIdsKey.split('|').filter(Boolean);
    if (ids.length === 0) return;

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          ratios.set(entry.target.id, entry.intersectionRatio);
        });
        let bestId = ids[0];
        let bestRatio = -1;
        ids.forEach((id) => {
          const ratio = ratios.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        });
        if (bestRatio > 0) {
          setActivePageId(bestId);
        }
      },
      {
        threshold: [0.1, 0.25, 0.5, 0.75],
        rootMargin: '-80px 0px -20% 0px',
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [showPageThumbnails, pageIdsKey]);

  const navButtons = pageThumbnails.map((thumb) => ({
    id: thumb.id,
    label: thumb.navLabel,
  }));

  const sheetClassName = (isThumbnail: boolean) =>
    isThumbnail
      ? 'flex w-[816px] min-h-[1056px] flex-col justify-between bg-white p-11 text-zinc-900'
      : 'proforma-sheet flex w-full max-w-[816px] min-h-[1056px] flex-col justify-between border border-[#E5E4DF] bg-white p-9 sm:p-11 shadow-xs scroll-mt-[calc(var(--olmo-workspace-top,155px)+72px)]';

  const renderPage1Sheet = (isThumbnail = false) => {
    const SheetTag = isThumbnail ? 'div' : 'article';
    return (
      <SheetTag
        id={isThumbnail ? undefined : `${idPrefix}proforma-page-1`}
        className={sheetClassName(isThumbnail)}
      >
        <div>
          {/* Encabezado Principal */}
          <div className="flex flex-col justify-between gap-6 border-b-2 border-[#27272a] pb-5 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              {/* Logo principal fijo OLMO B.N. */}
              <div className="flex h-14 max-w-[210px] items-center">
                <ResilientImage
                  src={effectiveMainLogo.dataUrl}
                  alt={effectiveMainLogo.name || 'OLMO B.N.'}
                  crossOrigin="anonymous"
                  className="max-h-14 max-w-[210px] w-auto h-auto object-contain object-left"
                  fallback={
                    <img
                      src={DEFAULT_OLMO_MAIN_LOGO.dataUrl}
                      alt="OLMO B.N."
                      crossOrigin="anonymous"
                      className="max-h-14 max-w-[210px] w-auto h-auto object-contain object-left"
                    />
                  }
                />
              </div>

              {companyHeaderLines.length > 0 && (
                <div className="mt-2.5 w-full max-w-none space-y-0.5 text-[11.5px] leading-relaxed text-zinc-600">
                  {companyHeaderLines.map((line, idx) => (
                    <p
                      key={idx}
                      className={`w-full max-w-none break-words ${
                        idx === 0 && data.company.razonSocial.trim()
                          ? 'font-medium text-zinc-800'
                          : ''
                      }`}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Caja Consecutivo */}
            <div className="min-w-[210px] shrink-0 rounded border border-[#E5E4DF] bg-[#FAF9F6] px-4 py-3 text-right sm:text-center">
              <div className="text-[10px] font-semibold tracking-wider text-zinc-500">
                PROFORMA DE COTIZACIÓN
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                {isProformaDraft(data)
                  ? formatProformaNumberLabel(data).toUpperCase()
                  : `Nº ${data.consecutivo}`}
              </div>
              <div className="mt-2.5 space-y-1 border-t border-[#E5E4DF] pt-2 text-left text-[11px] text-zinc-600">
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-500">Fecha:</span>
                  <span className="font-medium text-zinc-800 tabular-nums">
                    {formatDateSpanish(data.clientProject.fecha)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-500">Validez:</span>
                  <span className="font-medium text-zinc-800">
                    {data.clientProject.validez || '15 Días'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-500">Moneda:</span>
                  <span className="font-medium text-zinc-800">
                    {data.clientProject.moneda}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Datos del Cliente y Proyecto */}
          <div className="mt-6">
            <h2 className="mb-2 text-[11px] font-bold tracking-wider text-zinc-900">
              DATOS DEL CLIENTE Y PROYECTO
            </h2>
            <div className="grid grid-cols-1 border border-[#E5E4DF] text-[12px] sm:grid-cols-2">
              <div className="divide-y divide-[#E5E4DF] sm:border-r sm:border-[#E5E4DF]">
                <div className="grid grid-cols-[105px_1fr]">
                  <div className="bg-[#FAF9F6] px-3 py-1.5 font-semibold text-zinc-600">
                    Cliente
                  </div>
                  <div className="px-3 py-1.5 font-medium text-zinc-900">
                    {data.clientProject.cliente || '—'}
                  </div>
                </div>
                <div className="grid grid-cols-[105px_1fr]">
                  <div className="bg-[#FAF9F6] px-3 py-1.5 font-semibold text-zinc-600">
                    Contacto
                  </div>
                  <div className="px-3 py-1.5 text-zinc-800">
                    {data.clientProject.contacto || '—'}
                  </div>
                </div>
                <div className="grid grid-cols-[105px_1fr]">
                  <div className="bg-[#FAF9F6] px-3 py-1.5 font-semibold text-zinc-600">
                    Teléfono
                  </div>
                  <div className="px-3 py-1.5 text-zinc-800 break-words">
                    {data.clientProject.telefono || '—'}
                  </div>
                </div>
                <div className="grid grid-cols-[105px_1fr]">
                  <div className="bg-[#FAF9F6] px-3 py-1.5 font-semibold text-zinc-600">
                    Correo
                  </div>
                  <div className="px-3 py-1.5 text-zinc-800 break-words">
                    {data.clientProject.correo || '—'}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-[#E5E4DF] border-t border-[#E5E4DF] sm:border-t-0">
                <div className="grid grid-cols-[105px_1fr]">
                  <div className="bg-[#FAF9F6] px-3 py-1.5 font-semibold text-zinc-600">
                    Proyecto
                  </div>
                  <div className="px-3 py-1.5 font-medium text-zinc-900">
                    {data.clientProject.proyecto || '—'}
                  </div>
                </div>
                <div className="grid grid-cols-[105px_1fr]">
                  <div className="bg-[#FAF9F6] px-3 py-1.5 font-semibold text-zinc-600">
                    Ubicación
                  </div>
                  <div className="px-3 py-1.5 text-zinc-800">
                    {data.clientProject.ubicacion || '—'}
                  </div>
                </div>
                <div className="grid grid-cols-[105px_1fr]">
                  <div className="bg-[#FAF9F6] px-3 py-1.5 font-semibold text-zinc-600">
                    Fecha
                  </div>
                  <div className="px-3 py-1.5 text-zinc-800 tabular-nums">
                    {formatDateSpanish(data.clientProject.fecha)}
                  </div>
                </div>
                <div className="grid grid-cols-[105px_1fr]">
                  <div className="bg-[#FAF9F6] px-3 py-1.5 font-semibold text-zinc-600">
                    Validez
                  </div>
                  <div className="px-3 py-1.5 text-zinc-800">
                    {data.clientProject.validez || '15 Días'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de Productos según Tipo de Proforma */}
          <div className="mt-6">
            <h2 className="mb-2 text-[11px] font-bold tracking-wider text-zinc-900">
              {typeMeta.detailHeading}
            </h2>
            <div className="overflow-hidden border border-[#E5E4DF]">
              {proformaType === 'griferia' ? (
                <table className="w-full table-fixed border-collapse text-left text-[12px]">
                  <colgroup>
                    <col style={{ width: `${colWidths.indexPct}%` }} />
                    <col style={{ width: `${colWidths.productoPct}%` }} />
                    <col style={{ width: `${colWidths.imagenPct}%` }} />
                    <col style={{ width: `${colWidths.descripcionPct}%` }} />
                    <col style={{ width: `${colWidths.cantidadPct}%` }} />
                    <col style={{ width: `${colWidths.valorPct}%` }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#27272a] text-[10.5px] font-semibold tracking-wide text-white">
                      <th className="px-2 py-2.5 text-center">#</th>
                      <th className="px-2.5 py-2.5">CÓDIGO PRODUCTO</th>
                      <th className="px-2 py-2.5 text-center">IMAGEN</th>
                      <th className="px-2.5 py-2.5">DESCRIPCIÓN</th>
                      <th className="px-2 py-2.5 text-right">CANTIDAD</th>
                      <th className="px-2.5 py-2.5 text-right">VALOR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E4DF]">
                    {data.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-xs text-zinc-500"
                        >
                          Agrega al menos una línea de producto desde el editor.
                        </td>
                      </tr>
                    ) : (
                      data.items.map((item, idx) => (
                        <tr
                          key={item.id}
                          className="proforma-row align-top bg-white"
                        >
                          <td className="px-2 py-3 text-center font-mono text-[11px] text-zinc-500 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="px-2.5 py-3 font-semibold text-zinc-900 break-words">
                            {item.producto || '—'}
                          </td>
                          <td className="px-2 py-2 text-center align-middle">
                            {item.imagen?.trim() ? (
                              <ResilientImage
                                src={item.imagen.trim()}
                                alt={item.producto || 'Producto'}
                                className="mx-auto max-h-14 max-w-full w-auto h-auto object-contain"
                              />
                            ) : null}
                          </td>
                          <td className="px-2.5 py-3 text-[11.5px] leading-relaxed text-zinc-700 whitespace-pre-line break-words">
                            {item.descripcion || '—'}
                          </td>
                          <td className="px-2 py-3 text-right font-mono text-[11.5px] text-zinc-800 tabular-nums break-words">
                            {item.cantidad} {item.unidad || 'und(s)'}
                          </td>
                          <td className="px-2.5 py-3 text-right font-mono text-[12px] font-semibold text-zinc-900 tabular-nums break-words">
                            {formatMoney(item.valor, data.clientProject.moneda)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : proformaType === 'cielos_pisos' ? (
                <table className="w-full table-fixed border-collapse text-left text-[12px]">
                  <colgroup>
                    <col style={{ width: `${colWidths.indexPct}%` }} />
                    <col style={{ width: `${colWidths.productoPct}%` }} />
                    <col style={{ width: `${colWidths.descripcionPct}%` }} />
                    <col style={{ width: `${colWidths.cantidadPct}%` }} />
                    <col style={{ width: `${colWidths.valorUnitarioPct}%` }} />
                    <col style={{ width: `${colWidths.valorPct}%` }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#27272a] text-[10.5px] font-semibold tracking-wide text-white">
                      <th className="px-2 py-2.5 text-center">#</th>
                      <th className="px-2.5 py-2.5">ESPACIO</th>
                      <th className="px-2.5 py-2.5">ACABADO</th>
                      <th className="px-2 py-2.5 text-right">
                        CANTIDAD (m²)
                      </th>
                      <th className="px-2 py-2.5 text-right">
                        VALOR UNITARIO
                      </th>
                      <th className="px-2.5 py-2.5 text-right">
                        VALOR ({currencyCode})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E4DF]">
                    {data.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-xs text-zinc-500"
                        >
                          Agrega al menos una línea desde el editor.
                        </td>
                      </tr>
                    ) : (
                      data.items.map((item, idx) => (
                        <tr
                          key={item.id}
                          className="proforma-row align-top bg-white"
                        >
                          <td className="px-2 py-3 text-center font-mono text-[11px] text-zinc-500 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="px-2.5 py-3 font-semibold text-zinc-900 break-words">
                            {item.producto || '—'}
                          </td>
                          <td className="px-2.5 py-3 text-[11.5px] leading-relaxed text-zinc-700 whitespace-pre-line break-words">
                            {item.descripcion || '—'}
                          </td>
                          <td className="px-2 py-3 text-right font-mono text-[11.5px] text-zinc-800 tabular-nums break-words">
                            {item.cantidad} m²
                          </td>
                          <td className="px-2 py-3 text-right font-mono text-[11.5px] text-zinc-800 tabular-nums break-words">
                            {formatMoney(
                              item.valorUnitario ?? 0,
                              data.clientProject.moneda
                            )}
                          </td>
                          <td className="px-2.5 py-3 text-right font-mono text-[12px] font-semibold text-zinc-900 tabular-nums break-words">
                            {formatMoney(item.valor, data.clientProject.moneda)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full table-fixed border-collapse text-left text-[12px]">
                  <colgroup>
                    <col style={{ width: `${colWidths.indexPct}%` }} />
                    <col style={{ width: `${colWidths.productoPct}%` }} />
                    <col style={{ width: `${colWidths.descripcionPct}%` }} />
                    <col style={{ width: `${colWidths.cantidadPct}%` }} />
                    <col style={{ width: `${colWidths.valorPct}%` }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#27272a] text-[10.5px] font-semibold tracking-wide text-white">
                      <th className="px-2 py-2.5 text-center">#</th>
                      <th className="px-2.5 py-2.5">PRODUCTO</th>
                      <th className="px-3 py-2.5">
                        {proformaType === 'puertas'
                          ? 'DESCRIPCIÓN DEL PRODUCTO'
                          : 'DESCRIPCIÓN'}
                      </th>
                      <th className="px-2.5 py-2.5 text-right">CANTIDAD</th>
                      <th className="px-2.5 py-2.5 text-right">VALOR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E4DF]">
                    {data.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-xs text-zinc-500"
                        >
                          Agrega al menos una línea de producto desde el editor.
                        </td>
                      </tr>
                    ) : (
                      data.items.map((item, idx) => (
                        <tr
                          key={item.id}
                          className="proforma-row align-top bg-white"
                        >
                          <td className="px-2 py-3 text-center font-mono text-[11px] text-zinc-500 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="px-2.5 py-3 font-semibold text-zinc-900 break-words">
                            {item.producto || '—'}
                          </td>
                          <td className="px-3 py-3 text-[11.5px] leading-relaxed text-zinc-700 whitespace-pre-line break-words">
                            {item.descripcion || '—'}
                          </td>
                          <td className="px-2.5 py-3 text-right font-mono text-[11.5px] text-zinc-800 tabular-nums break-words">
                            {item.cantidad} {item.unidad || 'und(s)'}
                          </td>
                          <td className="px-2.5 py-3 text-right font-mono text-[12px] font-semibold text-zinc-900 tabular-nums break-words">
                            {formatMoney(item.valor, data.clientProject.moneda)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Resumen de Unidades y Totales */}
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="rounded border border-[#E5E4DF] bg-[#FAF9F6] p-4 text-[12px]">
              <div className="text-[10px] font-bold tracking-wider text-zinc-500">
                RESUMEN DE CANTIDADES Y MONEDA
              </div>
              <div className="mt-2.5 flex items-center justify-between border-b border-[#E5E4DF] pb-2">
                <span className="text-zinc-600">
                  {proformaType === 'cielos_pisos'
                    ? 'Total de m²:'
                    : 'Total de unidades:'}
                </span>
                <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                  {totals.unidadResumen}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
                <div className="flex justify-between">
                  <span>Moneda de cotización:</span>
                  <span className="font-medium text-zinc-800">
                    {data.clientProject.moneda}
                  </span>
                </div>
              </div>
            </div>

            <div className="border border-[#E5E4DF] text-[12.5px]">
              <div className="flex items-center justify-between border-b border-[#E5E4DF] px-4 py-2.5">
                <span className="text-zinc-600">Valor de Producto</span>
                <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                  {formatMoney(totals.subtotal, data.clientProject.moneda)}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#E5E4DF] px-4 py-2.5">
                <span className="text-zinc-600">
                  Impuesto de Venta ({data.taxRate}%)
                </span>
                <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                  {formatMoney(totals.impuesto, data.clientProject.moneda)}
                </span>
              </div>
              <div className="flex items-center justify-between bg-[#27272a] px-4 py-3 text-white">
                <span className="font-semibold tracking-wide">
                  TOTAL ({data.clientProject.moneda})
                </span>
                <span className="font-mono text-base font-bold tabular-nums">
                  {formatMoney(totals.total, data.clientProject.moneda)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pie Página 1 */}
        <footer className="mt-8 border-t border-[#E5E4DF] pt-3 text-[10.5px] text-zinc-500">
          {activeFooterLogos.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-5">
              {activeFooterLogos.map((logo) => (
                <div
                  key={logo.id}
                  className="flex h-8 max-w-[125px] items-center"
                >
                  <ResilientImage
                    src={logo.dataUrl}
                    alt={logo.name || 'Logo aliado'}
                    crossOrigin="anonymous"
                    className="max-h-8 max-w-[125px] w-auto h-auto object-contain object-left"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-4">
            <span className="font-mono tabular-nums whitespace-nowrap">
              {`Proforma ${formatProformaNumberLabel(data)}`} · Página 1 de{' '}
              {totalPages}
            </span>
          </div>
        </footer>
      </SheetTag>
    );
  };

  const renderVisualRefsSheet = (
    pageRefs: VisualReferenceItem[][],
    pageIdx: number,
    isThumbnail = false
  ) => {
    const pageNum = 2 + pageIdx;
    const SheetTag = isThumbnail ? 'div' : 'article';
    const allowInteractive = canEditVisualRefs && !isThumbnail;

    return (
      <SheetTag
        key={isThumbnail ? `thumb-refs-${pageIdx}` : `refs-page-${pageIdx}`}
        id={isThumbnail ? undefined : `${idPrefix}proforma-page-refs-${pageIdx}`}
        className={sheetClassName(isThumbnail)}
      >
        <div>
          {/* Encabezado Continuación */}
          <div className="flex items-center justify-between border-b border-[#E5E4DF] pb-3 text-[11px]">
            <div className="flex items-center gap-2.5">
              <ResilientImage
                src={effectiveMainLogo.dataUrl}
                alt={effectiveMainLogo.name || 'OLMO B.N.'}
                crossOrigin="anonymous"
                className="max-h-5 max-w-[80px] w-auto h-auto object-contain"
                fallback={
                  <img
                    src={DEFAULT_OLMO_MAIN_LOGO.dataUrl}
                    alt="OLMO B.N."
                    crossOrigin="anonymous"
                    className="max-h-5 max-w-[80px] w-auto h-auto object-contain"
                  />
                }
              />
              <span className="text-zinc-300">·</span>
              <span className="text-zinc-500">
                {pageIdx === 0
                  ? 'Referencias Visuales'
                  : 'Referencias Visuales (cont.)'}
              </span>
            </div>
            <span className="font-mono font-semibold text-zinc-900 tabular-nums">
              {`PROFORMA ${formatProformaNumberLabel(data).toUpperCase()}`}
            </span>
          </div>

          <section className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-block border-b-2 border-[#8C5A32] pb-1 text-[12px] font-bold tracking-wider text-zinc-900">
                {pageIdx === 0
                  ? 'REFERENCIAS VISUALES'
                  : 'REFERENCIAS VISUALES (CONTINUACIÓN)'}
              </h2>
              {allowInteractive && (
                <span className="no-print text-[10.5px] text-zinc-500">
                  Usa la esquina superior izquierda para ordenar o la inferior derecha para ajustar tamaño
                </span>
              )}
            </div>

            <div className="mt-5 space-y-4 overflow-hidden">
              {pageRefs.map((row, rowIdx) => {
                const totalRowPct = row.reduce(
                  (acc, r) => acc + getVisualReferenceWidthPct(r),
                  0
                );

                return (
                  <div
                    key={`refs-row-${pageIdx}-${rowIdx}`}
                    className="flex flex-wrap items-start gap-4 overflow-hidden"
                  >
                    {row.map((ref) => {
                      const cleanCaption = ref.caption.trim();
                      const itemSize = normalizeVisualReferenceSize(ref.size);
                      const rawPct = getVisualReferenceWidthPct(ref);
                      const effectivePct =
                        totalRowPct > 100
                          ? (rawPct / totalRowPct) * 100
                          : rawPct;
                      const gapDeductionPx =
                        row.length > 1
                          ? (16 * (row.length - 1) * effectivePct) / 100
                          : 0;
                      const widthStyle =
                        row.length === 1 && effectivePct >= 99.5
                          ? '100%'
                          : `calc(${effectivePct.toFixed(3)}% - ${gapDeductionPx.toFixed(2)}px)`;
                      const boxHeightPx = getVisualReferenceBoxHeightPx(ref);

                      const isInteractive =
                        allowInteractive &&
                        Boolean(onReorderVisualReferences) &&
                        Boolean(onChangeVisualReferenceSize);
                      const isDragging = !isThumbnail && draggedRefId === ref.id;
                      const isDropTarget =
                        !isThumbnail &&
                        dragOverRefId === ref.id &&
                        draggedRefId !== ref.id;
                      const isResizing = !isThumbnail && resizingRefId === ref.id;

                      return (
                        <figure
                          key={ref.id}
                          style={{
                            flex: `0 0 ${widthStyle}`,
                            maxWidth: widthStyle,
                          }}
                          onDragOver={
                            isInteractive
                              ? (e) => {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                  if (dragOverRefId !== ref.id) {
                                    setDragOverRefId(ref.id);
                                  }
                                }
                              : undefined
                          }
                          onDragLeave={
                            isInteractive
                              ? () => {
                                  if (dragOverRefId === ref.id) {
                                    setDragOverRefId(null);
                                  }
                                }
                              : undefined
                          }
                          onDrop={
                            isInteractive
                              ? (e) => {
                                  e.preventDefault();
                                  const fromId =
                                    draggedRefId ||
                                    e.dataTransfer.getData('text/plain');
                                  if (fromId) {
                                    onReorderVisualReferences?.(fromId, ref.id);
                                  }
                                  setDraggedRefId(null);
                                  setDragOverRefId(null);
                                }
                              : undefined
                          }
                          className={`proforma-row group relative flex min-w-0 flex-col overflow-hidden border bg-white transition-all ${
                            isDropTarget || isResizing
                              ? 'border-[#8C5A32] ring-2 ring-[#8C5A32]/35'
                              : 'border-[#E5E4DF]'
                          } ${isDragging ? 'opacity-45' : ''}`}
                        >
                          {isInteractive && (
                            <div className="no-print flex items-center justify-between gap-1 border-b border-[#ECEAE3] bg-[#FAF9F6] px-2 py-1 text-[10px] text-zinc-600">
                              <span
                                draggable
                                onDragStart={(e) => {
                                  setDraggedRefId(ref.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', ref.id);
                                  const figureEl =
                                    e.currentTarget.closest('figure');
                                  if (
                                    figureEl &&
                                    typeof e.dataTransfer.setDragImage ===
                                      'function'
                                  ) {
                                    e.dataTransfer.setDragImage(figureEl, 24, 16);
                                  }
                                }}
                                onDragEnd={() => {
                                  setDraggedRefId(null);
                                  setDragOverRefId(null);
                                }}
                                title="Arrastra desde aquí para ordenar"
                                className="inline-flex cursor-grab items-center gap-1 rounded px-1 py-0.5 font-medium hover:bg-zinc-200/60 active:cursor-grabbing select-none"
                              >
                                <GripVertical
                                  className="h-3 w-3 text-zinc-400"
                                  aria-hidden="true"
                                />
                                <span>Arrastra</span>
                              </span>
                              <div className="inline-flex items-center gap-0.5 rounded border border-[#DCDAD3] bg-white p-0.5">
                                {(
                                  [
                                    {
                                      val: 'small' as VisualReferenceSize,
                                      short: 'P',
                                      title: 'Pequeño (hasta 3/fila)',
                                    },
                                    {
                                      val: 'medium' as VisualReferenceSize,
                                      short: 'M',
                                      title: 'Mediano (hasta 2/fila)',
                                    },
                                    {
                                      val: 'large' as VisualReferenceSize,
                                      short: 'G',
                                      title: 'Grande (1/fila · expandido)',
                                    },
                                  ] as const
                                ).map((opt) => (
                                  <button
                                    key={opt.val}
                                    type="button"
                                    title={opt.title}
                                    onClick={() =>
                                      onChangeVisualReferenceSize?.(
                                        ref.id,
                                        opt.val
                                      )
                                    }
                                    className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold cursor-pointer ${
                                      itemSize === opt.val &&
                                      ref.customWidthPct === undefined &&
                                      ref.customHeightPx === undefined
                                        ? 'bg-zinc-900 text-white'
                                        : 'text-zinc-500 hover:text-zinc-900'
                                    }`}
                                  >
                                    {opt.short}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div
                            style={{ height: `${boxHeightPx}px` }}
                            className="relative flex items-center justify-center overflow-hidden bg-[#FAF9F6] p-3"
                          >
                            <VisualRefImageFrame
                              item={ref}
                              alt={
                                cleanCaption || ref.name || 'Referencia visual'
                              }
                            />
                            {isInteractive && onUpdateVisualReference && (
                              <button
                                type="button"
                                onPointerDown={(e) => startResizeVisualRef(ref, e)}
                                title={`Arrastra para ajustar ancho (${Math.round(rawPct)}%) y alto (${boxHeightPx}px) dentro del área de impresión`}
                                aria-label="Ajustar tamaño de referencia visual"
                                className="no-print absolute right-1 bottom-1 flex h-5 w-5 items-center justify-center rounded border border-[#DCDAD3] bg-white/90 text-zinc-500 opacity-0 shadow-2xs transition-opacity group-hover:opacity-100 hover:text-zinc-900 cursor-nwse-resize"
                              >
                                <Maximize2 className="h-3 w-3 rotate-90" />
                              </button>
                            )}
                          </div>
                          {cleanCaption ? (
                            <figcaption className="select-text border-t border-[#E5E4DF] bg-white px-3.5 py-2 text-[11.5px] leading-snug text-zinc-800 break-words">
                              {cleanCaption}
                            </figcaption>
                          ) : null}
                        </figure>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="mt-8 border-t border-[#E5E4DF] pt-3 text-[10.5px] text-zinc-500">
          {activeFooterLogos.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-5">
              {activeFooterLogos.map((logo) => (
                <div
                  key={logo.id}
                  className="flex h-8 max-w-[125px] items-center"
                >
                  <ResilientImage
                    src={logo.dataUrl}
                    alt={logo.name || 'Logo aliado'}
                    crossOrigin="anonymous"
                    className="max-h-8 max-w-[125px] w-auto h-auto object-contain object-left"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-4">
            <span className="font-mono tabular-nums whitespace-nowrap">
              {`Proforma ${formatProformaNumberLabel(data)}`} · Página{' '}
              {pageNum} de {totalPages}
            </span>
          </div>
        </footer>
      </SheetTag>
    );
  };

  const renderTermsSheet = (isThumbnail = false) => {
    const SheetTag = isThumbnail ? 'div' : 'article';
    return (
      <SheetTag
        id={isThumbnail ? undefined : `${idPrefix}proforma-page-2`}
        className={sheetClassName(isThumbnail)}
      >
        <div>
          {/* Encabezado Continuación */}
          <div className="flex items-center justify-between border-b border-[#E5E4DF] pb-3 text-[11px]">
            <div className="flex items-center gap-2.5">
              <ResilientImage
                src={effectiveMainLogo.dataUrl}
                alt={effectiveMainLogo.name || 'OLMO B.N.'}
                crossOrigin="anonymous"
                className="max-h-5 max-w-[80px] w-auto h-auto object-contain"
                fallback={
                  <img
                    src={DEFAULT_OLMO_MAIN_LOGO.dataUrl}
                    alt="OLMO B.N."
                    crossOrigin="anonymous"
                    className="max-h-5 max-w-[80px] w-auto h-auto object-contain"
                  />
                }
              />
              <span className="text-zinc-300">·</span>
              <span className="text-zinc-500">
                Términos, Condiciones y Especificaciones Técnicas
              </span>
            </div>
            <span className="font-mono font-semibold text-zinc-900 tabular-nums">
              {`PROFORMA ${formatProformaNumberLabel(data).toUpperCase()}`}
            </span>
          </div>

          {/* Términos y Condiciones */}
          <section className="mt-6 w-full max-w-none">
            <h2 className="inline-block border-b-2 border-[#8C5A32] pb-1 text-[12px] font-bold tracking-wider text-zinc-900">
              TÉRMINOS Y CONDICIONES
            </h2>
            <div className="mt-3 w-full max-w-none space-y-2.5 text-[11.5px] leading-relaxed text-zinc-700 whitespace-pre-line break-words">
              {normalizeSpreadsheetParagraphs(data.terminosCondiciones)}
            </div>
          </section>

          {/* Especificaciones Técnicas */}
          <section className="mt-7 w-full max-w-none">
            <h2 className="inline-block border-b-2 border-[#8C5A32] pb-1 text-[12px] font-bold tracking-wider text-zinc-900">
              ESPECIFICACIONES TÉCNICAS GENERALES Y ACABADOS DE MOBILIARIO
            </h2>
            <div className="mt-3.5 w-full max-w-none space-y-4">
              {data.specBlocks.map((block) => (
                <div
                  key={block.id}
                  className="proforma-row w-full max-w-none border border-[#E5E4DF]"
                >
                  <div className="border-b border-[#E5E4DF] bg-[#FAF9F6] px-4 py-2">
                    <h3 className="text-[11.5px] font-bold text-zinc-900">
                      {block.titulo}
                    </h3>
                    {block.subtitulo && (
                      <p className="text-[10.5px] text-zinc-500">
                        {block.subtitulo}
                      </p>
                    )}
                  </div>
                  <div className="w-full max-w-none px-4 py-3 text-[11px] leading-relaxed text-zinc-700 whitespace-pre-line break-words">
                    {normalizeSpreadsheetParagraphs(block.contenido)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Pie Página 2 */}
        <footer className="mt-8 border-t border-[#E5E4DF] pt-3 text-[10.5px] text-zinc-500">
          {activeFooterLogos.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-5">
              {activeFooterLogos.map((logo) => (
                <div
                  key={logo.id}
                  className="flex h-8 max-w-[125px] items-center"
                >
                  <ResilientImage
                    src={logo.dataUrl}
                    alt={logo.name || 'Logo aliado'}
                    crossOrigin="anonymous"
                    className="max-h-8 max-w-[125px] w-auto h-auto object-contain object-left"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-4">
            <span className="font-mono tabular-nums whitespace-nowrap">
              {`Proforma ${formatProformaNumberLabel(data)}`} · Página{' '}
              {termsPageNumber} de {totalPages}
            </span>
          </div>
        </footer>
      </SheetTag>
    );
  };

  const renderBankSheet = (isThumbnail = false) => {
    const SheetTag = isThumbnail ? 'div' : 'article';
    return (
      <SheetTag
        id={isThumbnail ? undefined : `${idPrefix}proforma-page-3`}
        className={sheetClassName(isThumbnail)}
      >
        <div className="w-full">
          {/* Encabezado Continuación */}
          <div className="flex items-center justify-between border-b border-[#E5E4DF] pb-3 text-[11px]">
            <div className="flex items-center gap-2.5">
              <ResilientImage
                src={effectiveMainLogo.dataUrl}
                alt={effectiveMainLogo.name || 'OLMO B.N.'}
                crossOrigin="anonymous"
                className="max-h-5 max-w-[80px] w-auto h-auto object-contain"
                fallback={
                  <img
                    src={DEFAULT_OLMO_MAIN_LOGO.dataUrl}
                    alt="OLMO B.N."
                    crossOrigin="anonymous"
                    className="max-h-5 max-w-[80px] w-auto h-auto object-contain"
                  />
                }
              />
              <span className="text-zinc-300">·</span>
              <span className="text-zinc-500">
                Información Bancaria, Desglose de Pagos y Firmas
              </span>
            </div>
            <span className="font-mono font-semibold text-zinc-900 tabular-nums">
              {`PROFORMA ${formatProformaNumberLabel(data).toUpperCase()}`}
            </span>
          </div>

          {/* Cuenta Bancaria */}
          <section className="mt-6">
            <h2 className="inline-block border-b-2 border-[#8C5A32] pb-1 text-[12px] font-bold tracking-wider text-zinc-900">
              CUENTA BANCARIA PARA DEPÓSITOS Y TRANSFERENCIAS
            </h2>
            <div className="mt-3 overflow-hidden border border-[#E5E4DF] text-[12px]">
              <table className="w-full border-collapse">
                <tbody className="divide-y divide-[#E5E4DF]">
                  <tr>
                    <td className="w-48 bg-[#FAF9F6] px-4 py-2.5 font-semibold text-zinc-600">
                      Entidad Bancaria
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-900">
                      {data.bankAccount.entidadBancaria || '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-[#FAF9F6] px-4 py-2.5 font-semibold text-zinc-600">
                      Nombre / Titular
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-900">
                      {data.bankAccount.nombre || '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-[#FAF9F6] px-4 py-2.5 font-semibold text-zinc-600">
                      Cédula Jurídica
                    </td>
                    <td className="px-4 py-2.5 font-mono text-zinc-800 tabular-nums">
                      {data.bankAccount.cedulaJuridica || '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-[#FAF9F6] px-4 py-2.5 font-semibold text-zinc-600">
                      Moneda
                    </td>
                    <td className="px-4 py-2.5 text-zinc-800">
                      {data.bankAccount.moneda || '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-[#FAF9F6] px-4 py-2.5 font-semibold text-zinc-600">
                      Cuenta
                    </td>
                    <td className="px-4 py-2.5 font-mono text-zinc-800 tabular-nums">
                      {data.bankAccount.cuenta || '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-[#FAF9F6] px-4 py-2.5 font-semibold text-zinc-600">
                      Cuenta IBAN
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-zinc-900 tabular-nums">
                      {data.bankAccount.cuentaIban || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Desglose de Pagos */}
          <section className="mt-8">
            <h2 className="inline-block border-b-2 border-[#8C5A32] pb-1 text-[12px] font-bold tracking-wider text-zinc-900">
              DESGLOSE DE PAGOS
            </h2>
            <div className="mt-3 overflow-hidden border border-[#E5E4DF] text-[12px]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#27272a] text-[10.5px] font-semibold tracking-wide text-white">
                    <th className="px-4 py-2.5">CONCEPTO / HITO DE PAGO</th>
                    <th className="w-28 px-4 py-2.5 text-right">PORCENTAJE</th>
                    <th className="w-36 px-4 py-2.5 text-right">MONTO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E4DF]">
                  {displayedPayments.map((row) => (
                    <tr key={row.id} className="bg-white">
                      <td className="px-4 py-3 text-zinc-800">
                        {row.concepto}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-zinc-700 tabular-nums">
                        {row.porcentaje}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-900 tabular-nums">
                        {formatMoney(row.monto, data.clientProject.moneda)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#FAF9F6] font-semibold">
                    <td className="px-4 py-3 text-zinc-900">
                      TOTAL DESGLOSADO
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-900 tabular-nums">
                      {totals.totalPorcentajePagos}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-900 tabular-nums">
                      {formatMoney(
                        totals.paymentRows.reduce((acc, r) => acc + r.monto, 0),
                        data.clientProject.moneda
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Notas finales */}
          {data.notasFinales.trim() && (
            <section className="mt-6 w-full max-w-none rounded border border-[#E5E4DF] bg-[#FAF9F6] px-4 py-3 text-[11.5px] leading-relaxed text-zinc-600 whitespace-pre-line break-words">
              {normalizeSpreadsheetParagraphs(data.notasFinales)}
            </section>
          )}
        </div>

        {/* Bloque de Firmas al pie de la página 3 */}
        <div>
          <section className="mt-12">
            <h2 className="mb-10 text-[11px] font-bold tracking-wider text-zinc-900">
              ACEPTACIÓN DE PROFORMA Y FIRMAS DE CONFORMIDAD
            </h2>
            <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
              <div className="text-center">
                <div className="h-14 border-b border-[#27272a]" />
                <div className="mt-2 text-[11.5px] font-bold tracking-wide text-zinc-900">
                  {data.signatures.representanteTitulo ||
                    'FIRMA REPRESENTANTE OLMO'}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {data.signatures.representanteNombre.trim() ||
                    data.company.razonSocial.trim() ||
                    '\u00A0'}
                </div>
                <div className="mt-1.5 text-[10.5px] text-zinc-400">
                  Fecha: _____ / _____ / ________
                </div>
              </div>

              <div className="text-center">
                <div className="h-14 border-b border-[#27272a]" />
                <div className="mt-2 text-[11.5px] font-bold tracking-wide text-zinc-900">
                  {data.signatures.clienteTitulo || 'FIRMA CLIENTE'}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {data.signatures.clienteNombre.trim() ||
                    data.clientProject.cliente.trim() ||
                    '\u00A0'}
                </div>
                <div className="mt-1.5 text-[10.5px] text-zinc-400">
                  Fecha: _____ / _____ / ________
                </div>
              </div>
            </div>
          </section>

          {/* Pie Página 3 */}
          <footer className="mt-8 border-t border-[#E5E4DF] pt-3 text-[10.5px] text-zinc-500">
            {activeFooterLogos.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-5">
                {activeFooterLogos.map((logo) => (
                  <div
                    key={logo.id}
                    className="flex h-8 max-w-[125px] items-center"
                  >
                    <ResilientImage
                      src={logo.dataUrl}
                      alt={logo.name || 'Logo aliado'}
                      crossOrigin="anonymous"
                      className="max-h-8 max-w-[125px] w-auto h-auto object-contain object-left"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-4">
              <span className="font-mono tabular-nums whitespace-nowrap">
                {`Proforma ${formatProformaNumberLabel(data)}`} · Página{' '}
                {bankPageNumber} de {totalPages}
              </span>
            </div>
          </footer>
        </div>
      </SheetTag>
    );
  };

  return (
    <div className="flex flex-col">
      {!compactReadOnly && (
        <>
          {/* Barra sticky de controles de vista previa */}
          <div className="no-print sticky top-[var(--olmo-workspace-top,155px)] z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E3E1DA] bg-white px-4 py-2.5 shadow-[0_2px_8px_rgba(24,24,27,0.06)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Ir a página:
              </span>
              {navButtons.map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => scrollToPage(btn.id)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showPageThumbnails && activePageId === btn.id
                      ? 'border-[#8C5A32] bg-[#FAF6F1] text-zinc-900 dark:border-[#C68B59] dark:bg-zinc-800 dark:text-zinc-100'
                      : 'border-[#E5E4DF] bg-[#FAF9F6] text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onChangeTableColumnWidths && (
                <button
                  type="button"
                  onClick={() => setShowColumnAdjuster((v) => !v)}
                  title="Ajustar manualmente los anchos de las columnas de la tabla de productos"
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showColumnAdjuster
                      ? 'border-[#8C5A32] bg-[#FAF6F1] text-zinc-900 dark:border-[#C68B59] dark:bg-zinc-800 dark:text-zinc-100'
                      : 'border-[#E5E4DF] bg-[#FAF9F6] text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  <Columns3 className="h-3.5 w-3.5 text-[#8C5A32] dark:text-[#D59B69]" aria-hidden="true" />
                  <span>Columnas</span>
                </button>
              )}

              <PreviewZoomControls
                zoom={zoom / 100}
                defaultZoom={1}
                minZoom={0.5}
                maxZoom={1.5}
                step={0.1}
                contextLabel="Vista previa de proforma"
                onChangeZoom={(next) => setZoom(Math.round(next * 100))}
              />
            </div>
          </div>

          {showColumnAdjuster && onChangeTableColumnWidths && (
            <div className="no-print mb-4 rounded-xl border border-[#E3E1DA] bg-white px-4 py-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECEAE3] pb-2 dark:border-zinc-800">
                <div>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Anchos de columnas ({typeMeta.label})
                  </span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Ajusta la proporción de cada columna; se guarda en la proforma y se refleja en Vista Previa y PDF.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeTableColumnWidths(proformaType, {})}
                  className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Restablecer</span>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {editableColumnKeys.map((colKey) => {
                  const minPct = getColumnMinWidthPct(colKey);
                  const otherMinSum = editableColumnKeys
                    .filter((k) => k !== colKey)
                    .reduce((acc, k) => acc + getColumnMinWidthPct(k), 0);
                  const maxPct = TABLE_EDITABLE_TOTAL_PCT - otherMinSum;
                  const val = colWidths[colKey];
                  const label =
                    COLUMN_LABELS_BY_TYPE[proformaType]?.[colKey] ?? colKey;

                  return (
                    <div
                      key={colKey}
                      className="rounded-md border border-[#ECEAE3] bg-[#FAF9F6] px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/60"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                          {label}
                        </span>
                        <span className="font-mono font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                          {Math.round(val)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={minPct}
                        max={maxPct}
                        step={1}
                        value={val}
                        aria-label={`Ancho de columna ${label}`}
                        onChange={(e) => {
                          const updated = adjustTableColumnWidth(
                            proformaType,
                            data.tableColumnWidthsByType,
                            colKey,
                            Number(e.target.value)
                          );
                          onChangeTableColumnWidths(proformaType, updated);
                        }}
                        className="w-full accent-[#8C5A32]"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {totals.total <= 0 && (
            <div
              role="alert"
              className="no-print mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <span>
                Atención: el total general de esta cotización es {formatMoney(totals.total, data.clientProject.moneda)} (cero o negativo). Revisa los precios antes de exportar el PDF.
              </span>
            </div>
          )}
        </>
      )}

      {/* Contenedor principal de hojas Letter + panel lateral de miniaturas en Vista Previa */}
      <div
        className={
          showPageThumbnails && !compactReadOnly
            ? 'flex items-start justify-center gap-6'
            : ''
        }
      >
        <CtrlWheelZoomBox
          enabled={!compactReadOnly}
          onZoomStep={(dir) =>
            setZoom((prev) =>
              Math.round(
                clampPreviewZoom(prev / 100 + dir * 0.1, 0.5, 1.5) * 100
              )
            )
          }
          className={`${compactReadOnly ? 'no-print' : 'print-only-container overflow-x-auto'} flex flex-col items-center gap-6 ${
            compactReadOnly ? 'pb-2' : 'pb-8'
          } ${showPageThumbnails && !compactReadOnly ? 'min-w-0 flex-1' : 'w-full'}`}
        >
          <div
            className="proforma-preview-zoom-root flex w-full flex-col items-center gap-6"
            style={
              !compactReadOnly && zoom !== 100
                ? { zoom: zoom / 100 }
                : undefined
            }
          >
            {renderPage1Sheet(false)}

            {visualRefPages.map((pageRefs, pageIdx) =>
              renderVisualRefsSheet(pageRefs, pageIdx, false)
            )}

            {renderTermsSheet(false)}

            {renderBankSheet(false)}
          </div>
        </CtrlWheelZoomBox>

        {showPageThumbnails && (
          <aside
            aria-label="Miniaturas de páginas"
            className="no-print hidden lg:flex w-48 shrink-0 flex-col gap-2.5 sticky top-[calc(var(--olmo-workspace-top,155px)+64px)] max-h-[calc(100vh-var(--olmo-workspace-top,155px)-76px)] overflow-y-auto rounded-xl border border-[#E3E1DA] bg-white/95 p-3 shadow-[0_1px_3px_rgba(24,24,27,0.04)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none"
          >
            <div className="flex items-center justify-between border-b border-[#ECEAE3] pb-2 dark:border-zinc-800">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Páginas
              </span>
              <span className="rounded bg-[#FAF6F1] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#8C5A32] tabular-nums dark:bg-zinc-800 dark:text-[#D59B69]">
                {totalPages}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {pageThumbnails.map((thumb) => {
                const isActive = activePageId === thumb.id;
                return (
                  <button
                    key={thumb.id}
                    type="button"
                    onClick={() => scrollToPage(thumb.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-all cursor-pointer ${
                      isActive
                        ? 'border-[#8C5A32] bg-[#FAF6F1] ring-1 ring-[#8C5A32]/30 dark:border-[#C68B59] dark:bg-zinc-800 dark:ring-[#C68B59]/30'
                        : 'border-[#E5E4DF] bg-[#FAF9F6]/70 hover:border-zinc-400 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80'
                    }`}
                  >
                    {/* Miniatura real escalada del contenido de la página */}
                    <div className="relative aspect-[8.5/11] w-full overflow-hidden rounded border border-[#DCDAD3] bg-white shadow-2xs dark:border-zinc-700">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 top-0 w-[816px] origin-top-left select-none"
                        style={{ transform: 'scale(0.189)' }}
                      >
                        {thumb.kind === 'products' && renderPage1Sheet(true)}
                        {thumb.kind === 'refs' &&
                          thumb.pageRefs &&
                          thumb.pageIdx !== undefined &&
                          renderVisualRefsSheet(
                            thumb.pageRefs,
                            thumb.pageIdx,
                            true
                          )}
                        {thumb.kind === 'terms' && renderTermsSheet(true)}
                        {thumb.kind === 'bank' && renderBankSheet(true)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1 px-0.5">
                      <span className="truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                        {thumb.shortTitle}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">
                        P.{thumb.pageNumber}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
