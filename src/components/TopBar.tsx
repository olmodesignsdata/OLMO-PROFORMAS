import { Download } from 'lucide-react';
import { AppSection } from '../types/proforma';

interface TopBarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  onDownloadPDF: () => void;
  historyCount: number;
  clientsCount: number;
}

export function TopBar({
  activeSection,
  onSelectSection,
  onDownloadPDF,
  historyCount,
  clientsCount,
}: TopBarProps) {
  const navItems: Array<{ id: AppSection; label: string }> = [
    {
      id: 'history',
      label: historyCount > 0 ? `Historial (${historyCount})` : 'Historial',
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
    <header className="no-print sticky top-0 z-30 border-b border-[#E5E4DF] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-8 px-4 py-3 sm:px-6">
        {/* Zona 1: Wordmark único en una línea */}
        <button
          type="button"
          onClick={() => onSelectSection('history')}
          className="font-display text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C5A32]"
        >
          OLMO Proformas
        </button>

        {/* Zona 2: Enlaces de navegación limpios en una sola línea */}
        <nav
          aria-label="Navegación principal"
          className="flex items-center gap-5 overflow-x-auto sm:gap-7"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`relative py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C5A32] ${
                  isActive
                    ? 'text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[13px] h-[2px] bg-[#8C5A32]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zona 3: 1 acción principal */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onDownloadPDF}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C5A32] focus-visible:ring-offset-2"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Descargar PDF</span>
          </button>
        </div>
      </div>
    </header>
  );
}
