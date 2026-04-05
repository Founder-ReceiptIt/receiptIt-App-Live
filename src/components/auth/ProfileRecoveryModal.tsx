import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function ProfileRecoveryModal() {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [aliasUsername, setAliasUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { recoverProfile, signOut } = useAuth();

  const handleAliasChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setAliasUsername(sanitized);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!username) {
        throw new Error('Please enter a username');
      }

      const finalAlias = aliasUsername ? `${aliasUsername}@receiptit.app` : null;
      const { error } = await recoverProfile(username, fullName, finalAlias);

      if (error) {
        throw error;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to recover profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
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
              <AlertCircle className="w-16 h-16 text-amber-400 mx-auto mb-4" strokeWidth={1.5} />
            </motion.div>
            <h2 className="text-2xl font-bold text-white mb-2">Recover Your Profile</h2>
            <p className="text-sm text-gray-400">
              Your account was authenticated but your profile data is missing. Please set up your profile to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="John Doe"
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Full Name (optional)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Email Alias
              </label>
              <div className="relative flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden focus-within:border-teal-400/50 transition-colors">
                <input
                  type="text"
                  value={aliasUsername}
                  onChange={(e) => handleAliasChange(e.target.value)}
                  placeholder="john"
                  pattern="[a-z0-9-]*"
                  className="flex-1 pl-4 pr-2 py-3 bg-transparent text-white placeholder-gray-500 focus:outline-none"
                />
                <div className="px-4 py-3 text-gray-400 bg-white/5 border-l border-white/10 font-mono text-sm">
                  @receiptit.app
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Use lowercase letters, numbers, and hyphens only. Leave blank to skip.
              </p>
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
              {loading ? 'Recovering Profile...' : 'Recover Profile'}
            </motion.button>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={loading}
              className="w-full py-3 bg-gray-700 text-gray-200 font-semibold rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign Out
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
