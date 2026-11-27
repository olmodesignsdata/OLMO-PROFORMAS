export interface ClientProjectInfo {
  cliente: string;
  contacto: string;
  telefono: string;
  correo: string;
  telefonoCorreo?: string;
  ubicacion: string;
  proyecto: string;
  fecha: string;
  validez: string;
  moneda: string;
}

export type ProformaType =
  | 'mobiliario'
  | 'puertas'
  | 'griferia'
  | 'cielos_pisos';

export interface ProductLineItem {
  id: string;
  producto: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valor: number;
  valorUnitario?: number;
  imagen?: string;
}

export type VisualReferenceSize = 'small' | 'medium' | 'large';
export type VisualReferenceFitMode = 'contain' | 'cover';

export interface VisualReferenceItem {
  id: string;
  slotIndex: number;
  imageDataUrl: string;
  name?: string;
  caption: string;
  size?: VisualReferenceSize;
  rotation?: number;
  customWidthPct?: number;
  customHeightPx?: number;
  fitMode?: VisualReferenceFitMode;
  cropZoom?: number;
  cropX?: number;
  cropY?: number;
}

export interface TableColumnWidths {
  productoPct?: number;
  imagenPct?: number;
  descripcionPct?: number;
  cantidadPct?: number;
  valorUnitarioPct?: number;
  valorPct?: number;
}

export interface SpecBlock {
  id: string;
  titulo: string;
  subtitulo: string;
  contenido: string;
}

export interface BankAccountInfo {
  entidadBancaria: string;
  nombre: string;
  cedulaJuridica: string;
  moneda: string;
  cuenta: string;
  cuentaIban: string;
}

export interface PaymentScheduleItem {
  id: string;
  concepto: string;
  porcentaje: number;
}

export interface CompanyInfo {
  nombreComercial: string;
  razonSocial: string;
  cedulaJuridica: string;
  telefono: string;
  correo: string;
  direccion: string;
  sitioWeb: string;
}

export interface SignatureInfo {
  representanteTitulo: string;
  representanteNombre: string;
  clienteTitulo: string;
  clienteNombre: string;
}

export interface LogoAsset {
  id: string;
  name: string;
  dataUrl: string;
  width?: number;
  height?: number;
}

export interface ProformaData {
  id: string;
  consecutivo: number;
  isDraft?: boolean;
  proformaType?: ProformaType;
  tableColumnWidthsByType?: Partial<Record<ProformaType, TableColumnWidths>>;
  company: CompanyInfo;
  additionalLogos?: LogoAsset[];
  clientProject: ClientProjectInfo;
  items: ProductLineItem[];
  visualReferences?: VisualReferenceItem[];
  taxRate: number;
  terminosCondiciones: string;
  specBlocks: SpecBlock[];
  bankAccount: BankAccountInfo;
  paymentSchedule: PaymentScheduleItem[];
  signatures: SignatureInfo;
  notasFinales: string;
  updatedAt: string;
}

export interface ComputedPaymentRow extends PaymentScheduleItem {
  monto: number;
}

export interface ComputedTotals {
  totalUnidades: number;
  unidadResumen: string;
  subtotal: number;
  impuesto: number;
  total: number;
  paymentRows: ComputedPaymentRow[];
  totalPorcentajePagos: number;
}

export interface SavedProformaRecord {
  id: string;
  consecutivo: number;
  isDraft?: boolean;
  savedAt: string;
  data: ProformaData;
  total: number;
  source?: 'local' | 'sheet' | 'both';
  rawDatosJson?: string;
}

export interface AranSpecTemplate {
  id: string;
  titulo: string;
  subtitulo: string;
  contenido: string;
}

export interface TerminoTemplate {
  id: string;
  tipoCotizacion: string;
  titulo: string;
  contenido: string;
}

export interface SheetShortcutUrls {
  proformasSheetUrl: string;
  clientsSheetUrl: string;
  specsSheetUrl: string;
}

export type NotificationKind = 'warning' | 'error' | 'info' | 'reminder';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  dismissed?: boolean;
  source: 'system' | 'user';
  actionSection?: AppSection;
  actionLabel?: string;
}

export interface NotificationStateRecord {
  readIds: string[];
  dismissedIds: string[];
  reminders: AppNotification[];
}

export interface CloudSyncConfig {
  webhookUrl: string;
  autoSyncOnSave: boolean;
  secretToken: string;
  lastSyncedAt?: string;
  lastStatus?: 'ok' | 'error';
  lastMessage?: string;
  aranScriptUrl?: string;
  aranLastSyncedAt?: string;
  aranLastStatus?: 'ok' | 'error';
  aranLastMessage?: string;
}

export type ProductEntryMode = 'manual' | 'sheets';
export type SheetsImportStrategy = 'replace' | 'append';

export interface GoogleSheetsConfig {
  mode: ProductEntryMode;
  sheetUrl: string;
  sheetName: string;
  strategy: SheetsImportStrategy;
  lastImportedAt?: string;
}

export interface ProductTemplate {
  id: string;
  producto: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valor: number;
  valorUnitario?: number;
  imagen?: string;
  createdAt: string;
}

export interface SavedClient {
  id: string;
  cliente: string;
  contacto: string;
  telefono: string;
  correo: string;
  ubicacion: string;
  createdAt: string;
  updatedAt: string;
}

export type ClientsImportStrategy = 'upsert' | 'replace';

export interface ClientsImportConfig {
  sheetUrl: string;
  sheetName: string;
  appsScriptUrl: string;
  autoSyncToSheet: boolean;
  strategy: ClientsImportStrategy;
  lastImportedAt?: string;
}

export type AppSection =
  | 'editor'
  | 'preview'
  | 'clients'
  | 'history'
  | 'dashboard'
  | 'integration';
export type EditorTab =
  | 'cliente'
  | 'productos'
  | 'referencias'
  | 'terminos'
  | 'banco';
export type WorkspaceLayoutMode = 'split' | 'editor' | 'preview';
export type ThemeMode = 'light' | 'dark';
export type AutoRefreshMinutes = 5 | 10 | 30;
