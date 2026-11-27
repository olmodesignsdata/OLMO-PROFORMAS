import { useCallback, useRef, useState } from 'react';
import { EditorTab, ProformaData } from '../types/proforma';

const MAX_HISTORY_STEPS = 45;
const BURST_WINDOW_MS = 750;

export interface UndoChangeInfo {
  tab: EditorTab;
  targetKey: string;
  label: string;
}

function findChangedFieldKey(prev: ProformaData, next: ProformaData): string {
  if (prev.id !== next.id) return `doc.id:${next.id}`;
  if (prev.consecutivo !== next.consecutivo) return 'doc.consecutivo';
  if ((prev.isDraft ?? false) !== (next.isDraft ?? false)) {
    return 'doc.consecutivo';
  }
  if ((prev.proformaType ?? 'mobiliario') !== (next.proformaType ?? 'mobiliario')) {
    return 'doc.proformaType';
  }
  if (prev.tableColumnWidthsByType !== next.tableColumnWidthsByType) {
    return 'doc.tableColumnWidths';
  }
  if (prev.taxRate !== next.taxRate) return 'doc.taxRate';
  if (prev.terminosCondiciones !== next.terminosCondiciones) {
    return 'doc.terminosCondiciones';
  }
  if (prev.notasFinales !== next.notasFinales) return 'doc.notasFinales';

  const cpKeys = Object.keys(next.clientProject) as Array<
    keyof ProformaData['clientProject']
  >;
  const changedCp = cpKeys.filter(
    (k) => prev.clientProject[k] !== next.clientProject[k]
  );
  if (changedCp.length === 1) return `cp.${changedCp[0]}`;
  if (changedCp.length > 1) return `cp.multi:${changedCp.join(',')}`;

  if (
    prev.items.length !== next.items.length ||
    prev.items.some((it, idx) => it.id !== next.items[idx]?.id)
  ) {
    // Si solo se agregó o modificó un ítem puntual en el destino, apuntar a él; si no, a la sección
    if (next.items.length > prev.items.length) {
      const added = next.items.find(
        (n) => !prev.items.some((p) => p.id === n.id)
      );
      if (added) return `item.${added.id}`;
    }
    return `items.structure:${next.items.length}`;
  }
  for (let i = 0; i < next.items.length; i++) {
    const a = prev.items[i];
    const b = next.items[i];
    if (a !== b) {
      if (a.producto !== b.producto) return `item.${b.id}.producto`;
      if (a.descripcion !== b.descripcion) return `item.${b.id}.descripcion`;
      if (a.cantidad !== b.cantidad) return `item.${b.id}.cantidad`;
      if (a.unidad !== b.unidad) return `item.${b.id}.unidad`;
      if (a.valorUnitario !== b.valorUnitario) return `item.${b.id}.valorUnitario`;
      if (a.valor !== b.valor) return `item.${b.id}.valor`;
      if (a.imagen !== b.imagen) return `item.${b.id}.imagen`;
      return `item.${b.id}`;
    }
  }

  const prevRefs = prev.visualReferences ?? [];
  const nextRefs = next.visualReferences ?? [];
  if (
    prevRefs.length !== nextRefs.length ||
    prevRefs.some((r, idx) => r.id !== nextRefs[idx]?.id)
  ) {
    if (nextRefs.length > prevRefs.length) {
      const addedRef = nextRefs.find(
        (n) => !prevRefs.some((p) => p.id === n.id)
      );
      if (addedRef) return `ref.${addedRef.id}`;
    }
    return `refs.structure:${nextRefs.length}`;
  }
  for (let i = 0; i < nextRefs.length; i++) {
    if (prevRefs[i] !== nextRefs[i]) {
      if (prevRefs[i].caption !== nextRefs[i].caption) {
        return `ref.${nextRefs[i].id}.caption`;
      }
      if (prevRefs[i].imageDataUrl !== nextRefs[i].imageDataUrl) {
        return `ref.${nextRefs[i].id}.image`;
      }
      return `ref.${nextRefs[i].id}.layout`;
    }
  }

  if (prev.company !== next.company) return 'doc.company';
  if (prev.bankAccount !== next.bankAccount) return 'doc.bankAccount';
  if (prev.signatures !== next.signatures) return 'doc.signatures';
  if (prev.specBlocks !== next.specBlocks) return 'doc.specBlocks';
  if (prev.paymentSchedule !== next.paymentSchedule) return 'doc.paymentSchedule';

  return 'doc.other';
}

