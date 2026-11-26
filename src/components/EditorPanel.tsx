import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Copy,
  FileSpreadsheet,
  GripVertical,
  ImagePlus,
  Link2,
  Loader2,
  Maximize2,
  PanelLeft,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  CURRENCY_OPTIONS,
  DEFAULT_BANK_ACCOUNT,
  DEFAULT_NOTAS_FINALES,
  DEFAULT_OLMO_MAIN_LOGO,
  DEFAULT_PAYMENT_SCHEDULE,
  DEFAULT_SPEC_BLOCKS,
  DEFAULT_SPECS_SHEET_URL,
  DEFAULT_TERMINOS_CONDICIONES,
  PROFORMA_TYPE_OPTIONS,
} from '../data/defaults';
import {
  AranSpecTemplate,
  BankAccountInfo,
  CompanyInfo,
  ComputedTotals,
  GoogleSheetsConfig,
  LogoAsset,
  PaymentScheduleItem,
  ProductLineItem,
  ProductTemplate,
  ProformaData,
  ProformaType,
  SavedClient,
  SpecBlock,
  TerminoTemplate,
  VisualReferenceItem,
  VisualReferenceSize,
  WorkspaceLayoutMode,
} from '../types/proforma';
import { findBestTerminoForProformaType } from '../utils/cloudSync';
import { getConnectionButtonClasses } from '../utils/connectionStyles';
import {
  formatMoney,
  getCurrencyCode,
  normalizeSpreadsheetParagraphs,
  normalizeVisualReferenceSize,
} from '../utils/formatters';
import {
  DEFAULT_IMPORT_SHEET_NAME,
  fetchAndParseGoogleSheetProducts,
  GoogleSheetsImportResult,
  isSpreadsheetExcelFile,
  LoadedExcelWorkbook,
  parseUploadedSpreadsheetFile,
  parseWorkbookSheetByName,
  readExcelWorkbookFile,
  SpreadsheetSheetNotFoundError,
} from '../utils/googleSheets';
import {
  ACCEPTED_LOGO_INPUT,
  processProductImageFile,
  resolveAndValidateImageUrl,
} from '../utils/logoUtils';
import { ClientDraftPayload } from './ClientsView';
import { GoogleSheetShortcutButton } from './GoogleSheetShortcutButton';
import { ResilientImage } from './ResilientImage';

interface EditorPanelProps {
  data: ProformaData;
  totals: ComputedTotals;
  nextStoredConsecutivo: number;
  mainLogo: LogoAsset;
  footerLogos: Array<LogoAsset | null>;
  sheetsConfig: GoogleSheetsConfig;
  productTemplates: ProductTemplate[];
  savedClients: SavedClient[];
  onChange: (updater: (prev: ProformaData) => ProformaData) => void;
  onSyncNextConsecutivo: () => void;
  onSaveCompanyDefaults: (info: CompanyInfo) => void;
  onSaveBankDefaults: (info: BankAccountInfo) => void;
  onUploadMainLogo: (file: File) => void;
  onApplyMainLogoUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
  onResetMainLogo: () => void;
  onUploadFooterLogo: (slotIndex: number, file: File) => void;
  onApplyFooterLogoUrl: (
    slotIndex: number,
    url: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onRemoveFooterLogo: (slotIndex: number) => void;
  onSheetsConfigChange: (next: GoogleSheetsConfig) => void;
  onSaveProductTemplate: (item: ProductLineItem) => void;
  onDeleteProductTemplate: (templateId: string) => void;
  onSaveClientToDirectory: (
    payload: ClientDraftPayload,
    mode: 'upsert' | 'create'
  ) => void;
  onGoToClientsDirectory: () => void;
  aranTemplates: AranSpecTemplate[];
  terminosTemplates?: TerminoTemplate[];
  specsSheetUrl?: string;
  aranScriptUrl: string;
  aranLastStatus?: 'ok' | 'error';
  aranLastMessage?: string;
  isSyncingAran: boolean;
  onSyncAranTemplates: () => void;
  onGoToIntegration: () => void;
  isSplitScrollContainer?: boolean;
  layoutMode?: WorkspaceLayoutMode;
  onChangeLayoutMode?: (mode: WorkspaceLayoutMode) => void;
}

type EditorTab = 'cliente' | 'productos' | 'referencias' | 'terminos' | 'banco';

function normalizeProductSearchText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function EditorPanel({
  data,
  totals,
  nextStoredConsecutivo,
  mainLogo,
  footerLogos,
  sheetsConfig,
  productTemplates,
  savedClients,
  onChange,
  onSyncNextConsecutivo,
  onSaveCompanyDefaults,
  onSaveBankDefaults,
  onUploadMainLogo,
  onApplyMainLogoUrl,
  onResetMainLogo,
  onUploadFooterLogo,
  onApplyFooterLogoUrl,
  onRemoveFooterLogo,
  onSheetsConfigChange,
  onSaveProductTemplate,
  onDeleteProductTemplate,
  onSaveClientToDirectory,
  onGoToClientsDirectory,
  aranTemplates,
  terminosTemplates = [],
  specsSheetUrl = '',
  aranScriptUrl,
  aranLastStatus,
  aranLastMessage,
  isSyncingAran,
  onSyncAranTemplates,
  onGoToIntegration,
  isSplitScrollContainer = false,
  layoutMode = 'split',
  onChangeLayoutMode,
}: EditorPanelProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('cliente');
  const [clientFilterQuery, setClientFilterQuery] = useState('');
  const [selectedSavedClientId, setSelectedSavedClientId] = useState('');
  const [showCompanyDrawer, setShowCompanyDrawer] = useState(false);
  const [showSheetsDrawer, setShowSheetsDrawer] = useState(
    sheetsConfig.mode === 'sheets' && Boolean(sheetsConfig.sheetUrl.trim())
  );
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsStatus, setSheetsStatus] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const [pendingSheetChoice, setPendingSheetChoice] = useState<{
    error: SpreadsheetSheetNotFoundError;
    action: 'import' | 'update';
    sourceKind: 'sheets' | 'file';
  } | null>(null);
  const [loadedExcel, setLoadedExcel] = useState<LoadedExcelWorkbook | null>(
    null
  );
  const [selectedExcelSheet, setSelectedExcelSheet] = useState('');
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [visualRefError, setVisualRefError] = useState<string | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [collapsedProductIds, setCollapsedProductIds] = useState<Record<string, boolean>>({});
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [selectedAranByBlockId, setSelectedAranByBlockId] = useState<Record<string, string>>({});
  const [selectedTerminoId, setSelectedTerminoId] = useState('');

  const [mainLogoUrlInput, setMainLogoUrlInput] = useState('');
  const [mainLogoUrlLoading, setMainLogoUrlLoading] = useState(false);
  const [mainLogoUrlError, setMainLogoUrlError] = useState<string | null>(null);

  const [footerUrlInputs, setFooterUrlInputs] = useState<string[]>([
    '',
    '',
    '',
  ]);
  const [footerUrlLoading, setFooterUrlLoading] = useState<boolean[]>([
    false,
    false,
    false,
  ]);
  const [footerUrlErrors, setFooterUrlErrors] = useState<Array<string | null>>([
    null,
    null,
    null,
  ]);

  const [itemImageUrlInputs, setItemImageUrlInputs] = useState<
    Record<string, string>
  >({});
  const [itemImageLoading, setItemImageLoading] = useState<
    Record<string, boolean>
  >({});
  const [itemImageErrors, setItemImageErrors] = useState<
    Record<string, string | null>
  >({});

  const [visualRefUrlInputs, setVisualRefUrlInputs] = useState<
    Record<string, string>
  >({});
  const [visualRefLoading, setVisualRefLoading] = useState<
    Record<string, boolean>
  >({});
  const [visualRefSlotErrors, setVisualRefSlotErrors] = useState<
    Record<string, string | null>
  >({});
  const [showStarterVisualRefs, setShowStarterVisualRefs] = useState(true);
  const [draggedVisualRefId, setDraggedVisualRefId] = useState<string | null>(
    null
  );
  const [dragOverVisualRefId, setDragOverVisualRefId] = useState<string | null>(
    null
  );
  const [expandedVisualRefModal, setExpandedVisualRefModal] =
    useState<VisualReferenceItem | null>(null);

  const mainLogoInputRef = useRef<HTMLInputElement | null>(null);
  const spreadsheetFileInputRef = useRef<HTMLInputElement | null>(null);
  const footerLogoInputRefs = useRef<Array<HTMLInputElement | null>>([
    null,
    null,
    null,
  ]);
  const visualRefFileInputRefs = useRef<
    Record<string, HTMLInputElement | null>
  >({});
  const itemImageFileInputRefs = useRef<Record<string, HTMLInputElement | null>>(
    {}
  );
  const productCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const manualUnitItemIdsRef = useRef<Set<string>>(new Set());
  const editorRootRef = useRef<HTMLDivElement | null>(null);

