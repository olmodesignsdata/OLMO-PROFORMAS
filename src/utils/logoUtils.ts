import { LogoAsset } from '../types/proforma';

export const ACCEPTED_LOGO_INPUT =
  '.png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];

export function isSupportedLogoFile(file: File): boolean {
  if (file.type && ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return true;
  }
  const lowerName = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo leer el archivo de imagen.'));
      }
    };
    reader.onerror = () =>
      reject(new Error('Error al leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('El archivo no contiene una imagen válida.'));
    img.src = src;
  });
}

function parseSvgDimensions(dataUrl: string): { width: number; height: number } | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(0, commaIdx);
    const body = dataUrl.slice(commaIdx + 1);
    const svgText = header.includes(';base64')
      ? atob(body)
      : decodeURIComponent(body);

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return null;

    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox
        .trim()
        .split(/[\s,]+/)
        .map((n) => parseFloat(n));
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: parts[2], height: parts[3] };
      }
    }

    const rawW = parseFloat(svgEl.getAttribute('width') || '');
    const rawH = parseFloat(svgEl.getAttribute('height') || '');
    if (rawW > 0 && rawH > 0) {
      return { width: rawW, height: rawH };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Procesa una imagen subida (PNG, JPG, SVG o WebP) en un LogoAsset optimizado
 * para persistencia en localStorage y renderizado nítido en vista previa / PDF.
 */
export async function processLogoFile(file: File): Promise<LogoAsset> {
  if (!isSupportedLogoFile(file)) {
    throw new Error(
      'Formato no compatible. Utiliza únicamente archivos PNG, JPG, SVG o WebP.'
    );
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const isSvg =
    file.type === 'image/svg+xml' ||
    file.name.toLowerCase().endsWith('.svg');

  const cleanName = file.name.replace(/\.[^.]+$/, '') || 'Logo';
  const id = `logo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (isSvg) {
    const svgDims = parseSvgDimensions(rawDataUrl);
    try {
      const img = await loadImageElement(rawDataUrl);
      const width = img.naturalWidth || svgDims?.width || 300;
      const height = img.naturalHeight || svgDims?.height || 120;
      return { id, name: cleanName, dataUrl: rawDataUrl, width, height };
    } catch {
      return {
        id,
        name: cleanName,
        dataUrl: rawDataUrl,
        width: svgDims?.width || 300,
        height: svgDims?.height || 120,
      };
    }
  }

  const img = await loadImageElement(rawDataUrl);
  const naturalW = img.naturalWidth || 300;
  const naturalH = img.naturalHeight || 120;

  // Escalar imágenes raster excesivamente grandes para proteger la cuota de localStorage
  // manteniendo alta resolución para impresión y PDF (900px lado mayor).
  const maxDim = 900;
  const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
  const targetW = Math.max(1, Math.round(naturalW * scale));
  const targetH = Math.max(1, Math.round(naturalH * scale));

  // Si es pequeña y ya es PNG/JPEG, podemos conservar el dataUrl si no excede ~400KB,
  // o re-codificar a PNG/JPEG optimizado si se redimensionó o es WebP.
  const isJpeg =
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    /\.(jpe?g)$/i.test(file.name);

  if (scale === 1 && rawDataUrl.length < 450_000) {
    return {
      id,
      name: cleanName,
      dataUrl: rawDataUrl,
      width: naturalW,
      height: naturalH,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      id,
      name: cleanName,
      dataUrl: rawDataUrl,
      width: naturalW,
      height: naturalH,
    };
  }

  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const outputDataUrl = isJpeg
    ? canvas.toDataURL('image/jpeg', 0.92)
    : canvas.toDataURL('image/png');

  return {
    id,
    name: cleanName,
    dataUrl: outputDataUrl,
    width: targetW,
    height: targetH,
  };
}

export function extractGoogleDriveFileId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    if (
      host === 'drive.google.com' ||
      host.endsWith('.drive.google.com') ||
      host === 'docs.google.com'
    ) {
      // /file/d/<ID>/view, /file/d/<ID>/edit, /file/d/<ID>/preview
      const fileMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
      if (fileMatch) return fileMatch[1];

      // ?id=<ID> (open?id=..., uc?id=..., thumbnail?id=...)
      const queryId = parsed.searchParams.get('id');
      if (queryId && /^[a-zA-Z0-9_-]{10,}$/.test(queryId)) {
        return queryId;
      }
    }

    if (host === 'lh3.googleusercontent.com') {
      const lhMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
      if (lhMatch) return lhMatch[1];
    }
  } catch {
    // Fallback regex por si viene sin protocolo completo o con texto extra
    const fallbackMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
    if (fallbackMatch) return fallbackMatch[1];
  }

  return null;
}

export function buildImageUrlCandidates(rawUrl: string): {
  candidates: string[];
  isGoogleDrive: boolean;
  driveId: string | null;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { candidates: [], isGoogleDrive: false, driveId: null };
  }

  if (trimmed.startsWith('data:image/')) {
    return { candidates: [trimmed], isGoogleDrive: false, driveId: null };
  }

  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    return {
      candidates: [
        `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`,
        `https://drive.google.com/uc?export=view&id=${driveId}`,
      ],
      isGoogleDrive: true,
      driveId,
    };
  }

  return { candidates: [trimmed], isGoogleDrive: false, driveId: null };
}

