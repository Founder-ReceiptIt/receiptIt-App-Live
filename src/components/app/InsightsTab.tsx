import { motion } from 'framer-motion';
import { BarChart3, RefreshCw, Store, Tag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { convertReceiptAmounts, formatCurrency } from '../../lib/currency';
import {
  getAnalyticsEligibleAmount,
  getAnalyticsMoneySummary,
  getAnalyticsMonthKey,
  getCurrentCalendarMonthKey,
  isAnalyticsPurchaseCandidate,
} from '../../lib/receiptAnalytics';

type InsightReceipt = { id: string; amount: number; currency: string; convertedAmount: number; category: string; merchant: string; transactionDate: string | null; status: string | null; errorReason: string | null; documentType: string | null };
const monthKey = getCurrentCalendarMonthKey;

export function InsightsTab() {
  const { user, accountCurrency } = useAuth();
  const [receipts, setReceipts] = useState<InsightReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [excludedCount, setExcludedCount] = useState(0);
  const [purchaseCandidateCount, setPurchaseCandidateCount] = useState(0);
  const preferredCurrency = accountCurrency.preferredCurrency;
  const formatMoney = (value: number) => formatCurrency(value, preferredCurrency);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      const { data, error: loadError } = await supabase
        .from('receipts')
        .select('id, amount, category, merchant, currency, transaction_date, status, error_reason, document_type')
        .eq('user_id', user.id)
        .in('status', ['parsed', 'completed', 'needs_review'])
        .order('transaction_date', { ascending: false });
      if (!active) return;
      if (loadError) {
        setError(true);
        setReceipts([]);
        setPurchaseCandidateCount(0);
      } else {
        const purchaseCandidates = (data || []).filter((row) => isAnalyticsPurchaseCandidate({
          status: row.status,
          documentType: row.document_type,
        }));
        const sourceReceipts = purchaseCandidates.flatMap((row) => {
          const amount = getAnalyticsEligibleAmount({
            amount: row.amount,
            status: row.status,
            errorReason: row.error_reason,
            documentType: row.document_type,
            merchant: row.merchant,
            transactionDate: row.transaction_date,
          });
          if (amount === null) return [];

          return [{
            id: String(row.id),
            amount,
            currency: typeof row.currency === 'string' && row.currency.trim() ? row.currency.toUpperCase() : '',
            category: typeof row.category === 'string' && row.category.trim() ? row.category.trim() : 'Other',
            merchant: typeof row.merchant === 'string' && row.merchant.trim() ? row.merchant.trim() : 'Store unknown',
            transactionDate: row.transaction_date ? String(row.transaction_date) : null,
            status: row.status,
            errorReason: row.error_reason,
            documentType: row.document_type,
          }];
        });
        const converted = await convertReceiptAmounts(sourceReceipts.map((receipt) => ({
          id: receipt.id,
          amount: receipt.amount,
          currency: receipt.currency,
          transactionDate: receipt.transactionDate,
        })), preferredCurrency);
        if (!active) return;
        setPurchaseCandidateCount(purchaseCandidates.length);
        setExcludedCount(purchaseCandidates.length - converted.amounts.size);
        setReceipts(sourceReceipts.flatMap((receipt) => {
          const convertedAmount = converted.amounts.get(receipt.id);
          return convertedAmount === undefined ? [] : [{ ...receipt, convertedAmount }];
        }));
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [user, refreshKey, preferredCurrency]);

  const summary = useMemo(() => {
    const rollup = (receipt: InsightReceipt) => receipt.convertedAmount;
    const currentMonth = monthKey(new Date());
    const convertedAmounts = new Map(receipts.map((receipt) => [receipt.id, receipt.convertedAmount]));
    const analyticsReceipts = receipts.map((receipt) => ({
      id: receipt.id,
      amount: receipt.amount,
      status: receipt.status,
      errorReason: receipt.errorReason,
      documentType: receipt.documentType,
      merchant: receipt.merchant,
      transactionDate: receipt.transactionDate,
    }));
    const allTime = getAnalyticsMoneySummary(analyticsReceipts, convertedAmounts);
    const currentMonthSummary = getAnalyticsMoneySummary(analyticsReceipts, convertedAmounts, currentMonth);
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
      return { label: date.toLocaleDateString('en-GB', { month: 'short' }), amount: receipts.filter((receipt) => getAnalyticsMonthKey(receipt.transactionDate) === key).reduce((sum, receipt) => sum + rollup(receipt), 0) };
    });
    return { total: allTime.total, thisMonth: currentMonthSummary.total, average: allTime.average, byCategory, byMerchant, months };
  }, [receipts]);

  if (loading) return <div className="ri-mobile-page mx-auto min-w-0 max-w-7xl px-4 pt-8 sm:px-6"><div className="h-8 w-32 animate-pulse rounded bg-white/10" /><div className="mt-8 grid gap-4 sm:grid-cols-3"><div className="h-32 animate-pulse rounded-2xl bg-white/[0.045]" /><div className="h-32 animate-pulse rounded-2xl bg-white/[0.045]" /><div className="h-32 animate-pulse rounded-2xl bg-white/[0.045]" /></div></div>;
  if (error) return <div className="ri-mobile-page mx-auto min-w-0 max-w-7xl px-4 pt-8 sm:px-6"><h1 className="text-3xl font-bold text-white">Your spending</h1><div className="mt-8 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-center sm:p-8"><p className="text-gray-300">Could not load insights right now.</p><button onClick={() => setRefreshKey((value) => value + 1)} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-300"><RefreshCw className="h-4 w-4" />Try again</button></div></div>;

  const meaningfulChart = receipts.length >= 2 && summary.months.some((month) => month.amount > 0);
  const maxMonth = Math.max(...summary.months.map((month) => month.amount), 1);
  const maxCategory = Math.max(...summary.byCategory.map(([, amount]) => amount), 1);

  return (
    <div className="ri-mobile-page mx-auto min-w-0 max-w-7xl px-4 pt-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h1 className="text-3xl font-bold text-white">Your spending</h1>
        {purchaseCandidateCount === 0 ? <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.045] p-10 text-center"><BarChart3 className="mx-auto h-8 w-8 text-teal-300" /><p className="mt-4 text-gray-300">Your insights will appear as you add receipts.</p></div> : <>
          {excludedCount > 0 ? <p className="mt-6 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{excludedCount === 1 ? 'One saved purchase is not included because its amount is still unresolved.' : `${excludedCount} saved purchases are not included because their amounts are still unresolved.`}</p> : null}
          <section className="mt-8"><h2 className="text-lg font-bold text-white">Summary</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><Stat label="Total spent" value={formatMoney(summary.total)} /><Stat label="This month" value={formatMoney(summary.thisMonth)} /><Stat label="Average purchase" value={formatMoney(summary.average)} /></div></section>
          {meaningfulChart ? (
            <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6">
              <h2 className="text-lg font-bold text-white">Spending over time</h2>
              <div className="mt-7 grid grid-cols-6 gap-2 sm:gap-3" role="img" aria-label="Spending over the last six months">
                {summary.months.map((month) => {
                  const barHeight = month.amount > 0 ? Math.max(8, (month.amount / maxMonth) * 100) : 0;

                  return (
                    <div key={month.label} className="flex min-w-0 flex-col items-center gap-2">
                      <span className="h-4 max-w-full truncate text-[10px] font-medium text-gray-400 sm:text-[11px]" title={month.amount ? formatMoney(month.amount) : undefined}>
                        {month.amount ? formatMoney(month.amount) : ''}
                      </span>
                      <div className="relative h-36 w-full overflow-hidden rounded-t-lg border-x border-t border-white/[0.04] bg-white/[0.035]">
                        {month.amount > 0 ? (
                          <div
                            style={{ height: `${barHeight}%` }}
                            className="absolute inset-x-0 bottom-0 min-h-2 rounded-t-lg bg-gradient-to-t from-teal-500 to-teal-300 shadow-[0_-6px_18px_rgba(45,212,191,0.18)]"
                          />
                        ) : (
                          <span className="absolute inset-x-1 bottom-0 h-px bg-white/10" />
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 sm:text-xs">{month.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : <p className="mt-8 text-sm text-gray-400">More insights will appear as you add receipts.</p>}
          <div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6"><h2 className="flex items-center gap-2 text-lg font-bold text-white"><Tag className="h-4 w-4 text-teal-300" />By category</h2><div className="mt-5 space-y-4">{summary.byCategory.map(([category, amount]) => <div key={category}><div className="flex justify-between gap-4 text-sm"><span className="text-gray-300">{category}</span><span className="font-semibold text-white">{formatMoney(amount)}</span></div><div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-400/70" style={{ width: `${(amount / maxCategory) * 100}%` }} /></div></div>)}</div></section><section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6"><h2 className="flex items-center gap-2 text-lg font-bold text-white"><Store className="h-4 w-4 text-teal-300" />Top stores</h2><div className="mt-4 divide-y divide-white/10">{summary.byMerchant.map(([merchant, amount]) => <div key={merchant} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="truncate text-gray-300">{merchant}</span><span className="shrink-0 font-semibold text-white">{formatMoney(amount)}</span></div>)}</div></section></div>
        </>}
      </motion.div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>;
}
