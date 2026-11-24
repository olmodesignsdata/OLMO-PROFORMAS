import { ReactNode, useEffect, useMemo, useState } from 'react';
import { getImageFallbackCandidates } from '../utils/logoUtils';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}

/**
 * Renderiza una imagen con respaldo automático para enlaces de Google Drive
 * (thumbnail -> uc?export=view) y ocultamiento limpio si la URL falla,
 * evitando íconos rotos o cuadros dañados en la vista previa y el editor.
 */
export function ResilientImage({
  src,
  alt,
  className,
  fallback = null,
}: ResilientImageProps) {
  const candidates = useMemo(() => getImageFallbackCandidates(src), [src]);
  const [attemptIdx, setAttemptIdx] = useState(0);

  useEffect(() => {
    setAttemptIdx(0);
  }, [src]);

  const activeSrc = candidates[attemptIdx];
  if (!activeSrc) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      className={className}
      onError={() => {
        setAttemptIdx((idx) => idx + 1);
      }}
    />
  );
}
