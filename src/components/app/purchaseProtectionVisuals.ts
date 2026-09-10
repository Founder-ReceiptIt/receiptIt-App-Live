import { Shield, Undo2 } from 'lucide-react';
export type ProtectionKind = 'warranty' | 'return';

// One visual family for the detail cards, Wallet filters and compact badges.
export const protectionVisuals = {
  warranty: {
    Icon: Shield,
    ink: 'text-teal-400',
    surface: 'border-teal-400/45 bg-gradient-to-br from-teal-400/[0.16] to-cyan-400/[0.07] shadow-[0_0_26px_rgba(45,212,191,0.12)]',
    selected: 'border-teal-200 bg-teal-400/25 text-teal-200 shadow-[0_0_22px_rgba(45,212,191,0.22)]',
    pill: 'border-teal-400/40 bg-teal-400/10 text-teal-300',
    tile: 'border-teal-400/30 bg-teal-400/10',
  },
  return: {
    Icon: Undo2,
    ink: 'text-rose-400',
    surface: 'border-rose-400/45 bg-gradient-to-br from-rose-400/[0.11] to-rose-950/[0.18] shadow-[0_0_26px_rgba(251,113,133,0.10)]',
    selected: 'border-rose-200 bg-rose-400/25 text-rose-200 shadow-[0_0_22px_rgba(251,113,133,0.20)]',
    pill: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
    tile: 'border-rose-400/30 bg-rose-400/10',
  },
};
