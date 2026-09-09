import { motion } from 'framer-motion';
import { Check, Copy, Mail, Send } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export function AliasTab() {
  const { emailAlias } = useAuth();
  const [copied, setCopied] = useState(false);

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
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">Use this when a shop asks where to send your receipt, or forward an existing receipt here.</p>

        <div className="mx-auto mt-5 max-w-3xl">
          <section className="overflow-hidden rounded-2xl border border-teal-300/25 bg-teal-400/[0.055] p-5 text-center shadow-[0_0_32px_rgba(45,212,191,0.07)] sm:p-7">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-teal-300/30 bg-teal-400/[0.12] shadow-[0_0_20px_rgba(45,212,191,0.08)]"><Mail className="h-6 w-6 text-teal-200" strokeWidth={1.7} /></div>
            <p className="mt-5 min-w-0 break-all text-xl font-bold text-white min-[360px]:text-2xl sm:text-3xl">{aliasLocalPart && aliasDomain ? <>{aliasLocalPart}@<wbr />{aliasDomain}</> : emailAlias || 'No email set'}</p>
            <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={() => void handleCopy()} disabled={!emailAlias} className={`mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold shadow-[0_0_18px_rgba(45,212,191,0.06)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${copied ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-teal-300/35 bg-teal-400/15 text-teal-50 hover:bg-teal-400/25'}`}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy email'}
            </motion.button>
          </section>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><Mail className="h-4 w-4 text-teal-300" /><h2 className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-teal-100">At checkout</h2><p className="mt-2 text-sm leading-6 text-gray-400">Give the shop this email instead of your personal inbox when they only need somewhere to send the receipt.</p></section>
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><Send className="h-4 w-4 text-teal-300" /><h2 className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-teal-100">Forward a receipt</h2><p className="mt-2 text-sm leading-6 text-gray-400">Forward receipts, invoices or order confirmations here and receiptIt will add them for you.</p></section>
          </div>
          <p className="mt-4 px-1 text-xs leading-5 text-gray-500 sm:text-sm">Keeps your main inbox separate from receipt emails and unnecessary marketing.</p>
        </div>
      </motion.div>
    </div>
  );
}
