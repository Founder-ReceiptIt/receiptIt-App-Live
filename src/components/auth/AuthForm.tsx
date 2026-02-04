import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Shield, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [aliasUsername, setAliasUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { signIn, signUp } = useAuth();

  const generateAliasUsername = () => {
    const username = email.split('@')[0] || 'user';
    return username.toLowerCase().replace(/[^a-z0-9-]/g, '');
  };

  const handleAliasChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setAliasUsername(sanitized);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const username = aliasUsername || generateAliasUsername();
        if (!username) {
          throw new Error('Please enter a valid alias');
        }
        const finalAlias = `${username}@receiptit.app`;
        const { error } = await signUp(email, password, finalAlias, fullName);
        if (error) throw error;
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            animate={{
              rotate: [0, 5, -5, 0],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="inline-block"
          >
            <Shield className="w-16 h-16 text-teal-400 mx-auto mb-4" strokeWidth={1.5} />
          </motion.div>
          <h1 className="text-4xl font-bold font-mono text-white mb-2">
            <span className="text-white">receipt</span>
            <span className="text-teal-400">It</span>
          </h1>
          <p className="text-sm text-gray-400 italic">The privacy firewall for your digital life.</p>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setIsSignUp(false)}
              className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                !isSignUp
                  ? 'bg-teal-400/20 text-teal-400 border border-teal-400/40'
                  : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsSignUp(true)}
              className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                isSignUp
                  ? 'bg-teal-400/20 text-teal-400 border border-teal-400/40'
                  : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Username <span className="text-xs text-zinc-500 font-normal">(So we know what to call you)</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Email {isSignUp && <span className="text-xs text-zinc-500 font-normal">(For verification - unlike others, we'll never share it)</span>}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    const newEmail = e.target.value;
                    setEmail(newEmail);
                    if (isSignUp && !aliasUsername) {
                      const username = newEmail.split('@')[0] || 'user';
                      setAliasUsername(username.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    }
                  }}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50 transition-colors"
                />
              </div>
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Choose your alias
                </label>
                <div className="relative flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden focus-within:border-teal-400/50 transition-colors">
                  <input
                    type="text"
                    value={aliasUsername}
                    onChange={(e) => handleAliasChange(e.target.value)}
                    placeholder="john"
                    required
                    pattern="[a-z0-9-]+"
                    className="flex-1 pl-4 pr-2 py-3 bg-transparent text-white placeholder-gray-500 focus:outline-none"
                  />
                  <div className="px-4 py-3 text-gray-400 bg-white/5 border-l border-white/10 font-mono text-sm">
                    @receiptit.app
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Your privacy-protected email will be {aliasUsername || 'john'}@receiptit.app
                </p>
              </div>
            )}

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
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </motion.button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="flex items-center justify-center gap-6 text-xs text-gray-400">
              <div className="flex items-center gap-1.5">
                <span>🔒</span>
                <span>AES-256 Encrypted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Zero-Sale Promise</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>⚡</span>
                <span>Powered by Supabase</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-gray-400 text-sm mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </motion.div>
    </div>
  );
}
