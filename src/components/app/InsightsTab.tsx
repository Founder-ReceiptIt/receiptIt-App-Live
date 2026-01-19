import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, Calendar, PieChart, BarChart3, Tag } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Receipt {
  amount: number;
  total: number;
  category: string;
  date: string;
  currency_symbol: string;
}

const getTagColor = (category: string): string => {
  const categoryLower = category.toLowerCase();

  if (categoryLower.includes('tech') || categoryLower.includes('electronics')) return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
  if (categoryLower.includes('food') || categoryLower.includes('restaurant')) return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
  if (categoryLower.includes('clothing') || categoryLower.includes('fashion')) return 'text-purple-400 bg-purple-400/10 border-purple-400/30';
  if (categoryLower.includes('groceries') || categoryLower.includes('grocery')) return 'text-green-400 bg-green-400/10 border-green-400/30';
  if (categoryLower.includes('transport') || categoryLower.includes('travel')) return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';

  return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
};

export function InsightsTab() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchReceipts = async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('amount, total, category, date, currency_symbol')
        .order('date', { ascending: false });

      if (!error && data) {
        setReceipts(data);
      }
      setLoading(false);
    };

    fetchReceipts();
  }, [user]);

  const totalSpent = receipts.reduce((sum, r) => sum + (parseFloat(r.amount as any) || parseFloat(r.total as any) || 0), 0);

  const categoryTotals = receipts.reduce((acc, r) => {
    const cat = r.category || 'Other';
    const amount = parseFloat(r.amount as any) || parseFloat(r.total as any) || 0;
    if (!acc[cat]) {
      acc[cat] = { amount: 0, count: 0 };
    }
    acc[cat].amount += amount;
    acc[cat].count += 1;
    return acc;
  }, {} as Record<string, { amount: number; count: number }>);

  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count,
      percentage: totalSpent > 0 ? (data.amount / totalSpent) * 100 : 0,
      color: getTagColor(category),
    }))
    .sort((a, b) => b.amount - a.amount);

  const topCategory = categoryBreakdown[0];
  const avgTransaction = receipts.length > 0 ? totalSpent / receipts.length : 0;
  const budgetLimit = 2500;
  const budgetPercentage = (totalSpent / budgetLimit) * 100;

  const monthlyData = (() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const last6Months = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthReceipts = receipts.filter(r => r.date.startsWith(monthKey));
      const amount = monthReceipts.reduce((sum, r) => sum + (parseFloat(r.amount as any) || parseFloat(r.total as any) || 0), 0);

      last6Months.push({
        month: monthNames[date.getMonth()],
        amount,
      });
    }

    return last6Months;
  })();

  const prevMonthAmount = monthlyData[monthlyData.length - 2]?.amount || 0;
  const currentMonthAmount = monthlyData[monthlyData.length - 1]?.amount || 0;
  const monthlyChange = prevMonthAmount > 0 ? ((currentMonthAmount - prevMonthAmount) / prevMonthAmount) * 100 : 0;

  const insights = [
    {
      title: 'Top Spending Category',
      value: topCategory?.category || 'N/A',
      detail: `£${topCategory?.amount.toFixed(2) || '0.00'} this period`,
      icon: PieChart,
      trend: `${topCategory?.count || 0} purchases`,
      trendUp: true
    },
    {
      title: 'Average Transaction',
      value: `£${avgTransaction.toFixed(2)}`,
      detail: `Across ${receipts.length} purchases`,
      icon: BarChart3,
      trend: receipts.length > 0 ? `${receipts.length} total` : 'No data',
      trendUp: true
    },
    {
      title: 'Budget Status',
      value: `${budgetPercentage.toFixed(1)}%`,
      detail: `£${(budgetLimit - totalSpent).toFixed(2)} remaining`,
      icon: DollarSign,
      trend: totalSpent > budgetLimit ? 'Over budget' : 'On track',
      trendUp: totalSpent <= budgetLimit
    },
    {
      title: 'Monthly Comparison',
      value: monthlyChange >= 0 ? `+${monthlyChange.toFixed(1)}%` : `${monthlyChange.toFixed(1)}%`,
      detail: `vs previous month`,
      icon: Calendar,
      trend: `£${Math.abs(currentMonthAmount - prevMonthAmount).toFixed(2)}`,
      trendUp: monthlyChange >= 0
    },
  ];

  const maxAmount = Math.max(...monthlyData.map(d => d.amount), 1);

  return (
    <div className="pb-32 px-6 pt-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Spending Insights</h1>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {insights.map((insight, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <insight.icon className="w-5 h-5 text-teal-400" strokeWidth={1.5} />
                <div className={`text-xs font-bold ${
                  insight.trendUp ? 'text-green-400' : 'text-red-400'
                } flex items-center gap-1`}>
                  {insight.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {insight.trend}
                </div>
              </div>
              <div className="text-sm text-gray-400 mb-1">{insight.title}</div>
              <div className="text-2xl font-bold text-white mb-1">{insight.value}</div>
              <div className="text-xs text-gray-500">{insight.detail}</div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8"
        >
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-400" />
            6-Month Spending Trend
          </h2>

          <div className="relative h-48 mb-12">
            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgb(94, 234, 212)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="rgb(20, 184, 166)" stopOpacity="0.8" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <motion.polyline
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, delay: 1.2, ease: [0.22, 1, 0.36, 1] }}
                points={monthlyData.map((data, index) => {
                  const x = (index / (monthlyData.length - 1)) * 100;
                  const y = 100 - (data.amount / maxAmount) * 100;
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
                filter="url(#glow)"
              />
              {monthlyData.map((data, index) => {
                const x = (index / (monthlyData.length - 1)) * 100;
                const y = 100 - (data.amount / maxAmount) * 100;
                return (
                  <motion.circle
                    key={index}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, delay: 1.2 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    cx={`${x}%`}
                    cy={`${y}%`}
                    r="4"
                    fill="rgb(20, 184, 166)"
                    stroke="rgb(94, 234, 212)"
                    strokeWidth="2"
                    filter="url(#glow)"
                  />
                );
              })}
            </svg>

            <div className="flex items-end justify-between gap-3 h-full">
              {monthlyData.map((data, index) => {
                const height = (data.amount / maxAmount) * 100;
                const isCurrentMonth = index === monthlyData.length - 1;

                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ duration: 0.8, delay: 0.6 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                      className={`w-full rounded-t-lg ${
                        isCurrentMonth
                          ? 'bg-gradient-to-t from-teal-500/40 to-teal-400/20'
                          : 'bg-gradient-to-t from-white/10 to-white/5'
                      } relative group cursor-pointer hover:opacity-80 transition-opacity`}
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <div className="backdrop-blur-xl bg-black/90 border border-white/20 rounded-lg px-2 py-1 text-xs font-bold text-white whitespace-nowrap">
                          £{data.amount.toFixed(2)}
                        </div>
                      </div>
                    </motion.div>
                    <div className={`text-xs font-semibold ${
                      isCurrentMonth ? 'text-teal-400' : 'text-gray-500'
                    }`}>
                      {data.month}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-sm text-gray-400 text-center">
            Hover over bars to see exact amounts
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
        >
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-teal-400" />
            Category Breakdown
          </h2>

          <div className="space-y-4">
            {categoryBreakdown.map((category, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.9 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md ${category.color}`}>
                      <Tag className="w-3 h-3" />
                      {category.category}
                    </div>
                    <span className="text-sm text-gray-400">{category.count} {category.count === 1 ? 'purchase' : 'purchases'}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-white">£{category.amount.toFixed(2)}</div>
                    <div className="text-xs text-gray-500">{category.percentage.toFixed(1)}%</div>
                  </div>
                </div>

                <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${category.percentage}%` }}
                    transition={{ duration: 1, delay: 1 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className={`absolute inset-y-0 left-0 rounded-full ${
                      category.category === 'Tech'
                        ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                        : category.category === 'Clothing'
                        ? 'bg-gradient-to-r from-purple-500 to-purple-400'
                        : 'bg-gradient-to-r from-orange-500 to-orange-400'
                    }`}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
