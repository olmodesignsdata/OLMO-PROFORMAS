import { useCallback, useRef, useState } from 'react';
import { ProformaData } from '../types/proforma';

const MAX_HISTORY_STEPS = 45;
const BURST_WINDOW_MS = 750;

function findChangedFieldKey(prev: ProformaData, next: ProformaData): string {
  if (prev.id !== next.id) return `doc.id:${next.id}`;
  if (prev.consecutivo !== next.consecutivo) return 'doc.consecutivo';
  if ((prev.proformaType ?? 'mobiliario') !== (next.proformaType ?? 'mobiliario')) {
    return 'doc.proformaType';
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
    return `refs.structure:${nextRefs.length}`;
  }
  for (let i = 0; i < nextRefs.length; i++) {
    if (prevRefs[i] !== nextRefs[i]) {
      if (prevRefs[i].caption !== nextRefs[i].caption) {
        return `ref.${nextRefs[i].id}.caption`;
      }
      return `ref.${nextRefs[i].id}.image`;
    }
  }

  if (prev.company !== next.company) return 'doc.company';
  if (prev.bankAccount !== next.bankAccount) return 'doc.bankAccount';
  if (prev.signatures !== next.signatures) return 'doc.signatures';
  if (prev.specBlocks !== next.specBlocks) return 'doc.specBlocks';
  if (prev.paymentSchedule !== next.paymentSchedule) return 'doc.paymentSchedule';

  return 'doc.other';
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
  undo: () => ProformaData | null;
  redo: () => ProformaData | null;
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

        if (canCoalesce) {
          return {
            past: current.past,
            present: next,
            future: [],
          };
        }

        const nextPast = [...current.past, current.present].slice(
          -MAX_HISTORY_STEPS
        );
        return {
          past: nextPast,
          present: next,
          future: [],
        };
      });
    },
    []
  );

  const resetProforma = useCallback((next: ProformaData) => {
    lastEditFieldRef.current = null;
    lastEditAtRef.current = 0;
    setState({
      past: [],
      present: next,
      future: [],
    });
  }, []);

  const undo = useCallback((): ProformaData | null => {
    let restored: ProformaData | null = null;
    lastEditFieldRef.current = null;
    lastEditAtRef.current = 0;
    setState((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      restored = previous;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(
          0,
          MAX_HISTORY_STEPS
        ),
      };
    });
    return restored;
  }, []);

  const redo = useCallback((): ProformaData | null => {
    let restored: ProformaData | null = null;
    lastEditFieldRef.current = null;
    lastEditAtRef.current = 0;
    setState((current) => {
      if (current.future.length === 0) return current;
      const next = current.future[0];
      restored = next;
      return {
        past: [...current.past, current.present].slice(-MAX_HISTORY_STEPS),
        present: next,
        future: current.future.slice(1),
      };
    });
    return restored;
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