  const handleSelectEditorTab = (nextTab: EditorTab) => {
    setActiveTab(nextTab);
    const scrollParent = editorRootRef.current?.closest('.olmo-editor-scroll');
    if (
      scrollParent instanceof HTMLElement &&
      scrollParent.scrollHeight > scrollParent.clientHeight + 8
    ) {
      if (scrollParent.scrollTop > 24) {
        scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    if (editorRootRef.current) {
      const workspaceTopRaw = getComputedStyle(
        editorRootRef.current
      ).getPropertyValue('--olmo-workspace-top');
      const workspaceTop = parseFloat(workspaceTopRaw) || 0;
      const rect = editorRootRef.current.getBoundingClientRect();
      if (rect.top < workspaceTop) {
        window.scrollTo({
          top: Math.max(0, window.scrollY + rect.top - workspaceTop - 8),
          behavior: 'smooth',
        });
      }
    }
  };

  const proformaType: ProformaType = data.proformaType ?? 'mobiliario';
  const effectiveMainLogo = mainLogo?.dataUrl ? mainLogo : DEFAULT_OLMO_MAIN_LOGO;

  const filteredProductEntries = useMemo(() => {
    const q = normalizeProductSearchText(productSearchQuery);
    return data.items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => {
        if (!q) return true;
        const haystack = normalizeProductSearchText(
          `${item.producto} ${item.descripcion}`
        );
        return haystack.includes(q);
      });
  }, [data.items, productSearchQuery]);

  const handleMainLogoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMainLogoUrlError(null);
      onUploadMainLogo(file);
    }
    e.target.value = '';
  };

  const handleLoadMainLogoUrl = async () => {
    setMainLogoUrlError(null);
    setMainLogoUrlLoading(true);
    try {
      const res = await onApplyMainLogoUrl(mainLogoUrlInput);
      if (res.ok) {
        setMainLogoUrlInput('');
      } else {
        setMainLogoUrlError(
          res.error || 'No se pudo cargar el logo desde la URL.'
        );
      }
    } finally {
      setMainLogoUrlLoading(false);
    }
  };

  const handleFooterLogoFileChange =
    (slotIndex: number) => (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setFooterUrlErrors((prev) =>
          prev.map((err, idx) => (idx === slotIndex ? null : err))
        );
        onUploadFooterLogo(slotIndex, file);
      }
      e.target.value = '';
    };

  const handleLoadFooterLogoUrl = async (slotIndex: number) => {
    const rawUrl = footerUrlInputs[slotIndex] ?? '';
    setFooterUrlErrors((prev) =>
      prev.map((err, idx) => (idx === slotIndex ? null : err))
    );
    setFooterUrlLoading((prev) =>
      prev.map((loading, idx) => (idx === slotIndex ? true : loading))
    );
    try {
      const res = await onApplyFooterLogoUrl(slotIndex, rawUrl);
      if (res.ok) {
        setFooterUrlInputs((prev) =>
          prev.map((val, idx) => (idx === slotIndex ? '' : val))
        );
      } else {
        setFooterUrlErrors((prev) =>
          prev.map((err, idx) =>
            idx === slotIndex
              ? res.error || 'No se pudo cargar el logo desde la URL.'
              : err
          )
        );
      }
    } finally {
      setFooterUrlLoading((prev) =>
        prev.map((loading, idx) => (idx === slotIndex ? false : loading))
      );
    }
  };

  const applyImportedResult = (
    result: GoogleSheetsImportResult,
    action: 'import' | 'update',
    sourceLabel: string
  ) => {
    onChange((prev) => {
      const currentItems = prev.items;
      const isOnlyEmptyRow =
        currentItems.length === 1 &&
        !currentItems[0].producto.trim() &&
        !currentItems[0].descripcion.trim() &&
        currentItems[0].valor === 0;

      if (action === 'update' && sheetsConfig.strategy === 'append') {
        const byName = new Map(
          result.items.map((it) => [it.producto.trim().toLowerCase(), it])
        );
        const matchedNames = new Set<string>();

        const updatedExisting = (isOnlyEmptyRow ? [] : currentItems).map(
          (existing) => {
            const key = existing.producto.trim().toLowerCase();
            const incoming = byName.get(key);
            if (incoming) {
              matchedNames.add(key);
              return {
                ...existing,
                descripcion: incoming.descripcion || existing.descripcion,
                cantidad: incoming.cantidad,
                unidad: incoming.unidad,
                valor: incoming.valor,
              };
            }
            return existing;
          }
        );

        const newlyAdded = result.items.filter(
          (it) => !matchedNames.has(it.producto.trim().toLowerCase())
        );

        return {
          ...prev,
          items: [...updatedExisting, ...newlyAdded],
        };
      }

      if (sheetsConfig.strategy === 'append' && !isOnlyEmptyRow) {
        return {
          ...prev,
          items: [...currentItems, ...result.items],
        };
      }

      return {
        ...prev,
        items: result.items,
      };
    });

    const sheetInfo = result.sheetNameUsed
      ? ` (hoja "${result.sheetNameUsed}")`
      : '';
    const ignoredNote =
      result.ignoredCount > 0
        ? ` (${result.ignoredCount} fila${result.ignoredCount === 1 ? '' : 's'} ignorada${result.ignoredCount === 1 ? '' : 's'} por estar vacía, tener Valor 0/no numérico o fila de totales)`
        : '';
    setSheetsStatus({
      text: `${sourceLabel}${sheetInfo}: ${result.items.length} línea${result.items.length === 1 ? '' : 's'} ${action === 'update' ? 'actualizada' : 'importada'}${result.items.length === 1 ? '' : 's'}${ignoredNote}.`,
    });
  };

  const targetSheetName =
    sheetsConfig.sheetName.trim() || DEFAULT_IMPORT_SHEET_NAME;

  const handleImportFromSheets = async (action: 'import' | 'update') => {
    setSheetsLoading(true);
    setSheetsStatus(null);
    setPendingSheetChoice(null);
    try {
      const result = await fetchAndParseGoogleSheetProducts(
        sheetsConfig.sheetUrl,
        targetSheetName
      );
      applyImportedResult(result, action, 'Google Sheets');
      onSheetsConfigChange({
        ...sheetsConfig,
        mode: 'sheets',
        lastImportedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof SpreadsheetSheetNotFoundError) {
        setPendingSheetChoice({
          error: err,
          action,
          sourceKind: 'sheets',
        });
      }
      setSheetsStatus({
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo importar desde Google Sheets.',
        isError: true,
      });
    } finally {
      setSheetsLoading(false);
    }
  };

  const handleSpreadsheetFileUpload = async (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSheetsLoading(true);
    setSheetsStatus(null);
    setPendingSheetChoice(null);
    try {
      if (isSpreadsheetExcelFile(file)) {
        const loaded = await readExcelWorkbookFile(file, targetSheetName);
        setLoadedExcel(loaded);
        setSelectedExcelSheet(loaded.defaultSheet);
        setSheetsStatus({
          text: `Archivo "${loaded.fileName}" cargado (${loaded.sheetNames.length} ${
            loaded.sheetNames.length === 1 ? 'hoja' : 'hojas'
          }). Hoja preseleccionada: "${loaded.defaultSheet}". Puedes cambiar la hoja en el desplegable y hacer clic en "Importar hoja".`,
        });
      } else {
        setLoadedExcel(null);
        setSelectedExcelSheet('');
        const result = await parseUploadedSpreadsheetFile(file, targetSheetName);
        applyImportedResult(result, 'import', `Archivo "${file.name}"`);
      }
    } catch (err) {
      if (err instanceof SpreadsheetSheetNotFoundError) {
        setPendingSheetChoice({
          error: err,
          action: 'import',
          sourceKind: 'file',
        });
      }
      setSheetsStatus({
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo leer el archivo seleccionado.',
        isError: true,
      });
    } finally {
      setSheetsLoading(false);
    }
  };

  const handleImportSelectedExcelSheet = () => {
    if (!loadedExcel) return;
    const sheetToRead = selectedExcelSheet || loadedExcel.defaultSheet;
    setSheetsStatus(null);
    try {
      const result = parseWorkbookSheetByName(
        loadedExcel.workbook,
        sheetToRead,
        `el archivo "${loadedExcel.fileName}"`
      );
      applyImportedResult(
        result,
        'import',
        `Archivo "${loadedExcel.fileName}"`
      );
    } catch (err) {
      setSheetsStatus({
        text:
          err instanceof Error
            ? err.message
            : `No se pudo leer la hoja "${sheetToRead}".`,
        isError: true,
      });
    }
  };

  const handlePickAvailableSheet = (chosenSheet: string) => {
    if (!pendingSheetChoice) return;
    try {
      const result = parseWorkbookSheetByName(
        pendingSheetChoice.error.workbook,
        chosenSheet,
        pendingSheetChoice.error.sourceLabel
      );
      applyImportedResult(
        result,
        pendingSheetChoice.action,
        pendingSheetChoice.sourceKind === 'sheets'
          ? 'Google Sheets'
          : pendingSheetChoice.error.sourceLabel
      );
      if (pendingSheetChoice.sourceKind === 'sheets') {
        onSheetsConfigChange({
          ...sheetsConfig,
          mode: 'sheets',
          lastImportedAt: new Date().toISOString(),
        });
      }
      setPendingSheetChoice(null);
    } catch (err) {
      setSheetsStatus({
        text:
          err instanceof Error
            ? err.message
            : `No se pudo leer la hoja "${chosenSheet}".`,
        isError: true,
      });
    }
  };

  const flashBanner = (msg: string) => {
    setSavedBanner(msg);
    setTimeout(() => setSavedBanner(null), 2600);
  };

  const filteredSavedClients = useMemo(() => {
    const q = clientFilterQuery.trim().toLowerCase();
    if (!q) return savedClients;
    return savedClients.filter((c) =>
      [c.cliente, c.contacto, c.telefono, c.correo, c.ubicacion]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [savedClients, clientFilterQuery]);

  const matchingSavedClientByName = useMemo(() => {
    const currentName = data.clientProject.cliente.trim().toLowerCase();
    if (!currentName) return undefined;
    return savedClients.find(
      (c) => c.cliente.trim().toLowerCase() === currentName
    );
  }, [savedClients, data.clientProject.cliente]);

  const handleSelectSavedClient = (clientId: string) => {
    setSelectedSavedClientId(clientId);
    const chosen = savedClients.find((c) => c.id === clientId);
    if (!chosen) return;
    onChange((prev) => ({
      ...prev,
      clientProject: {
        ...prev.clientProject,
        cliente: chosen.cliente,
        contacto: chosen.contacto,
        telefono: chosen.telefono,
        correo: chosen.correo,
        ubicacion: chosen.ubicacion,
      },
    }));
    flashBanner(
      `Datos de "${chosen.cliente}" cargados. Puedes editar cualquier campo para esta cotización.`
    );
  };

  const handleQuickSaveClient = (mode: 'upsert' | 'create') => {
    const cp = data.clientProject;
    if (!cp.cliente.trim()) return;
    onSaveClientToDirectory(
      {
        cliente: cp.cliente.trim(),
        contacto: cp.contacto.trim(),
        telefono: cp.telefono.trim(),
        correo: cp.correo.trim(),
        ubicacion: cp.ubicacion.trim(),
      },
      mode
    );
  };

  const updateClientProject = (
    field: keyof ProformaData['clientProject'],
    value: string
  ) => {
    onChange((prev) => ({
      ...prev,
      clientProject: {
        ...prev.clientProject,
        [field]: value,
      },
    }));
  };

  const updateCompany = (field: keyof CompanyInfo, value: string) => {
    onChange((prev) => ({
      ...prev,
      company: {
        ...prev.company,
        [field]: value,
      },
    }));
  };

  const handleChangeProformaType = (nextType: ProformaType) => {
    const matchedTermino = findBestTerminoForProformaType(
      terminosTemplates,
      nextType
    );

    onChange((prev) => {
      const prevType: ProformaType = prev.proformaType ?? 'mobiliario';
      return {
        ...prev,
        proformaType: nextType,
        ...(matchedTermino
          ? {
              terminosCondiciones: normalizeSpreadsheetParagraphs(
                matchedTermino.contenido
              ),
            }
          : {}),
        items: prev.items.map((item) => {
          if (nextType === 'cielos_pisos') {
            const qty = Number(item.cantidad) > 0 ? Number(item.cantidad) : 1;
            const unitPrice =
              typeof item.valorUnitario === 'number'
                ? item.valorUnitario
                : Number(item.valor) > 0 && qty > 0
                  ? Number((Number(item.valor) / qty).toFixed(2))
                  : 0;
            return {
              ...item,
              unidad: 'm²',
              valorUnitario: unitPrice,
            };
          }

          const trimmedUnit = item.unidad.trim();
          const isSquareMeterUnit = /^(m²|m2|m\^2)$/i.test(trimmedUnit);
          const hasManualUnit = manualUnitItemIdsRef.current.has(item.id);
          const shouldResetToDefaultUnit =
            (prevType === 'cielos_pisos' && (!hasManualUnit || isSquareMeterUnit || !trimmedUnit)) ||
            (!hasManualUnit && (isSquareMeterUnit || !trimmedUnit));

          if (shouldResetToDefaultUnit) {
            return {
              ...item,
              unidad: 'und(s)',
            };
          }

          return item;
        }),
      };
    });

    if (matchedTermino) {
      setSelectedTerminoId(matchedTermino.id);
      flashBanner(
        `Términos y condiciones actualizados desde "${matchedTermino.titulo}".`
      );
    }
  };

  const applyTerminoTemplate = (terminoId: string) => {
    setSelectedTerminoId(terminoId);
    if (!terminoId) return;
    const tpl = terminosTemplates.find((item) => item.id === terminoId);
    if (!tpl) return;
    onChange((prev) => ({
      ...prev,
      terminosCondiciones: normalizeSpreadsheetParagraphs(tpl.contenido),
    }));
    flashBanner(`Términos "${tpl.titulo}" cargados desde TERMINOS_Y_CONDICIONES.`);
  };

  const updateItem = (
    id: string,
    field: keyof ProductLineItem,
    value: string | number
  ) => {
    if (field === 'unidad') {
      const unitStr = String(value).trim();
      if (unitStr && unitStr !== 'und(s)' && !/^(m²|m2|m\^2)$/i.test(unitStr)) {
        manualUnitItemIdsRef.current.add(id);
      } else if (!unitStr || unitStr === 'und(s)') {
        manualUnitItemIdsRef.current.delete(id);
      }
    }
    onChange((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const updateCielosPisosField = (
    id: string,
    field: 'cantidad' | 'valorUnitario',
    numericValue: number
  ) => {
    onChange((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;
        const nextQty = field === 'cantidad' ? numericValue : item.cantidad;
        const nextUnit =
          field === 'valorUnitario'
            ? numericValue
            : item.valorUnitario ?? 0;
        const nextTotal = Math.round(nextQty * nextUnit * 100) / 100;
        return {
          ...item,
          cantidad: nextQty,
          unidad: 'm²',
          valorUnitario: nextUnit,
          valor: nextTotal,
        };
      }),
    }));
  };

  const handleItemImageUpload = async (itemId: string, file: File) => {
    setItemImageErrors((prev) => ({ ...prev, [itemId]: null }));
    try {
      const processed = await processProductImageFile(file);
      updateItem(itemId, 'imagen', processed.dataUrl);
      setItemImageUrlInputs((prev) => ({ ...prev, [itemId]: '' }));
      flashBanner('Imagen de producto cargada.');
    } catch (err) {
      setItemImageErrors((prev) => ({
        ...prev,
        [itemId]:
          err instanceof Error ? err.message : 'No se pudo cargar la imagen.',
      }));
    }
  };

  const handleLoadItemImageUrl = async (itemId: string, currentItemUrl?: string) => {
    const rawUrl = (
      itemImageUrlInputs[itemId] ??
      (currentItemUrl && !currentItemUrl.startsWith('data:')
        ? currentItemUrl
        : '')
    ).trim();
    setItemImageErrors((prev) => ({ ...prev, [itemId]: null }));
    setItemImageLoading((prev) => ({ ...prev, [itemId]: true }));
    try {
      const resolved = await resolveAndValidateImageUrl(rawUrl);
      updateItem(itemId, 'imagen', resolved.url);
      setItemImageUrlInputs((prev) => ({ ...prev, [itemId]: resolved.url }));
      flashBanner(
        resolved.isGoogleDrive
          ? 'Imagen de Google Drive cargada en el producto.'
          : 'Imagen desde URL cargada en el producto.'
      );
    } catch (err) {
      setItemImageErrors((prev) => ({
        ...prev,
        [itemId]:
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la imagen desde el enlace.',
      }));
    } finally {
      setItemImageLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const starterVisualRefs: VisualReferenceItem[] = [
    {
      id: 'vref-starter-0',
      slotIndex: 0,
      imageDataUrl: '',
      caption: '',
      size: 'medium',
    },
    {
      id: 'vref-starter-1',
      slotIndex: 1,
      imageDataUrl: '',
      caption: '',
      size: 'medium',
    },
  ];

  const getMaterializedVisualRefs = (
    list: VisualReferenceItem[] | undefined
  ): VisualReferenceItem[] => {
    if (Array.isArray(list) && list.length > 0) {
      return [...list]
        .sort((a, b) => a.slotIndex - b.slotIndex)
        .map((item, idx) => ({
          ...item,
          slotIndex: idx,
          size: normalizeVisualReferenceSize(item.size),
        }));
    }
    return showStarterVisualRefs
      ? starterVisualRefs.map((item) => ({ ...item }))
      : [];
  };

  const editorVisualRefs = getMaterializedVisualRefs(data.visualReferences);

  const upsertVisualRefPatch = (
    refId: string,
    patch: Partial<VisualReferenceItem>
  ) => {
    onChange((prev) => {
      const list = getMaterializedVisualRefs(prev.visualReferences);
      const next = list.map((item, idx) =>
        item.id === refId
          ? {
              ...item,
              ...patch,
              slotIndex: idx,
            }
          : { ...item, slotIndex: idx }
      );
      return { ...prev, visualReferences: next };
    });
  };

  const handleAddVisualRefSlot = () => {
    setVisualRefError(null);
    setShowStarterVisualRefs(true);
    onChange((prev) => {
      const list = getMaterializedVisualRefs(prev.visualReferences);
      const newSlot: VisualReferenceItem = {
        id: `vref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        slotIndex: list.length,
        imageDataUrl: '',
        caption: '',
        size: 'medium',
      };
      return { ...prev, visualReferences: [...list, newSlot] };
    });
  };

  const handleVisualRefUpload = async (refId: string, file: File) => {
    setVisualRefError(null);
    setVisualRefSlotErrors((prev) => ({ ...prev, [refId]: null }));
    try {
      const processed = await processProductImageFile(file);
      upsertVisualRefPatch(refId, {
        imageDataUrl: processed.dataUrl,
        name: processed.name,
      });
      setVisualRefUrlInputs((prev) => ({ ...prev, [refId]: '' }));
    } catch (err) {
      setVisualRefSlotErrors((prev) => ({
        ...prev,
        [refId]:
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la imagen.',
      }));
    }
  };

  const handleLoadVisualRefUrl = async (refId: string, slotPos: number) => {
    const rawUrl = visualRefUrlInputs[refId] ?? '';
    setVisualRefError(null);
    setVisualRefSlotErrors((prev) => ({ ...prev, [refId]: null }));
    setVisualRefLoading((prev) => ({ ...prev, [refId]: true }));
    try {
      const resolved = await resolveAndValidateImageUrl(rawUrl);
      upsertVisualRefPatch(refId, {
        imageDataUrl: resolved.url,
        name: resolved.name,
      });
      setVisualRefUrlInputs((prev) => ({ ...prev, [refId]: resolved.url }));
      flashBanner(
        resolved.isGoogleDrive
          ? `Referencia ${slotPos + 1} cargada desde Google Drive.`
          : `Referencia ${slotPos + 1} cargada desde enlace.`
      );
    } catch (err) {
      setVisualRefSlotErrors((prev) => ({
        ...prev,
        [refId]:
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la imagen desde la URL.',
      }));
    } finally {
      setVisualRefLoading((prev) => ({ ...prev, [refId]: false }));
    }
  };

  const handleVisualRefCaptionChange = (refId: string, caption: string) => {
    upsertVisualRefPatch(refId, { caption });
  };

  const handleVisualRefSizeChange = (
    refId: string,
    size: VisualReferenceSize
  ) => {
    upsertVisualRefPatch(refId, { size });
  };

  const handleClearVisualRefImage = (refId: string) => {
    setVisualRefError(null);
    setVisualRefSlotErrors((prev) => ({ ...prev, [refId]: null }));
    setVisualRefUrlInputs((prev) => ({ ...prev, [refId]: '' }));
    upsertVisualRefPatch(refId, { imageDataUrl: '', name: '' });
  };

  const handleDeleteVisualRefSlot = (refId: string) => {
    setVisualRefError(null);
    setVisualRefSlotErrors((prev) => ({ ...prev, [refId]: null }));
    setVisualRefUrlInputs((prev) => ({ ...prev, [refId]: '' }));
    const current = editorVisualRefs;
    const remaining = current
      .filter((r) => r.id !== refId)
      .map((item, idx) => ({ ...item, slotIndex: idx }));
    if (remaining.length === 0) {
      setShowStarterVisualRefs(false);
    }
    onChange((prev) => ({
      ...prev,
      visualReferences: remaining,
    }));
  };

  const handleReorderVisualRefs = (fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    onChange((prev) => {
      const list = getMaterializedVisualRefs(prev.visualReferences);
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
  };

  const moveVisualRefByStep = (refId: string, delta: -1 | 1) => {
    const idx = editorVisualRefs.findIndex((r) => r.id === refId);
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || targetIdx >= editorVisualRefs.length) return;
    handleReorderVisualRefs(refId, editorVisualRefs[targetIdx].id);
  };

  const addItem = (presetName = '') => {
    const newItem: ProductLineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      producto: presetName,
      descripcion: '',
      cantidad: 1,
      unidad: proformaType === 'cielos_pisos' ? 'm²' : 'und(s)',
      valor: 0,
      valorUnitario: proformaType === 'cielos_pisos' ? 0 : undefined,
      imagen: '',
    };
    if (productSearchQuery.trim()) {
      setProductSearchQuery('');
    }
    onChange((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const toggleProductCollapsed = (itemId: string) => {
    setCollapsedProductIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const handleCollapseAllProducts = () => {
    const next: Record<string, boolean> = {};
    data.items.forEach((item) => {
      next[item.id] = true;
    });
    setCollapsedProductIds(next);
  };

  const handleExpandAllProducts = () => {
    setCollapsedProductIds({});
  };

  const handleJumpToProduct = (itemId: string) => {
    const wasCollapsed = Boolean(collapsedProductIds[itemId]);
    if (wasCollapsed) {
      setCollapsedProductIds((prev) => ({
        ...prev,
        [itemId]: false,
      }));
    }
    setHighlightedProductId(itemId);
    window.setTimeout(() => {
      setHighlightedProductId((current) => (current === itemId ? null : current));
    }, 1500);

    const scrollNow = () => {
      const el = productCardRefs.current[itemId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    if (wasCollapsed) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(scrollNow);
      });
    } else {
      scrollNow();
    }
  };

  const applyTemplate = (tpl: ProductTemplate) => {
    const newItem: ProductLineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      producto: tpl.producto,
      descripcion: tpl.descripcion,
      cantidad: tpl.cantidad > 0 ? tpl.cantidad : 1,
      unidad:
        proformaType === 'cielos_pisos' ? 'm²' : tpl.unidad || 'und(s)',
      valor: tpl.valor >= 0 ? tpl.valor : 0,
      valorUnitario: tpl.valorUnitario,
      imagen: tpl.imagen,
    };
    onChange((prev) => {
      const isOnlyEmptyRow =
        prev.items.length === 1 &&
        !prev.items[0].producto.trim() &&
        !prev.items[0].descripcion.trim() &&
        prev.items[0].valor === 0;
      return {
        ...prev,
        items: isOnlyEmptyRow ? [newItem] : [...prev.items, newItem],
      };
    });
  };

  const duplicateItem = (index: number) => {
    const source = data.items[index];
    if (!source) return;
    const copy: ProductLineItem = {
      ...source,
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      producto: `${source.producto} (Copia)`,
    };
    onChange((prev) => {
      const next = [...prev.items];
      next.splice(index + 1, 0, copy);
      return { ...prev, items: next };
    });
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= data.items.length) return;
    onChange((prev) => {
      const next = [...prev.items];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return { ...prev, items: next };
    });
  };

  const removeItem = (id: string) => {
    onChange((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  };

  const updateSpecBlock = (
    id: string,
    field: keyof SpecBlock,
    value: string
  ) => {
    onChange((prev) => ({
      ...prev,
      specBlocks: prev.specBlocks.map((b) =>
        b.id === id ? { ...b, [field]: value } : b
      ),
    }));
  };

  const addSpecBlock = () => {
    const newBlock: SpecBlock = {
      id: `spec-${Date.now()}`,
      titulo: 'Nueva Sección Técnica',
      subtitulo: 'Detalles de materiales y acabados',
      contenido: '• Detalle técnico o exclusión del mobiliario...',
    };
    onChange((prev) => ({
      ...prev,
      specBlocks: [...prev.specBlocks, newBlock],
    }));
  };

  const removeSpecBlock = (id: string) => {
    setSelectedAranByBlockId((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    onChange((prev) => ({
      ...prev,
      specBlocks: prev.specBlocks.filter((b) => b.id !== id),
    }));
  };

  const applyAranTemplateToBlock = (blockId: string, templateId: string) => {
    setSelectedAranByBlockId((prev) => ({
      ...prev,
      [blockId]: templateId,
    }));
    if (!templateId) return;
    const tpl = aranTemplates.find((item) => item.id === templateId);
    if (!tpl) return;

    onChange((prev) => ({
      ...prev,
      specBlocks: prev.specBlocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              titulo: tpl.titulo,
              subtitulo: tpl.subtitulo,
              contenido: normalizeSpreadsheetParagraphs(tpl.contenido),
            }
          : b
      ),
    }));
    flashBanner(`Plantilla "${tpl.titulo}" aplicada desde ESPECIFICACIONES.`);
  };

  const addSpecBlockFromAran = (templateId: string) => {
    if (!templateId) return;
    const tpl = aranTemplates.find((item) => item.id === templateId);
    if (!tpl) return;
    const newId = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newBlock: SpecBlock = {
      id: newId,
      titulo: tpl.titulo,
      subtitulo: tpl.subtitulo,
      contenido: normalizeSpreadsheetParagraphs(tpl.contenido),
    };
    setSelectedAranByBlockId((prev) => ({
      ...prev,
      [newId]: tpl.id,
    }));
    onChange((prev) => ({
      ...prev,
      specBlocks: [...prev.specBlocks, newBlock],
    }));
    flashBanner(`Bloque "${tpl.titulo}" agregado desde ESPECIFICACIONES.`);
  };

  const updateBank = (field: keyof BankAccountInfo, value: string) => {
    onChange((prev) => ({
      ...prev,
      bankAccount: {
        ...prev.bankAccount,
        [field]: value,
      },
    }));
  };

  const updatePaymentRow = (
    id: string,
    field: keyof PaymentScheduleItem,
    value: string | number
  ) => {
    onChange((prev) => ({
      ...prev,
      paymentSchedule: prev.paymentSchedule.map((row) =>
        row.id === id ? { ...row, [field]: value } : row
      ),
    }));
  };

  const addPaymentRow = () => {
    onChange((prev) => ({
      ...prev,
      paymentSchedule: [
        ...prev.paymentSchedule,
        {
          id: `pago-${Date.now()}`,
          concepto: `${prev.paymentSchedule.length + 1}° Pago — Hito adicional`,
          porcentaje: 0,
        },
      ],
    }));
  };

  const removePaymentRow = (id: string) => {
    onChange((prev) => ({
      ...prev,
      paymentSchedule: prev.paymentSchedule.filter((r) => r.id !== id),
    }));
  };

  const inputClass =
    'w-full rounded-md border border-[#DCDAD3] bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500';
  const labelClass =
    'mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400';

  const isSheetsImportReady =
    Boolean(sheetsConfig.sheetUrl.trim()) && !sheetsStatus?.isError;
  const isExcelFileImportReady =
    Boolean(loadedExcel) || (sheetsStatus !== null && !sheetsStatus.isError);
  const isExcelSheetReady =
    Boolean(selectedExcelSheet.trim()) && !sheetsStatus?.isError;
  const isAranConnected =
    Boolean(aranScriptUrl.trim()) && aranLastStatus !== 'error';

  const activeVisualRefsCount = (data.visualReferences ?? []).filter((r) =>
    r.imageDataUrl.trim()
  ).length;

  const tabs: Array<{ id: EditorTab; label: string }> = [
    { id: 'cliente', label: '1. Cliente y Proyecto' },
    { id: 'productos', label: `2. Productos (${data.items.length})` },
    {
      id: 'referencias',
      label:
        activeVisualRefsCount > 0
          ? `3. Referencias Visuales (${activeVisualRefsCount})`
          : '3. Referencias Visuales',
    },
    { id: 'terminos', label: '4. Términos y Acabados' },
    { id: 'banco', label: '5. Banco y Pagos' },
  ];

  return (
    <div
      ref={editorRootRef}
      className="flex flex-col rounded-xl border border-[#E3E1DA] bg-white shadow-[0_1px_3px_rgba(24,24,27,0.04)] transition-all duration-150 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none"
    >
      {/* Selector Dividido / Solo Editor centrado encima + sub-pestañas sticky del formulario */}
      <div
        className={`sticky z-10 rounded-t-xl border-b border-[#E5E4DF] bg-[#FAF9F6] shadow-[0_1px_2px_rgba(24,24,27,0.03)] dark:border-zinc-800 dark:bg-zinc-900 ${
          isSplitScrollContainer
            ? 'top-[var(--olmo-workspace-top,0px)] xl:top-0'
            : 'top-[var(--olmo-workspace-top,0px)]'
        }`}
      >
        {onChangeLayoutMode && (
          <div className="hidden xl:flex items-center justify-center border-b border-[#ECEAE3] px-3 py-1.5 dark:border-zinc-800">
            <div
              role="group"
              aria-label="Modo de vista del editor"
              className="inline-flex items-center rounded-md border border-[#E5E4DF] bg-white p-0.5 shadow-2xs dark:border-zinc-700 dark:bg-zinc-950"
            >
              <button
                type="button"
                onClick={() => onChangeLayoutMode('split')}
                aria-pressed={layoutMode === 'split'}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  layoutMode === 'split'
                    ? 'bg-[#FAF6F1] font-semibold text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Dividido</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeLayoutMode('editor')}
                aria-pressed={layoutMode === 'editor'}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  layoutMode === 'editor'
                    ? 'bg-[#FAF6F1] font-semibold text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Solo Editor</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto px-2.5 py-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectEditorTab(tab.id)}
                className={`rounded-lg px-3 py-2 text-xs whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C5A32] dark:focus-visible:ring-amber-500 ${
                  active
                    ? 'border border-[#DCDAD3] border-b-2 border-b-[#8C5A32] bg-white font-semibold text-zinc-900 shadow-xs dark:border-zinc-700 dark:border-b-amber-500 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'border border-transparent font-medium text-zinc-600 hover:bg-white/75 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {savedBanner && (
        <div className="flex items-center gap-2 border-b border-[#E5E4DF] bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800 dark:border-zinc-800 dark:bg-emerald-950/70 dark:text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{savedBanner}</span>
        </div>
      )}

      <div className="p-5 sm:p-6">
        {/* ================================================================
            TAB 1: CLIENTE, PROYECTO, CONSECUTIVO Y CONFIGURACIÓN
            ================================================================ */}
        {activeTab === 'cliente' && (
          <div className="space-y-6">
            {/* Consecutivo, tipo y parámetros generales */}
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Control de Consecutivo, Tipo y Moneda
                </h2>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  Siguiente disponible en navegador: Nº {nextStoredConsecutivo}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-4 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div>
                  <label htmlFor="consecutivo-input" className={labelClass}>
                    Nº de Proforma (Consecutivo)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      id="consecutivo-input"
                      type="number"
                      min={1}
                      value={data.consecutivo}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        onChange((prev) => ({
                          ...prev,
                          consecutivo: Number.isNaN(val) ? 2800 : Math.max(1, val),
                        }));
                      }}
                      className={`${inputClass} font-mono font-semibold tabular-nums`}
                    />
                    <button
                      type="button"
                      onClick={onSyncNextConsecutivo}
                      title="Asignar siguiente consecutivo automático"
                      className="rounded-md border border-[#DCDAD3] bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Auto
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="proforma-type-select" className={labelClass}>
                    Tipo de Proforma
                  </label>
                  <select
                    id="proforma-type-select"
                    value={proformaType}
                    onChange={(e) =>
                      handleChangeProformaType(e.target.value as ProformaType)
                    }
                    className={`${inputClass} font-medium`}
                  >
                    {PROFORMA_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="moneda-select" className={labelClass}>
                    Moneda
                  </label>
                  <select
                    id="moneda-select"
                    value={
                      CURRENCY_OPTIONS.includes(data.clientProject.moneda)
                        ? data.clientProject.moneda
                        : 'CUSTOM'
                    }
                    onChange={(e) => {
                      if (e.target.value !== 'CUSTOM') {
                        updateClientProject('moneda', e.target.value);
                      }
                    }}
                    className={inputClass}
                  >
                    {CURRENCY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    {!CURRENCY_OPTIONS.includes(data.clientProject.moneda) && (
                      <option value="CUSTOM">
                        {data.clientProject.moneda}
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor="tax-rate-input" className={labelClass}>
                    Impuesto de Venta (%)
                  </label>
                  <input
                    id="tax-rate-input"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={data.taxRate}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onChange((prev) => ({
                        ...prev,
                        taxRate: Number.isNaN(val) ? 0 : Math.max(0, val),
                      }));
                    }}
                    className={`${inputClass} font-mono tabular-nums`}
                  />
                </div>
              </div>
            </div>

            {/* Datos del Cliente y Proyecto */}
            <div className="border-t border-[#E5E4DF] pt-5 dark:border-zinc-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Datos del Cliente y Proyecto
                </h2>
                <button
                  type="button"
                  onClick={onGoToClientsDirectory}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8C5A32] hover:underline dark:text-amber-400 cursor-pointer"
                >
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    Directorio ({savedClients.length})
                  </span>
                </button>
              </div>

              {/* Selector rápido y buscador de Clientes Guardados */}
              <div className="mb-4 rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-3.5 space-y-2.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Clientes guardados
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {matchingSavedClientByName ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleQuickSaveClient('upsert')}
                          className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                          <CheckCircle2
                            className="h-3 w-3 text-[#8C5A32] dark:text-amber-400"
                            aria-hidden="true"
                          />
                          <span>Actualizar en directorio</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickSaveClient('create')}
                          className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                          <UserPlus
                            className="h-3 w-3 text-[#8C5A32] dark:text-amber-400"
                            aria-hidden="true"
                          />
                          <span>Crear nuevo cliente desde estos datos</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!data.clientProject.cliente.trim()}
                        onClick={() => handleQuickSaveClient('create')}
                        title={
                          data.clientProject.cliente.trim()
                            ? 'Crear nuevo cliente en el directorio con estos datos'
                            : 'Ingresa al menos el nombre del cliente para guardarlo'
                        }
                        className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <UserPlus
                          className="h-3 w-3 text-[#8C5A32] dark:text-amber-400"
                          aria-hidden="true"
                        />
                        <span>Guardar en directorio</span>
                      </button>
                    )}
                  </div>
                </div>

                {savedClients.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Aún no hay clientes guardados. Completa los campos abajo y usa &ldquo;Guardar en directorio&rdquo; o crea registros en la pestaña{' '}
                    <button
                      type="button"
                      onClick={onGoToClientsDirectory}
                      className="font-semibold text-[#8C5A32] hover:underline dark:text-amber-400 cursor-pointer"
                    >
                      Clientes
                    </button>
                    .
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <div className="relative sm:col-span-5">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        aria-label="Buscar cliente guardado"
                        placeholder="Filtrar cliente guardado..."
                        value={clientFilterQuery}
                        onChange={(e) => setClientFilterQuery(e.target.value)}
                        className="w-full rounded-md border border-[#DCDAD3] bg-white py-1.5 pl-8 pr-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
                      />
                    </div>
                    <div className="sm:col-span-7">
                      <select
                        aria-label="Seleccionar cliente guardado"
                        value={selectedSavedClientId}
                        onChange={(e) =>
                          handleSelectSavedClient(e.target.value)
                        }
                        className="w-full rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500"
                      >
                        <option value="">
                          {filteredSavedClients.length === 0
                            ? 'Sin coincidencias en clientes guardados'
                            : `— Elegir cliente guardado (${filteredSavedClients.length}) —`}
                        </option>
                        {filteredSavedClients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.cliente}
                            {client.contacto ? ` · ${client.contacto}` : ''}
                            {client.ubicacion ? ` (${client.ubicacion})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cliente-input" className={labelClass}>
                    Cliente
                  </label>
                  <input
                    id="cliente-input"
                    type="text"
                    placeholder="Nombre del cliente o razón social"
                    value={data.clientProject.cliente}
                    onChange={(e) =>
                      updateClientProject('cliente', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="contacto-input" className={labelClass}>
                    Contacto
                  </label>
                  <input
                    id="contacto-input"
                    type="text"
                    placeholder="Nombre de contacto / arquitecto"
                    value={data.clientProject.contacto}
                    onChange={(e) =>
                      updateClientProject('contacto', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="tel-input" className={labelClass}>
                    Teléfono
                  </label>
                  <input
                    id="tel-input"
                    type="tel"
                    placeholder="+506 8800-0000"
                    value={data.clientProject.telefono}
                    onChange={(e) =>
                      updateClientProject('telefono', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="correo-input" className={labelClass}>
                    Correo electrónico
                  </label>
                  <input
                    id="correo-input"
                    type="email"
                    placeholder="correo@cliente.com"
                    value={data.clientProject.correo}
                    onChange={(e) =>
                      updateClientProject('correo', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="proyecto-input" className={labelClass}>
                    Proyecto
                  </label>
                  <input
                    id="proyecto-input"
                    type="text"
                    placeholder="Ej. Residencia N1 — Cocina, Isla, Mudroom y Lavandería"
                    value={data.clientProject.proyecto}
                    onChange={(e) =>
                      updateClientProject('proyecto', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="ubicacion-input" className={labelClass}>
                    Ubicación
                  </label>
                  <input
                    id="ubicacion-input"
                    type="text"
                    placeholder="Provincia, cantón o condominio"
                    value={data.clientProject.ubicacion}
                    onChange={(e) =>
                      updateClientProject('ubicacion', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="fecha-input" className={labelClass}>
                    Fecha de Emisión
                  </label>
                  <input
                    id="fecha-input"
                    type="date"
                    value={data.clientProject.fecha}
                    onChange={(e) =>
                      updateClientProject('fecha', e.target.value)
                    }
                    className={`${inputClass} font-mono tabular-nums`}
                  />
                </div>

                <div>
                  <label htmlFor="validez-input" className={labelClass}>
                    Validez de la Proforma
                  </label>
                  <input
                    id="validez-input"
                    type="text"
                    placeholder="15 Días"
                    value={data.clientProject.validez}
                    onChange={(e) =>
                      updateClientProject('validez', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Logos de Encabezado y Pie de Página */}
            <div className="border-t border-[#E5E4DF] pt-5 space-y-4 dark:border-zinc-800">
              <div>
                <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Logos de la Proforma
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  El logo principal de OLMO B.N. permanece fijo en el encabezado. Los logos adicionales del pie de página son opcionales y se guardan en este navegador.
                </p>
              </div>

              <input
                ref={mainLogoInputRef}
                type="file"
                accept={ACCEPTED_LOGO_INPUT}
                onChange={handleMainLogoFileChange}
                className="hidden"
                aria-label="Reemplazar logo principal de OLMO"
              />

              {/* Logo Principal OLMO B.N. (Fijo por defecto) */}
              <div className="rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-3.5 space-y-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-32 shrink-0 items-center justify-center rounded border border-[#DCDAD3] bg-white px-2 dark:border-zinc-700">
                      <ResilientImage
                        src={effectiveMainLogo.dataUrl}
                        alt={effectiveMainLogo.name || 'OLMO B.N.'}
                        crossOrigin="anonymous"
                        className="max-h-11 max-w-full w-auto h-auto object-contain"
                        fallback={
                          <img
                            src={DEFAULT_OLMO_MAIN_LOGO.dataUrl}
                            alt="OLMO B.N."
                            crossOrigin="anonymous"
                            className="max-h-11 max-w-full w-auto h-auto object-contain"
                          />
                        }
                      />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        Logo Principal — {effectiveMainLogo.name || 'OLMO B.N.'}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Fijo por defecto en encabezado y PDF
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {effectiveMainLogo.id !== DEFAULT_OLMO_MAIN_LOGO.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setMainLogoUrlError(null);
                          onResetMainLogo();
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>Restaurar OLMO B.N.</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => mainLogoInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      <Upload className="h-3 w-3 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                      <span>Subir archivo</span>
                    </button>
                  </div>
                </div>

                {/* URL o Google Drive para Logo Principal */}
                <div className="border-t border-[#E5E4DF] pt-2.5 dark:border-zinc-800">
                  <label
                    htmlFor="main-logo-url-input"
                    className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    O cargar logo principal desde URL / Google Drive
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="main-logo-url-input"
                      type="url"
                      placeholder="https://... o enlace de Google Drive"
                      value={mainLogoUrlInput}
                      onChange={(e) => {
                        setMainLogoUrlInput(e.target.value);
                        if (mainLogoUrlError) setMainLogoUrlError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleLoadMainLogoUrl();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
                    />
                    <button
                      type="button"
                      disabled={mainLogoUrlLoading}
                      onClick={handleLoadMainLogoUrl}
                      className="inline-flex items-center gap-1 rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {mainLogoUrlLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Link2 className="h-3 w-3 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
                      )}
                      <span>Aplicar URL</span>
                    </button>
                  </div>
                  {mainLogoUrlError && (
                    <p className="mt-1.5 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                      {mainLogoUrlError}
                    </p>
                  )}
                </div>
              </div>

              {/* Hasta 3 Logos Adicionales en Pie de Página */}
              <div className="rounded-lg border border-[#E5E4DF] bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="mb-3">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Logos Adicionales en Pie de Página (hasta 3)
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Marcas, líneas o aliados opcionales (desde PC o URL / Google Drive). Los espacios sin imagen no aparecen en la vista previa ni en el PDF.
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {[0, 1, 2].map((slotIdx) => {
                    const slotLogo = footerLogos[slotIdx] ?? null;
                    const slotUrlErr = footerUrlErrors[slotIdx];
                    const slotLoading = footerUrlLoading[slotIdx];
                    return (
                      <div
                        key={slotIdx}
                        className="flex flex-col justify-between rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-2.5 space-y-2 dark:border-zinc-800 dark:bg-zinc-800/50"
                      >
                        <input
                          ref={(el) => {
                            footerLogoInputRefs.current[slotIdx] = el;
                          }}
                          type="file"
                          accept={ACCEPTED_LOGO_INPUT}
                          onChange={handleFooterLogoFileChange(slotIdx)}
                          className="hidden"
                          aria-label={`Cargar logo adicional de pie de página ${slotIdx + 1}`}
                        />

                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            Espacio {slotIdx + 1}
                          </span>
                          {slotLogo && (
                            <button
                              type="button"
                              onClick={() => {
                                setFooterUrlErrors((prev) =>
                                  prev.map((err, i) =>
                                    i === slotIdx ? null : err
                                  )
                                );
                                onRemoveFooterLogo(slotIdx);
                              }}
                              title={`Quitar logo ${slotIdx + 1}`}
                              aria-label={`Quitar logo ${slotIdx + 1}`}
                              className="rounded p-0.5 text-zinc-400 hover:bg-red-50 hover:text-red-700 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex h-12 items-center justify-center rounded border border-[#E5E4DF] bg-white px-2 dark:border-zinc-700">
                          {slotLogo ? (
                            <ResilientImage
                              src={slotLogo.dataUrl}
                              alt={slotLogo.name || `Logo pie ${slotIdx + 1}`}
                              crossOrigin="anonymous"
                              className="max-h-9 max-w-full w-auto h-auto object-contain"
                              fallback={
                                <span className="text-[10px] text-amber-700">
                                  Enlace no disponible
                                </span>
                              }
                            />
                          ) : (
                            <span className="text-[10.5px] text-zinc-400">
                              Sin imagen
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            footerLogoInputRefs.current[slotIdx]?.click()
                          }
                          className="inline-flex w-full items-center justify-center gap-1 rounded border border-[#DCDAD3] bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                          <ImagePlus className="h-3 w-3 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
                          <span>{slotLogo ? 'Cambiar archivo' : 'Subir archivo'}</span>
                        </button>

                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <input
                              type="url"
                              aria-label={`URL de imagen para logo pie ${slotIdx + 1}`}
                              placeholder="URL o Google Drive..."
                              value={footerUrlInputs[slotIdx] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFooterUrlInputs((prev) =>
                                  prev.map((v, i) => (i === slotIdx ? val : v))
                                );
                                if (slotUrlErr) {
                                  setFooterUrlErrors((prev) =>
                                    prev.map((err, i) =>
                                      i === slotIdx ? null : err
                                    )
                                  );
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleLoadFooterLogoUrl(slotIdx);
                                }
                              }}
                              className="min-w-0 flex-1 rounded border border-[#DCDAD3] bg-white px-2 py-1 text-[11px] text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
                            />
                            <button
                              type="button"
                              disabled={slotLoading}
                              onClick={() => handleLoadFooterLogoUrl(slotIdx)}
                              title="Cargar logo desde URL"
                              className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 shrink-0 cursor-pointer"
                            >
                              {slotLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Link2 className="h-3 w-3 text-[#8C5A32] dark:text-amber-400" />
                              )}
                              <span>Cargar</span>
                            </button>
                          </div>
                          {slotUrlErr && (
                            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                              {slotUrlErr}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Datos de la Empresa (Acordeón discreto) */}
            <div className="border-t border-[#E5E4DF] pt-5 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowCompanyDrawer((v) => !v)}
                className="flex w-full items-center justify-between rounded-md border border-[#E5E4DF] bg-[#FAF9F6] px-4 py-2.5 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-100 transition-colors dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                  <span>
                    Datos del Estudio Emisor
                    {data.company.nombreComercial.trim()
                      ? ` (${data.company.nombreComercial.trim()})`
                      : ''}
                  </span>
                </span>
                {showCompanyDrawer ? (
                  <ChevronUp className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                )}
              </button>

              {showCompanyDrawer && (
                <div className="mt-3 space-y-4 rounded-lg border border-[#E5E4DF] p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Nombre Comercial</label>
                      <input
                        type="text"
                        value={data.company.nombreComercial}
                        onChange={(e) =>
                          updateCompany('nombreComercial', e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Razón Social</label>
                      <input
                        type="text"
                        value={data.company.razonSocial}
                        onChange={(e) =>
                          updateCompany('razonSocial', e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Cédula Jurídica</label>
                      <input
                        type="text"
                        value={data.company.cedulaJuridica}
                        onChange={(e) =>
                          updateCompany('cedulaJuridica', e.target.value)
                        }
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Teléfono</label>
                      <input
                        type="text"
                        value={data.company.telefono}
                        onChange={(e) =>
                          updateCompany('telefono', e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Correo</label>
                      <input
                        type="email"
                        value={data.company.correo}
                        placeholder="Opcional"
                        onChange={(e) =>
                          updateCompany('correo', e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Sitio Web</label>
                      <input
                        type="text"
                        value={data.company.sitioWeb}
                        placeholder="Opcional"
                        onChange={(e) =>
                          updateCompany('sitioWeb', e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Dirección</label>
                      <input
                        type="text"
                        value={data.company.direccion}
                        onChange={(e) =>
                          updateCompany('direccion', e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        onSaveCompanyDefaults(data.company);
                        flashBanner(
                          'Datos de empresa guardados como predeterminados.'
                        );
                      }}
                      className="rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      Guardar como predeterminado
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================
            TAB 2: CONSTRUCTOR DINÁMICO DE LÍNEAS DE PRODUCTO
            ================================================================ */}
        {activeTab === 'productos' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Líneas de Producto y Alcance
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Agrega, duplica, reordena o edita los ítems cotizados según el tipo de proforma.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Tipo de Proforma"
                  value={proformaType}
                  onChange={(e) =>
                    handleChangeProformaType(e.target.value as ProformaType)
                  }
                  className="rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-2 text-xs font-medium text-zinc-800 focus:border-[#8C5A32] focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:focus:border-amber-500"
                >
                  {PROFORMA_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      Tipo: {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => addItem()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar Ítem</span>
                </button>
              </div>
            </div>

            {/* Panel opcional plegable: Importar desde Google Sheets / Excel */}
            <div className="rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] dark:border-zinc-800 dark:bg-zinc-800/40">
              <button
                type="button"
                onClick={() => setShowSheetsDrawer((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-100/70 transition-colors dark:text-zinc-200 dark:hover:bg-zinc-800/70 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <FileSpreadsheet
                    className={`h-4 w-4 ${
                      isSheetsImportReady || isExcelFileImportReady
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span>Importar desde Google Sheets / Excel</span>
                  <span className="rounded border border-[#DCDAD3] bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                    Opcional
                  </span>
                </span>
                {showSheetsDrawer ? (
                  <ChevronUp className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                )}
              </button>

              {showSheetsDrawer && (
                <div className="space-y-4 border-t border-[#E5E4DF] bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <input
                    ref={spreadsheetFileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={handleSpreadsheetFileUpload}
                    className="hidden"
                    aria-label="Subir archivo CSV o Excel (.xlsx)"
                  />

                  {/* Elegir Reemplazar o Agregar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#E5E4DF] bg-[#FAF9F6] px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-800/60">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      Al importar filas:
                    </span>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="sheets-strategy"
                          checked={sheetsConfig.strategy === 'replace'}
                          onChange={() =>
                            onSheetsConfigChange({
                              ...sheetsConfig,
                              strategy: 'replace',
                            })
                          }
                          className="accent-[#8C5A32]"
                        />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          Reemplazar líneas actuales
                        </span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="sheets-strategy"
                          checked={sheetsConfig.strategy === 'append'}
                          onChange={() =>
                            onSheetsConfigChange({
                              ...sheetsConfig,
                              strategy: 'append',
                            })
                          }
                          className="accent-[#8C5A32]"
                        />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          Agregar a las líneas existentes
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Nombre de pestaña configurable (EXPORTACION por defecto) */}
                  <div className="rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-[210px] flex-1">
                        <label
                          htmlFor="gsheets-sheetname-input"
                          className={labelClass}
                        >
                          Nombre de la hoja / pestaña a leer (Excel y Google Sheets)
                        </label>
                        <input
                          id="gsheets-sheetname-input"
                          type="text"
                          placeholder={DEFAULT_IMPORT_SHEET_NAME}
                          value={sheetsConfig.sheetName}
                          onChange={(e) =>
                            onSheetsConfigChange({
                              ...sheetsConfig,
                              sheetName: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </div>
                      {sheetsConfig.sheetName.trim().toUpperCase() !==
                        DEFAULT_IMPORT_SHEET_NAME && (
                        <button
                          type="button"
                          onClick={() =>
                            onSheetsConfigChange({
                              ...sheetsConfig,
                              sheetName: DEFAULT_IMPORT_SHEET_NAME,
                            })
                          }
                          className="rounded-md border border-[#DCDAD3] bg-white px-2.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                          Usar EXPORTACION
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Por defecto busca la hoja{' '}
                      <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                        EXPORTACION
                      </span>{' '}
                      sin importar su orden (insensible a mayúsculas y espacios extra). Los CSV publicados sin pestañas se leen directamente.
                    </p>
                  </div>

                  {/* Opción A: URL de Google Sheets */}
                  <div className="space-y-2.5">
                    <div>
                      <label
                        htmlFor="gsheets-url-input"
                        className={labelClass}
                      >
                        Enlace de Google Sheets (enlace normal o publicado como CSV)
                      </label>
                      <input
                        id="gsheets-url-input"
                        type="url"
                        placeholder="https://docs.google.com/spreadsheets/d/... o .../pub?output=csv"
                        value={sheetsConfig.sheetUrl}
                        onChange={(e) =>
                          onSheetsConfigChange({
                            ...sheetsConfig,
                            sheetUrl: e.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={sheetsLoading}
                        onClick={() => handleImportFromSheets('import')}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer ${getConnectionButtonClasses(isSheetsImportReady, 'solid')}`}
                      >
                        {sheetsLoading ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <FileSpreadsheet
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        )}
                        <span>Importar desde Google Sheets</span>
                      </button>

                      <button
                        type="button"
                        disabled={sheetsLoading}
                        onClick={() => handleImportFromSheets('update')}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 cursor-pointer ${getConnectionButtonClasses(isSheetsImportReady, 'outline')}`}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            sheetsLoading ? 'animate-spin' : ''
                          }`}
                          aria-hidden="true"
                        />
                        <span>Actualizar precios/filas</span>
                      </button>
                    </div>
                  </div>

                  {/* Opción B: Archivo local .csv o .xlsx */}
                  <div className="space-y-3 border-t border-[#E5E4DF] pt-3 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          O subir archivo local (.csv o .xlsx)
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Columnas: Producto, Descripcion, Cantidad, Unidad y Valor. Se omiten filas vacías, con Valor 0/no numérico o totales (TOTAL, SUBTOTAL, IVA, IMPUESTO, RESUMEN).
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={sheetsLoading}
                        onClick={() => spreadsheetFileInputRef.current?.click()}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer ${getConnectionButtonClasses(isExcelFileImportReady, 'outline')}`}
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Subir archivo (.csv / .xlsx)</span>
                      </button>
                    </div>

                    {loadedExcel && (
                      <div className="rounded-md border border-[#DCDAD3] bg-[#FAF9F6] p-3 space-y-2.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            Archivo Excel: {loadedExcel.fileName}{' '}
                            <span className="font-normal text-zinc-500 dark:text-zinc-400">
                              ({loadedExcel.sheetNames.length}{' '}
                              {loadedExcel.sheetNames.length === 1
                                ? 'hoja'
                                : 'hojas'}
                              )
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setLoadedExcel(null);
                              setSelectedExcelSheet('');
                            }}
                            title="Cerrar selección de archivo Excel"
                            aria-label="Cerrar selección de archivo Excel"
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[210px] flex-1">
                            <label
                              htmlFor="excel-sheet-select"
                              className={labelClass}
                            >
                              Seleccionar hoja del archivo
                            </label>
                            <select
                              id="excel-sheet-select"
                              value={selectedExcelSheet}
                              onChange={(e) =>
                                setSelectedExcelSheet(e.target.value)
                              }
                              className={inputClass}
                            >
                              {loadedExcel.sheetNames.map((sheetName) => (
                                <option key={sheetName} value={sheetName}>
                                  {sheetName}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={handleImportSelectedExcelSheet}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${getConnectionButtonClasses(isExcelSheetReady, 'solid')}`}
                          >
                            <FileSpreadsheet
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span>Importar hoja</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {sheetsStatus && (
                    <div
                      className={`rounded-md border px-3 py-2 text-xs ${
                        sheetsStatus.isError
                          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-200'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-200'
                      }`}
                    >
                      <p>{sheetsStatus.text}</p>

                      {pendingSheetChoice &&
                        pendingSheetChoice.error.availableSheets.length > 0 && (
                          <div className="mt-2.5 border-t border-amber-200/80 pt-2 dark:border-amber-800/60">
                            <span className="block text-[11px] font-semibold text-amber-950 dark:text-amber-200">
                              Selecciona una de las hojas disponibles para importar:
                            </span>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {pendingSheetChoice.error.availableSheets.map(
                                (sheetOption) => (
                                  <button
                                    key={sheetOption}
                                    type="button"
                                    onClick={() =>
                                      handlePickAvailableSheet(sheetOption)
                                    }
                                    className="rounded border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-800 hover:border-[#8C5A32] hover:bg-[#FAF9F6] dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                                  >
                                    {sheetOption}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Plantillas rápidas guardadas por el usuario */}
            <div className="flex flex-wrap items-center gap-1.5 border-y border-[#E5E4DF] py-2.5 dark:border-zinc-800">
              <span className="mr-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Plantillas rápidas:
              </span>
              {productTemplates.length === 0 ? (
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  Sin plantillas guardadas. Usa &ldquo;Guardar plantilla&rdquo; en cualquier producto para reutilizarlo.
                </span>
              ) : (
                productTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="inline-flex items-center overflow-hidden rounded border border-[#E5E4DF] bg-[#FAF9F6] dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <button
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      title={`Aplicar plantilla: ${tpl.producto} · ${tpl.cantidad} ${tpl.unidad} · ${formatMoney(tpl.valor, data.clientProject.moneda)}`}
                      className="px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      + {tpl.producto}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteProductTemplate(tpl.id)}
                      aria-label={`Eliminar plantilla ${tpl.producto}`}
                      title={`Eliminar plantilla ${tpl.producto}`}
                      className="border-l border-[#E5E4DF] px-1.5 py-1 text-zinc-400 hover:bg-red-50 hover:text-red-700 transition-colors dark:border-zinc-700 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {data.items.length > 0 && (
              <div className="space-y-3 rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                {/* Buscador dentro de productos */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[210px] flex-1">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      aria-label="Buscar productos por nombre o descripción"
                      placeholder="Buscar producto por nombre o descripción..."
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                      className="w-full rounded-md border border-[#DCDAD3] bg-white py-1.5 pl-8 pr-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
                    />
                    {productSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setProductSearchQuery('')}
                        title="Limpiar búsqueda"
                        aria-label="Limpiar filtro de productos"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {productSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setProductSearchQuery('')}
                      className="inline-flex items-center gap-1 rounded-md border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      <span>Limpiar filtro ({filteredProductEntries.length}/{data.items.length})</span>
                    </button>
                  )}
                </div>

                {/* Resumen comprimido con navegación por clic y comprimir/expandir detalle */}
                <div className="rounded-md border border-[#E5E4DF] bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0EFEA] px-3 py-2 dark:border-zinc-800">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        Resumen rápido de productos
                      </span>
                      <span className="rounded border border-[#E5E4DF] bg-[#FAF9F6] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-600 tabular-nums dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {filteredProductEntries.length}
                        {productSearchQuery ? ` de ${data.items.length}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCollapseAllProducts}
                        title="Comprimir detalle de todos los productos"
                        className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                      >
                        <ChevronsDownUp className="h-3 w-3 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
                        <span>Comprimir detalle</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExpandAllProducts}
                        title="Expandir detalle de todos los productos"
                        className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                      >
                        <ChevronsUpDown className="h-3 w-3 text-[#8C5A32] dark:text-amber-400" aria-hidden="true" />
                        <span>Expandir detalle</span>
                      </button>
                    </div>
                  </div>

                  {filteredProductEntries.length === 0 ? (
                    <div className="px-3 py-3 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
                      Ningún producto coincide con &ldquo;{productSearchQuery}&rdquo;.
                    </div>
                  ) : (
                    <div className="max-h-44 divide-y divide-[#F0EFEA] overflow-y-auto dark:divide-zinc-800">
                      {filteredProductEntries.map(({ item, idx }) => {
                        const unitLabel =
                          proformaType === 'cielos_pisos'
                            ? 'm²'
                            : item.unidad.trim() || 'und(s)';
                        const isCollapsed = Boolean(collapsedProductIds[item.id]);
                        return (
                          <button
                            key={`summary-${item.id}`}
                            type="button"
                            onClick={() => handleJumpToProduct(item.id)}
                            title="Ir a este producto en el listado principal"
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[#FAF9F6] dark:hover:bg-zinc-800/70 cursor-pointer"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 tabular-nums shrink-0">
                                #{String(idx + 1).padStart(2, '0')}
                              </span>
                              <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                                {item.producto.trim() || 'Sin título'}
                              </span>
                              {isCollapsed && (
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 shrink-0">
                                  Comprimido
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] tabular-nums">
                              <span className="text-zinc-500 dark:text-zinc-400">
                                {item.cantidad} {unitLabel}
                              </span>
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {formatMoney(item.valor, data.clientProject.moneda)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {data.items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#DCDAD3] bg-[#FAF9F6] px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-800/40">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  No hay líneas de producto en esta proforma
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Agrega una línea vacía o importa filas desde Google Sheets / Excel para
                  calcular el subtotal e impuesto.
                </p>
                <button
                  type="button"
                  onClick={() => addItem()}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar primer ítem</span>
                </button>
              </div>
            ) : filteredProductEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#DCDAD3] bg-[#FAF9F6] px-6 py-8 text-center dark:border-zinc-700 dark:bg-zinc-800/40">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  No se encontraron productos para &ldquo;{productSearchQuery}&rdquo;
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Limpia el filtro de búsqueda para volver a ver los {data.items.length} productos de la cotización.
                </p>
                <button
                  type="button"
                  onClick={() => setProductSearchQuery('')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Limpiar filtro y ver todos</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProductEntries.map(({ item, idx }) => {
                  const isCollapsed = Boolean(collapsedProductIds[item.id]);
                  const isHighlighted = highlightedProductId === item.id;
                  const unitLabel =
                    proformaType === 'cielos_pisos'
                      ? 'm²'
                      : item.unidad.trim() || 'und(s)';
                  return (
                  <div
                    key={item.id}
                    ref={(el) => {
                      productCardRefs.current[item.id] = el;
                    }}
                    className={`rounded-lg border bg-white p-4 transition-all duration-300 dark:bg-zinc-900 ${
                      isHighlighted
                        ? 'border-[#8C5A32] ring-2 ring-[#8C5A32]/25 shadow-sm dark:border-amber-500 dark:ring-amber-500/25'
                        : 'border-[#E5E4DF] dark:border-zinc-800'
                    }`}
                  >
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 ${
                        isCollapsed ? '' : 'mb-3 border-b border-[#F0EFEA] pb-2.5 dark:border-zinc-800'
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-zinc-400 dark:text-zinc-500 tabular-nums shrink-0">
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate font-semibold text-zinc-800 dark:text-zinc-100">
                          {item.producto || 'Sin título'}
                        </span>
                        {isCollapsed && (
                          <span className="hidden sm:inline-flex items-center gap-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
                            <span>·</span>
                            <span>
                              {item.cantidad} {unitLabel}
                            </span>
                            <span>·</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {formatMoney(item.valor, data.clientProject.moneda)}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleProductCollapsed(item.id)}
                          aria-expanded={!isCollapsed}
                          aria-label={
                            isCollapsed
                              ? 'Expandir detalle del producto'
                              : 'Comprimir detalle del producto'
                          }
                          title={
                            isCollapsed
                              ? 'Expandir detalle'
                              : 'Comprimir detalle'
                          }
                          className="inline-flex items-center gap-1 rounded border border-[#E5E4DF] bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer mr-1"
                        >
                          {isCollapsed ? (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span className="hidden sm:inline">
                            {isCollapsed ? 'Expandir' : 'Comprimir'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSaveProductTemplate(item)}
                          disabled={!item.producto.trim()}
                          aria-label="Guardar línea como plantilla"
                          title={
                            item.producto.trim()
                              ? 'Guardar este producto como plantilla rápida'
                              : 'Escribe el nombre del producto para guardar como plantilla'
                          }
                          className="inline-flex items-center gap-1 rounded border border-[#E5E4DF] bg-[#FAF9F6] px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed mr-1"
                        >
                          <BookmarkPlus className="h-3 w-3 text-[#8C5A32] dark:text-amber-400" />
                          <span className="hidden sm:inline">Guardar plantilla</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(idx, -1)}
                          disabled={idx === 0}
                          aria-label="Subir línea"
                          title="Subir"
                          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(idx, 1)}
                          disabled={idx === data.items.length - 1}
                          aria-label="Bajar línea"
                          title="Bajar"
                          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateItem(idx)}
                          aria-label="Duplicar línea"
                          title="Duplicar"
                          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          aria-label="Eliminar línea"
                          title="Eliminar"
                          className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700 dark:text-zinc-400 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <>

                    {proformaType === 'cielos_pisos' ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                        <div className="sm:col-span-5">
                          <label className={labelClass}>Espacio</label>
                          <input
                            type="text"
                            placeholder="Ej. Sala Principal / Cocina"
                            value={item.producto}
                            onChange={(e) =>
                              updateItem(item.id, 'producto', e.target.value)
                            }
                            className={`${inputClass} font-semibold`}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className={labelClass}>Cantidad (m²)</label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={item.cantidad}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateCielosPisosField(
                                item.id,
                                'cantidad',
                                Number.isNaN(val) ? 0 : Math.max(0, val)
                              );
                            }}
                            className={`${inputClass} font-mono tabular-nums`}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className={labelClass}>Valor Unitario</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.valorUnitario ?? 0}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateCielosPisosField(
                                item.id,
                                'valorUnitario',
                                Number.isNaN(val) ? 0 : Math.max(0, val)
                              );
                            }}
                            className={`${inputClass} font-mono text-right tabular-nums`}
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className={labelClass}>
                            Valor ({getCurrencyCode(data.clientProject.moneda)})
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.valor}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateItem(
                                item.id,
                                'valor',
                                Number.isNaN(val) ? 0 : Math.max(0, val)
                              );
                            }}
                            className={`${inputClass} font-mono text-right font-semibold tabular-nums`}
                          />
                        </div>

                        <div className="sm:col-span-12">
                          <label className={labelClass}>Acabado</label>
                          <textarea
                            rows={2}
                            placeholder="Tipo de piso o cielo, formato, tono, acabado, zócalo..."
                            value={item.descripcion}
                            onChange={(e) =>
                              updateItem(item.id, 'descripcion', e.target.value)
                            }
                            className={`${inputClass} resize-y leading-relaxed`}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                        <div className="sm:col-span-5">
                          <label className={labelClass}>
                            {proformaType === 'griferia'
                              ? 'Código Producto'
                              : 'Producto'}
                          </label>
                          <input
                            type="text"
                            placeholder={
                              proformaType === 'griferia'
                                ? 'Ej. K-22020-CP'
                                : proformaType === 'puertas'
                                  ? 'Ej. Puerta Principal Pivotante'
                                  : 'Ej. COCINA N1'
                            }
                            value={item.producto}
                            onChange={(e) =>
                              updateItem(item.id, 'producto', e.target.value)
                            }
                            className={`${inputClass} font-semibold`}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className={labelClass}>Cantidad</label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={item.cantidad}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateItem(
                                item.id,
                                'cantidad',
                                Number.isNaN(val) ? 0 : Math.max(0, val)
                              );
                            }}
                            className={`${inputClass} font-mono tabular-nums`}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className={labelClass}>Unidad</label>
                          <input
                            type="text"
                            placeholder="und(s)"
                            value={item.unidad}
                            onChange={(e) =>
                              updateItem(item.id, 'unidad', e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className={labelClass}>
                            Valor ({data.clientProject.moneda})
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.valor}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateItem(
                                item.id,
                                'valor',
                                Number.isNaN(val) ? 0 : Math.max(0, val)
                              );
                            }}
                            className={`${inputClass} font-mono text-right font-semibold tabular-nums`}
                          />
                        </div>

                        {proformaType === 'griferia' && (
                          <div className="sm:col-span-12 rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-3 space-y-2 dark:border-zinc-800 dark:bg-zinc-800/50">
                            <input
                              ref={(el) => {
                                itemImageFileInputRefs.current[item.id] = el;
                              }}
                              type="file"
                              accept={ACCEPTED_LOGO_INPUT}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) {
                                  handleItemImageUpload(item.id, file);
                                }
                              }}
                              className="hidden"
                              aria-label={`Subir imagen para ${item.producto || 'ítem'}`}
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Imagen del producto (archivo PC o enlace / Google Drive — opcional)
                              </label>
                              {item.imagen?.trim() && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateItem(item.id, 'imagen', '');
                                    setItemImageUrlInputs((prev) => ({
                                      ...prev,
                                      [item.id]: '',
                                    }));
                                    setItemImageErrors((prev) => ({
                                      ...prev,
                                      [item.id]: null,
                                    }));
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-red-700 dark:text-zinc-400 dark:hover:text-red-300 cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Quitar imagen</span>
                                </button>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                              {item.imagen?.trim() && (
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-[#DCDAD3] bg-white p-1 dark:border-zinc-700">
                                  <ResilientImage
                                    src={item.imagen.trim()}
                                    alt={item.producto || 'Producto'}
                                    className="max-h-10 max-w-10 object-contain"
                                    fallback={
                                      <span className="text-[9px] text-amber-700 text-center leading-tight">
                                        Sin vista
                                      </span>
                                    }
                                  />
                                </div>
                              )}

                              <div className="min-w-[200px] flex-1 flex items-center gap-1.5">
                                <input
                                  type="url"
                                  aria-label={`URL de imagen para ${item.producto || 'ítem'}`}
                                  placeholder="Pegar URL de imagen o enlace de Google Drive..."
                                  value={
                                    itemImageUrlInputs[item.id] ??
                                    (item.imagen && !item.imagen.startsWith('data:')
                                      ? item.imagen
                                      : '')
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setItemImageUrlInputs((prev) => ({
                                      ...prev,
                                      [item.id]: val,
                                    }));
                                    if (itemImageErrors[item.id]) {
                                      setItemImageErrors((prev) => ({
                                        ...prev,
                                        [item.id]: null,
                                      }));
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleLoadItemImageUrl(item.id, item.imagen);
                                    }
                                  }}
                                  className={inputClass}
                                />
                                <button
                                  type="button"
                                  disabled={Boolean(itemImageLoading[item.id])}
                                  onClick={() =>
                                    handleLoadItemImageUrl(item.id, item.imagen)
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  {itemImageLoading[item.id] ? (
                                    <Loader2
                                      className="h-3.5 w-3.5 animate-spin"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Link2
                                      className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span>Aplicar URL</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  itemImageFileInputRefs.current[
                                    item.id
                                  ]?.click()
                                }
                                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDAD3] bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Upload
                                  className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400"
                                  aria-hidden="true"
                                />
                                <span>
                                  {item.imagen?.trim()
                                    ? 'Cambiar archivo'
                                    : 'Subir imagen'}
                                </span>
                              </button>
                            </div>

                            {item.imagen?.startsWith('data:') && (
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                Imagen cargada desde archivo local de tu equipo.
                              </p>
                            )}

                            {itemImageErrors[item.id] && (
                              <p className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                                {itemImageErrors[item.id]}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="sm:col-span-12">
                          <label className={labelClass}>
                            {proformaType === 'puertas'
                              ? 'Descripción del Producto'
                              : proformaType === 'griferia'
                                ? 'Descripción'
                                : 'Descripción del producto'}
                          </label>
                          <textarea
                            rows={3}
                            placeholder={
                              proformaType === 'puertas'
                                ? 'Medidas, espesor, núcleo, chapa/acabado, marco, herrajes...'
                                : proformaType === 'griferia'
                                  ? 'Marca, línea, acabado, especificaciones técnicas...'
                                  : 'Detalle constructivo, acabados, herrajes, módulos incluidos...'
                            }
                            value={item.descripcion}
                            onChange={(e) =>
                              updateItem(item.id, 'descripcion', e.target.value)
                            }
                            className={`${inputClass} resize-y leading-relaxed`}
                          />
                        </div>
                      </div>
                    )}
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {/* Resumen en tiempo real */}
            <div className="rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                <div>
                  <span className="block text-zinc-500 dark:text-zinc-400">
                    {proformaType === 'cielos_pisos'
                      ? 'Total m²'
                      : 'Total de Unidades'}
                  </span>
                  <span className="mt-1 block font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {totals.unidadResumen}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-500 dark:text-zinc-400">Valor de Producto</span>
                  <span className="mt-1 block font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatMoney(totals.subtotal, data.clientProject.moneda)}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-500 dark:text-zinc-400">
                    Impuesto ({data.taxRate}%)
                  </span>
                  <span className="mt-1 block font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatMoney(totals.impuesto, data.clientProject.moneda)}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-500 dark:text-zinc-400">Total Cotizado</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`font-mono text-base font-bold tabular-nums ${
                        totals.total <= 0
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-[#8C5A32] dark:text-amber-400'
                      }`}
                    >
                      {formatMoney(totals.total, data.clientProject.moneda)}
                    </span>
                    {totals.total <= 0 && (
                      <span
                        role="status"
                        className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-700/80 dark:bg-amber-950/60 dark:text-amber-200"
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>Total en cero o negativo</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {totals.total <= 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                  <span>
                    Advertencia: el total general de la cotización es menor o igual a 0. Revisa las cantidades o precios antes de exportar el PDF.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================
            TAB 3: REFERENCIAS VISUALES (ESPACIOS ILIMITADOS, TAMAÑOS Y ORDEN)
            ================================================================ */}
        {activeTab === 'referencias' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Referencias Visuales
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Agrega tantos espacios de imagen como necesites desde tu PC o URL. Elige el tamaño por espacio (<strong className="font-medium text-zinc-700 dark:text-zinc-300">Pequeño</strong> hasta 3/fila, <strong className="font-medium text-zinc-700 dark:text-zinc-300">Mediano</strong> hasta 2/fila o <strong className="font-medium text-zinc-700 dark:text-zinc-300">Grande</strong> 1/fila) y arrastra para reordenar dentro del área de impresión.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded border border-[#DCDAD3] bg-[#FAF9F6] px-2 py-1 font-mono text-[11px] font-medium text-zinc-600 tabular-nums dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {activeVisualRefsCount} cargada(s) · {editorVisualRefs.length} espacio(s)
                </span>
                <button
                  type="button"
                  onClick={handleAddVisualRefSlot}
                  className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar espacio</span>
                </button>
              </div>
            </div>

            {visualRefError && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                {visualRefError}
              </div>
            )}

            {editorVisualRefs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#DCDAD3] bg-[#FAF9F6] px-4 py-8 text-center dark:border-zinc-700 dark:bg-zinc-800/40">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  No hay espacios de referencia visual agregados.
                </p>
                <button
                  type="button"
                  onClick={handleAddVisualRefSlot}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar primer espacio de imagen</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {editorVisualRefs.map((entry, idx) => {
                  const hasImage = Boolean(entry.imageDataUrl?.trim());
                  const slotErr = visualRefSlotErrors[entry.id];
                  const slotLoading = Boolean(visualRefLoading[entry.id]);
                  const currentUrlValue =
                    visualRefUrlInputs[entry.id] ??
                    (entry.imageDataUrl && !entry.imageDataUrl.startsWith('data:')
                      ? entry.imageDataUrl
                      : '');
                  const currentSize = normalizeVisualReferenceSize(entry.size);
                  const isDragged = draggedVisualRefId === entry.id;
                  const isDragTarget =
                    dragOverVisualRefId === entry.id &&
                    draggedVisualRefId !== entry.id;

                  return (
                    <div
                      key={entry.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedVisualRefId(entry.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', entry.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverVisualRefId !== entry.id) {
                          setDragOverVisualRefId(entry.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverVisualRefId === entry.id) {
                          setDragOverVisualRefId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromId =
                          draggedVisualRefId ||
                          e.dataTransfer.getData('text/plain');
                        if (fromId) {
                          handleReorderVisualRefs(fromId, entry.id);
                        }
                        setDraggedVisualRefId(null);
                        setDragOverVisualRefId(null);
                      }}
                      onDragEnd={() => {
                        setDraggedVisualRefId(null);
                        setDragOverVisualRefId(null);
                      }}
                      className={`flex flex-col justify-between overflow-hidden rounded-md border bg-[#FAF9F6] p-3 transition-all dark:bg-zinc-800/50 ${
                        currentSize === 'large' ? 'sm:col-span-2' : ''
                      } ${
                        isDragTarget
                          ? 'border-[#8C5A32] ring-2 ring-[#8C5A32]/30 dark:border-amber-400 dark:ring-amber-400/30'
                          : 'border-[#E5E4DF] dark:border-zinc-800'
                      } ${isDragged ? 'opacity-50' : ''}`}
                    >
                      <input
                        ref={(el) => {
                          visualRefFileInputRefs.current[entry.id] = el;
                        }}
                        type="file"
                        accept={ACCEPTED_LOGO_INPUT}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) {
                            void handleVisualRefUpload(entry.id, file);
                          }
                        }}
                        className="hidden"
                        aria-label={`Subir imagen de referencia ${idx + 1}`}
                      />

                      <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            title="Arrastra para reordenar"
                            className="inline-flex cursor-grab items-center rounded p-0.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 active:cursor-grabbing dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                          >
                            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                          <span className="font-semibold text-zinc-700 truncate dark:text-zinc-300">
                            Espacio {idx + 1}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveVisualRefByStep(entry.id, -1)}
                            disabled={idx === 0}
                            title="Mover antes"
                            aria-label={`Mover espacio ${idx + 1} antes`}
                            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveVisualRefByStep(entry.id, 1)}
                            disabled={idx === editorVisualRefs.length - 1}
                            title="Mover después"
                            aria-label={`Mover espacio ${idx + 1} después`}
                            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          {hasImage && (
                            <button
                              type="button"
                              onClick={() => handleClearVisualRefImage(entry.id)}
                              title={`Quitar imagen del espacio ${idx + 1}`}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 hover:bg-amber-50 hover:text-amber-800 dark:text-zinc-400 dark:hover:bg-amber-950/60 dark:hover:text-amber-300 cursor-pointer"
                            >
                              Limpiar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteVisualRefSlot(entry.id)}
                            title={`Eliminar espacio ${idx + 1}`}
                            aria-label={`Eliminar espacio ${idx + 1}`}
                            className="rounded p-0.5 text-zinc-400 hover:bg-red-50 hover:text-red-700 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Selector de tamaño / distribución dentro del área de impresión */}
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400">
                          Tamaño:
                        </span>
                        <div
                          role="group"
                          aria-label={`Tamaño de impresión para espacio ${idx + 1}`}
                          className="inline-flex rounded border border-[#DCDAD3] bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          {(
                            [
                              {
                                value: 'small' as VisualReferenceSize,
                                label: 'Pequeño',
                                hint: 'Hasta 3 por fila',
                              },
                              {
                                value: 'medium' as VisualReferenceSize,
                                label: 'Mediano',
                                hint: 'Hasta 2 por fila',
                              },
                              {
                                value: 'large' as VisualReferenceSize,
                                label: 'Grande',
                                hint: '1 por fila (expandido)',
                              },
                            ] as const
                          ).map((opt) => {
                            const selected = currentSize === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                title={opt.hint}
                                onClick={() =>
                                  handleVisualRefSizeChange(entry.id, opt.value)
                                }
                                className={`rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer ${
                                  selected
                                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div
                        className={`relative mb-2.5 flex items-center justify-center overflow-hidden rounded border border-[#E5E4DF] bg-white p-1.5 dark:border-zinc-700 ${
                          currentSize === 'large'
                            ? 'h-40'
                            : currentSize === 'small'
                              ? 'h-20'
                              : 'h-24'
                        }`}
                      >
                        {hasImage ? (
                          <>
                            <ResilientImage
                              src={entry.imageDataUrl}
                              alt={
                                entry.caption.trim() ||
                                entry.name ||
                                `Referencia ${idx + 1}`
                              }
                              className="max-h-full max-w-full w-auto h-auto object-contain"
                              fallback={
                                <span className="text-[11px] text-amber-700">
                                  No se pudo previsualizar este enlace
                                </span>
                              }
                            />
                            <button
                              type="button"
                              onClick={() => setExpandedVisualRefModal(entry)}
                              title="Expandir imagen"
                              aria-label={`Expandir imagen ${idx + 1}`}
                              className="absolute right-1.5 top-1.5 rounded border border-[#DCDAD3] bg-white/90 p-1 text-zinc-700 shadow-xs hover:bg-white hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 cursor-pointer"
                            >
                              <Maximize2 className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-zinc-400">
                            Sin imagen cargada
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() =>
                            visualRefFileInputRefs.current[entry.id]?.click()
                          }
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                          <ImagePlus
                            className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400"
                            aria-hidden="true"
                          />
                          <span>
                            {hasImage
                              ? 'Cambiar archivo desde PC'
                              : 'Subir archivo desde PC'}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="url"
                            aria-label={`URL de imagen para referencia ${idx + 1}`}
                            placeholder="O pegar URL / enlace Google Drive..."
                            value={currentUrlValue}
                            onChange={(e) => {
                              const val = e.target.value;
                              setVisualRefUrlInputs((prev) => ({
                                ...prev,
                                [entry.id]: val,
                              }));
                              if (slotErr) {
                                setVisualRefSlotErrors((prev) => ({
                                  ...prev,
                                  [entry.id]: null,
                                }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleLoadVisualRefUrl(entry.id, idx);
                              }
                            }}
                            className="min-w-0 flex-1 rounded border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
                          />
                          <button
                            type="button"
                            disabled={slotLoading}
                            onClick={() =>
                              void handleLoadVisualRefUrl(entry.id, idx)
                            }
                            className="inline-flex items-center gap-1 rounded border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {slotLoading ? (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Link2
                                className="h-3.5 w-3.5 text-[#8C5A32] dark:text-amber-400"
                                aria-hidden="true"
                              />
                            )}
                            <span>Cargar</span>
                          </button>
                        </div>

                        {slotErr && (
                          <p className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                            {slotErr}
                          </p>
                        )}

                        <input
                          type="text"
                          placeholder="Descripción editable (si queda vacía se omite)"
                          value={entry.caption ?? ''}
                          onChange={(e) =>
                            handleVisualRefCaptionChange(
                              entry.id,
                              e.target.value
                            )
                          }
                          className="w-full rounded border border-[#DCDAD3] bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#8C5A32] focus:outline-none focus:ring-2 focus:ring-[#8C5A32]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={handleAddVisualRefSlot}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#C7C3B8] bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:border-[#8C5A32] hover:bg-[#FAF9F6] hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-amber-500 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Agregar otro espacio de imagen</span>
              </button>
            </div>

            {expandedVisualRefModal && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Vista ampliada de referencia visual"
                onClick={() => setExpandedVisualRefModal(null)}
                className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-[1px]"
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#E5E4DF] bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between border-b border-[#E5E4DF] px-4 py-2.5 dark:border-zinc-800">
                    <span className="text-xs font-semibold text-zinc-900 truncate dark:text-zinc-100">
                      {expandedVisualRefModal.caption.trim() ||
                        expandedVisualRefModal.name ||
                        'Referencia visual ampliada'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedVisualRefModal(null)}
                      aria-label="Cerrar vista ampliada"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-1 items-center justify-center overflow-auto bg-[#FAF9F6] p-4 dark:bg-zinc-950">
                    <ResilientImage
                      src={expandedVisualRefModal.imageDataUrl}
                      alt={
                        expandedVisualRefModal.caption.trim() ||
                        expandedVisualRefModal.name ||
                        'Referencia visual'
                      }
                      className="max-h-[75vh] max-w-full w-auto h-auto object-contain"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================
            TAB 4: TÉRMINOS Y ESPECIFICACIONES TÉCNICAS
            ================================================================ */}
        {activeTab === 'terminos' && (
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Términos y Condiciones
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTerminoId('');
                      onChange((prev) => ({
                        ...prev,
                        terminosCondiciones: DEFAULT_TERMINOS_CONDICIONES,
                      }));
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>Restaurar predeterminados</span>
                  </button>
                  <GoogleSheetShortcutButton
                    label="Abrir Sheet Términos y Condiciones"
                    sheetUrl={DEFAULT_SPECS_SHEET_URL}
                    defaultSheetUrl={DEFAULT_SPECS_SHEET_URL}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={onSyncAranTemplates}
                    disabled={isSyncingAran}
                    title={
                      isAranConnected
                        ? 'Conectado con hoja TERMINOS_Y_CONDICIONES: recargar catálogo desde Google Sheets sin sobrescribir cambios actuales'
                        : 'Sin URL o error en script de ESPECIFICACIONES / TERMINOS_Y_CONDICIONES: revisa la pestaña Integración'
                    }
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${getConnectionButtonClasses(isAranConnected, 'outline')}`}
                  >
                    {isSyncingAran ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {isSyncingAran
                        ? 'Cargando Términos...'
                        : `TERMINOS_Y_CONDICIONES (${terminosTemplates.length})`}
                    </span>
                  </button>
                </div>
              </div>

              <div className="mb-2.5 rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-3 space-y-1.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="terminos-template-select"
                    className="text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                  >
                    Cargar desde pestaña &ldquo;TERMINOS_Y_CONDICIONES&rdquo; (según tipo o manual)
                  </label>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {terminosTemplates.length > 0
                      ? `${terminosTemplates.length} plantilla(s)`
                      : isSyncingAran
                        ? 'Consultando...'
                        : 'Sin filas cargadas'}
                  </span>
                </div>
                <select
                  id="terminos-template-select"
                  value={selectedTerminoId}
                  disabled={terminosTemplates.length === 0}
                  onChange={(e) => applyTerminoTemplate(e.target.value)}
                  className={`${inputClass} py-1.5 text-xs disabled:opacity-60`}
                >
                  <option value="">
                    {terminosTemplates.length > 0
                      ? '— Elegir términos de TERMINOS_Y_CONDICIONES (editable abajo) —'
                      : isSyncingAran
                        ? 'Cargando términos desde Google Sheets...'
                        : 'Sin filas cargadas en TERMINOS_Y_CONDICIONES (edición manual libre)'}
                  </option>
                  {terminosTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.tipoCotizacion
                        ? `${tpl.tipoCotizacion} — ${tpl.titulo}`
                        : tpl.titulo}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                rows={10}
                value={data.terminosCondiciones}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    terminosCondiciones: e.target.value,
                  }))
                }
                className={`${inputClass} resize-y text-xs leading-relaxed`}
              />
            </div>

            <div className="border-t border-[#E5E4DF] pt-5 dark:border-zinc-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Especificaciones Técnicas Generales y Acabados
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Bloques diferenciados (Mobiliario General, Línea tipo Aran,
                    Secciones Técnicas).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onChange((prev) => ({
                        ...prev,
                        specBlocks: DEFAULT_SPEC_BLOCKS.map((b) => ({ ...b })),
                      }))
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>Restaurar</span>
                  </button>
                  <GoogleSheetShortcutButton
                    label="Abrir Sheet Especificaciones"
                    sheetUrl={specsSheetUrl}
                    defaultSheetUrl={DEFAULT_SPECS_SHEET_URL}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={onSyncAranTemplates}
                    disabled={isSyncingAran}
                    title={
                      isAranConnected
                        ? 'Conectado con hoja ESPECIFICACIONES y TERMINOS_Y_CONDICIONES: recargar desde Google Sheets'
                        : 'Sin URL o error en script de ESPECIFICACIONES: revisa la pestaña Integración'
                    }
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${getConnectionButtonClasses(isAranConnected, 'outline')}`}
                  >
                    {isSyncingAran ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {isSyncingAran
                        ? 'Cargando Especificaciones...'
                        : `ESPECIFICACIONES (${aranTemplates.length})`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={addSpecBlock}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Agregar bloque</span>
                  </button>
                </div>
              </div>

              {/* Barra rápida para agregar un bloque nuevo directamente desde la hoja ESPECIFICACIONES */}
              <div className="mb-4 rounded-lg border border-[#E5E4DF] bg-[#FAF9F6] p-3 space-y-2 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="aran-add-new-block-select"
                    className="text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                  >
                    Agregar bloque nuevo desde hoja &ldquo;ESPECIFICACIONES&rdquo;
                  </label>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {aranTemplates.length > 0
                      ? `${aranTemplates.length} fila(s) disponible(s)`
                      : isSyncingAran
                        ? 'Consultando Google Sheets...'
                        : 'Sin filas cargadas'}
                  </span>
                </div>

                <select
                  id="aran-add-new-block-select"
                  value=""
                  disabled={aranTemplates.length === 0}
                  onChange={(e) => addSpecBlockFromAran(e.target.value)}
                  className={`${inputClass} text-xs disabled:opacity-60`}
                >
                  <option value="">
                    {aranTemplates.length > 0
                      ? '— Seleccionar "Titulo" de ESPECIFICACIONES para crear bloque nuevo —'
                      : isSyncingAran
                        ? 'Cargando plantillas desde ESPECIFICACIONES...'
                        : 'No hay plantillas cargadas desde ESPECIFICACIONES (puedes crear bloques manuales)'}
                  </option>
                  {aranTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.titulo}
                    </option>
                  ))}
                </select>

                {!isAranConnected && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {aranLastMessage ||
                          'Falta configurar la URL del script "ESPECIFICACIONES" en Integración.'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={onGoToIntegration}
                      className="rounded border border-red-400 bg-white px-2 py-0.5 font-semibold text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/50 dark:text-red-100 dark:hover:bg-red-900 cursor-pointer"
                    >
                      Ir a Integración
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {data.specBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="rounded-lg border border-[#E5E4DF] p-4 dark:border-zinc-800 dark:bg-zinc-800/30"
                  >
                    <div className="mb-3 rounded-md border border-[#E5E4DF] bg-[#FAF9F6] p-2.5 dark:border-zinc-700/80 dark:bg-zinc-900/60">
                      <label
                        htmlFor={`aran-block-select-${block.id}`}
                        className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
                      >
                        Cargar plantilla desde hoja &ldquo;ESPECIFICACIONES&rdquo; (opcional)
                      </label>
                      <select
                        id={`aran-block-select-${block.id}`}
                        value={selectedAranByBlockId[block.id] ?? ''}
                        disabled={aranTemplates.length === 0}
                        onChange={(e) =>
                          applyAranTemplateToBlock(block.id, e.target.value)
                        }
                        className={`${inputClass} py-1.5 text-xs disabled:opacity-60`}
                      >
                        <option value="">
                          {aranTemplates.length > 0
                            ? '— Elegir "Titulo" de ESPECIFICACIONES para rellenar este bloque —'
                            : isSyncingAran
                              ? 'Cargando opciones desde ESPECIFICACIONES...'
                              : 'Sin filas de ESPECIFICACIONES cargadas (edición manual libre)'}
                        </option>
                        {aranTemplates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.titulo}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Título del bloque</label>
                          <input
                            type="text"
                            value={block.titulo}
                            onChange={(e) =>
                              updateSpecBlock(block.id, 'titulo', e.target.value)
                            }
                            className={`${inputClass} font-semibold`}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Subtítulo</label>
                          <input
                            type="text"
                            value={block.subtitulo}
                            onChange={(e) =>
                              updateSpecBlock(
                                block.id,
                                'subtitulo',
                                e.target.value
                              )
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSpecBlock(block.id)}
                        title="Eliminar bloque"
                        aria-label="Eliminar bloque técnico"
                        className="mt-5 rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-700 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Especificaciones y acabados
                      </label>
                      <textarea
                        rows={5}
                        value={block.contenido}
                        onChange={(e) =>
                          updateSpecBlock(block.id, 'contenido', e.target.value)
                        }
                        className={`${inputClass} resize-y text-xs leading-relaxed`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            TAB 5: CUENTA BANCARIA, DESGLOSE DE PAGOS Y FIRMAS
            ================================================================ */}
        {activeTab === 'banco' && (
          <div className="space-y-6">
            {/* Cuenta Bancaria */}
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Cuenta Bancaria
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onChange((prev) => ({
                        ...prev,
                        bankAccount: { ...DEFAULT_BANK_ACCOUNT },
                      }))
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>Restaurar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSaveBankDefaults(data.bankAccount);
                      flashBanner(
                        'Cuenta bancaria guardada como predeterminada.'
                      );
                    }}
                    className="rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                  >
                    Guardar como predeterminada
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Entidad Bancaria</label>
                  <input
                    type="text"
                    value={data.bankAccount.entidadBancaria}
                    onChange={(e) =>
                      updateBank('entidadBancaria', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Nombre</label>
                  <input
                    type="text"
                    value={data.bankAccount.nombre}
                    onChange={(e) => updateBank('nombre', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Cédula Jurídica</label>
                  <input
                    type="text"
                    value={data.bankAccount.cedulaJuridica}
                    onChange={(e) =>
                      updateBank('cedulaJuridica', e.target.value)
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Moneda</label>
                  <input
                    type="text"
                    value={data.bankAccount.moneda}
                    onChange={(e) => updateBank('moneda', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Cuenta</label>
                  <input
                    type="text"
                    value={data.bankAccount.cuenta}
                    onChange={(e) => updateBank('cuenta', e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Cuenta IBAN</label>
                  <input
                    type="text"
                    value={data.bankAccount.cuentaIban}
                    onChange={(e) => updateBank('cuentaIban', e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>
            </div>

            {/* Desglose de Pagos */}
            <div className="border-t border-[#E5E4DF] pt-5 dark:border-zinc-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Desglose de Pagos
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Las filas en 0% se omiten automáticamente en la vista final
                    y PDF.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onChange((prev) => ({
                        ...prev,
                        paymentSchedule: DEFAULT_PAYMENT_SCHEDULE.map((p) => ({
                          ...p,
                        })),
                      }))
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>60 / 30 / 10</span>
                  </button>
                  <button
                    type="button"
                    onClick={addPaymentRow}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DCDAD3] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Agregar fila</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {totals.paymentRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 items-center gap-2 rounded-md border border-[#E5E4DF] p-2.5 sm:grid-cols-[1fr_92px_125px_32px] dark:border-zinc-800 dark:bg-zinc-800/30"
                  >
                    <input
                      type="text"
                      value={row.concepto}
                      onChange={(e) =>
                        updatePaymentRow(row.id, 'concepto', e.target.value)
                      }
                      aria-label="Concepto de pago"
                      className={inputClass}
                    />
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={row.porcentaje}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          updatePaymentRow(
                            row.id,
                            'porcentaje',
                            Number.isNaN(val) ? 0 : Math.max(0, val)
                          );
                        }}
                        aria-label="Porcentaje"
                        className={`${inputClass} pr-7 text-right font-mono tabular-nums`}
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 dark:text-zinc-500">
                        %
                      </span>
                    </div>
                    <div className="rounded-md bg-[#FAF9F6] px-3 py-2 text-right font-mono text-xs font-semibold text-zinc-800 tabular-nums dark:bg-zinc-800 dark:text-zinc-200">
                      {formatMoney(row.monto, data.clientProject.moneda)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePaymentRow(row.id)}
                      aria-label="Eliminar fila de pago"
                      className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-700 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Validación de porcentaje total */}
              <div
                className={`mt-3 flex items-center justify-between rounded-md border px-3.5 py-2 text-xs ${
                  Math.abs(totals.totalPorcentajePagos - 100) < 0.01
                    ? 'border-[#E5E4DF] bg-[#FAF9F6] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300'
                    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {Math.abs(totals.totalPorcentajePagos - 100) < 0.01 ? (
                    <CheckCircle2
                      className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertCircle
                      className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400"
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    {Math.abs(totals.totalPorcentajePagos - 100) < 0.01
                      ? 'El desglose de pagos suma exactamente 100%.'
                      : `Atención: la suma actual es ${totals.totalPorcentajePagos}% (se recomienda 100%).`}
                  </span>
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatMoney(
                    totals.paymentRows.reduce((acc, r) => acc + r.monto, 0),
                    data.clientProject.moneda
                  )}
                </span>
              </div>
            </div>

            {/* Notas Finales y Firmas */}
            <div className="border-t border-[#E5E4DF] pt-5 space-y-4 dark:border-zinc-800">
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Notas Finales y Bloque de Firmas
              </h2>

              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="proforma-notas-finales" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Párrafo de formalización (Cierre / Pagos)
                  </label>
                  {data.notasFinales !== DEFAULT_NOTAS_FINALES && (
                    <button
                      type="button"
                      onClick={() =>
                        onChange((prev) => ({
                          ...prev,
                          notasFinales: DEFAULT_NOTAS_FINALES,
                        }))
                      }
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-[#8C5A32] hover:bg-[#FAF6F1] dark:text-[#D59B69] dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      <span>Restaurar predeterminado</span>
                    </button>
                  )}
                </div>
                <textarea
                  id="proforma-notas-finales"
                  rows={3}
                  value={data.notasFinales}
                  placeholder={DEFAULT_NOTAS_FINALES}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      notasFinales: e.target.value,
                    }))
                  }
                  className={`${inputClass} resize-y text-xs leading-relaxed`}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Etiqueta Firma Empresa</label>
                  <input
                    type="text"
                    value={data.signatures.representanteTitulo}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        signatures: {
                          ...prev.signatures,
                          representanteTitulo: e.target.value,
                        },
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Nombre / Cargo Representante
                  </label>
                  <input
                    type="text"
                    value={data.signatures.representanteNombre}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        signatures: {
                          ...prev.signatures,
                          representanteNombre: e.target.value,
                        },
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Etiqueta Firma Cliente</label>
                  <input
                    type="text"
                    value={data.signatures.clienteTitulo}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        signatures: {
                          ...prev.signatures,
                          clienteTitulo: e.target.value,
                        },
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Nombre Firmante Cliente (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder={
                      data.clientProject.cliente.trim()
                        ? `Automático: ${data.clientProject.cliente.trim()}`
                        : 'Si se deja vacío, usa el campo Cliente'
                    }
                    value={data.signatures.clienteNombre}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        signatures: {
                          ...prev.signatures,
                          clienteNombre: e.target.value,
                        },
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
