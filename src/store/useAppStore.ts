import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { TrafficEntry, FilterCriterion, ActiveFilters } from '../types/traffic';
import type { AddressObject, AddressGroup, ServiceObject, FirewallPolicy } from '../types/policy';
import type { WorkflowStep } from '../types/workflow';
import { parseLog } from '../lib/logParser';
import { deduplicateEntries } from '../lib/deduplication';
import { applyFilters } from '../lib/filtering';

// ── History snapshot (for undo/redo) ────────────────────────────────────────
interface AppSnapshot {
  trafficEntries: TrafficEntry[];
  addressObjects: AddressObject[];
  addressGroups:  AddressGroup[];
  serviceObjects: ServiceObject[];
  policies:       FirewallPolicy[];
}

interface AppState {
  step:              WorkflowStep;
  rawEntryCount:     number;
  skippedLineCount:  number;
  errorLineCount:    number;
  parseErrorDetails: string[];
  trafficEntries:    TrafficEntry[];
  activeFilters:     ActiveFilters;
  selectedEntryIds:  Set<string>;
  addressObjects:    AddressObject[];
  addressGroups:     AddressGroup[];
  serviceObjects:    ServiceObject[];
  policies:          FirewallPolicy[];
  showConsumedEntries: boolean;
  sortField:         keyof TrafficEntry;
  sortDirection:     'asc' | 'desc';
  // undo/redo stacks — not persisted
  _past:   AppSnapshot[];
  _future: AppSnapshot[];
}

interface AppActions {
  importLog:    (rawText: string) => { ok: boolean; message: string };
  addMoreLogs:  (rawText: string) => { ok: boolean; message: string };
  resetAll:     () => void;
  setStep:      (step: WorkflowStep) => void;

  addFilter:          (criterion: Omit<FilterCriterion, 'id' | 'connector'> & { connector?: 'AND' | 'OR' }) => void;
  updateFilter:       (id: string, updates: Partial<Omit<FilterCriterion, 'id'>>) => void;
  removeFilter:       (id: string) => void;
  clearFilters:       () => void;
  setFilterConnector: (id: string, connector: 'AND' | 'OR') => void;
  reorderFilters:     (fromIndex: number, toIndex: number) => void;

  toggleEntrySelection: (id: string) => void;
  selectAllFiltered:    () => void;
  clearSelection:       () => void;

  createAddressObject: (obj:   Omit<AddressObject, 'id'>)   => AddressObject;
  updateAddressObject: (id: string, updates: Partial<Omit<AddressObject, 'id'>>) => void;
  deleteAddressObject: (id: string) => void;

  createAddressGroup:  (group: Omit<AddressGroup, 'id'>)    => AddressGroup;
  updateAddressGroup:  (id: string, updates: Partial<Omit<AddressGroup, 'id'>>) => void;
  deleteAddressGroup:  (id: string) => void;

  createServiceObject: (svc:   Omit<ServiceObject, 'id'>)   => ServiceObject;
  deleteServiceObject: (id: string) => void;

  createPolicy:  (policy: Omit<FirewallPolicy, 'id' | 'order'>) => void;
  updatePolicy:  (id: string, updates: Partial<Omit<FirewallPolicy, 'id' | 'order'>>) => void;
  deletePolicy:  (id: string) => void;
  reorderPolicies: (fromIndex: number, toIndex: number) => void;

  setSortField:          (field: keyof TrafficEntry) => void;
  setShowConsumedEntries: (show: boolean) => void;

  undo: () => void;
  redo: () => void;

  getFilteredEntries:  () => TrafficEntry[];
  getAvailableEntries: () => TrafficEntry[];
  getSelectedEntries:  () => TrafficEntry[];
  getUniqueInterfaces: () => string[];
  getAllAddressNames:   () => string[];
}

const defaultFilters: ActiveFilters = { criteria: [] };

