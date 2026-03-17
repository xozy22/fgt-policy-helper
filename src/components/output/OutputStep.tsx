import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import type { FirewallPolicy } from '../../types/policy';
import { generateCliScript } from '../../lib/cliGenerator';
import { CliPreview } from './CliPreview';
import { PolicyModal } from '../policy/PolicyModal';

export function OutputStep() {
  const policies = useAppStore(s => s.policies);
  const addressObjects = useAppStore(s => s.addressObjects);
  const addressGroups = useAppStore(s => s.addressGroups);
  const serviceObjects = useAppStore(s => s.serviceObjects);
  const trafficEntries = useAppStore(s => s.trafficEntries);
  const deletePolicy = useAppStore(s => s.deletePolicy);
  const reorderPolicies = useAppStore(s => s.reorderPolicies);
  const setStep = useAppStore(s => s.setStep);
  const resetAll = useAppStore(s => s.resetAll);

  const [editingPolicy, setEditingPolicy] = useState<FirewallPolicy | null>(null);

  const uncoveredCount = trafficEntries.filter(e => e.consumedByPolicyId === null).length;

  const script = useMemo(
    () => generateCliScript(policies, addressObjects, addressGroups, serviceObjects),
    [policies, addressObjects, addressGroups, serviceObjects],
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
      {/* Warning if uncovered entries remain */}
      {uncoveredCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-yellow-900/30 border-b border-yellow-700/40 text-yellow-300 text-sm flex-shrink-0">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>
            <strong>{uncoveredCount}</strong> traffic entries are not covered by any policy.
          </span>
          <button
            onClick={() => setStep('traffic')}
            className="ml-auto text-yellow-300 underline hover:text-yellow-100 text-xs"
          >
            Back to Traffic →
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Policy list */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900">
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

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {sortedPolicies.length === 0 && (
              <p className="text-gray-600 text-sm text-center mt-8">No policies created yet.</p>
            )}

            {sortedPolicies.map((policy, index) => (
              <div
                key={policy.id}
                onDoubleClick={() => setEditingPolicy(policy)}
                title="Double-click to edit"
                className={clsx(
                  'bg-gray-800 rounded-lg p-3 border cursor-pointer transition-colors',
                  policy.action === 'accept'
                    ? 'border-green-800/50 hover:border-green-700/70'
                    : 'border-red-800/50 hover:border-red-700/70',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{policy.name}</p>
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

                  {/* Order controls */}
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors text-xs"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveDown(index)}
                      disabled={index === sortedPolicies.length - 1}
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors text-xs"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => deletePolicy(policy.id)}
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
          <CliPreview script={script} />
        </div>
      </div>

      {/* Edit Policy Modal */}
      {editingPolicy && (
        <PolicyModal
          onClose={() => setEditingPolicy(null)}
          editPolicy={editingPolicy}
        />
      )}
    </div>
  );
}
