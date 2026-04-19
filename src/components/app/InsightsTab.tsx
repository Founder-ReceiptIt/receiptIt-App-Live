import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  DollarSign,
  PieChart,
  RefreshCw,
  Store,
  Tag,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { FINALIZED_RECEIPT_STATUSES, supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface InsightReceipt {
  id: string;
  rawAmount: number;
  amountGbp: number | null;
  rollupAmount: number;
  category: string;
  merchant: string;
  transactionDate: string;
  usedGbpRollup: boolean;
}

const currencySymbol = '£';
const budgetLimit = 2500;

const getTagColor = (category: string): string => {
  const categoryLower = category.toLowerCase();

  if (categoryLower.includes('tech') || categoryLower.includes('electronics')) return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
  if (categoryLower.includes('food') || categoryLower.includes('restaurant')) return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
  if (categoryLower.includes('clothing') || categoryLower.includes('fashion')) return 'text-purple-400 bg-purple-400/10 border-purple-400/30';
  if (categoryLower.includes('groceries') || categoryLower.includes('grocery')) return 'text-green-400 bg-green-400/10 border-green-400/30';
  if (categoryLower.includes('transport') || categoryLower.includes('travel')) return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';

  return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
};

const parseNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsedValue = parseFloat(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
};

const formatCurrency = (amount: number): string => `${currencySymbol}${amount.toFixed(2)}`;

const formatCompactCurrency = (amount: number): string => (
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: amount >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: amount >= 1000 ? 1 : 2,
  }).format(amount)
);

const formatReceiptDate = (value: string): string => {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Unknown date';
  }

  return parsedDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatMonthLabel = (value: Date): string => (
  value.toLocaleDateString('en-GB', { month: 'short' })
);

const getMonthKey = (value: Date): string => (
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
);

const LoadingCard = ({ className = '' }: { className?: string }) => (
  <div className={`backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 ${className}`}>
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-28 rounded bg-white/10" />
      <div className="h-10 w-36 rounded bg-white/10" />
      <div className="h-3 w-40 rounded bg-white/10" />
      <div className="h-3 w-24 rounded bg-white/10" />
    </div>
  </div>
);

