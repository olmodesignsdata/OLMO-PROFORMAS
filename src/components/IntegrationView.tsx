import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  Link2,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  CloudSyncConfig,
  ComputedTotals,
  ProformaData,
} from '../types/proforma';
import {
  buildCloudPayload,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  sendProformaToWebhook,
} from '../utils/cloudSync';
import { buildPdfFileName } from '../utils/formatters';

interface IntegrationViewProps {
  config: CloudSyncConfig;
  proforma: ProformaData;
  totals: ComputedTotals;
  onSaveConfig: (next: CloudSyncConfig) => void;
  onDownloadPDF: () => Promise<void> | void;
}

export function IntegrationView({
  config,
  proforma,
  totals,
  onSaveConfig,
  onDownloadPDF,
}: IntegrationViewProps) {
  const [draftConfig, setDraftConfig] = useState<CloudSyncConfig>(config);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  const updateAndPersistConfig = (
    updater: (prev: CloudSyncConfig) => CloudSyncConfig
  ) => {
    setDraftConfig((prev) => {
      const next = updater(prev);
      onSaveConfig(next);
      return next;
    });
  };

  const handleSaveSettings = () => {
    const cleaned: CloudSyncConfig = {
      ...draftConfig,
      webhookUrl: draftConfig.webhookUrl.trim(),
      secretToken: draftConfig.secretToken.trim(),
    };
    setDraftConfig(cleaned);
    onSaveConfig(cleaned);
    setFeedback({
      ok: true,
      message: cleaned.webhookUrl
        ? `Configuración guardada en este navegador. URL activa: ${cleaned.webhookUrl}`
        : 'Configuración guardada en este navegador (sin URL configurada).',
    });
  };

  const handleClearWebhookUrl = () => {
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
      message: 'Se eliminó la URL configurada del almacenamiento local.',
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
    proforma.clientProject.cliente,
    'pdf'
  );

  const samplePayload = buildCloudPayload(
    proforma,
    totals,
    draftConfig.secretToken
  );

  const configuredUrl = draftConfig.webhookUrl.trim();

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">
          Integración en la Nube · Google Sheets / Webhook
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Conecta el envío de cotizaciones a una hoja de cálculo de Google
          Sheets mediante Google Apps Script Web App o a cualquier endpoint
          webhook JSON.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Panel de configuración */}
        <div className="space-y-5 rounded-lg border border-[#E5E4DF] bg-white p-6 lg:col-span-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-zinc-900">
              Conexión Webhook / Apps Script
            </h2>
            <span
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                configuredUrl
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {configuredUrl ? 'URL guardada' : 'Sin URL configurada'}
            </span>
          </div>

          {/* Resumen visible de la URL guardada actualmente en localStorage */}
          <div className="rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-700">
                <Link2 className="h-3.5 w-3.5 text-[#8C5A32]" aria-hidden="true" />
                <span>URL configurada actualmente:</span>
              </span>
              {configuredUrl && (
                <button
                  type="button"
                  onClick={handleClearWebhookUrl}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>
            {configuredUrl ? (
              <p className="mt-1.5 break-all font-mono text-[11px] text-zinc-900">
                {configuredUrl}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-500">
                Aún no has ingresado ninguna URL de Google Apps Script (/exec) o
                Webhook. Pégala abajo y se guardará automáticamente en este
                navegador.
              </p>
            )}
            {draftConfig.lastSyncedAt && (
              <p className="mt-1.5 text-[11px] text-zinc-500">
                Último envío registrado:{' '}
                <span className="font-medium text-zinc-700">
                  {new Date(draftConfig.lastSyncedAt).toLocaleString('es-CR')}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="webhook-url"
                className="mb-1.5 block text-xs font-medium text-zinc-600"
              >
                URL de Google Apps Script Web App (/exec) o Webhook
              </label>
              <input
                id="webhook-url"
                type="url"
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                value={draftConfig.webhookUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  updateAndPersistConfig((prev) => ({
                    ...prev,
                    webhookUrl: val,
                  }));
                }}
                className="w-full rounded-md border border-[#DCDAD3] bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15"
              />
            </div>

            <div>
              <label
                htmlFor="webhook-token"
                className="mb-1.5 block text-xs font-medium text-zinc-600"
              >
                Token de verificación opcional (Secret Token)
              </label>
              <input
                id="webhook-token"
                type="text"
                placeholder="Opcional: coincide con SECRET_TOKEN en Code.gs"
                value={draftConfig.secretToken}
                onChange={(e) => {
                  const val = e.target.value;
                  updateAndPersistConfig((prev) => ({
                    ...prev,
                    secretToken: val,
                  }));
                }}
                className="w-full rounded-md border border-[#DCDAD3] bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15"
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={draftConfig.autoSyncOnSave}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateAndPersistConfig((prev) => ({
                    ...prev,
                    autoSyncOnSave: checked,
                  }));
                }}
                className="mt-0.5 h-4 w-4 accent-[#8C5A32]"
              />
              <span className="text-xs leading-relaxed text-zinc-700">
                <strong className="block font-semibold text-zinc-900">
                  Sincronizar automáticamente al guardar en historial
                </strong>
                Cada vez que pulses &ldquo;Guardar en Historial&rdquo;, la
                proforma se enviará automáticamente a la URL configurada.
              </span>
            </label>
          </div>

          {feedback && (
            <div
              className={`flex items-start gap-2 rounded-md border px-3.5 py-2.5 text-xs ${
                feedback.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {feedback.ok ? (
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
              <span>{feedback.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Guardar Configuración</span>
            </button>

            <button
              type="button"
              onClick={handleSendProformaToSheet}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
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
              onClick={() => void onDownloadPDF()}
              title={`Generar y descargar "${expectedPdfName}"`}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#8C5A32] bg-[#FAF6F1] px-3.5 py-2 text-xs font-semibold text-[#6F4423] hover:bg-[#F3ECE2] cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Descargar PDF</span>
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Nombre estándar del archivo PDF:{' '}
            <code className="rounded bg-[#FAF9F6] px-1.5 py-0.5 font-mono text-zinc-800 border border-[#E5E4DF]">
              {expectedPdfName}
            </code>
          </p>

          {/* Guía de 4 pasos */}
          <div className="border-t border-[#E5E4DF] pt-4">
            <h3 className="text-xs font-semibold text-zinc-900">
              Guía rápida para conectar con Google Sheets
            </h3>
            <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-zinc-600 list-decimal list-inside">
              <li>
                Abre tu Google Sheet y ve a{' '}
                <strong className="text-zinc-800">
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
                <strong className="text-zinc-800">
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
          <div className="rounded-lg border border-[#E5E4DF] bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-sm font-semibold text-zinc-900">
                Código Google Apps Script (Code.gs)
              </h2>
              <button
                type="button"
                onClick={handleCopyScript}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 cursor-pointer"
              >
                {copiedScript ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-700" />
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
            <pre className="max-h-64 overflow-auto rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 font-mono text-[11px] leading-relaxed text-zinc-800">
              {GOOGLE_APPS_SCRIPT_TEMPLATE}
            </pre>
          </div>

          <div className="rounded-lg border border-[#E5E4DF] bg-white p-5">
            <h2 className="mb-2 font-display text-sm font-semibold text-zinc-900">
              Vista previa del payload JSON (Proforma Nº {proforma.consecutivo})
            </h2>
            <pre className="max-h-48 overflow-auto rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 font-mono text-[11px] leading-relaxed text-zinc-700">
              {JSON.stringify(samplePayload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