export function getImageFallbackCandidates(src: string): string[] {
  const trimmed = src.trim();
  if (!trimmed) return [];
  const { candidates, isGoogleDrive, driveId } = buildImageUrlCandidates(trimmed);
  if (!isGoogleDrive || !driveId) return [trimmed];

  const list = [
    trimmed,
    ...candidates,
  ];
  return Array.from(new Set(list));
}

function loadImageWithTimeout(src: string, timeoutMs = 12000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Tiempo de espera agotado al cargar la imagen.'));
    }, timeoutMs);

    img.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if ((img.naturalWidth || 0) > 0 && (img.naturalHeight || 0) > 0) {
        resolve(img);
      } else {
        reject(new Error('La URL no devolvió una imagen válida.'));
      }
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error('No se pudo cargar la imagen desde la URL.'));
    };

    img.src = src;
  });
}

export interface ResolvedUrlImage {
  url: string;
  width: number;
  height: number;
  isGoogleDrive: boolean;
  name: string;
}

/**
 * Valida una URL de imagen externa o enlace de Google Drive, convirtiendo enlaces
 * de Drive (/file/d/<ID>/view o ?id=<ID>) priorizando thumbnail y con respaldo a uc?export=view.
 */
export async function resolveAndValidateImageUrl(
  rawUrl: string
): Promise<ResolvedUrlImage> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Ingresa o pega una URL de imagen antes de cargar.');
  }

  if (!trimmed.startsWith('data:image/')) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error(
        'El enlace ingresado no es una URL válida. Debe comenzar con https:// o http://'
      );
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('La URL de la imagen debe comenzar con https:// o http://');
    }
  }

  const { candidates, isGoogleDrive, driveId } = buildImageUrlCandidates(trimmed);

  for (const candidate of candidates) {
    try {
      const img = await loadImageWithTimeout(candidate);
      let labelName = 'Imagen URL';
      if (isGoogleDrive && driveId) {
        labelName = `Google Drive (${driveId.slice(0, 6)}…)`;
      } else if (!candidate.startsWith('data:')) {
        try {
          const u = new URL(candidate);
          const lastSeg = u.pathname.split('/').filter(Boolean).pop();
          if (lastSeg) labelName = decodeURIComponent(lastSeg).slice(0, 40);
        } catch {
          // ignore
        }
      }
      return {
        url: candidate,
        width: img.naturalWidth || 600,
        height: img.naturalHeight || 400,
        isGoogleDrive,
        name: labelName,
      };
    } catch {
      // Continuar con el siguiente candidato (p. ej. respaldo uc?export=view)
    }
  }

  if (isGoogleDrive) {
    throw new Error(
      'No se pudo cargar la imagen de Google Drive. Verifica que el archivo esté compartido como "Cualquier persona con el enlace" y que sea una imagen, o sube el archivo desde tu PC.'
    );
  }

  throw new Error(
    'No se pudo cargar la imagen desde ese enlace (puede estar bloqueada por permisos del servidor o no ser una imagen). Verifica el enlace o sube la imagen desde tu PC.'
  );
}

