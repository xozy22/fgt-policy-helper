import { useAppStore } from '../../store/useAppStore';
import type { WorkflowStep } from '../../types/workflow';
import { clsx } from 'clsx';

const STEPS: { id: WorkflowStep; label: string; num: number }[] = [
  { id: 'import', label: 'Import Log', num: 1 },
  { id: 'traffic', label: 'Review Traffic', num: 2 },
  { id: 'output', label: 'Export CLI', num: 3 },
];

export function Header() {
  const step = useAppStore(s => s.step);
  const policies = useAppStore(s => s.policies);
  const setStep = useAppStore(s => s.setStep);
  const rawEntryCount = useAppStore(s => s.rawEntryCount);

  function canNavigateTo(target: WorkflowStep): boolean {
    if (target === 'import') return true;
    if (target === 'traffic') return rawEntryCount > 0;
    if (target === 'output') return policies.length > 0;
    return false;
  }

  const currentIndex = STEPS.findIndex(s => s.id === step);

  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-8">
      {/* Logo / Title */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="font-semibold text-white text-sm tracking-wide">
          FortiGate Policy Helper
        </span>
      </div>

      {/* Step indicator */}
      <nav className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isPast = i < currentIndex;
          const canNav = canNavigateTo(s.id);

          return (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => canNav && setStep(s.id)}
                disabled={!canNav}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                  isActive && 'bg-orange-500/20 text-orange-400',
                  isPast && !isActive && 'text-gray-400 hover:text-gray-200',
                  !isPast && !isActive && 'text-gray-600',
                  canNav && !isActive && 'cursor-pointer',
                  !canNav && 'cursor-not-allowed opacity-40',
                )}
              >
                <span className={clsx(
                  'w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold',
                  isActive && 'bg-orange-500 text-white',
                  isPast && !isActive && 'bg-gray-600 text-gray-300',
                  !isPast && !isActive && 'bg-gray-800 text-gray-600',
                )}>
                  {isPast ? '✓' : s.num}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <span className="text-gray-700 mx-1">›</span>
              )}
            </div>
          );
        })}
      </nav>
    </header>
  );
}
