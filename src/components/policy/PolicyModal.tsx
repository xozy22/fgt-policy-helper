import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import type { AddressObject, AddressGroup, FirewallPolicy } from '../../types/policy';
import { isIpInCidr, isIpInRange, subnetMaskToPrefix } from '../../lib/ipUtils';

interface Props {
  onClose: () => void;
  /** Pre-fill + edit an existing policy */
  editPolicy?: FirewallPolicy;
}

function protoToLabel(proto: number): string {
  switch (proto) {
    case 6:  return 'TCP';
    case 17: return 'UDP';
    case 1:  return 'ICMP';
    default: return `proto(${proto})`;
  }
}

interface SvcItem {
  key: string;
  proto: number;
  port: number;
  name: string;
  checked: boolean;
}

// ── Address coverage helpers ──────────────────────────────────────────────────

/** Returns true if the named address object/group covers ALL given IPs. */
function ipCoversAll(
  name: string,
  ips: string[],
  objects: AddressObject[],
  groups: AddressGroup[],
  depth = 0,
): boolean {
  if (depth > 8 || ips.length === 0) return true;
  if (name === 'all') return true;

  const obj = objects.find(o => o.name === name);
  if (obj) {
    return ips.every(ip => {
      if (obj.type === 'host')   return obj.ip === ip;
      if (obj.type === 'subnet') {
        const prefix = subnetMaskToPrefix(obj.mask ?? '255.255.255.255');
        return isIpInCidr(ip, `${obj.ip}/${prefix}`);
      }
      if (obj.type === 'range')  return isIpInRange(ip, obj.ip, obj.endIp ?? obj.ip);
      return false;
    });
  }

  const grp = groups.find(g => g.name === name);
  if (grp) {
    // Every IP must be covered by at least one member
    return ips.every(ip =>
      grp.members.some(m => ipCoversAll(m, [ip], objects, groups, depth + 1)),
    );
  }

  return false;
}

/**
 * From all available address objects/groups, suggest the most specific one
 * that covers ALL given IPs. Returns "all" if nothing matches.
 */
function suggestBestAddress(
  ips: string[],
  objects: AddressObject[],
  groups: AddressGroup[],
): string {
  if (ips.length === 0) return 'all';

  function score(name: string): number {
    const obj = objects.find(o => o.name === name);
    if (obj) {
      if (obj.type === 'host')   return 1000;
      if (obj.type === 'subnet') return 500 + subnetMaskToPrefix(obj.mask ?? '255.255.255.255');
      if (obj.type === 'range')  return 300;
    }
    return 100; // group
  }

  const matching: string[] = [];
  for (const o of objects) if (ipCoversAll(o.name, ips, objects, groups)) matching.push(o.name);
  for (const g of groups)  if (ipCoversAll(g.name, ips, objects, groups)) matching.push(g.name);

  if (matching.length === 0) return 'all';
  return matching.sort((a, b) => score(b) - score(a))[0] ?? 'all';
}

// ── Custom address dropdown ───────────────────────────────────────────────────

interface AddrSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  matchSet: Set<string>;
  label: string;
}

