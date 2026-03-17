import { useAppStore } from '../../store/useAppStore';
import { Header } from './Header';
import { ImportStep } from '../import/ImportStep';
import { TrafficStep } from '../traffic/TrafficStep';
import { OutputStep } from '../output/OutputStep';

export function AppShell() {
  const step = useAppStore(s => s.step);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950">
      <Header />
      <main className="flex-1 overflow-hidden">
        {step === 'import' && <ImportStep />}
        {step === 'traffic' && <TrafficStep />}
        {step === 'output' && <OutputStep />}
      </main>
    </div>
  );
}
