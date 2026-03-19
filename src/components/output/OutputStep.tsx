import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import type { FirewallPolicy } from '../../types/policy';
import { generateCliScript } from '../../lib/cliGenerator';
import { CliPreview } from './CliPreview';
import { PolicyModal } from '../policy/PolicyModal';
import { ConfirmDialog } from '../common/ConfirmDialog';

export function OutputStep() {
  const policies         = useAppStore(s => s.policies);
  const addressObjects   = useAppStore(s => s.addressObjects);
  const addressGroups    = useAppStore(s => s.addressGroups);
  const serviceObjects   = useAppStore(s => s.serviceObjects);
  const trafficEntries   = useAppStore(s => s.trafficEntries);
  const deletePolicy     = useAppStore(s => s.deletePolicy);
  const reorderPolicies  = useAppStore(s => s.reorderPolicies);
  const setStep          = useAppStore(s => s.setStep);
  const resetAll         = useAppStore(s => s.resetAll);
  const fortiosVersion   = useAppStore(s => s.fortiosVersion);
  const setFortiosVersion = useAppStore(s => s.setFortiosVersion);

  const [editingPolicy, setEditingPolicy]   = useState<FirewallPolicy | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<FirewallPolicy | null>(null);
  const [showGaps, setShowGaps]             = useState(true);

  // ── Drag-and-drop state ──────────────────────────────────────────────────────
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== index) setOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      reorderPolicies(dragIndex, index);
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  // ── Coverage stats ──────────────────────────────────────────────────────────
  const totalEntries   = trafficEntries.length;
  const coveredEntries = trafficEntries.filter(e => e.consumedByPolicyId !== null).length;
  const uncoveredCount = totalEntries - coveredEntries;
  const coveragePct    = totalEntries > 0 ? Math.round((coveredEntries / totalEntries) * 100) : 0;

  // ── Coverage gaps grouped by interface pair (#11) ───────────────────────────
  const coverageGaps = useMemo(() => {
    const uncovered = trafficEntries.filter(e => e.consumedByPolicyId === null);
    const groups = new Map<string, { srcintf: string; dstintf: string; count: number }>();
    for (const e of uncovered) {
      const key = `${e.srcintf}→${e.dstintf}`;
      const g = groups.get(key) ?? { srcintf: e.srcintf, dstintf: e.dstintf, count: 0 };
      g.count++;
      groups.set(key, g);
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [trafficEntries]);

  // ── Policy conflict detection (#12): policies sharing the same intf pair ────
  const conflictPolicyIds = useMemo(() => {
    const pairMap = new Map<string, string[]>();
    for (const p of policies) {
      const key = `${p.srcintf}→${p.dstintf}`;
      const arr = pairMap.get(key) ?? [];
      arr.push(p.id);
      pairMap.set(key, arr);
    }
    const ids = new Set<string>();
    for (const arr of pairMap.values()) {
      if (arr.length > 1) arr.forEach(id => ids.add(id));
    }
    return ids;
  }, [policies]);

  const script = useMemo(
    () => generateCliScript(policies, addressObjects, addressGroups, serviceObjects, fortiosVersion),
    [policies, addressObjects, addressGroups, serviceObjects, fortiosVersion],
  );

  const sortedPolicies = [...policies].sort((a, b) => a.order - b.order);

  function moveUp(index: number) {
    if (index > 0) reorderPolicies(index, index - 1);
  }

  function moveDown(index: number) {
    if (index < policies.length - 1) reorderPolicies(index, index + 1);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Warning banner if uncovered entries remain */}
      {uncoveredCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-yellow-900/30 border-b border-yellow-700/40 text-yellow-300 text-sm flex-shrink-0">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>
            <strong>{uncoveredCount}</strong> traffic {uncoveredCount === 1 ? 'entry is' : 'entries are'} not covered by any policy.
          </span>
          <button
            onClick={() => setStep('traffic')}
            className="ml-auto text-yellow-300 underline hover:text-yellow-100 text-xs flex-shrink-0"
          >
            Back to Traffic →
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Policy list */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Policies ({policies.length})
            </span>
            <button
              onClick={() => setStep('traffic')}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← Back to Traffic
            </button>
          </div>

          {/* Coverage summary (#13) */}
          <div className="px-3 py-2.5 border-b border-gray-800 bg-gray-950/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400 font-medium">Coverage</span>
              <span className={clsx(
                'text-xs font-semibold',
                coveragePct === 100 ? 'text-green-400' : coveragePct >= 80 ? 'text-yellow-400' : 'text-red-400',
              )}>
                {coveragePct}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-2">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  coveragePct === 100 ? 'bg-green-500' : coveragePct >= 80 ? 'bg-yellow-500' : 'bg-red-500',
                )}
                style={{ width: `${coveragePct}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-xs font-semibold text-gray-200">{totalEntries}</p>
                <p className="text-[10px] text-gray-600">Total</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-green-400">{coveredEntries}</p>
                <p className="text-[10px] text-gray-600">Covered</p>
              </div>
              <div>
                <p className={clsx('text-xs font-semibold', uncoveredCount > 0 ? 'text-yellow-400' : 'text-gray-500')}>
                  {uncoveredCount}
                </p>
                <p className="text-[10px] text-gray-600">Uncovered</p>
              </div>
            </div>
          </div>

          {/* Policy list */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {sortedPolicies.length === 0 && (
              <p className="text-gray-600 text-sm text-center mt-8">No policies created yet.</p>
            )}

            {sortedPolicies.map((policy, index) => (
              <div
                key={policy.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={e => handleDragOver(e, index)}
                onDrop={e => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onDoubleClick={() => setEditingPolicy(policy)}
                title="Drag to reorder · Double-click to edit"
                className={clsx(
                  'bg-gray-800 rounded-lg p-3 border transition-all select-none',
                  // drop-target indicator: blue ring on the card being hovered
                  overIndex === index && dragIndex !== null && dragIndex !== index
                    ? 'border-orange-500 ring-1 ring-orange-500/40'
                    : policy.action === 'accept'
                      ? 'border-green-800/50 hover:border-green-700/70'
                      : 'border-red-800/50 hover:border-red-700/70',
                  // fade the card being dragged
                  dragIndex === index ? 'opacity-40 cursor-grabbing' : 'cursor-grab',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* Drag handle */}
                  <div className="flex flex-col items-center justify-center flex-shrink-0 pt-0.5 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing">
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                      <circle cx="2" cy="2"  r="1.5"/><circle cx="8" cy="2"  r="1.5"/>
                      <circle cx="2" cy="8"  r="1.5"/><circle cx="8" cy="8"  r="1.5"/>
                      <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Policy name + conflict badge (#12) */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-medium text-white truncate flex-1">{policy.name}</p>
                      {conflictPolicyIds.has(policy.id) && (
                        <span
                          className="flex-shrink-0 text-[10px] bg-amber-900/60 border border-amber-700/60 text-amber-300 px-1 py-0.5 rounded"
                          title="Another policy uses the same interface pair — check for overlap"
                        >
                          ⚠ conflict
                        </span>
                      )}
                    </div>
                    {policy.comment && (
                      <p className="text-xs text-gray-500 italic truncate mt-0.5">{policy.comment}</p>
                    )}
                    <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                      <p>
                        <span className="text-cyan-400">{policy.srcintf}</span>
                        {' → '}
                        <span className="text-cyan-400">{policy.dstintf}</span>
                      </p>
                      <p>
                        <span className="text-blue-300">{policy.srcaddr}</span>
                        {' → '}
                        <span className="text-blue-300">{policy.dstaddr}</span>
                      </p>
                      <p className="text-purple-300 truncate">
                        {policy.service.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={clsx(
                        'text-xs px-1.5 py-0.5 rounded',
                        policy.action === 'accept' ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400',
                      )}>
                        {policy.action}
                      </span>
                      <span className="text-xs text-gray-600">
                        {policy.coveredEntryIds.length} entries
                      </span>
                    </div>
                  </div>

                  {/* Order + action controls */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); moveUp(index); }}
                      disabled={index === 0}
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors text-xs"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); moveDown(index); }}
                      disabled={index === sortedPolicies.length - 1}
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors text-xs"
                      title="Move down"
                    >
                      ↓
                    </button>
                    {/* Edit button */}
                    <button
                      onClick={e => { e.stopPropagation(); setEditingPolicy(policy); }}
                      className="text-gray-600 hover:text-orange-400 transition-colors"
                      title="Edit policy"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                      </svg>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={e => { e.stopPropagation(); setDeletingPolicy(policy); }}
                      className="text-gray-600 hover:text-red-400 transition-colors text-xs"
                      title="Delete policy"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Coverage gaps (#11) */}
          {coverageGaps.length > 0 && (
            <div className="border-t border-gray-800">
              <button
                onClick={() => setShowGaps(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-yellow-400/80 hover:text-yellow-300 transition-colors"
              >
                <span>Coverage Gaps ({coverageGaps.length})</span>
                <span>{showGaps ? '▲' : '▼'}</span>
              </button>
              {showGaps && (
                <div className="px-3 pb-2 space-y-1.5">
                  {coverageGaps.map(gap => (
                    <div
                      key={`${gap.srcintf}→${gap.dstintf}`}
                      className="flex items-center justify-between bg-yellow-900/10 border border-yellow-800/30 rounded-md px-2.5 py-1.5"
                    >
                      <div>
                        <p className="text-xs font-mono text-yellow-300">
                          {gap.srcintf} → {gap.dstintf}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {gap.count} uncovered {gap.count === 1 ? 'entry' : 'entries'}
                        </p>
                      </div>
                      <button
                        onClick={() => setStep('traffic')}
                        className="text-[10px] text-yellow-500 hover:text-yellow-300 underline flex-shrink-0 ml-2"
                      >
                        Fix →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Object summary */}
          <div className="border-t border-gray-800 px-4 py-3 text-xs text-gray-500 space-y-1">
            <p>
              <span className="text-gray-400">{addressObjects.length}</span> address objects
            </p>
            {addressGroups.length > 0 && (
              <p>
                <span className="text-purple-400">{addressGroups.length}</span> address groups
              </p>
            )}
            <p>
              <span className="text-gray-400">{serviceObjects.length}</span> service objects
            </p>
          </div>

          {/* Reset */}
          <div className="border-t border-gray-800 p-3">
            <button
              onClick={() => {
                if (window.confirm('Start over? All data will be lost.')) {
                  resetAll();
                }
              }}
              className="w-full py-2 text-xs text-gray-600 hover:text-red-400 transition-colors border border-gray-800 hover:border-red-900 rounded-lg"
            >
              Start Over
            </button>
          </div>
        </div>

        {/* Right: CLI Preview */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <CliPreview
            script={script}
            fortiosVersion={fortiosVersion}
            onVersionChange={setFortiosVersion}
          />
        </div>
      </div>

      {/* Edit Policy Modal */}
      {editingPolicy && (
        <PolicyModal
          onClose={() => setEditingPolicy(null)}
          editPolicy={editingPolicy}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deletingPolicy && (
        <ConfirmDialog
          danger
          title="Delete Policy"
          message={`Are you sure you want to delete "${deletingPolicy.name}"? You can restore it with Undo (Ctrl+Z).`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => { deletePolicy(deletingPolicy.id); setDeletingPolicy(null); }}
          onCancel={() => setDeletingPolicy(null)}
        />
      )}
    </div>
  );
}
