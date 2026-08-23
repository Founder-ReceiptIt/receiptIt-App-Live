import { motion } from 'framer-motion';
import { Check, Copy, Mail } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

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
    <div className="mx-auto max-w-7xl px-6 pb-32 pt-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
        <h1 className="flex flex-wrap items-baseline gap-x-2 text-3xl font-bold text-white"><span>Your</span><ReceiptItWordmark className="text-3xl" /><span>address</span></h1>
        <div className="mx-auto max-w-2xl text-center">
          <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-6 sm:p-8">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-400/10"><Mail className="h-5 w-5 text-teal-300" strokeWidth={1.7} /></div>
            <p className="mt-6 text-sm font-semibold text-gray-300">Your private purchase address</p>
            <p className="mt-2 text-2xl font-bold text-white sm:text-3xl">{aliasLocalPart && aliasDomain ? <><span className="whitespace-nowrap">{aliasLocalPart}@</span><wbr /><span className="whitespace-nowrap">{aliasDomain}</span></> : emailAlias || 'No address set'}</p>
            <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={() => void handleCopy()} disabled={!emailAlias} className={`mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${copied ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-teal-300/30 bg-teal-400/15 text-teal-100 hover:bg-teal-400/25'}`}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy address'}
            </motion.button>
          </section>
          <div className="mt-5 space-y-1 text-sm leading-6 text-gray-400"><p>Use this when a store asks where to send your receipt or purchase documents.</p><p>Your personal email stays private.</p></div>
        </div>
      </motion.div>
    </div>
  );
}
