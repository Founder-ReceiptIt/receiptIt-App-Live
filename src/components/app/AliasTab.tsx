import { motion } from 'framer-motion';
import { Check, Copy, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

export function AliasTab() {
  const { emailAlias, user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [activity, setActivity] = useState<{ count: number; lastReceivedAt: string | null }>({ count: 0, lastReceivedAt: null });

  useEffect(() => {
    if (!user) return;

    let active = true;
    const loadActivity = async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('source', 'email')
        .order('created_at', { ascending: false });

      if (!active || error) return;
      setActivity({
        count: data?.length || 0,
        lastReceivedAt: data?.[0]?.created_at || null,
      });
    };

    void loadActivity();
    return () => { active = false; };
  }, [user]);

  const handleCopy = async () => {
    if (!emailAlias) return;
    await navigator.clipboard.writeText(emailAlias);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const receivedDate = activity.lastReceivedAt
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(activity.lastReceivedAt))
    : null;
  const [aliasLocalPart, aliasDomain] = emailAlias?.split('@') || [];

  return (
    <div className="mx-auto max-w-7xl px-6 pb-32 pt-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
        <h1 className="flex flex-wrap items-baseline gap-x-2 text-3xl font-bold text-white"><span>Your</span><ReceiptItWordmark className="text-3xl" /><span>address</span></h1>
        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-6 sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-400/10"><Mail className="h-5 w-5 text-teal-300" strokeWidth={1.7} /></div>
          <p className="mt-6 text-sm font-semibold text-gray-300">Your private receipt address</p>
          <p className="mt-2 text-2xl font-bold text-white sm:text-3xl">{aliasLocalPart && aliasDomain ? <><span className="whitespace-nowrap">{aliasLocalPart}@</span><wbr /><span className="whitespace-nowrap">{aliasDomain}</span></> : emailAlias || 'No address set'}</p>
          <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={() => void handleCopy()} disabled={!emailAlias} className={`mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${copied ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-teal-300/30 bg-teal-400/15 text-teal-100 hover:bg-teal-400/25'}`}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy address'}
          </motion.button>
        </section>
        <div className="mt-5 space-y-1 text-sm leading-6 text-gray-400"><p>Use this when a store asks where to send your receipt.</p><p>Your personal email stays private.</p></div>
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6">
          <h2 className="text-lg font-bold text-white">Receipt activity</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Received</p><p className="mt-1 text-xl font-bold text-white">{activity.count} {activity.count === 1 ? 'receipt' : 'receipts'}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Last received</p><p className="mt-1 text-sm font-semibold text-gray-200">{receivedDate || 'No receipts received yet'}</p></div>
          </div>
        </section>
      </motion.div>
    </div>
  );
}
