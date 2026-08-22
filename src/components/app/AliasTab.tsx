import { motion } from 'framer-motion';
import { Copy, Check, Shield, Mail, Lock } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useStats } from '../../hooks/useStats';

export function AliasTab() {
  const { user, emailAlias } = useAuth();
  const [copied, setCopied] = useState(false);
  const { stats: statsData } = useStats(user?.id);

  console.log('AliasTab - emailAlias:', emailAlias, 'user:', user?.id);

  const stats = [
    { label: 'Receipts Captured', value: statsData.receiptsCaptured.toString(), icon: Mail },
    { label: 'Warranties Tracked', value: statsData.warrantiesTracked.toString(), icon: Shield },
    ...(typeof statsData.spamBlocked === 'number'
      ? [{ label: 'Spam Blocked', value: statsData.spamBlocked.toLocaleString(), icon: Lock }]
      : []),
  ];

  const handleCopy = () => {
    navigator.clipboard.writeText(emailAlias);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="ri-page" aria-label="ReceiptIt address">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <p className="ri-eyebrow mb-2">Private inbox</p>
          <h1 className="ri-page-heading text-3xl font-bold text-white sm:text-4xl">Your ReceiptIt address</h1>
          <p className="mt-3 max-w-xl text-sm text-gray-400">Give it to retailers instead of your personal inbox. Purchase documents arrive in your private Wallet.</p>
        </div>

        <section className="ri-surface p-6 sm:p-8 mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-400/[0.07] to-transparent" />

          <div className="relative">
            <div className="flex items-center justify-center mb-6">
              <motion.div>
                <Shield className="w-20 h-20 text-teal-400" strokeWidth={1.5} />
              </motion.div>
            </div>

            <div className="text-center mb-6">
              <div className="ri-terminal break-all rounded-xl border border-teal-400/20 bg-black/20 px-4 py-3 text-xl font-bold text-teal-300 sm:text-2xl mb-3">
                {emailAlias || 'No alias set'}
              </div>
              <p className="text-gray-400 text-sm">
                Give this address to shops instead of your personal email.
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCopy}
              className="w-full relative group"
            >
              <div className={`absolute inset-0 blur-xl transition-all duration-300 ${
                copied ? 'bg-green-400/30' : 'bg-teal-400/30'
              }`} />

              <div className={`relative flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all duration-300 backdrop-blur-md border ${
                copied
                  ? 'bg-green-400/20 border-green-400/40 text-green-400'
                  : 'bg-teal-400/20 border-teal-400/40 text-teal-400'
              }`}>
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    <span>Copy address</span>
                  </>
                )}
              </div>
            </motion.button>
          </div>
        </section>

        <div className={`grid gap-3 mb-6 ${stats.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 text-center"
            >
              <stat.icon className="w-6 h-6 text-teal-400 mx-auto mb-2" strokeWidth={1.5} />
              <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-xs text-gray-400">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">How it works</h3>
          <div className="space-y-4">
            {[
              { step: '1', text: 'Use this address when a retailer asks where to send your receipt' },
              { step: '2', text: 'Purchase evidence sent here is added privately to ReceiptIt' },
              { step: '3', text: 'Your personal sign-in email is not shared with the retailer' },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                className="flex items-start gap-3"
              >
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-teal-400/20 border border-teal-400/30 flex items-center justify-center text-teal-400 font-bold text-sm">
                  {item.step}
                </div>
                <p className="text-gray-300 pt-1">{item.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </main>
  );
}
