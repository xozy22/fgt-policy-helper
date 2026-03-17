import { useState } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import type { FilterField, FilterOperator } from '../../types/traffic';
import type { AddressObject, AddressGroup, AddressObjectType } from '../../types/policy';
import { subnetMaskToPrefix } from '../../lib/ipUtils';
import { AddressObjectModal } from '../objects/AddressObjectModal';

const FIELD_OPTIONS: { value: FilterField; label: string }[] = [
  { value: 'srcip',    label: 'Src IP' },
  { value: 'dstip',   label: 'Dst IP' },
  { value: 'srcport', label: 'Src Port' },
  { value: 'dstport', label: 'Dst Port' },
  { value: 'srcintf', label: 'Src Interface' },
  { value: 'dstintf', label: 'Dst Interface' },
  { value: 'proto',   label: 'Protocol' },
  { value: 'action',  label: 'Action' },
];

const OPERATOR_OPTIONS: Record<FilterField, { value: FilterOperator; label: string }[]> = {
  srcip: [
    { value: 'equals',     label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'in_subnet',  label: 'in subnet' },
    { value: 'in_range',   label: 'in range' },
  ],
  dstip: [
    { value: 'equals',     label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'in_subnet',  label: 'in subnet' },
    { value: 'in_range',   label: 'in range' },
  ],
  srcport: [
    { value: 'equals',     label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'in_range',   label: 'in range' },
  ],
  dstport: [
    { value: 'equals',     label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'in_range',   label: 'in range' },
  ],
  srcintf: [
    { value: 'equals',     label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'contains',   label: 'contains' },
  ],
  dstintf: [
    { value: 'equals',     label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'contains',   label: 'contains' },
  ],
  proto: [
    { value: 'equals',     label: '=' },
    { value: 'not_equals', label: '≠' },
  ],
  action: [
    { value: 'equals',     label: '=' },
    { value: 'not_equals', label: '≠' },
  ],
};

function getPlaceholder(field: FilterField, op: FilterOperator): string {
  if (field === 'srcip' || field === 'dstip') {
    if (op === 'in_subnet') return '192.168.1.0/24';
    if (op === 'in_range')  return '192.168.1.1-192.168.1.254';
    return '192.168.1.100';
  }
  if (field === 'srcport' || field === 'dstport') {
    if (op === 'in_range') return '8080-8090';
    return '443';
  }
  if (field === 'proto')  return 'TCP / UDP / ICMP / 6';
  if (field === 'action') return 'accept / deny';
  return '';
}

const TYPE_BADGE: Record<AddressObjectType, { label: string; cls: string }> = {
  host:   { label: 'HOST',   cls: 'bg-blue-900/50 text-blue-300 border-blue-700/50' },
  subnet: { label: 'SUBNET', cls: 'bg-green-900/50 text-green-300 border-green-700/50' },
  range:  { label: 'RANGE',  cls: 'bg-orange-900/50 text-orange-300 border-orange-700/50' },
};

function objectIpLine(type: AddressObjectType, ip: string, mask?: string, endIp?: string): string {
  if (type === 'host')   return `${ip}/32`;
  if (type === 'subnet') return `${ip}/${subnetMaskToPrefix(mask ?? '255.255.255.255')}`;
  if (type === 'range')  return `${ip} – ${endIp ?? ip}`;
  return ip;
}

type PanelTab = 'filters' | 'objects';
type EditTarget =
  | { kind: 'object'; item: AddressObject }
  | { kind: 'group';  item: AddressGroup }
  | null;

