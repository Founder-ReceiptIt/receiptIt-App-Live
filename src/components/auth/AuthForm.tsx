import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

export function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, '');
        if (error) {
          const errorMessage = error.message || 'Signup failed';
          if (errorMessage.includes('already registered')) {
            throw new Error('This email is already registered. Please sign in instead.');
          }
          if (errorMessage.includes('weak password')) {
            throw new Error('Password must be at least 6 characters.');
          }
          if (errorMessage.includes('invalid') || errorMessage.includes('user_already_exists')) {
            throw new Error('This email is already registered. Please sign in instead.');
          }
          throw new Error(errorMessage);
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          const errorMessage = error.message || 'Login failed';
          if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('invalid')) {
            throw new Error('Invalid email or password.');
          }
          throw new Error(errorMessage);
        }
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
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="inline-block">
            <Shield className="w-16 h-16 text-teal-400 mx-auto mb-4" strokeWidth={1.5} />
          </motion.div>
          <h1 className="mb-2"><ReceiptItWordmark className="text-4xl" /></h1>
          <p className="text-sm text-gray-400">Your receipts, in one private place.</p>
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
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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

            {isSignUp && <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-gray-400">We’ll create a private address for receipt emails.</p>}

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
            <p className="text-center text-sm text-gray-400">
              Add receipts by email, photo or PDF.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
