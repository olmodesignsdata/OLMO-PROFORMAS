import { Moon, Sun } from 'lucide-react';
import { AppSection, ThemeMode } from '../types/proforma';
import { PdfIcon } from './PdfIcon';

interface TopBarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  onDownloadPDF: () => void;
  historyCount: number;
  clientsCount: number;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
}

export function TopBar({
  activeSection,
  onSelectSection,
  onDownloadPDF,
  historyCount,
  clientsCount,
  themeMode,
  onChangeThemeMode,
}: TopBarProps) {
  const navItems: Array<{ id: AppSection; label: string }> = [
    {
      id: 'history',
      label: historyCount > 0 ? `PROFORMAS (${historyCount})` : 'PROFORMAS',
    },
    { id: 'editor', label: 'Editor' },
    { id: 'preview', label: 'Vista Previa' },
    {
      id: 'clients',
      label: clientsCount > 0 ? `Clientes (${clientsCount})` : 'Clientes',
    },
    { id: 'integration', label: 'Integración' },
  ];

  return (
    <header className="no-print sticky top-0 z-30 border-b border-[#E3E1DA] bg-white/90 shadow-[0_1px_2px_rgba(24,24,27,0.03)] backdrop-blur-md transition-colors duration-150 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-6 px-4 py-3 sm:px-6">
        {/* Zona 1: Wordmark único en una línea */}
        <button
          type="button"
          onClick={() => onSelectSection('history')}
          className="font-display text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C5A32] dark:text-zinc-100"
        >
          OLMO Proformas
        </button>

        {/* Zona 2: Enlaces de navegación limpios en una sola línea */}
        <nav
          aria-label="Navegación principal"
          className="flex items-center gap-1.5 overflow-x-auto sm:gap-2"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`relative rounded-md px-3 py-1.5 text-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C5A32] ${
                  isActive
                    ? 'bg-[#FAF6F1] font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'font-medium text-zinc-500 hover:bg-[#F5F3EE] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-[-11px] h-[2px] rounded-full bg-[#8C5A32] dark:bg-[#C68B59]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zona 3: Interruptor Claro / Modo Oscuro + Botón PDF negro */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            role="group"
            aria-label="Seleccionar tema de la interfaz"
            className="inline-flex items-center rounded-lg border border-[#DCDAD3] bg-[#FAF9F6] p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
          >
            <button
              type="button"
              onClick={() => onChangeThemeMode('light')}
              aria-pressed={themeMode === 'light'}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                themeMode === 'light'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Sun className="h-3.5 w-3.5 text-[#8C5A32] dark:text-[#C68B59]" aria-hidden="true" />
              <span>Claro</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeThemeMode('dark')}
              aria-pressed={themeMode === 'dark'}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                themeMode === 'dark'
                  ? 'bg-zinc-950 text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Moon className="h-3.5 w-3.5 text-[#8C5A32] dark:text-[#C68B59]" aria-hidden="true" />
              <span>Modo Oscuro</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onDownloadPDF}
            className="inline-flex items-center gap-2 rounded-lg border border-black bg-black px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C5A32] focus-visible:ring-offset-2 dark:border-zinc-700"
          >
            <PdfIcon className="h-4 w-4 text-white" />
            <span>Descargar PDF</span>
          </button>
        </div>
      </div>
    </header>
  );
}
