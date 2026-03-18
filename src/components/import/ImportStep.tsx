import { useState } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import { FileDropZone } from './FileDropZone';
import { PasteInput } from './PasteInput';
import { parseLog } from '../../lib/logParser';

type Tab = 'upload' | 'paste';

interface Feedback {
  ok: boolean;
  message: string;
  details?: string[];
}

export function ImportStep() {
  const [tab, setTab] = useState<Tab>('upload');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const importLog = useAppStore(s => s.importLog);

  function handleText(text: string) {
    // Parse first so we can capture error details even on success
    const parsed = parseLog(text);
    const result = importLog(text);

    if (!result.ok) {
      setFeedback({
        ok:      false,
        message: result.message,
        details: parsed.errorDetails.length > 0 ? parsed.errorDetails : undefined,
      });
    } else if (parsed.errorLines > 0) {
      // Succeeded but there were some bad lines — surface them as a warning
      setFeedback({
        ok:      true,
        message: result.message,
        details: parsed.errorDetails.length > 0
          ? [`${parsed.errorLines} lines could not be parsed:`, ...parsed.errorDetails]
          : undefined,
      });
      // On success the store switches step automatically after a short delay
    }
    // On clean success with no errors: no feedback needed (step changes)
  }

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="w-full max-w-2xl">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Import Traffic Log</h1>
          <p className="text-gray-400 text-sm">
            Enable an any-any rule with logging on your FortiGate, then export the traffic log and import it here.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-900 p-1 rounded-lg">
          {(['upload', 'paste'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setFeedback(null); setShowDetails(false); }}
              className={clsx(
                'flex-1 py-2 text-sm font-medium rounded-md transition-colors',
                tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200',
              )}
            >
              {t === 'upload' ? '↑ Upload File' : '⎘ Paste Text'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          {tab === 'upload'
            ? <FileDropZone onText={handleText} />
            : <PasteInput   onText={handleText} />
          }
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={clsx(
            'mt-4 p-3 border rounded-lg text-sm',
            feedback.ok
              ? 'bg-yellow-900/30 border-yellow-700/60 text-yellow-300'
              : 'bg-red-900/40 border-red-700 text-red-300',
          )}>
            <p>{feedback.message}</p>

            {feedback.details && feedback.details.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => setShowDetails(v => !v)}
                  className="text-xs underline opacity-70 hover:opacity-100"
                >
                  {showDetails ? 'Hide details ▲' : 'Show details ▼'}
                </button>
                {showDetails && (
                  <ul className="mt-2 text-xs font-mono space-y-0.5 opacity-80">
                    {feedback.details.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6 bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            How to export the log from FortiGate
          </h3>
          <ol className="text-gray-500 text-sm space-y-1 list-decimal list-inside">
            <li>Create a firewall policy: <code className="text-orange-400">any → any</code>, action <code className="text-orange-400">accept</code>, logging <code className="text-orange-400">all sessions</code></li>
            <li>Wait for traffic to flow through the firewall</li>
            <li>Navigate to <code className="text-orange-400">Log &amp; Report → Forward Traffic</code></li>
            <li>Filter and export the log as a text file</li>
            <li>Import it here and start building your policies</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
