import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ReceiptItWordmark } from '../ReceiptItWordmark';
import { useAuth } from '../../contexts/AuthContext';

const signupAuthorizationKey = 'receiptit_signup_authorization';
const existingSignInKey = 'receiptit_existing_user_signin';

export default function AlphaGatekeeper({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading, passwordRecoveryActive } = useAuth();
  const [isVerified, setIsVerified] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const restoreGateState = async () => {
      if (authLoading) return;
      if (
        session
        || passwordRecoveryActive
        || new URLSearchParams(window.location.search).get('reset') === '1'
        || sessionStorage.getItem(existingSignInKey) === 'true'
      ) {
        if (active) {
          setIsVerified(true);
          setIsChecking(false);
        }
        return;
      }

      const signupAuthorization = sessionStorage.getItem(signupAuthorizationKey);
      if (!signupAuthorization) {
        if (active) {
          setIsVerified(false);
          setIsChecking(false);
        }
        return;
      }

      const { data, error: validationError } = await supabase.functions.invoke('verify-access-code', {
        body: { signupAuthorization },
      });
      if (validationError || !data?.valid) {
        sessionStorage.removeItem(signupAuthorizationKey);
      }
      if (active) {
        setIsVerified(!validationError && data?.valid === true);
        setIsChecking(false);
      }
    };

    void restoreGateState();
    return () => { active = false; };
  }, [authLoading, passwordRecoveryActive, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const trimmedCode = accessCode.trim().toUpperCase();

      if (!trimmedCode) {
        setError('Please enter an access code');
        setIsLoading(false);
        return;
      }

      const { data, error: verificationError } = await supabase.functions.invoke('verify-access-code', {
        body: { accessCode: trimmedCode },
      });

      if (verificationError || !data?.valid || typeof data.signupAuthorization !== 'string') {
        console.error('Access-code verification failed');
        setError('That access code didn’t work. Please request access from the team.');
        setIsLoading(false);
        return;
      }

      sessionStorage.setItem(signupAuthorizationKey, data.signupAuthorization);
      sessionStorage.removeItem(existingSignInKey);
      setIsVerified(true);
    } catch (err) {
      console.error('Access code verification error:', err);
      setError('That access code didn’t work. Please request access from the team.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="fixed inset-0 bg-[#050505] flex items-center justify-center z-[9999]">
        <div className="animate-pulse text-[#2DD4BF]">Loading...</div>
      </div>
    );
  }

  if (isVerified) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 bg-[#050505] flex items-center justify-center z-[9999] p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#2DD4BF]/10 mb-4">
            <Lock className="w-8 h-8 text-[#2DD4BF]" />
          </div>

          <div className="mb-4"><ReceiptItWordmark className="text-4xl" /></div>

          <h1 className="text-2xl font-bold text-white tracking-tight">
            Early access
          </h1>

          <p className="text-gray-400 text-sm leading-relaxed">
            This beta is invite-only.<br />
            Enter your access code to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
                setError('');
              }}
              placeholder="Enter access code"
              className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF] transition-all font-mono text-sm"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="text-red-400 text-xs text-center py-2 px-3 bg-red-950/20 border border-red-900/30 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[#2DD4BF] text-black font-semibold rounded-lg hover:bg-[#2DD4BF]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Checking...' : 'Continue'}
          </button>
        </form>

        <div className="text-center pt-4">
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem(existingSignInKey, 'true');
              setIsVerified(true);
            }}
            className="mb-5 text-sm font-semibold text-gray-300 transition-colors hover:text-white"
          >
            Already have an account? Sign in
          </button>
          <p className="text-gray-600 text-xs">
            Need access?<br />
            <a
              href="mailto:founder@receiptit.co.uk"
              className="text-[#2DD4BF] hover:text-[#2DD4BF]/80 transition-colors"
            >
              founder@receiptit.co.uk
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
