import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const signupAuthorizationKey = 'receiptit_signup_authorization';

export default function AlphaGatekeeper({ children }: { children: React.ReactNode }) {
  const [isVerified, setIsVerified] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const verified = localStorage.getItem('is_alpha_verified');
    if (verified === 'true') {
      setIsVerified(true);
    }
    setIsChecking(false);
  }, []);

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
        setError('Invalid Key. Please request access at founder@receiptit.co.uk');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('is_alpha_verified', 'true');
      sessionStorage.setItem(signupAuthorizationKey, data.signupAuthorization);
      setIsVerified(true);
    } catch (err) {
      console.error('Access code verification error:', err);
      setError('Invalid Key. Please request access at founder@receiptit.co.uk');
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
    <main className="fixed inset-0 bg-[#050505] flex items-center justify-center z-[9999] p-4" aria-label="ReceiptIt beta access">
      <div className="ri-surface max-w-md w-full space-y-7 p-6 sm:p-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-[#2DD4BF]/20 bg-[#2DD4BF]/10 mb-2">
            <Lock className="w-8 h-8 text-[#2DD4BF]" />
          </div>

          <div className="flex justify-center mb-4">
            <img
              src="/logo.png"
              alt="receiptIt"
              className="h-12 w-auto"
            />
          </div>

          <p className="ri-eyebrow">Invitation access</p>
          <h1 className="mt-2 text-2xl font-bold text-white tracking-tight">ReceiptIt beta</h1>

          <p className="text-gray-400 text-sm leading-relaxed">
            This private beta is for invited testers. Enter your access key to continue.
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
              placeholder="Enter Access Key"
              aria-label="Access Key"
              className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF] transition-all font-mono text-sm"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="text-red-400 text-xs text-center py-2 px-3 bg-red-950/20 border border-red-900/30 rounded-lg" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[#2DD4BF] text-black font-semibold rounded-lg hover:bg-[#2DD4BF]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Verifying...' : 'Submit Access Key'}
          </button>
        </form>

        <div className="text-center pt-1">
          <p className="text-gray-600 text-xs">
            Need an access key?<br />
            <a
              href="mailto:founder@receiptit.co.uk"
              className="text-[#2DD4BF] hover:text-[#2DD4BF]/80 transition-colors"
            >
              founder@receiptit.co.uk
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