function mapFieldKeyToUndoChange(
  fieldKey: string,
  nextData: ProformaData
): UndoChangeInfo {
  if (fieldKey === 'doc.consecutivo') {
    return {
      tab: 'cliente',
      targetKey: 'doc.consecutivo',
      label: 'Control de Consecutivo',
    };
  }
  if (fieldKey === 'doc.proformaType') {
    return {
      tab: 'cliente',
      targetKey: 'doc.proformaType',
      label: 'Tipo de Proforma',
    };
  }
  if (fieldKey === 'doc.tableColumnWidths') {
    return {
      tab: 'productos',
      targetKey: 'section-productos',
      label: 'Ancho de columnas de tabla',
    };
  }
  if (fieldKey === 'doc.taxRate') {
    return {
      tab: 'cliente',
      targetKey: 'doc.taxRate',
      label: 'IVA (%)',
    };
  }
  if (fieldKey === 'doc.company') {
    return {
      tab: 'cliente',
      targetKey: 'doc.company',
      label: 'Datos del estudio emisor',
    };
  }
  if (fieldKey.startsWith('cp.multi:')) {
    return {
      tab: 'cliente',
      targetKey: 'section-cliente-proyecto',
      label: 'Datos del Cliente y Proyecto',
    };
  }
  if (fieldKey.startsWith('cp.')) {
    return {
      tab: 'cliente',
      targetKey: fieldKey,
      label: 'Datos del Cliente y Proyecto',
    };
  }
  if (fieldKey.startsWith('items.structure:')) {
    return {
      tab: 'productos',
      targetKey: 'section-productos',
      label: 'Líneas de Producto y Alcance',
    };
  }
  if (fieldKey.startsWith('item.')) {
    const parts = fieldKey.split('.');
    const itemId = parts[1];
    const existsInNext = nextData.items.some((it) => it.id === itemId);
    return {
      tab: 'productos',
      targetKey: existsInNext ? `item.${itemId}` : 'section-productos',
      label: 'Líneas de Producto y Alcance',
    };
  }
  if (fieldKey.startsWith('refs.structure:')) {
    return {
      tab: 'referencias',
      targetKey: 'section-referencias',
      label: 'Referencias Visuales',
    };
  }
  if (fieldKey.startsWith('ref.')) {
    const parts = fieldKey.split('.');
    const refId = parts[1];
    const existsInNext = (nextData.visualReferences ?? []).some(
      (r) => r.id === refId
    );
    return {
      tab: 'referencias',
      targetKey: existsInNext ? `ref.${refId}` : 'section-referencias',
      label: 'Referencias Visuales',
    };
  }
  if (fieldKey === 'doc.terminosCondiciones') {
    return {
      tab: 'terminos',
      targetKey: 'section-terminos',
      label: 'Términos y Condiciones',
    };
  }
  if (fieldKey === 'doc.specBlocks') {
    return {
      tab: 'terminos',
      targetKey: 'section-specs',
      label: 'Especificaciones Técnicas',
    };
  }
  if (fieldKey === 'doc.bankAccount') {
    return {
      tab: 'banco',
      targetKey: 'section-banco',
      label: 'Cuenta Bancaria',
    };
  }
  if (fieldKey === 'doc.paymentSchedule') {
    return {
      tab: 'banco',
      targetKey: 'section-pagos',
      label: 'Desglose de Pagos',
    };
  }
  if (fieldKey === 'doc.notasFinales' || fieldKey === 'doc.signatures') {
    return {
      tab: 'banco',
      targetKey: 'section-firmas',
      label: 'Notas y Firmas',
    };
  }
  return {
    tab: 'cliente',
    targetKey: 'section-cliente-proyecto',
    label: 'Proforma',
  };
}

