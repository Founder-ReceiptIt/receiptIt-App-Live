import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ReceiptItWordmark } from '../ReceiptItWordmark';
import { useAuth } from '../../contexts/AuthContext';
import { ProductIntro } from './ProductIntro';
import {
  AUTHORISED_INTRO_COMPLETE_KEY,
  clearProtectedAppRoute,
  EXISTING_USER_SIGN_IN_KEY,
  normaliseAuthenticatedRoute,
  openExistingUserSignIn,
  SIGNUP_AUTHORIZATION_KEY,
} from '../../lib/authRouting';

export default function AlphaGatekeeper({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading, passwordRecoveryActive } = useAuth();
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [routeRevision, setRouteRevision] = useState(0);

  useEffect(() => {
    if (!session) return;
    normaliseAuthenticatedRoute();
  }, [session]);

  useEffect(() => {
    if (authLoading || session || passwordRecoveryActive) return;

    if (window.location.pathname === '/signin') {
      sessionStorage.setItem(EXISTING_USER_SIGN_IN_KEY, 'true');
    }

    // Protected destinations belong to an authenticated identity. Keeping one
    // after sign-out allowed #settings restoration to race the public gate.
    clearProtectedAppRoute();
    setRouteRevision((revision) => revision + 1);
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

      sessionStorage.setItem(SIGNUP_AUTHORIZATION_KEY, data.signupAuthorization);
      sessionStorage.removeItem(EXISTING_USER_SIGN_IN_KEY);
      sessionStorage.removeItem(AUTHORISED_INTRO_COMPLETE_KEY);
      setRouteRevision((revision) => revision + 1);
    } catch (err) {
      console.error('Access code verification error:', err);
      setError('That access code didn’t work. Please request access from the team.');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="ri-page-height fixed inset-0 z-[9999] flex items-center justify-center bg-[#050505]">
        <div className="animate-pulse text-[#2DD4BF]">Loading...</div>
      </div>
    );
  }

  const isPasswordRecovery = passwordRecoveryActive || new URLSearchParams(window.location.search).get('reset') === '1';
  const isExistingUserSignIn = sessionStorage.getItem(EXISTING_USER_SIGN_IN_KEY) === 'true' || window.location.pathname === '/signin';
  const signupAuthorization = sessionStorage.getItem(SIGNUP_AUTHORIZATION_KEY);
  const hasCompletedAuthorisedIntro = sessionStorage.getItem(AUTHORISED_INTRO_COMPLETE_KEY) === 'true';
  void routeRevision;

  if (session || isPasswordRecovery || isExistingUserSignIn) {
    return <>{children}</>;
  }

  if (signupAuthorization && !hasCompletedAuthorisedIntro) {
    return (
      <ProductIntro
        onContinue={() => {
          sessionStorage.setItem(AUTHORISED_INTRO_COMPLETE_KEY, 'true');
          setRouteRevision((revision) => revision + 1);
        }}
      />
    );
  }

  if (signupAuthorization && hasCompletedAuthorisedIntro) {
    return <>{children}</>;
  }

  return (
    <div className="ri-scroll-viewport z-[9999] bg-[#050505]">
      <div className="ri-scroll-viewport__inner">
      <div className="w-full min-w-0 max-w-md space-y-8">
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
              openExistingUserSignIn();
              setRouteRevision((revision) => revision + 1);
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
    </div>
  );
}
