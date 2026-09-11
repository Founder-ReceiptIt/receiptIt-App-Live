import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { ReceiptItWordmark } from '../ReceiptItWordmark';
import { useAuth } from '../../contexts/AuthContext';
import { ProductIntro } from './ProductIntro';
import {
  AUTHORISED_INTRO_COMPLETE_KEY,
  BETA_DEVICE_GRANT_KEY,
  clearProtectedAppRoute,
  migrateStartupState,
  normaliseAuthenticatedRoute,
  SIGNUP_AUTHORIZATION_KEY,
} from '../../lib/authRouting';
import { restoreBetaDevice, verifyBetaAccess } from '../../lib/betaAccess';
import { recordStartup } from '../../lib/startupDiagnostics';
import { startAccessJourney, trackAccessJourney } from '../../lib/accessCodeTelemetry';

export default function AlphaGatekeeper({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading, startupError } = useAuth();
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [routeRevision, setRouteRevision] = useState(0);
  const [gateState, setGateState] = useState<'checking' | 'authorised' | 'public' | 'unavailable'>('checking');

  useEffect(() => {
    if (!session) return;
    normaliseAuthenticatedRoute();
  }, [session]);

  useEffect(() => {
    if (authLoading || session) return;
    const clearStaleRoute = () => clearProtectedAppRoute();
    clearStaleRoute();
    window.addEventListener('hashchange', clearStaleRoute);
    window.addEventListener('popstate', clearStaleRoute);
    return () => {
      window.removeEventListener('hashchange', clearStaleRoute);
      window.removeEventListener('popstate', clearStaleRoute);
    };
  }, [authLoading, session]);

  useEffect(() => {
    let active = true;
    migrateStartupState();
    recordStartup({ protectedRoute: /^#(wallet|settings|scan|alias|insights|activity)$/.test(location.hash) ? location.hash : '', authResolved: !authLoading });
    if (!authLoading && !session) clearProtectedAppRoute();
    setGateState('checking');
    const check = async () => {
      const token = localStorage.getItem(BETA_DEVICE_GRANT_KEY);
      const legacyGrant = sessionStorage.getItem(SIGNUP_AUTHORIZATION_KEY);
      let valid = false;
      if (token) {
        const needsSignupGrant = !session && (localStorage.getItem(AUTHORISED_INTRO_COMPLETE_KEY) !== 'true' || window.location.pathname === '/signup');
        valid = await verifyBetaAccess({ deviceAuthorization: token, ...(needsSignupGrant ? { mode: 'signup' } : {}) });
      }
      if (!valid && session?.access_token) valid = await restoreBetaDevice(session.access_token);
      if (!valid && legacyGrant) valid = await verifyBetaAccess({ signupAuthorization: legacyGrant });
      if (!active) return;
      if (!valid) {
        localStorage.removeItem(BETA_DEVICE_GRANT_KEY);
        sessionStorage.removeItem(SIGNUP_AUTHORIZATION_KEY);
      }
      setGateState(valid ? 'authorised' : 'public');
      recordStartup({ betaAuthorised: valid });
    };
    void check().catch(() => {
      if (!active) return;
      setGateState('unavailable');
      recordStartup({ failure: 'beta_verification_unavailable' });
    });
    return () => { active = false; };
  }, [authLoading, session]);

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

      const valid = await verifyBetaAccess({ accessCode: trimmedCode, journeyId: startAccessJourney() });
      if (!valid) {
        console.error('Access-code verification failed');
        setError('That access code didn’t work. Please request access from the team.');
        setIsLoading(false);
        return;
      }

      localStorage.removeItem(AUTHORISED_INTRO_COMPLETE_KEY);
      sessionStorage.removeItem(AUTHORISED_INTRO_COMPLETE_KEY);
      window.history.replaceState({ authRoute: 'signup' }, '', '/signup');
      setGateState('authorised');
      setRouteRevision((revision) => revision + 1);
    } catch (err) {
      console.error('Access code verification error:', err);
      setError('That access code didn’t work. Please request access from the team.');
    } finally {
      setIsLoading(false);
    }
  };

  // A background grant refresh must not unmount an authenticated Scan/Wallet.
  if (authLoading || (!session && gateState === 'checking')) {
    return (
      <div className="ri-page-height fixed inset-0 z-[9999] flex items-center justify-center bg-[#050505]">
        <div className="animate-pulse text-[#2DD4BF]">Loading...</div>
      </div>
    );
  }

  const signupAuthorization = sessionStorage.getItem(SIGNUP_AUTHORIZATION_KEY);
  const hasCompletedAuthorisedIntro = localStorage.getItem(AUTHORISED_INTRO_COMPLETE_KEY) === 'true';
  void routeRevision;

  if (session) {
    recordStartup({ destination: 'APP', authResolved: true });
    return <>
      {startupError && <div role="alert" className="fixed inset-x-4 top-4 z-[10000] rounded-xl border border-white/15 bg-neutral-900 p-3 text-center text-sm text-white">We couldn’t finish opening your account. <button className="font-semibold text-teal-300" onClick={() => window.location.reload()}>Try again</button></div>}
      {children}
    </>;
  }

  if (gateState === 'authorised' && !hasCompletedAuthorisedIntro && signupAuthorization) {
    recordStartup({ destination: 'INTRO', introRequired: true });
    return (
      <ProductIntro
        onContinue={(method) => {
          trackAccessJourney('intro_completed', undefined, method);
          localStorage.setItem(AUTHORISED_INTRO_COMPLETE_KEY, 'true');
          window.history.replaceState({ authRoute: 'signup' }, '', '/signup');
          setRouteRevision((revision) => revision + 1);
        }}
      />
    );
  }

  if (gateState === 'authorised') {
    recordStartup({ destination: window.location.pathname === '/signup' && signupAuthorization ? 'SIGN_UP' : 'SIGN_IN', introRequired: false });
    return <>
      {startupError && <div role="alert" className="fixed inset-x-4 top-4 z-[10000] rounded-xl border border-white/15 bg-neutral-900 p-3 text-center text-sm text-white">We couldn’t restore your session. <button className="font-semibold text-teal-300" onClick={() => window.location.reload()}>Try again</button></div>}
      {children}
    </>;
  }

  recordStartup({ destination: 'EARLY_ACCESS', authResolved: true });

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

        {(gateState === 'unavailable' || startupError) && <div role="alert" className="rounded-xl border border-white/15 p-3 text-sm text-gray-300">We couldn’t check your access. Your saved information is still here. <button type="button" className="font-semibold text-teal-300" onClick={() => window.location.reload()}>Try again</button></div>}
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
