import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import type { TrafficEntry, FilterField, FilterOperator } from '../../types/traffic';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { guessSubnetFromIps } from '../../lib/ipUtils';

// ── Constants ────────────────────────────────────────────────────────────────

const ROW_H      = 38;   // px — must match py-* + line-height in the row div
const CHECKBOX_W = 44;   // px — left checkbox column

const PROTO_COLORS: Record<string, string> = {
  TCP:  'text-blue-400',
  UDP:  'text-purple-400',
  ICMP: 'text-yellow-400',
};

function ProtoLabel({ label }: { label: string }) {
  return (
    <span className={clsx('font-mono text-xs font-bold tracking-wide', PROTO_COLORS[label] ?? 'text-gray-400')}>
      {label}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span className={clsx(
      'text-xs px-1.5 py-0.5 rounded font-mono font-medium',
      action === 'accept' ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400',
    )}>
      {action}
    </span>
  );
}

// ── Column definitions ───────────────────────────────────────────────────────

interface ColumnDef {
  key: keyof TrafficEntry;
  label: string;
  initW: number;   // initial pixel width
  minW:  number;   // minimum pixel width when resizing
  render?: (entry: TrafficEntry) => React.ReactNode;
}

const COLUMNS: ColumnDef[] = [
  { key: 'srcip',      label: 'Src IP',   initW: 165, minW: 100, render: e => <span className="font-mono text-sm">{e.srcip}</span> },
  { key: 'srcport',    label: 'SPort',    initW: 75,  minW: 55,  render: e => <span className="font-mono text-sm text-gray-400">{e.srcport}</span> },
  { key: 'srcintf',    label: 'Src Intf', initW: 155, minW: 80,  render: e => <span className="text-sm text-cyan-300 truncate block">{e.srcintf}</span> },
  { key: 'dstip',      label: 'Dst IP',   initW: 165, minW: 100, render: e => <span className="font-mono text-sm">{e.dstip}</span> },
  { key: 'dstport',    label: 'DPort',    initW: 75,  minW: 55,  render: e => <span className="font-mono text-sm text-gray-400">{e.dstport}</span> },
  { key: 'dstintf',    label: 'Dst Intf', initW: 155, minW: 80,  render: e => <span className="text-sm text-cyan-300 truncate block">{e.dstintf}</span> },
  { key: 'protoLabel', label: 'Proto',    initW: 80,  minW: 55,  render: e => <ProtoLabel label={e.protoLabel} /> },
  { key: 'action',     label: 'Action',   initW: 95,  minW: 70,  render: e => <ActionBadge action={e.action} /> },
  { key: 'hitCount',   label: 'Hits',     initW: 60,  minW: 45,  render: e => <span className="text-sm text-gray-500 tabular-nums">{e.hitCount}</span> },
];

// ── Context-menu helpers ─────────────────────────────────────────────────────

interface CtxState { x: number; y: number; items: ContextMenuItem[] }

