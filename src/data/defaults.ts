import {
  BankAccountInfo,
  CompanyInfo,
  LogoAsset,
  PaymentScheduleItem,
  ProductLineItem,
  ProformaData,
  ProformaType,
  SpecBlock,
} from '../types/proforma';

export const DEFAULT_OLMO_MAIN_LOGO_URL =
  'https://lh3.googleusercontent.com/d/1PlUDro7TJHTMOK5aUf031-8KxUNlrsbM';

export const DEFAULT_PROFORMAS_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxV0ZS7mGZE-ZV_lqhkRDQXsJKzmAFvc3g8wtvE-VxUZP8UrS0G_JS_PNkU6ydwyzXT/exec';

export const DEFAULT_CLIENTS_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw8Ws1QBeHUd0KnO81Ny2mgllT79Fc_H_zG4xUzFmXtjlQ3kIkAGjGkHYR0xLuI4MGWtg/exec';

export const DEFAULT_OLMO_MAIN_LOGO: LogoAsset = {
  id: 'default-olmo-bn',
  name: 'OLMO B.N.',
  dataUrl: DEFAULT_OLMO_MAIN_LOGO_URL,
  width: 320,
  height: 92,
};

export const INITIAL_CONSECUTIVO = 2800;

export const PROFORMA_TYPE_OPTIONS: Array<{
  value: ProformaType;
  label: string;
  detailHeading: string;
}> = [
  {
    value: 'mobiliario',
    label: 'Mobiliario',
    detailHeading: 'DETALLE DE MOBILIARIO Y ALCANCE',
  },
  {
    value: 'puertas',
    label: 'Puertas',
    detailHeading: 'DETALLE DE PUERTAS Y ALCANCE',
  },
  {
    value: 'griferia',
    label: 'Grifería y Losa Sanitaria',
    detailHeading: 'DETALLE DE GRIFERÍA Y LOSA SANITARIA',
  },
  {
    value: 'cielos_pisos',
    label: 'Cielos o Pisos',
    detailHeading: 'DETALLE DE CIELOS / PISOS Y ALCANCE',
  },
];

export function getProformaTypeMeta(type?: ProformaType) {
  return (
    PROFORMA_TYPE_OPTIONS.find((opt) => opt.value === type) ??
    PROFORMA_TYPE_OPTIONS[0]
  );
}

export const CURRENCY_OPTIONS = [
  'USD ($)',
  'CRC (₡)',
  'EUR (€)',
];

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  nombreComercial: 'OLMO',
  razonSocial: 'OLMO DISEÑO Y MOBILIARIO S.A.',
  cedulaJuridica: '3-101-000000',
  telefono: '+506 2200-0000',
  correo: 'proyectos@olmodiseno.com',
  direccion: 'Escazú, San José, Costa Rica',
  sitioWeb: 'www.olmodiseno.com',
};

export const DEFAULT_BANK_ACCOUNT: BankAccountInfo = {
  entidadBancaria: 'BAC Credomatic',
  nombre: 'OLMO DISEÑO Y MOBILIARIO S.A.',
  cedulaJuridica: '3-101-000000',
  moneda: 'Dólares (USD)',
  cuenta: '900000000',
  cuentaIban: 'CR00010200009000000000',
};

export const DEFAULT_PAYMENT_SCHEDULE: PaymentScheduleItem[] = [
  {
    id: 'pago-1',
    concepto: '1er Pago — Formalización y Orden de Producción',
    porcentaje: 60,
  },
  {
    id: 'pago-2',
    concepto: '2do Pago — Avance de Fabricación / Entrega en Sitio',
    porcentaje: 30,
  },
  {
    id: 'pago-3',
    concepto: '3er Pago — Finalización de Instalación y Recepción',
    porcentaje: 10,
  },
  {
    id: 'pago-4',
    concepto: '4to Pago — Adicional / Ajuste (Opcional)',
    porcentaje: 0,
  },
];

export const DEFAULT_TERMINOS_CONDICIONES = `1. VALIDEZ DE LA PROFORMA: La presente cotización tiene una validez de 15 días naturales a partir de su fecha de emisión. Transcurrido este plazo, precios, disponibilidad de materiales y plazos de entrega quedan sujetos a revisión.

2. FORMALIZACIÓN Y PLAZO DE ENTREGA: El proyecto inicia formalmente una vez recibido el primer pago según el desglose establecido, la aprobación escrita de planos constructivos finales y la confirmación de acabados en sitio. El plazo estimado de fabricación e instalación se coordina según cronograma de obra (mobiliario nacional: 6 a 8 semanas; mobiliario importado línea europea: 14 a 16 semanas tras aprobación final).

3. RECTIFICACIÓN DE MEDIDAS EN SITIO: Las medidas definitivas serán verificadas en obra por nuestro equipo técnico únicamente cuando el espacio cuente con paredes repelladas/pintadas, pisos instalados y puntos eléctricos/hidráulicos definidos. Cualquier cambio posterior en obra civil que altere dimensiones aprobadas podrá generar ajustes de costo y tiempo.

4. ACCESOS, RESGUARDO Y CONDICIONES DE INSTALACIÓN: El cliente garantizará el libre acceso al inmueble, disponibilidad de energía eléctrica, iluminación, elevador de carga (si aplica) y condiciones limpias, secas y libres de polvo de obra gris durante los días de montaje.

5. MODIFICACIONES Y EXTRAS: Cualquier variación en diseño, distribución interna, accesorios o acabados solicitada después de emitida la orden de producción deberá aprobarse mediante adenda y se cotizará por separado.

6. ALMACENAJE: Si el mobiliario está listo para entrega según fecha acordada y el sitio no reúne condiciones para instalar por causas ajenas a OLMO, se otorgarán 15 días de bodegaje sin costo; posteriormente aplicará un cargo mensual de almacenaje y seguro.

7. GARANTÍA: OLMO otorga garantía de 2 años por defectos de fabricación e instalación en condiciones normales de uso residencial, y traslada la garantía de fábrica en herrajes europeos. No cubre daños por humedad excesiva, filtraciones, golpes, uso indebido o intervención de terceros.`;

