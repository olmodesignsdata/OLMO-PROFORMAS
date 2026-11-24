import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  Columns2,
  Download,
  FileJson,
  FilePlus2,
  FileSpreadsheet,
  HardDrive,
  Loader2,
  PanelLeft,
  Redo2,
  Save,
  Undo2,
  Upload,
} from 'lucide-react';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProformaUndoRedo } from './hooks/useProformaUndoRedo';
import {
  ClientDraftPayload,
  ClientsImportSummary,
  ClientsView,
} from './components/ClientsView';
import { EditorPanel } from './components/EditorPanel';
import { HistoryView } from './components/HistoryView';
import { IntegrationView } from './components/IntegrationView';
import { ProformaPreview } from './components/ProformaPreview';
import { TopBar } from './components/TopBar';
import {
  createEmptyProductLine,
  createInitialProforma,
  GRIFERIA_AUTO_FOOTER_LOGOS,
  isAutoGriferiaFooterLogo,
} from './data/defaults';
import {
  AppSection,
  BankAccountInfo,
  ClientsImportConfig,
  ClientsImportStrategy,
  CloudSyncConfig,
  CompanyInfo,
  GoogleSheetsConfig,
  LogoAsset,
  ProductLineItem,
  ProductTemplate,
  ProformaData,
  SavedClient,
  SavedProformaRecord,
  WorkspaceLayoutMode,
} from './types/proforma';
import {
  fetchRemoteProformasFromAppsScript,
  parseProformaFromJsonInput,
  sendProformaToWebhook,
} from './utils/cloudSync';
import {
  exportProformaToCSV,
  exportProformaToJSON,
  generateProformaPDF,
} from './utils/exporters';
import { computeProformaTotals, formatMoney } from './utils/formatters';
import { ClientImportRow } from './utils/googleSheets';
import {
  processLogoFile,
  processLogoUrl,
  rasterizeLogoForPdf,
} from './utils/logoUtils';
import {
  deleteProformaFromHistory,
  getNextConsecutivo,
  loadClientsImportConfig,
  loadCloudConfig,
  loadDraftProforma,
  loadDraftSavedAt,
  loadFooterLogos,
  loadGoogleSheetsConfig,
  loadMainLogo,
  loadProductTemplates,
  loadRemoteHistoryCache,
  loadSavedBankDefaults,
  loadSavedClients,
  loadSavedCompanyDefaults,
  loadSavedProformas,
  reserveNextConsecutivo,
  saveBankDefaults,
  saveClientsImportConfig,
  saveCloudConfig,
  saveCompanyDefaults,
  saveDraftProforma,
  saveFooterLogos,
  saveGoogleSheetsConfig,
  saveMainLogo,
  saveProductTemplates,
  saveProformaToHistory,
  saveRemoteHistoryCache,
  saveSavedClients,
  setNextConsecutivo,
} from './utils/storage';

function isUntouchedLegacySampleDraft(draft: ProformaData): boolean {
  if (draft.items.length !== 4) return false;
  return (
    draft.items[0]?.id === 'item-1' &&
    draft.items[0]?.producto === 'COCINA N1' &&
    draft.items[0]?.valor === 14850 &&
    draft.items[1]?.id === 'item-2' &&
    draft.items[2]?.id === 'item-3' &&
    draft.items[3]?.id === 'item-4'
  );
}

function normalizeProformaClientContact(data: ProformaData): ProformaData {
  const cp = data.clientProject;
  const hasLegacyClientSigner =
    data.signatures?.clienteNombre === 'Nombre y Cédula / Aprobación';
  const needsTypeOrRefs =
    !data.proformaType || !Array.isArray(data.visualReferences);

  if (
    typeof cp.telefono === 'string' &&
    typeof cp.correo === 'string' &&
    !hasLegacyClientSigner &&
    !needsTypeOrRefs
  ) {
    return data;
  }

  let telefono = typeof cp.telefono === 'string' ? cp.telefono : '';
  let correo = typeof cp.correo === 'string' ? cp.correo : '';

  const legacy = (cp.telefonoCorreo ?? '').trim();
  if (legacy && !telefono && !correo) {
    const parts = legacy.split('/').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const emailPart = parts.find((p) => p.includes('@')) ?? '';
      const phonePart = parts.find((p) => !p.includes('@')) ?? '';
      telefono = phonePart;
      correo = emailPart || (parts.length > 1 && !phonePart ? parts[1] : '');
    } else if (legacy.includes('@')) {
      correo = legacy;
    } else {
      telefono = legacy;
    }
  }

  return {
    ...data,
    proformaType: data.proformaType ?? 'mobiliario',
    visualReferences: Array.isArray(data.visualReferences)
      ? data.visualReferences
      : [],
    clientProject: {
      ...cp,
      telefono,
      correo,
    },
    signatures: hasLegacyClientSigner
      ? {
          ...data.signatures,
          clienteNombre: '',
        }
      : data.signatures,
  };
}

function serializeForDiff(data: ProformaData): string {
  return JSON.stringify({
    consecutivo: data.consecutivo,
    proformaType: data.proformaType ?? 'mobiliario',
    company: data.company,
    clientProject: data.clientProject,
    items: data.items,
    visualReferences: data.visualReferences ?? [],
    taxRate: data.taxRate,
    terminosCondiciones: data.terminosCondiciones,
    specBlocks: data.specBlocks,
    bankAccount: data.bankAccount,
    paymentSchedule: data.paymentSchedule,
    signatures: data.signatures,
    notasFinales: data.notasFinales,
  });
}

function hasProformaUserContent(current: ProformaData): boolean {
  const cp = current.clientProject;
  const hasClientContent = Boolean(
    cp.cliente.trim() ||
      cp.contacto.trim() ||
      cp.telefono.trim() ||
      cp.correo.trim() ||
      cp.ubicacion.trim() ||
      cp.proyecto.trim()
  );
  if (hasClientContent) return true;

  if (current.signatures.clienteNombre.trim()) return true;
  if (current.notasFinales.trim()) return true;

  const hasVisualRefs = (current.visualReferences ?? []).some(
    (ref) => ref.imageDataUrl.trim() || ref.caption.trim()
  );
  if (hasVisualRefs) return true;

  if (current.items.length > 1) return true;
  const first = current.items[0];
  if (
    first &&
    (first.producto.trim() ||
      first.descripcion.trim() ||
      (first.imagen ?? '').trim() ||
      first.valor > 0 ||
      (first.valorUnitario ?? 0) > 0 ||
      first.cantidad !== 1)
  ) {
    return true;
  }

  return false;
}

