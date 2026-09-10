import { motion, AnimatePresence } from 'framer-motion';
import { Receipt as ReceiptIcon, Laptop, Coffee, Shirt, Search, X, ShoppingBag, Loader2, Car, Home, Plane, Zap, Utensils, Trash2, CheckSquare, Square, ChevronDown, Download, AlertCircle, ShieldCheck, AtSign, ScanLine, CopyCheck } from 'lucide-react';
import { ProtectionBadge } from './PurchaseProtection';
import type { LucideIcon } from 'lucide-react';
import { Fragment, useState, useEffect, useRef } from 'react';
import { ReportProblemDialog } from './ReportProblemDialog';
import { PurchaseProtectionFilter } from './PurchaseProtectionFilter';
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
import { isReceiptAmountKnown } from '../../lib/receiptAmountState';
import {
  getAnalyticsEligibleAmount,
  getAnalyticsMoneySummary,
  getCurrentCalendarMonthKey,
  isAnalyticsPurchaseCandidate,
} from '../../lib/receiptAnalytics';

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

type WalletReceiptSection = 'purchases' | 'attention' | 'not_receipts';

const isNotReceiptDocument = (receipt: Pick<Receipt, 'status' | 'errorReason' | 'documentType'>): boolean => (
  receipt.documentType === 'non_purchase_document'
  || (receipt.status === 'rejected' && receipt.errorReason === 'not_purchase_document')
);

const getWalletReceiptSection = (receipt: Receipt): WalletReceiptSection => {
  if (isNotReceiptDocument(receipt)) return 'not_receipts';
  if (['failed', 'error'].includes(receipt.status || '')) return 'attention';
  if (receipt.status === 'needs_review' || receipt.status === 'needs_input') return 'attention';
  if (getReturnWindowStatus(receipt.returnDate).status === 'urgent') return 'attention';
  return 'purchases';
};

