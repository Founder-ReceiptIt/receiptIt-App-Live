import { motion, AnimatePresence } from 'framer-motion';
import { Receipt as ReceiptIcon, Laptop, Coffee, Shirt, Search, X, ShoppingBag, Loader2, Car, Home, Plane, Zap, Utensils, Undo2, Trash2, CheckSquare, Square, ChevronDown, Download, AlertCircle, ShieldCheck, AtSign, ScanLine, CopyCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { ReportProblemDialog } from './ReportProblemDialog';
import {
  confirmReceiptCurrency,
  deleteReceiptRecord,
  isReceiptCurrencyConfirmationOption,
  isReceiptStaleProcessing,
  markReceiptProcessingTimedOut,
  needsCurrencyConfirmation,
  isFinalizedReceiptStatus,
  keepPossibleDuplicate,
  RECEIPT_CURRENCY_CONFIRMATION_OPTIONS,
  RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION,
  retryReceiptProcessing,
  recordReceiptOriginalView,
  supabase,
  Receipt as SupabaseReceiptRow,
} from '../../lib/supabase';
import type { ReceiptCurrencyConfirmationOption } from '../../lib/supabase';
import { hasReceiptOriginal, openReceiptOriginal } from '../../lib/receiptOriginalUtils';
import { useAuth } from '../../contexts/AuthContext';
import { getReturnWindowStatus } from '../../lib/returnWindowUtils';
import { getReceiptFailureDetails, getReceiptPurchaseDateDisplay } from '../../lib/receiptUiUtils';
import { requestReceiptSectionCapture } from '../../lib/receiptCaptureUtils';
import { getReceiptMilestone } from '../../lib/receiptMilestones';
import { useToast } from '../../contexts/ToastContext';
import { convertReceiptAmounts, formatCurrency, getCurrencyConfig } from '../../lib/currency';
import { isReceiptAmountKnown, isReceiptStatusActionable } from '../../lib/receiptAmountState';

interface WalletTabProps {
  onReceiptClick: (receipt: Receipt) => void;
  onReceiptsChange?: (receipts: Receipt[]) => void;
  onNavigateToScan: () => void;
  onNavigateToAlias: () => void;
  requestedReceiptId?: string | null;
  onRequestedReceiptHandled?: () => void;
}

interface PossibleDuplicateCandidate {
  receipt_id: string;
  possible_duplicate_of: string;
  confidence: number;
  signals: string[];
  created_at: string;
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
  return getCurrencyConfig(currencyCode || 'GBP').symbol;
};

const formatCurrencyAmount = (currencyCode: string, amount: number): string => (
  formatCurrency(amount, currencyCode)
);

const WALLET_RECEIPT_STATUSES = ['needs_input', 'processing', 'parsed', 'completed', 'duplicate', 'failed', 'error', 'skipped', 'needs_review', 'rejected'] as const;
const HIDDEN_WALLET_RECEIPT_STATUSES = ['duplicate', 'skipped'] as const;
const RECEIPT_MILESTONE_STORAGE_PREFIX = 'receiptit:shown-receipt-milestones:';

const getShownReceiptMilestones = (userId: string): Set<number> => {
  try {
    const saved = window.localStorage.getItem(`${RECEIPT_MILESTONE_STORAGE_PREFIX}${userId}`);
    const parsed = saved ? JSON.parse(saved) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((count): count is number => Number.isInteger(count)) : []);
  } catch {
    return new Set();
  }
};

const markReceiptMilestoneShown = (userId: string, count: number): void => {
  try {
    const shownMilestones = getShownReceiptMilestones(userId);
    shownMilestones.add(count);
    window.localStorage.setItem(
      `${RECEIPT_MILESTONE_STORAGE_PREFIX}${userId}`,
      JSON.stringify([...shownMilestones].sort((first, second) => first - second)),
    );
  } catch {
    // Milestones remain a quiet enhancement when storage is unavailable.
  }
};

const isHiddenWalletReceiptStatus = (status: unknown): status is typeof HIDDEN_WALLET_RECEIPT_STATUSES[number] =>
  typeof status === 'string' && HIDDEN_WALLET_RECEIPT_STATUSES.includes(status as typeof HIDDEN_WALLET_RECEIPT_STATUSES[number]);

const getReceiptStatusPriority = (status: unknown): number => {
  if (status === 'needs_input') return 6;
  if (status === 'needs_review') return 5;
  if (status === 'parsed') return 4;
  if (status === 'completed') return 3;
  if (status === 'processing') return 2;
  if (status === 'failed' || status === 'error' || status === 'rejected') return 1;
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
    if (['processing', 'needs_input', 'failed', 'error', 'needs_review', 'rejected'].includes(row.status || '')) return true;
    if (isHiddenWalletReceiptStatus(row.status)) return false;
    return false;
  });

