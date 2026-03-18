import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Header } from './Header';
import { ImportStep } from '../import/ImportStep';
import { TrafficStep } from '../traffic/TrafficStep';
import { OutputStep } from '../output/OutputStep';

export function AppShell() {
  const step = useAppStore(s => s.step);
  const undo = useAppStore(s => s.undo);
  const redo = useAppStore(s => s.redo);

  // Global keyboard shortcuts: Ctrl/Cmd+Z → undo, Ctrl/Cmd+Y or Ctrl+Shift+Z → redo
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950">
      <Header />
      <main className="flex-1 overflow-hidden">
        {step === 'import'  && <ImportStep />}
        {step === 'traffic' && <TrafficStep />}
        {step === 'output'  && <OutputStep />}
      </main>
    </div>
  );
}
