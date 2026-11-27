import { CSSProperties, ReactNode } from 'react';
import { VisualReferenceItem } from '../types/proforma';
import { normalizeVisualReferenceFitMode } from '../utils/formatters';
import { ResilientImage } from './ResilientImage';

interface VisualRefImageFrameProps {
  item: Pick<
    VisualReferenceItem,
    'imageDataUrl' | 'caption' | 'name' | 'rotation' | 'fitMode' | 'cropZoom' | 'cropX' | 'cropY'
  >;
  alt: string;
  fallback?: ReactNode;
}

export function VisualRefImageFrame({
  item,
  alt,
  fallback,
}: VisualRefImageFrameProps) {
  const fitMode = normalizeVisualReferenceFitMode(item.fitMode);
  const rotation =
    (((Math.round((item.rotation ?? 0) / 90) * 90) % 360) + 360) % 360;
  const zoom =
    typeof item.cropZoom === 'number' && Number.isFinite(item.cropZoom)
      ? Math.max(1, Math.min(2.5, item.cropZoom))
      : 1;
  const posX =
    typeof item.cropX === 'number' && Number.isFinite(item.cropX)
      ? Math.max(0, Math.min(100, item.cropX))
      : 50;
  const posY =
    typeof item.cropY === 'number' && Number.isFinite(item.cropY)
      ? Math.max(0, Math.min(100, item.cropY))
      : 50;

  const hasTransform = rotation !== 0 || zoom > 1.005;
  const style: CSSProperties | undefined =
    fitMode === 'cover' || hasTransform
      ? {
          objectPosition: `${posX}% ${posY}%`,
          ...(hasTransform
            ? {
                transform: `${rotation !== 0 ? `rotate(${rotation}deg) ` : ''}${
                  zoom > 1.005 ? `scale(${zoom})` : ''
                }`.trim(),
                transformOrigin: 'center center',
              }
            : {}),
        }
      : undefined;

  return (
    <ResilientImage
      src={item.imageDataUrl}
      alt={alt}
      style={style}
      className={
        fitMode === 'cover'
          ? 'h-full w-full object-cover'
          : 'max-h-full max-w-full w-auto h-auto object-contain'
      }
      fallback={fallback}
    />
  );
}