function hasUnsavedProformaChanges(
  current: ProformaData,
  history: SavedProformaRecord[]
): boolean {
  const savedMatch = history.find((rec) => rec.id === current.id);
  if (savedMatch) {
    return (
      serializeForDiff(current) !==
      serializeForDiff(normalizeProformaClientContact(savedMatch.data))
    );
  }

  return hasProformaUserContent(current);
}

function formatTimeHHMM(isoString: string): string {
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isTextEditingElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = ((target as HTMLInputElement).type || 'text').toLowerCase();
    const nonTextTypes = new Set([
      'button',
      'checkbox',
      'radio',
      'submit',
      'reset',
      'file',
      'range',
      'color',
      'image',
      'hidden',
    ]);
    return !nonTextTypes.has(type);
  }
  return false;
}

export default function App() {
  const [nextConsecutivo, setNextConsecutivoState] = useState<number>(() =>
    getNextConsecutivo()
  );

  const {
    proforma,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    updateProforma,
    resetProforma,
    undo,
    redo,
  } = useProformaUndoRedo(() => {
    const draft = loadDraftProforma();
    if (draft) {
      const normalized = normalizeProformaClientContact(draft);
      if (isUntouchedLegacySampleDraft(normalized)) {
        return {
          ...normalized,
          items: [createEmptyProductLine()],
        };
      }
      return normalized;
    }
    const initial = createInitialProforma(getNextConsecutivo(), true);
    initial.company = loadSavedCompanyDefaults();
    initial.bankAccount = loadSavedBankDefaults();
    return initial;
  });

  const [history, setHistory] = useState<SavedProformaRecord[]>(() =>
    loadSavedProformas().map((rec) => ({
      ...rec,
      data: normalizeProformaClientContact(rec.data),
    }))
  );

  const [cloudConfig, setCloudConfig] = useState<CloudSyncConfig>(() =>
    loadCloudConfig()
  );

  const [mainLogo, setMainLogo] = useState<LogoAsset>(() => loadMainLogo());

  const [footerLogos, setFooterLogos] = useState<Array<LogoAsset | null>>(() =>
    loadFooterLogos()
  );

  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsConfig>(() =>
    loadGoogleSheetsConfig()
  );

  const [productTemplates, setProductTemplates] = useState<ProductTemplate[]>(
    () => loadProductTemplates()
  );

  const [savedClients, setSavedClients] = useState<SavedClient[]>(() =>
    loadSavedClients()
  );

  const [clientsImportConfig, setClientsImportConfig] =
    useState<ClientsImportConfig>(() => loadClientsImportConfig());

  const [remoteHistory, setRemoteHistory] = useState<SavedProformaRecord[]>(
    () =>
      loadRemoteHistoryCache().records.map((rec) => ({
        ...rec,
        source: 'sheet',
        data: normalizeProformaClientContact(rec.data),
      }))
  );
  const [lastRemoteHistorySyncAt, setLastRemoteHistorySyncAt] = useState<
    string | undefined
  >(() => loadRemoteHistoryCache().syncedAt);
  const [isSyncingRemoteHistory, setIsSyncingRemoteHistory] = useState(false);
  const [remoteHistoryFeedback, setRemoteHistoryFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [activeSection, setActiveSection] = useState<AppSection>('history');
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayoutMode>('split');
  const [isSendingToSheet, setIsSendingToSheet] = useState(false);
  const [showNewQuoteConfirm, setShowNewQuoteConfirm] = useState(false);
  const [pendingLoadDraft, setPendingLoadDraft] = useState<{
    data: ProformaData;
    sourceLabel: string;
  } | null>(null);
  const [showJsonDraftMenu, setShowJsonDraftMenu] = useState(false);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(
    null
  );
  const [lastLocalSavedAt, setLastLocalSavedAt] = useState<string | null>(() =>
    loadDraftSavedAt()
  );
  const [autosaveStatus, setAutosaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >(() => (loadDraftSavedAt() ? 'saved' : 'idle'));

  const totals = useMemo(() => computeProformaTotals(proforma), [proforma]);

  const latestProformaRef = useRef(proforma);
  const latestTotalsRef = useRef(totals);
  const latestHistoryRef = useRef(history);
  const latestFooterLogosRef = useRef(footerLogos);
  const prevFooterSyncContextRef = useRef<{ id: string; type: string }>({
    id: proforma.id,
    type: proforma.proformaType ?? 'mobiliario',
  });
  const jsonMenuRef = useRef<HTMLDivElement | null>(null);
  const jsonImportInputRef = useRef<HTMLInputElement | null>(null);
  const isInitialAutosaveMountRef = useRef(true);
  const hasEditedSinceLoadRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);

  latestProformaRef.current = proforma;
  latestTotalsRef.current = totals;
  latestHistoryRef.current = history;
  latestFooterLogosRef.current = footerLogos;

  // Preconvertir logos externos (principal y pie de página) a DataURL en memoria para exportación PDF sin bloqueos CORS
  useEffect(() => {
    if (!mainLogo.dataUrl || mainLogo.dataUrl.startsWith('data:')) return;
    void rasterizeLogoForPdf(mainLogo);
  }, [mainLogo]);

  useEffect(() => {
    footerLogos.forEach((logo) => {
      if (logo?.dataUrl && !logo.dataUrl.startsWith('data:')) {
        void rasterizeLogoForPdf(logo);
      }
    });
  }, [footerLogos]);

  // Cargar o limpiar automáticamente los logos del pie de página según el Tipo de Proforma ("Grifería y Losa Sanitaria")
  useEffect(() => {
    const currentType = proforma.proformaType ?? 'mobiliario';
    const prevCtx = prevFooterSyncContextRef.current;
    if (prevCtx.id === proforma.id && prevCtx.type === currentType) {
      return;
    }
    prevFooterSyncContextRef.current = { id: proforma.id, type: currentType };

    const currentFooter = latestFooterLogosRef.current;
    let changed = false;
    let updated: Array<LogoAsset | null>;

    if (currentType === 'griferia') {
      updated = [0, 1, 2].map((idx) => {
        const existing = currentFooter[idx] ?? null;
        if (idx < 2 && !existing) {
          changed = true;
          return { ...GRIFERIA_AUTO_FOOTER_LOGOS[idx] };
        }
        return existing;
      });
    } else {
      updated = [0, 1, 2].map((idx) => {
        const existing = currentFooter[idx] ?? null;
        if (isAutoGriferiaFooterLogo(existing)) {
          changed = true;
          return null;
        }
        return existing;
      });
    }

    if (changed) {
      saveFooterLogos(updated);
      setFooterLogos(updated);
    }
  }, [proforma.id, proforma.proformaType]);

  // Cerrar menú desplegable de Borrador (.json) al hacer clic fuera
  useEffect(() => {
    if (!showJsonDraftMenu) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        jsonMenuRef.current &&
        !jsonMenuRef.current.contains(event.target as Node)
      ) {
        setShowJsonDraftMenu(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowJsonDraftMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showJsonDraftMenu]);

  const persistLocalBackup = useCallback(
    (forceHistoryBackup: boolean): string | null => {
      const currentDraft = latestProformaRef.current;
      const currentTotals = latestTotalsRef.current;
      const savedAt = saveDraftProforma(currentDraft);
      if (!savedAt) {
        setAutosaveStatus('error');
        return null;
      }

      setLastLocalSavedAt(savedAt);
      setAutosaveStatus('saved');

      const existsInHistory = latestHistoryRef.current.some(
        (rec) =>
          rec.id === currentDraft.id ||
          rec.consecutivo === currentDraft.consecutivo
      );
      if (
        forceHistoryBackup ||
        (hasEditedSinceLoadRef.current &&
          (existsInHistory || hasProformaUserContent(currentDraft)))
      ) {
        const updatedHistory = saveProformaToHistory(
          currentDraft,
          currentTotals.total
        );
        setHistory(updatedHistory);
        setNextConsecutivoState(getNextConsecutivo());
      }

      return savedAt;
    },
    []
  );

  // Autoguardado continuo con debounce de 650 ms al editar la cotización activa
  useEffect(() => {
    if (isInitialAutosaveMountRef.current) {
      isInitialAutosaveMountRef.current = false;
      // Garantizar que el borrador inicial quede persistido si no existía
      if (!loadDraftSavedAt()) {
        const savedAt = saveDraftProforma(proforma);
        if (savedAt) {
          setLastLocalSavedAt(savedAt);
          setAutosaveStatus('saved');
        }
      }
      return;
    }

    setAutosaveStatus('saving');
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      persistLocalBackup(false);
    }, 650);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [proforma, persistLocalBackup]);

  // Respaldo inmediato si se cierra o recarga la pestaña antes de que venza el debounce
  useEffect(() => {
    const handleFlushOnExit = () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const currentDraft = latestProformaRef.current;
      saveDraftProforma(currentDraft);
      const existsInHistory = latestHistoryRef.current.some(
        (rec) =>
          rec.id === currentDraft.id ||
          rec.consecutivo === currentDraft.consecutivo
      );
      if (
        hasEditedSinceLoadRef.current &&
        (existsInHistory || hasProformaUserContent(currentDraft))
      ) {
        saveProformaToHistory(currentDraft, latestTotalsRef.current.total);
      }
    };

    window.addEventListener('pagehide', handleFlushOnExit);
    window.addEventListener('beforeunload', handleFlushOnExit);
    return () => {
      window.removeEventListener('pagehide', handleFlushOnExit);
      window.removeEventListener('beforeunload', handleFlushOnExit);
    };
  }, []);

  const showToast = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => {
      setToast((current) => (current?.text === text ? null : current));
    }, 3800);
  }, []);

  const handleUndo = useCallback(() => {
    const restored = undo();
    if (restored) {
      hasEditedSinceLoadRef.current = true;
      showToast('Cambio deshecho.');
    }
  }, [undo, showToast]);

  const handleRedo = useCallback(() => {
    const restored = redo();
    if (restored) {
      hasEditedSinceLoadRef.current = true;
      showToast('Cambio rehecho.');
    }
  }, [redo, showToast]);

  // Atajos de teclado globales (Ctrl+Z / Cmd+Z y Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeSection !== 'editor' && activeSection !== 'preview') return;
      if (showNewQuoteConfirm || pendingLoadDraft) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (isTextEditingElement(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        if (canUndo) {
          event.preventDefault();
          handleUndo();
        }
      } else if (
        (key === 'y' && !event.shiftKey) ||
        (key === 'z' && event.shiftKey)
      ) {
        if (canRedo) {
          event.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeSection,
    showNewQuoteConfirm,
    pendingLoadDraft,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
  ]);

  const handleSaveNowLocal = () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const savedAt = persistLocalBackup(true);
    if (savedAt) {
      showToast(
        `Guardado local completado (${formatTimeHHMM(savedAt)}) para la Proforma Nº ${proforma.consecutivo}.`
      );
    } else {
      showToast(
        'No se pudo guardar localmente en el navegador (espacio insuficiente).',
        true
      );
    }
  };

  const handleSaveToHistory = async () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const savedAt = saveDraftProforma(proforma);
    if (savedAt) {
      setLastLocalSavedAt(savedAt);
      setAutosaveStatus('saved');
    }
    const updatedHistory = saveProformaToHistory(proforma, totals.total);
    setHistory(updatedHistory);
    const updatedNext = getNextConsecutivo();
    setNextConsecutivoState(updatedNext);

    if (cloudConfig.autoSyncOnSave && cloudConfig.webhookUrl.trim()) {
      const res = await sendProformaToWebhook(cloudConfig, proforma, totals);
      if (res.ok) {
        const nextCfg: CloudSyncConfig = {
          ...cloudConfig,
          lastSyncedAt: new Date().toISOString(),
          lastStatus: 'ok',
          lastMessage: res.message,
        };
        setCloudConfig(nextCfg);
        saveCloudConfig(nextCfg);
        showToast(
          `Proforma Nº ${proforma.consecutivo} guardada en historial y sincronizada en la nube.`
        );
      } else {
        showToast(
          `Guardada en historial local. Error al sincronizar en nube: ${res.message}`,
          true
        );
      }
    } else {
      showToast(
        `Proforma Nº ${proforma.consecutivo} guardada en historial local.`
      );
    }
  };

  const executeNewProforma = () => {
    // Reserva automáticamente el siguiente consecutivo disponible sin sobrescribir ni repetir guardados
    const reserved = reserveNextConsecutivo(proforma.consecutivo);
    setNextConsecutivoState(reserved);
    const fresh = createInitialProforma(reserved, true);
    fresh.company = loadSavedCompanyDefaults();
    fresh.bankAccount = loadSavedBankDefaults();
    fresh.signatures.representanteNombre =
      proforma.signatures.representanteNombre;
    hasEditedSinceLoadRef.current = false;
    resetProforma(fresh);
    setShowNewQuoteConfirm(false);
    setActiveSection('editor');
    showToast(`Nueva cotización iniciada con consecutivo Nº ${reserved}.`);
  };

  const handleRequestNewProforma = () => {
    if (hasUnsavedProformaChanges(proforma, history)) {
      setShowNewQuoteConfirm(true);
      return;
    }
    executeNewProforma();
  };

  const handleSaveAndStartNewProforma = async () => {
    await handleSaveToHistory();
    executeNewProforma();
  };

  const handleSyncNextConsecutivo = () => {
    const nextNum = getNextConsecutivo();
    hasEditedSinceLoadRef.current = true;
    updateProforma((prev) => ({
      ...prev,
      consecutivo: nextNum,
    }));
    showToast(`Consecutivo sincronizado a Nº ${nextNum}.`);
  };

  const handleDownloadPDF = async () => {
    try {
      const result = await generateProformaPDF(
        proforma,
        totals,
        mainLogo,
        footerLogos
      );
      // Guardar automáticamente en historial al generar PDF para asegurar consecutivo único
      const savedAt = saveDraftProforma(proforma);
      if (savedAt) {
        setLastLocalSavedAt(savedAt);
        setAutosaveStatus('saved');
      }
      const updatedHistory = saveProformaToHistory(proforma, totals.total);
      setHistory(updatedHistory);
      setNextConsecutivoState(getNextConsecutivo());
      if (result.skippedExternalImages > 0) {
        showToast(
          `PDF "${result.fileName}" generado. Nota: ${result.skippedExternalImages} imagen(es) por enlace externo no pudieron incrustarse por permisos CORS del servidor (usa "Imprimir" o súbelas desde tu PC).`,
          true
        );
      } else {
        showToast(`PDF "${result.fileName}" generado correctamente.`);
      }
    } catch {
      showToast('Ocurrió un error al generar el PDF. Intenta de nuevo.', true);
    }
  };

  const handleSendProformaToSheet = async () => {
    if (!cloudConfig.webhookUrl.trim()) {
      showToast(
        'Falta configurar la URL de Google Apps Script (/exec) en la pestaña Integración antes de enviar la proforma al Google Sheet.',
        true
      );
      return;
    }

    setIsSendingToSheet(true);
    try {
      const res = await sendProformaToWebhook(cloudConfig, proforma, totals);

      const savedAt = saveDraftProforma(proforma);
      if (savedAt) {
        setLastLocalSavedAt(savedAt);
        setAutosaveStatus('saved');
      }
      const updatedHistory = saveProformaToHistory(proforma, totals.total);
      setHistory(updatedHistory);
      setNextConsecutivoState(getNextConsecutivo());

      const nextCfg: CloudSyncConfig = {
        ...cloudConfig,
        lastSyncedAt: res.ok
          ? new Date().toISOString()
          : cloudConfig.lastSyncedAt,
        lastStatus: res.ok ? 'ok' : 'error',
        lastMessage: res.message,
      };
      setCloudConfig(nextCfg);
      saveCloudConfig(nextCfg);

      showToast(res.message, !res.ok);
    } catch {
      showToast(
        'Ocurrió un error al enviar la proforma hacia Google Apps Script.',
        true
      );
    } finally {
      setIsSendingToSheet(false);
    }
  };

  const handleUploadMainLogo = async (file: File) => {
    try {
      const processed = await processLogoFile(file);
      const saved = saveMainLogo(processed);
      setMainLogo(processed);
      if (saved) {
        showToast('Logo principal actualizado y guardado para futuras sesiones.');
      } else {
        showToast(
          'Logo cargado, pero superó el límite de almacenamiento local. Intenta una imagen más liviana.',
          true
        );
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo cargar el logo.',
        true
      );
    }
  };

  const handleApplyMainLogoUrl = async (
    url: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const processed = await processLogoUrl(url);
      const saved = saveMainLogo(processed);
      setMainLogo(processed);
      if (saved) {
        showToast('Logo principal actualizado desde enlace.');
      }
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el logo desde el enlace.';
      showToast(message, true);
      return { ok: false, error: message };
    }
  };

  const handleResetMainLogo = () => {
    saveMainLogo(null);
    setMainLogo(loadMainLogo());
    showToast('Logo principal restaurado a OLMO B.N.');
  };

  const handleUploadFooterLogo = async (slotIndex: number, file: File) => {
    if (slotIndex < 0 || slotIndex > 2) return;
    try {
      const processed = await processLogoFile(file);
      const updated = [0, 1, 2].map((i) =>
        i === slotIndex ? processed : footerLogos[i] ?? null
      );
      const saved = saveFooterLogos(updated);
      setFooterLogos(updated);
      if (saved) {
        showToast(
          `Logo de pie de página (Espacio ${slotIndex + 1}) guardado en el navegador.`
        );
      } else {
        showToast(
          'Logo cargado, pero superó el límite de almacenamiento local. Intenta una imagen más liviana.',
          true
        );
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo cargar el logo.',
        true
      );
    }
  };

  const handleApplyFooterLogoUrl = async (
    slotIndex: number,
    url: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (slotIndex < 0 || slotIndex > 2) {
      return { ok: false, error: 'Espacio de logo inválido.' };
    }
    try {
      const processed = await processLogoUrl(url);
      const updated = [0, 1, 2].map((i) =>
        i === slotIndex ? processed : footerLogos[i] ?? null
      );
      const saved = saveFooterLogos(updated);
      setFooterLogos(updated);
      if (saved) {
        showToast(
          `Logo de pie de página (Espacio ${slotIndex + 1}) guardado desde enlace.`
        );
      }
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el logo desde el enlace.';
      showToast(message, true);
      return { ok: false, error: message };
    }
  };

  const handleRemoveFooterLogo = (slotIndex: number) => {
    const updated = [0, 1, 2].map((i) =>
      i === slotIndex ? null : footerLogos[i] ?? null
    );
    saveFooterLogos(updated);
    setFooterLogos(updated);
    showToast(`Logo del Espacio ${slotIndex + 1} eliminado del pie de página.`);
  };

  const handleSheetsConfigChange = (next: GoogleSheetsConfig) => {
    setSheetsConfig(next);
    saveGoogleSheetsConfig(next);
  };

  const handleSaveProductTemplate = (item: ProductLineItem) => {
    const producto = item.producto.trim();
    if (!producto) {
      showToast(
        'Escribe el nombre del producto antes de guardarlo como plantilla.',
        true
      );
      return;
    }

    const normalizedName = producto.toLowerCase();
    const existingIndex = productTemplates.findIndex(
      (t) => t.producto.trim().toLowerCase() === normalizedName
    );

    const template: ProductTemplate = {
      id:
        existingIndex >= 0
          ? productTemplates[existingIndex].id
          : `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      producto,
      descripcion: item.descripcion,
      cantidad: item.cantidad > 0 ? item.cantidad : 1,
      unidad: item.unidad.trim() || 'und(s)',
      valor: item.valor >= 0 ? item.valor : 0,
      valorUnitario: item.valorUnitario,
      imagen: item.imagen,
      createdAt: new Date().toISOString(),
    };

    const updated =
      existingIndex >= 0
        ? productTemplates.map((t, idx) =>
            idx === existingIndex ? template : t
          )
        : [template, ...productTemplates];

    saveProductTemplates(updated);
    setProductTemplates(updated);
    showToast(
      existingIndex >= 0
        ? `Plantilla "${producto}" actualizada.`
        : `Plantilla "${producto}" guardada en plantillas rápidas.`
    );
  };

  const handleDeleteProductTemplate = (templateId: string) => {
    const target = productTemplates.find((t) => t.id === templateId);
    const updated = productTemplates.filter((t) => t.id !== templateId);
    saveProductTemplates(updated);
    setProductTemplates(updated);
    if (target) {
      showToast(`Plantilla "${target.producto}" eliminada.`);
    }
  };

  const handleOpenRecord = (record: SavedProformaRecord) => {
    const parsedFromDatosJson = record.rawDatosJson
      ? parseProformaFromJsonInput(record.rawDatosJson, record.consecutivo)
      : null;

    const candidateData =
      parsedFromDatosJson ??
      normalizeProformaClientContact(
        JSON.parse(JSON.stringify(record.data)) as ProformaData
      );

    const sourceLabel =
      record.source === 'sheet'
        ? record.rawDatosJson
          ? 'Google Sheets (Datos_JSON completo)'
          : 'Google Sheets (PROFORMAS)'
        : 'Historial local';

    setPendingLoadDraft({
      data: candidateData,
      sourceLabel,
    });
  };

  const handleImportDraftFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseProformaFromJsonInput(text, proforma.consecutivo);
      if (!parsed) {
        showToast(
          'El archivo seleccionado no contiene un borrador válido de OLMO Proformas (.json).',
          true
        );
        return;
      }
      setPendingLoadDraft({
        data: normalizeProformaClientContact(parsed),
        sourceLabel: `Archivo portátil "${file.name}"`,
      });
    } catch {
      showToast('No se pudo leer el archivo .json seleccionado.', true);
    }
  };

  const executeLoadPendingDraft = () => {
    if (!pendingLoadDraft) return;
    const loaded = normalizeProformaClientContact(
      JSON.parse(JSON.stringify(pendingLoadDraft.data)) as ProformaData
    );
    hasEditedSinceLoadRef.current = false;
    resetProforma(loaded);
    setPendingLoadDraft(null);
    setActiveSection('editor');
    showToast(
      `Proforma Nº ${loaded.consecutivo} cargada en el editor para continuar editando.`
    );
  };

  const handleSaveCurrentAndLoadPendingDraft = async () => {
    await handleSaveToHistory();
    executeLoadPendingDraft();
  };

  const handleDuplicateRecord = (record: SavedProformaRecord) => {
    const nextNum = reserveNextConsecutivo(
      Math.max(proforma.consecutivo, record.consecutivo)
    );
    setNextConsecutivoState(nextNum);
    const cloned = normalizeProformaClientContact(
      JSON.parse(JSON.stringify(record.data)) as ProformaData
    );
    cloned.id = `prof-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    cloned.consecutivo = nextNum;
    cloned.updatedAt = new Date().toISOString();
    hasEditedSinceLoadRef.current = true;
    resetProforma(cloned);
    setActiveSection('editor');
    showToast(
      `Proforma Nº ${record.consecutivo} duplicada como Nº ${nextNum}.`
    );
  };

  const handleDeleteRecord = (id: string) => {
    const updated = deleteProformaFromHistory(id);
    setHistory(updated);
    showToast('Cotización eliminada del historial local.');
  };

  const handleSaveClientInDirectory = (
    payload: ClientDraftPayload,
    editingId?: string
  ) => {
    const now = new Date().toISOString();
    let updated: SavedClient[];
    if (editingId) {
      updated = savedClients.map((c) =>
        c.id === editingId ? { ...c, ...payload, updatedAt: now } : c
      );
      showToast(`Cliente "${payload.cliente}" actualizado en el directorio.`);
    } else {
      const created: SavedClient = {
        id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...payload,
        createdAt: now,
        updatedAt: now,
      };
      updated = [created, ...savedClients];
      showToast(`Cliente "${payload.cliente}" guardado en el directorio.`);
    }
    saveSavedClients(updated);
    setSavedClients(updated);
  };

  const handleSaveClientFromEditor = (
    payload: ClientDraftPayload,
    mode: 'upsert' | 'create'
  ) => {
    const normalized = payload.cliente.trim().toLowerCase();
    const existing =
      mode === 'upsert'
        ? savedClients.find(
            (c) => c.cliente.trim().toLowerCase() === normalized
          )
        : undefined;
    handleSaveClientInDirectory(payload, existing?.id);
  };

  const handleDuplicateClient = (client: SavedClient) => {
    const now = new Date().toISOString();
    const copy: SavedClient = {
      ...client,
      id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      cliente: `${client.cliente} (Copia)`,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [copy, ...savedClients];
    saveSavedClients(updated);
    setSavedClients(updated);
    showToast(`Cliente "${client.cliente}" duplicado.`);
  };

  const handleDeleteClient = (id: string) => {
    const target = savedClients.find((c) => c.id === id);
    const updated = savedClients.filter((c) => c.id !== id);
    saveSavedClients(updated);
    setSavedClients(updated);
    if (target) {
      showToast(`Cliente "${target.cliente}" eliminado del directorio.`);
    }
  };

  const handleClientsImportConfigChange = (next: ClientsImportConfig) => {
    setClientsImportConfig(next);
    saveClientsImportConfig(next);
  };

  const handleImportClients = (
    rows: ClientImportRow[],
    strategy: ClientsImportStrategy
  ): ClientsImportSummary => {
    const now = new Date().toISOString();
    const normalizeKey = (name: string) => name.trim().toLowerCase();

    if (strategy === 'replace') {
      const deduped = new Map<string, SavedClient>();
      rows.forEach((row, idx) => {
        const cleanName = row.cliente.trim();
        if (!cleanName) return;
        const key = normalizeKey(cleanName);
        const existing = deduped.get(key);
        deduped.set(key, {
          id:
            existing?.id ??
            `cli-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          cliente: cleanName,
          contacto: row.contacto || existing?.contacto || '',
          telefono: row.telefono || existing?.telefono || '',
          correo: row.correo || existing?.correo || '',
          ubicacion: row.ubicacion || existing?.ubicacion || '',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
      });

      const nextList = Array.from(deduped.values());
      saveSavedClients(nextList);
      setSavedClients(nextList);
      showToast(
        `Lista de clientes reemplazada con ${nextList.length} cliente(s).`
      );
      return {
        added: nextList.length,
        updated: 0,
        total: nextList.length,
      };
    }

    const nextList = [...savedClients];
    const indexByName = new Map<string, number>();
    nextList.forEach((c, idx) => {
      indexByName.set(normalizeKey(c.cliente), idx);
    });

    let added = 0;
    let updated = 0;
    const updatedIndexes = new Set<number>();

    rows.forEach((row, idx) => {
      const cleanName = row.cliente.trim();
      if (!cleanName) return;
      const key = normalizeKey(cleanName);
      const matchIdx = indexByName.get(key);

      if (matchIdx !== undefined) {
        const current = nextList[matchIdx];
        nextList[matchIdx] = {
          ...current,
          cliente: cleanName,
          contacto: row.contacto || current.contacto,
          telefono: row.telefono || current.telefono,
          correo: row.correo || current.correo,
          ubicacion: row.ubicacion || current.ubicacion,
          updatedAt: now,
        };
        if (!updatedIndexes.has(matchIdx) && matchIdx < savedClients.length) {
          updated++;
          updatedIndexes.add(matchIdx);
        }
      } else {
        const newClient: SavedClient = {
          id: `cli-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          cliente: cleanName,
          contacto: row.contacto,
          telefono: row.telefono,
          correo: row.correo,
          ubicacion: row.ubicacion,
          createdAt: now,
          updatedAt: now,
        };
        indexByName.set(key, nextList.length);
        nextList.push(newClient);
        added++;
      }
    });

    saveSavedClients(nextList);
    setSavedClients(nextList);
    showToast(
      `Importación de clientes completada: ${added} agregado(s), ${updated} actualizado(s).`
    );
    return {
      added,
      updated,
      total: nextList.length,
    };
  };

  const handleUseClientInProforma = (client: SavedClient) => {
    hasEditedSinceLoadRef.current = true;
    updateProforma((prev) => ({
      ...prev,
      clientProject: {
        ...prev.clientProject,
        cliente: client.cliente,
        contacto: client.contacto,
        telefono: client.telefono,
        correo: client.correo,
        ubicacion: client.ubicacion,
      },
    }));
    setActiveSection('editor');
    showToast(
      `Datos de "${client.cliente}" aplicados a la proforma Nº ${proforma.consecutivo}.`
    );
  };

  const handleSaveCompanyDefaults = (info: CompanyInfo) => {
    saveCompanyDefaults(info);
  };

  const handleSaveBankDefaults = (info: BankAccountInfo) => {
    saveBankDefaults(info);
  };

  const handleSaveCloudConfig = (next: CloudSyncConfig) => {
    setCloudConfig(next);
    saveCloudConfig(next);
  };

  const handleSyncHistoryFromSheet = async () => {
    if (!cloudConfig.webhookUrl.trim()) {
      const msg =
        'Configura primero la URL de Google Apps Script (/exec) en la pestaña Integración.';
      setRemoteHistoryFeedback({ ok: false, message: msg });
      showToast(msg, true);
      return;
    }

    setIsSyncingRemoteHistory(true);
    setRemoteHistoryFeedback(null);
    try {
      const fetched = await fetchRemoteProformasFromAppsScript(cloudConfig);
      const normalized = fetched.map((rec) => ({
        ...rec,
        source: 'sheet' as const,
        data: normalizeProformaClientContact(rec.data),
      }));
      const syncedAt = new Date().toISOString();
      setRemoteHistory(normalized);
      setLastRemoteHistorySyncAt(syncedAt);
      saveRemoteHistoryCache({ records: normalized, syncedAt });

      const msg =
        normalized.length > 0
          ? `Se sincronizaron ${normalized.length} proforma(s) desde la pestaña PROFORMAS.`
          : 'Conexión correcta con PROFORMAS, pero la hoja aún no contiene filas registradas.';
      setRemoteHistoryFeedback({ ok: true, message: msg });
      showToast(msg);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo consultar la pestaña PROFORMAS.';
      setRemoteHistoryFeedback({ ok: false, message: msg });
      showToast(msg, true);
    } finally {
      setIsSyncingRemoteHistory(false);
    }
  };

  const handleManualConsecutivoChange = (updater: (prev: ProformaData) => ProformaData) => {
    hasEditedSinceLoadRef.current = true;
    updateProforma((prev) => {
      const next = updater(prev);
      if (next.consecutivo !== prev.consecutivo && next.consecutivo >= nextConsecutivo) {
        const updatedNext = setNextConsecutivo(next.consecutivo);
        setNextConsecutivoState(updatedNext);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#F6F5F2] text-zinc-900">
      <TopBar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onDownloadPDF={handleDownloadPDF}
        historyCount={history.length}
        clientsCount={savedClients.length}
      />

      {/* Notificación flotante sobria */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-5 right-5 z-40 flex max-w-md items-center gap-2.5 rounded-lg border border-[#E5E4DF] bg-white px-4 py-3 text-xs font-medium text-zinc-900 shadow-lg"
        >
          <CheckCircle2
            className={`h-4 w-4 shrink-0 ${
              toast.isError ? 'text-amber-600' : 'text-emerald-700'
            }`}
            aria-hidden="true"
          />
          <span>{toast.text}</span>
        </div>
      )}

      <main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6">
        {/* Barra de acciones del espacio de trabajo (visible en Editor y Vista Previa) */}
        {(activeSection === 'editor' || activeSection === 'preview') && (
          <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E5E4DF] bg-white px-4 py-3">
            {/* Metadatos unboxed con separadores tipográficos e indicador discreto de guardado local */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                Proforma Nº {proforma.consecutivo}
              </span>
              <span aria-hidden="true">·</span>
              <span className="max-w-[220px] truncate font-medium text-zinc-800">
                {proforma.clientProject.cliente || 'Cliente sin definir'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {totals.unidadResumen}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-[#8C5A32] tabular-nums">
                Total: {formatMoney(totals.total, proforma.clientProject.moneda)}
              </span>
              <span aria-hidden="true">·</span>
              <span
                title="Respaldo automático continuo en este navegador, incluso sin internet o conexión al script"
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  autosaveStatus === 'error'
                    ? 'bg-red-50 text-red-700'
                    : autosaveStatus === 'saving'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-emerald-50/80 text-emerald-800'
                }`}
              >
                {autosaveStatus === 'saving' ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <HardDrive className="h-3 w-3" aria-hidden="true" />
                )}
                <span>
                  {autosaveStatus === 'saving'
                    ? 'Guardando local...'
                    : autosaveStatus === 'error'
                      ? 'Error guardado local'
                      : lastLocalSavedAt
                        ? `Guardado local ${formatTimeHHMM(lastLocalSavedAt)}`
                        : 'Autoguardado activo'}
                </span>
              </span>
            </div>

            {/* Botones de acción del documento */}
            <div className="flex flex-wrap items-center gap-2">
              {activeSection === 'editor' && (
                <div className="hidden xl:flex items-center rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-0.5 mr-1">
                  <button
                    type="button"
                    onClick={() => setLayoutMode('split')}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      layoutMode === 'split'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Dividido</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('editor')}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      layoutMode === 'editor'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Solo Editor</span>
                  </button>
                </div>
              )}

              {/* Deshacer / Rehacer */}
              <div className="inline-flex items-center rounded-md border border-[#DCDAD3] bg-white">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  title={
                    canUndo
                      ? `Deshacer (${undoCount} paso${undoCount === 1 ? '' : 's'}) · Ctrl+Z`
                      : 'No hay cambios anteriores para deshacer'
                  }
                  className="inline-flex items-center gap-1 rounded-l-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Deshacer</span>
                </button>
                <span className="h-4 w-px bg-[#E5E4DF]" aria-hidden="true" />
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  title={
                    canRedo
                      ? `Rehacer (${redoCount} paso${redoCount === 1 ? '' : 's'}) · Ctrl+Y`
                      : 'No hay cambios posteriores para rehacer'
                  }
                  className="inline-flex items-center gap-1 rounded-r-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Rehacer</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleRequestNewProforma}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Nueva Cotización</span>
              </button>

              <button
                type="button"
                onClick={handleSaveNowLocal}
                title="Guardar borrador y respaldo en el historial local de inmediato (sin depender de internet)"
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Guardar ahora</span>
              </button>

              <button
                type="button"
                onClick={handleSaveToHistory}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Guardar en Historial</span>
              </button>

              <input
                ref={jsonImportInputRef}
                type="file"
                accept=".json,application/json"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) {
                    void handleImportDraftFile(file);
                  }
                }}
                className="hidden"
                aria-label="Importar borrador JSON desde archivo"
              />

              <div ref={jsonMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowJsonDraftMenu((open) => !open)}
                  aria-expanded={showJsonDraftMenu}
                  aria-haspopup="menu"
                  title="Exportar o importar un borrador completo (.json) como respaldo portátil entre computadoras"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileJson className="h-3.5 w-3.5 text-[#8C5A32]" aria-hidden="true" />
                  <span>Exportar / Importar Borrador (.json)</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${
                      showJsonDraftMenu ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {showJsonDraftMenu && (
                  <div
                    role="menu"
                    className="absolute right-0 z-30 mt-1.5 w-60 rounded-lg border border-[#DCDAD3] bg-white p-1.5 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowJsonDraftMenu(false);
                        exportProformaToJSON(proforma, totals);
                        showToast(
                          `Borrador Proforma Nº ${proforma.consecutivo} exportado en formato .json.`
                        );
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-zinc-800 hover:bg-[#FAF9F6] cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-[#8C5A32]" aria-hidden="true" />
                      <div>
                        <div>Exportar borrador (.json)</div>
                        <div className="text-[10.5px] font-normal text-zinc-500">
                          Descarga la proforma activa completa
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowJsonDraftMenu(false);
                        jsonImportInputRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-zinc-800 hover:bg-[#FAF9F6] cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5 text-[#8C5A32]" aria-hidden="true" />
                      <div>
                        <div>Importar borrador (.json)</div>
                        <div className="text-[10.5px] font-normal text-zinc-500">
                          Continúa un archivo enviado de otra PC
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => exportProformaToCSV(proforma, totals)}
                title="Exportar cotización en formato CSV compatible con Excel"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                <span>CSV / Excel</span>
              </button>

              <button
                type="button"
                onClick={handleSendProformaToSheet}
                disabled={isSendingToSheet}
                title="Enviar los datos de la proforma al Google Sheet configurado en Integración"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#8C5A32] bg-[#FAF6F1] px-3 py-1.5 text-xs font-semibold text-[#6F4423] hover:bg-[#F3ECE2] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isSendingToSheet ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {isSendingToSheet
                    ? 'Enviando al Sheet...'
                    : 'Enviar al Google Sheet'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPDF}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Guardar / Descargar PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Vista principal según sección */}
        {activeSection === 'editor' && (
          <div
            className={`grid grid-cols-1 gap-6 ${
              layoutMode === 'split'
                ? 'xl:grid-cols-12 xl:items-start'
                : 'mx-auto max-w-[920px]'
            }`}
          >
            <section
              aria-label="Formulario de captura de proforma"
              className={`no-print ${
                layoutMode === 'split'
                  ? 'xl:col-span-5 xl:sticky xl:top-20 xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto'
                  : ''
              }`}
            >
              <EditorPanel
                key={proforma.id}
                data={proforma}
                totals={totals}
                nextStoredConsecutivo={nextConsecutivo}
                mainLogo={mainLogo}
                footerLogos={footerLogos}
                sheetsConfig={sheetsConfig}
                productTemplates={productTemplates}
                savedClients={savedClients}
                onChange={handleManualConsecutivoChange}
                onSyncNextConsecutivo={handleSyncNextConsecutivo}
                onSaveCompanyDefaults={handleSaveCompanyDefaults}
                onSaveBankDefaults={handleSaveBankDefaults}
                onUploadMainLogo={handleUploadMainLogo}
                onApplyMainLogoUrl={handleApplyMainLogoUrl}
                onResetMainLogo={handleResetMainLogo}
                onUploadFooterLogo={handleUploadFooterLogo}
                onApplyFooterLogoUrl={handleApplyFooterLogoUrl}
                onRemoveFooterLogo={handleRemoveFooterLogo}
                onSheetsConfigChange={handleSheetsConfigChange}
                onSaveProductTemplate={handleSaveProductTemplate}
                onDeleteProductTemplate={handleDeleteProductTemplate}
                onSaveClientToDirectory={handleSaveClientFromEditor}
                onGoToClientsDirectory={() => setActiveSection('clients')}
              />
            </section>

            {layoutMode === 'split' && (
              <section
                aria-label="Vista previa del documento en 3 páginas"
                className="xl:col-span-7"
              >
                <ProformaPreview
                  data={proforma}
                  totals={totals}
                  mainLogo={mainLogo}
                  footerLogos={footerLogos}
                />
              </section>
            )}
          </div>
        )}

        {activeSection === 'preview' && (
          <div className="mx-auto max-w-[860px]">
            <ProformaPreview
              data={proforma}
              totals={totals}
              mainLogo={mainLogo}
              footerLogos={footerLogos}
            />
          </div>
        )}

        {activeSection === 'clients' && (
          <ClientsView
            clients={savedClients}
            importConfig={clientsImportConfig}
            onImportConfigChange={handleClientsImportConfigChange}
            onImportClients={handleImportClients}
            onSaveClient={handleSaveClientInDirectory}
            onDuplicateClient={handleDuplicateClient}
            onDeleteClient={handleDeleteClient}
            onUseClientInProforma={handleUseClientInProforma}
            onGoToEditor={() => setActiveSection('editor')}
            onNotify={showToast}
          />
        )}

        {activeSection === 'history' && (
          <HistoryView
            records={history}
            remoteRecords={remoteHistory}
            activeProformaId={proforma.id}
            activeConsecutivo={proforma.consecutivo}
            hasAppsScriptUrl={Boolean(cloudConfig.webhookUrl.trim())}
            isSyncingSheet={isSyncingRemoteHistory}
            isSendingToSheet={isSendingToSheet}
            lastSheetSyncAt={lastRemoteHistorySyncAt}
            sheetSyncFeedback={remoteHistoryFeedback}
            onSyncFromSheet={() => void handleSyncHistoryFromSheet()}
            onSendProforma={() => void handleSendProformaToSheet()}
            onGoToIntegration={() => setActiveSection('integration')}
            onOpenRecord={handleOpenRecord}
            onDuplicateRecord={handleDuplicateRecord}
            onDeleteRecord={handleDeleteRecord}
            onGoToEditor={() => setActiveSection('editor')}
            onNewProforma={handleRequestNewProforma}
            onImportDraftFile={(file) => void handleImportDraftFile(file)}
          />
        )}

        {activeSection === 'integration' && (
          <IntegrationView
            config={cloudConfig}
            proforma={proforma}
            totals={totals}
            onSaveConfig={handleSaveCloudConfig}
            onDownloadPDF={handleDownloadPDF}
          />
        )}
      </main>

      {showNewQuoteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-quote-dialog-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px]"
        >
          <div className="w-full max-w-md rounded-lg border border-[#E5E4DF] bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-50 p-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="new-quote-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900"
                >
                  ¿Iniciar una nueva cotización limpia?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                  La proforma actual (Nº {proforma.consecutivo}) tiene cambios sin guardar en el historial. Al continuar se reiniciará el editor con el siguiente consecutivo disponible, sin afectar las cotizaciones ya guardadas en el Historial.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewQuoteConfirm(false)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAndStartNewProforma}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Guardar y crear nueva</span>
              </button>
              <button
                type="button"
                onClick={executeNewProforma}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer"
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sí, nueva cotización</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingLoadDraft && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="load-draft-dialog-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px]"
        >
          <div className="w-full max-w-md rounded-lg border border-[#E5E4DF] bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-[#FAF6F1] p-2 text-[#8C5A32]">
                <FileJson className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="load-draft-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900"
                >
                  ¿Cargar Proforma Nº {pendingLoadDraft.data.consecutivo} en el editor?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                  Se reemplazará el borrador actual en el editor (Nº {proforma.consecutivo}) con todos los datos completos de esta cotización ({pendingLoadDraft.data.clientProject.cliente || 'Cliente sin definir'} · {pendingLoadDraft.data.items.length} ítem(s)) para que puedas seguir editándola y exportarla.
                </p>
                <p className="mt-1.5 text-[11px] font-medium text-zinc-500">
                  Origen: <span className="text-zinc-800">{pendingLoadDraft.sourceLabel}</span>
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingLoadDraft(null)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                Cancelar
              </button>
              {hasUnsavedProformaChanges(proforma, history) && (
                <button
                  type="button"
                  onClick={() => void handleSaveCurrentAndLoadPendingDraft()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Guardar actual y cargar</span>
                </button>
              )}
              <button
                type="button"
                onClick={executeLoadPendingDraft}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sí, cargar y editar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
