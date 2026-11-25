import { ExternalLink } from 'lucide-react';

interface GoogleSheetShortcutButtonProps {
  label: string;
  sheetUrl: string;
  defaultSheetUrl?: string;
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
  defaultSheetUrl = '',
  size = 'md',
}: GoogleSheetShortcutButtonProps) {
  const effectiveUrl = sheetUrl.trim() || defaultSheetUrl.trim();
  const hasValidUrl = isValidHttpUrl(effectiveUrl);

  const paddingClass = size === 'sm' ? 'px-2.5 py-1.5' : 'px-3 py-2';
  const baseGreenClasses =
    'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700/80 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900/60';

  if (hasValidUrl) {
    return (
      <a
        href={effectiveUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`${label} (se abrirá en una nueva pestaña)`}
        className={`inline-flex items-center gap-1.5 rounded-md border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${paddingClass} ${baseGreenClasses}`}
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled
      title="Enlace directo de Google Sheet no configurado"
      className={`inline-flex items-center gap-1.5 rounded-md border text-xs font-semibold opacity-60 cursor-not-allowed whitespace-nowrap shrink-0 ${paddingClass} border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/80 dark:bg-emerald-950/60 dark:text-emerald-200`}
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