export const DEFAULT_SPEC_BLOCKS: SpecBlock[] = [
  {
    id: 'spec-general',
    titulo: 'Mobiliario General — Fabricación Arquitectónica Nacional',
    subtitulo: 'Estructuras, tableros, cantos y herrajes',
    contenido: `• Cascos y estructuras interiores: Tablero aglomerado melamínico hidrófugo (resistente a la humedad) de 18 mm de espesor, alta densidad, con respaldo de 6 mm ranurado y fijado estructuralmente.
• Frentes y puertas: Tablero MDF o MDP laminado / termolaminado / enchapado según selección del proyecto, con enchapado de cantos en PVC de 1.0 mm a 2.0 mm adherido mediante termo-fusión PUR para sellado perimetral contra humedad.
• Herrajes y sistemas de movimiento: Bisagras de cazoleta 110° con cierre suave integrado y regulación tridimensional; correderas telescópicas ocultas de extracción total con amortiguación (capacidad 30–40 kg según módulo), marca Blum, Häfele o equivalente europeo.
• Zócalos y nivelación: Patas regulables de PVC de alta resistencia con zócalo desmontable en aluminio anodizado o PVC con sello inferior guarda-polvo.`,
  },
  {
    id: 'spec-aran',
    titulo: 'Línea Europea — Sistema Modular Tipo Aran Cucine',
    subtitulo: 'Acabados importados, frentes técnicos y accesorios',
    contenido: `• Módulos importados de fábrica italiana bajo estándares de calidad ISO 9001 y certificación ecológica E1 de bajas emisiones.
• Frentes disponibles en acabados lacado mate/brillante, PET anti-huella, laminado Fenix NTM o chapa de madera natural tratada, con tiradores integrados tipo gola en aluminio anodizado o apertura push-to-open.
• Cajoneras metálicas de pared delgada con laterales en acabado antracita/titanio, organizadores modulares internos y alfombrillas antideslizantes.
• Integración preparada para iluminación LED lineal empotrada (3000K cálido) con perfil difusor en aluminio y encendido por sensor o interruptor (fuentes y luminarias incluidas únicamente cuando se especifique en el ítem).`,
  },
  {
    id: 'spec-tecnicas',
    titulo: 'Secciones Técnicas, Previas de Obra y Exclusiones',
    subtitulo: 'Alcance de suministros y responsabilidades en sitio',
    contenido: `• Exclusiones generales (salvo indicación expresa en la descripción del ítem): Sobres de cuarzo, granito, mármol o porcelánico; salpicaderos de piedra; electrodomésticos, campanas, fregaderos, grifería, trituradores y accesorios decorativos.
• Previas e instalaciones: Toda acometida eléctrica (110V/220V), iluminación de techo, tubería de agua potable, desagües, ductos de extracción y nivelación de pisos/paredes a plomo deben ser ejecutados por el contratista de obra civil antes de la instalación del mobiliario.
• Sellado sanitario y acabados finales: Incluye ajuste fino de puertas/cajones, colocación de tiradores suministrados y limpieza básica del mobiliario instalado.`,
  },
];

export function createEmptyProductLine(
  proformaType: ProformaType = 'mobiliario'
): ProductLineItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    producto: '',
    descripcion: '',
    cantidad: 1,
    unidad: proformaType === 'cielos_pisos' ? 'm²' : 'und(s)',
    valor: 0,
    valorUnitario: proformaType === 'cielos_pisos' ? 0 : undefined,
    imagen: '',
  };
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createInitialProforma(consecutivo: number, isBlank = false): ProformaData {
  const today = getTodayISO();
  return {
    id: `prof-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    consecutivo,
    proformaType: 'mobiliario',
    company: { ...DEFAULT_COMPANY_INFO },
    additionalLogos: [],
    clientProject: {
      cliente: isBlank ? '' : '',
      contacto: '',
      telefono: '',
      correo: '',
      ubicacion: '',
      proyecto: '',
      fecha: today,
      validez: '15 Días',
      moneda: 'USD ($)',
    },
    items: [createEmptyProductLine('mobiliario')],
    visualReferences: [],
    taxRate: 13,
    terminosCondiciones: DEFAULT_TERMINOS_CONDICIONES,
    specBlocks: DEFAULT_SPEC_BLOCKS.map((b) => ({ ...b })),
    bankAccount: { ...DEFAULT_BANK_ACCOUNT },
    paymentSchedule: DEFAULT_PAYMENT_SCHEDULE.map((p) => ({ ...p })),
    signatures: {
      representanteTitulo: 'FIRMA REPRESENTANTE OLMO',
      representanteNombre: 'Dirección Comercial · OLMO Diseño & Mobiliario',
      clienteTitulo: 'FIRMA CLIENTE',
      clienteNombre: '',
    },
    notasFinales:
      'Para formalizar la orden de producción, sírvase remitir esta proforma firmada junto con el comprobante del primer pago al correo proyectos@olmodiseno.com.',
    updatedAt: new Date().toISOString(),
  };
}
