import { motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export function AliasTab() {
  const { emailAlias } = useAuth();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!emailAlias) return;
    await navigator.clipboard.writeText(emailAlias);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="ri-page" aria-label="receiptIt address">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <h1 className="ri-page-heading text-3xl font-bold text-white sm:text-4xl">Your receiptIt address</h1>
          <p className="mt-3 max-w-xl text-sm text-gray-400">Use this instead of your personal email for receipts.</p>
        </div>
        <section className="ri-surface max-w-2xl p-6 sm:p-8">
          <div className="ri-terminal break-all rounded-xl border border-teal-400/20 bg-black/20 px-4 py-4 text-lg font-bold text-teal-200 sm:text-xl">
            {emailAlias || 'Your address is being set up'}
          </div>
          <button type="button" onClick={() => void handleCopy()} disabled={!emailAlias} className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${copied ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200' : 'border-teal-400/30 bg-teal-400/15 text-teal-100 hover:border-teal-300/50 hover:bg-teal-400/20'}`}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy address'}
          </button>
          <p className="mt-5 text-sm text-gray-400">Your personal email stays private.</p>
        </section>
      </motion.div>
    </main>
  );
}
