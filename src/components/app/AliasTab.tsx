import { motion } from 'framer-motion';
import { ArrowDown, Check, Copy, HelpCircle, Mail, ShoppingBag, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export function AliasTab() {
  const { emailAlias, user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showFirstVisitCallout, setShowFirstVisitCallout] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const seenKey = `receiptit_private_email_intro_seen:${user.id}`;
    const hasSeenCallout = localStorage.getItem(seenKey) === 'true';
    setShowFirstVisitCallout(!hasSeenCallout);
    if (!hasSeenCallout) localStorage.setItem(seenKey, 'true');
  }, [user?.id]);

  const handleCopy = async () => {
    if (!emailAlias) return;
    await navigator.clipboard.writeText(emailAlias);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const [aliasLocalPart, aliasDomain] = emailAlias?.split('@') || [];

  return (
    <div className="ri-mobile-page mx-auto min-w-0 max-w-7xl px-4 pt-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
        <h1 className="text-3xl font-bold text-white">Your private receipt email</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">Use this instead of your personal email when a shop asks where to send your receipt.</p>
        <p className="max-w-2xl text-sm leading-6 text-gray-400">Anything sent here can be added to receiptIt automatically.</p>

        <div className="mx-auto mt-6 max-w-3xl">
          {showFirstVisitCallout ? (
            <aside className="relative mb-4 rounded-2xl border border-teal-300/20 bg-teal-400/[0.065] p-4 pr-12" aria-label="Why use your private receipt email">
              <HelpCircle className="absolute left-4 top-4 h-5 w-5 text-teal-300" strokeWidth={1.7} />
              <div className="pl-8">
                <h2 className="text-sm font-bold text-white">Why use this?</h2>
                <p className="mt-1 text-xs leading-5 text-gray-300 sm:text-sm sm:leading-6">A shop may only need somewhere to send the receipt. Use your receiptIt email instead of your personal inbox where appropriate.</p>
              </div>
              <button type="button" aria-label="Dismiss private receipt email explanation" onClick={() => setShowFirstVisitCallout(false)} className="absolute right-2.5 top-2.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
            </aside>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-center sm:p-7">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-400/10"><Mail className="h-5 w-5 text-teal-300" strokeWidth={1.7} /></div>
            <p className="mt-5 min-w-0 break-all text-xl font-bold text-white min-[360px]:text-2xl sm:text-3xl">{aliasLocalPart && aliasDomain ? <>{aliasLocalPart}@<wbr />{aliasDomain}</> : emailAlias || 'No email set'}</p>
            <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={() => void handleCopy()} disabled={!emailAlias} className={`mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${copied ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-teal-300/30 bg-teal-400/15 text-teal-100 hover:bg-teal-400/25'}`}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy email'}
            </motion.button>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-label="How your private receipt email works">
            <div className="grid items-center gap-2 text-center md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3"><ShoppingBag className="mx-auto h-4 w-4 text-teal-300" /><p className="mt-2 text-xs font-bold uppercase tracking-[0.11em] text-white">Shop sends receipt</p></div>
              <ArrowDown className="mx-auto h-4 w-4 text-gray-600 md:-rotate-90" />
              <div className="rounded-xl border border-teal-300/20 bg-teal-400/[0.06] px-3 py-3"><Mail className="mx-auto h-4 w-4 text-teal-300" /><p className="mt-2 text-xs font-bold uppercase tracking-[0.11em] text-white">Your private receipt email</p></div>
              <ArrowDown className="mx-auto h-4 w-4 text-gray-600 md:-rotate-90" />
              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3"><Check className="mx-auto h-4 w-4 text-teal-300" /><p className="mt-2 text-xs font-bold uppercase tracking-[0.11em] text-white">Purchase appears in receiptIt</p></div>
            </div>
          </section>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <section className="rounded-2xl border border-white/10 p-4"><h2 className="text-xs font-bold uppercase tracking-[0.12em] text-teal-200">At checkout</h2><p className="mt-2 text-sm leading-6 text-gray-400">If a shop asks where to send your receipt, give them this email.</p></section>
            <section className="rounded-2xl border border-white/10 p-4"><h2 className="text-xs font-bold uppercase tracking-[0.12em] text-teal-200">Online orders</h2><p className="mt-2 text-sm leading-6 text-gray-400">Forward receipts, invoices and order confirmations here.</p></section>
            <section className="rounded-2xl border border-white/10 p-4"><h2 className="text-xs font-bold uppercase tracking-[0.12em] text-teal-200">Keep your main email private</h2><p className="mt-2 text-sm leading-6 text-gray-400">Keep your main inbox separate from receipt emails and unnecessary marketing.</p></section>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
