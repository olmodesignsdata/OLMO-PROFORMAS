import { Check, ExternalLink, Pencil, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';

interface GoogleSheetShortcutButtonProps {
  label: string;
  sheetUrl: string;
  onSaveSheetUrl: (url: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
}

function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function GoogleSheetShortcutButton({
  label,
  sheetUrl,
  onSaveSheetUrl,
  placeholder = 'https://docs.google.com/spreadsheets/d/...',
  size = 'md',
}: GoogleSheetShortcutButtonProps) {
  const cleanUrl = sheetUrl.trim();
  const hasValidUrl = isValidHttpUrl(cleanUrl);
  const [isEditing, setIsEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState(cleanUrl);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftUrl(cleanUrl);
  }, [cleanUrl]);

  useEffect(() => {
    if (!isEditing) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsEditing(false);
        setErrorMsg(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEditing(false);
        setErrorMsg(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isEditing]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draftUrl.trim();
    if (!trimmed) {
      onSaveSheetUrl('');
      setErrorMsg(null);
      setIsEditing(false);
      return;
    }
    if (!isValidHttpUrl(trimmed)) {
      setErrorMsg('Ingresa un enlace válido que inicie con https://');
      return;
    }
    onSaveSheetUrl(trimmed);
    setErrorMsg(null);
    setIsEditing(false);
  };

  const paddingClass = size === 'sm' ? 'px-2.5 py-1.5' : 'px-3 py-2';
  const baseGreenClasses =
    'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700/80 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900/60';

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {hasValidUrl ? (
        <div
          className={`inline-flex items-center overflow-hidden rounded-md border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${baseGreenClasses}`}
        >
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`${label} (se abrirá en una nueva pestaña)`}
            className={`inline-flex items-center gap-1.5 ${paddingClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600`}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </a>
          <button
            type="button"
            onClick={() => {
              setDraftUrl(cleanUrl);
              setErrorMsg(null);
              setIsEditing((prev) => !prev);
            }}
            title={`Editar enlace de ${label}`}
            aria-label={`Editar enlace de ${label}`}
            className="border-l border-emerald-300/80 px-2 py-1.5 text-emerald-700 hover:bg-emerald-200/60 hover:text-emerald-950 dark:border-emerald-700/80 dark:text-emerald-300 dark:hover:bg-emerald-900 cursor-pointer"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraftUrl(cleanUrl);
            setErrorMsg(null);
            setIsEditing((prev) => !prev);
          }}
          title={`Configurar enlace de Google Sheet para ${label}`}
          className={`inline-flex items-center gap-1.5 rounded-md border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${paddingClass} ${baseGreenClasses}`}
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </button>
      )}

      {isEditing && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full z-40 mt-2 w-80 rounded-lg border border-[#DCDAD3] bg-white p-3.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Enlace directo · {label}
            </span>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              aria-label="Cerrar"
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mb-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            Pega la URL de tu Google Sheet para abrirla directamente en una nueva pestaña.
          </p>
          <input
            type="url"
            value={draftUrl}
            onChange={(e) => {
              setDraftUrl(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder={placeholder}
            className="w-full rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 font-mono text-[11px] text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            autoFocus
          />
          {errorMsg && (
            <p className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
              {errorMsg}
            </p>
          )}
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded border border-[#DCDAD3] bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
            >
              <Check className="h-3 w-3" aria-hidden="true" />
              <span>Guardar enlace</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
