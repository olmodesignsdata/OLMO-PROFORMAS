import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  CopyPlus,
  Edit3,
  FilePlus2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { DEFAULT_CLIENTS_SHEET_URL } from '../data/defaults';
import {
  ClientsImportConfig,
  ClientsImportStrategy,
  SavedClient,
} from '../types/proforma';
import { fetchClientsFromAppsScript } from '../utils/cloudSync';
import { getConnectionButtonClasses } from '../utils/connectionStyles';
import {
  ClientImportRow,
  DEFAULT_CLIENTS_SHEET_NAME,
  fetchAndParseGoogleSheetClients,
  SpreadsheetSheetNotFoundError,
} from '../utils/googleSheets';
import { GoogleSheetShortcutButton } from './GoogleSheetShortcutButton';

export type ClientDraftPayload = Omit<
  SavedClient,
  'id' | 'createdAt' | 'updatedAt'
>;

export interface ClientsImportSummary {
  added: number;
  updated: number;
  total: number;
}

interface ClientsViewProps {
  clients: SavedClient[];
  importConfig: ClientsImportConfig;
  onImportConfigChange: (next: ClientsImportConfig) => void;
  onImportClients: (
    rows: ClientImportRow[],
    strategy: ClientsImportStrategy
  ) => ClientsImportSummary;
  onSaveClient: (
    payload: ClientDraftPayload,
    editingId?: string
  ) => Promise<{ ok: boolean; message: string } | void> | void;
  onDuplicateClient: (client: SavedClient) => void;
  onDeleteClient: (
    id: string
  ) => Promise<{ ok: boolean; message: string } | void> | void;
  onUseClientInProforma: (client: SavedClient) => void;
  onGoToEditor: () => void;
  onNotify?: (text: string, isError?: boolean) => void;
  isSyncingClients?: boolean;
  clientsSyncFeedback?: { ok: boolean; message: string } | null;
  onSyncClientsFromSheet?: () => Promise<{
    ok: boolean;
    message: string;
    sheetNotFoundError?: SpreadsheetSheetNotFoundError;
  }>;
  onClearClientsSyncFeedback?: () => void;
  clientsSheetUrl?: string;
}

const EMPTY_FORM: ClientDraftPayload = {
  cliente: '',
  contacto: '',
  telefono: '',
  correo: '',
  ubicacion: '',
};

