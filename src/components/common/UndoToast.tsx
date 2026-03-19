import { useEffect, useRef, useState } from 'react';

interface Props {
  message: string;
  duration?: number; // ms, default 8000
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ message, duration = 8000, onUndo, onDismiss }: Props) {
  const [progress, setProgress] = useState(100);
  const startRef   = useRef<number>(Date.now());
  const frameRef   = useRef<number>(0);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    startRef.current = Date.now();

    function tick() {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct > 0) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        dismissRef.current();
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [duration]);

  function handleUndo() {
    cancelAnimationFrame(frameRef.current);
    onUndo();
    onDismiss();
  }

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[380px] bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
      {/* Progress bar */}
      <div className="h-0.5 bg-gray-700">
        <div
          className="h-full bg-orange-500 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Icon */}
        <span className="flex-shrink-0 text-red-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm.293 7.293a1 1 0 011.414 0L12 10.586l1.293-1.293a1 1 0 111.414 1.414L13.414 12l1.293 1.293a1 1 0 01-1.414 1.414L12 13.414l-1.293 1.293a1 1 0 01-1.414-1.414L10.586 12 9.293 10.707a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
        </span>

        <p className="flex-1 text-sm text-gray-300">{message}</p>

        {/* Undo button */}
        <button
          onClick={handleUndo}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
          Undo
        </button>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-gray-600 hover:text-gray-300 transition-colors text-lg leading-none"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