export function InsightsTab() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<InsightReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchReceipts = async () => {
      console.log('[InsightsTab] Fetching receipts for user:', user.id);
      setLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from('receipts')
        .select('id, amount, amount_gbp, category, merchant, transaction_date, created_at, status')
        .eq('user_id', user.id)
        .in('status', [...FINALIZED_RECEIPT_STATUSES])
        .order('transaction_date', { ascending: false });

      console.log('[InsightsTab] Query result:', { data, error, dataLength: data?.length });

      if (error) {
        console.error('[InsightsTab] Query error:', error);
        setErrorMessage('Could not load spending insights right now.');
        setReceipts([]);
        setLoading(false);
        return;
      }

      const processedReceipts = (data || []).map((row) => {
        const rawAmount = parseNullableNumber(row.amount) ?? 0;
        const amountGbp = parseNullableNumber(row.amount_gbp);
        const transactionDate = row.transaction_date
          ? String(row.transaction_date)
          : row.created_at
          ? String(row.created_at)
          : new Date().toISOString();

        return {
          id: String(row.id),
          rawAmount,
          amountGbp,
          rollupAmount: amountGbp ?? rawAmount,
          category: typeof row.category === 'string' && row.category.trim() ? row.category.trim() : 'Other',
          merchant: typeof row.merchant === 'string' && row.merchant.trim() ? row.merchant.trim() : 'Seller unknown',
          transactionDate,
          usedGbpRollup: amountGbp !== null,
        };
      });

      processedReceipts.sort((left, right) => (
        new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime()
      ));

      console.log('[InsightsTab] Processed receipts:', processedReceipts);
      setReceipts(processedReceipts);
      setLoading(false);
    };

    void fetchReceipts();

    const channel = supabase
      .channel('receipts-insights-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receipts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchReceipts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refreshKey]);

  const totalSpent = receipts.reduce((sum, receipt) => sum + receipt.rollupAmount, 0);
  const totalReceipts = receipts.length;
  const avgTransaction = totalReceipts > 0 ? totalSpent / totalReceipts : 0;
  const gbpNormalizedCount = receipts.filter((receipt) => receipt.usedGbpRollup).length;
  const fallbackAmountCount = receipts.filter((receipt) => !receipt.usedGbpRollup && receipt.rawAmount > 0).length;

  const now = new Date();
  const currentMonthKey = getMonthKey(now);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthKey = getMonthKey(previousMonthDate);
  const currentMonthLabel = now.toLocaleDateString('en-GB', { month: 'long' });

  const currentMonthReceipts = receipts.filter((receipt) => (
    String(receipt.transactionDate).startsWith(currentMonthKey)
  ));
  const previousMonthReceipts = receipts.filter((receipt) => (
    String(receipt.transactionDate).startsWith(previousMonthKey)
  ));

  const spendThisMonth = currentMonthReceipts.reduce((sum, receipt) => sum + receipt.rollupAmount, 0);
  const receiptsThisMonth = currentMonthReceipts.length;
  const previousMonthSpend = previousMonthReceipts.reduce((sum, receipt) => sum + receipt.rollupAmount, 0);
  const monthlyDelta = previousMonthSpend > 0
    ? ((spendThisMonth - previousMonthSpend) / previousMonthSpend) * 100
    : null;
  const remainingBudget = budgetLimit - totalSpent;

  const categoryBreakdown = Object.entries(
    receipts.reduce((accumulator, receipt) => {
      if (!accumulator[receipt.category]) {
        accumulator[receipt.category] = { amount: 0, count: 0 };
      }

      accumulator[receipt.category].amount += receipt.rollupAmount;
      accumulator[receipt.category].count += 1;
      return accumulator;
    }, {} as Record<string, { amount: number; count: number }>)
  )
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count,
      percentage: totalSpent > 0 ? (data.amount / totalSpent) * 100 : 0,
      color: getTagColor(category),
    }))
    .sort((left, right) => right.amount - left.amount);

  const merchantBreakdown = Object.entries(
    receipts.reduce((accumulator, receipt) => {
      if (!accumulator[receipt.merchant]) {
        accumulator[receipt.merchant] = { amount: 0, count: 0 };
      }

      accumulator[receipt.merchant].amount += receipt.rollupAmount;
      accumulator[receipt.merchant].count += 1;
      return accumulator;
    }, {} as Record<string, { amount: number; count: number }>)
  )
    .map(([merchant, data]) => ({
      merchant,
      amount: data.amount,
      count: data.count,
      percentage: totalSpent > 0 ? (data.amount / totalSpent) * 100 : 0,
    }))
    .sort((left, right) => right.amount - left.amount);

  const topCategory = categoryBreakdown[0];
  const topMerchant = merchantBreakdown[0];
  const topCategories = categoryBreakdown.slice(0, 5);
  const topMerchants = merchantBreakdown.slice(0, 5);
  const recentReceipts = receipts.slice(0, 6);

  const monthlyData = (() => {
    const lastSixMonths = [];

    for (let index = 5; index >= 0; index -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const monthKey = getMonthKey(monthDate);
      const monthReceipts = receipts.filter((receipt) => String(receipt.transactionDate).startsWith(monthKey));
      const amount = monthReceipts.reduce((sum, receipt) => sum + receipt.rollupAmount, 0);

      lastSixMonths.push({
        month: formatMonthLabel(monthDate),
        amount,
        count: monthReceipts.length,
        isCurrentMonth: monthKey === currentMonthKey,
      });
    }

    return lastSixMonths;
  })();

  const maxAmount = Math.max(...monthlyData.map((entry) => entry.amount), 1);

  if (loading) {
    return (
      <div className="pb-32 px-6 pt-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Spending Insights</h1>
            <p className="mt-2 text-sm text-gray-400">Preparing your GBP-normalized overview</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <LoadingCard />
            <LoadingCard />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mb-8">
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr] mb-8">
            <LoadingCard className="min-h-[360px]" />
            <LoadingCard className="min-h-[360px]" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <LoadingCard className="min-h-[320px]" />
            <LoadingCard className="min-h-[320px]" />
          </div>
        </motion.div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="pb-32 px-6 pt-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Spending Insights</h1>
            <p className="mt-2 text-sm text-gray-400">Monitor finalized spend while you are away</p>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-red-400/20 rounded-2xl p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Insights could not be loaded</h2>
            <p className="text-gray-400 max-w-md mx-auto mb-6">{errorMessage}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((currentValue) => currentValue + 1)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:border-teal-400/30 hover:text-teal-300"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="pb-32 px-6 pt-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Spending Insights</h1>
            <p className="mt-2 text-sm text-gray-400">Monitor finalized spend while you are away</p>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <BarChart3 className="w-16 h-16 text-gray-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-3">Your insights will appear once finalized receipts land in the wallet</h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              We will show total spend, this month&apos;s spend, merchant and category rollups, plus a recent receipt feed for quick sanity-checks.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pb-32 px-6 pt-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Spending Insights</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-400">
            <span>Finalized receipts only</span>
            <span className="text-gray-600">•</span>
            <span>{gbpNormalizedCount}/{totalReceipts} using `amount_gbp`</span>
            {fallbackAmountCount > 0 && (
              <>
                <span className="text-gray-600">•</span>
                <span className="text-amber-300">{fallbackAmountCount} using original amount fallback</span>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 mb-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
                  <DollarSign className="w-4 h-4 text-teal-400" />
                  Total Spend
                </div>
                <div className="mt-3 text-4xl font-bold text-white">{formatCurrency(totalSpent)}</div>
                <p className="mt-2 text-sm text-gray-400">
                  Across {totalReceipts} finalized {totalReceipts === 1 ? 'receipt' : 'receipts'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Average receipt</div>
                <div className="mt-1 text-lg font-bold text-white">{formatCurrency(avgTransaction)}</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Top merchant</div>
                <div className="mt-1 text-sm font-bold text-white">{topMerchant?.merchant || 'No data'}</div>
                <div className="mt-1 text-xs text-gray-400">
                  {topMerchant ? `${formatCompactCurrency(topMerchant.amount)} • ${topMerchant.count} receipts` : 'Waiting for data'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Top category</div>
                <div className="mt-1 text-sm font-bold text-white">{topCategory?.category || 'No data'}</div>
                <div className="mt-1 text-xs text-gray-400">
                  {topCategory ? `${formatCompactCurrency(topCategory.amount)} • ${topCategory.count} receipts` : 'Waiting for data'}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
                  <Calendar className="w-4 h-4 text-teal-400" />
                  Spend This Month
                </div>
                <div className="mt-3 text-4xl font-bold text-white">{formatCurrency(spendThisMonth)}</div>
                <p className="mt-2 text-sm text-gray-400">
                  {receiptsThisMonth} {receiptsThisMonth === 1 ? 'receipt' : 'receipts'} in {currentMonthLabel}
                </p>
              </div>
              <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                monthlyDelta === null
                  ? 'border-white/10 bg-white/5 text-gray-300'
                  : monthlyDelta <= 0
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                  : 'border-amber-400/20 bg-amber-400/10 text-amber-200'
              }`}>
                {monthlyDelta !== null && (
                  monthlyDelta <= 0 ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />
                )}
                {monthlyDelta === null ? 'No prior month' : `${Math.abs(monthlyDelta).toFixed(1)}% vs last month`}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Previous month</div>
                <div className="mt-1 text-lg font-bold text-white">{formatCurrency(previousMonthSpend)}</div>
                <div className="mt-1 text-xs text-gray-400">
                  {previousMonthReceipts.length} {previousMonthReceipts.length === 1 ? 'receipt' : 'receipts'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Budget check</div>
                <div className="mt-1 text-lg font-bold text-white">{formatCurrency(Math.abs(remainingBudget))}</div>
                <div className={`mt-1 text-xs ${remainingBudget >= 0 ? 'text-gray-400' : 'text-amber-300'}`}>
                  {remainingBudget >= 0 ? 'Remaining against £2500 target' : 'Over the £2500 target'}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5"
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">
              <BarChart3 className="w-4 h-4 text-teal-400" />
              Average Receipt
            </div>
            <div className="text-3xl font-bold text-white">{formatCurrency(avgTransaction)}</div>
            <p className="mt-2 text-sm text-gray-400">Helpful for spotting unusually large uploads while travelling</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5"
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">
              <Store className="w-4 h-4 text-teal-400" />
              Top Merchant
            </div>
            <div className="text-2xl font-bold text-white truncate">{topMerchant?.merchant || 'No data'}</div>
            <p className="mt-2 text-sm text-gray-400">
              {topMerchant ? `${formatCurrency(topMerchant.amount)} across ${topMerchant.count} receipts` : 'Waiting for merchant data'}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 sm:col-span-2 xl:col-span-1"
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">
              <DollarSign className="w-4 h-4 text-teal-400" />
              GBP Coverage
            </div>
            <div className="text-3xl font-bold text-white">{gbpNormalizedCount}/{totalReceipts}</div>
            <p className="mt-2 text-sm text-gray-400">
              Rollups prefer `amount_gbp`; {fallbackAmountCount > 0 ? `${fallbackAmountCount} receipts currently fall back to raw amount` : 'all current rollups are GBP-normalized'}
            </p>
          </motion.div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-teal-400" />
                  Spend Trend
                </h2>
                <p className="mt-2 text-sm text-gray-400">Six-month GBP rollup for quick monitoring</p>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current month</div>
                <div className="mt-1 text-lg font-bold text-white">{formatCurrency(spendThisMonth)}</div>
              </div>
            </div>

            <div className="relative h-52 mb-8">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="insightsLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgb(94, 234, 212)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="rgb(20, 184, 166)" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
                <motion.polyline
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.2, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  points={monthlyData.map((entry, index) => {
                    const x = (index / (monthlyData.length - 1)) * 100;
                    const y = 100 - (entry.amount / maxAmount) * 100;
                    return `${x},${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke="url(#insightsLineGradient)"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />
                {monthlyData.map((entry, index) => {
                  const x = (index / (monthlyData.length - 1)) * 100;
                  const y = 100 - (entry.amount / maxAmount) * 100;

                  return (
                    <motion.circle
                      key={entry.month}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.35, delay: 0.9 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                      cx={`${x}%`}
                      cy={`${y}%`}
                      r="4"
                      fill={entry.isCurrentMonth ? 'rgb(45, 212, 191)' : 'rgb(148, 163, 184)'}
                      stroke="rgb(15, 23, 42)"
                      strokeWidth="2"
                    />
                  );
                })}
              </svg>

              <div className="flex items-end justify-between gap-3 h-full">
                {monthlyData.map((entry, index) => {
                  const height = (entry.amount / maxAmount) * 100;

                  return (
                    <div key={`${entry.month}-${index}`} className="flex-1 flex flex-col items-center gap-3">
                      <div className="w-full text-center">
                        <div className="text-xs font-semibold text-gray-500">
                          {entry.amount > 0 ? formatCompactCurrency(entry.amount) : '£0'}
                        </div>
                      </div>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(height, entry.amount > 0 ? 8 : 2)}%` }}
                        transition={{ duration: 0.75, delay: 0.45 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        className={`w-full rounded-t-xl ${
                          entry.isCurrentMonth
                            ? 'bg-gradient-to-t from-teal-500/50 to-teal-400/20'
                            : 'bg-gradient-to-t from-white/10 to-white/5'
                        }`}
                      />
                      <div className={`text-xs font-semibold ${entry.isCurrentMonth ? 'text-teal-300' : 'text-gray-500'}`}>
                        {entry.month}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">This month</div>
                <div className="mt-1 text-lg font-bold text-white">{formatCurrency(spendThisMonth)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Last month</div>
                <div className="mt-1 text-lg font-bold text-white">{formatCurrency(previousMonthSpend)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Change</div>
                <div className="mt-1 text-lg font-bold text-white">
                  {monthlyDelta === null ? '—' : `${monthlyDelta > 0 ? '+' : ''}${monthlyDelta.toFixed(1)}%`}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-teal-400" />
                  Recent Receipts
                </h2>
                <p className="mt-2 text-sm text-gray-400">Latest finalized receipts for a quick sanity-check</p>
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Newest first</div>
            </div>

            <div className="space-y-3">
              {recentReceipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{receipt.merchant}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        <span>{formatReceiptDate(receipt.transactionDate)}</span>
                        <span className="text-gray-600">•</span>
                        <span>{receipt.category}</span>
                        {!receipt.usedGbpRollup && (
                          <>
                            <span className="text-gray-600">•</span>
                            <span className="text-amber-300">raw amount fallback</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-white">{formatCurrency(receipt.rollupAmount)}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {receipt.usedGbpRollup ? 'GBP rollup' : 'Original amount'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.48, ease: [0.22, 1, 0.36, 1] }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-teal-400" />
                  Top Merchants
                </h2>
                <p className="mt-2 text-sm text-gray-400">Where the most spend is landing</p>
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">By GBP rollup</div>
            </div>

            <div className="space-y-3">
              {topMerchants.map((merchant, index) => (
                <div
                  key={merchant.merchant}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full border border-white/10 bg-black/20 flex items-center justify-center text-xs font-bold text-teal-300">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{merchant.merchant}</div>
                        <div className="mt-1 text-xs text-gray-400">
                          {merchant.count} {merchant.count === 1 ? 'receipt' : 'receipts'} • {merchant.percentage.toFixed(1)}% of total
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-white">{formatCurrency(merchant.amount)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.54, ease: [0.22, 1, 0.36, 1] }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-teal-400" />
                  Top Categories
                </h2>
                <p className="mt-2 text-sm text-gray-400">Category rollup for quick scanning</p>
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Share of total</div>
            </div>

            <div className="space-y-4">
              {topCategories.map((category) => (
                <div key={category.category}>
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md ${category.color}`}>
                        <Tag className="w-3 h-3" />
                        <span className="truncate max-w-[140px]">{category.category}</span>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {category.count} {category.count === 1 ? 'receipt' : 'receipts'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-white">{formatCurrency(category.amount)}</div>
                      <div className="text-xs text-gray-500">{category.percentage.toFixed(1)}%</div>
                    </div>
                  </div>

                  <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${category.percentage}%` }}
                      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-500 to-teal-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
