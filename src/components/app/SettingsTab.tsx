import { motion } from 'framer-motion';
import { AlertTriangle, Coins, Download, FileText, Mail, MessageCircle, Minus, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  BETA_CURRENCIES,
  BUDGET_INCREMENT,
  convertCurrencyAmount,
  formatCurrency,
  formatCurrencyInputSymbol,
  SupportedCurrencyCode,
} from '../../lib/currency';

export function SettingsTab() {
  const { user, signOut, deleteAccount, accountCurrency, updateAccountCurrency } = useAuth();
  const { showToast } = useToast();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showProtectionDetail, setShowProtectionDetail] = useState(false);
  const [currencyDraft, setCurrencyDraft] = useState<SupportedCurrencyCode>(accountCurrency.preferredCurrency);
  const [budgetDraft, setBudgetDraft] = useState(String(accountCurrency.monthlyBudgetAmount ?? ''));
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyError, setCurrencyError] = useState('');
  const currencyRequestId = useRef(0);

  useEffect(() => {
    setCurrencyDraft(accountCurrency.preferredCurrency);
    setBudgetDraft(String(accountCurrency.monthlyBudgetAmount ?? ''));
  }, [accountCurrency]);

  const handleCurrencyDraftChange = async (nextCurrency: SupportedCurrencyCode) => {
    const requestId = currencyRequestId.current + 1;
    currencyRequestId.current = requestId;
    setCurrencyDraft(nextCurrency);
    setCurrencyError('');
    if (nextCurrency === accountCurrency.preferredCurrency) {
      setBudgetDraft(String(accountCurrency.monthlyBudgetAmount ?? ''));
      return;
    }
    if (!accountCurrency.monthlyBudgetAmount) {
      setBudgetDraft('');
      return;
    }

    const converted = await convertCurrencyAmount(
      accountCurrency.monthlyBudgetAmount,
      accountCurrency.preferredCurrency,
      nextCurrency,
    );
    if (requestId !== currencyRequestId.current) return;
    if (converted === null) {
      setBudgetDraft('');
      setCurrencyError(`We couldn’t suggest a converted budget. Enter the amount you want in ${nextCurrency}.`);
      return;
    }
    setBudgetDraft(String(Math.max(BUDGET_INCREMENT, Math.round(converted / BUDGET_INCREMENT) * BUDGET_INCREMENT)));
  };

  const changeBudgetBy = (difference: number) => {
    const current = Number(budgetDraft) || 0;
    setBudgetDraft(String(Math.max(BUDGET_INCREMENT, current + difference)));
    setCurrencyError('');
  };

  const handleSaveCurrencySettings = async () => {
    const amount = Number(budgetDraft);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount / BUDGET_INCREMENT)) {
      setCurrencyError(`Use whole ${formatCurrency(BUDGET_INCREMENT, currencyDraft, { maximumFractionDigits: 0, minimumFractionDigits: 0 })} amounts.`);
      return;
    }

    setCurrencySaving(true);
    const { error } = await updateAccountCurrency(currencyDraft, amount, true);
    setCurrencySaving(false);
    if (error) {
      setCurrencyError('We couldn’t save your currency settings. Please try again.');
      return;
    }
    showToast('Currency settings saved');
  };

  const handleExport = async () => {
    if (!user) return;
    const { data: receipts, error } = await supabase.from('receipts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error || !receipts) {
      showToast('Could not prepare your download', 'Please try again in a moment.');
      return;
    }
    const csvCell = (value: unknown) => {
      const rawValue = String(value ?? '');
      const safeValue = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
      return `"${safeValue.replace(/"/g, '""')}"`;
    };
    const settingsHeaders = ['Preferred currency', 'Monthly budget', 'Budget currency'];
    const settingsRow = [accountCurrency.preferredCurrency, accountCurrency.monthlyBudgetAmount, accountCurrency.monthlyBudgetCurrency];
    const headers = ['Status', 'Document type', 'Date', 'Store', 'Amount', 'Currency', 'Category', 'Reference'];
    const rows = receipts.map((receipt) => [receipt.status, receipt.document_type, receipt.transaction_date, receipt.merchant, receipt.amount, receipt.currency, receipt.category, receipt.reference_number]);
    const exportRows = [settingsHeaders, settingsRow, [], headers, ...rows];
    const blob = new Blob([exportRows.map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receiptIt-data-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    const { error } = await deleteAccount();
    setDeleteLoading(false);
    if (error) {
      showToast(error.message || 'Could not delete your account');
      return;
    }
    showToast('Account deleted');
    setShowDeleteModal(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 pb-32 pt-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4"><Mail className="h-5 w-5 text-teal-300" strokeWidth={1.7} /><h2 className="font-bold text-white">Account</h2></div>
          <div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-gray-500">Email</p><p className="mt-1 break-all text-sm text-gray-300">{user?.email || 'No email set'}</p><button onClick={() => void signOut()} className="mt-5 min-h-11 text-sm font-semibold text-gray-300 transition-colors hover:text-white">Sign out</button></div>
        </section>
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4"><Coins className="h-5 w-5 text-teal-300" strokeWidth={1.7} /><h2 className="font-bold text-white">Currency &amp; budget</h2></div>
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-[0.13em] text-gray-500">
              Main currency
              <select
                aria-label="Main currency"
                value={currencyDraft}
                onChange={(event) => void handleCurrencyDraftChange(event.target.value as SupportedCurrencyCode)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-teal-300/40"
              >
                {BETA_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.symbol} {currency.name} ({currency.code})</option>)}
              </select>
              <span className="mt-2 block text-xs font-normal normal-case tracking-normal text-gray-500">We’ll use this for your spending totals. Each receipt keeps its original currency.</span>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.13em] text-gray-500">
              Monthly budget
              <span className="mt-2 flex items-center rounded-xl border border-white/10 bg-black/20">
                <button type="button" aria-label="Decrease monthly budget" onClick={() => changeBudgetBy(-BUDGET_INCREMENT)} className="min-h-12 px-3 text-gray-300 hover:text-white"><Minus className="h-4 w-4" /></button>
                <span className="text-base text-gray-400">{formatCurrencyInputSymbol(currencyDraft)}</span>
                <input aria-label="Monthly budget" type="number" min={BUDGET_INCREMENT} step={BUDGET_INCREMENT} inputMode="numeric" value={budgetDraft} onChange={(event) => { setBudgetDraft(event.target.value); setCurrencyError(''); }} className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base font-semibold text-white outline-none" />
                <button type="button" aria-label="Increase monthly budget" onClick={() => changeBudgetBy(BUDGET_INCREMENT)} className="min-h-12 px-3 text-gray-300 hover:text-white"><Plus className="h-4 w-4" /></button>
              </span>
            </label>
            <div className="md:col-span-2">
              {currencyDraft !== accountCurrency.preferredCurrency ? <p className="mb-3 text-sm text-teal-100">Your currency will change to {currencyDraft}. Confirm the monthly budget above before saving.</p> : null}
              {currencyError ? <p className="mb-3 text-sm text-amber-200">{currencyError}</p> : null}
              <button type="button" disabled={currencySaving} onClick={() => void handleSaveCurrencySettings()} className="rounded-xl bg-teal-400 px-4 py-3 text-sm font-bold text-black hover:bg-teal-300 disabled:opacity-50">{currencySaving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </section>
        <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-6">
          <div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-400/10"><ShieldCheck className="h-5 w-5 text-teal-300" strokeWidth={1.7} /></div><div><h2 className="text-lg font-bold text-white">Privacy &amp; security</h2><p className="mt-1 text-sm leading-6 text-gray-400">Only you can see your receipts and purchase data.</p><button type="button" onClick={() => setShowProtectionDetail((value) => !value)} aria-expanded={showProtectionDetail} className="mt-3 inline-flex items-baseline gap-1 text-sm font-semibold text-teal-300 transition-colors hover:text-teal-200">How we protect your data</button>{showProtectionDetail && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="mt-3 max-w-xl text-sm leading-6 text-gray-400">Only you can see your saved receipts. You can download or permanently delete your data whenever you need to.</motion.p>}</div></div>
        </section>
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]"><div className="flex items-center gap-2 border-b border-white/10 px-5 py-4"><FileText className="h-5 w-5 text-teal-300" strokeWidth={1.7} /><h2 className="font-bold text-white">Your data</h2></div><div className="divide-y divide-white/10"><div className="flex items-center gap-4 p-5"><Download className="h-5 w-5 shrink-0 text-teal-300" strokeWidth={1.7} /><div className="min-w-0 flex-1"><h3 className="font-semibold text-white">Download my data</h3><p className="mt-1 text-sm text-gray-400">Download a copy of your data.</p></div><motion.button whileTap={{ scale: 0.985 }} onClick={() => void handleExport()} className="rounded-lg border border-teal-300/30 bg-teal-400/15 px-3 py-2 text-sm font-semibold text-teal-100 transition-colors hover:bg-teal-400/25">Download</motion.button></div><div className="flex items-center gap-4 p-5"><Trash2 className="h-5 w-5 shrink-0 text-red-300" strokeWidth={1.7} /><div className="min-w-0 flex-1"><h3 className="font-semibold text-white">Delete account</h3><p className="mt-1 text-sm text-gray-400">Permanently deletes your account and everything you’ve saved.</p></div><motion.button whileTap={{ scale: 0.985 }} onClick={() => setShowDeleteModal(true)} className="rounded-lg border border-red-300/25 bg-red-400/10 px-3 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-400/20">Delete</motion.button></div></div></section>
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]"><div className="flex items-center gap-2 border-b border-white/10 px-5 py-4"><MessageCircle className="h-5 w-5 text-teal-300" strokeWidth={1.7} /><h2 className="font-bold text-white">Feedback</h2></div><div className="p-5"><p className="text-sm leading-6 text-gray-400">Found something? Tell us.</p><div className="mt-4 flex flex-wrap gap-3"><a href="mailto:founder@receiptit.co.uk?subject=receiptIt%20beta%20problem" className="inline-flex min-h-10 items-center rounded-lg border border-teal-300/30 bg-teal-400/15 px-3 py-2 text-sm font-semibold text-teal-100 transition-colors hover:bg-teal-400/25">Report a problem</a><a href="mailto:founder@receiptit.co.uk?subject=receiptIt%20beta%20suggestion" className="inline-flex min-h-10 items-center rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/5">Suggest an improvement</a></div></div></section>
        {showDeleteModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !deleteLoading && setShowDeleteModal(false)}><motion.div initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }} className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-950 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start gap-3"><div className="rounded-xl border border-red-400/25 bg-red-400/10 p-2"><AlertTriangle className="h-5 w-5 text-red-300" /></div><div className="flex-1"><h2 className="text-lg font-bold text-white">Delete account?</h2><p className="mt-2 text-sm leading-6 text-gray-400">This permanently deletes your account and everything you’ve saved. This cannot be undone.</p></div><button aria-label="Close" onClick={() => setShowDeleteModal(false)} disabled={deleteLoading} className="text-gray-500 transition-colors hover:text-white"><X className="h-5 w-5" /></button></div><div className="mt-6 flex gap-3"><button onClick={() => setShowDeleteModal(false)} disabled={deleteLoading} className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/5">Cancel</button><button onClick={() => void handleDeleteAccount()} disabled={deleteLoading} className="flex-1 rounded-lg border border-red-300/25 bg-red-400/15 px-3 py-2.5 text-sm font-semibold text-red-100 hover:bg-red-400/25 disabled:opacity-50">{deleteLoading ? 'Deleting…' : 'Delete account'}</button></div></motion.div></div>}
      </motion.div>
    </div>
  );
}
