import { motion, AnimatePresence } from 'framer-motion';
import { Receipt as ReceiptIcon, Tag, Laptop, Coffee, Shirt, Search, X, ShoppingBag, Store, Shield } from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { db, auth, collection, query, orderBy, onSnapshot, signInAnonymously } from '../../lib/firebase';

interface WalletTabProps {
  onReceiptClick: (receipt: Receipt) => void;
}

const getMerchantIcon = (merchant: string, tag: string): LucideIcon => {
  const merchantLower = merchant.toLowerCase();

  if (merchantLower.includes('apple')) return Laptop;
  if (merchantLower.includes('starbucks') || merchantLower.includes('coffee')) return Coffee;
  if (merchantLower.includes('uniqlo') || tag.toLowerCase() === 'clothing') return Shirt;
  if (tag.toLowerCase() === 'tech') return Laptop;
  if (tag.toLowerCase() === 'food') return Coffee;

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
  date: string;
  tag: string;
  tagColor: string;
  hasWarranty?: boolean;
  warrantyMonths?: number;
  referenceNumber: string;
  emailAlias: string;
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  paymentMethod?: string;
  location?: string;
  folder?: 'work' | 'personal';
}

export function WalletTab({ onReceiptClick }: WalletTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<'all' | 'work' | 'personal'>('all');
  const [firebaseReceipts, setFirebaseReceipts] = useState<Receipt[]>([]);
  const [showFakeApple, setShowFakeApple] = useState(false);

  const fakeAppleReceipt: Receipt = {
    id: 'fake-apple-demo',
    merchant: 'Apple Store',
    merchantIcon: Laptop,
    amount: 2199.00,
    subtotal: 1832.50,
    vat: 366.50,
    vatRate: 20,
    currency: '£',
    date: new Date().toISOString().split('T')[0],
    tag: 'Tech',
    tagColor: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    hasWarranty: true,
    warrantyMonths: 24,
    referenceNumber: 'APL-2025-0115-7X9K',
    emailAlias: 'steve@receiptIt.app',
    items: [
      { name: 'MacBook Pro 14" M3', quantity: 1, price: 1999.00 },
      { name: 'AppleCare+ Protection', quantity: 1, price: 200.00 }
    ],
    paymentMethod: 'Visa •••• 4242',
    location: 'Apple Regent Street, London',
    folder: 'personal'
  };

  useEffect(() => {
    signInAnonymously(auth).catch((error) => {
      console.error('Firebase auth error:', error);
    });
  }, []);

  useEffect(() => {
    const receiptsRef = collection(db, 'receipts');
    const q = query(receiptsRef, orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const receiptsData: Receipt[] = snapshot.docs.map((doc) => {
        const data = doc.data();

        const parseAmount = (value: any): number => {
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            const cleaned = value.replace(/[£$€,\s]/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };

        const amount = parseAmount(data.amount || data.total || data.price || 0);
        const subtotal = parseAmount(data.subtotal || data.sub_total || (amount - (data.vat || 0)));
        const vat = parseAmount(data.vat || data.tax || (amount - subtotal));

        return {
          id: doc.id,
          merchant: data.merchant || data.store || data.vendor || 'Unknown',
          merchantIcon: getMerchantIcon(data.merchant || data.store || '', data.tag || data.category || ''),
          amount,
          subtotal,
          vat,
          vatRate: data.vatRate || data.tax_rate || 20,
          currency: data.currency || '£',
          date: data.date || data.timestamp || data.createdAt || new Date().toISOString(),
          tag: data.tag || data.category || 'Other',
          tagColor: getTagColor(data.tag || data.category || 'Other'),
          hasWarranty: data.hasWarranty || data.warranty || false,
          warrantyMonths: data.warrantyMonths || data.warranty_months || (data.hasWarranty ? 12 : undefined),
          referenceNumber: data.referenceNumber || data.reference || data.receipt_id || doc.id.substring(0, 16).toUpperCase(),
          emailAlias: data.emailAlias || data.email || 'steve@receiptIt.app',
          items: data.items || data.line_items || [],
          paymentMethod: data.paymentMethod || data.payment_type || data.payment,
          location: data.location || data.store_location,
          folder: data.folder || 'personal',
        };
      });

      setFirebaseReceipts(receiptsData);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFakeApple(true);
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  const receipts: Receipt[] = showFakeApple
    ? [fakeAppleReceipt, ...firebaseReceipts]
    : firebaseReceipts;

  const totalSpent = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const budget = {
    currency: '£',
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
    return matchesSearch && matchesCategory && matchesFolder;
  });

  const workReceipts = receipts.filter(r => r.folder === 'work');
  const personalReceipts = receipts.filter(r => r.folder === 'personal');
  const warrantyReceipts = receipts.filter(r => r.hasWarranty);

  return (
    <div className="pb-32 px-6 pt-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Wallet</h1>
          <div className="text-xl font-bold tracking-tight">
            <span className="text-white">receipt</span>
            <span className="text-teal-400">It</span>
          </div>
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="backdrop-blur-xl bg-gradient-to-r from-teal-400/10 to-cyan-400/10 border border-teal-400/30 rounded-xl p-4 mb-6"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-teal-400" />
              <div className="flex-1">
                <h3 className="text-white font-bold">{warrantyReceipts.length} Active {warrantyReceipts.length === 1 ? 'Warranty' : 'Warranties'}</h3>
                <p className="text-sm text-gray-400">Protected items in {selectedFolder === 'all' ? 'all folders' : selectedFolder}</p>
              </div>
            </div>
          </motion.div>
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
            return (
              <motion.button
                key={receipt.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onReceiptClick(receipt)}
                className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/10 hover:border-teal-400/30 transition-all text-left"
              >
                <div className="flex items-start gap-4 mb-3">
                  <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                    <MerchantIcon className="w-6 h-6 text-teal-400" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-white mb-1">{receipt.merchant}</h3>
                    <p className="text-sm text-gray-400">{new Date(receipt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      {receipt.currency}{receipt.amount.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md ${receipt.tagColor}`}>
                    <Tag className="w-3 h-3" />
                    {receipt.tag}
                  </div>
                  {receipt.hasWarranty && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md text-teal-400 bg-teal-400/10 border-teal-400/30">
                      <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
                      Warranty Active
                    </div>
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