export function FilterPanel() {
  const [collapsed, setCollapsed]   = useState(false);
  const [tab, setTab]               = useState<PanelTab>('filters');
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const criteria          = useAppStore(s => s.activeFilters.criteria);
  const addFilter         = useAppStore(s => s.addFilter);
  const updateFilter      = useAppStore(s => s.updateFilter);
  const removeFilter      = useAppStore(s => s.removeFilter);
  const clearFilters      = useAppStore(s => s.clearFilters);
  const setFilterConnector = useAppStore(s => s.setFilterConnector);
  const reorderFilters    = useAppStore(s => s.reorderFilters);

  // ── Object state ─────────────────────────────────────────────────────────────
  const addressObjects     = useAppStore(s => s.addressObjects);
  const addressGroups      = useAppStore(s => s.addressGroups);
  const deleteAddressObject = useAppStore(s => s.deleteAddressObject);
  const deleteAddressGroup  = useAppStore(s => s.deleteAddressGroup);

  const totalObjects = addressObjects.length + addressGroups.length;

  function handleAddFilter() {
    addFilter({ field: 'srcip', operator: 'in_subnet', value: '' });
  }

  return (
    <div className={clsx(
      'flex flex-col bg-gray-900 border-r border-gray-800 transition-all duration-200 flex-shrink-0',
      collapsed ? 'w-10' : 'w-72',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800 flex-shrink-0">
        {!collapsed && (
          <div className="flex gap-0 flex-1">
            <button
              onClick={() => setTab('filters')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors',
                tab === 'filters'
                  ? 'bg-gray-800 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              Filters
              {criteria.length > 0 && (
                <span className="bg-orange-700/70 text-orange-200 text-xs px-1.5 py-0 rounded-full leading-5">
                  {criteria.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('objects')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors',
                tab === 'objects'
                  ? 'bg-gray-800 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              Objects
              {totalObjects > 0 && (
                <span className="bg-blue-700/70 text-blue-200 text-xs px-1.5 py-0 rounded-full leading-5">
                  {totalObjects}
                </span>
              )}
            </button>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-500 hover:text-gray-300 transition-colors ml-auto"
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
          </svg>
        </button>
      </div>

      {/* ── Filters tab ────────────────────────────────────────────────────────── */}
      {!collapsed && tab === 'filters' && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-0">
          {criteria.map((c, idx) => {
            const ops    = OPERATOR_OPTIONS[c.field];
            const isFirst = idx === 0;
            const isLast  = idx === criteria.length - 1;

            return (
              <div key={c.id}>
                <div className="bg-gray-800 rounded-lg p-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1">
                    <div className="flex flex-col">
                      <button
                        onClick={() => reorderFilters(idx, idx - 1)}
                        disabled={isFirst}
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors leading-none py-px"
                        title="Move up"
                      >▲</button>
                      <button
                        onClick={() => reorderFilters(idx, idx + 1)}
                        disabled={isLast}
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors leading-none py-px"
                        title="Move down"
                      >▼</button>
                    </div>
                    <select
                      value={c.field}
                      onChange={e => updateFilter(c.id, {
                        field: e.target.value as FilterField,
                        operator: OPERATOR_OPTIONS[e.target.value as FilterField][0]!.value,
                        value: '',
                      })}
                      className="flex-1 bg-gray-700 text-gray-200 text-xs rounded px-1.5 py-1 border border-gray-600 focus:outline-none focus:border-orange-500"
                    >
                      {FIELD_OPTIONS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      value={c.operator}
                      onChange={e => updateFilter(c.id, { operator: e.target.value as FilterOperator })}
                      className="w-24 bg-gray-700 text-gray-200 text-xs rounded px-1.5 py-1 border border-gray-600 focus:outline-none focus:border-orange-500"
                    >
                      {ops.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeFilter(c.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors px-1"
                      title="Remove filter"
                    >×</button>
                  </div>
                  <input
                    type="text"
                    value={c.value}
                    onChange={e => updateFilter(c.id, { value: e.target.value })}
                    placeholder={getPlaceholder(c.field, c.operator)}
                    className="w-full bg-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-orange-500 placeholder-gray-600 font-mono"
                  />
                </div>

                {!isLast && (
                  <div className="flex items-center gap-2 py-1.5 px-1">
                    <div className="flex-1 h-px bg-gray-700/60" />
                    <button
                      onClick={() => setFilterConnector(c.id, c.connector === 'AND' ? 'OR' : 'AND')}
                      title="Click to toggle AND / OR"
                      className={clsx(
                        'text-xs font-bold px-2.5 py-0.5 rounded-full border transition-colors select-none',
                        c.connector === 'AND'
                          ? 'text-orange-400 border-orange-600/60 hover:bg-orange-900/30 hover:border-orange-500'
                          : 'text-blue-400   border-blue-600/60   hover:bg-blue-900/30   hover:border-blue-500',
                      )}
                    >{c.connector}</button>
                    <div className="flex-1 h-px bg-gray-700/60" />
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={handleAddFilter}
            className={clsx(
              'w-full py-2 border border-dashed border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 text-xs rounded-lg transition-colors',
              criteria.length > 0 && 'mt-1',
            )}
          >
            + Add Filter
          </button>

          {criteria.length > 0 && (
            <button
              onClick={clearFilters}
              className="w-full py-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors mt-1"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* ── Objects tab ─────────────────────────────────────────────────────────── */}
      {!collapsed && tab === 'objects' && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

          {/* Address Objects */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Address Objects
              </span>
              <span className="text-xs text-gray-600">{addressObjects.length}</span>
            </div>

            {addressObjects.length === 0 ? (
              <p className="text-xs text-gray-600 italic px-1">None created yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {addressObjects.map(obj => {
                  const badge = TYPE_BADGE[obj.type];
                  return (
                    <div
                      key={obj.id}
                      onDoubleClick={() => setEditTarget({ kind: 'object', item: obj })}
                      title="Double-click to edit"
                      className="bg-gray-800 rounded-lg px-2.5 py-2 flex items-start gap-2 group cursor-pointer hover:bg-gray-700/60 transition-colors"
                    >
                      <span className={clsx(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5',
                        badge.cls,
                      )}>
                        {badge.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-200 font-medium truncate" title={obj.name}>
                          {obj.name}
                        </p>
                        <p className="text-[11px] text-gray-500 font-mono truncate">
                          {objectIpLine(obj.type, obj.ip, obj.mask, obj.endIp)}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteAddressObject(obj.id)}
                        title="Delete object"
                        className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 text-base leading-none"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-800" />

          {/* Address Groups */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Address Groups
              </span>
              <span className="text-xs text-gray-600">{addressGroups.length}</span>
            </div>

            {addressGroups.length === 0 ? (
              <p className="text-xs text-gray-600 italic px-1">None created yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {addressGroups.map(grp => (
                  <div
                    key={grp.id}
                    onDoubleClick={() => setEditTarget({ kind: 'group', item: grp })}
                    title="Double-click to edit"
                    className="bg-gray-800 rounded-lg px-2.5 py-2 flex items-start gap-2 group cursor-pointer hover:bg-gray-700/60 transition-colors"
                  >
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 bg-purple-900/50 text-purple-300 border-purple-700/50">
                      GROUP
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-200 font-medium truncate" title={grp.name}>
                        {grp.name}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate" title={grp.members.join(', ')}>
                        {grp.members.length} member{grp.members.length !== 1 ? 's' : ''}
                        {grp.members.length > 0 && (
                          <span className="font-mono"> · {grp.members.slice(0, 2).join(', ')}{grp.members.length > 2 ? '…' : ''}</span>
                        )}
                      </p>
                      {grp.comment && (
                        <p className="text-[11px] text-gray-600 italic truncate">{grp.comment}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteAddressGroup(grp.id)}
                      title="Delete group"
                      className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 text-base leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Edit modal ──────────────────────────────────────────────────────────── */}
      {editTarget?.kind === 'object' && (
        <AddressObjectModal
          editObject={editTarget.item}
          onClose={() => setEditTarget(null)}
        />
      )}
      {editTarget?.kind === 'group' && (
        <AddressObjectModal
          editGroup={editTarget.item}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
