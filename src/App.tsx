import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FileJson,
  FilePlus2,
  Hash,
  Loader2,
  Save,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useProformaUndoRedo } from './hooks/useProformaUndoRedo';
import {
  ClientDraftPayload,
  ClientsImportSummary,
  ClientsView,
} from './components/ClientsView';
import { DashboardView } from './components/DashboardView';
import { EditorPanel } from './components/EditorPanel';
import { HistoryView, mergeProformaHistoryRecords } from './components/HistoryView';
import { ImportFromSheetModal } from './components/ImportFromSheetModal';
import { IntegrationView } from './components/IntegrationView';
import { PdfIcon } from './components/PdfIcon';
import {
  clampPreviewZoom,
  COMPARE_PREVIEW_ZOOM_STEP,
  CtrlWheelZoomBox,
  DEFAULT_COMPARE_PREVIEW_ZOOM,
  PreviewZoomControls,
} from './components/PreviewZoomControls';
import { ProformaPreview } from './components/ProformaPreview';
import { TopBar } from './components/TopBar';
import {
  createEmptyProductLine,
  createInitialProforma,
  DEFAULT_NOTAS_FINALES,
  GRIFERIA_AUTO_FOOTER_LOGOS,
  isAutoGriferiaFooterLogo,
  normalizeCompanyDefaults,
} from './data/defaults';
import {
  AppNotification,
  AppSection,
  AranSpecTemplate,
  AutoRefreshMinutes,
  BankAccountInfo,
  ClientsImportConfig,
  ClientsImportStrategy,
  CloudSyncConfig,
  CompanyInfo,
  EditorTab,
  GoogleSheetsConfig,
  LogoAsset,
  NotificationStateRecord,
  ProductLineItem,
  ProductTemplate,
  ProformaData,
  ProformaType,
  SavedClient,
  SavedProformaRecord,
  SheetShortcutUrls,
  TableColumnWidths,
  TerminoTemplate,
  ThemeMode,
  VisualReferenceItem,
  VisualReferenceSize,
  WorkspaceLayoutMode,
} from './types/proforma';
import {
  deleteClientFromGoogleSheet,
  deleteProformaFromSheet,
  fetchClientsFromAppsScript,
  fetchEspecificacionesYTerminosFromAppsScript,
  fetchRemoteProformasFromAppsScript,
  parseProformaFromJsonInput,
  sendClientToGoogleSheet,
  sendProformaToWebhook,
} from './utils/cloudSync';
import { generateProformaPDF } from './utils/exporters';
import {
  computeProformaTotals,
  formatMoney,
  formatProformaNumberLabel,
  isProformaDraft,
} from './utils/formatters';
import {
  ClientImportRow,
  DEFAULT_CLIENTS_SHEET_NAME,
  fetchAndParseGoogleSheetClients,
  SpreadsheetSheetNotFoundError,
} from './utils/googleSheets';
import {
  processLogoFile,
  processLogoUrl,
  rasterizeLogoForPdf,
} from './utils/logoUtils';
import { getConnectionButtonClasses } from './utils/connectionStyles';
import {
  clearDraftProforma,
  computeNextConsecutivoFromRecords,
  deleteProformaFromHistory,
  loadActiveProformaConfirmed,
  loadAranTemplatesCache,
  loadAutoRefreshMinutes,
  loadClientsImportConfig,
  loadCloudConfig,
  loadDraftProforma,
  loadDraftSavedAt,
  loadFooterLogos,
  loadGoogleSheetsConfig,
  loadIntegrationTabEnabled,
  loadMainLogo,
  loadNotificationsEnabled,
  loadNotificationState,
  loadProductTemplates,
  loadRemoteHistoryCache,
  loadSavedBankDefaults,
  loadSavedClients,
  loadSavedCompanyDefaults,
  loadSavedProformas,
  loadSheetShortcutUrls,
  loadTerminosTemplatesCache,
  loadThemeMode,
  reserveNextConsecutivo,
  saveActiveProformaConfirmed,
  saveAranTemplatesCache,
  saveAutoRefreshMinutes,
  saveBankDefaults,
  saveClientsImportConfig,
  saveCloudConfig,
  saveCompanyDefaults,
  saveDraftProforma,
  saveFooterLogos,
  saveGoogleSheetsConfig,
  saveIntegrationTabEnabled,
  saveMainLogo,
  saveNotificationsEnabled,
  saveNotificationState,
  saveProductTemplates,
  saveProformaToHistory,
  saveRemoteHistoryCache,
  saveSavedClients,
  saveSheetShortcutUrls,
  saveTerminosTemplatesCache,
  saveThemeMode,
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
  const normalizedCompany = normalizeCompanyDefaults(data.company);
  const hasCompanyChanges =
    !data.company ||
    normalizedCompany.nombreComercial !== data.company.nombreComercial ||
    normalizedCompany.razonSocial !== data.company.razonSocial ||
    normalizedCompany.cedulaJuridica !== data.company.cedulaJuridica ||
    normalizedCompany.telefono !== data.company.telefono ||
    normalizedCompany.correo !== data.company.correo ||
    normalizedCompany.sitioWeb !== data.company.sitioWeb ||
    normalizedCompany.direccion !== data.company.direccion;

  const hasLegacyClientSigner =
    data.signatures?.clienteNombre === 'Nombre y Cédula / Aprobación';
  const needsTypeOrRefs =
    !data.proformaType || !Array.isArray(data.visualReferences);

  const hasMissingNotasFinales = typeof data.notasFinales !== 'string';

  if (
    typeof cp.telefono === 'string' &&
    typeof cp.correo === 'string' &&
    !hasCompanyChanges &&
    !hasLegacyClientSigner &&
    !needsTypeOrRefs &&
    !hasMissingNotasFinales
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
    company: normalizedCompany,
    proformaType: data.proformaType ?? 'mobiliario',
    visualReferences: Array.isArray(data.visualReferences)
      ? data.visualReferences
      : [],
    notasFinales: hasMissingNotasFinales
      ? DEFAULT_NOTAS_FINALES
      : data.notasFinales,
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
    tableColumnWidthsByType: data.tableColumnWidthsByType ?? {},
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
  if (
    current.notasFinales.trim() &&
    current.notasFinales.trim() !== DEFAULT_NOTAS_FINALES.trim()
  ) {
    return true;
  }

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
  const [nextConsecutivo, setNextConsecutivoState] = useState<number>(() => {
    const computed = computeNextConsecutivoFromRecords(
      loadSavedProformas(),
      loadRemoteHistoryCache().records
    );
    return setNextConsecutivo(computed);
  });

  const [isProformaConfirmed, setIsProformaConfirmed] = useState<boolean>(() =>
    loadActiveProformaConfirmed()
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
    const savedLocal = loadSavedProformas();
    const computedNext = computeNextConsecutivoFromRecords(
      savedLocal,
      loadRemoteHistoryCache().records
    );
    if (loadActiveProformaConfirmed()) {
      const draft = loadDraftProforma();
      if (draft) {
        const normalized = normalizeProformaClientContact(draft);
        const base = isUntouchedLegacySampleDraft(normalized)
          ? {
              ...normalized,
              items: [createEmptyProductLine()],
            }
          : normalized;
        const isSavedLocally = savedLocal.some((rec) => rec.id === base.id);
        if (
          !isProformaDraft(base) &&
          !isSavedLocally &&
          !hasProformaUserContent(base)
        ) {
          return {
            ...base,
            consecutivo: computedNext,
          };
        }
        return base;
      }
    }
    const initial = createInitialProforma(0, true);
    initial.isDraft = true;
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
  const [aranTemplates, setAranTemplates] = useState<AranSpecTemplate[]>(() =>
    loadAranTemplatesCache()
  );
  const [terminosTemplates, setTerminosTemplates] = useState<TerminoTemplate[]>(
    () => loadTerminosTemplatesCache()
  );
  const [sheetShortcutUrls, setSheetShortcutUrls] = useState<SheetShortcutUrls>(
    () => loadSheetShortcutUrls()
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() =>
    loadNotificationsEnabled()
  );
  const [notificationState, setNotificationState] =
    useState<NotificationStateRecord>(() => loadNotificationState());
  const [isSyncingAran, setIsSyncingAran] = useState(false);
  const [isSyncingClients, setIsSyncingClients] = useState(false);
  const [clientsSyncFeedback, setClientsSyncFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [activeSection, setActiveSection] = useState<AppSection>('history');
  const [editorTab, setEditorTab] = useState<EditorTab>('cliente');
  const [editorScrollByTab, setEditorScrollByTab] = useState<
    Partial<Record<EditorTab, number>>
  >({});
  const [undoHighlight, setUndoHighlight] = useState<{
    targetKey: string;
    token: number;
  } | null>(null);
  const undoHighlightTokenRef = useRef(0);
  const [showIntegrationTab, setShowIntegrationTab] = useState<boolean>(() =>
    loadIntegrationTabEnabled()
  );
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayoutMode>('split');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemeMode());
  const [autoRefreshMinutes, setAutoRefreshMinutes] =
    useState<AutoRefreshMinutes>(() => loadAutoRefreshMinutes());
  const [isSendingToSheet, setIsSendingToSheet] = useState(false);
  const [showSendToSheetConfirm, setShowSendToSheetConfirm] = useState(false);
  const [pendingDraftPdfModal, setPendingDraftPdfModal] = useState<{
    data: ProformaData;
    isActiveProforma: boolean;
  } | null>(null);
  const [isAssigningConsecutivoForPdf, setIsAssigningConsecutivoForPdf] =
    useState(false);
  const [pendingDeleteProforma, setPendingDeleteProforma] =
    useState<SavedProformaRecord | null>(null);
  const [isDeletingProforma, setIsDeletingProforma] = useState(false);
  const [sheetPreviewModal, setSheetPreviewModal] = useState<{
    isOpen: boolean;
    mode: 'import' | 'history';
    initialRecord: SavedProformaRecord | null;
  }>({
    isOpen: false,
    mode: 'import',
    initialRecord: null,
  });
  const [showNewQuoteConfirm, setShowNewQuoteConfirm] = useState(false);
  const [showCreateOrLoadModal, setShowCreateOrLoadModal] = useState(false);
  const [showCloseQuoteConfirm, setShowCloseQuoteConfirm] = useState(false);
  const [closeStepConfirm, setCloseStepConfirm] = useState<
    'discard' | 'save' | null
  >(null);
  const [overwriteSheetConfirm, setOverwriteSheetConfirm] = useState<{
    existingRecord: SavedProformaRecord;
    closeAfterSave: boolean;
  } | null>(null);
  const [overwriteModalTab, setOverwriteModalTab] = useState<
    'table' | 'previews'
  >('table');
  const [overwriteSheetZoom, setOverwriteSheetZoom] = useState<number>(
    DEFAULT_COMPARE_PREVIEW_ZOOM
  );
  const [overwriteNewZoom, setOverwriteNewZoom] = useState<number>(
    DEFAULT_COMPARE_PREVIEW_ZOOM
  );
  const [isClosingAndSaving, setIsClosingAndSaving] = useState(false);

  useEffect(() => {
    if (!overwriteSheetConfirm) return;
    setOverwriteSheetZoom(DEFAULT_COMPARE_PREVIEW_ZOOM);
    setOverwriteNewZoom(DEFAULT_COMPARE_PREVIEW_ZOOM);
  }, [overwriteSheetConfirm]);
  const [pendingLoadDraft, setPendingLoadDraft] = useState<{
    data: ProformaData;
    sourceLabel: string;
    syncAsDraftOnConfirm?: boolean;
  } | null>(null);
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
  const latestIsProformaConfirmedRef = useRef(isProformaConfirmed);
  const latestTotalsRef = useRef(totals);
  const latestHistoryRef = useRef(history);
  const latestRemoteHistoryRef = useRef(remoteHistory);
  const latestFooterLogosRef = useRef(footerLogos);
  const latestCloudConfigRef = useRef(cloudConfig);
  const latestSavedClientsRef = useRef(savedClients);
  const latestClientsImportConfigRef = useRef(clientsImportConfig);
  const didInitialAranFetchRef = useRef(false);
  const didInitialProformasSyncRef = useRef(false);
  const didInitialClientsSyncRef = useRef(false);
  const prevFooterSyncContextRef = useRef<{ id: string; type: string }>({
    id: proforma.id,
    type: proforma.proformaType ?? 'mobiliario',
  });
  const isInitialAutosaveMountRef = useRef(true);
  const hasEditedSinceLoadRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const syncHistoryFromSheetRef = useRef<
    ((silent?: boolean) => Promise<void>) | null
  >(null);

  latestProformaRef.current = proforma;
  latestIsProformaConfirmedRef.current = isProformaConfirmed;
  latestTotalsRef.current = totals;
  latestHistoryRef.current = history;
  latestRemoteHistoryRef.current = remoteHistory;
  latestFooterLogosRef.current = footerLogos;
  latestCloudConfigRef.current = cloudConfig;
  latestSavedClientsRef.current = savedClients;
  latestClientsImportConfigRef.current = clientsImportConfig;

  const confirmActiveProforma = useCallback(() => {
    setIsProformaConfirmed(true);
    latestIsProformaConfirmedRef.current = true;
    saveActiveProformaConfirmed(true);
  }, []);

  // Aplicar clase .dark en <html> para Modo Oscuro en toda la interfaz de trabajo (sin afectar el documento final/PDF)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
  }, [themeMode]);

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

  const persistLocalBackup = useCallback(
    (forceHistoryBackup: boolean): string | null => {
      if (!latestIsProformaConfirmedRef.current) {
        return null;
      }
      const currentDraft = latestProformaRef.current;
      const currentTotals = latestTotalsRef.current;
      const savedAt = saveDraftProforma(currentDraft);
      if (!savedAt) {
        setAutosaveStatus('error');
        return null;
      }

      setLastLocalSavedAt(savedAt);
      setAutosaveStatus('saved');

      const currentIsDraft = isProformaDraft(currentDraft);
      const existsInHistory = latestHistoryRef.current.some(
        (rec) =>
          rec.id === currentDraft.id ||
          (!currentIsDraft &&
            !isProformaDraft(rec) &&
            rec.consecutivo === currentDraft.consecutivo)
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
        const updatedNext = setNextConsecutivo(
          computeNextConsecutivoFromRecords(
            updatedHistory,
            latestRemoteHistoryRef.current
          )
        );
        setNextConsecutivoState(updatedNext);
      }

      return savedAt;
    },
    []
  );

  // Autoguardado continuo con debounce de 650 ms al editar la cotización activa
  useEffect(() => {
    if (!isProformaConfirmed) {
      isInitialAutosaveMountRef.current = false;
      setAutosaveStatus('idle');
      return;
    }

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
  }, [proforma, isProformaConfirmed, persistLocalBackup]);

  // Respaldo inmediato si se cierra o recarga la pestaña antes de que venza el debounce
  useEffect(() => {
    const handleFlushOnExit = () => {
      if (!latestIsProformaConfirmedRef.current) return;
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const currentDraft = latestProformaRef.current;
      saveDraftProforma(currentDraft);
      const currentIsDraft = isProformaDraft(currentDraft);
      const existsInHistory = latestHistoryRef.current.some(
        (rec) =>
          rec.id === currentDraft.id ||
          (!currentIsDraft &&
            !isProformaDraft(rec) &&
            rec.consecutivo === currentDraft.consecutivo)
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

  const [stickyHeaderHeight, setStickyHeaderHeight] = useState<number>(57);
  const [stickyWorkingBarHeight, setStickyWorkingBarHeight] =
    useState<number>(0);
  const workingBarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const headerEl = document.getElementById('app-topbar-header');
    const workingEl = workingBarRef.current;

    const updateMeasurements = () => {
      setStickyHeaderHeight(
        headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 57
      );
      setStickyWorkingBarHeight(
        workingEl && activeSection !== 'integration'
          ? Math.round(workingEl.getBoundingClientRect().height)
          : 0
      );
    };

    updateMeasurements();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateMeasurements);
      return () => window.removeEventListener('resize', updateMeasurements);
    }

    const observer = new ResizeObserver(updateMeasurements);
    if (headerEl) observer.observe(headerEl);
    if (workingEl) observer.observe(workingEl);
    window.addEventListener('resize', updateMeasurements);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateMeasurements);
    };
  }, [activeSection]);

  const showToast = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => {
      setToast((current) => (current?.text === text ? null : current));
    }, 3800);
  }, []);

  const handleSaveEditorTabScrollPosition = useCallback(
    (tab: EditorTab, scrollTop: number) => {
      setEditorScrollByTab((prev) =>
        prev[tab] === scrollTop ? prev : { ...prev, [tab]: scrollTop }
      );
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (!latestIsProformaConfirmedRef.current) return;
    const res = undo();
    if (res) {
      hasEditedSinceLoadRef.current = true;
      setActiveSection('editor');
      setEditorTab(res.change.tab);
      undoHighlightTokenRef.current += 1;
      setUndoHighlight({
        targetKey: res.change.targetKey,
        token: undoHighlightTokenRef.current,
      });
      showToast(`Cambio deshecho: ${res.change.label}.`);
    }
  }, [undo, showToast]);

  const handleRedo = useCallback(() => {
    if (!latestIsProformaConfirmedRef.current) return;
    const res = redo();
    if (res) {
      hasEditedSinceLoadRef.current = true;
      setActiveSection('editor');
      setEditorTab(res.change.tab);
      undoHighlightTokenRef.current += 1;
      setUndoHighlight({
        targetKey: res.change.targetKey,
        token: undoHighlightTokenRef.current,
      });
      showToast(`Cambio rehecho: ${res.change.label}.`);
    }
  }, [redo, showToast]);

  // Atajos de teclado globales (Ctrl+Z / Cmd+Z y Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isProformaConfirmed) return;
      if (
        showNewQuoteConfirm ||
        showCreateOrLoadModal ||
        showCloseQuoteConfirm ||
        closeStepConfirm ||
        overwriteSheetConfirm ||
        pendingLoadDraft ||
        showSendToSheetConfirm ||
        pendingDraftPdfModal ||
        pendingDeleteProforma ||
        sheetPreviewModal.isOpen
      ) {
        return;
      }
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
    isProformaConfirmed,
    showNewQuoteConfirm,
    showCreateOrLoadModal,
    showCloseQuoteConfirm,
    closeStepConfirm,
    overwriteSheetConfirm,
    pendingLoadDraft,
    showSendToSheetConfirm,
    pendingDraftPdfModal,
    pendingDeleteProforma,
    sheetPreviewModal.isOpen,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
  ]);

  const syncDraftToSheetInBackground = useCallback(
    async (draftData: ProformaData) => {
      const currentCfg = latestCloudConfigRef.current;
      if (!currentCfg.webhookUrl.trim()) return;
      const draftTotals = computeProformaTotals(draftData);
      try {
        const res = await sendProformaToWebhook(
          currentCfg,
          draftData,
          draftTotals,
          { overwrite: true }
        );
        const nextCfg: CloudSyncConfig = {
          ...latestCloudConfigRef.current,
          lastSyncedAt: res.ok
            ? new Date().toISOString()
            : latestCloudConfigRef.current.lastSyncedAt,
          lastStatus: res.ok ? 'ok' : 'error',
          lastMessage: res.message,
        };
        setCloudConfig(nextCfg);
        saveCloudConfig(nextCfg);
        if (res.ok) {
          await syncHistoryFromSheetRef.current?.(true);
        }
      } catch {
        // Ignorar fallo silencioso en registro inicial de borrador; el usuario aún puede reintentar enviar
      }
    },
    []
  );

  const findExistingSheetProforma = useCallback((targetData: ProformaData) => {
    const byId = latestRemoteHistoryRef.current.find(
      (rec) => rec.id === targetData.id || rec.data?.id === targetData.id
    );
    if (byId) return byId;
    if (isProformaDraft(targetData) || targetData.consecutivo <= 0) {
      return null;
    }
    const targetNum = Number(targetData.consecutivo);
    return (
      latestRemoteHistoryRef.current.find(
        (rec) =>
          !isProformaDraft(rec) && Number(rec.consecutivo) === targetNum
      ) ?? null
    );
  }, []);

  const handleSaveToHistory = async () => {
    if (!isProformaConfirmed) {
      showToast(
        'Primero selecciona, crea o importa una proforma para guardarla en el historial.',
        true
      );
      return;
    }
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
    const updatedNext = setNextConsecutivo(
      computeNextConsecutivoFromRecords(
        updatedHistory,
        latestRemoteHistoryRef.current
      )
    );
    setNextConsecutivoState(updatedNext);

    const numLabel = formatProformaNumberLabel(proforma);
    if (cloudConfig.autoSyncOnSave && cloudConfig.webhookUrl.trim()) {
      const existingSheetRecord = findExistingSheetProforma(proforma);
      if (existingSheetRecord) {
        setOverwriteModalTab('table');
        setOverwriteSheetConfirm({
          existingRecord: existingSheetRecord,
          closeAfterSave: false,
        });
      } else {
        setShowSendToSheetConfirm(true);
      }
      showToast(
        `Proforma ${numLabel} guardada en historial local. Confirma para enviarla al Sheet.`
      );
    } else {
      showToast(`Proforma ${numLabel} guardada en historial local.`);
    }
  };

  const executeNewProforma = () => {
    const fresh = createInitialProforma(0, true);
    fresh.isDraft = true;
    fresh.consecutivo = 0;
    fresh.company = loadSavedCompanyDefaults();
    fresh.bankAccount = loadSavedBankDefaults();
    fresh.signatures.representanteNombre =
      proforma.signatures.representanteNombre;

    confirmActiveProforma();
    hasEditedSinceLoadRef.current = false;
    resetProforma(fresh);
    saveDraftProforma(fresh);
    const updatedHistory = saveProformaToHistory(fresh, 0);
    setHistory(updatedHistory);
    latestHistoryRef.current = updatedHistory;

    setShowNewQuoteConfirm(false);
    setActiveSection('editor');
    void syncDraftToSheetInBackground(fresh);
    showToast(
      cloudConfig.webhookUrl.trim()
        ? 'Nueva cotización iniciada en modo Borrador y registrada en PROFORMAS.'
        : 'Nueva cotización iniciada en modo Borrador.'
    );
  };

  const handleRequestNewProforma = () => {
    if (isProformaConfirmed && hasUnsavedProformaChanges(proforma, history)) {
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
    if (!isProformaConfirmed) return;
    const nextNum = setNextConsecutivo(
      computeNextConsecutivoFromRecords(
        latestHistoryRef.current,
        latestRemoteHistoryRef.current
      )
    );
    setNextConsecutivoState(nextNum);
    hasEditedSinceLoadRef.current = true;
    updateProforma((prev) => ({
      ...prev,
      consecutivo: nextNum,
      isDraft: false,
    }));
    showToast(`Consecutivo sincronizado a Nº ${nextNum}.`);
  };

  const runPdfExportForData = useCallback(
    async (targetData: ProformaData, isActiveTarget: boolean) => {
      try {
        const targetTotals = computeProformaTotals(targetData);
        const result = await generateProformaPDF(
          targetData,
          targetTotals,
          mainLogo,
          footerLogos
        );
        if (result.canceled) {
          showToast('Exportación de PDF cancelada.');
          return;
        }
        if (isActiveTarget) {
          const savedAt = saveDraftProforma(targetData);
          if (savedAt) {
            setLastLocalSavedAt(savedAt);
            setAutosaveStatus('saved');
          }
        }
        const updatedHistory = saveProformaToHistory(
          targetData,
          targetTotals.total
        );
        setHistory(updatedHistory);
        latestHistoryRef.current = updatedHistory;
        const updatedNext = setNextConsecutivo(
          computeNextConsecutivoFromRecords(
            updatedHistory,
            latestRemoteHistoryRef.current
          )
        );
        setNextConsecutivoState(updatedNext);
        if (result.skippedExternalImages > 0) {
          showToast(
            `PDF "${result.fileName}" generado. Nota: ${result.skippedExternalImages} imagen(es) por enlace externo no pudieron incrustarse por permisos CORS del servidor (usa "Imprimir" o súbelas desde tu PC).`,
            true
          );
        } else {
          showToast(`PDF "${result.fileName}" generado correctamente.`);
        }
      } catch {
        showToast(
          'Ocurrió un error al generar el PDF. Intenta de nuevo.',
          true
        );
      }
    },
    [mainLogo, footerLogos, showToast]
  );

  const handleDownloadPDF = async () => {
    if (!isProformaConfirmed) {
      showToast(
        'Selecciona una proforma en PROFORMAS, crea una Nueva Cotización o importa un borrador (.json) antes de generar el PDF.',
        true
      );
      return;
    }
    if (isProformaDraft(proforma)) {
      setPendingDraftPdfModal({
        data: proforma,
        isActiveProforma: true,
      });
      return;
    }
    await runPdfExportForData(proforma, true);
  };

  const handleDownloadRecordPDF = (record: SavedProformaRecord) => {
    const parsedFromDatosJson = record.rawDatosJson
      ? parseProformaFromJsonInput(record.rawDatosJson, record.consecutivo)
      : null;
    const recordData = normalizeProformaClientContact(
      parsedFromDatosJson ?? record.data
    );
    const matchesActive =
      isProformaConfirmed && proforma.id === recordData.id;

    if (isProformaDraft(recordData)) {
      setPendingDraftPdfModal({
        data: recordData,
        isActiveProforma: matchesActive,
      });
      return;
    }
    void runPdfExportForData(recordData, matchesActive);
  };

  const handleExportPdfAsDraft = async () => {
    if (!pendingDraftPdfModal) return;
    const target = pendingDraftPdfModal;
    setPendingDraftPdfModal(null);
    const draftPayload: ProformaData = {
      ...target.data,
      consecutivo: 0,
      isDraft: true,
    };
    await runPdfExportForData(draftPayload, target.isActiveProforma);
  };

  const handleAssignConsecutivoAndExportPdf = async () => {
    if (!pendingDraftPdfModal || isAssigningConsecutivoForPdf) return;
    const target = pendingDraftPdfModal;
    setIsAssigningConsecutivoForPdf(true);

    try {
      let latestRemote = latestRemoteHistoryRef.current;
      if (latestCloudConfigRef.current.webhookUrl.trim()) {
        try {
          const fetched = await fetchRemoteProformasFromAppsScript(
            latestCloudConfigRef.current
          );
          latestRemote = fetched.map((rec) => ({
            ...rec,
            source: 'sheet' as const,
            data: normalizeProformaClientContact(rec.data),
          }));
          const syncedAt = new Date().toISOString();
          latestRemoteHistoryRef.current = latestRemote;
          setRemoteHistory(latestRemote);
          setLastRemoteHistorySyncAt(syncedAt);
          saveRemoteHistoryCache({ records: latestRemote, syncedAt });
        } catch {
          // Si no se puede consultar el Sheet en ese instante, usa caché + local
        }
      }

      const assignedNum = computeNextConsecutivoFromRecords(
        latestHistoryRef.current,
        latestRemote
      );
      const assignedData: ProformaData = {
        ...target.data,
        consecutivo: assignedNum,
        isDraft: false,
        updatedAt: new Date().toISOString(),
      };
      const assignedTotals = computeProformaTotals(assignedData);

      const isActive =
        target.isActiveProforma ||
        (latestIsProformaConfirmedRef.current &&
          latestProformaRef.current.id === assignedData.id);

      if (isActive) {
        hasEditedSinceLoadRef.current = true;
        resetProforma(assignedData);
        saveDraftProforma(assignedData);
      }

      const updatedHistory = saveProformaToHistory(
        assignedData,
        assignedTotals.total
      );
      setHistory(updatedHistory);
      latestHistoryRef.current = updatedHistory;
      setNextConsecutivoState(setNextConsecutivo(assignedNum + 1));

      if (latestCloudConfigRef.current.webhookUrl.trim()) {
        try {
          const sheetRes = await sendProformaToWebhook(
            latestCloudConfigRef.current,
            assignedData,
            assignedTotals,
            { overwrite: true }
          );
          const nextCfg: CloudSyncConfig = {
            ...latestCloudConfigRef.current,
            lastSyncedAt: sheetRes.ok
              ? new Date().toISOString()
              : latestCloudConfigRef.current.lastSyncedAt,
            lastStatus: sheetRes.ok ? 'ok' : 'error',
            lastMessage: sheetRes.message,
          };
          setCloudConfig(nextCfg);
          saveCloudConfig(nextCfg);
          if (sheetRes.ok) {
            void syncHistoryFromSheetRef.current?.(true);
          }
        } catch {
          // Mantiene asignación local incluso si falla la red hacia Sheet
        }
      }

      setPendingDraftPdfModal(null);
      await runPdfExportForData(assignedData, isActive);
    } finally {
      setIsAssigningConsecutivoForPdf(false);
    }
  };

  const clearActiveProformaSession = useCallback(
    (historyOverride?: SavedProformaRecord[]) => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      clearDraftProforma();
      setLastLocalSavedAt(null);
      setAutosaveStatus('idle');
      hasEditedSinceLoadRef.current = false;
      setIsProformaConfirmed(false);
      latestIsProformaConfirmedRef.current = false;
      saveActiveProformaConfirmed(false);

      const effectiveHistory = historyOverride ?? latestHistoryRef.current;
      const nextNum = setNextConsecutivo(
        computeNextConsecutivoFromRecords(
          effectiveHistory,
          latestRemoteHistoryRef.current
        )
      );
      setNextConsecutivoState(nextNum);
      const fresh = createInitialProforma(0, true);
      fresh.isDraft = true;
      fresh.company = loadSavedCompanyDefaults();
      fresh.bankAccount = loadSavedBankDefaults();
      fresh.signatures.representanteNombre =
        latestProformaRef.current.signatures.representanteNombre;
      resetProforma(fresh);
    },
    [resetProforma]
  );

  const sendActiveProformaToSheetAndSync = async ({
    overwrite,
    closeAfterSave,
  }: {
    overwrite: boolean;
    closeAfterSave: boolean;
  }) => {
    if (!isProformaConfirmed || !cloudConfig.webhookUrl.trim()) return;
    const currentLabel = formatProformaNumberLabel(proforma);
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setIsSendingToSheet(true);
    if (closeAfterSave) {
      setIsClosingAndSaving(true);
    }

    try {
      const res = await sendProformaToWebhook(cloudConfig, proforma, totals, {
        overwrite,
      });

      if (!closeAfterSave) {
        const savedAt = saveDraftProforma(proforma);
        if (savedAt) {
          setLastLocalSavedAt(savedAt);
          setAutosaveStatus('saved');
        }
      }

      const updatedHistory = saveProformaToHistory(proforma, totals.total);
      setHistory(updatedHistory);
      latestHistoryRef.current = updatedHistory;
      const updatedNext = setNextConsecutivo(
        computeNextConsecutivoFromRecords(
          updatedHistory,
          latestRemoteHistoryRef.current
        )
      );
      setNextConsecutivoState(updatedNext);

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

      if (!res.ok) {
        showToast(
          closeAfterSave
            ? `Se guardó en el historial local, pero falló el envío al Sheet: ${res.message}`
            : res.message,
          true
        );
        return;
      }

      setShowSendToSheetConfirm(false);
      setOverwriteSheetConfirm(null);
      setShowCloseQuoteConfirm(false);
      setCloseStepConfirm(null);

      if (closeAfterSave) {
        clearActiveProformaSession(updatedHistory);
      }

      await syncHistoryFromSheetRef.current?.(true);

      if (closeAfterSave) {
        showToast(
          overwrite
            ? `Proforma ${currentLabel} sobrescrita en el Sheet PROFORMAS y cerrada.`
            : `Proforma ${currentLabel} guardada en el Sheet PROFORMAS y cerrada.`
        );
      } else {
        showToast(res.message, false);
      }
    } catch {
      showToast(
        closeAfterSave
          ? 'Se guardó en el historial local, pero ocurrió un error al enviar la proforma al Google Sheet.'
          : 'Ocurrió un error al enviar la proforma hacia Google Apps Script.',
        true
      );
    } finally {
      setIsSendingToSheet(false);
      setIsClosingAndSaving(false);
    }
  };

  const handleSendProformaToSheet = () => {
    if (!isProformaConfirmed) {
      showToast(
        'Selecciona una proforma en PROFORMAS, crea una Nueva Cotización o importa un borrador (.json) antes de enviarla al Sheet.',
        true
      );
      return;
    }
    if (!cloudConfig.webhookUrl.trim()) {
      showToast(
        'Falta configurar la URL de Google Apps Script (/exec) en la pestaña Integración antes de enviar la proforma al Google Sheet.',
        true
      );
      return;
    }

    const existingSheetRecord = findExistingSheetProforma(proforma);
    if (existingSheetRecord) {
      setOverwriteModalTab('table');
      setOverwriteSheetConfirm({
        existingRecord: existingSheetRecord,
        closeAfterSave: false,
      });
      return;
    }

    setShowSendToSheetConfirm(true);
  };

  const executeSendProformaToSheet = async () => {
    setShowSendToSheetConfirm(false);
    await sendActiveProformaToSheetAndSync({
      overwrite: false,
      closeAfterSave: false,
    });
  };

  const executeOverwriteSendToSheet = async () => {
    if (!overwriteSheetConfirm) return;
    const { closeAfterSave } = overwriteSheetConfirm;
    await sendActiveProformaToSheetAndSync({
      overwrite: true,
      closeAfterSave,
    });
  };

  const handleCloseQuoteWithoutSaving = () => {
    if (isClosingAndSaving || isSendingToSheet) return;
    const closedLabel = formatProformaNumberLabel(proforma);
    setShowCloseQuoteConfirm(false);
    setCloseStepConfirm(null);
    setOverwriteSheetConfirm(null);
    clearActiveProformaSession();
    showToast(
      `Cotización ${closedLabel} cerrada sin guardar ni enviar al historial.`
    );
  };

  const handleSaveAndCloseQuote = async () => {
    if (!isProformaConfirmed || isClosingAndSaving || isSendingToSheet) return;
    const currentLabel = formatProformaNumberLabel(proforma);

    if (cloudConfig.webhookUrl.trim()) {
      const existingSheetRecord = findExistingSheetProforma(proforma);
      if (existingSheetRecord) {
        setShowCloseQuoteConfirm(false);
        setCloseStepConfirm(null);
        setOverwriteModalTab('table');
        setOverwriteSheetConfirm({
          existingRecord: existingSheetRecord,
          closeAfterSave: true,
        });
        return;
      }

      await sendActiveProformaToSheetAndSync({
        overwrite: false,
        closeAfterSave: true,
      });
      return;
    }

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const updatedHistory = saveProformaToHistory(proforma, totals.total);
    setHistory(updatedHistory);
    latestHistoryRef.current = updatedHistory;

    setShowCloseQuoteConfirm(false);
    setCloseStepConfirm(null);
    clearActiveProformaSession(updatedHistory);
    showToast(
      `Proforma ${currentLabel} guardada en historial local y cerrada.`
    );
  };

  const handleChangeVisualReferenceSize = useCallback(
    (refId: string, nextSize: VisualReferenceSize) => {
      if (!latestIsProformaConfirmedRef.current) return;
      hasEditedSinceLoadRef.current = true;
      updateProforma((prev) => ({
        ...prev,
        visualReferences: (prev.visualReferences ?? []).map((item) =>
          item.id === refId
            ? {
                ...item,
                size: nextSize,
                customWidthPct: undefined,
                customHeightPx: undefined,
              }
            : item
        ),
      }));
    },
    [updateProforma]
  );

  const handleUpdateVisualReference = useCallback(
    (refId: string, patch: Partial<VisualReferenceItem>) => {
      if (!latestIsProformaConfirmedRef.current) return;
      hasEditedSinceLoadRef.current = true;
      updateProforma((prev) => ({
        ...prev,
        visualReferences: (prev.visualReferences ?? []).map((item) =>
          item.id === refId ? { ...item, ...patch } : item
        ),
      }));
    },
    [updateProforma]
  );

  const handleChangeTableColumnWidths = useCallback(
    (proformaType: ProformaType, widths: TableColumnWidths) => {
      if (!latestIsProformaConfirmedRef.current) return;
      hasEditedSinceLoadRef.current = true;
      updateProforma((prev) => {
        const nextByType = { ...(prev.tableColumnWidthsByType ?? {}) };
        if (Object.keys(widths).length === 0) {
          delete nextByType[proformaType];
        } else {
          nextByType[proformaType] = widths;
        }
        return {
          ...prev,
          tableColumnWidthsByType: nextByType,
        };
      });
    },
    [updateProforma]
  );

  const handleReorderVisualReferences = useCallback(
    (fromId: string, toId: string) => {
      if (!latestIsProformaConfirmedRef.current) return;
      if (!fromId || !toId || fromId === toId) return;
      hasEditedSinceLoadRef.current = true;
      updateProforma((prev) => {
        const list = [...(prev.visualReferences ?? [])].sort(
          (a, b) => a.slotIndex - b.slotIndex
        );
        const fromIdx = list.findIndex((r) => r.id === fromId);
        const toIdx = list.findIndex((r) => r.id === toId);
        if (fromIdx < 0 || toIdx < 0) return prev;
        const reordered = [...list];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        return {
          ...prev,
          visualReferences: reordered.map((item, idx) => ({
            ...item,
            slotIndex: idx,
          })),
        };
      });
    },
    [updateProforma]
  );

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

  const handleClearFooterLogos = () => {
    const cleared: Array<LogoAsset | null> = [null, null, null];
    saveFooterLogos(cleared);
    setFooterLogos(cleared);
    showToast('Logos del pie de página limpiados.');
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

    if (!isProformaConfirmed) {
      const loaded = normalizeProformaClientContact(
        JSON.parse(JSON.stringify(candidateData)) as ProformaData
      );
      confirmActiveProforma();
      hasEditedSinceLoadRef.current = false;
      resetProforma(loaded);
      setActiveSection('editor');
      showToast(
        `Proforma ${formatProformaNumberLabel(loaded)} cargada en el editor para continuar editando.`
      );
      return;
    }

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
      const parsed = parseProformaFromJsonInput(text, 0);
      if (!parsed) {
        showToast(
          'El archivo seleccionado no contiene un borrador válido de OLMO Proformas (.json).',
          true
        );
        return;
      }
      const normalized = normalizeProformaClientContact(parsed);
      const hasNumberedCollision =
        latestHistoryRef.current.some(
          (r) => r.id === normalized.id && !isProformaDraft(r)
        ) ||
        latestRemoteHistoryRef.current.some(
          (r) => r.id === normalized.id && !isProformaDraft(r)
        );
      const importedAsDraft: ProformaData = {
        ...normalized,
        id: hasNumberedCollision
          ? `prof-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          : normalized.id,
        consecutivo: 0,
        isDraft: true,
        updatedAt: new Date().toISOString(),
      };
      const importedTotals = computeProformaTotals(importedAsDraft);

      if (!isProformaConfirmed) {
        confirmActiveProforma();
        hasEditedSinceLoadRef.current = false;
        resetProforma(importedAsDraft);
        saveDraftProforma(importedAsDraft);
        const updatedHistory = saveProformaToHistory(
          importedAsDraft,
          importedTotals.total
        );
        setHistory(updatedHistory);
        latestHistoryRef.current = updatedHistory;
        setActiveSection('editor');
        void syncDraftToSheetInBackground(importedAsDraft);
        showToast(
          `Borrador "${file.name}" cargado en el editor en modo Borrador.`
        );
        return;
      }
      setPendingLoadDraft({
        data: importedAsDraft,
        sourceLabel: `Archivo portátil "${file.name}"`,
        syncAsDraftOnConfirm: true,
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
    const shouldSyncDraft = Boolean(pendingLoadDraft.syncAsDraftOnConfirm);
    confirmActiveProforma();
    hasEditedSinceLoadRef.current = false;
    resetProforma(loaded);
    if (shouldSyncDraft) {
      saveDraftProforma(loaded);
      const loadedTotals = computeProformaTotals(loaded);
      const updatedHistory = saveProformaToHistory(loaded, loadedTotals.total);
      setHistory(updatedHistory);
      latestHistoryRef.current = updatedHistory;
      void syncDraftToSheetInBackground(loaded);
    }
    setPendingLoadDraft(null);
    setActiveSection('editor');
    showToast(
      `Proforma ${formatProformaNumberLabel(loaded)} cargada en el editor para continuar editando.`
    );
  };

  const handleSaveCurrentAndLoadPendingDraft = async () => {
    await handleSaveToHistory();
    executeLoadPendingDraft();
  };

  const handleDuplicateRecord = (record: SavedProformaRecord) => {
    const nextNum = reserveNextConsecutivo(
      isProformaConfirmed
        ? Math.max(proforma.consecutivo, record.consecutivo)
        : record.consecutivo,
      latestRemoteHistoryRef.current
    );
    setNextConsecutivoState(nextNum);
    const cloned = normalizeProformaClientContact(
      JSON.parse(JSON.stringify(record.data)) as ProformaData
    );
    cloned.id = `prof-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    cloned.consecutivo = nextNum;
    cloned.isDraft = false;
    cloned.updatedAt = new Date().toISOString();
    confirmActiveProforma();
    hasEditedSinceLoadRef.current = true;
    resetProforma(cloned);
    setActiveSection('editor');
    showToast(
      `Proforma ${formatProformaNumberLabel(record)} duplicada como Nº ${nextNum}.`
    );
  };

  const handleSaveClientInDirectory = async (
    payload: ClientDraftPayload,
    editingId?: string,
    syncToSheet = false
  ): Promise<{ ok: boolean; message: string } | void> => {
    const now = new Date().toISOString();
    const currentList = latestSavedClientsRef.current;
    const originalClient = editingId
      ? currentList.find((c) => c.id === editingId)
      : undefined;

    let savedClientId = editingId ?? '';
    let updated: SavedClient[];
    if (editingId) {
      updated = currentList.map((c) =>
        c.id === editingId ? { ...c, ...payload, updatedAt: now } : c
      );
    } else {
      const created: SavedClient = {
        id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...payload,
        createdAt: now,
        updatedAt: now,
      };
      savedClientId = created.id;
      updated = [created, ...currentList];
    }
    saveSavedClients(updated);
    setSavedClients(updated);
    latestSavedClientsRef.current = updated;

    const appsScriptUrl = latestClientsImportConfigRef.current.appsScriptUrl.trim();
    const sheetName =
      latestClientsImportConfigRef.current.sheetName || DEFAULT_CLIENTS_SHEET_NAME;

    if (syncToSheet && appsScriptUrl) {
      const res = await sendClientToGoogleSheet(
        appsScriptUrl,
        payload,
        sheetName,
        originalClient?.cliente,
        savedClientId
      );
      setClientsSyncFeedback({ ok: res.ok, message: res.message });
      showToast(res.message, !res.ok);
      return { ok: res.ok, message: res.message };
    }

    const msg = editingId
      ? `Cliente "${payload.cliente}" actualizado en el directorio.`
      : `Cliente "${payload.cliente}" guardado en el directorio.`;
    showToast(msg);
    if (syncToSheet) {
      return { ok: true, message: msg };
    }
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
    void handleSaveClientInDirectory(payload, existing?.id, false);
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

  const handleDeleteClient = async (
    id: string
  ): Promise<{ ok: boolean; message: string } | void> => {
    const target = latestSavedClientsRef.current.find((c) => c.id === id);
    const updated = latestSavedClientsRef.current.filter((c) => c.id !== id);
    saveSavedClients(updated);
    setSavedClients(updated);
    latestSavedClientsRef.current = updated;

    if (!target) return;

    const appsScriptUrl = latestClientsImportConfigRef.current.appsScriptUrl.trim();
    const sheetName =
      latestClientsImportConfigRef.current.sheetName || DEFAULT_CLIENTS_SHEET_NAME;

    if (appsScriptUrl) {
      const res = await deleteClientFromGoogleSheet(
        appsScriptUrl,
        target.cliente,
        sheetName,
        target.id
      );
      setClientsSyncFeedback({ ok: res.ok, message: res.message });
      showToast(res.message, !res.ok);
      return { ok: res.ok, message: res.message };
    }

    const msg = `Cliente "${target.cliente}" eliminado del directorio.`;
    showToast(msg);
    return { ok: true, message: msg };
  };

  const handleClientsImportConfigChange = (next: ClientsImportConfig) => {
    setClientsImportConfig(next);
    saveClientsImportConfig(next);
  };

  const handleImportClients = useCallback(
    (
      rows: ClientImportRow[],
      strategy: ClientsImportStrategy,
      options?: { silent?: boolean }
    ): ClientsImportSummary => {
      const now = new Date().toISOString();
      const normalizeKey = (name: string) => name.trim().toLowerCase();
      const currentClients = latestSavedClientsRef.current;

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
        if (!options?.silent) {
          showToast(
            `Lista de clientes reemplazada con ${nextList.length} cliente(s).`
          );
        }
        return {
          added: nextList.length,
          updated: 0,
          total: nextList.length,
        };
      }

      const nextList = [...currentClients];
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
          if (
            !updatedIndexes.has(matchIdx) &&
            matchIdx < currentClients.length
          ) {
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
      if (!options?.silent) {
        showToast(
          `Importación de clientes completada: ${added} agregado(s), ${updated} actualizado(s).`
        );
      }
      return {
        added,
        updated,
        total: nextList.length,
      };
    },
    [showToast]
  );

  const handleUseClientInProforma = (client: SavedClient) => {
    if (!isProformaConfirmed) {
      showToast(
        'Primero selecciona una proforma en PROFORMAS, crea una Nueva Cotización o importa un borrador (.json) antes de asignar un cliente.',
        true
      );
      return;
    }
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
      `Datos de "${client.cliente}" aplicados a la proforma ${formatProformaNumberLabel(proforma)}.`
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

  const handleSyncAranTemplates = useCallback(
    async (
      silent = false,
      overrideUrl?: string
    ): Promise<{ ok: boolean; message: string; count: number }> => {
      const currentConfig = latestCloudConfigRef.current;
      const targetUrl = (
        overrideUrl ??
        currentConfig.aranScriptUrl ??
        ''
      ).trim();

      if (!targetUrl) {
        const msg =
          'Falta configurar la URL de Google Apps Script (/exec) para "ESPECIFICACIONES" en Integración.';
        const nextCfg: CloudSyncConfig = {
          ...currentConfig,
          aranScriptUrl: '',
          aranLastStatus: 'error',
          aranLastMessage: msg,
        };
        setCloudConfig(nextCfg);
        saveCloudConfig(nextCfg);
        if (!silent) showToast(msg, true);
        return { ok: false, message: msg, count: 0 };
      }

      setIsSyncingAran(true);
      try {
        const result = await fetchEspecificacionesYTerminosFromAppsScript(
          targetUrl,
          currentConfig.secretToken
        );
        const rows = result.specs;
        const terminosRows = result.terminos;
        const syncedAt = new Date().toISOString();

        setAranTemplates(rows);
        saveAranTemplatesCache(rows);

        setTerminosTemplates(terminosRows);
        saveTerminosTemplatesCache(terminosRows);

        if (result.spreadsheetUrl) {
          setSheetShortcutUrls((prev) => {
            if (prev.specsSheetUrl.trim()) return prev;
            const next = {
              ...prev,
              specsSheetUrl: result.spreadsheetUrl!,
            };
            saveSheetShortcutUrls(next);
            return next;
          });
        }

        const msg =
          rows.length > 0 || terminosRows.length > 0
            ? `Se cargaron ${rows.length} especificación(es) y ${terminosRows.length} término(s) desde ESPECIFICACIONES / TERMINOS_Y_CONDICIONES.`
            : 'Conexión correcta con ESPECIFICACIONES, pero aún no tiene filas con datos.';
        const latest = latestCloudConfigRef.current;
        const nextCfg: CloudSyncConfig = {
          ...latest,
          aranScriptUrl: targetUrl,
          aranLastSyncedAt: syncedAt,
          aranLastStatus: 'ok',
          aranLastMessage: msg,
        };
        setCloudConfig(nextCfg);
        saveCloudConfig(nextCfg);
        if (!silent) showToast(msg);
        return { ok: true, message: msg, count: rows.length };
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo consultar la hoja "ESPECIFICACIONES".';
        const latest = latestCloudConfigRef.current;
        const nextCfg: CloudSyncConfig = {
          ...latest,
          aranLastStatus: 'error',
          aranLastMessage: msg,
        };
        setCloudConfig(nextCfg);
        saveCloudConfig(nextCfg);
        if (!silent) showToast(msg, true);
        return { ok: false, message: msg, count: 0 };
      } finally {
        setIsSyncingAran(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (didInitialAranFetchRef.current) return;
    didInitialAranFetchRef.current = true;
    if (cloudConfig.aranScriptUrl?.trim()) {
      void handleSyncAranTemplates(true);
    }
  }, [cloudConfig.aranScriptUrl, handleSyncAranTemplates]);

  const handleSyncHistoryFromSheet = useCallback(
    async (silent = false) => {
      const currentCloudConfig = latestCloudConfigRef.current;
      if (!currentCloudConfig.webhookUrl.trim()) {
        const msg =
          'Configura primero la URL de Google Apps Script (/exec) en la pestaña Integración.';
        setRemoteHistoryFeedback({ ok: false, message: msg });
        if (!silent) showToast(msg, true);
        return;
      }

      setIsSyncingRemoteHistory(true);
      if (!silent) {
        setRemoteHistoryFeedback(null);
      }
      try {
        const fetched =
          await fetchRemoteProformasFromAppsScript(currentCloudConfig);
        const normalized = fetched.map((rec) => ({
          ...rec,
          source: 'sheet' as const,
          data: normalizeProformaClientContact(rec.data),
        }));
        const syncedAt = new Date().toISOString();
        latestRemoteHistoryRef.current = normalized;
        setRemoteHistory(normalized);
        setLastRemoteHistorySyncAt(syncedAt);
        saveRemoteHistoryCache({ records: normalized, syncedAt });

        const suggestedNext = setNextConsecutivo(
          computeNextConsecutivoFromRecords(
            latestHistoryRef.current,
            normalized
          )
        );
        setNextConsecutivoState(suggestedNext);

        const currentActive = latestProformaRef.current;
        const isSavedLocally = latestHistoryRef.current.some(
          (rec) => rec.id === currentActive.id
        );
        if (
          !isProformaDraft(currentActive) &&
          !hasEditedSinceLoadRef.current &&
          !isSavedLocally &&
          !hasProformaUserContent(currentActive) &&
          currentActive.consecutivo !== suggestedNext
        ) {
          resetProforma({
            ...currentActive,
            consecutivo: suggestedNext,
          });
        }

        const msg =
          normalized.length > 0
            ? `Se sincronizaron ${normalized.length} proforma(s) desde la pestaña PROFORMAS.`
            : 'Conexión correcta con PROFORMAS, pero la hoja aún no contiene filas registradas.';
        if (!silent) {
          setRemoteHistoryFeedback({ ok: true, message: msg });
          showToast(msg);
        } else {
          setRemoteHistoryFeedback(null);
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo consultar la pestaña PROFORMAS.';
        setRemoteHistoryFeedback({ ok: false, message: msg });
        if (!silent) showToast(msg, true);
      } finally {
        setIsSyncingRemoteHistory(false);
      }
    },
    [resetProforma, showToast]
  );

  syncHistoryFromSheetRef.current = handleSyncHistoryFromSheet;

  const handleSyncClientsFromSheet = useCallback(
    async (
      silent = false
    ): Promise<{
      ok: boolean;
      message: string;
      sheetNotFoundError?: SpreadsheetSheetNotFoundError;
    }> => {
      const cfg = latestClientsImportConfigRef.current;
      const hasSheetUrl = Boolean(cfg.sheetUrl.trim());
      const hasAppsScriptUrl = Boolean(cfg.appsScriptUrl.trim());

      if (!hasSheetUrl && !hasAppsScriptUrl) {
        const msg =
          'Configura primero el enlace de tu Google Sheet / CSV de clientes (o la URL de Google Apps Script) para usar Refrescar.';
        setClientsSyncFeedback({ ok: false, message: msg });
        if (!silent) showToast(msg, true);
        return { ok: false, message: msg };
      }

      setIsSyncingClients(true);
      if (!silent) {
        setClientsSyncFeedback(null);
      }

      try {
        const targetSheetName = cfg.sheetName || DEFAULT_CLIENTS_SHEET_NAME;

        if (hasSheetUrl) {
          const result = await fetchAndParseGoogleSheetClients(
            cfg.sheetUrl,
            targetSheetName
          );
          let summary: ClientsImportSummary = {
            added: 0,
            updated: 0,
            total: latestSavedClientsRef.current.length,
          };
          if (result.clients.length > 0 || !silent) {
            summary = handleImportClients(result.clients, cfg.strategy, {
              silent,
            });
            const nextCfg: ClientsImportConfig = {
              ...latestClientsImportConfigRef.current,
              sheetName: result.sheetNameUsed || cfg.sheetName,
              lastImportedAt: new Date().toISOString(),
            };
            setClientsImportConfig(nextCfg);
            saveClientsImportConfig(nextCfg);
          }

          const sheetNote = result.sheetNameUsed
            ? ` desde la hoja "${result.sheetNameUsed}"`
            : '';
          const ignoredNote =
            result.ignoredCount > 0
              ? ` (${result.ignoredCount} fila(s) vacía(s) o sin cliente omitida(s))`
              : '';
          const message =
            cfg.strategy === 'replace'
              ? `Lista de clientes reemplazada${sheetNote}: ${summary.added} cliente(s) importado(s)${ignoredNote}.`
              : `Clientes actualizados${sheetNote}: ${summary.added} agregado(s), ${summary.updated} actualizado(s)${ignoredNote}.`;

          if (!silent) {
            setClientsSyncFeedback({ ok: true, message });
          } else {
            setClientsSyncFeedback(null);
          }
          return { ok: true, message };
        } else {
          const rows = await fetchClientsFromAppsScript(
            cfg.appsScriptUrl,
            targetSheetName
          );
          if (rows.length === 0) {
            if (!silent) {
              throw new Error(
                'No se encontraron clientes en la pestaña CLIENTES del Apps Script.'
              );
            }
            setClientsSyncFeedback(null);
            return {
              ok: true,
              message:
                'Conexión correcta con CLIENTES, sin registros nuevos.',
            };
          }

          const summary = handleImportClients(rows, cfg.strategy, { silent });
          const nextCfg: ClientsImportConfig = {
            ...latestClientsImportConfigRef.current,
            sheetName: targetSheetName,
            lastImportedAt: new Date().toISOString(),
          };
          setClientsImportConfig(nextCfg);
          saveClientsImportConfig(nextCfg);

          const message =
            cfg.strategy === 'replace'
              ? `Lista de clientes reemplazada desde la hoja "${targetSheetName}": ${summary.added} cliente(s) importado(s).`
              : `Clientes actualizados desde la hoja "${targetSheetName}": ${summary.added} agregado(s), ${summary.updated} actualizado(s).`;

          if (!silent) {
            setClientsSyncFeedback({ ok: true, message });
          } else {
            setClientsSyncFeedback(null);
          }
          return { ok: true, message };
        }
      } catch (err) {
        if (err instanceof SpreadsheetSheetNotFoundError) {
          const msg = `${err.message} Selecciona la pestaña correcta abajo.`;
          const nextCfg: ClientsImportConfig = {
            ...latestClientsImportConfigRef.current,
            sheetName:
              err.availableSheets[0] ||
              latestClientsImportConfigRef.current.sheetName,
          };
          setClientsImportConfig(nextCfg);
          saveClientsImportConfig(nextCfg);
          setClientsSyncFeedback({ ok: false, message: msg });
          return { ok: false, message: msg, sheetNotFoundError: err };
        }

        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo refrescar la lista de clientes desde Google Sheets.';
        setClientsSyncFeedback({ ok: false, message: msg });
        if (!silent) showToast(msg, true);
        return { ok: false, message: msg };
      } finally {
        setIsSyncingClients(false);
      }
    },
    [handleImportClients, showToast]
  );

  useEffect(() => {
    if (!didInitialProformasSyncRef.current) {
      didInitialProformasSyncRef.current = true;
      void handleSyncHistoryFromSheet(true);
    }
    if (!didInitialClientsSyncRef.current) {
      didInitialClientsSyncRef.current = true;
      void handleSyncClientsFromSheet(true);
    }
  }, [handleSyncHistoryFromSheet, handleSyncClientsFromSheet]);

  // Auto-refresco periódico compartido para Proformas y Clientes (5 min por defecto)
  useEffect(() => {
    const intervalMs = autoRefreshMinutes * 60 * 1000;
    const timerId = window.setInterval(() => {
      void handleSyncHistoryFromSheet(true);
      void handleSyncClientsFromSheet(true);
    }, intervalMs);
    return () => window.clearInterval(timerId);
  }, [
    autoRefreshMinutes,
    handleSyncHistoryFromSheet,
    handleSyncClientsFromSheet,
  ]);

  const handleChangeAutoRefreshMinutes = useCallback(
    (minutes: AutoRefreshMinutes) => {
      setAutoRefreshMinutes(minutes);
      saveAutoRefreshMinutes(minutes);
      showToast(
        `Auto-refresco de Proformas y Clientes configurado cada ${minutes} minutos.`
      );
    },
    [showToast]
  );

  const mergedHistoryForModal = useMemo(
    () => mergeProformaHistoryRecords(history, remoteHistory),
    [history, remoteHistory]
  );

  const handleRequestDeleteRecord = useCallback(
    (id: string) => {
      const target =
        mergedHistoryForModal.find((r) => r.id === id) ??
        latestHistoryRef.current.find((r) => r.id === id) ??
        latestRemoteHistoryRef.current.find((r) => r.id === id) ??
        null;
      if (target) {
        setPendingDeleteProforma(target);
      }
    },
    [mergedHistoryForModal]
  );

  const handleConfirmDeleteProforma = async () => {
    if (!pendingDeleteProforma || isDeletingProforma) return;
    const record = pendingDeleteProforma;
    setIsDeletingProforma(true);

    try {
      const isDraft = isProformaDraft(record);
      let updatedLocal = deleteProformaFromHistory(record.id);
      if (!isDraft && record.consecutivo > 0) {
        const matchingLocal = updatedLocal.find(
          (r) =>
            !isProformaDraft(r) &&
            Number(r.consecutivo) === Number(record.consecutivo)
        );
        if (matchingLocal) {
          updatedLocal = deleteProformaFromHistory(matchingLocal.id);
        }
      }
      setHistory(updatedLocal);
      latestHistoryRef.current = updatedLocal;

      const nextRemote = latestRemoteHistoryRef.current.filter((r) => {
        if (r.id === record.id || r.data?.id === record.id) return false;
        if (
          !isDraft &&
          record.consecutivo > 0 &&
          !isProformaDraft(r) &&
          Number(r.consecutivo) === Number(record.consecutivo)
        ) {
          return false;
        }
        return true;
      });
      latestRemoteHistoryRef.current = nextRemote;
      setRemoteHistory(nextRemote);
      saveRemoteHistoryCache({
        records: nextRemote,
        syncedAt: lastRemoteHistorySyncAt,
      });

      const updatedNext = setNextConsecutivo(
        computeNextConsecutivoFromRecords(updatedLocal, nextRemote)
      );
      setNextConsecutivoState(updatedNext);

      if (
        latestIsProformaConfirmedRef.current &&
        (latestProformaRef.current.id === record.id ||
          latestProformaRef.current.id === record.data?.id)
      ) {
        clearActiveProformaSession(updatedLocal);
      }

      if (latestCloudConfigRef.current.webhookUrl.trim()) {
        const sheetRes = await deleteProformaFromSheet(
          latestCloudConfigRef.current,
          record
        );
        showToast(sheetRes.message, !sheetRes.ok);
        if (sheetRes.ok) {
          void syncHistoryFromSheetRef.current?.(true);
        }
      } else {
        showToast(
          `Proforma ${formatProformaNumberLabel(record)} eliminada del historial local.`
        );
      }
      setPendingDeleteProforma(null);
    } finally {
      setIsDeletingProforma(false);
    }
  };

  const handleOpenImportFromSheetModal = useCallback(() => {
    setSheetPreviewModal({
      isOpen: true,
      mode: 'import',
      initialRecord: null,
    });
    if (latestCloudConfigRef.current.webhookUrl.trim()) {
      void handleSyncHistoryFromSheet(true);
    }
  }, [handleSyncHistoryFromSheet]);

  const handlePreviewHistoryRecord = useCallback(
    (record: SavedProformaRecord) => {
      setSheetPreviewModal({
        isOpen: true,
        mode: 'history',
        initialRecord: record,
      });
    },
    []
  );

  const handleConfirmImportFromSheetRecord = (record: SavedProformaRecord) => {
    const currentMode = sheetPreviewModal.mode;
    setSheetPreviewModal((prev) => ({ ...prev, isOpen: false }));
    if (isProformaConfirmed && hasUnsavedProformaChanges(proforma, history)) {
      handleOpenRecord(record);
      return;
    }
    const parsedFromDatosJson = record.rawDatosJson
      ? parseProformaFromJsonInput(record.rawDatosJson, record.consecutivo)
      : null;
    const loaded = normalizeProformaClientContact(
      JSON.parse(
        JSON.stringify(parsedFromDatosJson ?? record.data)
      ) as ProformaData
    );
    confirmActiveProforma();
    hasEditedSinceLoadRef.current = false;
    resetProforma(loaded);
    setActiveSection('editor');
    const numLabel = formatProformaNumberLabel(loaded);
    showToast(
      currentMode === 'history'
        ? `Proforma ${numLabel} cargada en el editor para continuar editando.`
        : `Proforma ${numLabel} importada desde Google Sheets y lista para editar.`
    );
  };

  const handleManualConsecutivoChange = (updater: (prev: ProformaData) => ProformaData) => {
    if (!isProformaConfirmed) return;
    hasEditedSinceLoadRef.current = true;
    updateProforma((prev) => {
      let next = updater(prev);
      if (next.consecutivo !== prev.consecutivo) {
        if (next.consecutivo > 0) {
          next = { ...next, isDraft: false };
          if (next.consecutivo >= nextConsecutivo) {
            const updatedNext = setNextConsecutivo(next.consecutivo + 1);
            setNextConsecutivoState(updatedNext);
          }
        } else {
          next = { ...next, consecutivo: 0, isDraft: true };
        }
      }
      return next;
    });
  };

  const handleChangeThemeMode = (next: ThemeMode) => {
    setThemeMode(next);
    saveThemeMode(next);
  };

  const handleSaveSheetShortcutUrls = useCallback((next: SheetShortcutUrls) => {
    setSheetShortcutUrls(next);
    saveSheetShortcutUrls(next);
  }, []);

  const handleToggleNotificationsEnabled = useCallback(
    (enabled: boolean) => {
      setNotificationsEnabled(enabled);
      saveNotificationsEnabled(enabled);
      showToast(
        enabled
          ? 'Notificaciones de la barra superior activadas.'
          : 'Notificaciones de la barra superior desactivadas.'
      );
    },
    [showToast]
  );

  const handleMarkNotificationRead = useCallback((id: string) => {
    setNotificationState((prev) => {
      if (prev.readIds.includes(id)) return prev;
      const next: NotificationStateRecord = {
        ...prev,
        readIds: [...prev.readIds, id],
      };
      saveNotificationState(next);
      return next;
    });
  }, []);

  const handleDismissNotification = useCallback((id: string) => {
    setNotificationState((prev) => {
      const isReminder = prev.reminders.some((r) => r.id === id);
      const next: NotificationStateRecord = {
        reminders: isReminder
          ? prev.reminders.filter((r) => r.id !== id)
          : prev.reminders,
        readIds: prev.readIds.filter((rid) => rid !== id),
        dismissedIds: isReminder
          ? prev.dismissedIds
          : prev.dismissedIds.includes(id)
            ? prev.dismissedIds
            : [...prev.dismissedIds, id],
      };
      saveNotificationState(next);
      return next;
    });
  }, []);

  const handleAddReminder = useCallback(
    (title: string, message: string) => {
      const reminder: AppNotification = {
        id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'reminder',
        source: 'user',
        title,
        message,
        createdAt: new Date().toISOString(),
        read: false,
      };
      setNotificationState((prev) => {
        const next: NotificationStateRecord = {
          ...prev,
          reminders: [reminder, ...prev.reminders],
        };
        saveNotificationState(next);
        return next;
      });
      if (!notificationsEnabled) {
        setNotificationsEnabled(true);
        saveNotificationsEnabled(true);
      }
      showToast(`Recordatorio "${title}" guardado.`);
    },
    [notificationsEnabled, showToast]
  );

  const appNotifications = useMemo<AppNotification[]>(() => {
    const items: AppNotification[] = [];
    const nowIso = new Date().toISOString();

    const activeIsDraft = isProformaDraft(proforma);
    const activeNumLabel = formatProformaNumberLabel(proforma);

    if (isProformaConfirmed && totals.total <= 0) {
      items.push({
        id: `sys-zero-total-${proforma.id}-${proforma.consecutivo}`,
        kind: 'warning',
        source: 'system',
        title: `Proforma ${activeNumLabel} en cero o negativo`,
        message: `El total general actual es ${formatMoney(totals.total, proforma.clientProject.moneda)}. Revisa los montos antes de exportar PDF.`,
        createdAt: nowIso,
        read: false,
        actionSection: 'editor',
        actionLabel: 'Ir al Editor',
      });
    }

    if (isProformaConfirmed) {
      const consecutivoNum = Number(proforma.consecutivo);
      const missingFields: string[] = [];
      if (
        !activeIsDraft &&
        (!Number.isFinite(consecutivoNum) || consecutivoNum <= 0)
      ) {
        missingFields.push('Número / consecutivo');
      }
      if (!proforma.clientProject.cliente.trim()) {
        missingFields.push('Cliente');
      }
      if (!proforma.clientProject.proyecto.trim()) {
        missingFields.push('Proyecto');
      }
      if (missingFields.length > 0) {
        items.push({
          id: `sys-missing-key-fields-${proforma.id}`,
          kind: 'warning',
          source: 'system',
          title: activeIsDraft
            ? 'Datos clave incompletos en Proforma Borrador'
            : Number.isFinite(consecutivoNum) && consecutivoNum > 0
              ? `Datos clave incompletos en Proforma Nº ${consecutivoNum}`
              : 'Datos clave incompletos en la proforma',
          message: `Falta completar: ${missingFields.join(', ')}.`,
          createdAt: nowIso,
          read: false,
          actionSection: 'editor',
          actionLabel: 'Completar en Editor',
        });
      }

      if (
        !activeIsDraft &&
        Number.isFinite(consecutivoNum) &&
        consecutivoNum > 0
      ) {
        const activeNum = Math.floor(consecutivoNum);
        const activeClienteNorm = proforma.clientProject.cliente
          .trim()
          .toLowerCase();

        const isSameActiveRecord = (rec: SavedProformaRecord): boolean => {
          if (rec.id === proforma.id || rec.data?.id === proforma.id) {
            return true;
          }
          if (
            rec.source === 'sheet' &&
            !rec.rawDatosJson &&
            rec.id === `sheet-prof-${rec.consecutivo}` &&
            Number(rec.consecutivo) === activeNum &&
            history.some(
              (h) =>
                h.id === proforma.id && Number(h.consecutivo) === activeNum
            ) &&
            (!activeClienteNorm ||
              rec.data.clientProject.cliente.trim().toLowerCase() ===
                activeClienteNorm)
          ) {
            return true;
          }
          return false;
        };

        const localDuplicates = history.filter(
          (rec) =>
            !isProformaDraft(rec) &&
            Number(rec.consecutivo) === activeNum &&
            !isSameActiveRecord(rec)
        );
        const remoteDuplicates = remoteHistory.filter(
          (rec) =>
            !isProformaDraft(rec) &&
            Number(rec.consecutivo) === activeNum &&
            !isSameActiveRecord(rec)
        );

        if (localDuplicates.length > 0 || remoteDuplicates.length > 0) {
          const origins: string[] = [];
          if (localDuplicates.length > 0) origins.push('Historial local');
          if (remoteDuplicates.length > 0) origins.push('Sheet PROFORMAS');
          const sampleMatch = remoteDuplicates[0] ?? localDuplicates[0];
          const sampleClient =
            sampleMatch?.data.clientProject.cliente.trim() ||
            'Cliente sin definir';
          items.push({
            id: `sys-duplicate-consecutivo-${proforma.id}-${activeNum}`,
            kind: 'warning',
            source: 'system',
            title: `Consecutivo Nº ${activeNum} duplicado`,
            message: `Ya existe otra proforma con el Nº ${activeNum} en ${origins.join(' y ')} (${sampleClient}). Ajusta o sincroniza el consecutivo para evitar choques.`,
            createdAt: nowIso,
            read: false,
            actionSection: 'history',
            actionLabel: 'Revisar en Proformas',
          });
        }
      }
    }

    if (cloudConfig.lastStatus === 'error') {
      items.push({
        id: 'sys-proformas-send-error',
        kind: 'error',
        source: 'system',
        title: 'Error de sincronización con PROFORMAS',
        message:
          cloudConfig.lastMessage ||
          'No se pudo enviar la última proforma al Google Sheet.',
        createdAt: nowIso,
        read: false,
        actionSection: 'integration',
        actionLabel: 'Revisar Integración',
      });
    }

    if (remoteHistoryFeedback?.ok === false) {
      items.push({
        id: 'sys-proformas-fetch-error',
        kind: 'error',
        source: 'system',
        title: 'Fallo al consultar hoja PROFORMAS',
        message: remoteHistoryFeedback.message,
        createdAt: nowIso,
        read: false,
        actionSection: 'integration',
        actionLabel: 'Revisar conexión',
      });
    }

    if (cloudConfig.aranLastStatus === 'error') {
      items.push({
        id: 'sys-specs-sync-error',
        kind: 'error',
        source: 'system',
        title: 'Fallo en ESPECIFICACIONES / Términos',
        message:
          cloudConfig.aranLastMessage ||
          'Error al consultar las plantillas de especificaciones.',
        createdAt: nowIso,
        read: false,
        actionSection: 'integration',
        actionLabel: 'Ir a Integración',
      });
    }

    if (clientsSyncFeedback?.ok === false) {
      items.push({
        id: 'sys-clients-sync-error',
        kind: 'error',
        source: 'system',
        title: 'Error al sincronizar Clientes',
        message: clientsSyncFeedback.message,
        createdAt: nowIso,
        read: false,
        actionSection: 'clients',
        actionLabel: 'Ir a Clientes',
      });
    }

    const merged = [...notificationState.reminders, ...items];
    return merged
      .filter((n) => !notificationState.dismissedIds.includes(n.id))
      .map((n) => ({
        ...n,
        read: notificationState.readIds.includes(n.id),
      }));
  }, [
    isProformaConfirmed,
    totals.total,
    proforma.id,
    proforma.consecutivo,
    proforma.isDraft,
    proforma.clientProject.moneda,
    proforma.clientProject.cliente,
    proforma.clientProject.proyecto,
    history,
    remoteHistory,
    cloudConfig.lastStatus,
    cloudConfig.lastMessage,
    cloudConfig.aranLastStatus,
    cloudConfig.aranLastMessage,
    remoteHistoryFeedback,
    clientsSyncFeedback,
    notificationState,
  ]);

  const isSheetWebhookConnected =
    Boolean(cloudConfig.webhookUrl.trim()) && cloudConfig.lastStatus !== 'error';

  return (
    <div
      style={
        {
          '--olmo-header-h': `${stickyHeaderHeight}px`,
          '--olmo-workspace-top': `${
            stickyHeaderHeight +
            (activeSection !== 'integration' ? stickyWorkingBarHeight : 0)
          }px`,
        } as CSSProperties
      }
      className="min-h-screen bg-[#F3F2EE] text-zinc-900 transition-colors duration-150 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <TopBar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onDownloadPDF={() => void handleDownloadPDF()}
        onSendToSheet={() => void handleSendProformaToSheet()}
        onImportDraftFile={(file) => void handleImportDraftFile(file)}
        onOpenImportFromSheet={handleOpenImportFromSheetModal}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        undoCount={undoCount}
        redoCount={redoCount}
        autoRefreshMinutes={autoRefreshMinutes}
        onChangeAutoRefreshMinutes={handleChangeAutoRefreshMinutes}
        showIntegrationTab={showIntegrationTab}
        onToggleIntegrationTab={() => {
          setShowIntegrationTab((prev) => {
            const next = !prev;
            saveIntegrationTabEnabled(next);
            if (!next && activeSection === 'integration') {
              setActiveSection('history');
            }
            return next;
          });
        }}
        isProformaConfirmed={isProformaConfirmed}
        autosaveStatus={autosaveStatus}
        lastLocalSavedAt={lastLocalSavedAt}
        isSendingToSheet={isSendingToSheet}
        isSheetWebhookConnected={isSheetWebhookConnected}
        themeMode={themeMode}
        onChangeThemeMode={handleChangeThemeMode}
        notificationsEnabled={notificationsEnabled}
        onToggleNotificationsEnabled={handleToggleNotificationsEnabled}
        notifications={appNotifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onDismissNotification={handleDismissNotification}
        onAddReminder={handleAddReminder}
      />

      {/* Notificación flotante sobria */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-5 right-5 z-40 flex max-w-md items-center gap-2.5 rounded-lg border border-[#E5E4DF] bg-white px-4 py-3 text-xs font-medium text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <CheckCircle2
            className={`h-4 w-4 shrink-0 ${
              toast.isError ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}
            aria-hidden="true"
          />
          <span>{toast.text}</span>
        </div>
      )}

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        {/* Desglose superior sticky siempre visible en todas las pestañas excepto INTEGRACIÓN */}
        {activeSection !== 'integration' && (
          <section
            ref={workingBarRef}
            aria-label="Trabajando en la cotización"
            className={`no-print sticky top-[var(--olmo-header-h,57px)] z-20 mb-4 overflow-hidden rounded-xl border transition-colors duration-150 ${
              !isProformaConfirmed
                ? 'border-red-300 bg-red-50 shadow-[0_4px_12px_-4px_rgba(220,38,38,0.14)] dark:border-red-800/80 dark:bg-[#261114] dark:shadow-none'
                : 'border-[#E3E1DA] bg-white shadow-[0_4px_12px_-4px_rgba(24,24,27,0.08)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none'
            }`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-1.5 ${
                !isProformaConfirmed
                  ? 'border-red-200 bg-gradient-to-r from-red-100 via-orange-100 to-amber-100 dark:border-red-900/70 dark:from-red-950/80 dark:via-orange-950/70 dark:to-amber-950/60'
                  : 'border-[#ECEAE3] bg-[#FAF9F6] dark:border-zinc-800 dark:bg-zinc-800/60'
              }`}
            >
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                  !isProformaConfirmed
                    ? 'text-red-800 dark:text-red-200'
                    : 'text-[#8C5A32] dark:text-[#D59B69]'
                }`}
              >
                {!isProformaConfirmed && (
                  <AlertTriangle
                    className="h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-400"
                    aria-hidden="true"
                  />
                )}
                <span>
                  {!isProformaConfirmed
                    ? 'Trabajando en la cotización · Sin proforma seleccionada o confirmada'
                    : 'Trabajando en la cotización'}
                </span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                <thead>
                  <tr
                    className={`border-b text-[10.5px] font-semibold uppercase tracking-wide ${
                      !isProformaConfirmed
                        ? 'border-red-200/80 text-red-700 dark:border-red-900/60 dark:text-red-300'
                        : 'border-[#F0EEE8] text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400'
                    }`}
                  >
                    <th className="w-[125px] px-3.5 py-1.5">Consecutivo</th>
                    <th className="px-3.5 py-1.5">Cliente</th>
                    <th className="px-3.5 py-1.5">Proyecto</th>
                    <th className="w-[80px] px-3.5 py-1.5 text-center">Ítems</th>
                    <th className="w-[140px] px-3.5 py-1.5 text-right">Total</th>
                    <th className="w-[450px] px-3.5 py-1.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    className={
                      !isProformaConfirmed
                        ? 'bg-red-50/70 text-red-950 dark:bg-red-950/30 dark:text-red-100'
                        : 'text-zinc-800 dark:text-zinc-100'
                    }
                  >
                    <td className="px-3.5 py-2 font-mono font-semibold tabular-nums whitespace-nowrap">
                      {!isProformaConfirmed ? (
                        <span className="text-red-700 dark:text-red-300">
                          — Sin confirmar
                        </span>
                      ) : isProformaDraft(proforma) ? (
                        <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-sans text-[11px] font-semibold text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/60 dark:text-amber-200">
                          Borrador
                        </span>
                      ) : (
                        <span className="text-zinc-900 dark:text-zinc-100">
                          Nº {proforma.consecutivo}
                        </span>
                      )}
                    </td>
                    <td
                      className="max-w-[230px] truncate px-3.5 py-2 font-medium"
                      title={
                        isProformaConfirmed
                          ? proforma.clientProject.cliente || 'Sin definir'
                          : 'Sin proforma confirmada'
                      }
                    >
                      {!isProformaConfirmed ? (
                        <span className="text-orange-800 dark:text-orange-300">
                          Selecciona, crea o importa una proforma
                        </span>
                      ) : (
                        proforma.clientProject.cliente.trim() || (
                          <span className="text-zinc-400 dark:text-zinc-500">
                            Sin definir
                          </span>
                        )
                      )}
                    </td>
                    <td
                      className="max-w-[230px] truncate px-3.5 py-2 font-medium"
                      title={
                        isProformaConfirmed
                          ? proforma.clientProject.proyecto || 'Sin definir'
                          : '—'
                      }
                    >
                      {!isProformaConfirmed ? (
                        <span className="text-red-500 dark:text-red-400">—</span>
                      ) : (
                        proforma.clientProject.proyecto.trim() || (
                          <span className="text-zinc-400 dark:text-zinc-500">
                            Sin definir
                          </span>
                        )
                      )}
                    </td>
                    <td className="px-3.5 py-2 text-center font-mono font-semibold tabular-nums whitespace-nowrap">
                      {!isProformaConfirmed ? (
                        <span className="text-red-700 dark:text-red-300">0</span>
                      ) : (
                        proforma.items.length
                      )}
                    </td>
                    <td
                      className={`px-3.5 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                        !isProformaConfirmed
                          ? 'text-red-700 dark:text-red-300'
                          : totals.total <= 0
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-[#8C5A32] dark:text-[#D59B69]'
                      }`}
                    >
                      {!isProformaConfirmed
                        ? '—'
                        : formatMoney(totals.total, proforma.clientProject.moneda)}
                    </td>
                    <td className="px-3.5 py-1.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        {!isProformaConfirmed ? (
                          <button
                            type="button"
                            onClick={() => setShowCreateOrLoadModal(true)}
                            title="Crear una nueva cotización o cargar una proforma existente"
                            className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-xs transition-colors hover:bg-orange-700 whitespace-nowrap shrink-0 cursor-pointer dark:bg-orange-600 dark:hover:bg-orange-500"
                          >
                            <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Crear o cargar una proforma</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleSendProformaToSheet()}
                            disabled={isSendingToSheet}
                            title={
                              isSheetWebhookConnected
                                ? `Conectado: enviar Proforma ${formatProformaNumberLabel(proforma)} a la hoja PROFORMAS`
                                : 'Sin URL o último envío con error: revisa Integración'
                            }
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${getConnectionButtonClasses(
                              isSheetWebhookConnected,
                              'outline'
                            )}`}
                          >
                            {isSendingToSheet ? (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <CloudUpload
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            )}
                            <span>
                              {isSendingToSheet
                                ? 'Enviando al Sheet...'
                                : 'Enviar Proforma al Sheet'}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleDownloadPDF()}
                          disabled={!isProformaConfirmed}
                          title={
                            isProformaConfirmed
                              ? `Generar PDF de la Proforma ${formatProformaNumberLabel(proforma)}`
                              : 'Selecciona, crea o importa una proforma antes de generar el PDF'
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-black bg-black px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-700"
                        >
                          <PdfIcon className="h-3.5 w-3.5 text-white" />
                          <span>Generar PDF</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowCloseQuoteConfirm(true)}
                          disabled={!isProformaConfirmed || isSendingToSheet}
                          title={
                            isProformaConfirmed
                              ? `Cerrar la Proforma ${formatProformaNumberLabel(proforma)} actual`
                              : 'No hay ninguna cotización activa para cerrar'
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 dark:border-red-800/80 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/60"
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Cerrar cotización</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Vista principal según sección */}
        {activeSection === 'editor' && (
          <div
            aria-disabled={!isProformaConfirmed}
            className={`w-full ${
              !isProformaConfirmed
                ? 'pointer-events-none select-none opacity-45 grayscale-[35%]'
                : ''
            }`}
          >
            <div
              className={`grid grid-cols-1 gap-6 ${
                layoutMode === 'split'
                  ? 'xl:grid-cols-12 xl:items-start'
                  : 'mx-auto max-w-[920px]'
              }`}
            >
              <section
                aria-label="Formulario de captura de proforma"
                className={`no-print olmo-editor-scroll ${
                  layoutMode === 'split'
                    ? 'xl:col-span-5 xl:sticky xl:top-[calc(var(--olmo-workspace-top,155px)+12px)] xl:max-h-[calc(100vh-var(--olmo-workspace-top,155px)-24px)] xl:overflow-y-auto xl:pr-1'
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
                  onClearFooterLogos={handleClearFooterLogos}
                  onSheetsConfigChange={handleSheetsConfigChange}
                  onSaveProductTemplate={handleSaveProductTemplate}
                  onDeleteProductTemplate={handleDeleteProductTemplate}
                  onSaveClientToDirectory={handleSaveClientFromEditor}
                  onGoToClientsDirectory={() => setActiveSection('clients')}
                  aranTemplates={aranTemplates}
                  terminosTemplates={terminosTemplates}
                  specsSheetUrl={sheetShortcutUrls.specsSheetUrl}
                  aranScriptUrl={cloudConfig.aranScriptUrl ?? ''}
                  aranLastStatus={cloudConfig.aranLastStatus}
                  aranLastMessage={cloudConfig.aranLastMessage}
                  isSyncingAran={isSyncingAran}
                  onSyncAranTemplates={() => void handleSyncAranTemplates(false)}
                  onGoToIntegration={() => setActiveSection('integration')}
                  isSplitScrollContainer={layoutMode === 'split'}
                  layoutMode={layoutMode}
                  onChangeLayoutMode={setLayoutMode}
                  activeTab={editorTab}
                  onChangeActiveTab={setEditorTab}
                  tabScrollPositions={editorScrollByTab}
                  onSaveTabScrollPosition={handleSaveEditorTabScrollPosition}
                  undoHighlight={undoHighlight}
                  isActiveInViewport={activeSection === 'editor'}
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
                    canEditVisualRefs={isProformaConfirmed}
                    onChangeVisualReferenceSize={handleChangeVisualReferenceSize}
                    onUpdateVisualReference={handleUpdateVisualReference}
                    onReorderVisualReferences={handleReorderVisualReferences}
                    onChangeTableColumnWidths={handleChangeTableColumnWidths}
                  />
                </section>
              )}
            </div>
          </div>
        )}

        {activeSection === 'preview' && (
          <div
            aria-disabled={!isProformaConfirmed}
            className={`w-full ${
              !isProformaConfirmed
                ? 'pointer-events-none select-none opacity-45 grayscale-[35%]'
                : ''
            }`}
          >
            <div className="mx-auto max-w-[1060px]">
              <ProformaPreview
                data={proforma}
                totals={totals}
                mainLogo={mainLogo}
                footerLogos={footerLogos}
                canEditVisualRefs={isProformaConfirmed}
                showPageThumbnails
                onChangeVisualReferenceSize={handleChangeVisualReferenceSize}
                onUpdateVisualReference={handleUpdateVisualReference}
                onReorderVisualReferences={handleReorderVisualReferences}
                onChangeTableColumnWidths={handleChangeTableColumnWidths}
              />
            </div>
          </div>
        )}

        {activeSection === 'clients' && (
          <ClientsView
            clients={savedClients}
            importConfig={clientsImportConfig}
            onImportConfigChange={handleClientsImportConfigChange}
            onImportClients={handleImportClients}
            onSaveClient={(payload, id) =>
              handleSaveClientInDirectory(payload, id, true)
            }
            onDuplicateClient={handleDuplicateClient}
            onDeleteClient={handleDeleteClient}
            onUseClientInProforma={handleUseClientInProforma}
            onGoToEditor={() => setActiveSection('editor')}
            onNotify={showToast}
            isSyncingClients={isSyncingClients}
            clientsSyncFeedback={clientsSyncFeedback}
            onSyncClientsFromSheet={() => handleSyncClientsFromSheet(false)}
            onClearClientsSyncFeedback={() => setClientsSyncFeedback(null)}
            clientsSheetUrl={sheetShortcutUrls.clientsSheetUrl}
          />
        )}

        {activeSection === 'history' && (
          <HistoryView
            records={history}
            remoteRecords={remoteHistory}
            activeProformaId={isProformaConfirmed ? proforma.id : ''}
            hasAppsScriptUrl={Boolean(cloudConfig.webhookUrl.trim())}
            isSyncingSheet={isSyncingRemoteHistory}
            lastSheetSyncAt={lastRemoteHistorySyncAt}
            sheetSyncFeedback={remoteHistoryFeedback}
            onSyncFromSheet={() => void handleSyncHistoryFromSheet(false)}
            onGoToIntegration={() => {
              setShowIntegrationTab(true);
              saveIntegrationTabEnabled(true);
              setActiveSection('integration');
            }}
            onPreviewRecord={handlePreviewHistoryRecord}
            onOpenRecord={handleOpenRecord}
            onDuplicateRecord={handleDuplicateRecord}
            onDeleteRecord={handleRequestDeleteRecord}
            onDownloadRecordPDF={handleDownloadRecordPDF}
            onGoToEditor={() => setActiveSection('editor')}
            onNewProforma={handleRequestNewProforma}
            proformasSheetUrl={sheetShortcutUrls.proformasSheetUrl}
            mainLogo={mainLogo}
            footerLogos={footerLogos}
          />
        )}

        {activeSection === 'integration' && (
          <IntegrationView
            config={cloudConfig}
            proforma={proforma}
            totals={totals}
            onSaveConfig={handleSaveCloudConfig}
            aranTemplatesCount={aranTemplates.length}
            terminosTemplatesCount={terminosTemplates.length}
            sheetShortcutUrls={sheetShortcutUrls}
            onSaveSheetShortcutUrls={handleSaveSheetShortcutUrls}
          />
        )}

        {activeSection === 'dashboard' && (
          <DashboardView
            records={history}
            remoteRecords={remoteHistory}
            themeMode={themeMode}
            onGoToHistory={() => setActiveSection('history')}
            onGoToEditor={() => setActiveSection('editor')}
          />
        )}
      </main>

      {showNewQuoteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-quote-dialog-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px] dark:bg-black/70"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="new-quote-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  ¿Iniciar una nueva cotización limpia?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  La proforma actual ({formatProformaNumberLabel(proforma)}) tiene cambios sin guardar en el historial. Al continuar se iniciará una nueva cotización en modo Borrador, sin afectar las cotizaciones ya guardadas en el Historial.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewQuoteConfirm(false)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAndStartNewProforma}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Guardar y crear nueva</span>
              </button>
              <button
                type="button"
                onClick={executeNewProforma}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px] dark:bg-black/70"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-[#FAF6F1] p-2 text-[#8C5A32] dark:bg-zinc-800 dark:text-[#D59B69]">
                <FileJson className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="load-draft-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  ¿Cargar Proforma {formatProformaNumberLabel(pendingLoadDraft.data)} en el editor?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Se reemplazará la cotización actual en el editor ({formatProformaNumberLabel(proforma)}) con todos los datos completos de esta cotización ({pendingLoadDraft.data.clientProject.cliente || 'Cliente sin definir'} · {pendingLoadDraft.data.items.length} ítem(s)) para que puedas seguir editándola y exportarla.
                </p>
                <p className="mt-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Origen: <span className="text-zinc-800 dark:text-zinc-200">{pendingLoadDraft.sourceLabel}</span>
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingLoadDraft(null)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              {hasUnsavedProformaChanges(proforma, history) && (
                <button
                  type="button"
                  onClick={() => void handleSaveCurrentAndLoadPendingDraft()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Guardar actual y cargar</span>
                </button>
              )}
              <button
                type="button"
                onClick={executeLoadPendingDraft}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sí, cargar y editar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSendToSheetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-sheet-dialog-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px] dark:bg-black/70"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-[#FAF6F1] p-2 text-[#8C5A32] dark:bg-zinc-800 dark:text-[#D59B69]">
                <CloudUpload className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="send-sheet-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  ¿Enviar Proforma {formatProformaNumberLabel(proforma)} al Google Sheet?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Se registrará o actualizará esta cotización en la pestaña{' '}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    PROFORMAS
                  </strong>{' '}
                  de tu Google Sheet conectado.
                </p>

                <div className="mt-3 space-y-1 rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/60">
                  <div>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                      Consecutivo:{' '}
                    </span>
                    <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatProformaNumberLabel(proforma)}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                      Cliente:{' '}
                    </span>
                    <span className="text-zinc-800 dark:text-zinc-200">
                      {proforma.clientProject.cliente.trim() || 'Sin definir'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                      Proyecto:{' '}
                    </span>
                    <span className="text-zinc-800 dark:text-zinc-200">
                      {proforma.clientProject.proyecto.trim() || 'Sin definir'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                      Total:{' '}
                    </span>
                    <span className="font-mono font-semibold text-[#8C5A32] dark:text-[#D59B69]">
                      {formatMoney(totals.total, proforma.clientProject.moneda)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSendToSheetConfirm(false)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void executeSendProformaToSheet()}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sí, enviar al Sheet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateOrLoadModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-or-load-dialog-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px] dark:bg-black/70"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-[#FAF6F1] p-2 text-[#8C5A32] dark:bg-zinc-800 dark:text-[#D59B69]">
                <FilePlus2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="create-or-load-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Crear o cargar una proforma
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Elige si deseas iniciar una cotización nueva en modo Borrador o importar una proforma desde Google Sheet (PROFORMAS).
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateOrLoadModal(false);
                  handleRequestNewProforma();
                }}
                className="flex w-full items-center justify-between rounded-lg border border-[#DCDAD3] bg-[#FAF9F6] px-3.5 py-2.5 text-left text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                <span className="inline-flex items-center gap-2">
                  <FilePlus2 className="h-4 w-4 text-[#8C5A32] dark:text-[#D59B69]" aria-hidden="true" />
                  <span>Crear nueva cotización</span>
                </span>
                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/60 dark:text-amber-200">
                  Borrador
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCreateOrLoadModal(false);
                  handleOpenImportFromSheetModal();
                }}
                className="flex w-full items-center justify-between rounded-lg border border-[#DCDAD3] bg-white px-3.5 py-2.5 text-left text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <span className="inline-flex items-center gap-2">
                  <CloudUpload className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Importar desde Google Sheet (PROFORMAS)</span>
                </span>
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCreateOrLoadModal(false)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseQuoteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-quote-dialog-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px] dark:bg-black/70"
        >
          <div className="w-full max-w-lg rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="close-quote-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  ¿Cómo deseas cerrar la Proforma {formatProformaNumberLabel(proforma)}?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Puedes descartar la sesión de trabajo actual sin enviar ni guardar cambios, o guardar y enviar la cotización al historial
                  {cloudConfig.webhookUrl.trim() ? ' (y al Google Sheet PROFORMAS)' : ''}{' '}
                  antes de cerrar.
                </p>

                <div className="mt-3 space-y-1 rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/60">
                  <div>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                      Consecutivo:{' '}
                    </span>
                    <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatProformaNumberLabel(proforma)}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                      Cliente:{' '}
                    </span>
                    <span className="text-zinc-800 dark:text-zinc-200">
                      {proforma.clientProject.cliente.trim() || 'Sin definir'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                      Proyecto:{' '}
                    </span>
                    <span className="text-zinc-800 dark:text-zinc-200">
                      {proforma.clientProject.proyecto.trim() || 'Sin definir'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                      Total:{' '}
                    </span>
                    <span className="font-mono font-semibold text-[#8C5A32] dark:text-[#D59B69]">
                      {formatMoney(totals.total, proforma.clientProject.moneda)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isClosingAndSaving}
                onClick={() => setShowCloseQuoteConfirm(false)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-45 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isClosingAndSaving}
                onClick={() => {
                  setShowCloseQuoteConfirm(false);
                  setCloseStepConfirm('discard');
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-red-700 disabled:opacity-45 cursor-pointer dark:bg-red-600 dark:hover:bg-red-500"
              >
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Salir sin guardar</span>
              </button>
              <button
                type="button"
                disabled={isClosingAndSaving}
                onClick={() => {
                  setShowCloseQuoteConfirm(false);
                  setCloseStepConfirm('save');
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-45 cursor-pointer dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Guardar y cerrar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {closeStepConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-step-dialog-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-[1px] dark:bg-black/75"
        >
          <div
            className={`w-full max-w-md rounded-xl border bg-white p-5 shadow-2xl dark:bg-zinc-900 ${
              closeStepConfirm === 'discard'
                ? 'border-red-300 dark:border-red-800/80'
                : 'border-emerald-300 dark:border-emerald-800/80'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`rounded-md p-2 ${
                  closeStepConfirm === 'discard'
                    ? 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                }`}
              >
                {closeStepConfirm === 'discard' ? (
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1">
                <h2
                  id="close-step-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  {closeStepConfirm === 'discard'
                    ? '¿Estás seguro de que deseas salir sin guardar?'
                    : `¿Estás de acuerdo en guardar y cerrar la Proforma ${formatProformaNumberLabel(proforma)}?`}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {closeStepConfirm === 'discard'
                    ? `Se descartará la sesión activa de la Proforma ${formatProformaNumberLabel(proforma)} y NO se guardarán ni enviarán cambios al Google Sheet PROFORMAS.`
                    : cloudConfig.webhookUrl.trim()
                      ? `Se guardará la Proforma ${formatProformaNumberLabel(proforma)} en el historial y se enviará al Google Sheet PROFORMAS antes de cerrar. Si ya existe en el Sheet, se te pedirá confirmar la sobrescritura.`
                      : `Se guardará la Proforma ${formatProformaNumberLabel(proforma)} en el historial local antes de cerrar la sesión activa.`}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isClosingAndSaving || isSendingToSheet}
                onClick={() => setCloseStepConfirm(null)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-45 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              {closeStepConfirm === 'discard' ? (
                <button
                  type="button"
                  disabled={isClosingAndSaving || isSendingToSheet}
                  onClick={handleCloseQuoteWithoutSaving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-red-700 disabled:opacity-45 cursor-pointer dark:bg-red-600 dark:hover:bg-red-500"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sí, salir sin guardar</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isClosingAndSaving || isSendingToSheet}
                  onClick={() => void handleSaveAndCloseQuote()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-45 cursor-pointer dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {isClosingAndSaving || isSendingToSheet ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {isClosingAndSaving || isSendingToSheet
                      ? 'Guardando y enviando...'
                      : 'Sí, guardar y cerrar'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {overwriteSheetConfirm && (() => {
        const existingRec = overwriteSheetConfirm.existingRecord;
        const parsedSheetData = existingRec.rawDatosJson
          ? parseProformaFromJsonInput(
              existingRec.rawDatosJson,
              existingRec.consecutivo
            )
          : null;
        const existingData = parsedSheetData ?? existingRec.data;
        const existingTotals = computeProformaTotals(existingData);
        const existingCurrency = existingData.clientProject.moneda;
        const existingDisplayTotal =
          existingTotals.total > 0 ? existingTotals.total : existingRec.total;

        const existingCliente =
          existingData.clientProject.cliente.trim() || 'Sin definir';
        const newCliente =
          proforma.clientProject.cliente.trim() || 'Sin definir';
        const existingProyecto =
          existingData.clientProject.proyecto.trim() || 'Sin definir';
        const newProyecto =
          proforma.clientProject.proyecto.trim() || 'Sin definir';
        const existingItemsCount = existingData.items.length;
        const newItemsCount = proforma.items.length;

        const existingSubtotalStr = formatMoney(
          existingTotals.subtotal,
          existingCurrency
        );
        const newSubtotalStr = formatMoney(
          totals.subtotal,
          proforma.clientProject.moneda
        );
        const existingIvaStr = `${existingData.taxRate}% (${formatMoney(
          existingTotals.impuesto,
          existingCurrency
        )})`;
        const newIvaStr = `${proforma.taxRate}% (${formatMoney(
          totals.impuesto,
          proforma.clientProject.moneda
        )})`;
        const existingTotalStr = formatMoney(
          existingDisplayTotal,
          existingCurrency
        );
        const newTotalStr = formatMoney(
          totals.total,
          proforma.clientProject.moneda
        );

        const comparisonRows = [
          {
            label: 'Consecutivo',
            currentVal: formatProformaNumberLabel(existingRec),
            newVal: formatProformaNumberLabel(proforma),
            changed:
              formatProformaNumberLabel(existingRec) !==
              formatProformaNumberLabel(proforma),
          },
          {
            label: 'Cliente',
            currentVal: existingCliente,
            newVal: newCliente,
            changed: existingCliente !== newCliente,
          },
          {
            label: 'Proyecto',
            currentVal: existingProyecto,
            newVal: newProyecto,
            changed: existingProyecto !== newProyecto,
          },
          {
            label: 'Cantidad de ítems',
            currentVal: `${existingItemsCount} ítem(s)`,
            newVal: `${newItemsCount} ítem(s)`,
            changed: existingItemsCount !== newItemsCount,
          },
          {
            label: 'Subtotal',
            currentVal: existingSubtotalStr,
            newVal: newSubtotalStr,
            changed: existingSubtotalStr !== newSubtotalStr,
          },
          {
            label: 'IVA',
            currentVal: existingIvaStr,
            newVal: newIvaStr,
            changed: existingIvaStr !== newIvaStr,
          },
          {
            label: 'Total',
            currentVal: existingTotalStr,
            newVal: newTotalStr,
            changed: existingTotalStr !== newTotalStr,
            highlightTotal: true,
          },
        ];

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="overwrite-sheet-dialog-title"
            className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-[1px] dark:bg-black/75"
          >
            <div
              className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-amber-300 bg-white shadow-2xl transition-all duration-150 dark:border-amber-800/80 dark:bg-zinc-900 ${
                overwriteModalTab === 'previews' ? 'max-w-6xl' : 'max-w-2xl'
              }`}
            >
              {/* Encabezado y pestañas internas */}
              <div className="border-b border-[#E5E4DF] px-5 pt-5 pb-3 dark:border-zinc-800">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-amber-100 p-2 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2
                      id="overwrite-sheet-dialog-title"
                      className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                    >
                      ¿Estás seguro que deseas sobrescribir la proforma {formatProformaNumberLabel(proforma)}?
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                      Ya existe una fila para la proforma{' '}
                      <strong className="font-mono text-zinc-900 dark:text-zinc-100">
                        {formatProformaNumberLabel(proforma)}
                      </strong>{' '}
                      en la pestaña{' '}
                      <strong className="text-zinc-900 dark:text-zinc-100">
                        PROFORMAS
                      </strong>{' '}
                      de Google Sheets. Si confirmas, se reemplazará la versión actual alojada en el Sheet con los nuevos datos.
                    </p>
                  </div>
                </div>

                <div
                  role="tablist"
                  aria-label="Modo de comparación de proforma"
                  className="mt-4 inline-flex items-center rounded-lg border border-[#DCDAD3] bg-[#FAF9F6] p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={overwriteModalTab === 'table'}
                    onClick={() => setOverwriteModalTab('table')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      overwriteModalTab === 'table'
                        ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-100'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    Cuadro comparativo
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={overwriteModalTab === 'previews'}
                    onClick={() => setOverwriteModalTab('previews')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      overwriteModalTab === 'previews'
                        ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-100'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    Comparar vistas previas
                  </button>
                </div>
              </div>

              {/* Contenido desplazable según pestaña activa */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {overwriteModalTab === 'table' ? (
                  <div className="overflow-hidden rounded-lg border border-[#E5E4DF] dark:border-zinc-800">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E5E4DF] bg-[#FAF9F6] text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300">
                          <th className="w-[165px] px-3 py-2">Campo</th>
                          <th className="px-3 py-2">Versión actual en Sheet</th>
                          <th className="px-3 py-2">Nueva versión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFECE6] dark:divide-zinc-800">
                        {comparisonRows.map((row) => (
                          <tr
                            key={row.label}
                            className={
                              row.changed
                                ? 'bg-amber-50/55 dark:bg-amber-950/20'
                                : 'bg-white dark:bg-zinc-900'
                            }
                          >
                            <td className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                              <span>{row.label}</span>
                              {row.changed && (
                                <span className="ml-1.5 inline-block rounded bg-amber-100 px-1 py-0.5 text-[9.5px] font-bold uppercase text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                                  Cambia
                                </span>
                              )}
                            </td>
                            <td
                              className={`px-3 py-2 text-zinc-600 dark:text-zinc-400 ${
                                row.highlightTotal ? 'font-mono font-semibold' : ''
                              }`}
                            >
                              {row.currentVal}
                            </td>
                            <td
                              className={`px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100 ${
                                row.highlightTotal
                                  ? 'font-mono font-bold text-[#8C5A32] dark:text-[#D59B69]'
                                  : ''
                              }`}
                            >
                              {row.newVal}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="flex flex-col overflow-hidden rounded-lg border border-[#E5E4DF] bg-[#F5F4EF] dark:border-zinc-700 dark:bg-zinc-950">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E4DF] bg-[#FAF9F6] px-3.5 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            Versión actual en Sheet (PROFORMAS)
                          </div>
                          <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            {formatProformaNumberLabel(existingRec)} · {existingCliente} ·{' '}
                            {existingTotalStr}
                            {!existingRec.rawDatosJson
                              ? ' (reconstruida de columnas)'
                              : ''}
                          </div>
                        </div>
                        <PreviewZoomControls
                          zoom={overwriteSheetZoom}
                          defaultZoom={DEFAULT_COMPARE_PREVIEW_ZOOM}
                          contextLabel="Versión actual en Sheet"
                          onChangeZoom={setOverwriteSheetZoom}
                        />
                      </div>
                      <CtrlWheelZoomBox
                        onZoomStep={(dir) =>
                          setOverwriteSheetZoom((prev) =>
                            clampPreviewZoom(
                              prev + dir * COMPARE_PREVIEW_ZOOM_STEP
                            )
                          )
                        }
                        className="max-h-[54vh] overflow-auto p-3"
                      >
                        <div
                          className="mx-auto w-[816px]"
                          style={{ zoom: overwriteSheetZoom }}
                        >
                          <ProformaPreview
                            data={existingData}
                            totals={existingTotals}
                            mainLogo={mainLogo}
                            footerLogos={footerLogos}
                            compactReadOnly
                            idPrefix="cmp-sheet-"
                          />
                        </div>
                      </CtrlWheelZoomBox>
                    </div>

                    <div className="flex flex-col overflow-hidden rounded-lg border border-amber-300 bg-[#F5F4EF] dark:border-amber-800/80 dark:bg-zinc-950">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/80 px-3.5 py-2 dark:border-amber-900/60 dark:bg-amber-950/40">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            Nueva versión (a sobrescribir)
                          </div>
                          <div className="truncate text-[11px] text-amber-900 dark:text-amber-300">
                            {formatProformaNumberLabel(proforma)} · {newCliente} ·{' '}
                            {newTotalStr}
                          </div>
                        </div>
                        <PreviewZoomControls
                          zoom={overwriteNewZoom}
                          defaultZoom={DEFAULT_COMPARE_PREVIEW_ZOOM}
                          contextLabel="Nueva versión"
                          onChangeZoom={setOverwriteNewZoom}
                        />
                      </div>
                      <CtrlWheelZoomBox
                        onZoomStep={(dir) =>
                          setOverwriteNewZoom((prev) =>
                            clampPreviewZoom(
                              prev + dir * COMPARE_PREVIEW_ZOOM_STEP
                            )
                          )
                        }
                        className="max-h-[54vh] overflow-auto p-3"
                      >
                        <div
                          className="mx-auto w-[816px]"
                          style={{ zoom: overwriteNewZoom }}
                        >
                          <ProformaPreview
                            data={proforma}
                            totals={totals}
                            mainLogo={mainLogo}
                            footerLogos={footerLogos}
                            compactReadOnly
                            idPrefix="cmp-new-"
                          />
                        </div>
                      </CtrlWheelZoomBox>
                    </div>
                  </div>
                )}
              </div>

              {/* Pie fijo con acciones siempre visibles y operativas */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E5E4DF] bg-white px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  disabled={isSendingToSheet || isClosingAndSaving}
                  onClick={() => setOverwriteSheetConfirm(null)}
                  className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-45 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSendingToSheet || isClosingAndSaving}
                  onClick={() => void executeOverwriteSendToSheet()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-amber-700 disabled:opacity-45 cursor-pointer dark:bg-amber-600 dark:hover:bg-amber-500"
                >
                  {isSendingToSheet || isClosingAndSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {isSendingToSheet || isClosingAndSaving
                      ? 'Sobrescribiendo...'
                      : overwriteSheetConfirm.closeAfterSave
                        ? 'Sí, sobrescribir y cerrar'
                        : 'Sí, sobrescribir proforma'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingDraftPdfModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="draft-pdf-choice-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-[1px] dark:bg-black/75"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
                <PdfIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2
                  id="draft-pdf-choice-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Esta proforma está en modo Borrador
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Elige si deseas generar el PDF marcado como{' '}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    Borrador
                  </strong>{' '}
                  o asignarle ahora el siguiente consecutivo disponible desde Google Sheets (PROFORMAS) y actualizar su registro antes de exportar.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                disabled={isAssigningConsecutivoForPdf}
                onClick={() => void handleAssignConsecutivoAndExportPdf()}
                className="flex w-full items-center justify-between rounded-lg border border-black bg-black px-3.5 py-2.5 text-left text-xs font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 cursor-pointer dark:border-zinc-700"
              >
                <span className="inline-flex items-center gap-2">
                  {isAssigningConsecutivoForPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Hash className="h-4 w-4 text-amber-300" aria-hidden="true" />
                  )}
                  <span>
                    {isAssigningConsecutivoForPdf
                      ? 'Asignando consecutivo y generando PDF...'
                      : 'Asignar consecutivo y generar PDF'}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-zinc-300">
                  Nº {nextConsecutivo}+
                </span>
              </button>

              <button
                type="button"
                disabled={isAssigningConsecutivoForPdf}
                onClick={() => void handleExportPdfAsDraft()}
                className="flex w-full items-center justify-between rounded-lg border border-[#DCDAD3] bg-[#FAF9F6] px-3.5 py-2.5 text-left text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                <span className="inline-flex items-center gap-2">
                  <PdfIcon className="h-4 w-4" />
                  <span>Generar PDF como Borrador</span>
                </span>
                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/60 dark:text-amber-200">
                  BORRADOR
                </span>
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={isAssigningConsecutivoForPdf}
                onClick={() => setPendingDraftPdfModal(null)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteProforma && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-proforma-dialog-title"
          className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-[1px] dark:bg-black/75"
        >
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 shadow-2xl dark:border-red-900/70 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-red-50 p-2 text-red-700 dark:bg-red-950/70 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2
                  id="delete-proforma-dialog-title"
                  className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  ¿Estás seguro que deseas eliminar la proforma del Sheet?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Se eliminará la Proforma{' '}
                  <strong className="font-mono text-zinc-900 dark:text-zinc-100">
                    {formatProformaNumberLabel(pendingDeleteProforma)}
                  </strong>{' '}
                  ({pendingDeleteProforma.data.clientProject.cliente || 'Cliente sin definir'}) del historial local y de la pestaña{' '}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    PROFORMAS
                  </strong>{' '}
                  de Google Sheets.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeletingProforma}
                onClick={() => setPendingDeleteProforma(null)}
                className="rounded-md border border-[#DCDAD3] bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingProforma}
                onClick={() => void handleConfirmDeleteProforma()}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer dark:bg-red-600 dark:hover:bg-red-500"
              >
                {isDeletingProforma ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {isDeletingProforma ? 'Eliminando...' : 'Sí, eliminar'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportFromSheetModal
        isOpen={sheetPreviewModal.isOpen}
        mode={sheetPreviewModal.mode}
        initialRecord={sheetPreviewModal.initialRecord}
        records={
          sheetPreviewModal.mode === 'history'
            ? mergedHistoryForModal
            : remoteHistory
        }
        mainLogo={mainLogo}
        footerLogos={footerLogos}
        isLoading={isSyncingRemoteHistory}
        errorMessage={
          remoteHistoryFeedback && !remoteHistoryFeedback.ok
            ? remoteHistoryFeedback.message
            : undefined
        }
        lastSyncedAt={lastRemoteHistorySyncAt}
        hasWebhookUrl={Boolean(cloudConfig.webhookUrl.trim())}
        hasUnsavedActiveChanges={
          isProformaConfirmed && hasUnsavedProformaChanges(proforma, history)
        }
        activeConsecutivo={isProformaConfirmed ? proforma.consecutivo : undefined}
        onRefreshFromSheet={() => void handleSyncHistoryFromSheet(false)}
        onGoToIntegration={() => {
          setShowIntegrationTab(true);
          saveIntegrationTabEnabled(true);
          setActiveSection('integration');
        }}
        onClose={() =>
          setSheetPreviewModal((prev) => ({ ...prev, isOpen: false }))
        }
        onConfirmImport={handleConfirmImportFromSheetRecord}
        onDuplicateRecord={handleDuplicateRecord}
        onDeleteRecord={handleRequestDeleteRecord}
      />
    </div>
  );
}
