import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  Info,
  Moon,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AppNotification, AppSection, ThemeMode } from '../types/proforma';
import { PdfIcon } from './PdfIcon';

interface TopBarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  onDownloadPDF: () => void;
  historyCount: number;
  clientsCount: number;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  notificationsEnabled: boolean;
  onToggleNotificationsEnabled: (enabled: boolean) => void;
  notifications: AppNotification[];
  onMarkNotificationRead: (id: string) => void;
  onDismissNotification: (id: string) => void;
  onAddReminder: (title: string, message: string) => void;
}

export function TopBar({
  activeSection,
  onSelectSection,
  onDownloadPDF,
  historyCount,
  clientsCount,
  themeMode,
  onChangeThemeMode,
  notificationsEnabled,
  onToggleNotificationsEnabled,
  notifications,
  onMarkNotificationRead,
  onDismissNotification,
  onAddReminder,
}: TopBarProps) {
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const notifPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showNotifPanel) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        notifPanelRef.current &&
        !notifPanelRef.current.contains(e.target as Node)
      ) {
        setShowNotifPanel(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifPanel(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showNotifPanel]);

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
    { id: 'dashboard', label: 'Dashboard' },
  ];

  const unreadNotifications = notifications.filter((n) => !n.read);
  const unreadCount = unreadNotifications.length;
  const featuredNotification =
    unreadNotifications[0] ?? notifications[0] ?? null;

  const handleSubmitReminder = (e: FormEvent) => {
    e.preventDefault();
    const title = reminderTitle.trim();
    const msg = reminderMessage.trim();
    if (!title && !msg) return;
    onAddReminder(
      title || 'Recordatorio pendiente',
      msg || title || 'Revisar tarea pendiente en OLMO Proformas.'
    );
    setReminderTitle('');
    setReminderMessage('');
    setShowReminderForm(false);
  };

  return (
    <header className="no-print sticky top-0 z-30 border-b border-[#E3E1DA] bg-white/95 shadow-[0_1px_2px_rgba(24,24,27,0.03)] backdrop-blur-md transition-colors duration-150 dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-none">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
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

        {/* Zona 3: Campana de notificaciones + Interruptor Claro / Modo Oscuro + Botón PDF negro */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Campana de notificaciones persistentes */}
          <div ref={notifPanelRef} className="relative">
            <button
              type="button"
              onClick={() => setShowNotifPanel((prev) => !prev)}
              aria-expanded={showNotifPanel}
              aria-label={
                notificationsEnabled
                  ? `Notificaciones activas (${unreadCount} sin leer)`
                  : 'Notificaciones desactivadas'
              }
              title={
                notificationsEnabled
                  ? `Notificaciones activas (${notifications.length} aviso${notifications.length === 1 ? '' : 's'})`
                  : 'Notificaciones desactivadas (clic para configurar)'
              }
              className={`relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                notificationsEnabled
                  ? unreadCount > 0
                    ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700/80 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/60'
                    : 'border-[#DCDAD3] bg-[#FAF9F6] text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                  : 'border-[#DCDAD3] bg-zinc-100 text-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-500 dark:hover:text-zinc-300'
              }`}
            >
              {notificationsEnabled ? (
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {notificationsEnabled && unreadCount > 0 && (
                <span className="font-mono text-[11px] font-bold tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifPanel && (
              <div className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-[#DCDAD3] bg-white p-3.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-2 border-b border-[#E5E4DF] pb-2.5 dark:border-zinc-800">
                  <div>
                    <h2 className="font-display text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Centro de Notificaciones
                    </h2>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Alertas de estado y recordatorios persistentes
                    </p>
                  </div>

                  {/* Interruptor Activar / Desactivar */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notificationsEnabled}
                    onClick={() =>
                      onToggleNotificationsEnabled(!notificationsEnabled)
                    }
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                      notificationsEnabled
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    <span>{notificationsEnabled ? 'Activas' : 'Desactivadas'}</span>
                  </button>
                </div>

                {/* Crear recordatorio manual */}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {notifications.length} aviso(s) · {unreadCount} sin leer
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowReminderForm((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    <span>Nuevo recordatorio</span>
                  </button>
                </div>

                {showReminderForm && (
                  <form
                    onSubmit={handleSubmitReminder}
                    className="mt-2.5 space-y-2 rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-2.5 dark:border-zinc-800 dark:bg-zinc-800/60"
                  >
                    <input
                      type="text"
                      value={reminderTitle}
                      onChange={(e) => setReminderTitle(e.target.value)}
                      placeholder="Título del recordatorio (ej: Enviar proforma)"
                      className="w-full rounded border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <input
                      type="text"
                      value={reminderMessage}
                      onChange={(e) => setReminderMessage(e.target.value)}
                      placeholder="Detalle opcional..."
                      className="w-full rounded border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowReminderForm(false)}
                        className="rounded border border-[#DCDAD3] bg-white px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="rounded bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer"
                      >
                        Guardar
                      </button>
                    </div>
                  </form>
                )}

                {!notificationsEnabled ? (
                  <p className="mt-3 rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
                    Las notificaciones de la barra superior están desactivadas. Actívalas arriba cuando desees ver alertas persistentes.
                  </p>
                ) : notifications.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
                    Sin notificaciones o tareas pendientes.
                  </p>
                ) : (
                  <div className="mt-2.5 max-h-72 space-y-2 overflow-y-auto pr-0.5">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`rounded-lg border p-2.5 text-xs ${
                          notif.read
                            ? 'border-[#E5E4DF] bg-[#FAF9F6]/60 opacity-75 dark:border-zinc-800 dark:bg-zinc-800/40'
                            : notif.kind === 'error'
                              ? 'border-red-200 bg-red-50/70 dark:border-red-900/70 dark:bg-red-950/40'
                              : notif.kind === 'warning'
                                ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/40'
                                : 'border-[#E5E4DF] bg-white dark:border-zinc-700 dark:bg-zinc-800/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {notif.title}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-snug text-zinc-600 dark:text-zinc-300">
                              {notif.message}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!notif.read && (
                              <button
                                type="button"
                                onClick={() => onMarkNotificationRead(notif.id)}
                                title="Marcar como leída"
                                aria-label="Marcar como leída"
                                className="rounded p-1 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950 cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDismissNotification(notif.id)}
                              title="Descartar aviso"
                              aria-label="Descartar aviso"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {notif.actionSection && notif.actionLabel && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSection(notif.actionSection!);
                              setShowNotifPanel(false);
                            }}
                            className="mt-1.5 text-[11px] font-semibold text-[#8C5A32] hover:underline dark:text-[#D59B69] cursor-pointer"
                          >
                            {notif.actionLabel} →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

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

      {/* Barra superior persistente de notificaciones activas */}
      {notificationsEnabled && featuredNotification && (
        <div
          role="region"
          aria-label="Notificación persistente"
          className={`border-t px-4 py-1.5 text-xs sm:px-6 ${
            featuredNotification.kind === 'error'
              ? 'border-red-200 bg-red-50/90 text-red-900 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-200'
              : featuredNotification.kind === 'warning'
                ? 'border-amber-200 bg-amber-50/90 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/60 dark:text-amber-200'
                : 'border-[#E5E4DF] bg-[#FAF6F1] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-200'
          }`}
        >
          <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {featuredNotification.kind === 'info' ||
              featuredNotification.kind === 'reminder' ? (
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">
                <strong className="font-semibold">
                  {featuredNotification.title}:
                </strong>{' '}
                {featuredNotification.message}
              </span>
              {featuredNotification.actionSection &&
                featuredNotification.actionLabel && (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectSection(featuredNotification.actionSection!)
                    }
                    className="shrink-0 font-semibold underline hover:opacity-80 cursor-pointer"
                  >
                    {featuredNotification.actionLabel}
                  </button>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {notifications.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowNotifPanel(true)}
                  className="rounded px-2 py-0.5 text-[11px] font-semibold underline hover:opacity-80 cursor-pointer tabular-nums"
                >
                  Ver todos ({notifications.length})
                </button>
              )}
              {!featuredNotification.read && (
                <button
                  type="button"
                  onClick={() =>
                    onMarkNotificationRead(featuredNotification.id)
                  }
                  className="inline-flex items-center gap-1 rounded border border-current/25 bg-white/60 px-2 py-0.5 text-[11px] font-medium hover:bg-white dark:bg-zinc-900/50 dark:hover:bg-zinc-900 cursor-pointer"
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  <span>Leída</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismissNotification(featuredNotification.id)}
                title="Descartar aviso"
                aria-label="Descartar notificación actual"
                className="inline-flex items-center gap-1 rounded border border-current/25 bg-white/60 px-2 py-0.5 text-[11px] font-medium hover:bg-white dark:bg-zinc-900/50 dark:hover:bg-zinc-900 cursor-pointer"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                <span>Descartar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
