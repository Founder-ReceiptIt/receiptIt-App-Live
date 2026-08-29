import { useState } from 'react';
import { Lock, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

export function ResetPasswordForm() {
  const { completePasswordReset, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await completePasswordReset(password);
    setSaving(false);
    if (updateError) {
      setError('This reset link is invalid or has expired. Request a new one from sign in.');
      return;
    }
    setComplete(true);
  };

  return (
    <div className="ri-auth-page ri-page-height flex items-start justify-center overflow-x-clip bg-black sm:items-center">
      <div className="w-full min-w-0 max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
        <div className="text-center">
          <Shield className="mx-auto h-14 w-14 text-teal-400" strokeWidth={1.5} />
          <h1 className="mt-4"><ReceiptItWordmark className="text-4xl" /></h1>
          <p className="mt-2 text-sm text-gray-400">Your purchases, kept private.</p>
        </div>

        {complete ? (
          <div className="mt-8 text-center">
            <h2 className="text-xl font-bold text-white">Password updated</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">You can now sign in with your new password.</p>
            <button type="button" onClick={() => void signOut()} className="mt-6 w-full rounded-xl bg-teal-400 py-3 font-bold text-black hover:bg-teal-300">Continue to sign in</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <h2 className="text-xl font-bold text-white">Reset password</h2>
            <label className="block text-sm font-semibold text-gray-300">New password<span className="relative mt-2 block"><Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete="new-password" className="w-full rounded-lg border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white outline-none focus:border-teal-400/50" /></span><span className="mt-2 block text-xs font-normal text-gray-500">At least 8 characters.</span></label>
            <label className="block text-sm font-semibold text-gray-300">Confirm password<span className="relative mt-2 block"><Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" /><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required autoComplete="new-password" className="w-full rounded-lg border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white outline-none focus:border-teal-400/50" /></span></label>
            {error ? <p className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</p> : null}
            <button type="submit" disabled={saving} className="w-full rounded-xl bg-teal-400 py-3 font-bold text-black hover:bg-teal-300 disabled:opacity-50">{saving ? 'Updating…' : 'Update password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
