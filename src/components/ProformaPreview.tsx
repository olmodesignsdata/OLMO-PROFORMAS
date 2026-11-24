import { Printer } from 'lucide-react';
import { useState } from 'react';
import {
  DEFAULT_OLMO_MAIN_LOGO,
  getProformaTypeMeta,
} from '../data/defaults';
import {
  ComputedTotals,
  LogoAsset,
  ProformaData,
  VisualReferenceItem,
} from '../types/proforma';
import {
  formatDateSpanish,
  formatMoney,
  getCurrencyCode,
} from '../utils/formatters';
import { ResilientImage } from './ResilientImage';

interface ProformaPreviewProps {
  data: ProformaData;
  totals: ComputedTotals;
  mainLogo: LogoAsset;
  footerLogos: Array<LogoAsset | null>;
}

const REFS_PER_PAGE = 4;

export function ProformaPreview({
  data,
  totals,
  mainLogo,
  footerLogos,
}: ProformaPreviewProps) {
  const [zoom, setZoom] = useState<number>(100);

  const proformaType = data.proformaType ?? 'mobiliario';
  const typeMeta = getProformaTypeMeta(proformaType);
  const currencyCode = getCurrencyCode(data.clientProject.moneda);

  const effectiveMainLogo = mainLogo?.dataUrl ? mainLogo : DEFAULT_OLMO_MAIN_LOGO;
  const activeFooterLogos = footerLogos.filter(
    (logo): logo is LogoAsset => logo !== null && Boolean(logo.dataUrl)
  );

  const loadedVisualRefs = (data.visualReferences ?? []).filter((ref) =>
    Boolean(ref.imageDataUrl?.trim())
  );
  const visualRefPages: VisualReferenceItem[][] = [];
  for (let i = 0; i < loadedVisualRefs.length; i += REFS_PER_PAGE) {
    visualRefPages.push(loadedVisualRefs.slice(i, i + REFS_PER_PAGE));
  }

  const totalPages = 3 + visualRefPages.length;
  const termsPageNumber = 2 + visualRefPages.length;
  const bankPageNumber = 3 + visualRefPages.length;

  const activePayments = totals.paymentRows.filter((p) => p.porcentaje > 0);
  const displayedPayments =
    activePayments.length > 0 ? activePayments : totals.paymentRows;

  const scrollToPage = (pageId: string) => {
    const el = document.getElementById(pageId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const navButtons = [
    { id: 'proforma-page-1', label: 'Pág. 1 · Productos' },
    ...(visualRefPages.length > 0
      ? [{ id: 'proforma-page-refs-0', label: 'Pág. 2 · Referencias' }]
      : []),
    { id: 'proforma-page-2', label: `Pág. ${termsPageNumber} · Términos` },
    {
      id: 'proforma-page-3',
      label: `Pág. ${bankPageNumber} · Banco y Firmas`,
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Barra de controles de vista previa */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E3E1DA] bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(24,24,27,0.04)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Ir a página:
          </span>
          {navButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => scrollToPage(btn.id)}
              className="rounded-md border border-[#E5E4DF] bg-[#FAF9F6] px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            {[80, 90, 100].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setZoom(val)}
                className={`rounded px-2 py-1 font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                  zoom === val
                    ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {val}%
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E4DF] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Contenedor de hojas Letter */}
      <div className="print-only-container flex flex-col items-center gap-6 pb-8">
        <div
          className="flex w-full flex-col items-center gap-6 origin-top transition-transform duration-150"
          style={
            zoom !== 100
              ? {
                  transform: `scale(${zoom / 100})`,
                  marginBottom: `${(zoom - 100) * 18}px`,
                }
              : undefined
          }
        >
          {/* ================================================================
              PÁGINA 1: ENCABEZADO, CLIENTE/PROYECTO, TABLA Y TOTALES
              ================================================================ */}
          <article
            id="proforma-page-1"
            className="proforma-sheet flex w-full max-w-[816px] min-h-[1056px] flex-col justify-between border border-[#E5E4DF] bg-white p-9 sm:p-11 shadow-xs"
          >
            <div>
              {/* Encabezado Principal */}
              <div className="flex flex-col justify-between gap-6 border-b-2 border-zinc-900 pb-5 sm:flex-row sm:items-start">
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

                  <div className="mt-2.5 space-y-0.5 text-[11.5px] leading-relaxed text-zinc-600">
                    <p className="font-medium text-zinc-800">
                      {data.company.razonSocial}
                    </p>
                    <p>
                      Céd. Jur.: {data.company.cedulaJuridica} · Tel:{' '}
                      {data.company.telefono}
                    </p>
                    <p>
                      {data.company.correo} · {data.company.sitioWeb}
                    </p>
                    <p>{data.company.direccion}</p>
                  </div>
                </div>

                {/* Caja Consecutivo */}
                <div className="min-w-[210px] shrink-0 rounded border border-[#E5E4DF] bg-[#FAF9F6] px-4 py-3 text-right sm:text-center">
                  <div className="text-[10px] font-semibold tracking-wider text-zinc-500">
                    PROFORMA DE COTIZACIÓN
                  </div>
                  <div className="mt-1 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                    Nº {data.consecutivo}
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
                    <table className="w-full border-collapse text-left text-[12px]">
                      <thead>
                        <tr className="bg-zinc-900 text-[10.5px] font-semibold tracking-wide text-white">
                          <th className="w-10 px-2 py-2.5 text-center">#</th>
                          <th className="w-32 px-2.5 py-2.5">CÓDIGO PRODUCTO</th>
                          <th className="w-20 px-2 py-2.5 text-center">IMAGEN</th>
                          <th className="px-2.5 py-2.5">DESCRIPCIÓN</th>
                          <th className="w-20 px-2.5 py-2.5 text-right">CANTIDAD</th>
                          <th className="w-28 px-2.5 py-2.5 text-right">VALOR</th>
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
                              <td className="px-2.5 py-3 font-semibold text-zinc-900">
                                {item.producto || '—'}
                              </td>
                              <td className="px-2 py-2 text-center align-middle">
                                {item.imagen?.trim() ? (
                                  <ResilientImage
                                    src={item.imagen.trim()}
                                    alt={item.producto || 'Producto'}
                                    className="mx-auto max-h-14 max-w-[68px] w-auto h-auto object-contain"
                                  />
                                ) : null}
                              </td>
                              <td className="px-2.5 py-3 text-[11.5px] leading-relaxed text-zinc-700 whitespace-pre-line">
                                {item.descripcion || '—'}
                              </td>
                              <td className="px-2.5 py-3 text-right font-mono text-[11.5px] text-zinc-800 whitespace-nowrap tabular-nums">
                                {item.cantidad} {item.unidad || 'und(s)'}
                              </td>
                              <td className="px-2.5 py-3 text-right font-mono text-[12px] font-semibold text-zinc-900 whitespace-nowrap tabular-nums">
                                {formatMoney(item.valor, data.clientProject.moneda)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : proformaType === 'cielos_pisos' ? (
                    <table className="w-full border-collapse text-left text-[12px]">
                      <thead>
                        <tr className="bg-zinc-900 text-[10.5px] font-semibold tracking-wide text-white">
                          <th className="w-10 px-2 py-2.5 text-center">#</th>
                          <th className="w-36 px-2.5 py-2.5">ESPACIO</th>
                          <th className="px-2.5 py-2.5">ACABADO</th>
                          <th className="w-24 px-2.5 py-2.5 text-right">
                            CANTIDAD (m²)
                          </th>
                          <th className="w-26 px-2.5 py-2.5 text-right">
                            VALOR UNITARIO
                          </th>
                          <th className="w-28 px-2.5 py-2.5 text-right">
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
                              <td className="px-2.5 py-3 font-semibold text-zinc-900">
                                {item.producto || '—'}
                              </td>
                              <td className="px-2.5 py-3 text-[11.5px] leading-relaxed text-zinc-700 whitespace-pre-line">
                                {item.descripcion || '—'}
                              </td>
                              <td className="px-2.5 py-3 text-right font-mono text-[11.5px] text-zinc-800 whitespace-nowrap tabular-nums">
                                {item.cantidad} m²
                              </td>
                              <td className="px-2.5 py-3 text-right font-mono text-[11.5px] text-zinc-800 whitespace-nowrap tabular-nums">
                                {formatMoney(
                                  item.valorUnitario ?? 0,
                                  data.clientProject.moneda
                                )}
                              </td>
                              <td className="px-2.5 py-3 text-right font-mono text-[12px] font-semibold text-zinc-900 whitespace-nowrap tabular-nums">
                                {formatMoney(item.valor, data.clientProject.moneda)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full border-collapse text-left text-[12px]">
                      <thead>
                        <tr className="bg-zinc-900 text-[10.5px] font-semibold tracking-wide text-white">
                          <th className="w-10 px-2.5 py-2.5 text-center">#</th>
                          <th className="w-36 px-3 py-2.5">PRODUCTO</th>
                          <th className="px-3 py-2.5">
                            {proformaType === 'puertas'
                              ? 'DESCRIPCIÓN DEL PRODUCTO'
                              : 'DESCRIPCIÓN'}
                          </th>
                          <th className="w-24 px-3 py-2.5 text-right">CANTIDAD</th>
                          <th className="w-28 px-3 py-2.5 text-right">VALOR</th>
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
                              <td className="px-2.5 py-3 text-center font-mono text-[11px] text-zinc-500 tabular-nums">
                                {String(idx + 1).padStart(2, '0')}
                              </td>
                              <td className="px-3 py-3 font-semibold text-zinc-900">
                                {item.producto || '—'}
                              </td>
                              <td className="px-3 py-3 text-[11.5px] leading-relaxed text-zinc-700 whitespace-pre-line">
                                {item.descripcion || '—'}
                              </td>
                              <td className="px-3 py-3 text-right font-mono text-[11.5px] text-zinc-800 whitespace-nowrap tabular-nums">
                                {item.cantidad} {item.unidad || 'und(s)'}
                              </td>
                              <td className="px-3 py-3 text-right font-mono text-[12px] font-semibold text-zinc-900 whitespace-nowrap tabular-nums">
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
                  <div className="flex items-center justify-between bg-zinc-900 px-4 py-3 text-white">
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
              <div className="flex items-center justify-between gap-4">
                <span>
                  {data.company.razonSocial} · {data.company.correo} ·{' '}
                  {data.company.telefono}
                </span>
                <span className="font-mono tabular-nums whitespace-nowrap">
                  Proforma Nº {data.consecutivo} · Página 1 de {totalPages}
                </span>
              </div>
            </footer>
          </article>

          {/* ================================================================
              PÁGINAS OPCIONALES: REFERENCIAS VISUALES (SOLO IMÁGENES CARGADAS)
              ================================================================ */}
          {visualRefPages.map((pageRefs, pageIdx) => {
            const pageNum = 2 + pageIdx;
            return (
              <article
                key={`refs-page-${pageIdx}`}
                id={`proforma-page-refs-${pageIdx}`}
                className="proforma-sheet flex w-full max-w-[816px] min-h-[1056px] flex-col justify-between border border-[#E5E4DF] bg-white p-9 sm:p-11 shadow-xs"
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
                      PROFORMA Nº {data.consecutivo}
                    </span>
                  </div>

                  <section className="mt-6">
                    <h2 className="inline-block border-b-2 border-[#8C5A32] pb-1 text-[12px] font-bold tracking-wider text-zinc-900">
                      {pageIdx === 0
                        ? 'REFERENCIAS VISUALES'
                        : 'REFERENCIAS VISUALES (CONTINUACIÓN)'}
                    </h2>

                    <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                      {pageRefs.map((ref) => {
                        const cleanCaption = ref.caption.trim();
                        return (
                          <figure
                            key={ref.id}
                            className="proforma-row flex flex-col overflow-hidden border border-[#E5E4DF] bg-white"
                          >
                            <div className="flex h-[240px] items-center justify-center bg-[#FAF9F6] p-3">
                              <ResilientImage
                                src={ref.imageDataUrl}
                                alt={
                                  cleanCaption ||
                                  ref.name ||
                                  'Referencia visual'
                                }
                                className="max-h-full max-w-full w-auto h-auto object-contain"
                              />
                            </div>
                            {cleanCaption ? (
                              <figcaption className="border-t border-[#E5E4DF] bg-white px-3.5 py-2.5 text-[11.5px] leading-snug text-zinc-800">
                                {cleanCaption}
                              </figcaption>
                            ) : null}
                          </figure>
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
                  <div className="flex items-center justify-between gap-4">
                    <span>
                      {data.company.razonSocial} · {data.company.correo} ·{' '}
                      {data.company.telefono}
                    </span>
                    <span className="font-mono tabular-nums whitespace-nowrap">
                      Proforma Nº {data.consecutivo} · Página {pageNum} de{' '}
                      {totalPages}
                    </span>
                  </div>
                </footer>
              </article>
            );
          })}

          {/* ================================================================
              PÁGINA TÉRMINOS Y ESPECIFICACIONES TÉCNICAS
              ================================================================ */}
          <article
            id="proforma-page-2"
            className="proforma-sheet flex w-full max-w-[816px] min-h-[1056px] flex-col justify-between border border-[#E5E4DF] bg-white p-9 sm:p-11 shadow-xs"
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
                  PROFORMA Nº {data.consecutivo}
                </span>
              </div>

              {/* Términos y Condiciones */}
              <section className="mt-6">
                <h2 className="inline-block border-b-2 border-[#8C5A32] pb-1 text-[12px] font-bold tracking-wider text-zinc-900">
                  TÉRMINOS Y CONDICIONES
                </h2>
                <div className="mt-3 space-y-2.5 text-[11.5px] leading-relaxed text-zinc-700 whitespace-pre-line">
                  {data.terminosCondiciones}
                </div>
              </section>

              {/* Especificaciones Técnicas */}
              <section className="mt-7">
                <h2 className="inline-block border-b-2 border-[#8C5A32] pb-1 text-[12px] font-bold tracking-wider text-zinc-900">
                  ESPECIFICACIONES TÉCNICAS GENERALES Y ACABADOS DE MOBILIARIO
                </h2>
                <div className="mt-3.5 space-y-4">
                  {data.specBlocks.map((block) => (
                    <div
                      key={block.id}
                      className="proforma-row border border-[#E5E4DF]"
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
                      <div className="px-4 py-3 text-[11px] leading-relaxed text-zinc-700 whitespace-pre-line">
                        {block.contenido}
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
              <div className="flex items-center justify-between gap-4">
                <span>
                  {data.company.razonSocial} · {data.company.correo} ·{' '}
                  {data.company.telefono}
                </span>
                <span className="font-mono tabular-nums whitespace-nowrap">
                  Proforma Nº {data.consecutivo} · Página {termsPageNumber} de{' '}
                  {totalPages}
                </span>
              </div>
            </footer>
          </article>

          {/* ================================================================
              PÁGINA 3: CUENTA BANCARIA, DESGLOSE DE PAGOS Y FIRMAS
              ================================================================ */}
          <article
            id="proforma-page-3"
            className="proforma-sheet flex w-full max-w-[816px] min-h-[1056px] flex-col justify-between border border-[#E5E4DF] bg-white p-9 sm:p-11 shadow-xs"
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
                    Información Bancaria, Desglose de Pagos y Firmas
                  </span>
                </div>
                <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                  PROFORMA Nº {data.consecutivo}
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
                      <tr className="bg-zinc-900 text-[10.5px] font-semibold tracking-wide text-white">
                        <th className="px-4 py-2.5">CONCEPTO / HITO DE PAGO</th>
                        <th className="w-28 px-4 py-2.5 text-right">
                          PORCENTAJE
                        </th>
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
                <section className="mt-6 rounded border border-[#E5E4DF] bg-[#FAF9F6] px-4 py-3 text-[11.5px] leading-relaxed text-zinc-600">
                  {data.notasFinales}
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
                    <div className="h-14 border-b border-zinc-900" />
                    <div className="mt-2 text-[11.5px] font-bold tracking-wide text-zinc-900">
                      {data.signatures.representanteTitulo ||
                        'FIRMA REPRESENTANTE OLMO'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {data.signatures.representanteNombre ||
                        data.company.razonSocial}
                    </div>
                    <div className="mt-1.5 text-[10.5px] text-zinc-400">
                      Fecha: _____ / _____ / ________
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="h-14 border-b border-zinc-900" />
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
                <div className="flex items-center justify-between gap-4">
                  <span>
                    {data.company.razonSocial} · {data.company.correo} ·{' '}
                    {data.company.telefono}
                  </span>
                  <span className="font-mono tabular-nums whitespace-nowrap">
                    Proforma Nº {data.consecutivo} · Página {bankPageNumber} de{' '}
                    {totalPages}
                  </span>
                </div>
              </footer>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
