import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudUpload,
  CopyPlus,
  Edit3,
  FilePlus2,
  FileSpreadsheet,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  ClientsImportConfig,
  ClientsImportStrategy,
  SavedClient,
} from '../types/proforma';
import {
  fetchClientsFromAppsScript,
  sendClientToGoogleSheet,
} from '../utils/cloudSync';
import {
  ClientImportRow,
  DEFAULT_CLIENTS_SHEET_NAME,
  fetchAndParseGoogleSheetClients,
  isSpreadsheetCsvFile,
  isSpreadsheetExcelFile,
  LoadedExcelWorkbook,
  parseClientsWorkbookSheetByName,
  parseUploadedClientsSpreadsheetFile,
  readExcelWorkbookFile,
  SpreadsheetSheetNotFoundError,
} from '../utils/googleSheets';

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
  onSaveClient: (payload: ClientDraftPayload, editingId?: string) => void;
  onDuplicateClient: (client: SavedClient) => void;
  onDeleteClient: (id: string) => void;
  onUseClientInProforma: (client: SavedClient) => void;
  onGoToEditor: () => void;
  onNotify?: (text: string, isError?: boolean) => void;
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
}: ClientsViewProps) {
  const [query, setQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ClientDraftPayload>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importingSource, setImportingSource] = useState<
    'sheets' | 'file' | 'refresh' | null
  >(null);
  const [pushingClientId, setPushingClientId] = useState<string | null>(null);
  const [isSubmittingToSheet, setIsSubmittingToSheet] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [syncBanner, setSyncBanner] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [loadedExcel, setLoadedExcel] = useState<LoadedExcelWorkbook | null>(
    null
  );
  const [selectedExcelSheet, setSelectedExcelSheet] = useState<string>('');
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [remoteSheetsList, setRemoteSheetsList] = useState<{
    sheets: string[];
    workbook: LoadedExcelWorkbook['workbook'];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const pushClientPayloadToSheet = async (payload: ClientDraftPayload) => {
    const res = await sendClientToGoogleSheet(
      importConfig.appsScriptUrl,
      payload,
      importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME
    );
    setSyncBanner({ ok: res.ok, message: res.message });
    onNotify?.(res.message, !res.ok);
    return res;
  };

  const saveClientAndOptionallySync = async (
    forceSyncToSheet: boolean
  ) => {
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

    onSaveClient(cleanPayload, editingId ?? undefined);

    const hasAppsScript = Boolean(importConfig.appsScriptUrl.trim());
    const shouldSync =
      forceSyncToSheet || (hasAppsScript && importConfig.autoSyncToSheet);

    if (shouldSync) {
      if (!hasAppsScript) {
        setIsImportOpen(true);
        const msg =
          'Cliente guardado localmente. Configura primero la URL de Google Apps Script (/exec) de clientes para enviarlo a la pestaña CLIENTES.';
        setSyncBanner({ ok: false, message: msg });
        onNotify?.(msg, true);
        closeForm();
        return;
      }
      setIsSubmittingToSheet(true);
      await pushClientPayloadToSheet(cleanPayload);
      setIsSubmittingToSheet(false);
    }

    closeForm();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void saveClientAndOptionallySync(false);
  };

  const handleRowSyncToSheet = async (client: SavedClient) => {
    if (!importConfig.appsScriptUrl.trim()) {
      setIsImportOpen(true);
      setSyncBanner({
        ok: false,
        message:
          'Configura la URL de Google Apps Script (/exec) en "Importar Sheets / Excel" para guardar clientes en Google Sheets.',
      });
      return;
    }
    setPushingClientId(client.id);
    await pushClientPayloadToSheet({
      cliente: client.cliente,
      contacto: client.contacto,
      telefono: client.telefono,
      correo: client.correo,
      ubicacion: client.ubicacion,
    });
    setPushingClientId(null);
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

    setImportFeedback({ ok: true, message });
    setSyncBanner({ ok: true, message });
  };

  const handleDirectRefresh = async () => {
    const hasSheetUrl = Boolean(importConfig.sheetUrl.trim());
    const hasAppsScriptUrl = Boolean(importConfig.appsScriptUrl.trim());

    if (!hasSheetUrl && !hasAppsScriptUrl) {
      setIsImportOpen(true);
      const msg =
        'Configura primero el enlace de tu Google Sheet / CSV de clientes (o la URL de Google Apps Script) para usar Refrescar.';
      setImportFeedback({ ok: false, message: msg });
      setSyncBanner({ ok: false, message: msg });
      return;
    }

    setImportingSource('refresh');
    setImportFeedback(null);
    setSyncBanner(null);
    setRemoteSheetsList(null);

    try {
      if (hasSheetUrl) {
        const result = await fetchAndParseGoogleSheetClients(
          importConfig.sheetUrl,
          importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME
        );
        applyImportResult(
          result.clients,
          result.ignoredCount,
          result.sheetNameUsed
        );
      } else {
        const rows = await fetchClientsFromAppsScript(
          importConfig.appsScriptUrl,
          importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME
        );
        if (rows.length === 0) {
          throw new Error(
            'No se encontraron clientes en la pestaña CLIENTES del Apps Script.'
          );
        }
        applyImportResult(
          rows,
          0,
          importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME
        );
      }
    } catch (err) {
      if (err instanceof SpreadsheetSheetNotFoundError) {
        setIsImportOpen(true);
        setRemoteSheetsList({
          sheets: err.availableSheets,
          workbook: err.workbook,
        });
        onImportConfigChange({
          ...importConfig,
          sheetName: err.availableSheets[0] || importConfig.sheetName,
        });
        const msg = `${err.message} Selecciona la pestaña correcta abajo.`;
        setImportFeedback({ ok: false, message: msg });
        setSyncBanner({ ok: false, message: msg });
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo refrescar la lista de clientes desde Google Sheets.';
        setImportFeedback({ ok: false, message: msg });
        setSyncBanner({ ok: false, message: msg });
        onNotify?.(msg, true);
      }
    } finally {
      setImportingSource(null);
    }
  };

  const handleImportFromGoogleSheets = async () => {
    setImportingSource('sheets');
    setImportFeedback(null);
    setRemoteSheetsList(null);
    try {
      const result = await fetchAndParseGoogleSheetClients(
        importConfig.sheetUrl,
        importConfig.sheetName || DEFAULT_CLIENTS_SHEET_NAME
      );
      applyImportResult(
        result.clients,
        result.ignoredCount,
        result.sheetNameUsed
      );
    } catch (err) {
      if (err instanceof SpreadsheetSheetNotFoundError) {
        setRemoteSheetsList({
          sheets: err.availableSheets,
          workbook: err.workbook,
        });
        onImportConfigChange({
          ...importConfig,
          sheetName: err.availableSheets[0] || importConfig.sheetName,
        });
        setImportFeedback({
          ok: false,
          message: `${err.message} Selecciona la pestaña correcta abajo e inténtalo de nuevo.`,
        });
      } else {
        setImportFeedback({
          ok: false,
          message:
            err instanceof Error
              ? err.message
              : 'No se pudieron importar los clientes desde Google Sheets.',
        });
      }
    } finally {
      setImportingSource(null);
    }
  };

  const handleImportSelectedRemoteSheet = () => {
    if (!remoteSheetsList) return;
    setImportFeedback(null);
    try {
      const targetSheet =
        importConfig.sheetName || remoteSheetsList.sheets[0] || '';
      const result = parseClientsWorkbookSheetByName(
        remoteSheetsList.workbook,
        targetSheet,
        'el enlace de Google Sheets'
      );
      setRemoteSheetsList(null);
      applyImportResult(
        result.clients,
        result.ignoredCount,
        result.sheetNameUsed
      );
    } catch (err) {
      setImportFeedback({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : 'No se pudo leer la hoja seleccionada.',
      });
    }
  };

  const handleFileSelected = async (file: File) => {
    setImportFeedback(null);
    setLoadedExcel(null);
    setSelectedExcelSheet('');
    setSelectedCsvFile(null);

    try {
      if (isSpreadsheetExcelFile(file)) {
        const loaded = await readExcelWorkbookFile(
          file,
          DEFAULT_CLIENTS_SHEET_NAME,
          DEFAULT_CLIENTS_SHEET_NAME
        );
        setLoadedExcel(loaded);
        setSelectedExcelSheet(loaded.defaultSheet);
      } else if (isSpreadsheetCsvFile(file)) {
        setSelectedCsvFile(file);
      } else {
        setImportFeedback({
          ok: false,
          message:
            'Formato no compatible. Selecciona un archivo .xlsx, .xls o .csv.',
        });
      }
    } catch (err) {
      setImportFeedback({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : 'No se pudo leer el archivo seleccionado.',
      });
    }
  };

  const handleImportFromFile = async () => {
    setImportingSource('file');
    setImportFeedback(null);
    try {
      if (loadedExcel) {
        const targetSheet =
          selectedExcelSheet || loadedExcel.defaultSheet || '';
        const result = parseClientsWorkbookSheetByName(
          loadedExcel.workbook,
          targetSheet,
          `el archivo "${loadedExcel.fileName}"`
        );
        applyImportResult(
          result.clients,
          result.ignoredCount,
          result.sheetNameUsed
        );
      } else if (selectedCsvFile) {
        const result = await parseUploadedClientsSpreadsheetFile(
          selectedCsvFile,
          DEFAULT_CLIENTS_SHEET_NAME
        );
        applyImportResult(
          result.clients,
          result.ignoredCount,
          result.sheetNameUsed
        );
      } else {
        setImportFeedback({
          ok: false,
          message: 'Primero selecciona un archivo .xlsx, .xls o .csv.',
        });
      }
    } catch (err) {
      setImportFeedback({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : 'No se pudieron importar los clientes desde el archivo.',
      });
    } finally {
      setImportingSource(null);
    }
  };

  const inputClass =
    'w-full rounded-md border border-[#DCDAD3] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15';
  const labelClass = 'mb-1.5 block text-xs font-medium text-zinc-600';

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">
            Directorio de Clientes
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Guarda clientes frecuentes en este navegador para completar
            automáticamente futuras proformas y editar libremente cualquier dato
            puntual.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente, contacto o correo..."
              className="w-full rounded-md border border-[#DCDAD3] bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15"
            />
          </div>

          <button
            type="button"
            onClick={handleDirectRefresh}
            disabled={importingSource !== null}
            title="Volver a consultar automáticamente la fuente de Google Sheets guardada"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-[#8C5A32] ${
                importingSource === 'refresh' ? 'animate-spin' : ''
              }`}
              aria-hidden="true"
            />
            <span>
              {importingSource === 'refresh' ? 'Refrescando...' : 'Refrescar'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsImportOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              isImportOpen
                ? 'border-[#8C5A32] bg-[#FAF9F6] text-[#8C5A32]'
                : 'border-[#DCDAD3] bg-white text-zinc-800 hover:bg-zinc-50'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Importar / Conectar Sheet</span>
          </button>

          <button
            type="button"
            onClick={openNewForm}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {syncBanner && !isImportOpen && (
        <div
          className={`flex items-start justify-between gap-3 rounded-md border px-4 py-2.5 text-xs ${
            syncBanner.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {syncBanner.ok ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                aria-hidden="true"
              />
            ) : (
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-700"
                aria-hidden="true"
              />
            )}
            <span>{syncBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncBanner(null)}
            aria-label="Cerrar aviso"
            className="rounded p-0.5 text-current opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isImportOpen && (
        <section
          aria-label="Importar o actualizar clientes desde Google Sheets o Excel"
          className="rounded-lg border border-[#DCDAD3] bg-white p-5 shadow-xs space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E4DF] pb-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-zinc-900">
                Importar / Actualizar Cartera de Clientes
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Columnas admitidas: <span className="font-medium text-zinc-700">Cliente, Contacto, Telefono, Correo y Ubicacion</span>. Las filas vacías o sin nombre de cliente se ignoran automáticamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsImportOpen(false)}
              aria-label="Cerrar panel de importación"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Modo de importación */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3">
            <span className="text-xs font-semibold text-zinc-700 mr-1">
              Al importar:
            </span>
            <label className="inline-flex items-center gap-1.5 rounded border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-800 cursor-pointer">
              <input
                type="radio"
                name="clients-import-strategy"
                checked={importConfig.strategy === 'upsert'}
                onChange={() =>
                  onImportConfigChange({ ...importConfig, strategy: 'upsert' })
                }
                className="accent-[#8C5A32]"
              />
              <span>Agregar / Actualizar por nombre de cliente</span>
            </label>
            <label className="inline-flex items-center gap-1.5 rounded border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-800 cursor-pointer">
              <input
                type="radio"
                name="clients-import-strategy"
                checked={importConfig.strategy === 'replace'}
                onChange={() =>
                  onImportConfigChange({ ...importConfig, strategy: 'replace' })
                }
                className="accent-[#8C5A32]"
              />
              <span>Reemplazar lista de clientes</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Opción A: Google Sheets */}
            <div className="rounded-md border border-[#E5E4DF] bg-[#FAF9F6]/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                <Link2 className="h-4 w-4 text-[#8C5A32]" aria-hidden="true" />
                <span>Desde enlace de Google Sheets</span>
              </div>

              <div>
                <label
                  htmlFor="clients-gsheet-url"
                  className="mb-1 block text-[11px] font-medium text-zinc-600"
                >
                  Enlace de la hoja (normal o publicado como CSV)
                </label>
                <input
                  id="clients-gsheet-url"
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={importConfig.sheetUrl}
                  onChange={(e) =>
                    onImportConfigChange({
                      ...importConfig,
                      sheetUrl: e.target.value,
                    })
                  }
                  className="w-full rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-end">
                <div>
                  <label
                    htmlFor="clients-gsheet-tab"
                    className="mb-1 block text-[11px] font-medium text-zinc-600"
                  >
                    Nombre de pestaña (por defecto CLIENTES)
                  </label>
                  <input
                    id="clients-gsheet-tab"
                    type="text"
                    placeholder="CLIENTES"
                    value={importConfig.sheetName}
                    onChange={(e) =>
                      onImportConfigChange({
                        ...importConfig,
                        sheetName: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleImportFromGoogleSheets}
                  disabled={importingSource !== null}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  {importingSource === 'sheets' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {importingSource === 'sheets'
                      ? 'Importando...'
                      : 'Importar desde Google Sheets'}
                  </span>
                </button>
              </div>

              {remoteSheetsList && remoteSheetsList.sheets.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50/70 p-2.5 space-y-2">
                  <label
                    htmlFor="clients-remote-sheet-select"
                    className="block text-[11px] font-semibold text-amber-900"
                  >
                    Elige la pestaña disponible en tu Google Sheet:
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      id="clients-remote-sheet-select"
                      value={importConfig.sheetName}
                      onChange={(e) =>
                        onImportConfigChange({
                          ...importConfig,
                          sheetName: e.target.value,
                        })
                      }
                      className="flex-1 rounded border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-900"
                    >
                      {remoteSheetsList.sheets.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleImportSelectedRemoteSheet}
                      className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer"
                    >
                      Cargar esta hoja
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Opción B: Archivo Excel / CSV */}
            <div className="rounded-md border border-[#E5E4DF] bg-[#FAF9F6]/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                <Upload className="h-4 w-4 text-[#8C5A32]" aria-hidden="true" />
                <span>Desde archivo Excel (.xlsx / .xls) o CSV</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFileSelected(f);
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Seleccionar archivo (.xlsx / .xls / .csv)</span>
                </button>
                {(loadedExcel || selectedCsvFile) && (
                  <span className="text-xs font-medium text-zinc-700 truncate max-w-[230px]">
                    {loadedExcel?.fileName ?? selectedCsvFile?.name}
                  </span>
                )}
              </div>

              {loadedExcel && (
                <div>
                  <label
                    htmlFor="clients-excel-sheet-select"
                    className="mb-1 block text-[11px] font-medium text-zinc-600"
                  >
                    Seleccionar hoja del archivo ({loadedExcel.sheetNames.length}{' '}
                    disponible(s))
                  </label>
                  <select
                    id="clients-excel-sheet-select"
                    value={selectedExcelSheet}
                    onChange={(e) => setSelectedExcelSheet(e.target.value)}
                    className="w-full rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15"
                  >
                    {loadedExcel.sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleImportFromFile}
                  disabled={
                    importingSource !== null ||
                    (!loadedExcel && !selectedCsvFile)
                  }
                  className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  {importingSource === 'file' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {importingSource === 'file'
                      ? 'Importando...'
                      : 'Importar clientes del archivo'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Opción C: Guardado directo hacia Google Sheets (Apps Script) */}
          <div className="rounded-md border border-[#E5E4DF] bg-[#FAF9F6]/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                <CloudUpload
                  className="h-4 w-4 text-[#8C5A32]"
                  aria-hidden="true"
                />
                <span>
                  Enviar clientes nuevos o editados a Google Sheets (Apps Script · pestaña CLIENTES)
                </span>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                  importConfig.appsScriptUrl.trim()
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border border-zinc-200 bg-white text-zinc-500'
                }`}
              >
                {importConfig.appsScriptUrl.trim()
                  ? 'Apps Script guardado'
                  : 'Opcional'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <label
                  htmlFor="clients-apps-script-url"
                  className="mb-1 block text-[11px] font-medium text-zinc-600"
                >
                  URL de Google Apps Script (/exec) para guardar en pestaña CLIENTES (guardada en el navegador)
                </label>
                <input
                  id="clients-apps-script-url"
                  type="url"
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  value={importConfig.appsScriptUrl}
                  onChange={(e) =>
                    onImportConfigChange({
                      ...importConfig,
                      appsScriptUrl: e.target.value,
                    })
                  }
                  className="w-full rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15"
                />
              </div>

              <label className="lg:col-span-5 flex items-start gap-2 rounded border border-[#DCDAD3] bg-white px-3 py-2 text-xs text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={importConfig.autoSyncToSheet}
                  onChange={(e) =>
                    onImportConfigChange({
                      ...importConfig,
                      autoSyncToSheet: e.target.checked,
                    })
                  }
                  className="mt-0.5 h-3.5 w-3.5 accent-[#8C5A32]"
                />
                <span>
                  Enviar automáticamente a Google Sheet al guardar un cliente creado o editado
                </span>
              </label>
            </div>
          </div>

          {importFeedback && (
            <div
              className={`flex items-start gap-2 rounded-md border px-3.5 py-2.5 text-xs ${
                importFeedback.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {importFeedback.ok ? (
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-red-700"
                  aria-hidden="true"
                />
              )}
              <span>{importFeedback.message}</span>
            </div>
          )}
        </section>
      )}

      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-[#DCDAD3] bg-white p-5 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#E5E4DF] pb-3">
            <h2 className="font-display text-sm font-semibold text-zinc-900">
              {editingId ? 'Editar Cliente Guardado' : 'Agregar Nuevo Cliente'}
            </h2>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Cerrar formulario"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {formError && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="dir-cliente" className={labelClass}>
                Cliente <span className="text-[#8C5A32]">*</span>
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
              onClick={closeForm}
              className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSubmittingToSheet}
              onClick={() => void saveClientAndOptionallySync(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingToSheet ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CloudUpload
                  className="h-3.5 w-3.5 text-[#8C5A32]"
                  aria-hidden="true"
                />
              )}
              <span>
                {isSubmittingToSheet
                  ? 'Enviando a Sheet...'
                  : 'Guardar en Google Sheet'}
              </span>
            </button>
            <button
              type="submit"
              disabled={isSubmittingToSheet}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{editingId ? 'Guardar Cambios' : 'Guardar Cliente'}</span>
            </button>
          </div>
        </form>
      )}

      {clients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#DCDAD3] bg-white px-6 py-14 text-center">
          <Users
            className="mx-auto h-8 w-8 text-zinc-300"
            aria-hidden="true"
          />
          <p className="mt-3 font-display text-base font-semibold text-zinc-900">
            Aún no hay clientes guardados en el directorio
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500">
            Agrega clientes aquí o usa el botón &ldquo;Guardar en
            directorio&rdquo; dentro de &ldquo;Datos del Cliente y
            Proyecto&rdquo; para reutilizarlos con un clic.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={openNewForm}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Agregar Primer Cliente</span>
            </button>
            <button
              type="button"
              onClick={onGoToEditor}
              className="rounded-md border border-[#DCDAD3] bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              Volver al Editor
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-[#E5E4DF] bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-700">
            No se encontraron clientes que coincidan con &ldquo;{query}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E5E4DF] bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5E4DF] bg-[#FAF9F6] text-xs font-semibold text-zinc-600">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Teléfono / Correo</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DF]">
              {filtered.map((client) => {
                const isConfirmingDelete = confirmDeleteId === client.id;
                return (
                  <tr
                    key={client.id}
                    className="transition-colors hover:bg-[#FAF9F6]/70"
                  >
                    <td className="px-4 py-3.5 font-semibold text-zinc-900">
                      {client.cliente}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-700">
                      {client.contacto || (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-600 space-y-0.5">
                      {client.telefono && (
                        <div className="flex items-center gap-1.5">
                          <Phone
                            className="h-3 w-3 shrink-0 text-zinc-400"
                            aria-hidden="true"
                          />
                          <span>{client.telefono}</span>
                        </div>
                      )}
                      {client.correo && (
                        <div className="flex items-center gap-1.5">
                          <Mail
                            className="h-3 w-3 shrink-0 text-zinc-400"
                            aria-hidden="true"
                          />
                          <span>{client.correo}</span>
                        </div>
                      )}
                      {!client.telefono && !client.correo && (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-600">
                      {client.ubicacion ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin
                            className="h-3 w-3 shrink-0 text-zinc-400"
                            aria-hidden="true"
                          />
                          <span>{client.ubicacion}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onUseClientInProforma(client)}
                          title="Completar datos de la proforma actual con este cliente"
                          className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 whitespace-nowrap cursor-pointer"
                        >
                          <FilePlus2
                            className="h-3.5 w-3.5 text-[#8C5A32]"
                            aria-hidden="true"
                          />
                          <span>Usar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditForm(client)}
                          title="Editar cliente"
                          className="inline-flex items-center gap-1 rounded border border-[#E5E4DF] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 whitespace-nowrap cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRowSyncToSheet(client)}
                          disabled={pushingClientId === client.id}
                          title="Enviar / actualizar cliente en pestaña CLIENTES de Google Sheet"
                          aria-label={`Enviar ${client.cliente} a Google Sheet`}
                          className="rounded border border-[#E5E4DF] bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-[#8C5A32] disabled:opacity-50 cursor-pointer"
                        >
                          {pushingClientId === client.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CloudUpload className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateClient(client)}
                          title="Duplicar cliente"
                          aria-label={`Duplicar ${client.cliente}`}
                          className="rounded border border-[#E5E4DF] bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 cursor-pointer"
                        >
                          <CopyPlus className="h-3.5 w-3.5" />
                        </button>

                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1 ml-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteClient(client.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded border border-red-300 bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 cursor-pointer"
                            >
                              Eliminar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded border border-[#E5E4DF] bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(client.id)}
                            title="Eliminar cliente"
                            aria-label={`Eliminar ${client.cliente}`}
                            className="rounded border border-[#E5E4DF] bg-white p-1.5 text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