const getWalletSectionRank = (receipt: Receipt): number => {
  const section = getWalletReceiptSection(receipt);
  if (section === 'purchases') return 0;
  if (section === 'attention') return 1;
  return 2;
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
  startInEditMode?: boolean;
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
  const [warrantyFilterActive, setWarrantyFilterActive] = useState(false);
  const [returnFilterActive, setReturnFilterActive] = useState(false);
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
  const [convertedAmounts, setConvertedAmounts] = useState<Map<string, number>>(new Map());
  const [convertedAmountsKey, setConvertedAmountsKey] = useState<string | null>(null);
  const convertedAmountsKeyRef = useRef<string | null>(null);
  const [possibleDuplicates, setPossibleDuplicates] = useState<PossibleDuplicateCandidate[]>([]);
  const [resolvingPossibleDuplicateId, setResolvingPossibleDuplicateId] = useState<string | null>(null);
  const [deletingPossibleDuplicateId, setDeletingPossibleDuplicateId] = useState<string | null>(null);
  const [resolvedPossibleDuplicateIds, setResolvedPossibleDuplicateIds] = useState<Set<string>>(new Set());
  const [showNonReceipts, setShowNonReceipts] = useState(false);
  const previousReceiptIdsRef = useRef<Set<string>>(new Set());
  const successfulReceiptIdsRef = useRef<Set<string>>(new Set());
  const isMilestoneTrackingReadyRef = useRef(false);
  const needsAttentionSectionRef = useRef<HTMLDivElement>(null);

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
    setConvertedAmountsKey(null);
    convertedAmountsKeyRef.current = null;
    setPossibleDuplicates([]);
    setResolvedPossibleDuplicateIds(new Set());
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
  const analyticsConversionKey = JSON.stringify([
    user?.id || '',
    accountCurrency.preferredCurrency,
    receipts.map((receipt) => [
      receipt.id,
      receipt.amountKnown ? receipt.amount : null,
      receipt.currency,
      receipt.date || null,
      receipt.status || null,
      receipt.errorReason || null,
      receipt.documentType || null,
    ]),
  ]);

  useEffect(() => {
    let active = true;
    const loadConvertedAmounts = async () => {
      if (convertedAmountsKeyRef.current !== analyticsConversionKey) {
        setConvertedAmounts(new Map());
        setConvertedAmountsKey(null);
      }
      const receiptsForConversion = filterVisibleWalletReceipts(dedupeWalletReceipts(receipts)).flatMap((receipt) => {
        const amount = getAnalyticsEligibleAmount({
          amount: receipt.amountKnown ? receipt.amount : null,
          status: receipt.status,
          errorReason: receipt.errorReason,
          documentType: receipt.documentType,
          merchant: receipt.merchant,
          transactionDate: receipt.date,
        });

        return amount === null ? [] : [{
          id: receipt.id,
          amount,
          currency: receipt.currency,
          transactionDate: receipt.date || null,
        }];
      });
      try {
        const converted = await convertReceiptAmounts(receiptsForConversion, accountCurrency.preferredCurrency);
        if (!active) return;
        setConvertedAmounts(converted.amounts);
      } catch (conversionError) {
        if (!active) return;
        console.error('[WalletTab] Could not prepare Wallet totals:', conversionError);
        setConvertedAmounts(new Map());
      } finally {
        if (active) {
          convertedAmountsKeyRef.current = analyticsConversionKey;
          setConvertedAmountsKey(analyticsConversionKey);
        }
      }
    };
    void loadConvertedAmounts();
    return () => { active = false; };
  }, [receipts, accountCurrency.preferredCurrency, analyticsConversionKey]);

  const currentMonthKey = getCurrentCalendarMonthKey();
  const walletAnalyticsReceipts = visibleReceipts.map((receipt) => ({
    id: receipt.id,
    amount: receipt.amountKnown ? receipt.amount : null,
    status: receipt.status,
    errorReason: receipt.errorReason,
    documentType: receipt.documentType,
    merchant: receipt.merchant,
    transactionDate: receipt.date,
  }));
  const currentMonthSummary = getAnalyticsMoneySummary(walletAnalyticsReceipts, convertedAmounts, currentMonthKey);
  const analyticsAmountsReady = !loading && convertedAmountsKey === analyticsConversionKey;
  const excludedThisMonthCount = currentMonthSummary.excludedCount;
  const spentThisMonth = currentMonthSummary.total;
  const averagePurchaseThisMonth = currentMonthSummary.average;
  const monthlyBudget = accountCurrency.monthlyBudgetCurrency === accountCurrency.preferredCurrency
    ? accountCurrency.monthlyBudgetAmount
    : null;
  const budgetUsed = monthlyBudget ? (spentThisMonth / monthlyBudget) * 100 : 0;
  const budgetProgress = Math.min(budgetUsed, 100);
  const attentionReceipts = visibleReceipts.filter((receipt) => getWalletReceiptSection(receipt) === 'attention');

  const uniqueCategories = Array.from(new Set(finalizedReceipts.map(r => r.category)));
  const categories = ['All', ...uniqueCategories];
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;

  const matchesReceiptFilters = (receipt: Receipt) => {
    const matchesSearch = !hasSearchQuery || receipt.searchText.includes(normalizedSearchQuery);
    const matchesCategory = !selectedCategory || selectedCategory === 'All' || receipt.category === selectedCategory;
    const hasActiveWarranty = receipt.warrantyDate && new Date(receipt.warrantyDate) > new Date();
    const returnWindowStatus = getReturnWindowStatus(receipt.returnDate);
    const hasActiveReturnWindow = returnWindowStatus.status === 'active' || returnWindowStatus.status === 'urgent';
    const matchesWarranty = !warrantyFilterActive || hasActiveWarranty;
    const matchesReturns = !returnFilterActive || hasActiveReturnWindow;
    return matchesSearch && matchesCategory && matchesWarranty && matchesReturns;
  };

  const filteredReceipts = visibleReceipts.filter(matchesReceiptFilters);
  const filteredNotReceipts = filteredReceipts.filter((receipt) => getWalletReceiptSection(receipt) === 'not_receipts');
  const filteredSavedPurchases = filteredReceipts.filter((receipt) => isAnalyticsPurchaseCandidate({
    status: receipt.status,
    documentType: receipt.documentType,
  }));
  const displayReceipts = filteredReceipts
    .filter((receipt) => showNonReceipts || getWalletReceiptSection(receipt) !== 'not_receipts')
    .sort((first, second) => getWalletSectionRank(first) - getWalletSectionRank(second));

  const possibleDuplicate = possibleDuplicates
    .filter((candidate) => !resolvedPossibleDuplicateIds.has(candidate.receipt_id))
    .map((candidate) => ({
      candidate,
      receipt: visibleReceipts.find((receipt) => receipt.id === candidate.receipt_id),
      existing: visibleReceipts.find((receipt) => receipt.id === candidate.possible_duplicate_of),
    }))
    .find((match) => match.receipt && match.existing);

  const showNeedsAttention = () => {
    setSearchQuery('');
    setSelectedCategory(null);
    setWarrantyFilterActive(false);
    setReturnFilterActive(false);
    window.requestAnimationFrame(() => {
      needsAttentionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

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

  const warrantyReceipts = finalizedReceipts.filter(r => r.warrantyDate && new Date(r.warrantyDate) > new Date());
  const activeReturnReceipts = finalizedReceipts.filter((receipt) => {
    const returnStatus = getReturnWindowStatus(receipt.returnDate).status;
    return returnStatus === 'active' || returnStatus === 'urgent';
  });

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
    setResolvedPossibleDuplicateIds((current) => new Set(current).add(receiptId));
    showToast('Saved separately', 'Both purchases remain in your Wallet.');
  };

  const handleDeletePossibleDuplicate = async (receiptId: string) => {
    const duplicateReceipt = receipts.find((receipt) => receipt.id === receiptId);
    if (!duplicateReceipt) return;
    if (!confirm(`Delete the possible duplicate from ${duplicateReceipt.merchant}? The existing receipt will be kept.`)) return;

    setDeletingPossibleDuplicateId(receiptId);
    const { error } = await deleteReceiptRecord({
      receiptId,
      storagePath: duplicateReceipt.storagePath,
      imageUrl: duplicateReceipt.imageUrl,
    });
    setDeletingPossibleDuplicateId(null);

    if (error) {
      console.error('[WalletTab] Could not delete possible duplicate:', error);
      showToast('Couldn’t delete duplicate', 'Please try again.');
      return;
    }

    setResolvedPossibleDuplicateIds((current) => new Set(current).add(receiptId));
    setPossibleDuplicates((current) => current.filter((candidate) => candidate.receipt_id !== receiptId));
    setReceipts((current) => current.filter((receipt) => receipt.id !== receiptId));
    showToast('Duplicate deleted', 'The existing receipt remains in your Wallet.');
  };

  return (
    <div className="ri-mobile-page mx-auto min-w-0 max-w-7xl px-4 pt-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-5 flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h1 className="min-w-0 text-3xl font-bold text-white">Receipts</h1>
            <div className="flex shrink-0 gap-2 md:hidden">
              <PurchaseProtectionFilter kind="warranty" active={warrantyFilterActive} count={warrantyReceipts.length} onToggle={() => { setWarrantyFilterActive(!warrantyFilterActive); setReturnFilterActive(false); }} />
              <PurchaseProtectionFilter kind="return" active={returnFilterActive} count={activeReturnReceipts.length} onToggle={() => { setReturnFilterActive(!returnFilterActive); setWarrantyFilterActive(false); }} />
            </div>
          </div>
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 md:max-w-2xl md:grid-cols-[auto_minmax(0,1fr)_auto]">
            <div className="hidden gap-2 md:flex">
              <PurchaseProtectionFilter kind="warranty" active={warrantyFilterActive} count={warrantyReceipts.length} onToggle={() => { setWarrantyFilterActive(!warrantyFilterActive); setReturnFilterActive(false); }} />
              <PurchaseProtectionFilter kind="return" active={returnFilterActive} count={activeReturnReceipts.length} onToggle={() => { setReturnFilterActive(!returnFilterActive); setWarrantyFilterActive(false); }} />
            </div>
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                aria-label="Search receipts"
                placeholder="Search receipts"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 pl-9 pr-9 text-sm text-white outline-none placeholder:text-gray-500 focus:border-teal-400/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear receipt search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={onNavigateToScan}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-teal-400 px-3 text-sm font-bold text-black shadow-[0_10px_30px_rgba(45,212,191,0.12)] transition-colors hover:bg-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:gap-2 sm:px-4"
            >
              <ScanLine className="h-5 w-5" strokeWidth={1.8} />
              <span className="lg:hidden">Quick scan</span>
              <span className="hidden lg:inline">Scan receipt</span>
            </motion.button>
          </div>
        </div>

        {attentionReceipts.length > 0 ? (
          <button
            type="button"
            onClick={showNeedsAttention}
            className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3.5 py-2 text-sm font-semibold text-amber-100 transition-colors hover:border-amber-200/35 hover:bg-amber-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
            aria-label={`${attentionReceipts.length} ${attentionReceipts.length === 1 ? 'purchase needs' : 'purchases need'} attention`}
          >
            <AlertCircle className="h-4 w-4" strokeWidth={1.8} />
            {attentionReceipts.length} {attentionReceipts.length === 1 ? 'needs' : 'need'} attention
          </button>
        ) : null}

        {possibleDuplicate ? (
          <section className="mb-4 rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-400/10 to-white/[0.025] p-5" aria-label="Possible duplicate receipt">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-xl border border-amber-300/25 bg-amber-400/10 p-2.5"><CopyCheck className="h-5 w-5 text-amber-200" strokeWidth={1.7} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">Possible duplicate</p>
                <h2 className="mt-1 break-words text-lg font-bold text-white">This looks similar to a receipt already saved.</h2>
                <p className="mt-1 text-sm leading-6 text-gray-400">Nothing has been removed. Compare the existing receipt or keep this as a separate purchase.</p>
                <div className="mt-4 grid gap-2 min-[520px]:grid-cols-3">
                  <button type="button" onClick={() => onReceiptClick(possibleDuplicate.existing!)} className="min-h-11 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/5">View existing</button>
                  <button type="button" disabled={resolvingPossibleDuplicateId === possibleDuplicate.receipt!.id} onClick={() => void handleSavePossibleDuplicateAnyway(possibleDuplicate.receipt!.id)} className="min-h-11 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-teal-300 disabled:opacity-50">{resolvingPossibleDuplicateId === possibleDuplicate.receipt!.id ? 'Saving…' : 'Save anyway'}</button>
                  <button type="button" disabled={deletingPossibleDuplicateId === possibleDuplicate.receipt!.id} onClick={() => void handleDeletePossibleDuplicate(possibleDuplicate.receipt!.id)} className="min-h-11 rounded-xl border border-red-300/25 bg-red-400/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-400/15 disabled:opacity-50">{deletingPossibleDuplicateId === possibleDuplicate.receipt!.id ? 'Deleting…' : 'Delete duplicate'}</button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <div className="mb-4 rounded-2xl border border-teal-300/25 bg-gradient-to-br from-teal-400/15 to-cyan-400/5 p-4 sm:p-5" aria-busy={!analyticsAmountsReady}>
          <div className="flex min-w-0 items-start gap-3"><div className="shrink-0 rounded-xl border border-teal-300/20 bg-teal-400/10 p-2.5"><ShieldCheck className="h-5 w-5 text-teal-200" strokeWidth={1.5} /></div><div className="min-w-0 flex-1"><div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-200 sm:text-xs sm:tracking-[0.16em]">This month</p><p className="mt-1 break-words text-lg font-bold text-white min-[380px]:text-xl sm:text-2xl">{analyticsAmountsReady ? `${formatCurrency(spentThisMonth, accountCurrency.preferredCurrency)} spent` : 'Calculating…'}</p></div><div className="min-w-0 text-right"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 sm:text-xs sm:tracking-[0.14em]">Average purchase</p><p className="mt-1 break-words text-base font-bold text-white sm:text-lg">{analyticsAmountsReady ? formatCurrency(averagePurchaseThisMonth, accountCurrency.preferredCurrency) : '—'}</p></div></div>{monthlyBudget ? <><p className="mt-3 text-sm text-gray-300">of {formatCurrency(monthlyBudget, accountCurrency.preferredCurrency, { maximumFractionDigits: 0, minimumFractionDigits: 0 })} budget</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">{analyticsAmountsReady ? <div className="h-full rounded-full bg-teal-400 transition-[width] duration-300" style={{ width: `${budgetProgress}%` }} /> : null}</div>{analyticsAmountsReady ? <p className="mt-1.5 text-xs text-gray-400">{budgetUsed.toFixed(1)}% used</p> : null}</> : null}{analyticsAmountsReady && excludedThisMonthCount > 0 ? <p className="mt-3 text-xs text-amber-100">{excludedThisMonthCount === 1 ? 'One purchase couldn’t be included in this total.' : `${excludedThisMonthCount} purchases couldn’t be included in this total.`}</p> : null}</div></div>
        </div>


        <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-xl sm:mb-4 sm:py-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category === 'All' ? null : category)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md transition-all ${
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

        {(warrantyFilterActive || returnFilterActive) && (
          <p role="status" className={`mb-2 text-xs font-semibold ${warrantyFilterActive ? 'text-teal-200' : 'text-rose-200'}`}>
            {warrantyFilterActive ? 'Active warranties' : 'Open return windows'}
          </p>
        )}
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2 sm:mb-4">
          <h2 className="text-xl font-bold text-white">
            {selectedReceipts.size > 0
              ? `${selectedReceipts.size} selected`
              : `${filteredSavedPurchases.length} saved ${filteredSavedPurchases.length === 1 ? 'purchase' : 'purchases'}`}
          </h2>
          <div className="relative flex max-w-full flex-wrap items-center justify-end gap-2">
            {selectMode && (
              <button
                type="button"
                onClick={() => setSelectedReceipts(new Set(filteredSavedPurchases.map((receipt) => receipt.id)))}
                disabled={filteredSavedPurchases.length === 0}
                className={`min-h-9 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-gray-200 transition-colors hover:border-teal-400/35 hover:text-teal-200 disabled:opacity-50 sm:px-3 sm:text-sm ${selectedReceipts.size > 0 ? 'hidden min-[380px]:inline-flex' : ''}`}
              >
                Select all
              </button>
            )}
            {selectedReceipts.size > 0 && (
              <>
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={isDeleting}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-red-500/50 bg-red-500/20 px-2.5 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm"
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
              className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
                selectMode
                  ? 'bg-teal-400/20 border border-teal-400/40 text-teal-400'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </motion.button>
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
          ) : displayReceipts.length === 0 && filteredNotReceipts.length === 0 ? (
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
              ) : selectedCategory || warrantyFilterActive || returnFilterActive ? (
                <>
                  <Search className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">{warrantyFilterActive ? 'No active warranties' : returnFilterActive ? 'No active return windows' : 'No receipts found'}</h3>
                  <p className="text-gray-400">Try adjusting your filters</p>
                </>
              ) : (
                <>
                  <ReceiptIcon className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">Your purchases will appear here.</h3>
                  <p className="mx-auto max-w-sm text-gray-400">Add your first receipt or use your private receipt email.</p>
                  <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                    <button type="button" onClick={onNavigateToScan} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-teal-300"><ScanLine className="h-4 w-4" strokeWidth={1.8} />Add receipt</button>
                    <button type="button" onClick={onNavigateToAlias} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/5"><AtSign className="h-4 w-4" strokeWidth={1.8} />View private receipt email</button>
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <div className="space-y-3">
              {displayReceipts.map((receipt, index) => {
                const section = getWalletReceiptSection(receipt);
                const previousSection = index > 0 ? getWalletReceiptSection(displayReceipts[index - 1]) : null;
                const startsSection = section !== previousSection;
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
                const isNotReceipt = isNotReceiptDocument(receipt);
                const hasDisplayMerchant = receipt.merchant.trim().toLowerCase() !== 'analyzing...';
                const isNonFinalReceipt = isProcessing || isNeedsInput || receipt.status === 'needs_review' || receipt.status === 'rejected' || receipt.status === 'failed' || receipt.status === 'error';
                const requiresCurrencyConfirmation = needsCurrencyConfirmation(receipt.status, receipt.errorReason);
                const isConfirmingCurrency = currencyConfirmationState?.receiptId === receipt.id;
                const returnWindowStatus = getReturnWindowStatus(receipt.returnDate);
                const hasActiveWarranty = Boolean(receipt.warrantyDate && new Date(receipt.warrantyDate) > new Date());
                const hasActiveReturn = returnWindowStatus.status === 'active' || returnWindowStatus.status === 'urgent';
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
                const shouldRetryExistingReceipt = !isNotReceipt && receiptFailureDetails?.primaryAction === 'retry';
                const failurePrimaryActionLabel = isNotReceipt
                  ? 'Try another file'
                  : receiptFailureDetails?.primaryAction === 'scan_sections'
                  ? 'Scan in sections'
                  : receiptFailureDetails?.primaryAction === 'replace'
                    ? 'Try another file'
                    : 'Try again';
                const receiptCurrencyCode = receipt.currency?.toUpperCase() || '';
                const hasPreferredCurrencyConversion = (
                  isFinalizedReceiptStatus(receipt.status)
                  && receiptCurrencyCode !== accountCurrency.preferredCurrency
                  && convertedAmounts.has(receipt.id)
                );
                const preferredCurrencyAmount = convertedAmounts.get(receipt.id);

                return (
                  <Fragment key={receipt.id}>
                    {startsSection && section === 'attention' ? (
                      <div ref={needsAttentionSectionRef} className="scroll-mt-24 pb-1 pt-5">
                        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-amber-200">Needs attention</h2>
                        <p className="mt-1 text-xs text-gray-500">Only purchases that need a quick decision appear here.</p>
                      </div>
                    ) : null}
                    {startsSection && section === 'not_receipts' ? (
                      <div className="pb-1 pt-5">
                        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-gray-500">Not receipts</h2>
                      </div>
                    ) : null}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.18), ease: [0.22, 1, 0.36, 1] }}
                    whileHover={isFreshProcessing ? undefined : { y: -2 }}
                    className={`w-full backdrop-blur-xl border rounded-xl px-4 py-3 sm:px-5 transition-all text-left relative ${
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
                      <div className={`mb-1.5 flex min-w-0 items-start gap-3 sm:gap-4 ${isDocumentReview ? 'flex-wrap min-[380px]:flex-nowrap' : ''}`}>
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
                              <p className="text-sm font-semibold text-sky-200">{receipt.amountKnown ? 'Purchase details uncertain' : 'Amount not found'}</p>
                              <p className="mt-1 text-xs text-gray-400">{receipt.amountKnown ? 'Check the details we could not confirm.' : 'Add the amount shown on the original.'}</p>
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
                            {!isFreshProcessing && !showIssueHeading && (receipt.category || receipt.cardLast4) && (
                              <div className="flex flex-wrap items-center gap-2">
                                {receipt.category ? (
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${receipt.tagColor}`}>{receipt.category}</span>
                                ) : null}
                                {receipt.cardLast4 ? (
                                  <span className="inline-flex rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-gray-400">•••• {receipt.cardLast4}</span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                        {!isFreshProcessing && (receipt.amountKnown || !isDocumentReview) && (
                          <div className={isDocumentReview
                            ? 'w-full pl-[60px] text-left min-[380px]:w-auto min-[380px]:max-w-[46%] min-[380px]:shrink-0 min-[380px]:pl-0 min-[380px]:text-right'
                            : 'max-w-[46%] shrink-0 text-right'}>
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

                      {!isFreshProcessing && !showIssueHeading && (hasActiveWarranty || hasActiveReturn) && (
                        <div className="flex flex-wrap items-center gap-1.5 sm:pl-16">
                          {hasActiveWarranty && <ProtectionBadge kind="warranty">Active</ProtectionBadge>}
                          {hasActiveReturn && <ProtectionBadge kind="return" urgent={returnWindowStatus.status === 'urgent'}>Return: {returnWindowStatus.message}</ProtectionBadge>}
                        </div>
                      )}

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
                          {isNotReceipt ? 'View document' : isDocumentReview ? 'View original' : 'View receipt'}
                        </button>
                      </div>
                    )}

                    {isDocumentReview && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onReceiptClick({ ...receipt, startInEditMode: true })}
                          className="rounded-lg bg-sky-200 px-3 py-1.5 text-sm font-bold text-slate-950 transition-colors hover:bg-white"
                        >
                          {receipt.amountKnown ? 'Review details' : 'Add amount'}
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

                              if (!isNotReceipt && receiptFailureDetails?.primaryAction === 'scan_sections') {
                                requestReceiptSectionCapture();
                              }
                              onNavigateToScan();
                            }}
                            disabled={isDeleting || isConfirmingCurrency}
                            className={isNotReceipt
                              ? 'rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-sm font-semibold text-gray-200 transition-colors hover:border-white/25 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50'
                              : 'px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'}
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
                            className={isNotReceipt
                              ? 'px-3 py-1.5 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50'
                              : 'px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'}
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
                  </Fragment>
                );
              })}
            </div>
          )}
        </AnimatePresence>

        {filteredNotReceipts.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowNonReceipts((current) => !current)}
            className="mt-5 flex min-h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left text-sm font-semibold text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
            aria-expanded={showNonReceipts}
          >
            <span>Not receipts · {filteredNotReceipts.length}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showNonReceipts ? 'rotate-180' : ''}`} />
          </button>
        ) : null}

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