function AddrSelect({ value, onChange, options, matchSet, label }: AddrSelectProps) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef  = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const isMatch = matchSet.has(value) && value !== 'all';

  function openDrop() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setSearch('');
    setOpen(true);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        !dropRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = options.filter(o =>
    !search || o.toLowerCase().includes(search.toLowerCase()),
  );

  // Sort: matching ones first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const ma = matchSet.has(a) && a !== 'all' ? 0 : 1;
    const mb = matchSet.has(b) && b !== 'all' ? 0 : 1;
    if (ma !== mb) return ma - mb;
    if (a === 'all') return -1;
    if (b === 'all') return 1;
    return a.localeCompare(b);
  });

  return (
    <>
      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">{label}</label>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDrop()}
        className={clsx(
          'w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-left flex items-center gap-2 focus:outline-none transition-colors',
          isMatch
            ? 'border-green-600/70 hover:border-green-500'
            : 'border-gray-700 hover:border-gray-600',
        )}
      >
        <span className={clsx(
          'flex-1 truncate text-sm',
          isMatch ? 'text-green-300' : 'text-gray-200',
        )}>
          {value}
        </span>
        {isMatch && <span className="text-green-400 text-xs flex-shrink-0">✓</span>}
        <span className="text-gray-500 text-xs flex-shrink-0">▾</span>
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top:   dropPos.top,
            left:  dropPos.left,
            width: dropPos.width,
            zIndex: 9999,
          }}
          className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-h-60 overflow-hidden flex flex-col"
        >
          {options.length > 7 && (
            <div className="p-2 border-b border-gray-700/60">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter…"
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-orange-500"
              />
            </div>
          )}
          <div className="overflow-y-auto">
            {sorted.map(opt => {
              const isCurrentMatch = matchSet.has(opt) && opt !== 'all';
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false); }}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors',
                    opt === value
                      ? 'bg-orange-900/40 text-orange-300'
                      : 'text-gray-200 hover:bg-gray-700/70',
                  )}
                >
                  <span className={clsx(
                    'flex-1 truncate font-mono',
                    isCurrentMatch && opt !== value && 'text-green-300',
                  )}>
                    {opt}
                  </span>
                  {isCurrentMatch && (
                    <span className="text-green-400 text-xs flex-shrink-0">✓ match</span>
                  )}
                </button>
              );
            })}
            {sorted.length === 0 && (
              <p className="text-xs text-gray-500 px-3 py-2 italic">No results</p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PolicyModal({ onClose, editPolicy }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const trafficEntries     = useAppStore(s => s.trafficEntries);
  const selectedEntryIds   = useAppStore(s => s.selectedEntryIds);
  const getAllAddressNames  = useAppStore(s => s.getAllAddressNames);
  const addressObjects     = useAppStore(s => s.addressObjects);
  const addressGroups      = useAppStore(s => s.addressGroups);
  const serviceObjects     = useAppStore(s => s.serviceObjects);
  const createPolicy       = useAppStore(s => s.createPolicy);
  const updatePolicy       = useAppStore(s => s.updatePolicy);
  const createServiceObject = useAppStore(s => s.createServiceObject);

  const isEditMode = editPolicy !== undefined;

  // In create mode: currently selected entries. In edit mode: entries covered by this policy.
  const relevantEntries = useMemo(() => {
    if (isEditMode && editPolicy) {
      const coveredSet = new Set(editPolicy.coveredEntryIds);
      return trafficEntries.filter(e => coveredSet.has(e.id));
    }
    return trafficEntries.filter(e => selectedEntryIds.has(e.id));
  }, [isEditMode, editPolicy, trafficEntries, selectedEntryIds]);

  const { srcIntfs, dstIntfs, detectedServices } = useMemo(() => {
    const srcI = new Set(relevantEntries.map(e => e.srcintf));
    const dstI = new Set(relevantEntries.map(e => e.dstintf));
    const svcs = new Map<string, { proto: number; port: number }>();
    for (const e of relevantEntries) {
      const key = `${e.proto}:${e.dstport}`;
      if (!svcs.has(key)) svcs.set(key, { proto: e.proto, port: e.dstport });
    }
    return {
      srcIntfs: Array.from(srcI).sort(),
      dstIntfs: Array.from(dstI).sort(),
      detectedServices: Array.from(svcs.entries()).map(([key, s]) => ({ key, ...s })),
    };
  }, [relevantEntries]);

  // Unique IPs from relevant entries
  const srcIps = useMemo(
    () => [...new Set(relevantEntries.map(e => e.srcip))],
    [relevantEntries],
  );
  const dstIps = useMemo(
    () => [...new Set(relevantEntries.map(e => e.dstip))],
    [relevantEntries],
  );

  // Which address names cover all src / all dst IPs?
  const srcMatchSet = useMemo(() => {
    const s = new Set<string>(['all']);
    for (const o of addressObjects) if (ipCoversAll(o.name, srcIps, addressObjects, addressGroups)) s.add(o.name);
    for (const g of addressGroups)  if (ipCoversAll(g.name, srcIps, addressObjects, addressGroups)) s.add(g.name);
    return s;
  }, [srcIps, addressObjects, addressGroups]);

  const dstMatchSet = useMemo(() => {
    const s = new Set<string>(['all']);
    for (const o of addressObjects) if (ipCoversAll(o.name, dstIps, addressObjects, addressGroups)) s.add(o.name);
    for (const g of addressGroups)  if (ipCoversAll(g.name, dstIps, addressObjects, addressGroups)) s.add(g.name);
    return s;
  }, [dstIps, addressObjects, addressGroups]);

  const [name, setName]           = useState(editPolicy?.name ?? '');
  const [srcintf, setSrcintf]     = useState(editPolicy?.srcintf ?? srcIntfs[0] ?? '');
  const [dstintf, setDstintf]     = useState(editPolicy?.dstintf ?? dstIntfs[0] ?? '');
  // Edit mode: use existing addresses; create mode: auto-suggest best match
  const [srcaddr, setSrcaddr]     = useState(() =>
    editPolicy ? editPolicy.srcaddr : suggestBestAddress(srcIps, addressObjects, addressGroups),
  );
  const [dstaddr, setDstaddr]     = useState(() =>
    editPolicy ? editPolicy.dstaddr : suggestBestAddress(dstIps, addressObjects, addressGroups),
  );
  const [comment, setComment]     = useState(editPolicy?.comment ?? '');
  const [action, setAction]       = useState<'accept' | 'deny'>(editPolicy?.action ?? 'accept');
  const [logtraffic, setLogtraffic] = useState<'all' | 'utm' | 'disable'>(editPolicy?.logtraffic ?? 'all');
  const [useAll, setUseAll]       = useState(
    editPolicy ? (editPolicy.service[0] === 'ALL') : detectedServices.length === 0,
  );
  const [svcItems, setSvcItems]   = useState<SvcItem[]>(() => {
    // Edit mode: build items from existing policy services
    if (editPolicy && editPolicy.service[0] !== 'ALL') {
      return editPolicy.service.map((svcName, i) => {
        const existing = serviceObjects.find(s => s.name === svcName);
        const proto = existing?.protocol === 'TCP' ? 6 : existing?.protocol === 'UDP' ? 17 : 1;
        const port  = parseInt(existing?.portRange ?? '0', 10);
        return { key: `svc-${i}`, proto, port, name: svcName, checked: true };
      });
    }
    // Create mode: derive from detected services in selection
    return detectedServices.map(s => {
      const defaultName = s.proto === 1 ? 'ICMP' : `${protoToLabel(s.proto)}-${s.port}`;
      const existing = serviceObjects.find(
        so => so.name === defaultName || (
          so.protocol === (s.proto === 6 ? 'TCP' : s.proto === 17 ? 'UDP' : s.proto === 1 ? 'ICMP' : 'ANY') &&
          so.portRange === String(s.port)
        ),
      );
      return { ...s, name: existing?.name ?? defaultName, checked: true };
    });
  });
  const [error, setError]         = useState('');

  const addrOptions = ['all', ...getAllAddressNames()];

  function toggleSvc(key: string) {
    setSvcItems(items => items.map(i => i.key === key ? { ...i, checked: !i.checked } : i));
  }

  function updateSvcName(key: string, newName: string) {
    setSvcItems(items => items.map(i => i.key === key ? { ...i, name: newName } : i));
  }

  function handleConfirm() {
    if (!name.trim())   { setError('Policy name is required.');  return; }
    if (!srcintf)       { setError('Source interface is required.'); return; }
    if (!dstintf)       { setError('Destination interface is required.'); return; }

    let finalServices: string[];
    if (useAll) {
      finalServices = ['ALL'];
    } else {
      const checkedItems = svcItems.filter(i => i.checked);
      if (checkedItems.length === 0) { setError('Select at least one service, or enable "Use ALL".'); return; }
      finalServices = checkedItems.map(item => {
        const n = item.name.trim() || (item.proto === 1 ? 'ICMP' : `${protoToLabel(item.proto)}-${item.port}`);
        const existing = serviceObjects.find(s => s.name === n);
        if (existing) return existing.name;
        const svc = createServiceObject({
          name: n,
          protocol: item.proto === 1 ? 'ICMP' : item.proto === 17 ? 'UDP' : 'TCP',
          portRange: item.proto !== 1 ? String(item.port) : undefined,
        });
        return svc.name;
      });
    }

    if (isEditMode && editPolicy) {
      // Edit: update fields but keep coveredEntryIds unchanged
      updatePolicy(editPolicy.id, {
        name: name.trim(),
        srcintf,
        dstintf,
        srcaddr,
        dstaddr,
        service: finalServices,
        action,
        logtraffic,
        schedule: 'always',
        comment: comment.trim() || undefined,
      });
    } else {
      createPolicy({
        name: name.trim(),
        srcintf,
        dstintf,
        srcaddr,
        dstaddr,
        service: finalServices,
        action,
        logtraffic,
        schedule: 'always',
        comment:  comment.trim() || undefined,
        coveredEntryIds: relevantEntries.map(e => e.id),
      });
    }

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-[580px] max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">
            {isEditMode ? 'Edit Firewall Policy' : 'Create Firewall Policy'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Coverage info */}
          <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg px-3 py-2 text-xs text-blue-300">
            {isEditMode
              ? <>Covers <strong>{relevantEntries.length}</strong> traffic entries — only policy fields will be updated.</>
              : <>This policy will cover <strong>{relevantEntries.length}</strong> selected traffic entries.</>
            }
          </div>

          {/* Policy name */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Policy Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Allow-Solar-to-Internet"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Interfaces */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Source Interface</label>
              {srcIntfs.length > 1 ? (
                <select value={srcintf} onChange={e => setSrcintf(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500">
                  {srcIntfs.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              ) : (
                <input type="text" value={srcintf} onChange={e => setSrcintf(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-orange-500" />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Destination Interface</label>
              {dstIntfs.length > 1 ? (
                <select value={dstintf} onChange={e => setDstintf(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500">
                  {dstIntfs.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              ) : (
                <input type="text" value={dstintf} onChange={e => setDstintf(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-orange-500" />
              )}
            </div>
          </div>

          {/* Addresses — custom dropdowns to avoid native-select overflow issues */}
          <div className="grid grid-cols-2 gap-3">
            <AddrSelect
              label="Source Address"
              value={srcaddr}
              onChange={setSrcaddr}
              options={addrOptions}
              matchSet={srcMatchSet}
            />
            <AddrSelect
              label="Destination Address"
              value={dstaddr}
              onChange={setDstaddr}
              options={addrOptions}
              matchSet={dstMatchSet}
            />
          </div>

          {/* Services */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider">Services</label>
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useAll}
                  onChange={e => setUseAll(e.target.checked)}
                  className="accent-orange-500"
                />
                Use ALL
              </label>
            </div>
            {!useAll ? (
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg overflow-hidden">
                {svcItems.length === 0 ? (
                  <p className="text-xs text-gray-500 px-3 py-2 italic">No services detected from selection.</p>
                ) : (
                  svcItems.map(item => (
                    <div key={item.key} className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50 last:border-0">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleSvc(item.key)}
                        className="accent-orange-500 flex-shrink-0"
                      />
                      <span className="text-xs font-mono text-purple-300 flex-shrink-0 w-20">
                        {protoToLabel(item.proto)}{item.proto !== 1 ? `/${item.port}` : ''}
                      </span>
                      <input
                        type="text"
                        value={item.name}
                        onChange={e => updateSvcName(item.key, e.target.value)}
                        disabled={!item.checked}
                        placeholder="Service name"
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-orange-500 disabled:opacity-40"
                      />
                    </div>
                  ))
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500 px-1">Service will be set to "ALL" — matches any port/protocol.</p>
            )}
          </div>

          {/* Action & Log */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Action</label>
              <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
                {(['accept', 'deny'] as const).map(a => (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={clsx(
                      'flex-1 py-1.5 text-sm capitalize rounded-md transition-colors',
                      action === a
                        ? (a === 'accept' ? 'bg-green-700 text-white' : 'bg-red-700 text-white')
                        : 'text-gray-400 hover:text-gray-200',
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Log Traffic</label>
              <select
                value={logtraffic}
                onChange={e => setLogtraffic(e.target.value as 'all' | 'utm' | 'disable')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
              >
                <option value="all">all</option>
                <option value="utm">utm</option>
                <option value="disable">disable</option>
              </select>
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Comment (optional)</label>
            <input
              type="text"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="e.g. Solar inverter MQTT traffic"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isEditMode ? 'Save Changes' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}
