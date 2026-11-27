import { CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react';
import { getImageFallbackCandidates } from '../utils/logoUtils';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  crossOrigin?: 'anonymous' | 'use-credentials';
}

interface ImageAttempt {
  src: string;
  crossOrigin?: 'anonymous' | 'use-credentials';
}

/**
 * Renderiza una imagen con respaldo automático para enlaces de Google Drive
 * (URL directa / lh3 -> thumbnail -> uc?export=view) y soporte crossOrigin,
 * evitando íconos rotos o cuadros dañados en la vista previa y el editor.
 */
export function ResilientImage({
  src,
  alt,
  className,
  style,
  fallback = null,
  crossOrigin,
}: ResilientImageProps) {
  const attempts = useMemo<ImageAttempt[]>(() => {
    const candidates = getImageFallbackCandidates(src);
    if (!candidates.length) return [];
    if (!crossOrigin) {
      return candidates.map((candidate) => ({ src: candidate }));
    }
    const corsAttempts: ImageAttempt[] = candidates.map((candidate) => ({
      src: candidate,
      crossOrigin,
    }));
    const nonCorsAttempts: ImageAttempt[] = candidates
      .filter((candidate) => !candidate.startsWith('data:'))
      .map((candidate) => ({ src: candidate }));
    return [...corsAttempts, ...nonCorsAttempts];
  }, [src, crossOrigin]);

  const [attemptIdx, setAttemptIdx] = useState(0);

  useEffect(() => {
    setAttemptIdx(0);
  }, [src, crossOrigin]);

  const activeAttempt = attempts[attemptIdx];
  if (!activeAttempt) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={activeAttempt.src}
      alt={alt}
      className={className}
      style={style}
      crossOrigin={
        activeAttempt.src.startsWith('data:')
          ? undefined
          : activeAttempt.crossOrigin
      }
      onError={() => {
        setAttemptIdx((idx) => idx + 1);
      }}
    />
  );
}
