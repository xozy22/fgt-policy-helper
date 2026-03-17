import { useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import { FilterPanel } from './FilterPanel';
import { TrafficTable } from './TrafficTable';
import { ActionBar } from './ActionBar';
import type { TrafficEntry } from '../../types/traffic';

export function TrafficStep() {
  const trafficEntries = useAppStore(s => s.trafficEntries);
  const rawEntryCount = useAppStore(s => s.rawEntryCount);
  const getFilteredEntries = useAppStore(s => s.getFilteredEntries);
  const sortField = useAppStore(s => s.sortField);
  const sortDirection = useAppStore(s => s.sortDirection);
  const addMoreLogs = useAppStore(s => s.addMoreLogs);

  // Subscribe to these so the component re-renders when filters or
  // the show-consumed toggle change — getFilteredEntries() is a stable
  // function reference and would not trigger a re-render on its own.
  const activeFilters = useAppStore(s => s.activeFilters);
  const showConsumedEntries = useAppStore(s => s.showConsumedEntries);

  const filteredEntries = useMemo(
    () => getFilteredEntries(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFilters, showConsumedEntries, trafficEntries],
  );

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredEntries, sortField, sortDirection]);

  const totalUnique = trafficEntries.length;

  // ── Import More Logs ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function handleMoreLogsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const result = addMoreLogs(text);
      setImportMsg({ ok: result.ok, text: result.message });
      setTimeout(() => setImportMsg(null), 4000);
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Info bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900/80 border-b border-gray-800 text-xs text-gray-500 flex-shrink-0">
        <span><span className="text-white font-medium">{rawEntryCount}</span> raw log lines</span>
        <span className="text-gray-700">·</span>
        <span><span className="text-white font-medium">{totalUnique}</span> unique flows</span>
        <span className="text-gray-700">·</span>
        <span><span className="text-orange-400 font-medium">{filteredEntries.length}</span> shown</span>

        {/* Import More Logs button */}
        <span className="flex-1" />
        <input
          ref={fileInputRef}
          type="file"
          accept=".log,.txt"
          onChange={handleMoreLogsFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m-8-8h16" />
          </svg>
          Import More Logs
        </button>

        {/* Result toast */}
        {importMsg && (
          <span className={clsx(
            'px-2 py-1 rounded text-xs font-medium transition-all',
            importMsg.ok ? 'text-green-400 bg-green-900/30' : 'text-red-400 bg-red-900/30',
          )}>
            {importMsg.text}
          </span>
        )}
      </div>

      {/* Main area: FilterPanel + Table */}
      <div className="flex flex-1 overflow-hidden">
        <FilterPanel />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TrafficTable entries={sortedEntries as TrafficEntry[]} />
        </div>
      </div>

      {/* Action bar */}
      <ActionBar />
    </div>
  );
}
