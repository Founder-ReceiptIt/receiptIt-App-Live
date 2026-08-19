import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

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
      setError(err.message || 'Failed to create alias');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="text-center mb-8">
            <motion.div
              animate={{
                rotate: [0, 5, -5, 0],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-block"
            >
              <Shield className="w-16 h-16 text-teal-400 mx-auto mb-4" strokeWidth={1.5} />
            </motion.div>
            <h2 className="text-2xl font-bold text-white mb-2">Create Your Private Address</h2>
            <p className="text-sm text-gray-400">
              We create a private, unguessable address for your purchase emails.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
              Your address is generated securely and never reveals your name or sign-in email.
            </p>

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
              {loading ? 'Creating address...' : 'Create private address'}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