export async function processLogoUrl(rawUrl: string): Promise<LogoAsset> {
  const resolved = await resolveAndValidateImageUrl(rawUrl);
  return {
    id: `logo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: resolved.name,
    dataUrl: resolved.url,
    width: resolved.width,
    height: resolved.height,
  };
}

export interface RasterizedPdfLogo {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Convierte cualquier logo (PNG, JPG, SVG, WebP o URL externa / Google Drive)
 * a un PNG de alta resolución compatible con jsPDF preservando proporciones.
 */
export async function rasterizeLogoForPdf(
  logo: LogoAsset
): Promise<RasterizedPdfLogo | null> {
  if (!logo.dataUrl.startsWith('data:')) {
    return rasterizeImageSrcForPdf(logo.dataUrl);
  }

  try {
    const img = await loadImageElement(logo.dataUrl);
    const svgDims = logo.dataUrl.startsWith('data:image/svg+xml')
      ? parseSvgDimensions(logo.dataUrl)
      : null;

    const rawW = img.naturalWidth || logo.width || svgDims?.width || 300;
    const rawH = img.naturalHeight || logo.height || svgDims?.height || 120;
    const safeW = Math.max(1, rawW);
    const safeH = Math.max(1, rawH);

    // Rasterizar a ~500px en el lado mayor para nitidez de impresión en el PDF
    const targetMax = 520;
    const scale = targetMax / Math.max(safeW, safeH);
    const canvasW = Math.max(1, Math.round(safeW * scale));
    const canvasH = Math.max(1, Math.round(safeH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, 0, 0, canvasW, canvasH);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: safeW,
      height: safeH,
    };
  } catch {
    return null;
  }
}

/**
 * Procesa imágenes de productos o referencias visuales (hasta 10 por proforma),
 * comprimiendo fotografías a JPEG optimizado para proteger el límite de localStorage.
 */
export async function processProductImageFile(file: File): Promise<LogoAsset> {
  if (!isSupportedLogoFile(file)) {
    throw new Error(
      'Formato no compatible. Utiliza únicamente archivos PNG, JPG, SVG o WebP.'
    );
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const isSvg =
    file.type === 'image/svg+xml' ||
    file.name.toLowerCase().endsWith('.svg');

  const cleanName = file.name.replace(/\.[^.]+$/, '') || 'Imagen';
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (isSvg) {
    const svgDims = parseSvgDimensions(rawDataUrl);
    return {
      id,
      name: cleanName,
      dataUrl: rawDataUrl,
      width: svgDims?.width || 400,
      height: svgDims?.height || 300,
    };
  }

  const img = await loadImageElement(rawDataUrl);
  const naturalW = img.naturalWidth || 400;
  const naturalH = img.naturalHeight || 300;

  const maxDim = 820;
  const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
  const targetW = Math.max(1, Math.round(naturalW * scale));
  const targetH = Math.max(1, Math.round(naturalH * scale));

  if (scale === 1 && rawDataUrl.length < 140_000) {
    return {
      id,
      name: cleanName,
      dataUrl: rawDataUrl,
      width: naturalW,
      height: naturalH,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      id,
      name: cleanName,
      dataUrl: rawDataUrl,
      width: naturalW,
      height: naturalH,
    };
  }

  const isPngOrWebp =
    file.type === 'image/png' ||
    file.type === 'image/webp' ||
    /\.(png|webp)$/i.test(file.name);

  if (!isPngOrWebp) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return {
      id,
      name: cleanName,
      dataUrl: canvas.toDataURL('image/jpeg', 0.82),
      width: targetW,
      height: targetH,
    };
  }

  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  const pngCandidate = canvas.toDataURL('image/png');
  if (pngCandidate.length <= 220_000) {
    return {
      id,
      name: cleanName,
      dataUrl: pngCandidate,
      width: targetW,
      height: targetH,
    };
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return {
    id,
    name: cleanName,
    dataUrl: canvas.toDataURL('image/jpeg', 0.82),
    width: targetW,
    height: targetH,
  };
}

const rasterizedSrcCache = new Map<string, RasterizedPdfLogo>();

function loadImageWithCors(
  src: string,
  timeoutMs = 12000
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Tiempo de espera agotado al cargar la imagen con CORS.'));
    }, timeoutMs);

    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if ((img.naturalWidth || 0) > 0 && (img.naturalHeight || 0) > 0) {
        resolve(img);
      } else {
        reject(new Error('La imagen cargada no tiene dimensiones válidas.'));
      }
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error('No se pudo cargar la imagen.'));
    };
    img.src = src;
  });
}

async function fetchImageBlobWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 10000
): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (blob.size <= 0) return null;
    if (blob.type && !blob.type.startsWith('image/')) return null;
    return blob;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function tryRasterizeSingleExternalUrl(
  url: string
): Promise<RasterizedPdfLogo | null> {
  let resolvedSrc = url;
  let objectUrlToRevoke: string | null = null;

  const blob =
    (await fetchImageBlobWithTimeout(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    })) ??
    (await fetchImageBlobWithTimeout(url, {
      mode: 'cors',
    }));

  if (blob) {
    objectUrlToRevoke = URL.createObjectURL(blob);
    resolvedSrc = objectUrlToRevoke;
  }

  try {
    const img = await loadImageWithCors(resolvedSrc);
    const safeW = Math.max(1, img.naturalWidth || 400);
    const safeH = Math.max(1, img.naturalHeight || 300);
    const targetMax = 700;
    const scale = Math.min(1, targetMax / Math.max(safeW, safeH));
    const canvasW = Math.max(1, Math.round(safeW * scale));
    const canvasH = Math.max(1, Math.round(safeH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, 0, 0, canvasW, canvasH);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: safeW,
      height: safeH,
    };
  } catch {
    return null;
  } finally {
    if (objectUrlToRevoke) {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
  }
}

/**
 * Convierte cualquier origen de imagen (Data URL, URL externa http/https o Google Drive)
 * en un PNG/JPEG listo para incrustar en jsPDF preservando aspecto.
 */
export async function rasterizeImageSrcForPdf(
  src: string
): Promise<RasterizedPdfLogo | null> {
  const cleanSrc = src.trim();
  if (!cleanSrc) return null;

  if (cleanSrc.startsWith('data:')) {
    return rasterizeLogoForPdf({
      id: 'tmp',
      name: 'img',
      dataUrl: cleanSrc,
    });
  }

  const cached = rasterizedSrcCache.get(cleanSrc);
  if (cached) {
    return cached;
  }

  const baseCandidates = getImageFallbackCandidates(cleanSrc);
  const driveId = extractGoogleDriveFileId(cleanSrc);
  const candidates = driveId
    ? Array.from(
        new Set([
          cleanSrc,
          `https://lh3.googleusercontent.com/d/${driveId}=w1200`,
          ...baseCandidates,
        ])
      )
    : baseCandidates;

  for (const candidate of candidates) {
    const raster = await tryRasterizeSingleExternalUrl(candidate);
    if (raster) {
      rasterizedSrcCache.set(cleanSrc, raster);
      return raster;
    }
  }

  return null;
}
