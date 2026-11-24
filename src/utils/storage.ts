import {
  DEFAULT_BANK_ACCOUNT,
  DEFAULT_COMPANY_INFO,
  DEFAULT_OLMO_MAIN_LOGO,
  INITIAL_CONSECUTIVO,
} from '../data/defaults';
import {
  BankAccountInfo,
  ClientsImportConfig,
  CloudSyncConfig,
  CompanyInfo,
  GoogleSheetsConfig,
  LogoAsset,
  ProductTemplate,
  ProformaData,
  SavedClient,
  SavedProformaRecord,
} from '../types/proforma';

const KEYS = {
  NEXT_CONSECUTIVO: 'olmo_proforma_next_consecutivo_v1',
  DRAFT: 'olmo_proforma_draft_v1',
  DRAFT_SAVED_AT: 'olmo_proforma_draft_saved_at_v1',
  HISTORY: 'olmo_proforma_history_v1',
  CLOUD_CONFIG: 'olmo_proforma_cloud_config_v1',
  COMPANY_DEFAULTS: 'olmo_proforma_company_defaults_v1',
  BANK_DEFAULTS: 'olmo_proforma_bank_defaults_v1',
  MAIN_LOGO: 'olmo_proforma_main_logo_v1',
  FOOTER_LOGOS: 'olmo_proforma_footer_logos_v1',
  GOOGLE_SHEETS: 'olmo_proforma_gsheets_config_v1',
  PRODUCT_TEMPLATES: 'olmo_proforma_product_templates_v1',
  CLIENTS: 'olmo_proforma_clients_v1',
  CLIENTS_IMPORT_CONFIG: 'olmo_proforma_clients_import_v1',
  REMOTE_HISTORY_CACHE: 'olmo_proforma_remote_history_v1',
};

export function getNextConsecutivo(): number {
  try {
    const raw = localStorage.getItem(KEYS.NEXT_CONSECUTIVO);
    if (!raw) {
      localStorage.setItem(KEYS.NEXT_CONSECUTIVO, String(INITIAL_CONSECUTIVO));
      return INITIAL_CONSECUTIVO;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      localStorage.setItem(KEYS.NEXT_CONSECUTIVO, String(INITIAL_CONSECUTIVO));
      return INITIAL_CONSECUTIVO;
    }
    return parsed;
  } catch {
    return INITIAL_CONSECUTIVO;
  }
}

export function setNextConsecutivo(nextVal: number): number {
  const safe = Math.max(1, Math.floor(Number(nextVal) || INITIAL_CONSECUTIVO));
  try {
    localStorage.setItem(KEYS.NEXT_CONSECUTIVO, String(safe));
  } catch {
    // ignore storage quota errors
  }
  return safe;
}

/**
 * Garantiza que el consecutivo almacenado avance si el número actual
 * ya fue asignado o guardado, evitando repeticiones en el mismo navegador.
 */
export function reserveNextConsecutivo(usedConsecutivo?: number): number {
  const currentNext = getNextConsecutivo();
  const history = loadSavedProformas();
  const maxInHistory = history.reduce(
    (max, item) => Math.max(max, item.consecutivo),
    INITIAL_CONSECUTIVO - 1
  );
  const candidate = Math.max(
    currentNext,
    (usedConsecutivo ?? INITIAL_CONSECUTIVO - 1) + 1,
    maxInHistory + 1
  );
  setNextConsecutivo(candidate);
  return candidate;
}

export function loadDraftProforma(): ProformaData | null {
  try {
    const raw = localStorage.getItem(KEYS.DRAFT);
    if (!raw) return null;
    return JSON.parse(raw) as ProformaData;
  } catch {
    return null;
  }
}

