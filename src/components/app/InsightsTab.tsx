import { motion } from 'framer-motion';
import { BarChart3, RefreshCw, Store, Tag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FINALIZED_RECEIPT_STATUSES, supabase } from '../../lib/supabase';
import { getMonthlyBudget, saveMonthlyBudget } from '../../lib/monthlyBudget';
import { useAuth } from '../../contexts/AuthContext';

type InsightReceipt = { id: string; amount: number; amountGbp: number | null; category: string; merchant: string; date: string };

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const formatMoney = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(value);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export function InsightsTab() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<InsightReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(() => getMonthlyBudget());
  const [budgetInput, setBudgetInput] = useState(() => {
    const budget = getMonthlyBudget();
    return budget ? String(budget) : '';
  });
  const [budgetError, setBudgetError] = useState('');

  const saveBudget = () => {
    const budget = Number(budgetInput);
    if (!Number.isFinite(budget) || budget <= 0) {
      setBudgetError('Enter a monthly budget greater than £0.');
      return;
    }

    saveMonthlyBudget(budget);
    setMonthlyBudget(budget);
    setBudgetInput(String(budget));
    setBudgetError('');
  };

  const clearBudget = () => {
    saveMonthlyBudget(null);
    setMonthlyBudget(null);
    setBudgetInput('');
    setBudgetError('');
  };

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      const { data, error: loadError } = await supabase.from('receipts').select('id, amount, amount_gbp, category, merchant, transaction_date, created_at, status').eq('user_id', user.id).in('status', [...FINALIZED_RECEIPT_STATUSES]).order('transaction_date', { ascending: false });
      if (!active) return;
      if (loadError) {
        setError(true);
        setReceipts([]);
      } else {
        setReceipts((data || []).map((row) => ({
          id: String(row.id),
          amount: asNumber(row.amount) ?? 0,
          amountGbp: asNumber(row.amount_gbp),
          category: typeof row.category === 'string' && row.category.trim() ? row.category.trim() : 'Other',
          merchant: typeof row.merchant === 'string' && row.merchant.trim() ? row.merchant.trim() : 'Store unknown',
          date: String(row.transaction_date || row.created_at || new Date().toISOString()),
        })));
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [user, refreshKey]);

  const summary = useMemo(() => {
    const rollup = (receipt: InsightReceipt) => receipt.amountGbp ?? receipt.amount;
    const total = receipts.reduce((sum, receipt) => sum + rollup(receipt), 0);
    const currentMonth = monthKey(new Date());
    const monthReceipts = receipts.filter((receipt) => receipt.date.slice(0, 7) === currentMonth);
    const thisMonth = monthReceipts.reduce((sum, receipt) => sum + rollup(receipt), 0);
    const byCategory = Object.entries(receipts.reduce((all, receipt) => {
      all[receipt.category] = (all[receipt.category] || 0) + rollup(receipt);
      return all;
    }, {} as Record<string, number>)).sort(([, a], [, b]) => b - a).slice(0, 5);
    const byMerchant = Object.entries(receipts.reduce((all, receipt) => {
      all[receipt.merchant] = (all[receipt.merchant] || 0) + rollup(receipt);
      return all;
    }, {} as Record<string, number>)).sort(([, a], [, b]) => b - a).slice(0, 5);
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index), 1);
      const key = monthKey(date);
      return { label: date.toLocaleDateString('en-GB', { month: 'short' }), amount: receipts.filter((receipt) => receipt.date.slice(0, 7) === key).reduce((sum, receipt) => sum + rollup(receipt), 0) };
    });
    return { total, thisMonth, average: receipts.length ? total / receipts.length : 0, byCategory, byMerchant, months };
  }, [receipts]);

  if (loading) return <div className="mx-auto max-w-7xl px-6 pb-32 pt-8"><div className="h-8 w-32 animate-pulse rounded bg-white/10" /><div className="mt-8 grid gap-4 sm:grid-cols-3"><div className="h-32 animate-pulse rounded-2xl bg-white/[0.045]" /><div className="h-32 animate-pulse rounded-2xl bg-white/[0.045]" /><div className="h-32 animate-pulse rounded-2xl bg-white/[0.045]" /></div></div>;
  if (error) return <div className="mx-auto max-w-7xl px-6 pb-32 pt-8"><h1 className="text-3xl font-bold text-white">Insights</h1><div className="mt-8 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.045] p-8 text-center"><p className="text-gray-300">Could not load insights right now.</p><button onClick={() => setRefreshKey((value) => value + 1)} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-300"><RefreshCw className="h-4 w-4" />Try again</button></div></div>;

  const meaningfulChart = receipts.length >= 2 && summary.months.some((month) => month.amount > 0);
  const maxMonth = Math.max(...summary.months.map((month) => month.amount), 1);
  const maxCategory = Math.max(...summary.byCategory.map(([, amount]) => amount), 1);

  return (
    <div className="mx-auto max-w-7xl px-6 pb-32 pt-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h1 className="text-3xl font-bold text-white">Insights</h1>
        <BudgetEditor
          monthlyBudget={monthlyBudget}
          budgetInput={budgetInput}
          budgetError={budgetError}
          onInputChange={setBudgetInput}
          onSave={saveBudget}
          onClear={clearBudget}
        />
        {receipts.length === 0 ? <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.045] p-10 text-center"><BarChart3 className="mx-auto h-8 w-8 text-teal-300" /><p className="mt-4 text-gray-300">More insights will appear as you add receipts.</p></div> : <>
          <section className="mt-8"><h2 className="text-lg font-bold text-white">Summary</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><Stat label="Total spent" value={formatMoney(summary.total)} /><Stat label="This month" value={formatMoney(summary.thisMonth)} /><Stat label="Average purchase" value={formatMoney(summary.average)} /></div></section>
          {meaningfulChart ? <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6"><h2 className="text-lg font-bold text-white">Spending over time</h2><div className="mt-7 flex h-48 items-end gap-3">{summary.months.map((month) => <div key={month.label} className="flex min-w-0 flex-1 flex-col items-center gap-2"><span className="text-[11px] text-gray-500">{month.amount ? formatMoney(month.amount) : ''}</span><motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(4, (month.amount / maxMonth) * 100)}%` }} transition={{ duration: 0.22 }} className="w-full rounded-t-lg bg-gradient-to-t from-teal-500/60 to-teal-300/25" /><span className="text-xs text-gray-400">{month.label}</span></div>)}</div></section> : <p className="mt-8 text-sm text-gray-400">More insights will appear as you add receipts.</p>}
          <div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6"><h2 className="flex items-center gap-2 text-lg font-bold text-white"><Tag className="h-4 w-4 text-teal-300" />By category</h2><div className="mt-5 space-y-4">{summary.byCategory.map(([category, amount]) => <div key={category}><div className="flex justify-between gap-4 text-sm"><span className="text-gray-300">{category}</span><span className="font-semibold text-white">{formatMoney(amount)}</span></div><div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-400/70" style={{ width: `${(amount / maxCategory) * 100}%` }} /></div></div>)}</div></section><section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6"><h2 className="flex items-center gap-2 text-lg font-bold text-white"><Store className="h-4 w-4 text-teal-300" />Top stores</h2><div className="mt-4 divide-y divide-white/10">{summary.byMerchant.map(([merchant, amount]) => <div key={merchant} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="truncate text-gray-300">{merchant}</span><span className="shrink-0 font-semibold text-white">{formatMoney(amount)}</span></div>)}</div></section></div>
        </>}
      </motion.div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>;
}