function isCoalesceableField(fieldKey: string): boolean {
  if (
    fieldKey.startsWith('cp.multi:') ||
    fieldKey.startsWith('items.structure:') ||
    fieldKey.startsWith('refs.structure:') ||
    fieldKey === 'doc.proformaType' ||
    fieldKey === 'doc.consecutivo' ||
    fieldKey.endsWith('.imagen') ||
    fieldKey.endsWith('.image')
  ) {
    return false;
  }
  return true;
}

export interface UndoRedoResult {
  restored: ProformaData;
  change: UndoChangeInfo;
}

export interface ProformaUndoRedoState {
  proforma: ProformaData;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  updateProforma: (
    updater: ProformaData | ((prev: ProformaData) => ProformaData)
  ) => void;
  resetProforma: (next: ProformaData) => void;
  undo: () => UndoRedoResult | null;
  redo: () => UndoRedoResult | null;
}

export function useProformaUndoRedo(
  initialProducer: () => ProformaData
): ProformaUndoRedoState {
  const [state, setState] = useState<{
    past: ProformaData[];
    present: ProformaData;
    future: ProformaData[];
  }>(() => ({
    past: [],
    present: initialProducer(),
    future: [],
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  const lastEditFieldRef = useRef<string | null>(null);
  const lastEditAtRef = useRef<number>(0);

  const updateProforma = useCallback(
    (updater: ProformaData | ((prev: ProformaData) => ProformaData)) => {
      const now = Date.now();
      setState((current) => {
        const next =
          typeof updater === 'function' ? updater(current.present) : updater;
        if (next === current.present) return current;

        const fieldKey = findChangedFieldKey(current.present, next);
        const canCoalesce =
          isCoalesceableField(fieldKey) &&
          lastEditFieldRef.current === fieldKey &&
          now - lastEditAtRef.current <= BURST_WINDOW_MS &&
          current.past.length > 0;

        lastEditFieldRef.current = fieldKey;
        lastEditAtRef.current = now;

        const nextState = canCoalesce
          ? {
              past: current.past,
              present: next,
              future: [],
            }
          : {
              past: [...current.past, current.present].slice(-MAX_HISTORY_STEPS),
              present: next,
              future: [],
            };
        stateRef.current = nextState;
        return nextState;
      });
    },
    []
  );

  const resetProforma = useCallback((next: ProformaData) => {
    lastEditFieldRef.current = null;
    lastEditAtRef.current = 0;
    const nextState = {
      past: [],
      present: next,
      future: [],
    };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const undo = useCallback((): UndoRedoResult | null => {
    const current = stateRef.current;
    if (current.past.length === 0) return null;
    const previous = current.past[current.past.length - 1];
    const fieldKey = findChangedFieldKey(current.present, previous);
    const change = mapFieldKeyToUndoChange(fieldKey, previous);

    lastEditFieldRef.current = null;
    lastEditAtRef.current = 0;

    const nextState = {
      past: current.past.slice(0, -1),
      present: previous,
      future: [current.present, ...current.future].slice(0, MAX_HISTORY_STEPS),
    };
    stateRef.current = nextState;
    setState(nextState);
    return { restored: previous, change };
  }, []);

  const redo = useCallback((): UndoRedoResult | null => {
    const current = stateRef.current;
    if (current.future.length === 0) return null;
    const next = current.future[0];
    const fieldKey = findChangedFieldKey(current.present, next);
    const change = mapFieldKeyToUndoChange(fieldKey, next);

    lastEditFieldRef.current = null;
    lastEditAtRef.current = 0;

    const nextState = {
      past: [...current.past, current.present].slice(-MAX_HISTORY_STEPS),
      present: next,
      future: current.future.slice(1),
    };
    stateRef.current = nextState;
    setState(nextState);
    return { restored: next, change };
  }, []);

  return {
    proforma: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undoCount: state.past.length,
    redoCount: state.future.length,
    updateProforma,
    resetProforma,
    undo,
    redo,
  };
}