export function loadDraftSavedAt(): string | null {
  try {
    const raw = localStorage.getItem(KEYS.DRAFT_SAVED_AT);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function saveDraftProforma(data: ProformaData): string | null {
  try {
    const savedAt = new Date().toISOString();
    localStorage.setItem(KEYS.DRAFT, JSON.stringify(data));
    localStorage.setItem(KEYS.DRAFT_SAVED_AT, savedAt);
    return savedAt;
  } catch {
    return null;
  }
}

export function loadSavedProformas(): SavedProformaRecord[] {
  try {
    const raw = localStorage.getItem(KEYS.HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProformaToHistory(
  data: ProformaData,
  total: number
): SavedProformaRecord[] {
  const history = loadSavedProformas();
  const now = new Date().toISOString();
  const snapshot: ProformaData = JSON.parse(JSON.stringify({ ...data, updatedAt: now }));

  const existingIdx = history.findIndex(
    (r) => r.id === data.id || r.consecutivo === data.consecutivo
  );

  const newRecord: SavedProformaRecord = {
    id: data.id,
    consecutivo: data.consecutivo,
    savedAt: now,
    data: snapshot,
    total,
  };

  let updated: SavedProformaRecord[];
  if (existingIdx >= 0) {
    updated = [...history];
    updated[existingIdx] = newRecord;
  } else {
    updated = [newRecord, ...history];
  }

  // Ordenar por consecutivo descendente
  updated.sort((a, b) => b.consecutivo - a.consecutivo);

  try {
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }

  // Asegurar que el próximo consecutivo sugerido supere el guardado
  const currentNext = getNextConsecutivo();
  if (data.consecutivo >= currentNext) {
    setNextConsecutivo(data.consecutivo + 1);
  }

  return updated;
}

export function deleteProformaFromHistory(id: string): SavedProformaRecord[] {
  const history = loadSavedProformas();
  const updated = history.filter((r) => r.id !== id);
  try {
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function loadCloudConfig(): CloudSyncConfig {
  try {
    const raw = localStorage.getItem(KEYS.CLOUD_CONFIG);
    if (!raw) {
      return {
        webhookUrl: '',
        autoSyncOnSave: false,
        secretToken: '',
      };
    }
    return JSON.parse(raw) as CloudSyncConfig;
  } catch {
    return {
      webhookUrl: '',
      autoSyncOnSave: false,
      secretToken: '',
    };
  }
}

export function saveCloudConfig(config: CloudSyncConfig): void {
  try {
    localStorage.setItem(KEYS.CLOUD_CONFIG, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function loadSavedCompanyDefaults(): CompanyInfo {
  try {
    const raw = localStorage.getItem(KEYS.COMPANY_DEFAULTS);
    if (!raw) return { ...DEFAULT_COMPANY_INFO };
    return { ...DEFAULT_COMPANY_INFO, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_COMPANY_INFO };
  }
}

export function saveCompanyDefaults(info: CompanyInfo): void {
  try {
    localStorage.setItem(KEYS.COMPANY_DEFAULTS, JSON.stringify(info));
  } catch {
    // ignore
  }
}

export function loadSavedBankDefaults(): BankAccountInfo {
  try {
    const raw = localStorage.getItem(KEYS.BANK_DEFAULTS);
    if (!raw) return { ...DEFAULT_BANK_ACCOUNT };
    return { ...DEFAULT_BANK_ACCOUNT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BANK_ACCOUNT };
  }
}

export function saveBankDefaults(info: BankAccountInfo): void {
  try {
    localStorage.setItem(KEYS.BANK_DEFAULTS, JSON.stringify(info));
  } catch {
    // ignore
  }
}

export function loadMainLogo(): LogoAsset {
  try {
    const raw = localStorage.getItem(KEYS.MAIN_LOGO);
    if (!raw) return DEFAULT_OLMO_MAIN_LOGO;
    const parsed = JSON.parse(raw) as LogoAsset;
    if (!parsed || typeof parsed.dataUrl !== 'string' || !parsed.dataUrl.trim()) {
      return DEFAULT_OLMO_MAIN_LOGO;
    }
    return parsed;
  } catch {
    return DEFAULT_OLMO_MAIN_LOGO;
  }
}

export function saveMainLogo(logo: LogoAsset | null): boolean {
  try {
    if (!logo) {
      localStorage.removeItem(KEYS.MAIN_LOGO);
      return true;
    }
    localStorage.setItem(KEYS.MAIN_LOGO, JSON.stringify(logo));
    return true;
  } catch {
    return false;
  }
}

export function loadFooterLogos(): Array<LogoAsset | null> {
  try {
    const raw = localStorage.getItem(KEYS.FOOTER_LOGOS);
    if (!raw) return [null, null, null];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [null, null, null];
    return [0, 1, 2].map((i) => {
      const item = parsed[i];
      if (item && typeof item.dataUrl === 'string' && item.dataUrl.trim()) {
        return item as LogoAsset;
      }
      return null;
    });
  } catch {
    return [null, null, null];
  }
}

export function saveFooterLogos(logos: Array<LogoAsset | null>): boolean {
  try {
    const normalized = [0, 1, 2].map((i) => logos[i] ?? null);
    localStorage.setItem(KEYS.FOOTER_LOGOS, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function loadGoogleSheetsConfig(): GoogleSheetsConfig {
  try {
    const raw = localStorage.getItem(KEYS.GOOGLE_SHEETS);
    if (!raw) {
      return {
        mode: 'manual',
        sheetUrl: '',
        sheetName: 'EXPORTACION',
        strategy: 'replace',
      };
    }
    const parsed = JSON.parse(raw) as Partial<GoogleSheetsConfig>;
    return {
      mode: parsed.mode === 'sheets' ? 'sheets' : 'manual',
      sheetUrl: typeof parsed.sheetUrl === 'string' ? parsed.sheetUrl : '',
      sheetName:
        typeof parsed.sheetName === 'string'
          ? parsed.sheetName
          : 'EXPORTACION',
      strategy: parsed.strategy === 'append' ? 'append' : 'replace',
      lastImportedAt: parsed.lastImportedAt,
    };
  } catch {
    return {
      mode: 'manual',
      sheetUrl: '',
      sheetName: 'EXPORTACION',
      strategy: 'replace',
    };
  }
}

export function saveGoogleSheetsConfig(config: GoogleSheetsConfig): void {
  try {
    localStorage.setItem(KEYS.GOOGLE_SHEETS, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function loadProductTemplates(): ProductTemplate[] {
  try {
    const raw = localStorage.getItem(KEYS.PRODUCT_TEMPLATES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ProductTemplate =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.producto === 'string' &&
        item.producto.trim().length > 0
    );
  } catch {
    return [];
  }
}

export function saveProductTemplates(templates: ProductTemplate[]): boolean {
  try {
    localStorage.setItem(KEYS.PRODUCT_TEMPLATES, JSON.stringify(templates));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedClients(): SavedClient[] {
  try {
    const raw = localStorage.getItem(KEYS.CLIENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedClient =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.cliente === 'string' &&
          item.cliente.trim().length > 0
      )
      .map((item) => ({
        id: item.id,
        cliente: item.cliente.trim(),
        contacto: typeof item.contacto === 'string' ? item.contacto : '',
        telefono: typeof item.telefono === 'string' ? item.telefono : '',
        correo: typeof item.correo === 'string' ? item.correo : '',
        ubicacion: typeof item.ubicacion === 'string' ? item.ubicacion : '',
        createdAt:
          typeof item.createdAt === 'string'
            ? item.createdAt
            : new Date().toISOString(),
        updatedAt:
          typeof item.updatedAt === 'string'
            ? item.updatedAt
            : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export function saveSavedClients(clients: SavedClient[]): boolean {
  try {
    localStorage.setItem(KEYS.CLIENTS, JSON.stringify(clients));
    return true;
  } catch {
    return false;
  }
}

export function loadClientsImportConfig(): ClientsImportConfig {
  try {
    const raw = localStorage.getItem(KEYS.CLIENTS_IMPORT_CONFIG);
    if (!raw) {
      return {
        sheetUrl: '',
        sheetName: 'CLIENTES',
        appsScriptUrl: '',
        autoSyncToSheet: true,
        strategy: 'upsert',
      };
    }
    const parsed = JSON.parse(raw) as Partial<ClientsImportConfig>;
    return {
      sheetUrl: typeof parsed.sheetUrl === 'string' ? parsed.sheetUrl : '',
      sheetName:
        typeof parsed.sheetName === 'string' ? parsed.sheetName : 'CLIENTES',
      appsScriptUrl:
        typeof parsed.appsScriptUrl === 'string' ? parsed.appsScriptUrl : '',
      autoSyncToSheet:
        typeof parsed.autoSyncToSheet === 'boolean'
          ? parsed.autoSyncToSheet
          : true,
      strategy: parsed.strategy === 'replace' ? 'replace' : 'upsert',
      lastImportedAt: parsed.lastImportedAt,
    };
  } catch {
    return {
      sheetUrl: '',
      sheetName: 'CLIENTES',
      appsScriptUrl: '',
      autoSyncToSheet: true,
      strategy: 'upsert',
    };
  }
}

export function saveClientsImportConfig(config: ClientsImportConfig): void {
  try {
    localStorage.setItem(KEYS.CLIENTS_IMPORT_CONFIG, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export interface RemoteHistoryCache {
  records: SavedProformaRecord[];
  syncedAt?: string;
}

export function loadRemoteHistoryCache(): RemoteHistoryCache {
  try {
    const raw = localStorage.getItem(KEYS.REMOTE_HISTORY_CACHE);
    if (!raw) return { records: [] };
    const parsed = JSON.parse(raw) as Partial<RemoteHistoryCache>;
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      syncedAt: typeof parsed.syncedAt === 'string' ? parsed.syncedAt : undefined,
    };
  } catch {
    return { records: [] };
  }
}

export function saveRemoteHistoryCache(cache: RemoteHistoryCache): void {
  try {
    localStorage.setItem(KEYS.REMOTE_HISTORY_CACHE, JSON.stringify(cache));
  } catch {
    // ignore
  }
}
