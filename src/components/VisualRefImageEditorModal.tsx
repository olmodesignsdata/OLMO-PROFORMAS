import {
  Check,
  Crop,
  Loader2,
  Maximize2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { VisualReferenceFitMode, VisualReferenceItem } from '../types/proforma';
import { normalizeVisualReferenceFitMode } from '../utils/formatters';
import { cropImageSrc, rotateImageSrc90 } from '../utils/logoUtils';
import { ResilientImage } from './ResilientImage';

interface VisualRefImageEditorModalProps {
  item: VisualReferenceItem | null;
  onClose: () => void;
  onApplyPatch: (refId: string, patch: Partial<VisualReferenceItem>) => void;
}

interface CropRectPct {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_CROP_RECT: CropRectPct = { x: 8, y: 8, w: 84, h: 84 };

export function VisualRefImageEditorModal({
  item,
  onClose,
  onApplyPatch,
}: VisualRefImageEditorModalProps) {
  const [activeToolTab, setActiveToolTab] = useState<'crop' | 'frame'>('crop');
  const [workingSrc, setWorkingSrc] = useState('');
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<VisualReferenceFitMode>('contain');
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [cropRect, setCropRect] = useState<CropRectPct>(DEFAULT_CROP_RECT);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragActionRef = useRef<{
    kind: 'move' | 'nw' | 'ne' | 'sw' | 'se';
    startX: number;
    startY: number;
    startRect: CropRectPct;
  } | null>(null);

  useEffect(() => {
    if (!item) return;
    setActiveToolTab('crop');
    setWorkingSrc(item.imageDataUrl);
    setRotation(((Math.round((item.rotation ?? 0) / 90) * 90) % 360 + 360) % 360);
    setFitMode(normalizeVisualReferenceFitMode(item.fitMode));
    setCropZoom(
      typeof item.cropZoom === 'number' && Number.isFinite(item.cropZoom)
        ? Math.max(1, Math.min(2.5, item.cropZoom))
        : 1
    );
    setCropX(
      typeof item.cropX === 'number' && Number.isFinite(item.cropX)
        ? Math.max(0, Math.min(100, item.cropX))
        : 50
    );
    setCropY(
      typeof item.cropY === 'number' && Number.isFinite(item.cropY)
        ? Math.max(0, Math.min(100, item.cropY))
        : 50
    );
    setCropRect(DEFAULT_CROP_RECT);
    setFeedback(null);
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, isProcessing, onClose]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const action = dragActionRef.current;
      const stage = stageRef.current;
      if (!action || !stage) return;
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dxPct = ((e.clientX - action.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - action.startY) / rect.height) * 100;
      const s = action.startRect;
      const minSize = 15;

      if (action.kind === 'move') {
        const nextX = Math.max(0, Math.min(100 - s.w, s.x + dxPct));
        const nextY = Math.max(0, Math.min(100 - s.h, s.y + dyPct));
        setCropRect({ ...s, x: nextX, y: nextY });
        return;
      }

      let left = s.x;
      let top = s.y;
      let right = s.x + s.w;
      let bottom = s.y + s.h;

      if (action.kind === 'nw' || action.kind === 'sw') {
        left = Math.max(0, Math.min(right - minSize, s.x + dxPct));
      }
      if (action.kind === 'ne' || action.kind === 'se') {
        right = Math.min(100, Math.max(left + minSize, s.x + s.w + dxPct));
      }
      if (action.kind === 'nw' || action.kind === 'ne') {
        top = Math.max(0, Math.min(bottom - minSize, s.y + dyPct));
      }
      if (action.kind === 'sw' || action.kind === 'se') {
        bottom = Math.min(100, Math.max(top + minSize, s.y + s.h + dyPct));
      }

      setCropRect({
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
      });
    };

    const handlePointerUp = () => {
      dragActionRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  if (!item) return null;

  const startDrag = (
    kind: 'move' | 'nw' | 'ne' | 'sw' | 'se',
    e: ReactPointerEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragActionRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...cropRect },
    };
  };

  const handleRotate = async (direction: 'left' | 'right') => {
    setFeedback(null);
    setIsProcessing(true);
    try {
      const baked = await rotateImageSrc90(workingSrc, direction);
      if (baked) {
        setWorkingSrc(baked.dataUrl);
        setRotation(0);
        setCropRect(DEFAULT_CROP_RECT);
      } else {
        setRotation((prev) =>
          (((prev + (direction === 'right' ? 90 : -90)) % 360) + 360) % 360
        );
        setFeedback(
          'Rotación aplicada como ajuste visual (enlace externo sin acceso de escritura directo).'
        );
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyPermanentCrop = async () => {
    setFeedback(null);
    setIsProcessing(true);
    try {
      const cropped = await cropImageSrc(workingSrc, cropRect, rotation);
      if (cropped) {
        setWorkingSrc(cropped.dataUrl);
        setRotation(0);
        setCropRect(DEFAULT_CROP_RECT);
        setFeedback('Recorte aplicado a la imagen. Haz clic en "Guardar cambios" para confirmar.');
      } else {
        // Respaldo no destructivo usando encuadre cover + zoom + posición
        const centerX = Math.max(0, Math.min(100, Math.round(cropRect.x + cropRect.w / 2)));
        const centerY = Math.max(0, Math.min(100, Math.round(cropRect.y + cropRect.h / 2)));
        const approxZoom = Math.max(
          1,
          Math.min(2.5, Number((100 / Math.max(40, Math.min(cropRect.w, cropRect.h))).toFixed(2)))
        );
        setFitMode('cover');
        setCropZoom(approxZoom);
        setCropX(centerX);
        setCropY(centerY);
        setActiveToolTab('frame');
        setFeedback(
          'Este enlace externo bloquea edición directa de píxeles; se ajustó el encuadre visual en modo "Llenar cuadro".'
        );
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = () => {
    onApplyPatch(item.id, {
      imageDataUrl: workingSrc,
      rotation,
      fitMode,
      cropZoom,
      cropX,
      cropY,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editar imagen y encuadre de referencia visual"
      onClick={() => !isProcessing && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-[1px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#E5E4DF] bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E4DF] px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900 truncate dark:text-zinc-100">
              Editar imagen ·{' '}
              {item.caption.trim() || item.name || `Espacio ${item.slotIndex + 1}`}
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Rota 90°, recorta el área deseada o ajusta el encuadre dentro del espacio.
            </p>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            aria-label="Cerrar editor de imagen"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECEAE3] bg-[#FAF9F6] px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => void handleRotate('left')}
              className="inline-flex items-center gap-1 rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Rotar 90° izq.</span>
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => void handleRotate('right')}
              className="inline-flex items-center gap-1 rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Rotar 90° der.</span>
            </button>
          </div>

          <div className="inline-flex rounded-md border border-[#DCDAD3] bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setActiveToolTab('crop')}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                activeToolTab === 'crop'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Crop className="h-3.5 w-3.5" />
              <span>Recortar</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveToolTab('frame')}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                activeToolTab === 'frame'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Encuadre</span>
            </button>
          </div>
        </div>

        {/* Lienzo central */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {feedback && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              {feedback}
            </div>
          )}

          {activeToolTab === 'crop' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span>
                  Arrastra el recuadro o sus esquinas para definir el recorte de la imagen.
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCropRect({ x: 0, y: 0, w: 100, h: 100 })}
                    className="rounded border border-[#DCDAD3] bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 cursor-pointer"
                  >
                    Toda
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropRect({ x: 10, y: 15, w: 80, h: 70 })}
                    className="rounded border border-[#DCDAD3] bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 cursor-pointer"
                  >
                    Centrado
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleApplyPermanentCrop()}
                    className="inline-flex items-center gap-1 rounded bg-[#8C5A32] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#744825] disabled:opacity-50 cursor-pointer"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Crop className="h-3 w-3" />
                    )}
                    <span>Aplicar recorte</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center rounded-lg border border-[#E5E4DF] bg-zinc-900/5 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <div
                  ref={stageRef}
                  className="relative inline-block select-none overflow-hidden rounded border border-zinc-300 bg-white dark:border-zinc-700"
                >
                  <ResilientImage
                    src={workingSrc}
                    alt="Vista previa de recorte"
                    style={
                      rotation !== 0
                        ? { transform: `rotate(${rotation}deg)` }
                        : undefined
                    }
                    className="block max-h-[50vh] max-w-full w-auto h-auto pointer-events-none select-none"
                  />

                  {/* Recuadro interactivo de recorte */}
                  <div
                    onPointerDown={(e) => startDrag('move', e)}
                    style={{
                      left: `${cropRect.x}%`,
                      top: `${cropRect.y}%`,
                      width: `${cropRect.w}%`,
                      height: `${cropRect.h}%`,
                      boxShadow: '0 0 0 9999px rgba(9, 9, 11, 0.52)',
                    }}
                    className="absolute cursor-move border-2 border-white"
                  >
                    <div className="pointer-events-none absolute inset-0 border border-dashed border-amber-300/80" />
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                      const posClass =
                        corner === 'nw'
                          ? '-left-1.5 -top-1.5 cursor-nwse-resize'
                          : corner === 'ne'
                            ? '-right-1.5 -top-1.5 cursor-nesw-resize'
                            : corner === 'sw'
                              ? '-left-1.5 -bottom-1.5 cursor-nesw-resize'
                              : '-right-1.5 -bottom-1.5 cursor-nwse-resize';
                      return (
                        <button
                          key={corner}
                          type="button"
                          aria-label={`Ajustar esquina ${corner}`}
                          onPointerDown={(e) => startDrag(corner, e)}
                          className={`absolute h-3.5 w-3.5 rounded-full border border-zinc-900 bg-white shadow ${posClass}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col items-center justify-center rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded border border-[#DCDAD3] bg-white dark:border-zinc-700">
                  <ResilientImage
                    src={workingSrc}
                    alt="Vista previa de encuadre"
                    style={{
                      objectPosition: `${cropX}% ${cropY}%`,
                      transform: `rotate(${rotation}deg) scale(${cropZoom})`,
                      transformOrigin: 'center center',
                    }}
                    className={
                      fitMode === 'cover'
                        ? 'h-full w-full object-cover'
                        : 'max-h-full max-w-full w-auto h-auto object-contain'
                    }
                  />
                </div>
                <span className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Previsualización de encuadre dentro del cuadro
                </span>
              </div>

              <div className="space-y-3 rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-800/50">
                <div>
                  <span className="mb-1.5 block font-semibold text-zinc-800 dark:text-zinc-200">
                    Modo de encuadre
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFitMode('contain')}
                      className={`inline-flex items-center justify-center gap-1 rounded border px-2.5 py-1.5 font-medium cursor-pointer ${
                        fitMode === 'contain'
                          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                          : 'border-[#DCDAD3] bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                      }`}
                    >
                      <Maximize2 className="h-3 w-3" />
                      <span>Completa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFitMode('cover')}
                      className={`inline-flex items-center justify-center gap-1 rounded border px-2.5 py-1.5 font-medium cursor-pointer ${
                        fitMode === 'cover'
                          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                          : 'border-[#DCDAD3] bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                      }`}
                    >
                      <Crop className="h-3 w-3" />
                      <span>Llenar cuadro</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      Zoom de encuadre
                    </span>
                    <span className="font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                      {Math.round(cropZoom * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={cropZoom}
                    onChange={(e) => setCropZoom(Number(e.target.value))}
                    className="w-full accent-[#8C5A32]"
                  />
                </div>

                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      Posición horizontal
                    </span>
                    <span className="font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                      {Math.round(cropX)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={cropX}
                    onChange={(e) => setCropX(Number(e.target.value))}
                    className="w-full accent-[#8C5A32]"
                  />
                </div>

                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      Posición vertical
                    </span>
                    <span className="font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                      {Math.round(cropY)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={cropY}
                    onChange={(e) => setCropY(Number(e.target.value))}
                    className="w-full accent-[#8C5A32]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFitMode('contain');
                    setCropZoom(1);
                    setCropX(50);
                    setCropY(50);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restablecer encuadre</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#E5E4DF] bg-[#FAF9F6] px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Guardar cambios</span>
          </button>
        </div>
      </div>
    </div>
  );
}
