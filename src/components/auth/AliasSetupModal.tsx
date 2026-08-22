import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

export function AliasSetupModal() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { createAlias } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await createAlias();

      if (error) {
        throw error;
      }
    } catch (err: any) {
      setError('We couldn’t create your address. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="text-center mb-8">
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="inline-block">
              <Shield className="w-16 h-16 text-teal-400 mx-auto mb-4" strokeWidth={1.5} />
            </motion.div>
            <h2 className="mb-2 flex flex-wrap items-baseline justify-center gap-x-2 text-2xl font-bold text-white"><span>Welcome to</span><ReceiptItWordmark className="text-2xl" /></h2>
            <p className="text-sm text-gray-400">Your purchases, kept private.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-gray-300">
              <p className="flex flex-wrap items-baseline gap-x-1">When a shop asks for your email, use your <ReceiptItWordmark className="text-sm" /> address instead.</p>
              <p>Your receipts arrive here. Your personal inbox stays private.</p>
              <p className="text-gray-400">You can also add existing receipts by photo or PDF.</p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-400/10 border border-red-400/30 rounded-lg text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-teal-400 text-black font-bold rounded-lg hover:bg-teal-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Setting up your address...' : 'Set up my private address'}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
