import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { TrafficEntry, FilterCriterion, ActiveFilters } from '../types/traffic';
import type { AddressObject, AddressGroup, ServiceObject, FirewallPolicy } from '../types/policy';
import type { WorkflowStep } from '../types/workflow';
import { parseLog } from '../lib/logParser';
import { deduplicateEntries } from '../lib/deduplication';
import { applyFilters } from '../lib/filtering';

interface AppState {
  step: WorkflowStep;
  rawEntryCount: number;
  skippedLineCount: number;
  errorLineCount: number;
  trafficEntries: TrafficEntry[];
  activeFilters: ActiveFilters;
  selectedEntryIds: Set<string>;
  addressObjects: AddressObject[];
  addressGroups: AddressGroup[];
  serviceObjects: ServiceObject[];
  policies: FirewallPolicy[];
  showConsumedEntries: boolean;
  sortField: keyof TrafficEntry;
  sortDirection: 'asc' | 'desc';
}

interface AppActions {
  importLog: (rawText: string) => { ok: boolean; message: string };
  addMoreLogs: (rawText: string) => { ok: boolean; message: string };
  resetAll: () => void;
  setStep: (step: WorkflowStep) => void;
  addFilter: (criterion: Omit<FilterCriterion, 'id' | 'connector'> & { connector?: 'AND' | 'OR' }) => void;
  updateFilter: (id: string, updates: Partial<Omit<FilterCriterion, 'id'>>) => void;
  removeFilter: (id: string) => void;
  clearFilters: () => void;
  setFilterConnector: (id: string, connector: 'AND' | 'OR') => void;
  reorderFilters: (fromIndex: number, toIndex: number) => void;
  toggleEntrySelection: (id: string) => void;
  selectAllFiltered: () => void;
  clearSelection: () => void;
  createAddressObject: (obj: Omit<AddressObject, 'id'>) => AddressObject;
  updateAddressObject: (id: string, updates: Partial<Omit<AddressObject, 'id'>>) => void;
  deleteAddressObject: (id: string) => void;
  createAddressGroup: (group: Omit<AddressGroup, 'id'>) => AddressGroup;
  updateAddressGroup: (id: string, updates: Partial<Omit<AddressGroup, 'id'>>) => void;
  deleteAddressGroup: (id: string) => void;
  createServiceObject: (svc: Omit<ServiceObject, 'id'>) => ServiceObject;
  deleteServiceObject: (id: string) => void;
  createPolicy: (policy: Omit<FirewallPolicy, 'id' | 'order'>) => void;
  updatePolicy: (id: string, updates: Partial<Omit<FirewallPolicy, 'id' | 'order'>>) => void;
  deletePolicy: (id: string) => void;
  reorderPolicies: (fromIndex: number, toIndex: number) => void;
  setSortField: (field: keyof TrafficEntry) => void;
  setShowConsumedEntries: (show: boolean) => void;
  getFilteredEntries: () => TrafficEntry[];
  getAvailableEntries: () => TrafficEntry[];
  getSelectedEntries: () => TrafficEntry[];
  getUniqueInterfaces: () => string[];
  getAllAddressNames: () => string[];
}

const defaultFilters: ActiveFilters = { criteria: [] };

