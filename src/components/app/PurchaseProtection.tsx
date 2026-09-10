import { CalendarDays, Clock3 } from 'lucide-react';
import { protectionVisuals, type ProtectionKind } from './purchaseProtectionVisuals';


export function ProtectionBadge({ kind, children, urgent = false }: { kind: ProtectionKind; children: React.ReactNode; urgent?: boolean }) {
  const visual = protectionVisuals[kind];
  const Icon = visual.Icon;
  return <span aria-label={kind === 'warranty' ? 'Warranty active' : undefined} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${urgent ? visual.selected : visual.pill}`}>
    <Icon className="h-3 w-3 shrink-0" strokeWidth={1.7} aria-hidden="true" />{children}
  </span>;
}

export function ProtectionCard({ kind, active, deadline, daysRemaining, urgent = false }: {
  kind: ProtectionKind;
  active: boolean;
  deadline: Date;
  daysRemaining: number;
  urgent?: boolean;
}) {
  const visual = protectionVisuals[kind];
  const Icon = visual.Icon;
  const warranty = kind === 'warranty';
  const formattedDate = deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const remaining = daysRemaining === 0 ? 'Ends today' : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining`;
  return (
    <div role="group" aria-label={warranty ? 'Warranty' : 'Returns'} className={`flex min-w-0 items-center gap-3 rounded-2xl border p-4 sm:gap-4 ${active ? visual.surface : 'border-white/10 bg-white/[0.035]'} ${active && urgent ? 'ring-1 ring-rose-300/20' : ''}`}>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center ${active ? visual.ink : 'text-gray-500'} ${!warranty ? `rounded-xl border ${active ? visual.tile : 'border-white/10 bg-white/5'}` : ''}`}>
        <Icon className={warranty ? 'h-11 w-11' : 'h-6 w-6'} strokeWidth={1.7} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase leading-4 tracking-[0.1em] sm:text-[11px] ${active ? visual.ink : 'text-gray-500'}`}>
          {warranty && active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
          {warranty ? 'Warranty' : 'Return window'} {active ? 'active' : 'expired'}
        </p>
        {warranty ? <>
          {/* Only an expiry is stored today; never invent a warranty duration. */}
          <p className={`mt-1.5 flex items-center gap-2 text-lg font-bold leading-6 ${active ? 'text-white' : 'text-gray-400'}`}><CalendarDays className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" /><span>{formattedDate}</span></p>
          {active && <p className="mt-1.5 flex items-center gap-1.5 text-xs leading-5 text-gray-400"><Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{remaining}</p>}
        </> : <p className={`mt-2 flex items-center gap-2 text-sm leading-5 ${active ? 'text-gray-300' : 'text-gray-400'}`}><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />{active ? remaining : `Ended ${formattedDate}`}</p>}
      </div>
    </div>
  );
}
