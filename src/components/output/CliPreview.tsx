import { useState } from 'react';
import { clsx } from 'clsx';
import type { FortiosVersion } from '../../store/useAppStore';

const VERSIONS: { value: FortiosVersion; label: string }[] = [
  { value: '7.6', label: 'FortiOS 7.6' },
  { value: '7.4', label: 'FortiOS 7.4' },
];

interface Props {
  script: string;
  fortiosVersion: FortiosVersion;
  onVersionChange: (v: FortiosVersion) => void;
}

export function CliPreview({ script, fortiosVersion, onVersionChange }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = script;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDownload() {
    const now  = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const hh   = now.getHours()  .toString().padStart(2, '0');
    const mm   = now.getMinutes().toString().padStart(2, '0');
    const ss   = now.getSeconds().toString().padStart(2, '0');
    const blob = new Blob([script], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `fortigate-policy-${date}-${hh}${mm}${ss}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const lineCount = script.split('\n').length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800">
        {/* Left: line count + version selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{lineCount} lines</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Target:</span>
            <div className="flex rounded overflow-hidden border border-gray-700">
              {VERSIONS.map(v => (
                <button
                  key={v.value}
                  onClick={() => onVersionChange(v.value)}
                  className={clsx(
                    'px-2.5 py-1 text-xs font-medium transition-colors',
                    fortiosVersion === v.value
                      ? 'bg-orange-700 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: copy + download */}
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className={clsx(
              'px-3 py-1 text-xs rounded transition-colors font-medium',
              copied
                ? 'bg-green-800 text-green-300'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200',
            )}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1 text-xs rounded bg-orange-700 hover:bg-orange-600 text-white font-medium transition-colors"
          >
            Download .txt
          </button>
        </div>
      </div>

      {/* Code block */}
      <div className="flex-1 overflow-auto bg-gray-950 p-4">
        <pre className="text-xs font-mono text-green-400 whitespace-pre leading-5">
          {script || <span className="text-gray-600">No policies created yet.</span>}
        </pre>
      </div>
    </div>
  );
}