const initialState: AppState = {
  step: 'import',
  rawEntryCount: 0,
  skippedLineCount: 0,
  errorLineCount: 0,
  trafficEntries: [],
  activeFilters: defaultFilters,
  selectedEntryIds: new Set(),
  addressObjects: [],
  addressGroups: [],
  serviceObjects: [],
  policies: [],
  showConsumedEntries: false,
  sortField: 'srcip',
  sortDirection: 'asc',
};

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  ...initialState,

  importLog: (rawText) => {
    const result = parseLog(rawText);
    if (result.entries.length === 0)
      return { ok: false, message: 'No valid traffic entries found in the log.' };
    const entries = deduplicateEntries(result.entries);
    set({
      rawEntryCount: result.entries.length,
      skippedLineCount: result.skippedLines,
      errorLineCount: result.errorLines,
      trafficEntries: entries,
      activeFilters: defaultFilters,
      selectedEntryIds: new Set(),
      step: 'traffic',
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
        hitDelta.has(e.id) ? { ...e, hitCount: e.hitCount + hitDelta.get(e.id)! } : e
      ),
      ...toAdd,
    ];
    set({ rawEntryCount: state.rawEntryCount + result.entries.length, trafficEntries: merged });
    return { ok: true, message: `Added ${toAdd.length} new flows (${newEntries.length - toAdd.length} duplicates merged).` };
  },

  resetAll: () => set({ ...initialState, selectedEntryIds: new Set() }),
  setStep: (step) => set({ step }),

  addFilter: (criterion) =>
    set(state => ({
      activeFilters: {
        criteria: [
          ...state.activeFilters.criteria,
          { connector: 'AND', ...criterion, id: uuidv4() },
        ],
      },
    })),

  updateFilter: (id, updates) =>
    set(state => ({
      activeFilters: {
        criteria: state.activeFilters.criteria.map(c => c.id === id ? { ...c, ...updates } : c),
      },
    })),

  removeFilter: (id) =>
    set(state => ({
      activeFilters: {
        criteria: state.activeFilters.criteria.filter(c => c.id !== id),
      },
    })),

  clearFilters: () => set(() => ({ activeFilters: { criteria: [] } })),

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

  createAddressObject: (obj) => {
    const newObj: AddressObject = { ...obj, id: uuidv4() };
    set(state => ({ addressObjects: [...state.addressObjects, newObj] }));
    return newObj;
  },
  updateAddressObject: (id, updates) =>
    set(state => ({ addressObjects: state.addressObjects.map(o => o.id === id ? { ...o, ...updates } : o) })),
  deleteAddressObject: (id) =>
    set(state => ({ addressObjects: state.addressObjects.filter(o => o.id !== id) })),

  createAddressGroup: (group) => {
    const newGroup: AddressGroup = { ...group, id: uuidv4() };
    set(state => ({ addressGroups: [...state.addressGroups, newGroup] }));
    return newGroup;
  },
  updateAddressGroup: (id, updates) =>
    set(state => ({ addressGroups: state.addressGroups.map(g => g.id === id ? { ...g, ...updates } : g) })),
  deleteAddressGroup: (id) =>
    set(state => ({ addressGroups: state.addressGroups.filter(g => g.id !== id) })),

  createServiceObject: (svc) => {
    const newSvc: ServiceObject = { ...svc, id: uuidv4() };
    set(state => ({ serviceObjects: [...state.serviceObjects, newSvc] }));
    return newSvc;
  },
  deleteServiceObject: (id) =>
    set(state => ({ serviceObjects: state.serviceObjects.filter(s => s.id !== id) })),

  createPolicy: (policy) => {
    const state = get();
    const newPolicy: FirewallPolicy = { ...policy, id: uuidv4(), order: state.policies.length };
    const consumed = new Set(policy.coveredEntryIds);
    const updatedEntries = state.trafficEntries.map(e =>
      consumed.has(e.id) ? { ...e, consumedByPolicyId: newPolicy.id } : e
    );
    set({ policies: [...state.policies, newPolicy], trafficEntries: updatedEntries, selectedEntryIds: new Set() });
  },

  updatePolicy: (id, updates) =>
    set(state => ({
      policies: state.policies.map(p => p.id === id ? { ...p, ...updates } : p),
    })),

  deletePolicy: (id) =>
    set(state => ({
      policies: state.policies.filter(p => p.id !== id).map((p, i) => ({ ...p, order: i })),
      trafficEntries: state.trafficEntries.map(e =>
        e.consumedByPolicyId === id ? { ...e, consumedByPolicyId: null } : e
      ),
    })),

  reorderPolicies: (fromIndex, toIndex) =>
    set(state => {
      const reordered = [...state.policies];
      const [moved] = reordered.splice(fromIndex, 1);
      if (moved) reordered.splice(toIndex, 0, moved);
      return { policies: reordered.map((p, i) => ({ ...p, order: i })) };
    }),

  setSortField: (field) =>
    set(state => ({
      sortField: field,
      sortDirection: state.sortField === field && state.sortDirection === 'asc' ? 'desc' : 'asc',
    })),

  setShowConsumedEntries: (show) => set({ showConsumedEntries: show }),

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
}));
