import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_OLMO_MAIN_LOGO,
  getProformaTypeMeta,
} from '../data/defaults';
import { ComputedTotals, LogoAsset, ProformaData } from '../types/proforma';
import {
  buildPdfFileName,
  formatDateSpanish,
  formatMoney,
  getCurrencyCode,
  normalizeSpreadsheetParagraphs,
} from './formatters';
import {
  rasterizeImageSrcForPdf,
  rasterizeLogoForPdf,
  RasterizedPdfLogo,
} from './logoUtils';

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportProformaToJSON(data: ProformaData, totals: ComputedTotals): void {
  const payload = {
    exportadoEn: new Date().toISOString(),
    proforma: data,
    resumenTotales: totals,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  triggerDownload(
    blob,
    buildPdfFileName(
      data.consecutivo,
      data.clientProject.proyecto,
      'json',
      data.clientProject.cliente
    )
  );
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportProformaToCSV(data: ProformaData, totals: ComputedTotals): void {
  const proformaType = data.proformaType ?? 'mobiliario';
  const typeMeta = getProformaTypeMeta(proformaType);
  const currencyCode = getCurrencyCode(data.clientProject.moneda);

  const itemHeaders =
    proformaType === 'cielos_pisos'
      ? [
          'ÍTEM',
          'ESPACIO',
          'ACABADO',
          'CANTIDAD (m²)',
          'VALOR UNITARIO',
          `VALOR (${currencyCode})`,
        ]
      : proformaType === 'griferia'
        ? [
            'ÍTEM',
            'CÓDIGO PRODUCTO',
            'IMAGEN',
            'DESCRIPCIÓN',
            'CANTIDAD',
            'UNIDAD',
            'VALOR',
          ]
        : [
            'ÍTEM',
            'PRODUCTO',
            proformaType === 'puertas'
              ? 'DESCRIPCIÓN DEL PRODUCTO'
              : 'DESCRIPCIÓN',
            'CANTIDAD',
            'UNIDAD',
            'VALOR',
          ];

  const rows: Array<Array<string | number>> = [
    ['PROFORMA Nº', data.consecutivo],
    ['TIPO DE PROFORMA', typeMeta.label],
    ['EMPRESA', data.company.razonSocial],
    ['CLIENTE', data.clientProject.cliente],
    ['CONTACTO', data.clientProject.contacto],
    ['TELÉFONO', data.clientProject.telefono],
    ['CORREO', data.clientProject.correo],
    ['UBICACIÓN', data.clientProject.ubicacion],
    ['PROYECTO', data.clientProject.proyecto],
    ['FECHA', data.clientProject.fecha],
    ['VALIDEZ', data.clientProject.validez],
    ['MONEDA', data.clientProject.moneda],
    [],
    itemHeaders,
  ];

  data.items.forEach((item, idx) => {
    if (proformaType === 'cielos_pisos') {
      rows.push([
        idx + 1,
        item.producto,
        item.descripcion,
        item.cantidad,
        (item.valorUnitario ?? 0).toFixed(2),
        item.valor.toFixed(2),
      ]);
    } else if (proformaType === 'griferia') {
      rows.push([
        idx + 1,
        item.producto,
        item.imagen?.trim()
          ? item.imagen.startsWith('data:')
            ? 'Imagen cargada'
            : item.imagen.trim()
          : '',
        item.descripcion,
        item.cantidad,
        item.unidad,
        item.valor.toFixed(2),
      ]);
    } else {
      rows.push([
        idx + 1,
        item.producto,
        item.descripcion,
        item.cantidad,
        item.unidad,
        item.valor.toFixed(2),
      ]);
    }
  });

  rows.push([]);
  rows.push([
    proformaType === 'cielos_pisos' ? 'TOTAL m²' : 'TOTAL UNIDADES',
    totals.unidadResumen,
  ]);
  rows.push(['VALOR DE PRODUCTO (SUBTOTAL)', totals.subtotal.toFixed(2)]);
  rows.push([`IMPUESTO DE VENTA (${data.taxRate}%)`, totals.impuesto.toFixed(2)]);
  rows.push([`TOTAL (${data.clientProject.moneda})`, totals.total.toFixed(2)]);

  rows.push([]);
  rows.push(['DESGLOSE DE PAGOS', 'PORCENTAJE (%)', 'MONTO']);
  totals.paymentRows
    .filter((p) => p.porcentaje > 0)
    .forEach((p) => {
      rows.push([p.concepto, `${p.porcentaje}%`, p.monto.toFixed(2)]);
    });

  const csvContent = rows
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');

  // UTF-8 BOM para compatibilidad directa con Microsoft Excel en español
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  triggerDownload(
    blob,
    buildPdfFileName(
      data.consecutivo,
      data.clientProject.proyecto,
      'csv',
      data.clientProject.cliente
    )
  );
}

function fitLogoInBox(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  const safeW = Math.max(1, naturalW);
  const safeH = Math.max(1, naturalH);
  const scale = Math.min(maxW / safeW, maxH / safeH);
  return {
    w: safeW * scale,
    h: safeH * scale,
  };
}

export interface PdfGenerationResult {
  skippedExternalImages: number;
  fileName: string;
}

export async function generateProformaPDF(
  data: ProformaData,
  totals: ComputedTotals,
  mainLogo: LogoAsset | null = DEFAULT_OLMO_MAIN_LOGO,
  footerLogos: Array<LogoAsset | null> = []
): Promise<PdfGenerationResult> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth(); // 215.9mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 279.4mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const charcoal: [number, number, number] = [24, 24, 27];
  const mutedText: [number, number, number] = [82, 82, 91];
  const lightBorder: [number, number, number] = [228, 228, 231];
  const subtleBg: [number, number, number] = [247, 246, 243];
  const accentBronze: [number, number, number] = [140, 90, 50];

  const proformaType = data.proformaType ?? 'mobiliario';
  const typeMeta = getProformaTypeMeta(proformaType);
  const currencyCode = getCurrencyCode(data.clientProject.moneda);

  let skippedExternalImages = 0;

  const effectiveMainLogo = mainLogo?.dataUrl ? mainLogo : DEFAULT_OLMO_MAIN_LOGO;
  const customMainRaster = await rasterizeLogoForPdf(effectiveMainLogo);
  if (!customMainRaster && !effectiveMainLogo.dataUrl.startsWith('data:')) {
    skippedExternalImages++;
  }
  const isDefaultMainLogo =
    effectiveMainLogo.dataUrl === DEFAULT_OLMO_MAIN_LOGO.dataUrl;
  const rasterMainLogo =
    customMainRaster ??
    (isDefaultMainLogo ? null : await rasterizeLogoForPdf(DEFAULT_OLMO_MAIN_LOGO));

  const loadedFooterAssets = footerLogos.filter(
    (item): item is LogoAsset => item !== null && Boolean(item.dataUrl)
  );
  const rasterFooterResults = await Promise.all(
    loadedFooterAssets.map(async (l) => {
      const raster = await rasterizeLogoForPdf(l);
      if (!raster && !l.dataUrl.startsWith('data:')) {
        skippedExternalImages++;
      }
      return raster;
    })
  );
  const rasterFooterLogos = rasterFooterResults.filter(
    (item): item is RasterizedPdfLogo => item !== null
  );

  const rasterItemImages: Array<RasterizedPdfLogo | null> =
    proformaType === 'griferia'
      ? await Promise.all(
          data.items.map(async (item) => {
            const imgSrc = item.imagen?.trim();
            if (!imgSrc) return null;
            const raster = await rasterizeImageSrcForPdf(imgSrc);
            if (!raster && !imgSrc.startsWith('data:')) {
              skippedExternalImages++;
            }
            return raster;
          })
        )
      : [];

  const loadedVisualRefs = (data.visualReferences ?? []).filter((ref) =>
    Boolean(ref.imageDataUrl?.trim())
  );
  const rasterVisualRefs = (
    await Promise.all(
      loadedVisualRefs.map(async (ref) => {
        const raster = await rasterizeImageSrcForPdf(ref.imageDataUrl);
        if (!raster) {
          if (!ref.imageDataUrl.trim().startsWith('data:')) {
            skippedExternalImages++;
          }
          return null;
        }
        return {
          raster,
          caption: ref.caption.trim(),
        };
      })
    )
  ).filter(
    (entry): entry is { raster: RasterizedPdfLogo; caption: string } =>
      entry !== null
  );

  const hasFooterLogos = rasterFooterLogos.length > 0;
  const bottomReservedMm = hasFooterLogos ? 26 : 20;

  const drawContinuationHeader = (subtitle: string) => {
    let textStartX = margin;
    if (rasterMainLogo) {
      const fitted = fitLogoInBox(
        rasterMainLogo.width,
        rasterMainLogo.height,
        22,
        5.5
      );
      doc.addImage(
        rasterMainLogo.dataUrl,
        'PNG',
        margin,
        14 - fitted.h + 1,
        fitted.w,
        fitted.h,
        undefined,
        'FAST'
      );
      textStartX = margin + fitted.w + 4;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...mutedText);
    doc.text(subtitle, textStartX, 14);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...charcoal);
    doc.text(`PROFORMA Nº ${data.consecutivo}`, pageWidth - margin, 14, {
      align: 'right',
    });

    doc.setDrawColor(...lightBorder);
    doc.setLineWidth(0.35);
    doc.line(margin, 17, pageWidth - margin, 17);
  };

  // ============================================================================
  // PÁGINA 1: ENCABEZADO, CLIENTE/PROYECTO, TABLA DE PRODUCTOS Y TOTALES
  // ============================================================================
  const headerTopY = 14;
  const boxW = 60;
  const boxX = pageWidth - margin - boxW;

  // Logo principal OLMO B.N. fijo arriba a la izquierda
  const mainSlotMaxH = 15;
  const mainSlotMaxW = 48;

  if (rasterMainLogo) {
    const fittedMain = fitLogoInBox(
      rasterMainLogo.width,
      rasterMainLogo.height,
      mainSlotMaxW,
      mainSlotMaxH
    );
    const drawY = headerTopY + (mainSlotMaxH - fittedMain.h) / 2;
    doc.addImage(
      rasterMainLogo.dataUrl,
      'PNG',
      margin,
      drawY,
      fittedMain.w,
      fittedMain.h,
      undefined,
      'FAST'
    );
  }

  const logosBottomY = headerTopY + mainSlotMaxH;

  // Datos de empresa debajo del logo principal
  const companyStartY = logosBottomY + 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...mutedText);
  const companyLines = [
    data.company.razonSocial,
    `Céd. Jur.: ${data.company.cedulaJuridica}  ·  Tel: ${data.company.telefono}`,
    `${data.company.correo}  ·  ${data.company.sitioWeb}`,
    data.company.direccion,
  ].filter(Boolean);

  companyLines.forEach((line, idx) => {
    doc.text(line, margin, companyStartY + idx * 3.8);
  });

  const leftBottomY = companyStartY + Math.max(0, companyLines.length - 1) * 3.8;

  // Caja Proforma derecha
  const boxTopY = headerTopY;
  doc.setFillColor(...subtleBg);
  doc.setDrawColor(...lightBorder);
  doc.setLineWidth(0.35);
  doc.roundedRect(boxX, boxTopY, boxW, 29, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...mutedText);
  doc.text('PROFORMA DE COTIZACIÓN', boxX + boxW / 2, boxTopY + 5.5, {
    align: 'center',
  });

  doc.setFont('courier', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...charcoal);
  doc.text(`Nº ${data.consecutivo}`, boxX + boxW / 2, boxTopY + 13, {
    align: 'center',
  });

  doc.setDrawColor(...lightBorder);
  doc.line(boxX + 4, boxTopY + 16, boxX + boxW - 4, boxTopY + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...mutedText);
  doc.text(
    `Fecha: ${formatDateSpanish(data.clientProject.fecha)}`,
    boxX + 4,
    boxTopY + 20.8
  );
  doc.text(
    `Validez: ${data.clientProject.validez || '15 Días'}`,
    boxX + 4,
    boxTopY + 24.4
  );
  doc.text(`Moneda: ${data.clientProject.moneda}`, boxX + 4, boxTopY + 27.8);

  const rightBottomY = boxTopY + 29;
  let y = Math.max(leftBottomY + 3.5, rightBottomY + 4);
  doc.setDrawColor(...charcoal);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Datos del Cliente y Proyecto
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...charcoal);
  doc.text('DATOS DEL CLIENTE Y PROYECTO', margin, y);
  y += 2.5;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      cellPadding: 2.3,
      lineColor: lightBorder,
      lineWidth: 0.25,
      textColor: charcoal,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold', fillColor: subtleBg, textColor: mutedText },
      1: { cellWidth: 66 },
      2: { cellWidth: 28, fontStyle: 'bold', fillColor: subtleBg, textColor: mutedText },
      3: { cellWidth: contentWidth - 122 },
    },
    body: [
      [
        'Cliente',
        data.clientProject.cliente || '—',
        'Proyecto',
        data.clientProject.proyecto || '—',
      ],
      [
        'Contacto',
        data.clientProject.contacto || '—',
        'Ubicación',
        data.clientProject.ubicacion || '—',
      ],
      [
        'Teléfono',
        data.clientProject.telefono || '—',
        'Fecha',
        formatDateSpanish(data.clientProject.fecha),
      ],
      [
        'Correo',
        data.clientProject.correo || '—',
        'Validez',
        data.clientProject.validez || '15 Días',
      ],
    ],
  });

  y = (doc.lastAutoTable?.finalY ?? y + 24) + 6;

  // Tabla de Productos según Tipo de Proforma
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...charcoal);
  doc.text(typeMeta.detailHeading, margin, y);
  y += 2.5;

  if (proformaType === 'griferia') {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: bottomReservedMm },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      theme: 'grid',
      headStyles: {
        fillColor: charcoal,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.8,
        cellPadding: 2.5,
      },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.5,
        lineColor: lightBorder,
        lineWidth: 0.25,
        textColor: charcoal,
        valign: 'top',
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', textColor: mutedText },
        1: { cellWidth: 29, fontStyle: 'bold' },
        2: { cellWidth: 23, halign: 'center', valign: 'middle' },
        3: { cellWidth: contentWidth - 110 },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      head: [
        ['#', 'CÓDIGO PRODUCTO', 'IMAGEN', 'DESCRIPCIÓN', 'CANTIDAD', 'VALOR'],
      ],
      body: data.items.map((item, idx) => [
        String(idx + 1).padStart(2, '0'),
        item.producto || '—',
        '',
        item.descripcion || '—',
        `${item.cantidad} ${item.unidad || 'und(s)'}`,
        formatMoney(item.valor, data.clientProject.moneda),
      ]),
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 2) {
          if (rasterItemImages[hookData.row.index]) {
            hookData.cell.styles.minCellHeight = 16;
          }
        }
      },
      didDrawCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 2) {
          const img = rasterItemImages[hookData.row.index];
          if (!img) return;
          const maxImgW = Math.max(4, hookData.cell.width - 3);
          const maxImgH = Math.max(4, hookData.cell.height - 3);
          const fitted = fitLogoInBox(img.width, img.height, maxImgW, maxImgH);
          const drawX =
            hookData.cell.x + (hookData.cell.width - fitted.w) / 2;
          const drawY =
            hookData.cell.y + (hookData.cell.height - fitted.h) / 2;
          doc.addImage(
            img.dataUrl,
            'PNG',
            drawX,
            drawY,
            fitted.w,
            fitted.h,
            undefined,
            'FAST'
          );
        }
      },
    });
  } else if (proformaType === 'cielos_pisos') {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: bottomReservedMm },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      theme: 'grid',
      headStyles: {
        fillColor: charcoal,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.8,
        cellPadding: 2.5,
      },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.5,
        lineColor: lightBorder,
        lineWidth: 0.25,
        textColor: charcoal,
        valign: 'top',
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', textColor: mutedText },
        1: { cellWidth: 32, fontStyle: 'bold' },
        2: { cellWidth: contentWidth - 116 },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      head: [
        [
          '#',
          'ESPACIO',
          'ACABADO',
          'CANTIDAD (m²)',
          'VALOR UNITARIO',
          `VALOR (${currencyCode})`,
        ],
      ],
      body: data.items.map((item, idx) => [
        String(idx + 1).padStart(2, '0'),
        item.producto || '—',
        item.descripcion || '—',
        `${item.cantidad} m²`,
        formatMoney(item.valorUnitario ?? 0, data.clientProject.moneda),
        formatMoney(item.valor, data.clientProject.moneda),
      ]),
    });
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: bottomReservedMm },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      theme: 'grid',
      headStyles: {
        fillColor: charcoal,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 2.8,
      },
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 2.8,
        lineColor: lightBorder,
        lineWidth: 0.25,
        textColor: charcoal,
        valign: 'top',
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', textColor: mutedText },
        1: { cellWidth: 34, fontStyle: 'bold' },
        2: { cellWidth: contentWidth - 96 },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      head: [
        [
          '#',
          'PRODUCTO',
          proformaType === 'puertas'
            ? 'DESCRIPCIÓN DEL PRODUCTO'
            : 'DESCRIPCIÓN',
          'CANTIDAD',
          'VALOR',
        ],
      ],
      body: data.items.map((item, idx) => [
        String(idx + 1).padStart(2, '0'),
        item.producto || '—',
        item.descripcion || '—',
        `${item.cantidad} ${item.unidad || 'und(s)'}`,
        formatMoney(item.valor, data.clientProject.moneda),
      ]),
    });
  }

  y = (doc.lastAutoTable?.finalY ?? y + 40) + 6;

  // Si no hay suficiente espacio para el bloque de totales (~36mm), pasar a nueva página
  if (y + 38 > pageHeight - bottomReservedMm) {
    doc.addPage();
    drawContinuationHeader('Resumen Económico');
    y = 24;
  }

  // Bloque de Totales y Unidades
  const leftSummaryW = contentWidth * 0.48;
  const rightSummaryW = contentWidth * 0.48;
  const rightSummaryX = pageWidth - margin - rightSummaryW;

  doc.setFillColor(...subtleBg);
  doc.setDrawColor(...lightBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, leftSummaryW, 23, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...mutedText);
  doc.text('RESUMEN DE CANTIDADES Y MONEDA', margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...charcoal);
  doc.text(
    proformaType === 'cielos_pisos'
      ? 'Total de m² cotizados:'
      : 'Total de unidades cotizadas:',
    margin + 4,
    y + 12.5
  );
  doc.setFont('helvetica', 'bold');
  doc.text(totals.unidadResumen, margin + leftSummaryW - 4, y + 12.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...mutedText);
  doc.text(`Moneda de cotización: ${data.clientProject.moneda}`, margin + 4, y + 18.5);

  autoTable(doc, {
    startY: y,
    margin: { left: rightSummaryX, right: margin },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.3,
      lineColor: lightBorder,
      lineWidth: 0.25,
      textColor: charcoal,
    },
    columnStyles: {
      0: { cellWidth: rightSummaryW * 0.56, textColor: mutedText },
      1: { cellWidth: rightSummaryW * 0.44, halign: 'right', fontStyle: 'bold' },
    },
    body: [
      ['Valor de Producto', formatMoney(totals.subtotal, data.clientProject.moneda)],
      [
        `Impuesto de Venta (${data.taxRate}%)`,
        formatMoney(totals.impuesto, data.clientProject.moneda),
      ],
      [
        {
          content: `TOTAL (${data.clientProject.moneda})`,
          styles: {
            fillColor: charcoal,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
        },
        {
          content: formatMoney(totals.total, data.clientProject.moneda),
          styles: {
            fillColor: charcoal,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'right',
          },
        },
      ],
    ],
  });

  // ============================================================================
  // PÁGINAS OPCIONALES: REFERENCIAS VISUALES (SOLO IMÁGENES CARGADAS)
  // ============================================================================
  if (rasterVisualRefs.length > 0) {
    doc.addPage();
    drawContinuationHeader('Referencias Visuales');
    y = 24;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...charcoal);
    doc.text('REFERENCIAS VISUALES', margin, y);
    y += 2;
    doc.setDrawColor(...accentBronze);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + 46, y);
    y += 6;

    const gridGap = 6;
    const cardW = (contentWidth - gridGap) / 2;
    const imgBoxH = 54;
    const imgPad = 3;
    const imgAreaH = imgBoxH + imgPad * 2;

    const measureCard = (entry: {
      raster: RasterizedPdfLogo;
      caption: string;
    }) => {
      if (!entry.caption) {
        return { captionLines: [] as string[], cardH: imgAreaH };
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      const captionLines: string[] = doc.splitTextToSize(
        entry.caption,
        cardW - 6
      );
      const captionH = captionLines.length * 3.8 + 4.5;
      return { captionLines, cardH: imgAreaH + captionH };
    };

    for (let i = 0; i < rasterVisualRefs.length; i += 2) {
      const leftItem = rasterVisualRefs[i];
      const rightItem = rasterVisualRefs[i + 1] ?? null;

      const leftMetrics = measureCard(leftItem);
      const rightMetrics = rightItem ? measureCard(rightItem) : null;
      const rowH = Math.max(
        leftMetrics.cardH,
        rightMetrics ? rightMetrics.cardH : 0
      );

      if (y + rowH > pageHeight - bottomReservedMm) {
        doc.addPage();
        drawContinuationHeader('Referencias Visuales (cont.)');
        y = 24;
      }

      const drawCard = (
        entry: { raster: RasterizedPdfLogo; caption: string },
        metrics: { captionLines: string[]; cardH: number },
        cardX: number
      ) => {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...lightBorder);
        doc.setLineWidth(0.3);
        doc.rect(cardX, y, cardW, metrics.cardH, 'FD');

        doc.setFillColor(...subtleBg);
        doc.rect(cardX + 0.15, y + 0.15, cardW - 0.3, imgAreaH - 0.15, 'F');

        const fitted = fitLogoInBox(
          entry.raster.width,
          entry.raster.height,
          cardW - imgPad * 2,
          imgBoxH
        );
        const drawX = cardX + (cardW - fitted.w) / 2;
        const drawY = y + (imgAreaH - fitted.h) / 2;
        doc.addImage(
          entry.raster.dataUrl,
          'PNG',
          drawX,
          drawY,
          fitted.w,
          fitted.h,
          undefined,
          'FAST'
        );

        if (metrics.captionLines.length > 0) {
          doc.setDrawColor(...lightBorder);
          doc.setLineWidth(0.25);
          doc.line(cardX, y + imgAreaH, cardX + cardW, y + imgAreaH);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.2);
          doc.setTextColor(...charcoal);
          doc.text(metrics.captionLines, cardX + 3, y + imgAreaH + 4.5);
        }
      };

      drawCard(leftItem, leftMetrics, margin);
      if (rightItem && rightMetrics) {
        drawCard(rightItem, rightMetrics, margin + cardW + gridGap);
      }

      y += rowH + 6;
    }
  }

  // ============================================================================
  // PÁGINA TÉRMINOS Y CONDICIONES + ESPECIFICACIONES TÉCNICAS
  // ============================================================================
  doc.addPage();
  drawContinuationHeader('Términos, Condiciones y Especificaciones Técnicas');
  y = 24;

  const ensureSpace = (neededMm: number, headerTitle: string) => {
    if (y + neededMm > pageHeight - bottomReservedMm) {
      doc.addPage();
      drawContinuationHeader(headerTitle);
      y = 24;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...charcoal);
  doc.text('TÉRMINOS Y CONDICIONES', margin, y);
  y += 2;
  doc.setDrawColor(...accentBronze);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 45, y);
  y += 4.5;

  const normalizedTerminos = normalizeSpreadsheetParagraphs(
    data.terminosCondiciones
  );
  const termParagraphs = normalizedTerminos
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...charcoal);

  termParagraphs.forEach((para) => {
    const subLines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    subLines.forEach((subLine, sIdx) => {
      const wrapped = doc.splitTextToSize(subLine, contentWidth);
      const lineSpacing = sIdx === subLines.length - 1 ? 2.5 : 0.8;
      const needed = wrapped.length * 3.8 + lineSpacing;
      ensureSpace(needed, 'Términos y Condiciones (cont.)');
      doc.text(wrapped, margin, y);
      y += needed;
    });
  });

  y += 4;
  ensureSpace(26, 'Especificaciones Técnicas');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...charcoal);
  doc.text('ESPECIFICACIONES TÉCNICAS GENERALES Y ACABADOS DE MOBILIARIO', margin, y);
  y += 2;
  doc.setDrawColor(...accentBronze);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 72, y);
  y += 5;

  data.specBlocks.forEach((block) => {
    const normalizedSpecBody = normalizeSpreadsheetParagraphs(
      block.contenido || ''
    );
    const specParagraphs = normalizedSpecBody
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const renderedSpecRows: Array<{ text: string; extraGapAfter: number }> = [];
    specParagraphs.forEach((para, pIdx) => {
      const subLines = para.split('\n').map((l) => l.trim()).filter(Boolean);
      subLines.forEach((subLine, sIdx) => {
        const wrapped: string[] = doc.splitTextToSize(subLine, contentWidth - 4);
        wrapped.forEach((wLine, wIdx) => {
          const isLastOfLine = wIdx === wrapped.length - 1;
          const isLastOfPara = sIdx === subLines.length - 1 && isLastOfLine;
          const isLastOfBlock = pIdx === specParagraphs.length - 1 && isLastOfPara;
          renderedSpecRows.push({
            text: wLine,
            extraGapAfter: isLastOfBlock ? 0 : isLastOfPara ? 1.8 : 0,
          });
        });
      });
    });

    const blockHeight = 11 + renderedSpecRows.length * 3.7 + 3;

    // Si cabe completo en la página actual, o si no cabe, saltar de página para no cortar el título
    ensureSpace(Math.min(blockHeight, 48), 'Especificaciones Técnicas (cont.)');

    doc.setFillColor(...subtleBg);
    doc.setDrawColor(...lightBorder);
    doc.setLineWidth(0.25);
    doc.rect(margin, y, contentWidth, 9.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...charcoal);
    doc.text(block.titulo || 'Especificación Técnica', margin + 3, y + 4.2);

    if (block.subtitulo) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...mutedText);
      doc.text(block.subtitulo, margin + 3, y + 7.8);
    }

    y += 12.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...charcoal);

    renderedSpecRows.forEach((row) => {
      ensureSpace(5, 'Especificaciones Técnicas (cont.)');
      doc.text(row.text, margin + 2, y);
      y += 3.7 + row.extraGapAfter;
    });

    y += 3.5;
  });

  // ============================================================================
  // PÁGINA 3: CUENTA BANCARIA, DESGLOSE DE PAGOS Y FIRMAS
  // ============================================================================
  doc.addPage();
  drawContinuationHeader('Información Bancaria, Desglose de Pagos y Firmas');
  y = 24;

  // Cuenta Bancaria
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...charcoal);
  doc.text('CUENTA BANCARIA PARA DEPÓSITOS Y TRANSFERENCIAS', margin, y);
  y += 2;
  doc.setDrawColor(...accentBronze);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 62, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.8,
      lineColor: lightBorder,
      lineWidth: 0.25,
      textColor: charcoal,
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold', fillColor: subtleBg, textColor: mutedText },
      1: { cellWidth: contentWidth - 48 },
    },
    body: [
      ['Entidad Bancaria', data.bankAccount.entidadBancaria || '—'],
      ['Nombre / Titular', data.bankAccount.nombre || '—'],
      ['Cédula Jurídica', data.bankAccount.cedulaJuridica || '—'],
      ['Moneda de la Cuenta', data.bankAccount.moneda || '—'],
      ['Número de Cuenta', data.bankAccount.cuenta || '—'],
      [
        'Cuenta IBAN',
        {
          content: data.bankAccount.cuentaIban || '—',
          styles: { font: 'courier', fontStyle: 'bold' },
        },
      ],
    ],
  });

  y = (doc.lastAutoTable?.finalY ?? y + 40) + 10;

  // Desglose de Pagos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...charcoal);
  doc.text('DESGLOSE DE PAGOS', margin, y);
  y += 2;
  doc.setDrawColor(...accentBronze);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 40, y);
  y += 4;

  const activePayments = totals.paymentRows.filter((p) => p.porcentaje > 0);
  const paymentTableRows = (activePayments.length > 0 ? activePayments : totals.paymentRows).map(
    (p) => [
      p.concepto,
      `${p.porcentaje}%`,
      formatMoney(p.monto, data.clientProject.moneda),
    ]
  );

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: {
      fillColor: charcoal,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.2,
      cellPadding: 2.8,
    },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.8,
      lineColor: lightBorder,
      lineWidth: 0.25,
      textColor: charcoal,
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 62 },
      1: { cellWidth: 26, halign: 'right' },
      2: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
    },
    head: [['CONCEPTO / HITO DE PAGO', 'PORCENTAJE', 'MONTO']],
    body: [
      ...paymentTableRows,
      [
        {
          content: 'TOTAL DESGLOSADO',
          styles: { fillColor: subtleBg, fontStyle: 'bold' },
        },
        {
          content: `${totals.totalPorcentajePagos}%`,
          styles: { fillColor: subtleBg, fontStyle: 'bold', halign: 'right' },
        },
        {
          content: formatMoney(
            totals.paymentRows.reduce((acc, r) => acc + r.monto, 0),
            data.clientProject.moneda
          ),
          styles: { fillColor: subtleBg, fontStyle: 'bold', halign: 'right' },
        },
      ],
    ],
  });

  y = (doc.lastAutoTable?.finalY ?? y + 36) + 8;

  if (data.notasFinales.trim()) {
    const normalizedNote = normalizeSpreadsheetParagraphs(data.notasFinales);
    doc.setFillColor(...subtleBg);
    doc.setDrawColor(...lightBorder);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    const wrappedNote = doc.splitTextToSize(normalizedNote, contentWidth - 8);
    const noteH = wrappedNote.length * 4 + 7;
    ensureSpace(noteH + 40, 'Aceptación y Firmas');
    doc.roundedRect(margin, y, contentWidth, noteH, 1.5, 1.5, 'FD');
    doc.setTextColor(...mutedText);
    doc.text(wrappedNote, margin + 4, y + 5.5);
    y += noteH + 10;
  }

  // Firmas al pie de página 3
  const signatureBlockY = Math.max(y + 18, pageHeight - (hasFooterLogos ? 68 : 62));
  if (signatureBlockY + 42 > pageHeight - (hasFooterLogos ? 24 : 16)) {
    doc.addPage();
    drawContinuationHeader('Aceptación y Firmas');
    y = 48;
  } else {
    y = signatureBlockY;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...charcoal);
  doc.text('ACEPTACIÓN DE PROFORMA Y FIRMAS DE CONFORMIDAD', margin, y - 14);

  const sigWidth = (contentWidth - 18) / 2;
  const leftSigX = margin;
  const rightSigX = margin + sigWidth + 18;

  // Firma Representante OLMO
  doc.setDrawColor(...charcoal);
  doc.setLineWidth(0.45);
  doc.line(leftSigX, y + 10, leftSigX + sigWidth, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...charcoal);
  doc.text(
    data.signatures.representanteTitulo || 'FIRMA REPRESENTANTE OLMO',
    leftSigX + sigWidth / 2,
    y + 15,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...mutedText);
  doc.text(
    data.signatures.representanteNombre || data.company.razonSocial,
    leftSigX + sigWidth / 2,
    y + 19.5,
    { align: 'center' }
  );
  doc.text('Fecha: _____ / _____ / ________', leftSigX + sigWidth / 2, y + 24.5, {
    align: 'center',
  });

  // Firma Cliente
  doc.setDrawColor(...charcoal);
  doc.line(rightSigX, y + 10, rightSigX + sigWidth, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...charcoal);
  doc.text(
    data.signatures.clienteTitulo || 'FIRMA CLIENTE',
    rightSigX + sigWidth / 2,
    y + 15,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...mutedText);
  const resolvedClientSigner =
    data.signatures.clienteNombre.trim() || data.clientProject.cliente.trim();
  if (resolvedClientSigner) {
    doc.text(resolvedClientSigner, rightSigX + sigWidth / 2, y + 19.5, {
      align: 'center',
    });
  }
  doc.text('Fecha: _____ / _____ / ________', rightSigX + sigWidth / 2, y + 24.5, {
    align: 'center',
  });

  // Pie de página global con logos cargados (solo si hay al menos 1) y numeración
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    if (hasFooterLogos) {
      const dividerY = pageHeight - 21.5;
      doc.setDrawColor(...lightBorder);
      doc.setLineWidth(0.25);
      doc.line(margin, dividerY, pageWidth - margin, dividerY);

      const logoBandTopY = pageHeight - 20;
      const logoMaxH = 7.2;
      const logoMaxW = 28;
      const logoGap = 5.5;
      let logoCursorX = margin;

      rasterFooterLogos.forEach((fLogo) => {
        const fitted = fitLogoInBox(
          fLogo.width,
          fLogo.height,
          logoMaxW,
          logoMaxH
        );
        if (logoCursorX + fitted.w <= pageWidth - margin) {
          const drawY = logoBandTopY + (logoMaxH - fitted.h) / 2;
          doc.addImage(
            fLogo.dataUrl,
            'PNG',
            logoCursorX,
            drawY,
            fitted.w,
            fitted.h,
            undefined,
            'FAST'
          );
          logoCursorX += fitted.w + logoGap;
        }
      });

      const footerY = pageHeight - 8.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...mutedText);
      doc.text(
        `${data.company.razonSocial}  ·  ${data.company.correo}  ·  ${data.company.telefono}`,
        margin,
        footerY
      );
      doc.text(
        `Proforma Nº ${data.consecutivo}  ·  Página ${i} de ${totalPages}`,
        pageWidth - margin,
        footerY,
        { align: 'right' }
      );
    } else {
      const footerY = pageHeight - 10;
      doc.setDrawColor(...lightBorder);
      doc.setLineWidth(0.25);
      doc.line(margin, footerY - 3.5, pageWidth - margin, footerY - 3.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...mutedText);
      doc.text(
        `${data.company.razonSocial}  ·  ${data.company.correo}  ·  ${data.company.telefono}`,
        margin,
        footerY
      );
      doc.text(
        `Proforma Nº ${data.consecutivo}  ·  Página ${i} de ${totalPages}`,
        pageWidth - margin,
        footerY,
        { align: 'right' }
      );
    }
  }

  const fileName = buildPdfFileName(
    data.consecutivo,
    data.clientProject.proyecto,
    'pdf',
    data.clientProject.cliente
  );
  doc.save(fileName);
  return { skippedExternalImages, fileName };
}
