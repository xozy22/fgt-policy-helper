import { useState, useMemo, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import type { AddressObject, AddressGroup, AddressObjectType } from '../../types/policy';
import { guessSubnetFromIps, cidrToSubnetMask, isValidIp, ipToInt, intToIp } from '../../lib/ipUtils';

interface Props {
  onClose: () => void;
  /** Pre-fill + edit an existing address object */
  editObject?: AddressObject;
  /** Pre-fill + edit an existing address group */
  editGroup?: AddressGroup;
}

type IpSide = 'src' | 'dst';
type ModalMode = 'object' | 'group';

/** Returns the network address of `ip` for the given prefix length. */
function networkOfIp(ip: string, prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIp((ipToInt(ip) & mask) >>> 0);
}

/** Returns true if `ip` is an IPv4 dotted-decimal address. */
function isIPv4(ip: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

export function AddressObjectModal({ onClose, editObject, editGroup }: Props) {
  const isEditMode = editObject !== undefined || editGroup !== undefined;

  const trafficEntries       = useAppStore(s => s.trafficEntries);
  const selectedEntryIds     = useAppStore(s => s.selectedEntryIds);
  const createAddressObject  = useAppStore(s => s.createAddressObject);
  const updateAddressObject  = useAppStore(s => s.updateAddressObject);
  const createAddressGroup   = useAppStore(s => s.createAddressGroup);
  const updateAddressGroup   = useAppStore(s => s.updateAddressGroup);
  const addressObjects       = useAppStore(s => s.addressObjects);
  const addressGroups        = useAppStore(s => s.addressGroups);

  // Stable reference: only recalculates when the actual selection changes
  const selectedEntries = useMemo(
    () => trafficEntries.filter(e => selectedEntryIds.has(e.id)),
    [trafficEntries, selectedEntryIds],
  );

  const srcIps = useMemo(() => [...new Set(selectedEntries.map(e => e.srcip))], [selectedEntries]);
  const dstIps = useMemo(() => [...new Set(selectedEntries.map(e => e.dstip))], [selectedEntries]);

  // ── Shared state ─────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<ModalMode>(editGroup ? 'group' : 'object');
  const [error, setError] = useState('');

  // ── Address Object – single-mode state ───────────────────────────────────────
  const [side, setSide]   = useState<IpSide>('src');
  const [type, setType]   = useState<AddressObjectType>(editObject?.type ?? 'subnet');
  const [name, setName]   = useState(editObject?.name ?? '');
  const [ip, setIp]       = useState(editObject?.ip ?? '');
  const [mask, setMask]   = useState(editObject?.mask ?? '');
  const [endIp, setEndIp] = useState(editObject?.endIp ?? '');

  // ── Address Object – multi-mode state ────────────────────────────────────────
  const [itemNames, setItemNames]       = useState<Record<string, string>>({});
  const [itemEnabled, setItemEnabled]   = useState<Set<string>>(new Set());
  const [itemPrefixes, setItemPrefixes] = useState<Record<string, number>>({});
  const [createGroup, setCreateGroup]   = useState(true);
  const [groupName, setGroupName]       = useState('');

  // ── Address Group state ───────────────────────────────────────────────────────
  const [grpName, setGrpName]       = useState(editGroup?.name ?? '');
  const [grpComment, setGrpComment] = useState(editGroup?.comment ?? '');
  const [grpMembers, setGrpMembers] = useState<Set<string>>(new Set(editGroup?.members ?? []));

  // Wrap in useMemo to give activeIps a stable reference
  const activeIps = useMemo(
    () => side === 'src' ? srcIps : dstIps,
    [side, srcIps, dstIps],
  );

  // Multi-mode applies to host/subnet when more than one unique IP is present
  // Never in edit mode (editing an existing single object)
  const isMultiMode = !isEditMode && (type === 'host' || type === 'subnet') && activeIps.length > 1;

  // ── Multi-mode item keys ──────────────────────────────────────────────────────
  // One item per unique IP (sorted numerically).
  // Subnet mode: IPv4 only — FortiGate uses `config firewall address6` for IPv6.
  // Host mode: all IPs (IPv6 shown as-is with /128 placeholder in CLI).
  const multiItemsBase = useMemo<string[]>(() => {
    if (!isMultiMode) return [];
    const ips = type === 'subnet' ? activeIps.filter(isIPv4) : [...activeIps];
    return ips.sort((a, b) => {
      if (isIPv4(a) && isIPv4(b)) return ipToInt(a) - ipToInt(b);
      return a.localeCompare(b);
    });
  }, [isEditMode, activeIps, type]);

  // ── Display groups (subnet deduplicates by computed network+prefix) ──────────
  // IPs that map to the same network/prefix are collapsed into one row.
  // key = first IP in the group (used as state key); ips = all source IPs.
  const displayGroups = useMemo<{ key: string; ips: string[] }[]>(() => {
    if (!isMultiMode) return [];
    if (type !== 'subnet') return multiItemsBase.map(ip => ({ key: ip, ips: [ip] }));
    const seen = new Map<string, { key: string; ips: string[] }>();
    for (const ip of multiItemsBase) {
      const prefix = itemPrefixes[ip] ?? 24;
      const netKey = `${networkOfIp(ip, prefix)}/${prefix}`;
      if (!seen.has(netKey)) seen.set(netKey, { key: ip, ips: [] });
      seen.get(netKey)!.ips.push(ip);
    }
    return [...seen.values()];
  }, [isMultiMode, type, multiItemsBase, itemPrefixes]);

  // ── Auto-fill single-mode fields when side/type changes ──────────────────────
  useEffect(() => {
    if (isMultiMode || isEditMode) return;
    autoFill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, type]);

  // Ref guard: only reset item state when the actual content changes (prevents
  // infinite loops caused by reference instability in the dep chain)
  const prevMultiKeyRef = useRef('');

  // ── Reset multi-mode item state when the item list CONTENT changes ────────────
  useEffect(() => {
    const key = `${String(isMultiMode)}::${type}::${side}::${multiItemsBase.join(',')}`;
    if (key === prevMultiKeyRef.current) return; // content unchanged – skip setState
    prevMultiKeyRef.current = key;

    if (!isMultiMode) {
      setItemNames({});
      setItemEnabled(new Set());
      setItemPrefixes({});
      return;
    }
    const names: Record<string, string>    = {};
    const enabled = new Set<string>();
    const prefixes: Record<string, number> = {};
    for (const k of multiItemsBase) {
      const defaultPrefix = 24;
      prefixes[k] = defaultPrefix;
      names[k] = type === 'host'
        ? `HOST-${k}`
        : `${side.toUpperCase()}-${networkOfIp(k, defaultPrefix)}_${defaultPrefix}`;
      enabled.add(k);
    }
    setItemNames(names);
    setItemEnabled(enabled);
    setItemPrefixes(prefixes);
    const hint = type === 'subnet'
      ? (multiItemsBase.length === 1
          ? `${networkOfIp(multiItemsBase[0]!, 24)}_24`
          : `multi_24`)
      : guessSubnetFromIps(activeIps).replace('/', '_');
    setGroupName(`GRP-${side.toUpperCase()}-${hint}`);
  }, [multiItemsBase, isMultiMode, type, side, activeIps]);

  // ── Per-item prefix change (subnet multi-mode) ───────────────────────────────
  function handleItemPrefixChange(ip: string, newPrefix: number) {
    const oldPrefix  = itemPrefixes[ip] ?? 24;
    const oldNetwork = networkOfIp(ip, oldPrefix);
    const oldAutoName = `${side.toUpperCase()}-${oldNetwork}_${oldPrefix}`;
    const newNetwork  = networkOfIp(ip, newPrefix);
    const newAutoName = `${side.toUpperCase()}-${newNetwork}_${newPrefix}`;
    setItemPrefixes(prev => ({ ...prev, [ip]: newPrefix }));
    // Auto-update name only if it still matches the previously auto-generated name
    setItemNames(prev => {
      if ((prev[ip] ?? '') === oldAutoName) return { ...prev, [ip]: newAutoName };
      return prev;
    });
  }

  // ── Single-mode auto-fill ─────────────────────────────────────────────────────
  function autoFill() {
    if (activeIps.length === 0) return;
    if (type === 'host' && activeIps.length === 1) {
      setIp(activeIps[0]!);
      setName(`HOST-${activeIps[0]}`);
    } else if (type === 'subnet') {
      const cidr       = guessSubnetFromIps(activeIps);
      const [net, pfx] = cidr.split('/');
      setIp(net ?? '');
      setMask(cidrToSubnetMask(parseInt(pfx ?? '24', 10)));
      setName(`${side.toUpperCase()}-${cidr.replace('/', '_')}`);
    } else if (type === 'range') {
      const sorted = [...activeIps].sort((a, b) => ipToInt(a) - ipToInt(b));
      setIp(sorted[0]!);
      setEndIp(sorted[sorted.length - 1]!);
      setName(`RANGE-${sorted[0]}-${sorted[sorted.length - 1]}`);
    }
    setError('');
  }

  // ── Confirm object ────────────────────────────────────────────────────────────
  function handleConfirmObject() {
    setError('');

    // ── Edit mode ──
    if (isEditMode && editObject) {
      if (!name.trim()) { setError('Name is required.'); return; }
      if (!ip.trim() || !isValidIp(ip.trim())) { setError('Enter a valid IP address.'); return; }
      if (type === 'subnet' && (!mask.trim() || !isValidIp(mask.trim()))) {
        setError('Enter a valid subnet mask.'); return;
      }
      if (type === 'range' && (!endIp.trim() || !isValidIp(endIp.trim()))) {
        setError('Enter a valid end IP for the range.'); return;
      }
      updateAddressObject(editObject.id, {
        name:  name.trim(),
        type,
        ip:    ip.trim(),
        mask:  type === 'subnet' ? mask.trim() : undefined,
        endIp: type === 'range'  ? endIp.trim() : undefined,
      });
      onClose();
      return;
    }

    if (isMultiMode) {
      const enabledGroups = displayGroups.filter(g => itemEnabled.has(g.key));
      if (enabledGroups.length === 0) { setError('Select at least one item to create.'); return; }
      for (const { key } of enabledGroups) {
        if (!(itemNames[key] ?? '').trim()) { setError(`Name required for row with key ${key}.`); return; }
      }
      for (const { key } of enabledGroups) {
        const objName = itemNames[key]!.trim();
        if (type === 'host') {
          createAddressObject({ name: objName, type: 'host', ip: key, sourceIps: activeIps });
        } else {
          const prefix  = itemPrefixes[key] ?? 24;
          const network = networkOfIp(key, prefix);
          createAddressObject({
            name: objName,
            type: 'subnet',
            ip:   network,
            mask: cidrToSubnetMask(prefix),
            sourceIps: activeIps,
          });
        }
      }
      if (createGroup && groupName.trim()) {
        const members = enabledGroups.map(g => itemNames[g.key]!.trim()).filter(Boolean);
        createAddressGroup({ name: groupName.trim(), members });
      }
      onClose();
      return;
    }

    // Single mode
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!ip.trim() || !isValidIp(ip.trim())) { setError('Enter a valid IP address.'); return; }
    if (type === 'subnet' && (!mask.trim() || !isValidIp(mask.trim()))) {
      setError('Enter a valid subnet mask (e.g. 255.255.255.0).');
      return;
    }
    if (type === 'range' && (!endIp.trim() || !isValidIp(endIp.trim()))) {
      setError('Enter a valid end IP for the range.');
      return;
    }
    createAddressObject({
      name: name.trim(),
      type,
      ip: ip.trim(),
      mask:  type === 'subnet' ? mask.trim()  : undefined,
      endIp: type === 'range'  ? endIp.trim() : undefined,
      sourceIps: activeIps,
    });
    onClose();
  }

  // ── Confirm group ─────────────────────────────────────────────────────────────
  function handleConfirmGroup() {
    if (!grpName.trim())      { setError('Group name is required.'); return; }
    if (grpMembers.size === 0) { setError('Select at least one member.'); return; }

    if (isEditMode && editGroup) {
      updateAddressGroup(editGroup.id, {
        name:    grpName.trim(),
        members: Array.from(grpMembers),
        comment: grpComment.trim() || undefined,
      });
    } else {
      createAddressGroup({
        name:    grpName.trim(),
        members: Array.from(grpMembers),
        comment: grpComment.trim() || undefined,
      });
    }
    onClose();
  }

  function toggleMember(memberName: string) {
    setGrpMembers(prev => {
      const next = new Set(prev);
      if (next.has(memberName)) next.delete(memberName); else next.add(memberName);
      return next;
    });
  }

  // ── CLI previews ──────────────────────────────────────────────────────────────
  function cliPreview(): string {
    const n = name || '<name>';
    const i = ip   || '<ip>';
    switch (type) {
      case 'host':
        return `config firewall address\n    edit "${n}"\n        set type ipmask\n        set subnet ${i} 255.255.255.255\n    next\nend`;
      case 'subnet':
        return `config firewall address\n    edit "${n}"\n        set type ipmask\n        set subnet ${i} ${mask || '<mask>'}\n    next\nend`;
      case 'range':
        return `config firewall address\n    edit "${n}"\n        set type iprange\n        set start-ip ${i}\n        set end-ip ${endIp || '<end-ip>'}\n    next\nend`;
    }
  }

  function multiCliPreview(): string {
    const enabledGroups = displayGroups.filter(g => itemEnabled.has(g.key));
    const lines: string[] = ['config firewall address'];
    for (const { key } of enabledGroups) {
      const objName = (itemNames[key] ?? key) || `<name-${key}>`;
      lines.push(`    edit "${objName}"`);
      lines.push(`        set type ipmask`);
      if (type === 'host') {
        lines.push(`        set subnet ${key} 255.255.255.255`);
      } else {
        const pfx = itemPrefixes[key] ?? 24;
        lines.push(`        set subnet ${networkOfIp(key, pfx)} ${cidrToSubnetMask(pfx)}`);
      }
      lines.push(`    next`);
    }
    lines.push('end');
    if (createGroup && groupName.trim() && enabledGroups.length > 0) {
      const members = enabledGroups.map(g => `"${(itemNames[g.key] ?? g.key) || `<name-${g.key}>`}"`);
      lines.push('');
      lines.push('config firewall addrgrp');
      lines.push(`    edit "${groupName.trim()}"`);
      lines.push(`        set member ${members.join(' ')}`);
      lines.push(`    next`);
      lines.push('end');
    }
    return lines.join('\n');
  }

  function grpCliPreview(): string {
    const n       = grpName || '<name>';
    const members = grpMembers.size > 0
      ? Array.from(grpMembers).map(m => `"${m}"`).join(' ')
      : '<member1> <member2>';
    return `config firewall addrgrp\n    edit "${n}"\n        set member ${members}${grpComment ? `\n        set comment "${grpComment}"` : ''}\n    next\nend`;
  }

  // ── All available objects/groups for the Group tab ────────────────────────────
  const allAvailable = [
    ...addressObjects.map(o => ({ name: o.name, meta: `${o.type} · ${o.ip}`,                    isGroup: false })),
    ...addressGroups .map(g => ({ name: g.name, meta: `group · ${g.members.length} members`,    isGroup: true  })),
  ];

  // Footer button label
  const enabledCount  = isMultiMode ? displayGroups.filter(g => itemEnabled.has(g.key)).length : 0;
  const confirmLabel  = isEditMode
    ? 'Save Changes'
    : isMultiMode
      ? `Create ${enabledCount} Object${enabledCount !== 1 ? 's' : ''}${createGroup && groupName.trim() ? ' + Group' : ''}`
      : 'Create Address Object';

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-[640px] max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">
            {mode === 'object'
              ? (isEditMode ? 'Edit Address Object' : 'Create Address Object')
              : (isEditMode ? 'Edit Address Group'  : 'Create Address Group')}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">×</button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-gray-800">
          {(['object', 'group'] as ModalMode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              className={clsx(
                'flex-1 py-2.5 text-sm font-medium transition-colors',
                mode === m
                  ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-900/10'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              {m === 'object' ? 'Address Object' : 'Address Group'}
            </button>
          ))}
        </div>

        {/* ── Address Object Form ───────────────────────────────────────────── */}
        {mode === 'object' && (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

            {/* IP Side toggle — only in create mode */}
            {!isEditMode && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">IP Source</label>
                <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
                  {(['src', 'dst'] as IpSide[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={clsx(
                        'flex-1 py-1.5 text-sm rounded-md transition-colors',
                        side === s ? 'bg-blue-700 text-white' : 'text-gray-400 hover:text-gray-200',
                      )}
                    >
                      {s === 'src' ? `Source IPs (${srcIps.length})` : `Destination IPs (${dstIps.length})`}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {activeIps.slice(0, 20).map(i => (
                    <span key={i} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">{i}</span>
                  ))}
                  {activeIps.length > 20 && (
                    <span className="text-xs text-gray-500">+{activeIps.length - 20} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Object type */}
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Type</label>
              <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
                {(['host', 'subnet', 'range'] as AddressObjectType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={clsx(
                      'flex-1 py-1.5 text-sm rounded-md capitalize transition-colors',
                      type === t ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Multi-mode UI (host/subnet + multiple IPs) ────────────────── */}
            {isMultiMode ? (
              <>
                {/* Per-item list */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Objects to create
                    <span className="ml-2 text-blue-400 normal-case font-normal">
                      {displayGroups.filter(g => itemEnabled.has(g.key)).length} of {displayGroups.length} enabled
                    </span>
                  </label>
                  <div className="bg-gray-800/60 border border-gray-700 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    {displayGroups.map(({ key, ips }) => {
                      const prefix    = itemPrefixes[key] ?? 24;
                      const network   = type === 'subnet' ? networkOfIp(key, prefix) : '';
                      const isEnabled = itemEnabled.has(key);
                      const merged    = ips.length > 1;
                      return (
                        <div key={key} className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50 last:border-0">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => setItemEnabled(prev => {
                              const next = new Set(prev);
                              // toggle all IPs in this group together
                              for (const ip of ips) {
                                if (isEnabled) next.delete(ip); else next.add(ip);
                              }
                              return next;
                            })}
                            className="accent-blue-500 flex-shrink-0"
                          />
                          {/* IP / merged-IP column */}
                          <div className="w-32 flex-shrink-0 min-w-0">
                            {merged ? (
                              <div title={ips.join(', ')}>
                                <span className="text-xs font-mono text-blue-300">{ips.length} IPs</span>
                                <div className="text-xs text-gray-500 font-mono truncate">
                                  {ips.slice(0, 2).join(', ')}{ips.length > 2 ? ` +${ips.length - 2}` : ''}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs font-mono text-blue-300">{key}</span>
                            )}
                          </div>
                          {type === 'subnet' && (
                            <>
                              <select
                                value={prefix}
                                onChange={e => {
                                  const p = parseInt(e.target.value, 10);
                                  // apply to all IPs in group so they stay grouped
                                  for (const ip of ips) handleItemPrefixChange(ip, p);
                                }}
                                disabled={!isEnabled}
                                className="bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-40 flex-shrink-0"
                              >
                                {[8, 16, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32].map(p => (
                                  <option key={p} value={p}>/{p}</option>
                                ))}
                              </select>
                              <span className="text-xs text-gray-500 font-mono flex-shrink-0">→ {network}/{prefix}</span>
                            </>
                          )}
                          <input
                            type="text"
                            value={itemNames[key] ?? ''}
                            onChange={e => setItemNames(prev => ({ ...prev, [key]: e.target.value }))}
                            disabled={!isEnabled}
                            className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500 disabled:opacity-40"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Create group option */}
                <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-3 flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={createGroup}
                      onChange={e => setCreateGroup(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-300">Also create address group</span>
                  </label>
                  {createGroup && (
                    <input
                      type="text"
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      placeholder="e.g. GRP-Solar-Hosts"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                    />
                  )}
                </div>

                {/* Multi-mode CLI preview */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">CLI Preview</label>
                  <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre max-h-48 overflow-y-auto">
                    {multiCliPreview()}
                  </pre>
                </div>
              </>
            ) : (
              /* ── Single-mode form fields ────────────────────────────────── */
              <>
                {/* Name */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. SRC-192.168.11.0_24"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* IP fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                      {type === 'range' ? 'Start IP' : 'IP Address'}
                    </label>
                    <input
                      type="text"
                      value={ip}
                      onChange={e => setIp(e.target.value)}
                      placeholder="192.168.11.0"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  {type === 'subnet' && (
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Subnet Mask</label>
                      <input
                        type="text"
                        value={mask}
                        onChange={e => setMask(e.target.value)}
                        placeholder="255.255.255.0"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                  {type === 'range' && (
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">End IP</label>
                      <input
                        type="text"
                        value={endIp}
                        onChange={e => setEndIp(e.target.value)}
                        placeholder="192.168.11.254"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={autoFill}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors self-start"
                >
                  ↺ Auto-suggest from selection
                </button>

                {/* Single-mode CLI preview */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">CLI Preview</label>
                  <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre">
                    {cliPreview()}
                  </pre>
                </div>
              </>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        )}

        {/* ── Address Group Form ────────────────────────────────────────────── */}
        {mode === 'group' && (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Group Name</label>
              <input
                type="text"
                value={grpName}
                onChange={e => setGrpName(e.target.value)}
                placeholder="e.g. GRP-Solar-Devices"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Comment (optional)</label>
              <input
                type="text"
                value={grpComment}
                onChange={e => setGrpComment(e.target.value)}
                placeholder="e.g. All solar network hosts"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                Members
                {grpMembers.size > 0 && (
                  <span className="ml-2 text-blue-400 normal-case">{grpMembers.size} selected</span>
                )}
              </label>
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                {allAvailable.length === 0 ? (
                  <p className="text-xs text-gray-500 px-3 py-3 italic">
                    No address objects created yet. Create address objects first.
                  </p>
                ) : (
                  allAvailable.map(item => (
                    <label
                      key={item.name}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-700/50 cursor-pointer border-b border-gray-700/50 last:border-0 select-none"
                    >
                      <input
                        type="checkbox"
                        checked={grpMembers.has(item.name)}
                        onChange={() => toggleMember(item.name)}
                        className="accent-blue-500 flex-shrink-0"
                      />
                      <span className={clsx(
                        'text-xs font-medium flex-1',
                        item.isGroup ? 'text-purple-300' : 'text-gray-200',
                      )}>
                        {item.name}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">{item.meta}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">CLI Preview</label>
              <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre">
                {grpCliPreview()}
              </pre>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          {mode === 'object' ? (
            <button
              onClick={handleConfirmObject}
              className="px-5 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {confirmLabel}
            </button>
          ) : (
            <button
              onClick={handleConfirmGroup}
              className="px-5 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isEditMode ? 'Save Changes' : 'Create Address Group'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
