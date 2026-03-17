import { useRef, useState } from 'react';
import { clsx } from 'clsx';

interface Props {
  onText: (text: string) => void;
}

export function FileDropZone({ onText }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function readFile(file: File) {
    if (!file.name.match(/\.(log|txt|csv)$/i) && file.type !== 'text/plain') {
      // Accept any file – FortiGate exports may have various extensions
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setError(null);
        onText(text);
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = '';
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={clsx(
        'border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all select-none',
        dragging
          ? 'border-orange-500 bg-orange-500/10'
          : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".log,.txt,.csv,text/plain"
        className="hidden"
        onChange={handleChange}
      />
      <div className={clsx(
        'w-16 h-16 rounded-full flex items-center justify-center',
        dragging ? 'bg-orange-500/20' : 'bg-gray-800',
      )}>
        <svg className={clsx('w-8 h-8', dragging ? 'text-orange-400' : 'text-gray-400')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-gray-300 font-medium">Drop your FortiGate log file here</p>
        <p className="text-gray-500 text-sm mt-1">or click to browse — .log, .txt files</p>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
