import { protectionVisuals } from './purchaseProtectionVisuals';

interface PurchaseProtectionFilterProps {
  kind: 'warranty' | 'return';
  active: boolean;
  count: number;
  onToggle: () => void;
}

export function PurchaseProtectionFilter({ kind, active, count, onToggle }: PurchaseProtectionFilterProps) {
  const warranty = kind === 'warranty';
  const visual = protectionVisuals[kind];
  const Icon = visual.Icon;
  const label = warranty ? 'Active warranties' : 'Open return windows';
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={`${label}: ${count}${active ? ' — tap to clear' : ''}`}
      onClick={onToggle}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${active ? visual.selected : `${visual.surface} ${visual.ink} hover:brightness-125`}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={1.7} />
    </button>
  );
}
