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
  const label = warranty
    ? `${count} active ${count === 1 ? 'warranty' : 'warranties'}`
    : `${count} active return ${count === 1 ? 'window' : 'windows'}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={`${label}${active ? ' — tap to clear' : ''}`}
      onClick={onToggle}
      className={`inline-flex h-11 min-w-14 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${active ? visual.selected : `${visual.surface} ${visual.ink} hover:brightness-125`} ${count === 0 && !active ? 'opacity-60' : ''}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={1.7} />
      <span aria-hidden="true" className="text-xs font-semibold">{warranty ? 'Warranty' : 'Returns'}</span>
      <span aria-hidden="true" className="text-xs font-semibold tabular-nums opacity-80">{count}</span>
    </button>
  );
}
