import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_ARAN_APPS_SCRIPT_URL,
  DEFAULT_PROFORMAS_APPS_SCRIPT_URL,
} from '../data/defaults';
import {
  CloudSyncConfig,
  ComputedTotals,
  ProformaData,
  SheetShortcutUrls,
} from '../types/proforma';
import {
  buildCloudPayload,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  sendProformaToWebhook,
} from '../utils/cloudSync';
import { getConnectionButtonClasses } from '../utils/connectionStyles';
import { buildPdfFileName } from '../utils/formatters';
import { PdfIcon } from './PdfIcon';

interface IntegrationViewProps {
  config: CloudSyncConfig;
  proforma: ProformaData;
  totals: ComputedTotals;
  onSaveConfig: (next: CloudSyncConfig) => void;
  onDownloadPDF: () => Promise<void> | void;
  aranTemplatesCount: number;
  terminosTemplatesCount?: number;
  isSyncingAran: boolean;
  onSyncAranTemplates: (
    overrideUrl?: string
  ) => Promise<{ ok: boolean; message: string; count: number }>;
  sheetShortcutUrls: SheetShortcutUrls;
  onSaveSheetShortcutUrls: (next: SheetShortcutUrls) => void;
}

export function IntegrationView({
  config,
  proforma,
  totals,
  onSaveConfig,
  onDownloadPDF,
  aranTemplatesCount,
  terminosTemplatesCount = 0,
  isSyncingAran,
  onSyncAranTemplates,
  sheetShortcutUrls,
  onSaveSheetShortcutUrls,
}: IntegrationViewProps) {
  const cardSurface =
    'rounded-xl border border-[#E3E1DA] bg-white shadow-[0_1px_3px_rgba(24,24,27,0.04)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none';
  const [draftConfig, setDraftConfig] = useState<CloudSyncConfig>(config);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isLocked, setIsLocked] = useState(true);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  const updateAndPersistConfig = (
    updater: (prev: CloudSyncConfig) => CloudSyncConfig
  ) => {
    if (isLocked) return;
    setDraftConfig((prev) => {
      const next = updater(prev);
      onSaveConfig(next);
      return next;
    });
  };

  const handleSaveSettings = () => {
    if (isLocked) return;
    const cleaned: CloudSyncConfig = {
      ...draftConfig,
      webhookUrl: draftConfig.webhookUrl.trim(),
      secretToken: draftConfig.secretToken.trim(),
      aranScriptUrl: (draftConfig.aranScriptUrl ?? '').trim(),
    };
    setDraftConfig(cleaned);
    onSaveConfig(cleaned);
    setFeedback({
      ok: true,
      message: cleaned.webhookUrl
        ? `Configuración guardada en este navegador. URL activa: ${cleaned.webhookUrl}`
        : 'Configuración guardada en este navegador (sin URL de PROFORMAS configurada).',
    });
  };

  const handleClearWebhookUrl = () => {
    if (isLocked) return;
    const cleared: CloudSyncConfig = {
      ...draftConfig,
      webhookUrl: '',
      lastStatus: undefined,
      lastMessage: undefined,
    };
    setDraftConfig(cleared);
    onSaveConfig(cleared);
    setFeedback({
      ok: true,
      message: 'Se limpió el campo de URL. Puedes pegar una nueva o restaurar la predeterminada.',
    });
  };

  const handleRestoreDefaultWebhookUrl = () => {
    if (isLocked) return;
    const restored: CloudSyncConfig = {
      ...draftConfig,
      webhookUrl: DEFAULT_PROFORMAS_APPS_SCRIPT_URL,
      lastStatus: undefined,
      lastMessage: undefined,
    };
    setDraftConfig(restored);
    onSaveConfig(restored);
    setFeedback({
      ok: true,
      message: `URL predeterminada de PROFORMAS restaurada: ${DEFAULT_PROFORMAS_APPS_SCRIPT_URL}`,
    });
  };

  const handleClearAranUrl = () => {
    if (isLocked) return;
    const cleared: CloudSyncConfig = {
      ...draftConfig,
      aranScriptUrl: '',
      aranLastStatus: undefined,
      aranLastMessage: undefined,
    };
    setDraftConfig(cleared);
    onSaveConfig(cleared);
      setFeedback({
        ok: true,
        message:
          'Se limpió la URL de la hoja "ESPECIFICACIONES". Pega una nueva o restaura la predeterminada.',
      });
    };

  const handleRestoreDefaultAranUrl = () => {
    if (isLocked) return;
    const restored: CloudSyncConfig = {
      ...draftConfig,
      aranScriptUrl: DEFAULT_ARAN_APPS_SCRIPT_URL,
      aranLastStatus: undefined,
      aranLastMessage: undefined,
    };
    setDraftConfig(restored);
    onSaveConfig(restored);
    setFeedback({
      ok: true,
      message: `URL predeterminada de ESPECIFICACIONES restaurada: ${DEFAULT_ARAN_APPS_SCRIPT_URL}`,
    });
  };

  const handleTestAranConnection = async () => {
    const cleanedUrl = (draftConfig.aranScriptUrl ?? '').trim();
    const cleaned: CloudSyncConfig = {
      ...draftConfig,
      aranScriptUrl: cleanedUrl,
    };
    setDraftConfig(cleaned);
    onSaveConfig(cleaned);

    setFeedback(null);
    const result = await onSyncAranTemplates(cleanedUrl);
    setFeedback({
      ok: result.ok,
      message: result.message,
    });
  };

  const handleSendProformaToSheet = async () => {
    const cleaned: CloudSyncConfig = {
      ...draftConfig,
      webhookUrl: draftConfig.webhookUrl.trim(),
      secretToken: draftConfig.secretToken.trim(),
    };
    setDraftConfig(cleaned);
    onSaveConfig(cleaned);

    if (!cleaned.webhookUrl) {
      setFeedback({
        ok: false,
        message:
          'Falta configurar la URL de Google Apps Script (/exec) antes de enviar la proforma al Google Sheet.',
      });
      return;
    }

    setSending(true);
    setFeedback(null);
    const result = await sendProformaToWebhook(cleaned, proforma, totals);
    setSending(false);
    setFeedback(result);

    const updatedConfig: CloudSyncConfig = {
      ...cleaned,
      lastSyncedAt: result.ok ? new Date().toISOString() : cleaned.lastSyncedAt,
      lastStatus: result.ok ? 'ok' : 'error',
      lastMessage: result.message,
    };
    setDraftConfig(updatedConfig);
    onSaveConfig(updatedConfig);
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      // Fallback silencioso si clipboard no está disponible
    }
  };

  const expectedPdfName = buildPdfFileName(
    proforma.consecutivo,
    proforma.clientProject.proyecto,
    'pdf',
    proforma.clientProject.cliente
  );

  const samplePayload = buildCloudPayload(
    proforma,
    totals,
    draftConfig.secretToken
  );

  const configuredUrl = draftConfig.webhookUrl.trim();
  const isWebhookConnected =
    Boolean(configuredUrl) &&
    draftConfig.lastStatus !== 'error' &&
    feedback?.ok !== false;

  const configuredAranUrl = (draftConfig.aranScriptUrl ?? '').trim();
  const isAranConnected =
    Boolean(configuredAranUrl) && draftConfig.aranLastStatus !== 'error';

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Integración en la Nube · Google Sheets / Webhook
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Conecta el envío de cotizaciones a una hoja de cálculo de Google
            Sheets mediante Google Apps Script Web App o a cualquier endpoint
            webhook JSON.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsLocked((prev) => !prev)}
          aria-pressed={!isLocked}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            isLocked
              ? 'border border-[#8C5A32] bg-[#FAF6F1] text-[#6F4423] hover:bg-[#F3ECE2] dark:border-amber-600/80 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950/80'
              : 'border border-[#DCDAD3] bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          {isLocked ? (
            <>
              <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Desbloquear</span>
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
              <span>Bloquear</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Panel de configuración */}
        <div className={`space-y-5 p-6 lg:col-span-6 ${cardSurface}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Conexión Webhook / Apps Script
            </h2>
            <div className="flex items-center gap-1.5">
              {isLocked && (
                <span className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  <span>Bloqueado</span>
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                  isWebhookConnected
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                    : 'border border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/70 dark:text-red-300'
                }`}
              >
                {!configuredUrl
                  ? 'Sin URL configurada'
                  : isWebhookConnected
                    ? 'URL guardada'
                    : 'Error de conexión'}
              </span>
            </div>
          </div>

          {/* Bloque de configuración protegido por defecto (atenuado mientras esté bloqueado) */}
          <div
            aria-disabled={isLocked}
            className={`space-y-4 rounded-lg transition-opacity duration-200 ${
              isLocked
                ? 'cursor-not-allowed select-none opacity-55 grayscale-[25%]'
                : ''
            }`}
          >
            {/* Resumen visible de la URL guardada actualmente en localStorage */}
            <div className="rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/70">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  <Link2 className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
                  <span>URL configurada actualmente:</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {configuredUrl !== DEFAULT_PROFORMAS_APPS_SCRIPT_URL && (
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={handleRestoreDefaultWebhookUrl}
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-[#8C5A32] dark:text-amber-400 ${
                        isLocked
                          ? 'cursor-not-allowed'
                          : 'hover:bg-[#F3ECE2] dark:hover:bg-zinc-700 cursor-pointer'
                      }`}
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      <span>Restaurar predeterminada</span>
                    </button>
                  )}
                  {configuredUrl && (
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={handleClearWebhookUrl}
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 ${
                        isLocked
                          ? 'cursor-not-allowed'
                          : 'hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer'
                      }`}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      <span>Limpiar</span>
                    </button>
                  )}
                </div>
              </div>
              {configuredUrl ? (
                <p className="mt-1.5 break-all font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                  {configuredUrl}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Aún no has ingresado ninguna URL de Google Apps Script (/exec) o
                  Webhook. Pégala abajo y se guardará automáticamente en este
                  navegador.
                </p>
              )}
              {draftConfig.lastSyncedAt && (
                <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Último envío registrado:{' '}
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">
                    {new Date(draftConfig.lastSyncedAt).toLocaleString('es-CR')}
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="webhook-url"
                  className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  URL de Google Apps Script Web App (/exec) o Webhook
                </label>
                <input
                  id="webhook-url"
                  type="url"
                  disabled={isLocked}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  value={draftConfig.webhookUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateAndPersistConfig((prev) => ({
                      ...prev,
                      webhookUrl: val,
                    }));
                  }}
                  className={`w-full rounded-md border border-[#DCDAD3] px-3 py-2 font-mono text-xs placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:placeholder:text-zinc-500 dark:focus:border-amber-500 ${
                    isLocked
                      ? 'cursor-not-allowed bg-zinc-100 text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400'
                      : 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100'
                  }`}
                />
              </div>

              <div>
                <label
                  htmlFor="webhook-token"
                  className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  Token de verificación opcional (Secret Token)
                </label>
                <input
                  id="webhook-token"
                  type="text"
                  disabled={isLocked}
                  placeholder="Opcional: coincide con SECRET_TOKEN en Code.gs"
                  value={draftConfig.secretToken}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateAndPersistConfig((prev) => ({
                      ...prev,
                      secretToken: val,
                    }));
                  }}
                  className={`w-full rounded-md border border-[#DCDAD3] px-3 py-2 font-mono text-xs placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:placeholder:text-zinc-500 dark:focus:border-amber-500 ${
                    isLocked
                      ? 'cursor-not-allowed bg-zinc-100 text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400'
                      : 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100'
                  }`}
                />
              </div>

              <label
                className={`flex items-start gap-2.5 rounded-md border border-[#E5E4DF] p-3 dark:border-zinc-800 ${
                  isLocked
                    ? 'cursor-not-allowed bg-zinc-100/80 dark:bg-zinc-800/60'
                    : 'cursor-pointer bg-[#FAF9F6] dark:bg-zinc-800/80'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={isLocked}
                  checked={draftConfig.autoSyncOnSave}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateAndPersistConfig((prev) => ({
                      ...prev,
                      autoSyncOnSave: checked,
                    }));
                  }}
                  className={`mt-0.5 h-4 w-4 accent-[#8C5A32] ${
                    isLocked ? 'cursor-not-allowed' : ''
                  }`}
                />
                <span className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                  <strong className="block font-semibold text-zinc-900 dark:text-zinc-100">
                    Sincronizar automáticamente al guardar en historial
                  </strong>
                  Cada vez que pulses &ldquo;Guardar en Historial&rdquo;, la
                  proforma se enviará automáticamente a la URL configurada.
                </span>
              </label>

              {/* Configuración del script de ESPECIFICACIONES y TERMINOS_Y_CONDICIONES */}
              <div className="space-y-3 border-t border-[#E5E4DF] pt-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Script Hojas &ldquo;ESPECIFICACIONES&rdquo; y &ldquo;TERMINOS_Y_CONDICIONES&rdquo;
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                      isAranConnected
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                        : 'border border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/70 dark:text-red-300'
                    }`}
                  >
                    {!configuredAranUrl
                      ? 'Sin URL configurada'
                      : isAranConnected
                        ? 'URL guardada'
                        : 'Error de conexión'}
                  </span>
                </div>

                <div className="rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/70">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
                      <Link2
                        className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400"
                        aria-hidden="true"
                      />
                      <span>URL ESPECIFICACIONES configurada actualmente:</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {configuredAranUrl !== DEFAULT_ARAN_APPS_SCRIPT_URL && (
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={handleRestoreDefaultAranUrl}
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-[#8C5A32] dark:text-amber-400 ${
                            isLocked
                              ? 'cursor-not-allowed'
                              : 'hover:bg-[#F3ECE2] dark:hover:bg-zinc-700 cursor-pointer'
                          }`}
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          <span>Restaurar predeterminada</span>
                        </button>
                      )}
                      {configuredAranUrl && (
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={handleClearAranUrl}
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 ${
                            isLocked
                              ? 'cursor-not-allowed'
                              : 'hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer'
                          }`}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>Limpiar</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {configuredAranUrl ? (
                    <p className="mt-1.5 break-all font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                      {configuredAranUrl}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Sin URL configurada para &ldquo;ESPECIFICACIONES&rdquo;. Pega la URL /exec abajo o restaura la predeterminada.
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>
                      Especificaciones disponibles:{' '}
                      <strong className="font-mono text-zinc-700 dark:text-zinc-200 tabular-nums">
                        {aranTemplatesCount}
                      </strong>
                    </span>
                    <span>
                      Términos disponibles:{' '}
                      <strong className="font-mono text-zinc-700 dark:text-zinc-200 tabular-nums">
                        {terminosTemplatesCount}
                      </strong>
                    </span>
                    {draftConfig.aranLastSyncedAt && (
                      <span>
                        Última consulta:{' '}
                        <strong className="text-zinc-700 dark:text-zinc-200">
                          {new Date(draftConfig.aranLastSyncedAt).toLocaleString(
                            'es-CR'
                          )}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="aran-script-url"
                    className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    URL de Apps Script para &ldquo;ESPECIFICACIONES&rdquo; y &ldquo;TERMINOS_Y_CONDICIONES&rdquo; (/exec)
                  </label>
                  <input
                    id="aran-script-url"
                    type="url"
                    disabled={isLocked}
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    value={draftConfig.aranScriptUrl ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateAndPersistConfig((prev) => ({
                        ...prev,
                        aranScriptUrl: val,
                        aranLastStatus: undefined,
                        aranLastMessage: undefined,
                      }));
                    }}
                    className={`w-full rounded-md border border-[#DCDAD3] px-3 py-2 font-mono text-xs placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:placeholder:text-zinc-500 dark:focus:border-amber-500 ${
                      isLocked
                        ? 'cursor-not-allowed bg-zinc-100 text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400'
                        : 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100'
                    }`}
                  />
                </div>
              </div>

              {/* Accesos directos a Google Sheets */}
              <div className="space-y-3 border-t border-[#E5E4DF] pt-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Accesos Directos a Google Sheets
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <label
                      htmlFor="shortcut-proformas-url"
                      className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
                    >
                      Enlace directo Sheet Proformas
                    </label>
                    <input
                      id="shortcut-proformas-url"
                      type="url"
                      disabled={isLocked}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetShortcutUrls.proformasSheetUrl}
                      onChange={(e) =>
                        onSaveSheetShortcutUrls({
                          ...sheetShortcutUrls,
                          proformasSheetUrl: e.target.value,
                        })
                      }
                      className={`w-full rounded-md border border-[#DCDAD3] px-3 py-1.5 font-mono text-xs placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none dark:border-zinc-700 dark:placeholder:text-zinc-500 ${
                        isLocked
                          ? 'cursor-not-allowed bg-zinc-100 text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400'
                          : 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100'
                      }`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="shortcut-clients-url"
                      className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
                    >
                      Enlace directo Sheet Clientes
                    </label>
                    <input
                      id="shortcut-clients-url"
                      type="url"
                      disabled={isLocked}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetShortcutUrls.clientsSheetUrl}
                      onChange={(e) =>
                        onSaveSheetShortcutUrls({
                          ...sheetShortcutUrls,
                          clientsSheetUrl: e.target.value,
                        })
                      }
                      className={`w-full rounded-md border border-[#DCDAD3] px-3 py-1.5 font-mono text-xs placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none dark:border-zinc-700 dark:placeholder:text-zinc-500 ${
                        isLocked
                          ? 'cursor-not-allowed bg-zinc-100 text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400'
                          : 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100'
                      }`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="shortcut-specs-url"
                      className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
                    >
                      Enlace directo Sheet Especificaciones
                    </label>
                    <input
                      id="shortcut-specs-url"
                      type="url"
                      disabled={isLocked}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetShortcutUrls.specsSheetUrl}
                      onChange={(e) =>
                        onSaveSheetShortcutUrls({
                          ...sheetShortcutUrls,
                          specsSheetUrl: e.target.value,
                        })
                      }
                      className={`w-full rounded-md border border-[#DCDAD3] px-3 py-1.5 font-mono text-xs placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none dark:border-zinc-700 dark:placeholder:text-zinc-500 ${
                        isLocked
                          ? 'cursor-not-allowed bg-zinc-100 text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400'
                          : 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isLocked || sending}
                className={`inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] px-3.5 py-2 text-xs font-semibold dark:border-zinc-700 ${
                  isLocked
                    ? 'cursor-not-allowed bg-zinc-100 text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400'
                    : 'bg-white text-zinc-800 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 cursor-pointer'
                }`}
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Guardar Configuración</span>
              </button>
            </div>
          </div>

          {feedback && (
            <div
              className={`flex items-start gap-2 rounded-md border px-3.5 py-2.5 text-xs ${
                feedback.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-200'
              }`}
            >
              {feedback.ok ? (
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
              <span>{feedback.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E5E4DF] pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleSendProformaToSheet}
              disabled={sending}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${getConnectionButtonClasses(isWebhookConnected, 'solid')}`}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {sending
                  ? 'Enviando al Sheet...'
                  : `Enviar Proforma Nº ${proforma.consecutivo} al Sheet`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleTestAranConnection()}
              disabled={isSyncingAran}
              title={
                isAranConnected
                  ? 'Conectado: consultar y recargar ESPECIFICACIONES y TERMINOS_Y_CONDICIONES desde Google Sheets'
                  : 'Sin URL o error de conexión en ESPECIFICACIONES: revisa la URL del script'
              }
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${getConnectionButtonClasses(isAranConnected, 'outline')}`}
            >
              {isSyncingAran ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {isSyncingAran
                  ? 'Cargando Especificaciones...'
                  : 'Cargar / Probar Especificaciones'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void onDownloadPDF()}
              title={`Generar y descargar "${expectedPdfName}"`}
              className="inline-flex items-center gap-1.5 rounded-md border border-black bg-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:border-zinc-700 dark:bg-black dark:hover:bg-zinc-900 cursor-pointer"
            >
              <PdfIcon className="h-4 w-4" />
              <span>Descargar PDF</span>
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Nombre estándar del archivo PDF:{' '}
            <code className="rounded bg-[#FAF9F6] px-1.5 py-0.5 font-mono text-zinc-800 border border-[#E5E4DF] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {expectedPdfName}
            </code>
          </p>

          {/* Guía de 4 pasos */}
          <div className="border-t border-[#E5E4DF] pt-4 dark:border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Guía rápida para conectar con Google Sheets
            </h3>
            <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 list-decimal list-inside">
              <li>
                Abre tu Google Sheet y ve a{' '}
                <strong className="text-zinc-800 dark:text-zinc-200">
                  Extensiones &gt; Apps Script
                </strong>
                .
              </li>
              <li>
                Reemplaza el contenido de <code className="font-mono">Code.gs</code>{' '}
                con el script de la derecha y guarda.
              </li>
              <li>
                Haz clic en{' '}
                <strong className="text-zinc-800 dark:text-zinc-200">
                  Implementar &gt; Nueva implementación &gt; Aplicación web
                </strong>{' '}
                (acceso: <em>Cualquier usuario</em>).
              </li>
              <li>
                Copia la URL final <code className="font-mono">/exec</code> y
                pégala arriba.
              </li>
            </ol>
          </div>
        </div>

        {/* Script listo para copiar + Payload JSON */}
        <div className="space-y-5 lg:col-span-6">
          <div className={`p-5 ${cardSurface}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Código Google Apps Script (Code.gs)
              </h2>
              <button
                type="button"
                onClick={handleCopyScript}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
              >
                {copiedScript ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar script</span>
                  </>
                )}
              </button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {GOOGLE_APPS_SCRIPT_TEMPLATE}
            </pre>
          </div>

          <div className={`p-5 ${cardSurface}`}>
            <h2 className="mb-2 font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Vista previa del payload JSON (Proforma Nº {proforma.consecutivo})
            </h2>
            <pre className="max-h-48 overflow-auto rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 font-mono text-[11px] leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {JSON.stringify(samplePayload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
