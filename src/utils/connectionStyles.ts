export type ConnectionButtonVariant = 'solid' | 'outline' | 'icon';

/**
 * Devuelve clases Tailwind consistentes (verde si conectado/configurado, rojo si falta URL/referencia o hubo error)
 * para todos los botones vinculados con Google Sheets, Apps Script y Excel.
 */
export function getConnectionButtonClasses(
  isConnected: boolean,
  variant: ConnectionButtonVariant = 'outline'
): string {
  if (variant === 'solid') {
    return isConnected
      ? 'border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500'
      : 'border border-red-600 bg-red-600 text-white hover:bg-red-700 dark:border-red-500 dark:bg-red-600 dark:hover:bg-red-500';
  }

  if (variant === 'icon') {
    return isConnected
      ? 'border border-emerald-500/80 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-600/80 dark:bg-emerald-950/70 dark:text-emerald-300 dark:hover:bg-emerald-900/70'
      : 'border border-red-400 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-700/80 dark:bg-red-950/70 dark:text-red-300 dark:hover:bg-red-900/70';
  }

  return isConnected
    ? 'border border-emerald-500/80 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-600/80 dark:bg-emerald-950/70 dark:text-emerald-200 dark:hover:bg-emerald-900/70'
    : 'border border-red-400 bg-red-50 text-red-900 hover:bg-red-100 dark:border-red-700/80 dark:bg-red-950/70 dark:text-red-200 dark:hover:bg-red-900/70';
}
