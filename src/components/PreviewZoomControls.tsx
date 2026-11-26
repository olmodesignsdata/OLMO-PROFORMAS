import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { ReactNode, useEffect, useRef } from 'react';

export const MIN_COMPARE_PREVIEW_ZOOM = 0.35;
export const MAX_COMPARE_PREVIEW_ZOOM = 1.4;
export const COMPARE_PREVIEW_ZOOM_STEP = 0.1;
export const DEFAULT_COMPARE_PREVIEW_ZOOM = 0.56;

interface PreviewZoomControlsProps {
  zoom: number;
  defaultZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  step?: number;
  onChangeZoom: (nextZoom: number) => void;
  contextLabel?: string;
}

export function clampPreviewZoom(
  value: number,
  minZoom = MIN_COMPARE_PREVIEW_ZOOM,
  maxZoom = MAX_COMPARE_PREVIEW_ZOOM
): number {
  const rounded = Math.round(value * 100) / 100;
  return Math.min(maxZoom, Math.max(minZoom, rounded));
}

export function clampCompareZoom(value: number): number {
  return clampPreviewZoom(
    value,
    MIN_COMPARE_PREVIEW_ZOOM,
    MAX_COMPARE_PREVIEW_ZOOM
  );
}

export function PreviewZoomControls({
  zoom,
  defaultZoom = DEFAULT_COMPARE_PREVIEW_ZOOM,
  minZoom = MIN_COMPARE_PREVIEW_ZOOM,
  maxZoom = MAX_COMPARE_PREVIEW_ZOOM,
  step = COMPARE_PREVIEW_ZOOM_STEP,
  onChangeZoom,
  contextLabel,
}: PreviewZoomControlsProps) {
  const percent = Math.round(zoom * 100);
  const defaultPercent = Math.round(defaultZoom * 100);
  const canZoomOut = zoom > minZoom + 0.001;
  const canZoomIn = zoom < maxZoom - 0.001;
  const isDefault = Math.abs(zoom - defaultZoom) < 0.005;

  return (
    <div
      role="group"
      aria-label={
        contextLabel
          ? `Controles de zoom para ${contextLabel}`
          : 'Controles de zoom de vista previa'
      }
      className="inline-flex items-center rounded-md border border-[#DCDAD3] bg-white shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 shrink-0"
    >
      <button
        type="button"
        disabled={!canZoomOut}
        onClick={() =>
          onChangeZoom(clampPreviewZoom(zoom - step, minZoom, maxZoom))
        }
        title="Alejar vista previa (-10% · Ctrl + rueda abajo)"
        aria-label="Alejar vista previa"
        className="inline-flex items-center justify-center rounded-l-md px-2 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <span className="h-4 w-px bg-[#E5E4DF] dark:bg-zinc-700" aria-hidden="true" />

      <span
        title={`Escala actual: ${percent}% (Ctrl + rueda del mouse para acercar o alejar)`}
        className="min-w-[44px] px-2 py-1 text-center font-mono text-[11px] font-semibold text-zinc-800 tabular-nums select-none dark:text-zinc-100"
      >
        {percent}%
      </span>

      <span className="h-4 w-px bg-[#E5E4DF] dark:bg-zinc-700" aria-hidden="true" />

      <button
        type="button"
        disabled={!canZoomIn}
        onClick={() =>
          onChangeZoom(clampPreviewZoom(zoom + step, minZoom, maxZoom))
        }
        title="Acercar vista previa (+10% · Ctrl + rueda arriba)"
        aria-label="Acercar vista previa"
        className="inline-flex items-center justify-center px-2 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <span className="h-4 w-px bg-[#E5E4DF] dark:bg-zinc-700" aria-hidden="true" />

      <button
        type="button"
        disabled={isDefault}
        onClick={() => onChangeZoom(defaultZoom)}
        title={`Restablecer zoom (${defaultPercent}%)`}
        aria-label={`Restablecer zoom (${defaultPercent}%)`}
        className="inline-flex items-center gap-1 rounded-r-md px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        <span>Ajustar</span>
      </button>
    </div>
  );
}

interface CtrlWheelZoomBoxProps {
  onZoomStep: (direction: 1 | -1) => void;
  enabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function CtrlWheelZoomBox({
  onZoomStep,
  enabled = true,
  className = '',
  children,
}: CtrlWheelZoomBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onZoomStepRef = useRef(onZoomStep);

  useEffect(() => {
    onZoomStepRef.current = onZoomStep;
  }, [onZoomStep]);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY === 0) return;
      onZoomStepRef.current(e.deltaY < 0 ? 1 : -1);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [enabled]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
