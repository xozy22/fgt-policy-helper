import { useState, useMemo, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';

interface BatchRow {
  key:             string;
  srcintf:         string;
  dstintf:         string;
  entryIds:        string[];
  servicesSummary: string;
  name:            string;
  srcaddr:         string;
  dstaddr:         string;
  action:          'accept' | 'deny';
}

function protoLabel(proto: number): string {
  if (proto === 6)  return 'TCP';
  if (proto === 17) return 'UDP';
  if (proto === 1)  return 'ICMP';
  return `proto(${proto})`;
}

export function BatchPolicyModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const trafficEntries    = useAppStore(s => s.trafficEntries);
  const getAllAddressNames = useAppStore(s => s.getAllAddressNames);
  const createPolicy      = useAppStore(s => s.createPolicy);

  // Group uncovered entries by srcintf→dstintf
  const initialRows = useMemo<BatchRow[]>(() => {
    const uncovered = trafficEntries.filter(e => e.consumedByPolicyId === null);

    const groups = new Map<string, {
      srcintf:  string;
      dstintf:  string;
      entryIds: string[];
      svcs:     Map<string, { proto: number; port: number }>;
    }>();

    for (const e of uncovered) {
      const key = `${e.srcintf}→${e.dstintf}`;
      if (!groups.has(key)) {
        groups.set(key, { srcintf: e.srcintf, dstintf: e.dstintf, entryIds: [], svcs: new Map() });
      }
      const g = groups.get(key)!;
      g.entryIds.push(e.id);
      const svcKey = `${e.proto}:${e.dstport}`;
      if (!g.svcs.has(svcKey)) g.svcs.set(svcKey, { proto: e.proto, port: e.dstport });
    }

    return Array.from(groups.entries())
      .sort((a, b) => b[1].entryIds.length - a[1].entryIds.length)
      .map(([key, g]) => {
        const svcs = Array.from(g.svcs.values());
        const preview = svcs.slice(0, 4).map(s =>
          s.proto === 1 ? 'ICMP' : `${protoLabel(s.proto)}/${s.port}`,
        ).join(', ') + (svcs.length > 4 ? ` +${svcs.length - 4} more` : '');

        return {
          key,
          srcintf:         g.srcintf,
          dstintf:         g.dstintf,
          entryIds:        g.entryIds,
          servicesSummary: preview,
          name:            `Allow-${g.srcintf}-to-${g.dstintf}`,
          srcaddr:         'all',
          dstaddr:         'all',
          action:          'accept',
        };
      });
  }, [trafficEntries]);

  const [rows, setRows]       = useState<BatchRow[]>(initialRows);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialRows.map(r => r.key)),
  );

  const addrOptions = ['all', ...getAllAddressNames()];

  function updateRow(key: string, updates: Partial<BatchRow>) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...updates } : r));
  }

  function toggleRow(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.key)));
  }

  function handleCreate() {
    const toCreate = rows.filter(r => selected.has(r.key));
    for (const row of toCreate) {
      createPolicy({
        name:     row.name.trim() || `Policy-${row.srcintf}-${row.dstintf}`,
        srcintf:  row.srcintf,
        dstintf:  row.dstintf,
        srcaddr:  row.srcaddr,
        dstaddr:  row.dstaddr,
        service:  ['ALL'],
        action:   row.action,
        logtraffic: 'all',
        schedule: 'always',
        comment:  `Batch-created — ${row.entryIds.length} entries`,
        coveredEntryIds: row.entryIds,
      });
    }
    onClose();
  }

  const selectedCount = rows.filter(r => selected.has(r.key)).length;

  if (rows.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-gray-900 border border-gray-700 rounded-xl w-[480px] p-8 text-center shadow-2xl">
          <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-300 font-medium">All traffic entries are covered</p>
          <p className="text-gray-500 text-sm mt-1">No uncovered entries remain.</p>
          <button
            onClick={onClose}
            className="mt-5 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-[760px] max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold">Batch Create Policies by Interface Pair</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {rows.length} interface pair{rows.length !== 1 ? 's' : ''} with uncovered traffic — one policy per pair
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1.6rem_1fr_9rem_9rem_5.5rem] gap-2 px-4 py-2 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={selected.size === rows.length && rows.length > 0}
              onChange={toggleAll}
              className="accent-orange-500 w-3.5 h-3.5"
            />
          </label>
          <div>Policy Name / Traffic</div>
          <div>Src Addr</div>
          <div>Dst Addr</div>
          <div>Action</div>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
          {rows.map(row => (
            <div
              key={row.key}
              className={clsx(
                'grid grid-cols-[1.6rem_1fr_9rem_9rem_5.5rem] gap-2 items-center px-4 py-3 transition-colors',
                selected.has(row.key) ? '' : 'opacity-40',
              )}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={selected.has(row.key)}
                onChange={() => toggleRow(row.key)}
                className="accent-orange-500 w-4 h-4"
              />

              {/* Name + metadata */}
              <div className="min-w-0">
                <input
                  type="text"
                  value={row.name}
                  onChange={e => updateRow(row.key, { name: e.target.value })}
                  disabled={!selected.has(row.key)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-orange-500 disabled:opacity-40"
                />
                <div className="flex flex-wrap items-center gap-x-2 mt-1 text-xs text-gray-500">
                  <span className="font-mono text-cyan-400">
                    {row.srcintf} → {row.dstintf}
                  </span>
                  <span>·</span>
                  <span>{row.entryIds.length} entries</span>
                  {row.servicesSummary && (
                    <>
                      <span>·</span>
                      <span className="text-purple-400 truncate">{row.servicesSummary}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Src Addr */}
              <select
                value={row.srcaddr}
                onChange={e => updateRow(row.key, { srcaddr: e.target.value })}
                disabled={!selected.has(row.key)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-orange-500 disabled:opacity-40 w-full truncate"
              >
                {addrOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>

              {/* Dst Addr */}
              <select
                value={row.dstaddr}
                onChange={e => updateRow(row.key, { dstaddr: e.target.value })}
                disabled={!selected.has(row.key)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-orange-500 disabled:opacity-40 w-full truncate"
              >
                {addrOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>

              {/* Action */}
              <select
                value={row.action}
                onChange={e => updateRow(row.key, { action: e.target.value as 'accept' | 'deny' })}
                disabled={!selected.has(row.key)}
                className={clsx(
                  'bg-gray-800 border rounded px-2 py-1.5 text-xs focus:outline-none disabled:opacity-40 w-full',
                  row.action === 'accept'
                    ? 'border-green-700/60 text-green-400'
                    : 'border-red-700/60 text-red-400',
                )}
              >
                <option value="accept">accept</option>
                <option value="deny">deny</option>
              </select>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-800">
          <p className="text-xs text-gray-500">
            All services will default to <span className="text-purple-300 font-medium">ALL</span>.
            Edit policies individually afterwards to restrict services.
          </p>
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={selectedCount === 0}
              className={clsx(
                'px-5 py-2 text-sm font-medium rounded-lg transition-colors',
                selectedCount > 0
                  ? 'bg-orange-600 hover:bg-orange-500 text-white'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed',
              )}
            >
              Create {selectedCount} {selectedCount === 1 ? 'Policy' : 'Policies'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