function BudgetEditor({
  monthlyBudget,
  budgetInput,
  budgetError,
  onInputChange,
  onSave,
  onClear,
}: {
  monthlyBudget: number | null;
  budgetInput: string;
  budgetError: string;
  onInputChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return <section className="mt-6 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6"><div className="flex flex-col gap-1"><h2 className="text-lg font-bold text-white">Monthly budget</h2><p className="text-sm text-gray-400">Set a monthly budget to see your progress in Wallet.</p></div><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Budget amount<span className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><span className="text-base text-gray-400">£</span><input aria-label="Monthly budget" type="number" min="0.01" step="0.01" inputMode="decimal" value={budgetInput} onChange={(event) => onInputChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSave(); }} className="w-full bg-transparent py-2.5 text-base font-semibold text-white outline-none placeholder:text-gray-600" placeholder="0.00" /></span></label><div className="flex gap-2"><button type="button" onClick={onSave} className="rounded-xl bg-teal-400 px-4 py-3 text-sm font-bold text-black transition-colors hover:bg-teal-300">Save budget</button>{monthlyBudget ? <button type="button" onClick={onClear} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5">Remove</button> : null}</div></div>{budgetError ? <p className="mt-3 text-sm text-amber-200">{budgetError}</p> : null}</section>;
}
