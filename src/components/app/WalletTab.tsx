import { motion, AnimatePresence } from 'framer-motion';
import { Receipt as ReceiptIcon, Tag, Laptop, Coffee, Shirt, Search, X, ShoppingBag, Store, Shield, Loader2, Car, Home, Plane, Zap, Utensils } from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface WalletTabProps {
  onReceiptClick: (receipt: Receipt) => void;
}

const getCategoryIcon = (category: string): LucideIcon => {
  const categoryLower = category.toLowerCase();

  if (categoryLower.includes('tech') || categoryLower.includes('electronics')) return Laptop;
  if (categoryLower.includes('food') || categoryLower.includes('restaurant') || categoryLower.includes('dining')) return Utensils;
  if (categoryLower.includes('clothing') || categoryLower.includes('fashion')) return Shirt;
  if (categoryLower.includes('groceries') || categoryLower.includes('grocery')) return Coffee;
  if (categoryLower.includes('transport') || categoryLower.includes('travel') || categoryLower.includes('uber') || categoryLower.includes('taxi')) return Car;
  if (categoryLower.includes('home') || categoryLower.includes('furniture')) return Home;
  if (categoryLower.includes('flight') || categoryLower.includes('hotel')) return Plane;
  if (categoryLower.includes('utilities') || categoryLower.includes('bills')) return Zap;

  return ShoppingBag;
};

const getTagColor = (tag: string): string => {
  const tagLower = tag.toLowerCase();

  if (tagLower === 'tech') return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
  if (tagLower === 'food') return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
  if (tagLower === 'clothing') return 'text-purple-400 bg-purple-400/10 border-purple-400/30';
  if (tagLower === 'groceries') return 'text-green-400 bg-green-400/10 border-green-400/30';
  if (tagLower === 'transport') return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';

  return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
};

export interface Receipt {
  id: string;
  merchant: string;
  merchantIcon: LucideIcon;
  merchantLogo?: string;
  amount: number;
  subtotal: number;
  vat: number;
  vatRate: number;
  currency: string;
  currencySymbol?: string;
  date: string;
  category: string;
  tag: string;
  tagColor: string;
  hasWarranty?: boolean;
  warrantyMonths?: number;
  warrantyDate?: string;
  referenceNumber: string;
  emailAlias: string;
  summary?: string;
  cardLast4?: string;
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  paymentMethod?: string;
  location?: string;
  folder?: 'work' | 'personal';
  status?: string;
  imageUrl?: string;
  storagePath?: string;
}

