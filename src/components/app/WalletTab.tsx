import { motion, AnimatePresence } from 'framer-motion';
import { Receipt as ReceiptIcon, Tag, Laptop, Coffee, Shirt, Search, X, ShoppingBag, Shield, Loader2, Car, Home, Plane, Zap, Utensils, Undo2, Trash2, CheckSquare, Square, ChevronDown } from 'lucide-react';
import { Video as LucideIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { ReportProblemDialog } from './ReportProblemDialog';
import {
  confirmReceiptCurrency,
  deleteReceiptRecord,
  isReceiptCurrencyConfirmationOption,
  isReceiptStaleProcessing,
  needsCurrencyConfirmation,
  isFinalizedReceiptStatus,
  RECEIPT_CURRENCY_CONFIRMATION_OPTIONS,
  RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION,
  retryReceiptProcessing,
  supabase,
  Receipt as SupabaseReceiptRow,
} from '../../lib/supabase';
import type { ReceiptCurrencyConfirmationOption } from '../../lib/supabase';
import { getPurchaseDateDisplay, PURCHASE_DATE_PENDING_LABEL } from '../../lib/receiptDateUtils';
import { useAuth } from '../../contexts/AuthContext';
import { getReturnWindowStatus } from '../../lib/returnWindowUtils';
import { useToast } from '../../contexts/ToastContext';

interface WalletTabProps {
  onReceiptClick: (receipt: Receipt) => void;
  onReceiptsChange?: (receipts: Receipt[]) => void;
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

const getCurrencySymbol = (currencyCode: string): string => {
  const code = (currencyCode || 'GBP').toUpperCase();
  const symbols: { [key: string]: string } = {
    'GBP': '£',
    'EUR': '€',
    'USD': '$',
    'JPY': '¥',
    'CNY': '¥',
    'INR': '₹',
    'AUD': 'A$',
    'CAD': 'C$',
    'CHF': 'CHF',
    'SEK': 'kr',
    'NZD': 'NZ$',
  };
  return symbols[code] || code;
};

const formatCurrencyAmount = (currencyCode: string, amount: number): string => (
  `${getCurrencySymbol(currencyCode)}${amount.toFixed(2)}`
);

const WALLET_RECEIPT_STATUSES = ['needs_input', 'processing', 'parsed', 'completed', 'duplicate', 'failed', 'skipped'] as const;
const HIDDEN_WALLET_RECEIPT_STATUSES = ['duplicate', 'failed', 'skipped'] as const;

const isHiddenWalletReceiptStatus = (status: unknown): status is typeof HIDDEN_WALLET_RECEIPT_STATUSES[number] =>
  typeof status === 'string' && HIDDEN_WALLET_RECEIPT_STATUSES.includes(status as typeof HIDDEN_WALLET_RECEIPT_STATUSES[number]);

const getReceiptStatusPriority = (status: unknown): number => {
  if (status === 'needs_input') return 4;
  if (status === 'parsed') return 3;
  if (status === 'completed') return 2;
  if (status === 'processing') return 1;
  return 0;
};

const getNormalizedAmountKey = (amount: string | number | null | undefined): string => {
  const numericAmount = typeof amount === 'number' ? amount : parseFloat(String(amount ?? ''));
  return Number.isFinite(numericAmount) ? numericAmount.toFixed(2) : String(amount ?? '');
};

const getReceiptGroupingKey = ({
  storagePath,
  imageUrl,
  referenceNumber,
  merchant,
  transactionDate,
  amount,
  currency,
}: {
  storagePath?: string | null;
  imageUrl?: string | null;
  referenceNumber?: string | null;
  merchant?: string | null;
  transactionDate?: string | null;
  amount?: string | number | null;
  currency?: string | null;
}): string => {
  const normalizedStoragePath = storagePath?.trim();
  if (normalizedStoragePath) return `storage:${normalizedStoragePath}`;

  const normalizedImageUrl = imageUrl?.trim();
  if (normalizedImageUrl) return `image:${normalizedImageUrl}`;

  const normalizedReferenceNumber = referenceNumber?.trim();
  if (normalizedReferenceNumber) return `reference:${normalizedReferenceNumber}`;

  const normalizedMerchant = merchant?.trim().toLowerCase() || '';
  const normalizedTransactionDate = transactionDate || '';
  const normalizedAmount = getNormalizedAmountKey(amount);
  const normalizedCurrency = (currency || 'GBP').trim().toUpperCase();

  return `fallback:${normalizedMerchant}|${normalizedTransactionDate}|${normalizedAmount}|${normalizedCurrency}`;
};

const getReceiptGroupingKeyFromRow = (row: SupabaseReceiptRow): string =>
  getReceiptGroupingKey({
    storagePath: row.storage_path,
    imageUrl: row.image_url,
    referenceNumber: row.reference_number,
    merchant: row.merchant,
    transactionDate: row.transaction_date,
    amount: row.amount,
    currency: row.currency,
  });

const dedupeReceiptRows = (rows: SupabaseReceiptRow[]): SupabaseReceiptRow[] => {
  const groupedRows = new Map<string, SupabaseReceiptRow>();

  rows.forEach((row) => {
    const groupingKey = getReceiptGroupingKeyFromRow(row);
    const existingRow = groupedRows.get(groupingKey);

    if (!existingRow || getReceiptStatusPriority(row.status) > getReceiptStatusPriority(existingRow.status)) {
      groupedRows.set(groupingKey, row);
    }
  });

  return rows.filter((row) => groupedRows.get(getReceiptGroupingKeyFromRow(row))?.id === row.id);
};

const dedupeWalletReceipts = (receipts: Receipt[]): Receipt[] => {
  const groupedReceipts = new Map<string, Receipt>();

  receipts.forEach((receipt) => {
    const existingReceipt = groupedReceipts.get(receipt.groupingKey);

    if (!existingReceipt || getReceiptStatusPriority(receipt.status) > getReceiptStatusPriority(existingReceipt.status)) {
      groupedReceipts.set(receipt.groupingKey, receipt);
    }
  });

  return receipts.filter((receipt) => groupedReceipts.get(receipt.groupingKey)?.id === receipt.id);
};

const getSafeWalletReceipts = (receipts: Receipt[]): Receipt[] => (
  filterVisibleWalletReceipts(dedupeWalletReceipts(receipts))
);

const filterVisibleReceiptRows = (rows: SupabaseReceiptRow[]): SupabaseReceiptRow[] =>
  rows.filter((row) => {
    if (isFinalizedReceiptStatus(row.status)) return true;
    if (needsCurrencyConfirmation(row.status, row.error_reason)) return true;
    if (row.status === 'processing') return true;
    if (isHiddenWalletReceiptStatus(row.status)) return false;
    return false;
  });

const filterVisibleWalletReceipts = (receipts: Receipt[]): Receipt[] =>
  receipts.filter((receipt) => {
    if (isFinalizedReceiptStatus(receipt.status)) return true;
    if (needsCurrencyConfirmation(receipt.status, receipt.errorReason)) return true;
    if (receipt.status === 'processing') return true;
    if (isHiddenWalletReceiptStatus(receipt.status)) return false;
    return false;
  });

const getReceiptGbpDisplayAmount = (receipt: Receipt): number => {
  const receiptCurrencyCode = receipt.currency?.toUpperCase() || 'GBP';
  if (receiptCurrencyCode === 'GBP') {
    return receipt.amount;
  }

  return receipt.amount_gbp ?? receipt.amount;
};

const getNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsedValue = parseFloat(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
};

const getNonEmptyString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
);

const normalizeSearchValue = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value} ${value.toFixed(2)}`;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }

  return '';
};

const getSearchableDateValues = (value?: string): string[] => {
  const rawValue = getNonEmptyString(value);
  if (!rawValue) return [];

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return [rawValue];
  }

  return Array.from(new Set([
    rawValue,
    parsedDate.toISOString().slice(0, 10),
    parsedDate.toLocaleDateString('en-GB'),
    parsedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    parsedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  ]));
};

const buildReceiptSearchText = ({
  merchant,
  summary,
  orderNumber,
  invoiceNumber,
  referenceNumber,
  customerNumber,
  amount,
  amountGbp,
  date,
  itemDescriptions,
}: {
  merchant: string;
  summary?: string;
  orderNumber?: string;
  invoiceNumber?: string;
  referenceNumber: string;
  customerNumber?: string;
  amount: number;
  amountGbp: number | null;
  date?: string;
  itemDescriptions: string[];
}): string => (
  [
    merchant,
    summary,
    orderNumber,
    invoiceNumber,
    referenceNumber,
    customerNumber,
    amount,
    amountGbp,
    ...getSearchableDateValues(date),
    ...itemDescriptions,
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)
    .join(' ')
);

const mapReceiptRowToWalletReceipt = (
  row: SupabaseReceiptRow,
  itemDescriptions: string[] = []
): Receipt => {
  const total = getNullableNumber(row.amount) ?? 0;
  const totalGbp = getNullableNumber(row.amount_gbp);
  const subtotal = getNullableNumber(row.subtotal);
  const vatAmount = getNullableNumber(row.vat_amount);
  const discountAmount = getNullableNumber(row.discount_amount);
  const currencyCode = row.currency || 'GBP';
  const currencySymbol = getCurrencySymbol(currencyCode);
  const merchantName = row.merchant && row.merchant.trim() ? row.merchant : 'Receipt (Seller Unknown)';
  const category = row.category || 'Other';
  const date = row.transaction_date || undefined;
  const referenceNumber = row.reference_number || `REF-${row.id.slice(0, 8)}`;

  return {
    id: row.id,
    userId: row.user_id,
    merchant: merchantName,
    merchantIcon: getCategoryIcon(category),
    merchantPhone: getNonEmptyString(row.merchant_phone),
    merchantEmail: getNonEmptyString(row.merchant_email),
    merchantWebsite: getNonEmptyString(row.merchant_website),
    merchantAddress: getNonEmptyString(row.merchant_address),
    merchantVatNumber: getNonEmptyString(row.merchant_vat_number),
    merchantCompanyNumber: getNonEmptyString(row.merchant_company_number),
    amount: total,
    amount_gbp: totalGbp,
    subtotal: subtotal ?? undefined,
    vatAmount: vatAmount ?? undefined,
    discountAmount: discountAmount ?? undefined,
    currency: currencyCode,
    currencySymbol,
    date,
    category,
    tagColor: getTagColor(category),
    hasWarranty: !!row.warranty_date,
    warrantyDate: row.warranty_date || undefined,
    returnDate: row.return_date || undefined,
    referenceNumber,
    customerNumber: row.customer_number || undefined,
    orderNumber: row.order_number || undefined,
    invoiceNumber: row.invoice_number || undefined,
    loyaltyMemberId: row.loyalty_member_id || undefined,
    summary: row.short_summary || '',
    cardLast4: row.card_last_4 || '',
    itemDescriptions,
    searchText: buildReceiptSearchText({
      merchant: merchantName,
      summary: row.short_summary || undefined,
      orderNumber: row.order_number || undefined,
      invoiceNumber: row.invoice_number || undefined,
      referenceNumber,
      customerNumber: row.customer_number || undefined,
      amount: total,
      amountGbp: totalGbp,
      date,
      itemDescriptions,
    }),
    paymentMethod: '',
    location: '',
    folder: row.folder === 'work' || row.folder === 'personal' ? row.folder : null,
    status: row.status || '',
    errorReason: row.error_reason,
    userConfirmedCurrency: row.user_confirmed_currency,
    imageUrl: row.image_url || '',
    storagePath: row.storage_path || '',
    createdAt: row.created_at || undefined,
    groupingKey: getReceiptGroupingKeyFromRow(row),
  };
};

const mergeRealtimeReceiptIntoWallet = (
  currentReceipts: Receipt[],
  row: SupabaseReceiptRow
): Receipt[] => {
  const existingReceipt = currentReceipts.find((receipt) => receipt.id === row.id);
  const nextReceipts = currentReceipts.filter((receipt) => receipt.id !== row.id);
  const mergedReceipt = mapReceiptRowToWalletReceipt(row, existingReceipt?.itemDescriptions || []);

  return getSafeWalletReceipts([...nextReceipts, mergedReceipt]);
};

export interface Receipt {
  id: string;
  userId: string;
  merchant: string;
  merchantIcon: LucideIcon;
  merchantLogo?: string;
  merchantPhone?: string;
  merchantEmail?: string;
  merchantWebsite?: string;
  merchantAddress?: string;
  merchantVatNumber?: string;
  merchantCompanyNumber?: string;
  amount: number;
  amount_gbp: number | null;
  subtotal?: number;
  vatAmount?: number;
  discountAmount?: number;
  currency: string;
  currencySymbol?: string;
  date?: string;
  category: string;
  tagColor: string;
  hasWarranty?: boolean;
  warrantyDate?: string;
  returnDate?: string;
  referenceNumber: string;
  customerNumber?: string;
  orderNumber?: string;
  invoiceNumber?: string;
  loyaltyMemberId?: string;
  summary?: string;
  cardLast4?: string;
  itemDescriptions: string[];
  searchText: string;
  items?: Array<{
    lineIndex: number;
    description?: string | null;
    itemType?: 'product' | 'charge' | 'discount' | string | null;
    quantity?: number | null;
    quantityUnit?: string | null;
    unitPrice?: number | null;
    lineTotal?: number | null;
    vatAmount?: number | null;
    vatRate?: number | null;
  }>;
  paymentMethod?: string;
  location?: string;
  folder?: 'work' | 'personal' | null;
  status?: string;
  errorReason?: string | null;
  userConfirmedCurrency?: string | null;
  processingAttemptStartedAt?: string;
  imageUrl?: string;
  storagePath?: string;
  createdAt?: string;
  groupingKey: string;
}

export function WalletTab({ onReceiptClick, onReceiptsChange }: WalletTabProps) {
  const { user, username, emailAlias, fullName } = useAuth();
  const { showToast } = useToast();

  const getWelcomeName = () => {
    // Fallback order: alias name (first part before @) > full name > username > email prefix as last fallback
    if (emailAlias) {
      // Extract just the first part of the email alias (before @)
      return emailAlias.split('@')[0];
    }
    if (fullName) return fullName;
    if (username) return username;
    return '';
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<'all' | 'work' | 'personal'>('all');
  const [warrantyFilterActive, setWarrantyFilterActive] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedReceipts, setSelectedReceipts] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [currencyConfirmationState, setCurrencyConfirmationState] = useState<{
    receiptId: string;
    currency: ReceiptCurrencyConfirmationOption;
  } | null>(null);
  const [processingAttemptStartedAtByReceiptId, setProcessingAttemptStartedAtByReceiptId] = useState<Record<string, string>>({});
  const [otherCurrencyReceiptId, setOtherCurrencyReceiptId] = useState<string | null>(null);
  const [reportProblemReceipt, setReportProblemReceipt] = useState<{ id: string; merchant: string } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const previousReceiptIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const fetchReceipts = async () => {
      try {
        console.log('[WalletTab] Fetching receipts for user:', user?.id);

        const { data, error } = await supabase
          .from('receipts')
          .select('*')
          .eq('user_id', user.id)
          .in('status', [...WALLET_RECEIPT_STATUSES])
          .order('transaction_date', { ascending: false });

        console.log('[WalletTab] Query result:', { data, error, dataLength: data?.length });

        if (error) {
          console.error('[WalletTab] Query error:', error);
          setReceipts([]);
          setLoading(false);
          return;
        }

        const rawRows = ((data || []) as SupabaseReceiptRow[]);
        const filteredRawRows = filterVisibleReceiptRows(rawRows);
        const dedupedRows = dedupeReceiptRows(filteredRawRows);
        const visibleDedupedRows = filterVisibleReceiptRows(dedupedRows);
        const itemDescriptionsByReceipt = new Map<string, string[]>();

        if (visibleDedupedRows.length > 0) {
          const { data: receiptItemsData, error: receiptItemsError } = await supabase
            .from('receipt_items')
            .select('receipt_id, description')
            .in('receipt_id', visibleDedupedRows.map((row) => row.id));

          if (receiptItemsError) {
            console.error('[WalletTab] receipt_items search query error:', receiptItemsError);
          } else {
            (receiptItemsData || []).forEach((row) => {
              const receiptId = getNonEmptyString((row as { receipt_id?: string | null }).receipt_id);
              const description = getNonEmptyString((row as { description?: string | null }).description);

              if (!receiptId || !description) return;

              const existingDescriptions = itemDescriptionsByReceipt.get(receiptId) || [];
              existingDescriptions.push(description);
              itemDescriptionsByReceipt.set(receiptId, existingDescriptions);
            });
          }
        }

        const formattedReceipts: Receipt[] = visibleDedupedRows.map((row) => {
          console.log('[WalletTab] Processing row:', row);
          return mapReceiptRowToWalletReceipt(row, itemDescriptionsByReceipt.get(row.id) || []);
        });

        const safeReceipts = getSafeWalletReceipts(formattedReceipts);

        // Track receipt IDs for notification detection
        previousReceiptIdsRef.current = new Set(safeReceipts.map(r => r.id));

        setReceipts(safeReceipts);
        setLoading(false);
      } catch (error) {
        console.error('[WalletTab] Unexpected error fetching receipts:', error);
        setReceipts([]);
        setLoading(false);
      }
    };

    // Initial fetch
    fetchReceipts();

    // Set up realtime subscription
    console.log('[WalletTab] Setting up realtime subscription for user:', user.id);

    const channel = supabase
      .channel('receipts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receipts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[WalletTab] Realtime event received:', payload.eventType, payload);

          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as Partial<SupabaseReceiptRow>;
            console.log('[WalletTab] New receipt inserted:', newRow);

            if (newRow.status === 'duplicate') {
              const merchantDescription = newRow.merchant && newRow.merchant.trim()
                ? newRow.merchant
                : 'This receipt was already in your wallet';
              showToast('Duplicate receipt rejected', merchantDescription);
              fetchReceipts();
              return;
            }

            setReceipts((currentReceipts) => mergeRealtimeReceiptIntoWallet(currentReceipts, newRow as SupabaseReceiptRow));

            if (isFinalizedReceiptStatus(newRow.status)) {
              const merchantName = newRow.merchant && newRow.merchant.trim() ? newRow.merchant : 'Receipt (Seller Unknown)';
              const amount = parseFloat(String(newRow.amount ?? '')) || parseFloat(String((newRow as any).total ?? '')) || 0;
              const currencyCode = newRow.currency || 'GBP';
              const formattedAmount = amount > 0 ? formatCurrencyAmount(currencyCode, amount) : 'Processing...';
              showToast('New Receipt Processed', `${merchantName} - ${formattedAmount}`);
            }

            fetchReceipts();
          } else if (payload.eventType === 'UPDATE') {
            const updatedRow = payload.new as Partial<SupabaseReceiptRow>;
            const oldRow = payload.old as Partial<SupabaseReceiptRow>;

            console.log('[WalletTab] Receipt updated:', { old: oldRow, new: updatedRow });

            if (updatedRow.status === 'duplicate') {
              const merchantDescription = updatedRow.merchant && updatedRow.merchant.trim()
                ? updatedRow.merchant
                : 'This receipt was already in your wallet';
              setReceipts((currentReceipts) => currentReceipts.filter((receipt) => receipt.id !== updatedRow.id));
              showToast('Duplicate receipt rejected', merchantDescription);
              fetchReceipts();
              return;
            }

            setReceipts((currentReceipts) => mergeRealtimeReceiptIntoWallet(currentReceipts, updatedRow as SupabaseReceiptRow));

            // Check if amount was just processed (changed from 0 or null to a value)
            const oldAmount = parseFloat(String(oldRow.amount ?? '')) || parseFloat(String((oldRow as any).total ?? '')) || 0;
            const newAmount = parseFloat(String(updatedRow.amount ?? '')) || parseFloat(String((updatedRow as any).total ?? '')) || 0;

            if (isFinalizedReceiptStatus(updatedRow.status) && ((oldAmount === 0 && newAmount > 0) || !isFinalizedReceiptStatus(oldRow.status))) {
              const merchantName = updatedRow.merchant && updatedRow.merchant.trim() ? updatedRow.merchant : 'Receipt (Seller Unknown)';
              const currencyCode = updatedRow.currency || 'GBP';
              showToast('Receipt processed', `${merchantName} - ${formatCurrencyAmount(currencyCode, newAmount)}`);
            }

            fetchReceipts();
          } else if (payload.eventType === 'DELETE') {
            console.log('[WalletTab] Receipt deleted');
            const deletedRow = payload.old as Partial<SupabaseReceiptRow>;
            setReceipts((currentReceipts) => currentReceipts.filter((receipt) => receipt.id !== deletedRow.id));
            fetchReceipts();
          }
        }
      )
      .subscribe((status) => {
        console.log('[WalletTab] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[WalletTab] ✅ Successfully subscribed to realtime updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[WalletTab] ❌ Channel error - realtime updates may not work');
        } else if (status === 'TIMED_OUT') {
          console.error('[WalletTab] ❌ Subscription timed out');
        }
      });

    // Clean up subscription on unmount
    return () => {
      console.log('[WalletTab] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [user, showToast]);

  const effectiveReceipts = receipts.map((receipt) => ({
    ...receipt,
    processingAttemptStartedAt: processingAttemptStartedAtByReceiptId[receipt.id] || receipt.processingAttemptStartedAt,
  }));

  const visibleReceipts = filterVisibleWalletReceipts(dedupeWalletReceipts(effectiveReceipts));
  const finalizedReceipts = visibleReceipts.filter((receipt) => isFinalizedReceiptStatus(receipt.status));
  const totalSpent = finalizedReceipts.reduce((sum, receipt) => sum + getReceiptGbpDisplayAmount(receipt), 0);
  const budget = {
    currency: '£',
    spent: Number(totalSpent.toFixed(2)),
    limit: 2500,
  };

  const percentage = (budget.spent / budget.limit) * 100;

  const uniqueCategories = Array.from(new Set(finalizedReceipts.map(r => r.category)));
  const categories = ['All', ...uniqueCategories];
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;

  const matchesReceiptFilters = (receipt: Receipt) => {
    const matchesSearch = !hasSearchQuery || receipt.searchText.includes(normalizedSearchQuery);
    const matchesCategory = !selectedCategory || selectedCategory === 'All' || receipt.category === selectedCategory;
    const matchesFolder = selectedFolder === 'all' || receipt.folder === selectedFolder;
    const hasActiveWarranty = receipt.warrantyDate && new Date(receipt.warrantyDate) > new Date();
    const matchesWarranty = !warrantyFilterActive || hasActiveWarranty;
    return matchesSearch && matchesCategory && matchesFolder && matchesWarranty;
  };

  const filteredReceipts = visibleReceipts.filter(matchesReceiptFilters);

  useEffect(() => {
    onReceiptsChange?.(visibleReceipts);
  }, [onReceiptsChange, visibleReceipts]);

  useEffect(() => {
    setProcessingAttemptStartedAtByReceiptId((currentValue) => {
      const nextValue = Object.fromEntries(
        Object.entries(currentValue).filter(([receiptId]) => (
          receipts.some((receipt) => receipt.id === receiptId && receipt.status === 'processing')
        ))
      );

      return Object.keys(nextValue).length === Object.keys(currentValue).length
        ? currentValue
        : nextValue;
    });
  }, [receipts]);

  const workReceipts = finalizedReceipts.filter(r => r.folder === 'work');
  const personalReceipts = finalizedReceipts.filter(r => r.folder === 'personal');
  const warrantyReceipts = finalizedReceipts.filter(r => r.warrantyDate && new Date(r.warrantyDate) > new Date());

  const toggleReceiptSelection = (receiptId: string) => {
    const newSelected = new Set(selectedReceipts);
    if (newSelected.has(receiptId)) {
      newSelected.delete(receiptId);
    } else {
      newSelected.add(receiptId);
    }
    setSelectedReceipts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedReceipts.size === filteredReceipts.length) {
      setSelectedReceipts(new Set());
    } else {
      setSelectedReceipts(new Set(filteredReceipts.map(r => r.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedReceipts.size === 0) return;

    setIsDeleting(true);
    try {
      const receiptIds = Array.from(selectedReceipts);
      const { error } = await supabase
        .from('receipts')
        .delete()
        .in('id', receiptIds);

      if (error) {
        console.error('[WalletTab] Delete error:', error);
        showToast('Failed to delete receipts', 'error');
        setIsDeleting(false);
        return;
      }

      setReceipts(receipts.filter(r => !selectedReceipts.has(r.id)));
      setSelectedReceipts(new Set());
      setSelectMode(false);
      setDeleteConfirmOpen(false);
      showToast(`Deleted ${receiptIds.length} receipt${receiptIds.length > 1 ? 's' : ''}`, 'success');
    } catch (error) {
      console.error('[WalletTab] Unexpected error during delete:', error);
      showToast('Failed to delete receipts', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkMove = async (targetFolder: 'work' | 'personal' | null) => {
    if (selectedReceipts.size === 0 || !user?.id) return;

    setIsDeleting(true);
    try {
      const receiptIds = Array.from(selectedReceipts);
      const { error } = await supabase
        .from('receipts')
        .update({ folder: targetFolder })
        .eq('user_id', user.id)
        .in('id', receiptIds);

      if (error) {
        console.error('[WalletTab] Move error while updating receipts.folder:', {
          error,
          targetFolder,
          receiptIds,
          userId: user.id,
        });
        showToast('Failed to move receipts', 'error');
        setIsDeleting(false);
        return;
      }

      const updatedReceipts = receipts.map(r =>
        selectedReceipts.has(r.id) ? { ...r, folder: targetFolder } : r
      );
      setReceipts(updatedReceipts);
      setSelectedReceipts(new Set());
      setSelectMode(false);
      setMoveMenuOpen(false);

      const folderName = targetFolder === 'work' ? 'Work' : targetFolder === 'personal' ? 'Personal' : 'All';
      showToast(`Moved ${receiptIds.length} receipt${receiptIds.length > 1 ? 's' : ''} to ${folderName}`, 'success');
    } catch (error) {
      console.error('[WalletTab] Unexpected error during move:', error);
      showToast('Failed to move receipts', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCurrencyConfirmation = async (receiptId: string, currency: ReceiptCurrencyConfirmationOption) => {
    const targetReceipt = receipts.find((receipt) => receipt.id === receiptId);
    if (!targetReceipt) return;
    const processingAttemptStartedAt = new Date().toISOString();
    const previousProcessingAttemptStartedAt = processingAttemptStartedAtByReceiptId[receiptId];

    setCurrencyConfirmationState({ receiptId, currency });
    setProcessingAttemptStartedAtByReceiptId((currentValue) => ({
      ...currentValue,
      [receiptId]: processingAttemptStartedAt,
    }));

    try {
      const { error } = await confirmReceiptCurrency(receiptId, currency);

      if (error) {
        console.error('[WalletTab] Error confirming receipt currency:', error);
        setProcessingAttemptStartedAtByReceiptId((currentValue) => {
          const nextValue = { ...currentValue };
          if (previousProcessingAttemptStartedAt) {
            nextValue[receiptId] = previousProcessingAttemptStartedAt;
          } else {
            delete nextValue[receiptId];
          }
          return nextValue;
        });
        showToast('Failed to confirm currency', targetReceipt.merchant);
        return;
      }

      setReceipts((currentReceipts) => currentReceipts.map((receipt) => (
        receipt.id === receiptId
          ? {
            ...receipt,
            status: 'processing',
            errorReason: null,
            userConfirmedCurrency: currency,
            processingAttemptStartedAt,
          }
          : receipt
      )));

      setOtherCurrencyReceiptId((currentReceiptId) => (
        currentReceiptId === receiptId ? null : currentReceiptId
      ));
      showToast('Currency confirmed', `${targetReceipt.merchant} - ${currency}`);
    } catch (error) {
      console.error('[WalletTab] Unexpected error confirming receipt currency:', error);
      setProcessingAttemptStartedAtByReceiptId((currentValue) => {
        const nextValue = { ...currentValue };
        if (previousProcessingAttemptStartedAt) {
          nextValue[receiptId] = previousProcessingAttemptStartedAt;
        } else {
          delete nextValue[receiptId];
        }
        return nextValue;
      });
      showToast('Failed to confirm currency', targetReceipt.merchant);
    } finally {
      setCurrencyConfirmationState(null);
    }
  };

  const handleRetryReceipt = async (receiptId: string) => {
    const targetReceipt = receipts.find((receipt) => receipt.id === receiptId);
    if (!targetReceipt) return;

    const processingAttemptStartedAt = new Date().toISOString();
    const previousProcessingAttemptStartedAt = processingAttemptStartedAtByReceiptId[receiptId];

    setCurrencyConfirmationState({ receiptId, currency: RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION });
    setProcessingAttemptStartedAtByReceiptId((currentValue) => ({
      ...currentValue,
      [receiptId]: processingAttemptStartedAt,
    }));

    try {
      const { error } = await retryReceiptProcessing(receiptId);

      if (error) {
        console.error('[WalletTab] Error retrying receipt processing:', error);
        setProcessingAttemptStartedAtByReceiptId((currentValue) => {
          const nextValue = { ...currentValue };
          if (previousProcessingAttemptStartedAt) {
            nextValue[receiptId] = previousProcessingAttemptStartedAt;
          } else {
            delete nextValue[receiptId];
          }
          return nextValue;
        });
        showToast('Failed to retry upload', targetReceipt.merchant);
        return;
      }

      setReceipts((currentReceipts) => currentReceipts.map((receipt) => (
        receipt.id === receiptId
          ? {
            ...receipt,
            status: 'processing',
            errorReason: null,
            processingAttemptStartedAt,
          }
          : receipt
      )));

      showToast('Upload retry started', targetReceipt.merchant);
    } catch (error) {
      console.error('[WalletTab] Unexpected error retrying receipt processing:', error);
      setProcessingAttemptStartedAtByReceiptId((currentValue) => {
        const nextValue = { ...currentValue };
        if (previousProcessingAttemptStartedAt) {
          nextValue[receiptId] = previousProcessingAttemptStartedAt;
        } else {
          delete nextValue[receiptId];
        }
        return nextValue;
      });
      showToast('Failed to retry upload', targetReceipt.merchant);
    } finally {
      setCurrencyConfirmationState(null);
    }
  };

  const handleDeleteReceipt = async (receiptId: string) => {
    const targetReceipt = receipts.find((receipt) => receipt.id === receiptId);
    if (!targetReceipt) return;

    if (!confirm(`Delete receipt from ${targetReceipt.merchant || 'Receipt (Seller Unknown)'}?`)) return;

    setIsDeleting(true);
    try {
      const { error } = await deleteReceiptRecord({
        receiptId: targetReceipt.id,
        storagePath: targetReceipt.storagePath,
        imageUrl: targetReceipt.imageUrl,
      });

      if (error) {
        console.error('[WalletTab] Error deleting stale receipt:', error);
        showToast('Failed to delete receipt', targetReceipt.merchant);
        return;
      }

      setReceipts((currentReceipts) => currentReceipts.filter((receipt) => receipt.id !== receiptId));
      setProcessingAttemptStartedAtByReceiptId((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[receiptId];
        return nextValue;
      });
      showToast('Receipt deleted', targetReceipt.merchant);
    } catch (error) {
      console.error('[WalletTab] Unexpected error deleting stale receipt:', error);
      showToast('Failed to delete receipt', targetReceipt.merchant);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="pb-32 px-6 pt-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            Welcome back{getWelcomeName() && ` ${getWelcomeName()}`}
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

        <div className="mb-6">
          <div className="inline-flex w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-1">
            {[
              { value: 'all', label: 'All', count: receipts.length },
              { value: 'work', label: 'Work', count: workReceipts.length },
              { value: 'personal', label: 'Personal', count: personalReceipts.length }
            ].map((option) => {
              const isSelected = selectedFolder === option.value;
              const tabWidth = isSelected ? 'flex-[2]' : 'flex-1';

              return (
                <motion.button
                  key={option.value}
                  onClick={() => setSelectedFolder(option.value as 'all' | 'work' | 'personal')}
                  layout
                  className={`${tabWidth} rounded-lg p-3 text-center font-semibold transition-all ${
                    isSelected
                      ? 'bg-teal-400/30 text-teal-100 shadow-[0_0_20px_rgba(94,234,212,0.3)]'
                      : 'bg-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="text-lg font-bold leading-none mb-1">{option.count}</div>
                  <div className={`text-xs font-semibold ${isSelected ? 'text-teal-300' : 'text-gray-400'}`}>
                    {option.label}
                  </div>
                </motion.button>
              );
            })}
          </div>
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
              placeholder="Search companies, items, or order numbers..."
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
          <div className="flex items-center gap-2 relative">
            {selectedReceipts.size > 0 && (
              <>
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setMoveMenuOpen(!moveMenuOpen)}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-3 py-1.5 bg-teal-500/20 border border-teal-500/50 hover:bg-teal-500/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-teal-400 text-sm font-semibold transition-colors"
                  title="Move to folder"
                >
                  Move to folder
                  <ChevronDown className="w-4 h-4" />
                </motion.button>

                {moveMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 mt-2 w-48 backdrop-blur-xl bg-black/95 border border-white/10 rounded-lg overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] z-20"
                  >
                    <button
                      onClick={() => {
                        handleBulkMove('work');
                        setMoveMenuOpen(false);
                      }}
                      disabled={isDeleting}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-500/10 transition-colors text-left text-blue-400 hover:text-blue-300 border-b border-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
                    >
                      Work
                    </button>
                    <button
                      onClick={() => {
                        handleBulkMove('personal');
                        setMoveMenuOpen(false);
                      }}
                      disabled={isDeleting}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-500/10 transition-colors text-left text-purple-400 hover:text-purple-300 border-b border-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
                    >
                      Personal
                    </button>
                    <button
                      onClick={() => {
                        handleBulkMove(null);
                        setMoveMenuOpen(false);
                      }}
                      disabled={isDeleting}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-500/10 transition-colors text-left text-gray-400 hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
                    >
                      All
                    </button>
                  </motion.div>
                )}

                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 border border-red-500/50 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-red-400 text-sm font-semibold transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </motion.button>
              </>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setSelectMode(!selectMode);
                setSelectedReceipts(new Set());
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                selectMode
                  ? 'bg-teal-400/20 border border-teal-400/40 text-teal-400'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </motion.button>
            <ReceiptIcon className="w-5 h-5 text-gray-400" />
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {loading ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-12 text-center"
            >
              <Loader2 className="w-12 h-12 text-teal-400 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Loading receipts...</h3>
              <p className="text-gray-400">Pulling in your wallet</p>
            </motion.div>
          ) : filteredReceipts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-12 text-center"
            >
              {hasSearchQuery ? (
                <>
                  <Search className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">No receipts found</h3>
                  <p className="text-gray-400">Try searching by merchant, item, or order number</p>
                </>
              ) : selectedCategory || warrantyFilterActive ? (
                <>
                  <Search className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">No receipts found</h3>
                  <p className="text-gray-400">Try adjusting your filters</p>
                </>
              ) : (
                <>
                  <ReceiptIcon className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">No receipts here yet</h3>
                  <p className="text-gray-400">Capture purchases or move receipts into this folder</p>
                </>
              )}
            </motion.div>
          ) : (
            <div className="space-y-3">
              {filteredReceipts.map((receipt, index) => {
                const MerchantIcon = receipt.merchantIcon;
                const isProcessing = receipt.status === 'processing';
                const isStaleProcessing = isReceiptStaleProcessing(
                  receipt.status,
                  receipt.createdAt,
                  receipt.processingAttemptStartedAt
                );
                const isFreshProcessing = isProcessing && !isStaleProcessing;
                const requiresCurrencyConfirmation = needsCurrencyConfirmation(receipt.status, receipt.errorReason);
                const isConfirmingCurrency = currencyConfirmationState?.receiptId === receipt.id;
                const hasActiveWarranty = receipt.warrantyDate && new Date(receipt.warrantyDate) > new Date();
                const hasExpiredWarranty = receipt.warrantyDate && new Date(receipt.warrantyDate) <= new Date();
                const returnWindowStatus = getReturnWindowStatus(receipt.returnDate);

                return (
                  <motion.div
                    key={receipt.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ scale: isFreshProcessing ? 1 : 1.02 }}
                    className={`w-full backdrop-blur-xl border rounded-xl p-5 transition-all text-left relative ${
                      selectMode && selectedReceipts.has(receipt.id)
                        ? 'bg-teal-400/20 border-teal-400/60'
                        : isFreshProcessing
                        ? 'bg-teal-400/5 border-teal-400/30 cursor-default'
                        : isStaleProcessing
                        ? 'bg-red-500/5 border-red-500/30'
                        : requiresCurrencyConfirmation
                        ? 'bg-amber-400/5 border-amber-400/30'
                        : hasActiveWarranty
                        ? 'bg-gradient-to-br from-emerald-900/10 to-teal-900/5 border-emerald-500/50 hover:bg-gradient-to-br hover:from-emerald-900/15 hover:to-teal-900/10 hover:border-emerald-400/60 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-teal-400/30'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (selectMode && !isFreshProcessing) {
                          toggleReceiptSelection(receipt.id);
                        } else if (!isFreshProcessing) {
                          onReceiptClick(receipt);
                        }
                      }}
                      className={`w-full text-left ${!isFreshProcessing ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-start gap-4 mb-3">
                        {selectMode ? (
                          <div className="w-12 h-12 flex-shrink-0 rounded-xl border border-teal-400/50 bg-teal-400/10 flex items-center justify-center">
                            {selectedReceipts.has(receipt.id) ? (
                              <CheckSquare className="w-6 h-6 text-teal-400" strokeWidth={2} />
                            ) : (
                              <Square className="w-6 h-6 text-gray-500" strokeWidth={1.5} />
                            )}
                          </div>
                        ) : (
                          <div className={`w-12 h-12 flex-shrink-0 rounded-xl border flex items-center justify-center ${
                            isFreshProcessing
                              ? 'bg-teal-400/10 border-teal-400/30'
                              : isStaleProcessing
                              ? 'bg-red-500/10 border-red-500/30'
                              : requiresCurrencyConfirmation
                              ? 'bg-amber-400/10 border-amber-400/30'
                              : 'bg-gradient-to-br from-white/10 to-white/5 border-white/10'
                          }`}>
                            {isFreshProcessing ? (
                              <Loader2 className="w-6 h-6 text-teal-400 animate-spin" strokeWidth={1.5} />
                            ) : (
                              <MerchantIcon className="w-6 h-6 text-teal-400" strokeWidth={1.5} />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {isFreshProcessing ? (
                            <motion.h3 className="text-lg font-bold mb-1 text-teal-400">
                              Processing<motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 1, 1, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              >
                                .
                              </motion.span>
                              <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 0, 1, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              >
                                .
                              </motion.span>
                              <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 0, 1, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: 0.1 }}
                              >
                                .
                              </motion.span>
                            </motion.h3>
                          ) : isStaleProcessing ? (
                            <>
                              <h3 className="text-lg font-bold mb-1 text-red-400">Upload failed</h3>
                              <p className="text-sm text-gray-400">{receipt.merchant}</p>
                            </>
                          ) : (
                            <h3 className="text-lg font-bold mb-1 text-white">
                              {receipt.merchant}
                            </h3>
                          )}

                          <div className="flex items-center gap-2">
                            <p className="text-sm text-gray-400">
                              {getPurchaseDateDisplay(
                                receipt.date,
                                'short',
                                isProcessing ? PURCHASE_DATE_PENDING_LABEL : undefined
                              )}
                            </p>
                            {hasActiveWarranty && !isFreshProcessing && (
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-400/10 border border-emerald-400/30 rounded-full">
                                <Shield className="w-3 h-3 text-emerald-400" strokeWidth={2} />
                                <span className="text-emerald-400 text-xs font-bold">Active</span>
                              </div>
                            )}
                            {hasExpiredWarranty && !isFreshProcessing && (
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-red-400/10 border border-red-400/30 rounded-full">
                                <Shield className="w-3 h-3 text-red-400" strokeWidth={2} />
                                <span className="text-red-400 text-xs font-bold">Expired</span>
                              </div>
                            )}
                            {returnWindowStatus.status === 'active' && !isFreshProcessing && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-red-400/10 border border-red-400/20 rounded-full">
                                <Undo2 className="w-2.5 h-2.5 text-red-400" strokeWidth={2.5} />
                                <span className="text-red-400 text-[10px] font-bold">{returnWindowStatus.message}</span>
                              </div>
                            )}
                            {returnWindowStatus.status === 'urgent' && !isFreshProcessing && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 rounded-full animate-pulse">
                                <Undo2 className="w-2.5 h-2.5 text-red-400" strokeWidth={2.5} />
                                <span className="text-red-400 text-[10px] font-bold">{returnWindowStatus.message}</span>
                              </div>
                            )}
                            {returnWindowStatus.status === 'expired' && !isFreshProcessing && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-400/10 border border-gray-400/20 rounded-full">
                                <Undo2 className="w-2.5 h-2.5 text-gray-500" strokeWidth={2.5} />
                                <span className="text-gray-500 text-[10px] font-bold">{returnWindowStatus.message}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {!isFreshProcessing && (
                          <div className="text-right">
                            <div className="text-2xl font-bold text-white">
                              {requiresCurrencyConfirmation || isStaleProcessing ? receipt.amount.toFixed(2) : formatCurrencyAmount(receipt.currency, receipt.amount)}
                            </div>
                            {requiresCurrencyConfirmation ? (
                              <div className="text-xs pt-1 text-amber-300">
                                Awaiting currency
                              </div>
                            ) : isStaleProcessing ? (
                              <div className="text-xs pt-1 text-red-300">
                                Upload failed
                              </div>
                            ) : (
                              receipt.currency && receipt.currency.toUpperCase() !== 'GBP' && receipt.amount_gbp !== null && (
                                <div className="text-xs pt-1 text-gray-400">
                                  Approx. £{receipt.amount_gbp.toFixed(2)}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {isFreshProcessing ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md text-teal-400 bg-teal-400/10 border-teal-400/30">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Processing...
                          </div>
                        ) : isStaleProcessing ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md text-red-400 bg-red-500/10 border-red-500/30">
                            <X className="w-3 h-3" />
                            Upload failed
                          </div>
                        ) : (
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md ${getTagColor(receipt.category)}`}>
                            <Tag className="w-3 h-3" />
                            {receipt.category}
                          </div>
                        )}
                      </div>
                    </button>

                    {isStaleProcessing && (
                      <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-red-300">Upload failed</p>
                            <p className="text-xs text-red-100/80">This receipt has been processing for more than 5 minutes.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleRetryReceipt(receipt.id)}
                              disabled={isDeleting || isConfirmingCurrency}
                              className="px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isConfirmingCurrency ? 'Retrying...' : 'Retry'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteReceipt(receipt.id)}
                              disabled={isDeleting || isConfirmingCurrency}
                              className="px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setReportProblemReceipt({
                                id: receipt.id,
                                merchant: receipt.merchant,
                              })}
                              disabled={isDeleting || isConfirmingCurrency}
                              className="px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Report a problem
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {requiresCurrencyConfirmation && (
                  <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-amber-200">Currency missing, please confirm</p>
                        <p className="text-xs text-amber-100/80">Choose the currency for this receipt to send it back into processing.</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCurrencyConfirmation(receipt.id, RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION)}
                            disabled={isConfirmingCurrency}
                            className="px-3 py-1.5 rounded-lg border border-amber-300/30 bg-black/20 text-sm font-semibold text-amber-100 hover:bg-amber-300/10 hover:border-amber-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {currencyConfirmationState?.receiptId === receipt.id
                              && currencyConfirmationState.currency === RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION
                              ? 'Saving...'
                              : 'GBP'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOtherCurrencyReceiptId((currentReceiptId) => (
                              currentReceiptId === receipt.id ? null : receipt.id
                            ))}
                            disabled={isConfirmingCurrency}
                            className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              otherCurrencyReceiptId === receipt.id
                                ? 'border-amber-200/50 bg-amber-300/10 text-amber-50'
                                : 'border-amber-300/30 bg-black/20 text-amber-100 hover:bg-amber-300/10 hover:border-amber-200/50'
                            }`}
                          >
                            Other
                          </button>
                        </div>
                        {otherCurrencyReceiptId === receipt.id && (
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              const selectedCurrency = event.target.value;
                              if (isReceiptCurrencyConfirmationOption(selectedCurrency)) {
                                void handleCurrencyConfirmation(receipt.id, selectedCurrency);
                              }
                            }}
                            disabled={isConfirmingCurrency}
                            className="w-full min-w-[200px] rounded-lg border border-amber-300/30 bg-black/30 px-3 py-2 text-sm font-semibold text-amber-50 outline-none transition-colors hover:border-amber-200/50 focus:border-amber-200/60 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
                          >
                            <option value="" disabled className="bg-neutral-950 text-gray-400">
                              Select currency
                            </option>
                            {RECEIPT_CURRENCY_CONFIRMATION_OPTIONS.map((currencyOption) => (
                              <option
                                key={currencyOption}
                                value={currencyOption}
                                className="bg-neutral-950 text-white"
                              >
                                {currencyOption}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>

        <ReportProblemDialog
          isOpen={Boolean(reportProblemReceipt)}
          onClose={() => setReportProblemReceipt(null)}
          receiptId={reportProblemReceipt?.id}
          receiptMerchant={reportProblemReceipt?.merchant}
        />

        <AnimatePresence>
          {deleteConfirmOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
              onClick={() => !isDeleting && setDeleteConfirmOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="backdrop-blur-xl bg-black/90 border border-white/10 rounded-2xl p-6 max-w-sm mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-xl font-bold text-white mb-2">Delete Receipts?</h3>
                <p className="text-gray-400 text-sm mb-6">
                  Are you sure you want to permanently delete {selectedReceipts.size} receipt{selectedReceipts.size > 1 ? 's' : ''}? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDeleteConfirmOpen(false)}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 font-semibold hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