export function ClientsView({
  clients,
  importConfig,
  onImportConfigChange,
  onImportClients,
  onSaveClient,
  onDuplicateClient,
  onDeleteClient,
  onUseClientInProforma,
  onGoToEditor,
  onNotify,
  isSyncingClients = false,
  clientsSyncFeedback = null,
  onSyncClientsFromSheet,
  onClearClientsSyncFeedback,
  clientsSheetUrl = '',
}: ClientsViewProps) {
  const cardSurface =
    'rounded-xl border border-[#E3E1DA] bg-white shadow-[0_1px_3px_rgba(24,24,27,0.04)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none';
  const [query, setQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ClientDraftPayload>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteClient, setConfirmDeleteClient] =
    useState<SavedClient | null>(null);
  const [isDeletingClient, setIsDeletingClient] = useState(false);

  const [isRefreshingLocal, setIsRefreshingLocal] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [pendingEditConfirm, setPendingEditConfirm] = useState<{
    payload: ClientDraftPayload;
    editingId: string;
    originalCliente: string;
  } | null>(null);
  const [syncBanner, setSyncBanner] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const text = [c.cliente, c.contacto, c.telefono, c.correo, c.ubicacion]
        .join(' ')
        .toLowerCase();
      return text.includes(q);
    });
  }, [clients, query]);

  const openNewForm = () => {
    setEditingId(null);
    setFormState(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (client: SavedClient) => {
    setEditingId(client.id);
    setFormState({
      cliente: client.cliente,
      contacto: client.contacto,
      telefono: client.telefono,
      correo: client.correo,
      ubicacion: client.ubicacion,
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormState(EMPTY_FORM);
    setFormError(null);
  };

  const executeSaveClient = async (
    cleanPayload: ClientDraftPayload,
    targetEditingId?: string
  ) => {
    setIsSavingClient(true);
    try {
      const res = await onSaveClient(cleanPayload, targetEditingId);
      if (res && typeof res === 'object' && 'message' in res) {
        setSyncBanner({ ok: res.ok, message: res.message });
      }
      closeForm();
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formState.cliente.trim()) {
      setFormError('El nombre del cliente es obligatorio.');
      return;
    }

    const cleanPayload: ClientDraftPayload = {
      cliente: formState.cliente.trim(),
      contacto: formState.contacto.trim(),
      telefono: formState.telefono.trim(),
      correo: formState.correo.trim(),
      ubicacion: formState.ubicacion.trim(),
    };

    if (editingId) {
      const original = clients.find((c) => c.id === editingId);
      setPendingEditConfirm({
        payload: cleanPayload,
        editingId,
        originalCliente: original?.cliente ?? cleanPayload.cliente,
      });
      return;
    }

    await executeSaveClient(cleanPayload, undefined);
  };

  const handleConfirmEditSave = async () => {
    if (!pendingEditConfirm) return;
    const target = pendingEditConfirm;
    setPendingEditConfirm(null);
    await executeSaveClient(target.payload, target.editingId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteClient) return;
    setIsDeletingClient(true);
    try {
      const res = await onDeleteClient(confirmDeleteClient.id);
      if (res && typeof res === 'object' && 'message' in res) {
        setSyncBanner({ ok: res.ok, message: res.message });
      }
      setConfirmDeleteClient(null);
    } finally {
      setIsDeletingClient(false);
    }
  };

  const applyImportResult = (
    rows: ClientImportRow[],
    ignoredCount: number,
    sheetNameUsed?: string
  ) => {
    const summary = onImportClients(rows, importConfig.strategy);
    onImportConfigChange({
      ...importConfig,
      sheetName: sheetNameUsed || importConfig.sheetName,
      lastImportedAt: new Date().toISOString(),
    });
    const sheetNote = sheetNameUsed ? ` desde la hoja "${sheetNameUsed}"` : '';
    const ignoredNote =
      ignoredCount > 0
        ? ` (${ignoredCount} fila(s) vacía(s) o sin cliente omitida(s))`
        : '';
    const message =
      importConfig.strategy === 'replace'
        ? `Lista de clientes reemplazada${sheetNote}: ${summary.added} cliente(s) importado(s)${ignoredNote}.`
        : `Clientes actualizados${sheetNote}: ${summary.added} agregado(s), ${summary.updated} actualizado(s)${ignoredNote}.`;

    setSyncBanner({ ok: true, message });
  };

  const handleDirectRefresh = async () => {
    const hasSheetUrl = Boolean(importConfig.sheetUrl.trim());
    const hasAppsScriptUrl = Boolean(importConfig.appsScriptUrl.trim());

    if (!hasSheetUrl && !hasAppsScriptUrl) {
      const msg =
        'Configura primero la URL de Google Sheets o Apps Script de clientes en Integración para usar Refrescar.';
      setSyncBanner({ ok: false, message: msg });
      onNotify?.(msg, true);
      return;
    }

    if (onSyncClientsFromSheet) {
      setSyncBanner(null);
      await onSyncClientsFromSheet();
      return;
    }

    setIsRefreshingLocal(true);
    setSyncBanner(null);

    try {
      if (hasAppsScriptUrl) {
        const rows = await fetchClientsFromAppsScript(
          importConfig.appsScriptUrl,
          importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME
        );
        onImportClients(rows, 'replace');
        onImportConfigChange({
          ...importConfig,
          lastImportedAt: new Date().toISOString(),
        });
        const targetSheet = importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME;
        setSyncBanner({
          ok: true,
          message:
            rows.length > 0
              ? `Clientes sincronizados desde "${targetSheet}": ${rows.length} cliente(s) vigentes en Sheet.`
              : `Conexión correcta con "${targetSheet}". La pestaña no contiene clientes actualmente.`,
        });
      } else {
        const result = await fetchAndParseGoogleSheetClients(
          importConfig.sheetUrl,
          importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME
        );
        const summary = onImportClients(result.clients, 'replace');
        onImportConfigChange({
          ...importConfig,
          sheetName: result.sheetNameUsed || importConfig.sheetName,
          lastImportedAt: new Date().toISOString(),
        });
        const sheetNote = result.sheetNameUsed
          ? ` desde la hoja "${result.sheetNameUsed}"`
          : '';
        setSyncBanner({
          ok: true,
          message: `Clientes sincronizados${sheetNote}: ${summary.added} cliente(s) vigentes en Sheet.`,
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo refrescar la lista de clientes desde Google Sheets.';
      setSyncBanner({ ok: false, message: msg });
      onNotify?.(msg, true);
    } finally {
      setIsRefreshingLocal(false);
    }
  };

  const inputClass =
    'w-full rounded-md border border-[#DCDAD3] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500';
  const labelClass = 'mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400';

  const isRefreshingClients = isRefreshingLocal || isSyncingClients;
  const effectiveSyncBanner = syncBanner ?? clientsSyncFeedback ?? null;

  const isDirectorySheetReady =
    (Boolean(importConfig.sheetUrl.trim()) ||
      Boolean(importConfig.appsScriptUrl.trim())) &&
    effectiveSyncBanner?.ok !== false;

  return (
    <div className="w-full space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Directorio de Clientes
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Guarda clientes frecuentes en este navegador para completar
            automáticamente futuras proformas y editar libremente cualquier dato
            puntual.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={openNewForm}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              <span>Nuevo Cliente</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente, contacto o correo..."
              className="w-full rounded-md border border-[#DCDAD3] bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
            />
          </div>

          <button
            type="button"
            onClick={handleDirectRefresh}
            disabled={isRefreshingClients}
            title="Volver a consultar automáticamente la fuente de Google Sheets guardada"
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer ${getConnectionButtonClasses(isDirectorySheetReady, 'outline')}`}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                isRefreshingClients ? 'animate-spin' : ''
              }`}
              aria-hidden="true"
            />
            <span>
              {isRefreshingClients ? 'Refrescando...' : 'Refrescar'}
            </span>
          </button>

          <GoogleSheetShortcutButton
            label="Abrir Sheet Clientes"
            sheetUrl={
              clientsSheetUrl.trim() || importConfig.sheetUrl.trim()
            }
            defaultSheetUrl={DEFAULT_CLIENTS_SHEET_URL}
          />
        </div>
      </div>

      {effectiveSyncBanner && (
        <div
          className={`flex items-start justify-between gap-3 rounded-md border px-4 py-2.5 text-xs ${
            effectiveSyncBanner.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-200'
          }`}
        >
          <div className="flex items-start gap-2">
            {effectiveSyncBanner.ok ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-400"
                aria-hidden="true"
              />
            )}
            <span>{effectiveSyncBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSyncBanner(null);
              onClearClientsSyncFeedback?.();
            }}
            aria-label="Cerrar aviso"
            className="rounded p-0.5 text-current opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className={`p-5 space-y-4 ${cardSurface}`}
        >
          <div className="flex items-center justify-between border-b border-[#E5E4DF] pb-3 dark:border-zinc-800">
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {editingId ? 'Editar Cliente Guardado' : 'Agregar Nuevo Cliente'}
            </h2>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Cerrar formulario"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {formError && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="dir-cliente" className={labelClass}>
                Cliente <span className="text-[#8C5A32] dark:text-amber-400">*</span>
              </label>
              <input
                id="dir-cliente"
                type="text"
                placeholder="Nombre del cliente o empresa"
                value={formState.cliente}
                onChange={(e) => {
                  setFormState((s) => ({ ...s, cliente: e.target.value }));
                  if (formError) setFormError(null);
                }}
                className={inputClass}
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="dir-contacto" className={labelClass}>
                Contacto
              </label>
              <input
                id="dir-contacto"
                type="text"
                placeholder="Nombre de contacto / arquitecto"
                value={formState.contacto}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, contacto: e.target.value }))
                }
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="dir-telefono" className={labelClass}>
                Teléfono
              </label>
              <input
                id="dir-telefono"
                type="tel"
                placeholder="+506 8800-0000"
                value={formState.telefono}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, telefono: e.target.value }))
                }
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="dir-correo" className={labelClass}>
                Correo electrónico
              </label>
              <input
                id="dir-correo"
                type="email"
                placeholder="correo@cliente.com"
                value={formState.correo}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, correo: e.target.value }))
                }
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="dir-ubicacion" className={labelClass}>
                Ubicación
              </label>
              <input
                id="dir-ubicacion"
                type="text"
                placeholder="Provincia, cantón o condominio"
                value={formState.ubicacion}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, ubicacion: e.target.value }))
                }
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isSavingClient}
              onClick={closeForm}
              className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSavingClient}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
            >
              {isSavingClient ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {isSavingClient
                  ? 'Guardando...'
                  : editingId
                    ? 'Guardar Cambios'
                    : 'Guardar Cliente'}
              </span>
            </button>
          </div>
        </form>
      )}

      {clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#DCDAD3] bg-white px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <Users
            className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600"
            aria-hidden="true"
          />
          <p className="mt-3 font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Aún no hay clientes guardados en el directorio
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Agrega clientes aquí o usa el botón &ldquo;Guardar en
            directorio&rdquo; dentro de &ldquo;Datos del Cliente y
            Proyecto&rdquo; para reutilizarlos con un clic.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={openNewForm}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Agregar Primer Cliente</span>
            </button>
            <button
              type="button"
              onClick={onGoToEditor}
              className="rounded-md border border-[#DCDAD3] bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Volver al Editor
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#E5E4DF] bg-white px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            No se encontraron clientes que coincidan con &ldquo;{query}&rdquo;.
          </p>
        </div>
      ) : (
        <div className={`overflow-x-auto ${cardSurface}`}>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5E4DF] bg-[#FAF9F6] text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Teléfono / Correo</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DF] dark:divide-zinc-800">
              {filtered.map((client) => (
                  <tr
                    key={client.id}
                    className="transition-colors hover:bg-[#FAF9F6]/70 dark:hover:bg-zinc-800/60"
                  >
                    <td className="px-4 py-3.5 font-semibold text-zinc-900 dark:text-zinc-100">
                      {client.cliente}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-700 dark:text-zinc-300">
                      {client.contacto || (
                        <span className="text-zinc-400 dark:text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
                      {client.telefono && (
                        <div className="flex items-center gap-1.5">
                          <Phone
                            className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-500"
                            aria-hidden="true"
                          />
                          <span>{client.telefono}</span>
                        </div>
                      )}
                      {client.correo && (
                        <div className="flex items-center gap-1.5">
                          <Mail
                            className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-500"
                            aria-hidden="true"
                          />
                          <span>{client.correo}</span>
                        </div>
                      )}
                      {!client.telefono && !client.correo && (
                        <span className="text-zinc-400 dark:text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {client.ubicacion ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin
                            className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-500"
                            aria-hidden="true"
                          />
                          <span>{client.ubicacion}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onUseClientInProforma(client)}
                          title="Completar datos de la proforma actual con este cliente"
                          className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap cursor-pointer"
                        >
                          <FilePlus2
                            className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400"
                            aria-hidden="true"
                          />
                          <span>Usar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditForm(client)}
                          title="Editar cliente"
                          className="inline-flex items-center gap-1 rounded border border-[#E5E4DF] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateClient(client)}
                          title="Duplicar cliente"
                          aria-label={`Duplicar ${client.cliente}`}
                          className="rounded border border-[#E5E4DF] bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                          <CopyPlus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteClient(client)}
                          title="Eliminar cliente del directorio y del Sheet"
                          aria-label={`Eliminar ${client.cliente}`}
                          className="rounded border border-[#E5E4DF] bg-white p-1.5 text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-red-800 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingEditConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-edit-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px] dark:bg-black/70"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-[#FAF6F1] p-2 text-[#8C5A32] dark:bg-zinc-800 dark:text-[#D59B69]">
                <Edit3 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="client-edit-confirm-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  ¿Confirmar cambios en el cliente?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Se guardarán los cambios en el directorio y se actualizará el registro de{' '}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {pendingEditConfirm.originalCliente}
                  </strong>{' '}
                  en la pestaña{' '}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME}
                  </strong>{' '}
                  de Google Sheets en tiempo real.
                </p>

                <div className="mt-3 space-y-1 rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/60">
                  <div>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                      Cliente:{' '}
                    </span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {pendingEditConfirm.payload.cliente}
                    </span>
                  </div>
                  {pendingEditConfirm.payload.contacto && (
                    <div>
                      <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                        Contacto:{' '}
                      </span>
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {pendingEditConfirm.payload.contacto}
                      </span>
                    </div>
                  )}
                  {(pendingEditConfirm.payload.telefono ||
                    pendingEditConfirm.payload.correo) && (
                    <div>
                      <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                        Tel / Correo:{' '}
                      </span>
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {[
                          pendingEditConfirm.payload.telefono,
                          pendingEditConfirm.payload.correo,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  )}
                  {pendingEditConfirm.payload.ubicacion && (
                    <div>
                      <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                        Ubicación:{' '}
                      </span>
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {pendingEditConfirm.payload.ubicacion}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSavingClient}
                onClick={() => setPendingEditConfirm(null)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingClient}
                onClick={() => void handleConfirmEditSave()}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {isSavingClient ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Sí, guardar cambios</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteClient && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-delete-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px] dark:bg-black/70"
        >
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 shadow-xl dark:border-red-900/70 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-red-50 p-2 text-red-700 dark:bg-red-950/70 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="client-delete-confirm-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  ¿Estás seguro que deseas eliminar el cliente del Sheet?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Se eliminará{' '}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {confirmDeleteClient.cliente}
                  </strong>{' '}
                  del directorio local y de la pestaña{' '}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME}
                  </strong>{' '}
                  de Google Sheets.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeletingClient}
                onClick={() => setConfirmDeleteClient(null)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingClient}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer dark:bg-red-600 dark:hover:bg-red-500"
              >
                {isDeletingClient ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {isDeletingClient ? 'Eliminando...' : 'Sí, eliminar'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
