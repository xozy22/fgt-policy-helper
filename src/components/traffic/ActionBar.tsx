import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import { AddressObjectModal } from '../objects/AddressObjectModal';
import { PolicyModal } from '../policy/PolicyModal';
import { BatchPolicyModal } from './BatchPolicyModal';
import { ConfirmDialog } from '../common/ConfirmDialog';

export function ActionBar() {
  const selectedEntryIds = useAppStore(s => s.selectedEntryIds);
  const policies = useAppStore(s => s.policies);
  const getFilteredEntries = useAppStore(s => s.getFilteredEntries);
  const selectAllFiltered = useAppStore(s => s.selectAllFiltered);
  const clearSelection = useAppStore(s => s.clearSelection);
  const setStep = useAppStore(s => s.setStep);
  const trafficEntries = useAppStore(s => s.trafficEntries);
  const showConsumed = useAppStore(s => s.showConsumedEntries);
  const setShowConsumed = useAppStore(s => s.setShowConsumedEntries);
  const deduplicateIgnoringSrcPort = useAppStore(s => s.deduplicateIgnoringSrcPort);
  // Subscribe so the "X filtered" count re-renders live on every filter change.
  const activeFilters = useAppStore(s => s.activeFilters);

  const [showAddrModal, setShowAddrModal]   = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showBatchModal, setShowBatchModal]  = useState(false);
  const [showDedupeConfirm, setShowDedupeConfirm] = useState(false);
  const [dedupeResult, setDedupeResult]     = useState<number | null>(null);

  const selectedCount = selectedEntryIds.size;
  const filteredCount = useMemo(
    () => getFilteredEntries().filter(e => e.consumedByPolicyId === null).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFilters, showConsumed, trafficEntries],
  );
  const totalAvailable = trafficEntries.filter(e => e.consumedByPolicyId === null).length;
  const consumedCount = trafficEntries.length - totalAvailable;

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-t border-gray-800 flex-shrink-0">
        {/* Left: stats & selection */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{totalAvailable} remaining</span>
          {filteredCount !== totalAvailable && (
            <span className="text-orange-400">{filteredCount} filtered</span>
          )}
          {consumedCount > 0 && (
            <button
              onClick={() => setShowConsumed(!showConsumed)}
              className={clsx(
                'text-xs px-2 py-0.5 rounded transition-colors',
                showConsumed ? 'text-green-400 bg-green-900/30' : 'text-gray-600 hover:text-gray-400',
              )}
            >
              {consumedCount} consumed {showConsumed ? '(visible)' : '(hidden)'}
            </button>
          )}
        </div>

        {/* Deduplicate button */}
        <button
          onClick={() => setShowDedupeConfirm(true)}
          disabled={totalAvailable === 0}
          className={clsx(
            'text-xs px-2 py-0.5 rounded border transition-colors',
            totalAvailable > 0
              ? 'border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200'
              : 'border-gray-800 text-gray-700 cursor-not-allowed',
          )}
          title="Remove entries with duplicate destination (ignores source port)"
        >
          Deduplicate
        </button>

        {dedupeResult !== null && (
          <span className="text-xs text-green-400">
            ✓ {dedupeResult} removed
          </span>
        )}

        <div className="flex-1" />

        {/* Center: selection actions */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-orange-400 font-medium">{selectedCount} selected</span>
            <button
              onClick={clearSelection}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              ✕ clear
            </button>
          </div>
        )}

        <button
          onClick={selectAllFiltered}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 border border-gray-700 rounded"
        >
          Select all filtered
        </button>

        {/* Right: primary actions */}
        <button
          onClick={() => setShowAddrModal(true)}
          disabled={selectedCount === 0}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded transition-colors border',
            selectedCount > 0
              ? 'border-blue-600 text-blue-400 hover:bg-blue-900/30'
              : 'border-gray-700 text-gray-600 cursor-not-allowed',
          )}
        >
          Create Address Object
        </button>

        <button
          onClick={() => setShowPolicyModal(true)}
          disabled={selectedCount === 0}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded transition-colors',
            selectedCount > 0
              ? 'bg-orange-600 hover:bg-orange-500 text-white'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed',
          )}
        >
          Create Policy
        </button>

        <button
          onClick={() => setShowBatchModal(true)}
          disabled={totalAvailable === 0}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded transition-colors border',
            totalAvailable > 0
              ? 'border-purple-600 text-purple-400 hover:bg-purple-900/30'
              : 'border-gray-700 text-gray-600 cursor-not-allowed',
          )}
          title="Create one policy per interface pair from all uncovered entries"
        >
          ⚡ Batch by Interface
        </button>

        <button
          onClick={() => setStep('output')}
          disabled={policies.length === 0}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded transition-colors',
            policies.length > 0
              ? 'bg-green-700 hover:bg-green-600 text-white'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed',
          )}
          title={policies.length === 0 ? 'Create at least one policy first' : ''}
        >
          Go to Output →
        </button>
      </div>

      {showAddrModal && (
        <AddressObjectModal onClose={() => setShowAddrModal(false)} />
      )}
      {showPolicyModal && (
        <PolicyModal onClose={() => setShowPolicyModal(false)} />
      )}
      {showBatchModal && (
        <BatchPolicyModal onClose={() => setShowBatchModal(false)} />
      )}
      {showDedupeConfirm && (
        <ConfirmDialog
          title="Deduplicate Entries"
          message={
            `Entries with the same source IP, interfaces, destination IP, destination port and protocol will be merged — regardless of source port.\n\nHit counts will be summed. This action can be undone with Ctrl+Z.`
          }
          confirmLabel="Deduplicate"
          cancelLabel="Cancel"
          onConfirm={() => {
            const removed = deduplicateIgnoringSrcPort();
            setShowDedupeConfirm(false);
            setDedupeResult(removed);
            setTimeout(() => setDedupeResult(null), 4000);
          }}
          onCancel={() => setShowDedupeConfirm(false)}
        />
      )}
    </>
  );
}