const filterVisibleWalletReceipts = (receipts: Receipt[]): Receipt[] =>
  receipts.filter((receipt) => {
    if (isFinalizedReceiptStatus(receipt.status)) return true;
    if (needsCurrencyConfirmation(receipt.status, receipt.errorReason)) return true;
    if (['processing', 'needs_input', 'failed', 'error', 'needs_review', 'rejected'].includes(receipt.status || '')) return true;
    if (isHiddenWalletReceiptStatus(receipt.status)) return false;
    return false;
  });

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

const isReceiptActionable = (receipt: Receipt): boolean => {
  if (isReceiptStatusActionable(receipt.status)) return true;
  return getReturnWindowStatus(receipt.returnDate).status === 'urgent';
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
  amount: number | null;
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
  const extractedTotal = getNullableNumber(row.amount);
  const total = extractedTotal ?? 0;
  const amountKnown = isReceiptAmountKnown(row);
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
    amountKnown,
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
    documentType: row.document_type || undefined,
    source: row.source || undefined,
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
      amount: amountKnown ? total : null,
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
    processingAttemptStartedAt: row.processing_attempt_started_at || undefined,
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
  amountKnown: boolean;
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
  documentType?: string;
  source?: string;
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
    id: string;
    receiptId: string;
    lineIndex: number;
    description?: string | null;
    rawDescription?: string | null;
    displayName?: string | null;
    brandName?: string | null;
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

export function WalletTab({
  onReceiptClick,
  onReceiptsChange,
  onNavigateToScan,
  onNavigateToAlias,
  requestedReceiptId,
  onRequestedReceiptHandled,
}: WalletTabProps) {
  const { user, accountCurrency } = useAuth();
  const { showToast } = useToast();
  const preferredReceiptCurrency: ReceiptCurrencyConfirmationOption = isReceiptCurrencyConfirmationOption(accountCurrency.preferredCurrency)
    ? accountCurrency.preferredCurrency
    : RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION;
  const orderedCurrencyConfirmationOptions = [
    preferredReceiptCurrency,
    ...RECEIPT_CURRENCY_CONFIRMATION_OPTIONS.filter((currency) => currency !== preferredReceiptCurrency),
  ];

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
  const [convertedAmounts, setConvertedAmounts] = useState<Map<string, number>>(new Map());
  const [excludedConversionIds, setExcludedConversionIds] = useState<Set<string>>(new Set());
  const [possibleDuplicates, setPossibleDuplicates] = useState<PossibleDuplicateCandidate[]>([]);
  const [resolvingPossibleDuplicateId, setResolvingPossibleDuplicateId] = useState<string | null>(null);
  const previousReceiptIdsRef = useRef<Set<string>>(new Set());
  const successfulReceiptIdsRef = useRef<Set<string>>(new Set());
  const isMilestoneTrackingReadyRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    let active = true;
    const userId = user.id;

    // Never retain the previous identity's Wallet while the new user's query
    // is in flight. RLS remains authoritative; this closes the client-side
    // shared-browser rendering window as well.
    setReceipts([]);
    setLoading(true);
    setSelectedReceipts(new Set());
    setSelectMode(false);
    setConvertedAmounts(new Map());
    setExcludedConversionIds(new Set());
    setPossibleDuplicates([]);
    setProcessingAttemptStartedAtByReceiptId({});

    successfulReceiptIdsRef.current = new Set();
    isMilestoneTrackingReadyRef.current = false;

    const showSuccessfulReceiptToast = (row: Partial<SupabaseReceiptRow>, amount: number) => {
      const merchantName = row.merchant && row.merchant.trim() ? row.merchant : 'Receipt (Seller Unknown)';
      const currencyCode = row.currency || 'GBP';
      const receiptId = typeof row.id === 'string' ? row.id : undefined;

      if (receiptId && isMilestoneTrackingReadyRef.current && !successfulReceiptIdsRef.current.has(receiptId)) {
        successfulReceiptIdsRef.current.add(receiptId);
        const milestone = getReceiptMilestone(successfulReceiptIdsRef.current.size);

        if (milestone && !getShownReceiptMilestones(user.id).has(milestone.count)) {
          markReceiptMilestoneShown(user.id, milestone.count);
          showToast(milestone.title, milestone.supportingText);
          return;
        }
      }

      showToast('Receipt saved', `${merchantName} - ${formatCurrencyAmount(currencyCode, amount)}`);
    };

    const fetchReceipts = async () => {
      try {
        console.log('[WalletTab] Fetching receipts');

        const { data, error } = await supabase
          .from('receipts')
          .select('*')
          .eq('user_id', userId)
          .in('status', [...WALLET_RECEIPT_STATUSES])
          .order('transaction_date', { ascending: false });

        if (!active) return;

        console.log('[WalletTab] Receipt query completed:', { hasError: Boolean(error), dataLength: data?.length });

        if (error) {
          console.error('[WalletTab] Query error:', error);
          setReceipts([]);
          setLoading(false);
          return;
        }

        const rawRows = ((data || []) as SupabaseReceiptRow[]);
        const { data: possibleDuplicateRows, error: possibleDuplicateError } = await supabase
          .from('receipt_possible_duplicates')
          .select('receipt_id,possible_duplicate_of,confidence,signals,created_at')
          .eq('user_id', userId)
          .eq('decision', 'pending')
          .order('created_at', { ascending: false });

        if (!active) return;
        if (possibleDuplicateError) {
          console.error('[WalletTab] Could not load possible duplicates:', possibleDuplicateError);
          setPossibleDuplicates([]);
        } else {
          setPossibleDuplicates((possibleDuplicateRows || []) as PossibleDuplicateCandidate[]);
        }
        successfulReceiptIdsRef.current = new Set(
          rawRows
            .filter((row) => isFinalizedReceiptStatus(row.status))
            .map((row) => row.id),
        );
        isMilestoneTrackingReadyRef.current = true;
        const filteredRawRows = filterVisibleReceiptRows(rawRows);
        const dedupedRows = dedupeReceiptRows(filteredRawRows);
        const visibleDedupedRows = filterVisibleReceiptRows(dedupedRows);
        const itemDescriptionsByReceipt = new Map<string, string[]>();

        if (visibleDedupedRows.length > 0) {
          const { data: receiptItemsData, error: receiptItemsError } = await supabase
            .from('receipt_items')
            .select('receipt_id, description, raw_description, display_name, brand_name')
            .in('receipt_id', visibleDedupedRows.map((row) => row.id));

          if (!active) return;

          if (receiptItemsError) {
            console.error('[WalletTab] receipt_items search query error:', receiptItemsError);
          } else {
            (receiptItemsData || []).forEach((row) => {
              const receiptId = getNonEmptyString((row as { receipt_id?: string | null }).receipt_id);
              const itemRow = row as {
                description?: string | null;
                raw_description?: string | null;
                display_name?: string | null;
                brand_name?: string | null;
              };
              const searchableDescriptions = [
                itemRow.display_name,
                itemRow.brand_name,
                itemRow.raw_description,
                itemRow.description,
              ].map(getNonEmptyString).filter((value): value is string => value !== null);

              if (!receiptId || searchableDescriptions.length === 0) return;

              const existingDescriptions = itemDescriptionsByReceipt.get(receiptId) || [];
              existingDescriptions.push(...searchableDescriptions);
              itemDescriptionsByReceipt.set(receiptId, existingDescriptions);
            });
          }
        }

        const formattedReceipts: Receipt[] = visibleDedupedRows.map((row) => (
          mapReceiptRowToWalletReceipt(row, itemDescriptionsByReceipt.get(row.id) || [])
        ));

        const safeReceipts = getSafeWalletReceipts(formattedReceipts);

        // Track receipt IDs for notification detection
        previousReceiptIdsRef.current = new Set(safeReceipts.map(r => r.id));

        setReceipts(safeReceipts);
        setLoading(false);

        const staleReceiptIds = safeReceipts
          .filter((receipt) => isReceiptStaleProcessing(
            receipt.status,
            receipt.createdAt,
            receipt.processingAttemptStartedAt
          ))
          .map((receipt) => receipt.id);

        if (staleReceiptIds.length > 0) {
          void Promise.all(staleReceiptIds.map(markReceiptProcessingTimedOut))
            .then(() => fetchReceipts())
            .catch((staleUpdateError) => {
              console.error('[WalletTab] Could not mark stale processing receipts as failed:', staleUpdateError);
            });
        }
      } catch (error) {
        if (!active) return;
        console.error('[WalletTab] Unexpected error fetching receipts:', error);
        setReceipts([]);
        setLoading(false);
      }
    };

    // Initial fetch
    fetchReceipts();

    // Set up realtime subscription
    console.log('[WalletTab] Setting up receipt realtime subscription');

    const channel = supabase
      .channel(`receipts-changes-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receipts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!active) return;
          console.log('[WalletTab] Realtime event received:', payload.eventType);

          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as Partial<SupabaseReceiptRow>;
            console.log('[WalletTab] New receipt inserted');

            if (newRow.status === 'duplicate') {
              const merchantDescription = newRow.merchant && newRow.merchant.trim()
                ? newRow.merchant
                : 'This receipt was already in your wallet';
              showToast('Already saved', merchantDescription);
              fetchReceipts();
              return;
            }

            setReceipts((currentReceipts) => mergeRealtimeReceiptIntoWallet(currentReceipts, newRow as SupabaseReceiptRow));

            if (isFinalizedReceiptStatus(newRow.status)) {
              const legacyTotal = (newRow as { total?: unknown }).total;
              const amount = parseFloat(String(newRow.amount ?? '')) || parseFloat(String(legacyTotal ?? '')) || 0;
              showSuccessfulReceiptToast(newRow, amount);
            }

            fetchReceipts();
          } else if (payload.eventType === 'UPDATE') {
            const updatedRow = payload.new as Partial<SupabaseReceiptRow>;
            const oldRow = payload.old as Partial<SupabaseReceiptRow>;

            console.log('[WalletTab] Receipt updated');

            if (updatedRow.status === 'duplicate') {
              const merchantDescription = updatedRow.merchant && updatedRow.merchant.trim()
                ? updatedRow.merchant
                : 'This receipt was already in your wallet';
              setReceipts((currentReceipts) => currentReceipts.filter((receipt) => receipt.id !== updatedRow.id));
              showToast('Already saved', merchantDescription);
              fetchReceipts();
              return;
            }

            setReceipts((currentReceipts) => mergeRealtimeReceiptIntoWallet(currentReceipts, updatedRow as SupabaseReceiptRow));

            // Check if amount was just processed (changed from 0 or null to a value)
            const oldLegacyTotal = (oldRow as { total?: unknown }).total;
            const newLegacyTotal = (updatedRow as { total?: unknown }).total;
            const oldAmount = parseFloat(String(oldRow.amount ?? '')) || parseFloat(String(oldLegacyTotal ?? '')) || 0;
            const newAmount = parseFloat(String(updatedRow.amount ?? '')) || parseFloat(String(newLegacyTotal ?? '')) || 0;

            if (isFinalizedReceiptStatus(updatedRow.status) && ((oldAmount === 0 && newAmount > 0) || !isFinalizedReceiptStatus(oldRow.status))) {
              showSuccessfulReceiptToast(updatedRow, newAmount);
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receipt_possible_duplicates',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (!active) return;
          fetchReceipts();
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
      active = false;
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

  useEffect(() => {
    let active = true;
    const loadConvertedAmounts = async () => {
      setConvertedAmounts(new Map());
      setExcludedConversionIds(new Set());
      const receiptsForConversion = filterVisibleWalletReceipts(dedupeWalletReceipts(receipts))
        .filter((receipt) => isFinalizedReceiptStatus(receipt.status) && receipt.amountKnown);
      const converted = await convertReceiptAmounts(receiptsForConversion.map((receipt) => ({
        id: receipt.id,
        amount: receipt.amount,
        currency: receipt.currency,
        transactionDate: receipt.date || null,
      })), accountCurrency.preferredCurrency);
      if (!active) return;
      setConvertedAmounts(converted.amounts);
      setExcludedConversionIds(new Set(converted.excludedReceiptIds));
    };
    void loadConvertedAmounts();
    return () => { active = false; };
  }, [receipts, accountCurrency.preferredCurrency]);

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const receiptsThisMonth = finalizedReceipts.filter((receipt) => (
    (receipt.date || receipt.createdAt || '').slice(0, 7) === currentMonthKey
  ));
  const includedReceiptsThisMonth = receiptsThisMonth.filter((receipt) => convertedAmounts.has(receipt.id));
  const excludedThisMonthCount = receiptsThisMonth.filter((receipt) => excludedConversionIds.has(receipt.id)).length;
  const spentThisMonth = includedReceiptsThisMonth.reduce((sum, receipt) => sum + (convertedAmounts.get(receipt.id) ?? 0), 0);
  const averagePurchaseThisMonth = includedReceiptsThisMonth.length ? spentThisMonth / includedReceiptsThisMonth.length : 0;
  const monthlyBudget = accountCurrency.monthlyBudgetCurrency === accountCurrency.preferredCurrency
    ? accountCurrency.monthlyBudgetAmount
    : null;
  const budgetUsed = monthlyBudget ? (spentThisMonth / monthlyBudget) * 100 : 0;
  const budgetProgress = Math.min(budgetUsed, 100);
  const actionReceipts = visibleReceipts.filter(isReceiptActionable).flatMap((receipt) => {
    const hasNamedMerchant = receipt.merchant && receipt.merchant.trim().toLowerCase() !== 'analyzing...';
    if (receipt.status === 'needs_review') return [{ receipt, label: 'Review needed', detail: `Review ${hasNamedMerchant ? receipt.merchant : 'this purchase document'}` }];
    if (['failed', 'error'].includes(receipt.status || '')) return [{ receipt, label: 'Try again', detail: `We could not finish ${hasNamedMerchant ? receipt.merchant : 'this receipt'}` }];
    if (receipt.status === 'needs_input') return [{ receipt, label: 'Details needed', detail: 'One receipt needs a quick check' }];
    if (receipt.status === 'rejected') return [{ receipt, label: 'Check document', detail: 'One file was not recognised as purchase evidence' }];
    const returnStatus = getReturnWindowStatus(receipt.returnDate);
    if (returnStatus.status === 'urgent') return [{ receipt, label: '1 thing needs you', detail: returnStatus.message }];
    return [];
  });
  const primaryAction = actionReceipts[0];
  const actionHeading = actionReceipts.length === 1
    ? '1 thing needs you'
    : `${actionReceipts.length} things need you`;

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

  const possibleDuplicate = possibleDuplicates
    .map((candidate) => ({
      candidate,
      receipt: visibleReceipts.find((receipt) => receipt.id === candidate.receipt_id),
      existing: visibleReceipts.find((receipt) => receipt.id === candidate.possible_duplicate_of),
    }))
    .find((match) => match.receipt && match.existing);

  useEffect(() => {
    onReceiptsChange?.(visibleReceipts);
  }, [onReceiptsChange, visibleReceipts]);

  useEffect(() => {
    if (!requestedReceiptId || loading) return;
    const requestedReceipt = visibleReceipts.find((receipt) => receipt.id === requestedReceiptId);
    if (requestedReceipt) onReceiptClick(requestedReceipt);
    onRequestedReceiptHandled?.();
  }, [loading, onReceiptClick, onRequestedReceiptHandled, requestedReceiptId, visibleReceipts]);

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

  const handleBulkDelete = async () => {
    if (selectedReceipts.size === 0) return;

    setIsDeleting(true);
    try {
      const receiptIds = Array.from(selectedReceipts);
      const receiptsToDelete = receipts.filter((receipt) => selectedReceipts.has(receipt.id));
      const results = await Promise.all(receiptsToDelete.map((receipt) => (
        deleteReceiptRecord({
          receiptId: receipt.id,
          storagePath: receipt.storagePath,
          imageUrl: receipt.imageUrl,
        })
      )));
      const firstError = results.find((result) => result.error)?.error;

      if (firstError) {
        console.error('[WalletTab] Delete error:', firstError);
        showToast('Failed to delete receipts', 'error');
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
        showToast('Couldn’t try again', targetReceipt.merchant);
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

      showToast('Trying receipt again', targetReceipt.merchant);
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
      showToast('Couldn’t try again', targetReceipt.merchant);
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

  const handleSavePossibleDuplicateAnyway = async (receiptId: string) => {
    setResolvingPossibleDuplicateId(receiptId);
    const { error } = await keepPossibleDuplicate(receiptId);
    setResolvingPossibleDuplicateId(null);
    if (error) {
      console.error('[WalletTab] Could not keep possible duplicate:', error);
      showToast('Couldn’t save your choice', 'Please try again.');
      return;
    }

    setPossibleDuplicates((current) => current.filter((candidate) => candidate.receipt_id !== receiptId));
    showToast('Saved separately', 'Both purchases remain in your Wallet.');
  };

  return (
    <div className="ri-mobile-page mx-auto min-w-0 max-w-7xl px-4 pt-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-7 flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-white">Receipts</h1>
            <p className="mt-2 text-sm text-gray-400">Your purchases, in one place.</p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={onNavigateToScan}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-black shadow-[0_10px_30px_rgba(45,212,191,0.12)] transition-colors hover:bg-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label="Scan receipt"
          >
            <ScanLine className="h-5 w-5" strokeWidth={1.8} />
            Scan receipt
          </motion.button>
        </div>

        {primaryAction ? <div className="mb-4 rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-400/12 to-teal-400/5 p-5"><div className="flex items-start gap-3"><div className="rounded-xl border border-amber-300/25 bg-amber-400/10 p-2.5"><AlertCircle className="h-5 w-5 text-amber-200" /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">{actionHeading}</p><p className="mt-1 text-2xl font-bold text-white">{primaryAction.detail}</p></div></div></div> : null}

        {possibleDuplicate ? (
          <section className="mb-4 rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-400/10 to-white/[0.025] p-5" aria-label="Possible duplicate receipt">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-xl border border-amber-300/25 bg-amber-400/10 p-2.5"><CopyCheck className="h-5 w-5 text-amber-200" strokeWidth={1.7} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">Possible duplicate</p>
                <h2 className="mt-1 break-words text-lg font-bold text-white">This looks similar to a receipt already saved.</h2>
                <p className="mt-1 text-sm leading-6 text-gray-400">Nothing has been removed. Compare the existing receipt or keep this as a separate purchase.</p>
                <div className="mt-4 flex flex-col gap-2 min-[380px]:flex-row">
                  <button type="button" onClick={() => onReceiptClick(possibleDuplicate.existing!)} className="min-h-11 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/5">View existing</button>
                  <button type="button" disabled={resolvingPossibleDuplicateId === possibleDuplicate.receipt!.id} onClick={() => void handleSavePossibleDuplicateAnyway(possibleDuplicate.receipt!.id)} className="min-h-11 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-teal-300 disabled:opacity-50">{resolvingPossibleDuplicateId === possibleDuplicate.receipt!.id ? 'Saving…' : 'Save anyway'}</button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <div className="mb-6 rounded-2xl border border-teal-300/25 bg-gradient-to-br from-teal-400/15 to-cyan-400/5 p-5">
          <div className="flex min-w-0 items-start gap-3"><div className="shrink-0 rounded-xl border border-teal-300/20 bg-teal-400/10 p-2.5"><ShieldCheck className="h-5 w-5 text-teal-200" strokeWidth={1.5} /></div><div className="min-w-0 flex-1"><div className="grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-200">This month</p><p className="mt-1 break-words text-2xl font-bold text-white">{formatCurrency(spentThisMonth, accountCurrency.preferredCurrency)} spent</p></div><div className="min-w-0 min-[380px]:text-right"><p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Average purchase</p><p className="mt-1 break-words text-lg font-bold text-white">{formatCurrency(averagePurchaseThisMonth, accountCurrency.preferredCurrency)}</p></div></div>{monthlyBudget ? <><p className="mt-4 text-sm text-gray-300">of {formatCurrency(monthlyBudget, accountCurrency.preferredCurrency, { maximumFractionDigits: 0, minimumFractionDigits: 0 })} budget</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-400 transition-[width] duration-300" style={{ width: `${budgetProgress}%` }} /></div><p className="mt-2 text-xs text-gray-400">{budgetUsed.toFixed(1)}% used</p></> : null}{excludedThisMonthCount > 0 ? <p className="mt-3 text-xs text-amber-100">{excludedThisMonthCount === 1 ? 'One purchase couldn’t be included in this total.' : `${excludedThisMonthCount} purchases couldn’t be included in this total.`}</p> : null}</div></div>
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
              <ReceiptIcon className="w-6 h-6 text-emerald-400" />
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
              placeholder="Search store, item, amount, date or reference..."
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
            {filteredReceipts.length} {filteredReceipts.length === 1 ? 'purchase' : 'purchases'}
          </h2>
          <div className="flex items-center gap-2 relative">
            {selectMode && (
              <button
                type="button"
                onClick={() => setSelectedReceipts(new Set(filteredReceipts.map((receipt) => receipt.id)))}
                disabled={filteredReceipts.length === 0}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-sm font-semibold text-gray-200 transition-colors hover:border-teal-400/35 hover:text-teal-200 disabled:opacity-50"
              >
                All
              </button>
            )}
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
              <p className="text-gray-400">Getting your receipts ready</p>
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
                  <p className="text-gray-400">Try a store, item, amount, date or reference</p>
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
                  <h3 className="text-lg font-bold text-white mb-2">Your purchases will appear here.</h3>
                  <p className="mx-auto max-w-sm text-gray-400">Add your first receipt or use your private receiptIt address.</p>
                  <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                    <button type="button" onClick={onNavigateToScan} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-teal-300"><ScanLine className="h-4 w-4" strokeWidth={1.8} />Add receipt</button>
                    <button type="button" onClick={onNavigateToAlias} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/5"><AtSign className="h-4 w-4" strokeWidth={1.8} />View receiptIt address</button>
                  </div>
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
                const isNeedsInput = receipt.status === 'needs_input';
                const isDocumentReview = receipt.status === 'needs_review';
                const hasDisplayMerchant = receipt.merchant.trim().toLowerCase() !== 'analyzing...';
                const isNonFinalReceipt = isProcessing || isNeedsInput || receipt.status === 'needs_review' || receipt.status === 'rejected' || receipt.status === 'failed' || receipt.status === 'error';
                const requiresCurrencyConfirmation = needsCurrencyConfirmation(receipt.status, receipt.errorReason);
                const isConfirmingCurrency = currencyConfirmationState?.receiptId === receipt.id;
                const returnWindowStatus = getReturnWindowStatus(receipt.returnDate);
                const receiptFailureDetails = getReceiptFailureDetails({
                  status: receipt.status,
                  errorReason: receipt.errorReason,
                  date: receipt.date,
                  createdAt: receipt.createdAt,
                  processingAttemptStartedAt: receipt.processingAttemptStartedAt,
                });
                const purchaseDateDisplay = getReceiptPurchaseDateDisplay({
                  status: receipt.status,
                  date: receipt.date,
                  format: 'long',
                });
                const showIssueHeading = Boolean(receiptFailureDetails);
                const showOpenOriginalReceiptAction = (isNonFinalReceipt || showIssueHeading) && hasReceiptOriginal(receipt);
                const showFailedReceiptActions = showIssueHeading && !requiresCurrencyConfirmation;
                const shouldRetryExistingReceipt = receiptFailureDetails?.primaryAction === 'retry';
                const failurePrimaryActionLabel = receiptFailureDetails?.primaryAction === 'scan_sections'
                  ? 'Scan in sections'
                  : receiptFailureDetails?.primaryAction === 'replace'
                    ? 'Choose another file'
                    : 'Try again';
                const receiptCurrencyCode = receipt.currency?.toUpperCase() || '';
                const hasPreferredCurrencyConversion = (
                  isFinalizedReceiptStatus(receipt.status)
                  && receiptCurrencyCode !== accountCurrency.preferredCurrency
                  && convertedAmounts.has(receipt.id)
                );
                const preferredCurrencyAmount = convertedAmounts.get(receipt.id);

                return (
                  <motion.div
                    key={receipt.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.18), ease: [0.22, 1, 0.36, 1] }}
                    whileHover={isFreshProcessing ? undefined : { y: -2 }}
                    className={`w-full backdrop-blur-xl border rounded-xl p-5 transition-all text-left relative ${
                      selectMode && selectedReceipts.has(receipt.id)
                        ? 'bg-teal-400/20 border-teal-400/60'
                        : isFreshProcessing
                        ? 'bg-teal-400/5 border-teal-400/30 cursor-default'
                        : isStaleProcessing
                        ? 'bg-red-500/5 border-red-500/30'
                        : requiresCurrencyConfirmation
                        ? 'bg-amber-400/5 border-amber-400/30'
                        : isDocumentReview
                        ? 'bg-sky-400/5 border-sky-400/25 hover:bg-sky-400/10 hover:border-sky-300/35'
                        : showIssueHeading
                        ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10 hover:border-red-500/30'
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
                      <div className="mb-3 flex min-w-0 items-start gap-3 sm:gap-4">
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
                              : isDocumentReview
                              ? 'bg-sky-400/10 border-sky-400/25'
                              : showIssueHeading
                              ? 'bg-red-500/10 border-red-500/20'
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
                              Processing receipt<motion.span
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
                          ) : isDocumentReview ? (
                            <>
                              <h3 className="mb-1 break-words text-lg font-bold text-white">{hasDisplayMerchant ? receipt.merchant : 'Purchase document'}</h3>
                              <p className="text-sm font-semibold text-sky-200">Document review</p>
                              <p className="mt-1 text-xs text-gray-400">This looks like purchase evidence rather than a standard receipt.</p>
                            </>
                          ) : showIssueHeading ? (
                            <>
                              <h3 className="text-lg font-bold mb-1 text-red-400">{receiptFailureDetails?.title}</h3>
                              <p className="text-sm text-gray-400">{receiptFailureDetails?.reason}</p>
                              {receiptFailureDetails?.advice && (
                                <p className="mt-1 text-xs text-gray-500">{receiptFailureDetails.advice}</p>
                              )}
                            </>
                          ) : (
                            <h3 className="mb-1 break-words text-lg font-bold text-white">
                              {receipt.merchant}
                            </h3>
                          )}

                          <div className="mt-1.5 flex flex-col items-start gap-1.5">
                            {purchaseDateDisplay && (
                              <p className="text-sm text-gray-400">
                                {purchaseDateDisplay}
                              </p>
                            )}
                            {!isFreshProcessing && !showIssueHeading && receipt.category && (
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${receipt.tagColor}`}>{receipt.category}</span>
                            )}
                            {returnWindowStatus.status === 'urgent' && !isFreshProcessing && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 rounded-full">
                                <Undo2 className="w-2.5 h-2.5 text-red-400" strokeWidth={2.5} />
                                <span className="text-red-400 text-[10px] font-bold">{returnWindowStatus.message}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {!isFreshProcessing && (
                          <div className="max-w-[46%] shrink-0 text-right">
                            {receipt.amountKnown ? (
                              <div className="break-words text-xl font-bold text-white sm:text-2xl">
                                {requiresCurrencyConfirmation || isStaleProcessing
                                  ? receipt.amount.toFixed(2)
                                  : hasPreferredCurrencyConversion && preferredCurrencyAmount !== undefined
                                    ? formatCurrency(preferredCurrencyAmount, accountCurrency.preferredCurrency)
                                    : formatCurrencyAmount(receipt.currency, receipt.amount)}
                              </div>
                            ) : (
                              <div className="max-w-32 text-sm font-semibold leading-tight text-gray-400">Amount not found</div>
                            )}
                            {receipt.amountKnown && hasPreferredCurrencyConversion ? (
                              <div className="break-words pt-1 text-[11px] text-gray-400 sm:text-xs">
                                {formatCurrencyAmount(receipt.currency, receipt.amount)} {receipt.currency.toUpperCase()} original
                              </div>
                            ) : null}
                            {requiresCurrencyConfirmation ? (
                              <div className="text-xs pt-1 text-amber-300">
                                Awaiting currency
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {isFreshProcessing && (
                      <div className="flex items-center gap-2 flex-wrap">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md text-teal-400 bg-teal-400/10 border-teal-400/30">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Processing in the background
                          </div>
                      </div>
                      )}
                    </button>

                    {showOpenOriginalReceiptAction && (
                      <div className="mt-3 flex items-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openReceiptOriginal(receipt).then((openedUrl) => {
                              if (!openedUrl) console.warn('No download URL available for this receipt');
                              else void recordReceiptOriginalView(receipt.id);
                            });
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-teal-300"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {isDocumentReview ? 'View original' : 'View receipt'}
                        </button>
                      </div>
                    )}

                    {isDocumentReview && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onReceiptClick(receipt)}
                          className="rounded-lg bg-sky-200 px-3 py-1.5 text-sm font-bold text-slate-950 transition-colors hover:bg-white"
                        >
                          Review details
                        </button>
                        {!receipt.amountKnown && (
                          <button
                            type="button"
                            onClick={() => void handleRetryReceipt(receipt.id)}
                            disabled={isDeleting || isConfirmingCurrency}
                            className="rounded-lg border border-sky-200/25 bg-black/20 px-3 py-1.5 text-sm font-semibold text-sky-100 transition-colors hover:bg-sky-300/10 disabled:opacity-50"
                          >
                            Try again
                          </button>
                        )}
                      </div>
                    )}

                    {showFailedReceiptActions && !isDocumentReview && (
                      <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (shouldRetryExistingReceipt) {
                                void handleRetryReceipt(receipt.id);
                                return;
                              }

                              if (receiptFailureDetails?.primaryAction === 'scan_sections') {
                                requestReceiptSectionCapture();
                              }
                              onNavigateToScan();
                            }}
                            disabled={isDeleting || isConfirmingCurrency}
                            className="px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isConfirmingCurrency ? 'Trying again...' : failurePrimaryActionLabel}
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
                            Report
                          </button>
                        </div>
                      </div>
                    )}

                    {requiresCurrencyConfirmation && (
                      <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-2 sm:items-end">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleCurrencyConfirmation(receipt.id, preferredReceiptCurrency)}
                                disabled={isConfirmingCurrency}
                                className="px-3 py-1.5 rounded-lg border border-amber-300/30 bg-black/20 text-sm font-semibold text-amber-100 hover:bg-amber-300/10 hover:border-amber-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {currencyConfirmationState?.receiptId === receipt.id
                                  && currencyConfirmationState.currency === preferredReceiptCurrency
                                  ? 'Saving...'
                                  : preferredReceiptCurrency}
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
                                className="w-full min-w-0 rounded-lg border border-amber-300/30 bg-black/30 px-3 py-2 text-sm font-semibold text-amber-50 outline-none transition-colors hover:border-amber-200/50 focus:border-amber-200/60 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto sm:min-w-[200px]"
                              >
                                <option value="" disabled className="bg-neutral-950 text-gray-400">
                                  Select currency
                                </option>
                                {orderedCurrencyConfirmationOptions.map((currencyOption) => (
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
              className="ri-scroll-viewport bg-black/80"
              onClick={() => !isDeleting && setDeleteConfirmOpen(false)}
            >
              <div className="ri-scroll-viewport__inner">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="mx-auto w-full min-w-0 max-w-sm rounded-2xl border border-white/10 bg-black/90 p-5 backdrop-blur-xl sm:p-6"
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
