import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Coins } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  BETA_CURRENCIES,
  BUDGET_INCREMENT,
  DEFAULT_MONTHLY_BUDGET,
  formatCurrency,
  formatCurrencyInputSymbol,
  suggestPreferredCurrency,
  SupportedCurrencyCode,
} from '../../lib/currency';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

export function CurrencySetupModal() {
  const { updateAccountCurrency } = useAuth();
  const [step, setStep] = useState<'currency' | 'budget'>('currency');
  const [currency, setCurrency] = useState<SupportedCurrencyCode>(() => suggestPreferredCurrency());
  const [budget, setBudget] = useState(String(DEFAULT_MONTHLY_BUDGET));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const finishSetup = async () => {
    const amount = Number(budget);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount / BUDGET_INCREMENT)) {
      setError(`Use whole ${formatCurrency(BUDGET_INCREMENT, currency, { maximumFractionDigits: 0, minimumFractionDigits: 0 })} amounts.`);
      return;
    }

    setSaving(true);
    const { error: updateError } = await updateAccountCurrency(currency, amount, true);
    setSaving(false);
    if (updateError) {
      setError('We couldn’t save your currency settings. Please try again.');
    }
  };

  return (
    <div className="ri-scroll-viewport bg-black">
      <div className="ri-scroll-viewport__inner">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full min-w-0 max-w-lg rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl sm:p-8"
      >
        <div className="text-center">
          <Coins className="mx-auto h-10 w-10 text-teal-300" strokeWidth={1.5} />
          <h1 className="mt-4"><ReceiptItWordmark className="text-3xl" /></h1>
          <p className="mt-2 text-sm text-gray-400">Your purchases, kept private.</p>
        </div>

        {step === 'currency' ? (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-white">Main currency</h2>
            <p className="mt-2 text-sm text-gray-400">Choose the currency you normally spend in.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {BETA_CURRENCIES.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => setCurrency(option.code)}
                  className={`flex min-h-14 min-w-0 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    currency === option.code
                      ? 'border-teal-300/50 bg-teal-400/15 text-white'
                      : 'border-white/10 bg-white/[0.035] text-gray-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="w-9 text-lg font-bold text-teal-200">{option.symbol}</span>
                  <span className="min-w-0"><span className="block break-words text-sm font-semibold">{option.name}</span><span className="text-xs text-gray-500">{option.code}</span></span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setStep('budget')} className="mt-6 w-full rounded-xl bg-teal-400 py-3 font-bold text-black hover:bg-teal-300">Continue</button>
          </div>
        ) : (
          <div className="mt-8">
            <button type="button" onClick={() => { setStep('currency'); setError(''); }} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Back</button>
            <h2 className="mt-4 text-xl font-bold text-white">Monthly budget</h2>
            <p className="mt-2 text-sm text-gray-400">Set a monthly spending budget. You can change it later.</p>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Budget amount
              <span className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4">
                <span className="text-lg text-gray-300">{formatCurrencyInputSymbol(currency)}</span>
                <input
                  aria-label="Monthly budget"
                  type="number"
                  min={BUDGET_INCREMENT}
                  step={BUDGET_INCREMENT}
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  className="w-full bg-transparent py-4 text-xl font-bold text-white outline-none"
                />
              </span>
            </label>
            {error ? <p className="mt-3 text-sm text-amber-200">{error}</p> : null}
            <button type="button" disabled={saving} onClick={() => void finishSetup()} className="mt-6 w-full rounded-xl bg-teal-400 py-3 font-bold text-black hover:bg-teal-300 disabled:opacity-50">{saving ? 'Saving…' : 'Finish setup'}</button>
          </div>
        )}
      </motion.div>
      </div>
    </div>
  );
}