function buildMenuItems(
  col: keyof TrafficEntry,
  entry: TrafficEntry,
  addFilter: (c: { field: FilterField; operator: FilterOperator; value: string }) => void,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  if (col === 'srcip' || col === 'dstip') {
    const ip     = String(entry[col]);
    const field  = col as FilterField;
    const sub24  = guessSubnetFromIps([ip]).split('/')[0] + '/24';
    items.push({ label: `Filter: ${field} = ${ip}`,              onClick: () => addFilter({ field, operator: 'equals',     value: ip }) });
    items.push({ label: `Filter: ${field} in /24 (${sub24})`,    onClick: () => addFilter({ field, operator: 'in_subnet',  value: sub24 }) });
    items.push({ label: `Filter: ${field} ≠ ${ip}`,              onClick: () => addFilter({ field, operator: 'not_equals', value: ip }) });
  } else if (col === 'srcport' || col === 'dstport') {
    const port = String(entry[col]);
    const field = col as FilterField;
    items.push({ label: `Filter: ${field} = ${port}`, onClick: () => addFilter({ field, operator: 'equals',     value: port }) });
    items.push({ label: `Filter: ${field} ≠ ${port}`, onClick: () => addFilter({ field, operator: 'not_equals', value: port }) });
  } else if (col === 'srcintf' || col === 'dstintf') {
    const val  = String(entry[col]);
    const field = col as FilterField;
    items.push({ label: `Filter: ${field} = ${val}`,        onClick: () => addFilter({ field, operator: 'equals',     value: val }) });
    items.push({ label: `Filter: ${field} contains ${val}`, onClick: () => addFilter({ field, operator: 'contains',   value: val }) });
    items.push({ label: `Filter: ${field} ≠ ${val}`,        onClick: () => addFilter({ field, operator: 'not_equals', value: val }) });
  } else if (col === 'protoLabel') {
    const p = entry.protoLabel;
    items.push({ label: `Filter: proto = ${p}`, onClick: () => addFilter({ field: 'proto', operator: 'equals',     value: p }) });
    items.push({ label: `Filter: proto ≠ ${p}`, onClick: () => addFilter({ field: 'proto', operator: 'not_equals', value: p }) });
  } else if (col === 'action') {
    const v = entry.action;
    items.push({ label: `Filter: action = ${v}`, onClick: () => addFilter({ field: 'action', operator: 'equals',     value: v }) });
    items.push({ label: `Filter: action ≠ ${v}`, onClick: () => addFilter({ field: 'action', operator: 'not_equals', value: v }) });
  }
  return items;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props { entries: TrafficEntry[] }

export function TrafficTable({ entries }: Props) {
  const parentRef          = useRef<HTMLDivElement>(null);
  const headerCheckboxRef  = useRef<HTMLInputElement>(null);
  const resizingRef        = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const selectedEntryIds     = useAppStore(s => s.selectedEntryIds);
  const toggleEntrySelection = useAppStore(s => s.toggleEntrySelection);
  const selectAllFiltered    = useAppStore(s => s.selectAllFiltered);
  const clearSelection       = useAppStore(s => s.clearSelection);
  const setSortField         = useAppStore(s => s.setSortField);
  const sortField            = useAppStore(s => s.sortField);
  const sortDirection        = useAppStore(s => s.sortDirection);
  const addFilter            = useAppStore(s => s.addFilter);

  // ── Column widths (pixel-based state) ──────────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    () => Object.fromEntries(COLUMNS.map(c => [String(c.key), c.initW])),
  );

  function startResize(e: React.MouseEvent, key: string) {
    e.preventDefault();
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key]! };
    document.body.style.cursor      = 'col-resize';
    document.body.style.userSelect  = 'none';

    function onMouseMove(ev: MouseEvent) {
      if (!resizingRef.current) return;
      const { key: k, startX, startW } = resizingRef.current;
      const minW = COLUMNS.find(c => String(c.key) === k)!.minW;
      setColWidths(prev => ({ ...prev, [k]: Math.max(minW, startW + ev.clientX - startX) }));
    }
    function onMouseUp() {
      resizingRef.current = null;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  }

  // ── Select-all state ───────────────────────────────────────────────────────
  const availableInView = useMemo(
    () => entries.filter(e => e.consumedByPolicyId === null),
    [entries],
  );
  const allSelected  = availableInView.length > 0 && availableInView.every(e => selectedEntryIds.has(e.id));
  const someSelected = !allSelected && availableInView.some(e => selectedEntryIds.has(e.id));

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  // ── Context menu ───────────────────────────────────────────────────────────
  const [ctx, setCtx] = useState<CtxState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, col: keyof TrafficEntry, entry: TrafficEntry) => {
      e.preventDefault();
      e.stopPropagation();
      const items = buildMenuItems(col, entry, addFilter);
      if (items.length > 0) setCtx({ x: e.clientX, y: e.clientY, items });
    },
    [addFilter],
  );

  // ── Virtualizer ────────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
        No traffic entries match the current filters.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* ── Sticky header ───────────────────────────────────────────────── */}
        <div className="flex items-stretch bg-gray-900 border-b-2 border-gray-700 flex-shrink-0 overflow-x-hidden">

          {/* Select-all */}
          <div
            className="flex-shrink-0 flex items-center justify-center bg-gray-900"
            style={{ width: CHECKBOX_W }}
          >
            <input
              ref={headerCheckboxRef}
              type="checkbox"
              checked={allSelected}
              onChange={() => allSelected ? clearSelection() : selectAllFiltered()}
              className="w-4 h-4 accent-orange-500 cursor-pointer"
              title={allSelected ? 'Deselect all' : 'Select all visible'}
            />
          </div>

          {/* Column headers */}
          {COLUMNS.map(col => (
            <div
              key={String(col.key)}
              className="relative flex-shrink-0 border-l border-gray-800 select-none group/col"
              style={{ width: colWidths[String(col.key)] }}
            >
              {/* Sort button */}
              <button
                onClick={() => setSortField(col.key)}
                className={clsx(
                  'w-full h-full px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider flex items-center gap-1 hover:text-gray-300 transition-colors',
                  sortField === col.key ? 'text-orange-400' : 'text-gray-500',
                )}
              >
                {col.label}
                {sortField === col.key && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>

              {/* Drag-resize handle */}
              <div
                className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-10 flex items-center justify-end"
                onMouseDown={e => startResize(e, String(col.key))}
              >
                <div className="h-4 w-px bg-gray-700 group-hover/col:bg-orange-500/60 transition-colors" />
              </div>
            </div>
          ))}
        </div>

        {/* ── Virtualized rows ─────────────────────────────────────────────── */}
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vi => {
              const entry    = entries[vi.index]!;
              const selected = selectedEntryIds.has(entry.id);
              const consumed = entry.consumedByPolicyId !== null;

              return (
                <div
                  key={entry.id}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%',
                    // height pins the row to exactly ROW_H px — prevents visual overlap
                    // when rendered content varies by subpixel amounts
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <div
                    onClick={() => !consumed && toggleEntrySelection(entry.id)}
                    className={clsx(
                      'flex items-center h-full border-b border-gray-800',
                      consumed  ? 'opacity-40 cursor-default' : 'cursor-pointer',
                      !consumed && selected               && 'bg-orange-900/40',
                      !consumed && !selected && entry.action === 'deny' && 'bg-red-950/20 hover:bg-red-950/40',
                      !consumed && !selected && entry.action !== 'deny' && 'hover:bg-gray-800/80',
                    )}
                  >
                    {/* Checkbox */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{ width: CHECKBOX_W }}
                    >
                      {consumed
                        ? <span className="text-green-600 text-sm">✓</span>
                        : <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleEntrySelection(entry.id)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 accent-orange-500 cursor-pointer"
                          />
                      }
                    </div>

                    {/* Data cells */}
                    {COLUMNS.map(col => (
                      <div
                        key={String(col.key)}
                        className="flex-shrink-0 px-3 overflow-hidden border-l border-gray-800/40"
                        style={{ width: colWidths[String(col.key)], height: '100%', display: 'flex', alignItems: 'center' }}
                        onContextMenu={e => handleContextMenu(e, col.key, entry)}
                        title="Right-click to add filter"
                      >
                        {col.render ? col.render(entry) : String(entry[col.key])}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />
      )}
    </>
  );
}