export function WalletTab({ onReceiptClick }: WalletTabProps) {
  const { user, username } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<'all' | 'work' | 'personal'>('all');
  const [warrantyFilterActive, setWarrantyFilterActive] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchReceipts = async () => {
      try {
        console.log('[WalletTab] Fetching receipts for user:', user?.id);

        const { data, error } = await supabase
          .from('receipts')
          .select('*')
          .order('date', { ascending: false });

        console.log('[WalletTab] Query result:', { data, error, dataLength: data?.length });

        if (error) {
          console.error('[WalletTab] Query error:', error);
          setReceipts([]);
          setLoading(false);
          return;
        }

      const formattedReceipts: Receipt[] = (data || []).map((row) => {
        console.log('[WalletTab] Processing row:', row);

        const currencySymbol = row.currency_symbol || '£';
        const total = parseFloat(row.amount) || parseFloat(row.total) || 0;
        const merchantName = row.merchant || row.store_name || 'Unknown Merchant';
        const category = row.category || 'Other';
        const isProcessing = row.status === 'processing' || total === 0;
        const tag = isProcessing ? 'Processing' : (category || 'Complete');

        return {
          id: row.id,
          merchant: merchantName,
          merchantIcon: getCategoryIcon(category),
          amount: total,
          subtotal: parseFloat(row.subtotal) || total,
          vat: parseFloat(row.vat_amount) || 0,
          vatRate: parseFloat(row.vat_rate) || 20,
          currency: row.currency || 'GBP',
          currencySymbol: currencySymbol,
          date: row.date || new Date().toISOString(),
          category: category,
          tag: tag,
          tagColor: getTagColor(tag),
          hasWarranty: !!row.warranty_date,
          warrantyMonths: row.warranty_months || 0,
          warrantyDate: row.warranty_date || undefined,
          referenceNumber: row.reference_number || `REF-${row.id.slice(0, 8)}`,
          emailAlias: row.email_alias || '',
          summary: row.summary || '',
          cardLast4: row.card_last_4 || '',
          items: row.items || [],
          paymentMethod: row.payment_method || '',
          location: row.location || '',
          folder: row.folder || undefined,
          status: row.status || '',
          imageUrl: row.image_url || '',
          storagePath: row.storage_path || '',
        };
      });

        setReceipts(formattedReceipts);
        setLoading(false);
      } catch (error) {
        console.error('[WalletTab] Unexpected error fetching receipts:', error);
        setReceipts([]);
        setLoading(false);
      }
    };

    fetchReceipts();

    const channel = supabase
      .channel('receipts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receipts',
        },
        (payload) => {
          console.log('[WalletTab] Realtime update received:', payload);
          fetchReceipts();
        }
      )
      .subscribe((status) => {
        console.log('[WalletTab] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[WalletTab] Successfully subscribed to realtime updates');
        }
      });

    return () => {
      console.log('[WalletTab] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [user]);

  const totalSpent = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const budget = {
    currency: receipts.length > 0 ? (receipts[0].currencySymbol || '£') : '£',
    spent: totalSpent,
    limit: 2500,
  };

  const percentage = (budget.spent / budget.limit) * 100;

  const uniqueTags = Array.from(new Set(receipts.map(r => r.tag)));
  const categories = ['All', ...uniqueTags];

  const filteredReceipts = receipts.filter(receipt => {
    const matchesSearch = receipt.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         receipt.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || selectedCategory === 'All' || receipt.tag === selectedCategory;
    const matchesFolder = selectedFolder === 'all' || receipt.folder === selectedFolder;
    const hasActiveWarranty = receipt.warrantyDate && new Date(receipt.warrantyDate) > new Date();
    const matchesWarranty = !warrantyFilterActive || hasActiveWarranty;
    return matchesSearch && matchesCategory && matchesFolder && matchesWarranty;
  });

  const workReceipts = receipts.filter(r => r.folder === 'work');
  const personalReceipts = receipts.filter(r => r.folder === 'personal');
  const warrantyReceipts = receipts.filter(r => r.warrantyDate && new Date(r.warrantyDate) > new Date());

  return (
    <div className="pb-32 px-6 pt-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            Welcome back{username && `, ${username}`}
          </h1>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <span className="text-4xl font-bold text-white">
                {budget.currency}{budget.spent.toFixed(2)}
              </span>
              <span className="text-gray-400 ml-2">
                / {budget.currency}{budget.limit.toFixed(2)}
              </span>
            </div>
            <span className={`text-lg font-semibold ${
              percentage > 90 ? 'text-red-400' : percentage > 70 ? 'text-orange-400' : 'text-teal-400'
            }`}>
              {percentage.toFixed(1)}%
            </span>
          </div>

          <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
              className={`absolute inset-y-0 left-0 rounded-full ${
                percentage > 90
                  ? 'bg-gradient-to-r from-red-500 to-red-400'
                  : percentage > 70
                  ? 'bg-gradient-to-r from-orange-500 to-orange-400'
                  : 'bg-gradient-to-r from-teal-500 to-teal-400'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
            </motion.div>
          </div>

          <p className="text-sm text-gray-400 mt-3">
            {budget.currency}{(budget.limit - budget.spent).toFixed(2)} remaining this month
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedFolder('all')}
            className={`backdrop-blur-xl border rounded-xl p-3 transition-all ${
              selectedFolder === 'all'
                ? 'bg-teal-400/20 border-teal-400/40'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="text-xl font-bold text-white mb-0.5">{receipts.length}</div>
            <div className={`text-xs font-semibold ${
              selectedFolder === 'all' ? 'text-teal-400' : 'text-gray-400'
            }`}>
              All Receipts
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedFolder('work')}
            className={`backdrop-blur-xl border rounded-xl p-3 transition-all ${
              selectedFolder === 'work'
                ? 'bg-blue-400/20 border-blue-400/40'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="text-xl font-bold text-white mb-0.5">{workReceipts.length}</div>
            <div className={`text-xs font-semibold ${
              selectedFolder === 'work' ? 'text-blue-400' : 'text-gray-400'
            }`}>
              Work
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedFolder('personal')}
            className={`backdrop-blur-xl border rounded-xl p-3 transition-all ${
              selectedFolder === 'personal'
                ? 'bg-purple-400/20 border-purple-400/40'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="text-xl font-bold text-white mb-0.5">{personalReceipts.length}</div>
            <div className={`text-xs font-semibold ${
              selectedFolder === 'personal' ? 'text-purple-400' : 'text-gray-400'
            }`}>
              Personal
            </div>
          </motion.button>
        </div>

        {warrantyReceipts.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setWarrantyFilterActive(!warrantyFilterActive)}
            className={`w-full backdrop-blur-xl border rounded-xl p-4 mb-6 transition-all ${
              warrantyFilterActive
                ? 'bg-gradient-to-r from-emerald-900/30 to-teal-900/25 border-emerald-500/60 shadow-[0_0_30px_rgba(16,185,129,0.25)]'
                : 'bg-gradient-to-r from-emerald-900/20 to-teal-900/15 border-emerald-500/40 hover:border-emerald-500/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Shield className={`w-6 h-6 ${warrantyFilterActive ? 'text-emerald-400' : 'text-emerald-400'}`} />
              <div className="flex-1 text-left">
                <h3 className="text-white font-bold">{warrantyReceipts.length} Active {warrantyReceipts.length === 1 ? 'Warranty' : 'Warranties'}</h3>
                <p className="text-sm text-gray-400">
                  {warrantyFilterActive ? 'Showing warranty items only' : 'Click to filter warranty items'}
                </p>
              </div>
              {warrantyFilterActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="px-3 py-1 bg-emerald-400/20 border border-emerald-400/40 rounded-full text-xs font-bold text-emerald-400"
                >
                  Active Filter
                </motion.div>
              )}
            </div>
          </motion.button>
        )}

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search receipts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category === 'All' ? null : category)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md transition-all ${
                  (selectedCategory === category || (category === 'All' && !selectedCategory))
                    ? 'text-teal-400 bg-teal-400/20 border-teal-400/40'
                    : 'text-gray-400 bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            {filteredReceipts.length} {filteredReceipts.length === 1 ? 'Transaction' : 'Transactions'}
          </h2>
          <ReceiptIcon className="w-5 h-5 text-gray-400" />
        </div>

        <AnimatePresence mode="popLayout">
          {filteredReceipts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-12 text-center"
            >
              <Search className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">No receipts found</h3>
              <p className="text-gray-400">Try adjusting your search or filters</p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {filteredReceipts.map((receipt, index) => {
            const MerchantIcon = receipt.merchantIcon;
            const isProcessing = receipt.tag === 'Processing';
            const hasActiveWarranty = receipt.warrantyDate && new Date(receipt.warrantyDate) > new Date();
            const hasExpiredWarranty = receipt.warrantyDate && new Date(receipt.warrantyDate) <= new Date();
            return (
              <motion.button
                key={receipt.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ scale: isProcessing ? 1 : 1.02 }}
                whileTap={{ scale: isProcessing ? 1 : 0.98 }}
                onClick={() => !isProcessing && onReceiptClick(receipt)}
                className={`w-full backdrop-blur-xl border rounded-xl p-5 transition-all text-left relative ${
                  isProcessing
                    ? 'bg-teal-400/5 border-teal-400/30 cursor-default'
                    : hasActiveWarranty
                    ? 'bg-gradient-to-br from-emerald-900/10 to-teal-900/5 border-emerald-500/50 hover:bg-gradient-to-br hover:from-emerald-900/15 hover:to-teal-900/10 hover:border-emerald-400/60 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-teal-400/30'
                }`}
              >
                <div className="flex items-start gap-4 mb-3">
                  <div className={`w-12 h-12 flex-shrink-0 rounded-xl border flex items-center justify-center ${
                    isProcessing
                      ? 'bg-teal-400/10 border-teal-400/30'
                      : 'bg-gradient-to-br from-white/10 to-white/5 border-white/10'
                  }`}>
                    {isProcessing ? (
                      <Loader2 className="w-6 h-6 text-teal-400 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <MerchantIcon className="w-6 h-6 text-teal-400" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-lg font-bold mb-1 ${isProcessing ? 'text-teal-400 animate-pulse' : 'text-white'}`}>
                      {receipt.merchant}
                    </h3>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-400">{new Date(receipt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      {hasActiveWarranty && !isProcessing && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-400/10 border border-emerald-400/30 rounded-full">
                          <Shield className="w-3 h-3 text-emerald-400" strokeWidth={2} />
                          <span className="text-emerald-400 text-xs font-bold">Active</span>
                        </div>
                      )}
                      {hasExpiredWarranty && !isProcessing && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-red-400/10 border border-red-400/30 rounded-full">
                          <Shield className="w-3 h-3 text-red-400" strokeWidth={2} />
                          <span className="text-red-400 text-xs font-bold">Expired</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${isProcessing ? 'text-gray-500' : 'text-white'}`}>
                      {receipt.currencySymbol || '£'}{receipt.amount.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isProcessing ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md text-teal-400 bg-teal-400/10 border-teal-400/30">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Processing...
                    </div>
                  ) : (
                    <>
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md ${getTagColor(receipt.category)}`}>
                        <Tag className="w-3 h-3" />
                        {receipt.category}
                      </div>
                    </>
                  )}
                </div>
              </motion.button>
            );
          })}
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
