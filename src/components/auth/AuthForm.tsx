import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Lock, Mail, RefreshCw, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

const signupAuthorizationKey = 'receiptit_signup_authorization';

const makePrivateAliasSuggestion = () => {
  const colours = ['amber', 'blue', 'calm', 'cedar', 'cloud', 'coral', 'green', 'silver', 'teal'];
  const animals = ['badger', 'finch', 'fox', 'heron', 'koala', 'otter', 'panda', 'robin', 'wren'];
  const random = new Uint32Array(3);
  crypto.getRandomValues(random);
  return `${colours[random[0] % colours.length]}${animals[random[1] % animals.length]}${10 + (random[2] % 90)}`;
};

const normaliseAliasInput = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '')
  .replace(/-{2,}/g, '-')
  .slice(0, 30);

const aliasFormatIsValid = (value: string) => (
  value.length >= 3
  && value.length <= 30
  && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(value)
);

export function AuthForm() {
  const canSignUp = useMemo(() => Boolean(sessionStorage.getItem(signupAuthorizationKey)), []);
  const recoveryLinkInvalid = useMemo(() => new URLSearchParams(window.location.search).get('reset') === '1', []);
  const [isSignUp, setIsSignUp] = useState(canSignUp);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [aliasLocalPart, setAliasLocalPart] = useState('');
  const [aliasState, setAliasState] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [aliasMessage, setAliasMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { signIn, signUp, checkAliasAvailability, requestPasswordReset } = useAuth();

  useEffect(() => {
    if (!isSignUp || !aliasFormatIsValid(aliasLocalPart)) {
      setAliasState('idle');
      setAliasMessage(aliasLocalPart ? 'Use 3–30 letters, numbers or single hyphens.' : '');
      return;
    }

    let active = true;
    setAliasState('checking');
    setAliasMessage('Checking availability…');
    const timer = window.setTimeout(async () => {
      const result = await checkAliasAvailability(aliasLocalPart);
      if (!active) return;
      if (result.error) {
        setAliasState('unavailable');
        setAliasMessage(result.error.message);
        return;
      }
      setAliasState(result.available ? 'available' : 'unavailable');
      setAliasMessage(result.available ? 'Address available' : 'That address is unavailable. Try another.');
    }, 400);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [aliasLocalPart, checkAliasAvailability, isSignUp]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isForgotPassword) {
        await requestPasswordReset(email);
        setResetRequested(true);
        return;
      }

      if (isSignUp) {
        if (!aliasFormatIsValid(aliasLocalPart)) {
          throw new Error('Choose a private address using 3–30 letters, numbers or single hyphens.');
        }
        const availability = await checkAliasAvailability(aliasLocalPart);
        if (availability.error) throw availability.error;
        if (!availability.available) throw new Error('That private address is unavailable. Choose another.');

        const { error: signupError } = await signUp(email, password, '', aliasLocalPart);
        if (signupError) {
          const errorMessage = signupError.message || 'Signup failed';
          if (errorMessage.includes('access-key') || errorMessage.includes('beta access')) {
            sessionStorage.removeItem(signupAuthorizationKey);
            throw new Error('Your beta access has expired. Return to the access page and try again.');
          }
          if (errorMessage.includes('already registered')) {
            throw new Error('This email is already registered. Please sign in instead.');
          }
          if (errorMessage.includes('password')) {
            throw new Error('Use a password with at least 8 characters.');
          }
          throw new Error(errorMessage);
        }
      } else {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          const errorMessage = signInError.message || 'Login failed';
          if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('invalid')) {
            throw new Error('Invalid email or password.');
          }
          throw new Error(errorMessage);
        }
      }
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const chooseSuggestion = () => {
    setAliasLocalPart(makePrivateAliasSuggestion());
    setAliasState('idle');
    setAliasMessage('');
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <Shield className="w-16 h-16 text-teal-400 mx-auto mb-4" strokeWidth={1.5} />
          <h1 className="mb-2"><ReceiptItWordmark className="text-4xl" /></h1>
          <p className="text-sm text-gray-400">Your purchases, kept private.</p>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8">
          {!isForgotPassword ? <div className="flex gap-2 mb-6">
            <button onClick={() => { setIsSignUp(false); setError(null); }} className={`flex-1 py-3 rounded-lg font-semibold transition-all ${!isSignUp ? 'bg-teal-400/20 text-teal-400 border border-teal-400/40' : 'text-gray-400 hover:bg-white/5'}`}>Sign In</button>
            {canSignUp ? <button onClick={() => { setIsSignUp(true); setError(null); }} className={`flex-1 py-3 rounded-lg font-semibold transition-all ${isSignUp ? 'bg-teal-400/20 text-teal-400 border border-teal-400/40' : 'text-gray-400 hover:bg-white/5'}`}>Sign Up</button> : null}
          </div> : null}

          {isForgotPassword ? <div className="mb-5"><h2 className="text-xl font-bold text-white">Reset password</h2><p className="mt-2 text-sm leading-6 text-gray-400">Enter the email you use to sign in.</p></div> : null}
          {recoveryLinkInvalid && !isForgotPassword ? <div className="mb-5 rounded-lg border border-amber-300/25 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100">This reset link is invalid or has expired. Request a new one below.</div> : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-semibold text-gray-300">Email<span className="relative mt-2 block"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50" /></span></label>

            {!isForgotPassword ? <label className="block text-sm font-semibold text-gray-300">Password<span className="relative mt-2 block"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required minLength={8} className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50" /></span>{isSignUp ? <span className="mt-2 block text-xs font-normal text-gray-500">At least 8 characters.</span> : null}</label> : null}

            {isSignUp && !isForgotPassword ? <div>
              <div className="flex items-center justify-between gap-3"><label htmlFor="private-address" className="text-sm font-semibold text-gray-300">Choose your <ReceiptItWordmark className="text-sm" /> address</label><button type="button" onClick={chooseSuggestion} className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-300 hover:text-teal-200"><RefreshCw className="h-3.5 w-3.5" />Suggest one</button></div>
              <div className="mt-2 flex items-center rounded-lg border border-white/10 bg-white/5 focus-within:border-teal-400/50"><input id="private-address" type="text" value={aliasLocalPart} onChange={(event) => setAliasLocalPart(normaliseAliasInput(event.target.value))} placeholder="bluefox23" required minLength={3} maxLength={30} className="min-w-0 flex-1 bg-transparent py-3 pl-4 text-white outline-none placeholder:text-gray-600" /><span className="shrink-0 pr-4 text-sm text-gray-400">@in.receiptit.app</span></div>
              <p className={`mt-2 flex min-h-5 items-center gap-1.5 text-xs ${aliasState === 'available' ? 'text-teal-300' : aliasState === 'unavailable' ? 'text-amber-200' : 'text-gray-500'}`}>{aliasState === 'available' ? <Check className="h-3.5 w-3.5" /> : null}{aliasMessage || 'Choose something you’re happy to give to stores instead of your personal email.'}</p>
            </div> : null}

            {resetRequested ? <div className="rounded-lg border border-teal-300/25 bg-teal-400/10 p-3 text-sm leading-6 text-teal-100">If an account exists for that email, we’ve sent a reset link.</div> : null}
            {error ? <div className="p-3 bg-red-400/10 border border-red-400/30 rounded-lg text-red-400 text-sm">{error}</div> : null}
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={loading || resetRequested || (isSignUp && aliasState === 'checking')} className="w-full py-3 bg-teal-400 text-black font-bold rounded-lg hover:bg-teal-300 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? 'Please wait…' : isForgotPassword ? resetRequested ? 'Email sent' : 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}</motion.button>
          </form>

          {!isSignUp && !isForgotPassword ? <button type="button" onClick={() => { setIsForgotPassword(true); setError(null); }} className="mt-4 w-full text-center text-sm font-semibold text-teal-300 hover:text-teal-200">Forgot password?</button> : null}
          {isForgotPassword ? <button type="button" onClick={() => { setIsForgotPassword(false); setResetRequested(false); setError(null); }} className="mt-4 w-full text-center text-sm font-semibold text-gray-400 hover:text-white">Back to sign in</button> : null}
        </div>
      </motion.div>
    </div>
  );
}