const initialState: AppState = {
  step:              'import',
  rawEntryCount:     0,
  skippedLineCount:  0,
  errorLineCount:    0,
  parseErrorDetails: [],
  trafficEntries:    [],
  activeFilters:     defaultFilters,
  selectedEntryIds:  new Set(),
  addressObjects:    [],
  addressGroups:     [],
  serviceObjects:    [],
  policies:          [],
  showConsumedEntries: false,
  sortField:         'srcip',
  sortDirection:     'asc',
  _past:             [],
  _future:           [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Take a snapshot of all mutable data. */
function snapshot(state: AppState): AppSnapshot {
  return {
    trafficEntries: state.trafficEntries,
    addressObjects: state.addressObjects,
    addressGroups:  state.addressGroups,
    serviceObjects: state.serviceObjects,
    policies:       state.policies,
  };
}

/**
 * After a filter change, prune the selection to only IDs that are still visible
 * (not consumed AND matches the new filters).
 */
function prunedSelection(state: AppState, newFilters: ActiveFilters): Set<string> {
  if (state.selectedEntryIds.size === 0) return state.selectedEntryIds;
  const visible = applyFilters(
    state.trafficEntries.filter(e => e.consumedByPolicyId === null),
    newFilters,
  );
  const visibleIds = new Set(visible.map(e => e.id));
  return new Set([...state.selectedEntryIds].filter(id => visibleIds.has(id)));
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ── Import ──────────────────────────────────────────────────────────────

      importLog: (rawText) => {
        const result = parseLog(rawText);
        if (result.entries.length === 0)
          return { ok: false, message: 'No valid traffic entries found in the log.' };
        const entries = deduplicateEntries(result.entries);
        set({
          rawEntryCount:     result.entries.length,
          skippedLineCount:  result.skippedLines,
          errorLineCount:    result.errorLines,
          parseErrorDetails: result.errorDetails,
          trafficEntries:    entries,
          activeFilters:     defaultFilters,
          selectedEntryIds:  new Set(),
          step:              'traffic',
          _past:             [],
          _future:           [],
        });
        return { ok: true, message: `Parsed ${entries.length} unique flows from ${result.entries.length} log lines.` };
      },

      addMoreLogs: (rawText) => {
        const state = get();
        const result = parseLog(rawText);
        if (result.entries.length === 0)
          return { ok: false, message: 'No valid traffic entries found.' };
        const newEntries = deduplicateEntries(result.entries);
        const existingIds = new Set(state.trafficEntries.map(e => e.id));
        const toAdd = newEntries.filter(e => !existingIds.has(e.id));
        const hitDelta = new Map<string, number>();
        for (const e of newEntries) {
          if (existingIds.has(e.id))
            hitDelta.set(e.id, (hitDelta.get(e.id) ?? 0) + e.hitCount);
        }
        const merged = [
          ...state.trafficEntries.map(e =>
            hitDelta.has(e.id) ? { ...e, hitCount: e.hitCount + hitDelta.get(e.id)! } : e,
          ),
          ...toAdd,
        ];
        set({ rawEntryCount: state.rawEntryCount + result.entries.length, trafficEntries: merged });
        return { ok: true, message: `Added ${toAdd.length} new flows (${newEntries.length - toAdd.length} duplicates merged).` };
      },

      resetAll: () => set({ ...initialState, selectedEntryIds: new Set(), _past: [], _future: [] }),
      setStep:  (step) => set({ step }),

      // ── Filters (prune selection on change) ─────────────────────────────────

      addFilter: (criterion) =>
        set(state => {
          const newFilters: ActiveFilters = {
            criteria: [
              ...state.activeFilters.criteria,
              { connector: 'AND', ...criterion, id: uuidv4() },
            ],
          };
          return { activeFilters: newFilters, selectedEntryIds: prunedSelection(state, newFilters) };
        }),

      updateFilter: (id, updates) =>
        set(state => {
          const newFilters: ActiveFilters = {
            criteria: state.activeFilters.criteria.map(c => c.id === id ? { ...c, ...updates } : c),
          };
          return { activeFilters: newFilters, selectedEntryIds: prunedSelection(state, newFilters) };
        }),

      removeFilter: (id) =>
        set(state => {
          const newFilters: ActiveFilters = {
            criteria: state.activeFilters.criteria.filter(c => c.id !== id),
          };
          return { activeFilters: newFilters, selectedEntryIds: prunedSelection(state, newFilters) };
        }),

      clearFilters: () =>
        set(state => ({
          activeFilters:    { criteria: [] },
          selectedEntryIds: prunedSelection(state, { criteria: [] }),
        })),

      setFilterConnector: (id, connector) =>
        set(state => ({
          activeFilters: {
            criteria: state.activeFilters.criteria.map(c =>
              c.id === id ? { ...c, connector } : c,
            ),
          },
        })),

      reorderFilters: (fromIndex, toIndex) =>
        set(state => {
          const next = [...state.activeFilters.criteria];
          const [moved] = next.splice(fromIndex, 1);
          if (moved) next.splice(toIndex, 0, moved);
          return { activeFilters: { criteria: next } };
        }),

      // ── Selection ───────────────────────────────────────────────────────────

      toggleEntrySelection: (id) =>
        set(state => {
          const next = new Set(state.selectedEntryIds);
          if (next.has(id)) next.delete(id); else next.add(id);
          return { selectedEntryIds: next };
        }),

      selectAllFiltered: () => {
        const state = get();
        const filtered = applyFilters(
          state.trafficEntries.filter(e => e.consumedByPolicyId === null),
          state.activeFilters,
        );
        set({ selectedEntryIds: new Set(filtered.map(e => e.id)) });
      },

      clearSelection: () => set({ selectedEntryIds: new Set() }),

      // ── Address objects ──────────────────────────────────────────────────────

      createAddressObject: (obj) => {
        const newObj: AddressObject = { ...obj, id: uuidv4() };
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          addressObjects: [...state.addressObjects, newObj],
        }));
        return newObj;
      },
      updateAddressObject: (id, updates) =>
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          addressObjects: state.addressObjects.map(o => o.id === id ? { ...o, ...updates } : o),
        })),
      deleteAddressObject: (id) =>
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          addressObjects: state.addressObjects.filter(o => o.id !== id),
        })),

      // ── Address groups ───────────────────────────────────────────────────────

      createAddressGroup: (group) => {
        const newGroup: AddressGroup = { ...group, id: uuidv4() };
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          addressGroups: [...state.addressGroups, newGroup],
        }));
        return newGroup;
      },
      updateAddressGroup: (id, updates) =>
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          addressGroups: state.addressGroups.map(g => g.id === id ? { ...g, ...updates } : g),
        })),
      deleteAddressGroup: (id) =>
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          addressGroups: state.addressGroups.filter(g => g.id !== id),
        })),

      // ── Service objects ──────────────────────────────────────────────────────

      createServiceObject: (svc) => {
        const newSvc: ServiceObject = { ...svc, id: uuidv4() };
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          serviceObjects: [...state.serviceObjects, newSvc],
        }));
        return newSvc;
      },
      deleteServiceObject: (id) =>
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          serviceObjects: state.serviceObjects.filter(s => s.id !== id),
        })),

      // ── Policies ─────────────────────────────────────────────────────────────

      createPolicy: (policy) => {
        const state = get();
        const newPolicy: FirewallPolicy = { ...policy, id: uuidv4(), order: state.policies.length };
        const consumed = new Set(policy.coveredEntryIds);
        const updatedEntries = state.trafficEntries.map(e =>
          consumed.has(e.id) ? { ...e, consumedByPolicyId: newPolicy.id } : e,
        );
        set({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          policies:        [...state.policies, newPolicy],
          trafficEntries:  updatedEntries,
          selectedEntryIds: new Set(),
        });
      },

      updatePolicy: (id, updates) =>
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          policies: state.policies.map(p => p.id === id ? { ...p, ...updates } : p),
        })),

      deletePolicy: (id) =>
        set(state => ({
          _past: [...state._past.slice(-19), snapshot(state)], _future: [],
          policies: state.policies
            .filter(p => p.id !== id)
            .map((p, i) => ({ ...p, order: i })),
          trafficEntries: state.trafficEntries.map(e =>
            e.consumedByPolicyId === id ? { ...e, consumedByPolicyId: null } : e,
          ),
        })),

      reorderPolicies: (fromIndex, toIndex) =>
        set(state => {
          const reordered = [...state.policies];
          const [moved] = reordered.splice(fromIndex, 1);
          if (moved) reordered.splice(toIndex, 0, moved);
          return {
            _past: [...state._past.slice(-19), snapshot(state)], _future: [],
            policies: reordered.map((p, i) => ({ ...p, order: i })),
          };
        }),

      // ── Undo / Redo ──────────────────────────────────────────────────────────

      undo: () => {
        const state = get();
        if (state._past.length === 0) return;
        const prev = state._past[state._past.length - 1]!;
        const cur  = snapshot(state);
        set({
          _past:   state._past.slice(0, -1),
          _future: [...state._future.slice(-19), cur],
          ...prev,
        });
      },

      redo: () => {
        const state = get();
        if (state._future.length === 0) return;
        const next = state._future[state._future.length - 1]!;
        const cur  = snapshot(state);
        set({
          _past:   [...state._past.slice(-19), cur],
          _future: state._future.slice(0, -1),
          ...next,
        });
      },

      // ── Misc ─────────────────────────────────────────────────────────────────

      setSortField: (field) =>
        set(state => ({
          sortField:     field,
          sortDirection: state.sortField === field && state.sortDirection === 'asc' ? 'desc' : 'asc',
        })),

      setShowConsumedEntries: (show) => set({ showConsumedEntries: show }),

      // ── Selectors ────────────────────────────────────────────────────────────

      getFilteredEntries: () => {
        const state = get();
        const base = state.showConsumedEntries
          ? state.trafficEntries
          : state.trafficEntries.filter(e => e.consumedByPolicyId === null);
        return applyFilters(base, state.activeFilters);
      },

      getAvailableEntries: () => get().trafficEntries.filter(e => e.consumedByPolicyId === null),

      getSelectedEntries: () => {
        const state = get();
        return state.trafficEntries.filter(e => state.selectedEntryIds.has(e.id));
      },

      getUniqueInterfaces: () => {
        const state = get();
        const s = new Set<string>();
        for (const e of state.trafficEntries) { s.add(e.srcintf); s.add(e.dstintf); }
        return Array.from(s).sort();
      },

      getAllAddressNames: () => {
        const state = get();
        return [
          ...state.addressObjects.map(o => o.name),
          ...state.addressGroups.map(g => g.name),
        ].sort();
      },
    }),

    // ── Persist config ────────────────────────────────────────────────────────
    {
      name: 'fgt-policy-v1',

      /** Serialise only plain data (no functions, no undo stacks). */
      partialize: (state) => ({
        step:              state.step,
        rawEntryCount:     state.rawEntryCount,
        skippedLineCount:  state.skippedLineCount,
        errorLineCount:    state.errorLineCount,
        parseErrorDetails: state.parseErrorDetails,
        trafficEntries:    state.trafficEntries,
        activeFilters:     state.activeFilters,
        // Set → array for JSON serialisation
        selectedEntryIds:  [...state.selectedEntryIds],
        addressObjects:    state.addressObjects,
        addressGroups:     state.addressGroups,
        serviceObjects:    state.serviceObjects,
        policies:          state.policies,
        showConsumedEntries: state.showConsumedEntries,
        sortField:         state.sortField,
        sortDirection:     state.sortDirection,
      }),

      /** Deserialise: restore Set and drop stale undo stacks. */
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown>;
        return {
          ...current,
          ...(p as object),
          selectedEntryIds: new Set((p['selectedEntryIds'] as string[] | undefined) ?? []),
          _past:   [],
          _future: [],
        };
      },
    },
  ),
);
