import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Clock, Trash2, Tag, MapPin, CreditCard, FileText, Download, Undo2, ChevronDown, Pencil, Check } from 'lucide-react';
import { Receipt } from './WalletTab';
import { ReportProblemDialog } from './ReportProblemDialog';
import { useState, useEffect } from 'react';
import {
  confirmReceiptCurrency,
  deleteReceiptRecord,
  isFinalizedReceiptStatus,
  isReceiptCurrencyConfirmationOption,
  isReceiptStaleProcessing,
  needsCurrencyConfirmation,
  RECEIPT_CURRENCY_CONFIRMATION_OPTIONS,
  RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION,
  retryReceiptProcessing,
  generateProofPack,
  recordReceiptOriginalView,
  supabase,
} from '../../lib/supabase';
import type { ReceiptCurrencyConfirmationOption } from '../../lib/supabase';
import { hasReceiptOriginal, openReceiptOriginal } from '../../lib/receiptOriginalUtils';
import { getReturnWindowStatus } from '../../lib/returnWindowUtils';
import { getReceiptFailureDetails, getReceiptPurchaseDateDisplay } from '../../lib/receiptUiUtils';
import { useToast } from '../../contexts/ToastContext';
import { getCurrencyConfig } from '../../lib/currency';
import { useAuth } from '../../contexts/AuthContext';

const getCurrencySymbol = (currencyCode: string): string => {
  return getCurrencyConfig(currencyCode || 'GBP').symbol;
};

type ReceiptModalItem = NonNullable<Receipt['items']>[number];

interface ReceiptPaymentDisplay {
  id: string;
  amount: number;
  currencyCode?: string | null;
  label: string;
}

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

const getNonEmptyString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const getWebsiteHref = (website: string): string => (
  /^https?:\/\//i.test(website) ? website : `https://${website}`
);

const mapReceiptItemRow = (row: Record<string, unknown>): ReceiptModalItem => ({
  id: getNonEmptyString(row.id) || '',
  receiptId: getNonEmptyString(row.receipt_id) || '',
  lineIndex: getNullableNumber(row.line_index) ?? 0,
  description: getNonEmptyString(row.description),
  rawDescription: getNonEmptyString(row.raw_description),
  displayName: getNonEmptyString(row.display_name),
  brandName: getNonEmptyString(row.brand_name),
  itemType: getNonEmptyString(row.item_type),
  quantity: getNullableNumber(row.quantity),
  quantityUnit: getNonEmptyString(row.quantity_unit),
  unitPrice: getNullableNumber(row.unit_price),
  lineTotal: getNullableNumber(row.line_total),
  vatAmount: getNullableNumber(row.vat_amount),
  vatRate: getNullableNumber(row.vat_rate),
});

const mapReceiptPaymentRow = (row: Record<string, unknown>): ReceiptPaymentDisplay | null => {
  const amount = [
    row.amount,
    row.payment_amount,
    row.paid_amount,
    row.tender_amount,
  ]
    .map(getNullableNumber)
    .find((value): value is number => value !== null);

  if (amount === undefined) return null;

  const label = [
    row.payment_method,
    row.method,
    row.payment_type,
    row.tender_type,
    row.type,
    row.description,
  ]
    .map(getNonEmptyString)
    .find((value): value is string => value !== null) || 'Payment';

  const id = getNonEmptyString(row.id) || `${label}-${amount.toFixed(2)}`;

  return {
    id,
    amount,
    currencyCode: getNonEmptyString(row.currency),
    label,
  };
};

interface ReceiptModalProps {
  receipt: Receipt | null;
  onClose: () => void;
  onDelete?: () => void;
}

export function ReceiptModal({ receipt, onClose, onDelete }: ReceiptModalProps) {
  const { showToast } = useToast();
  const { accountCurrency } = useAuth();
  const preferredReceiptCurrency: ReceiptCurrencyConfirmationOption = isReceiptCurrencyConfirmationOption(accountCurrency.preferredCurrency)
    ? accountCurrency.preferredCurrency
    : RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION;
  const orderedCurrencyConfirmationOptions = [
    preferredReceiptCurrency,
    ...RECEIPT_CURRENCY_CONFIRMATION_OPTIONS.filter((currency) => currency !== preferredReceiptCurrency),
  ];
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showCompanyDetails, setShowCompanyDetails] = useState(false);
  const [detailReceiptId, setDetailReceiptId] = useState<string | null>(receipt?.id ?? null);
  const [receiptItems, setReceiptItems] = useState<ReceiptModalItem[]>([]);
  const [receiptPayments, setReceiptPayments] = useState<ReceiptPaymentDisplay[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [currencyConfirmationState, setCurrencyConfirmationState] = useState<{
    receiptId: string;
    currency: ReceiptCurrencyConfirmationOption;
  } | null>(null);
  const [processingAttemptStartedAt, setProcessingAttemptStartedAt] = useState<string | null>(null);
  const [showOtherCurrencyOptions, setShowOtherCurrencyOptions] = useState(false);
  const [showReportProblemDialog, setShowReportProblemDialog] = useState(false);
  const [isGeneratingProofPack, setIsGeneratingProofPack] = useState(false);
  const [displayMerchant, setDisplayMerchant] = useState(receipt?.merchant || '');
  const [isEditingMerchant, setIsEditingMerchant] = useState(false);
  const [merchantDraft, setMerchantDraft] = useState(receipt?.merchant || '');
  const [isSavingMerchant, setIsSavingMerchant] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemDisplayNameDraft, setItemDisplayNameDraft] = useState('');
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  useEffect(() => {
    setShowMoreDetails(false);
    setShowCompanyDetails(false);
    setShowOtherCurrencyOptions(false);
    setShowReportProblemDialog(false);
    setDisplayMerchant(receipt?.merchant || '');
    setMerchantDraft(receipt?.merchant || '');
    setIsEditingMerchant(false);
    setEditingItemId(null);
    setItemDisplayNameDraft('');
  }, [receipt?.id, receipt?.merchant]);

  useEffect(() => {
    setProcessingAttemptStartedAt(receipt?.processingAttemptStartedAt || null);
  }, [receipt?.id, receipt?.processingAttemptStartedAt]);

  useEffect(() => {
    if (!receipt?.id) {
      setDetailReceiptId(null);
      setReceiptItems([]);
      setReceiptPayments([]);
      setItemsLoading(false);
      setItemsLoaded(false);
      return;
    }

    let isCancelled = false;

    setDetailReceiptId(receipt.id);
    setReceiptItems([]);
    setReceiptPayments([]);
    setItemsLoading(true);
    setItemsLoaded(false);

    const loadReceiptDetails = async () => {
      const [itemsResult, paymentsResult] = await Promise.all([
        supabase
          .from('receipt_items')
          .select('*')
          .eq('receipt_id', receipt.id)
          .order('line_index', { ascending: true }),
        supabase
          .from('receipt_payments')
          .select('*')
          .eq('receipt_id', receipt.id),
      ]);

      if (isCancelled) return;

      if (itemsResult.error) {
        console.error('[ReceiptModal] receipt_items query error:', itemsResult.error);
        setReceiptItems([]);
      } else {
        setReceiptItems(
          (itemsResult.data || []).map((item) => mapReceiptItemRow(item as Record<string, unknown>))
        );
      }

      if (paymentsResult.error) {
        console.error('[ReceiptModal] receipt_payments query error:', paymentsResult.error);
        setReceiptPayments([]);
      } else {
        setReceiptPayments(
          (paymentsResult.data || [])
            .map((payment) => mapReceiptPaymentRow(payment as Record<string, unknown>))
            .filter((payment): payment is ReceiptPaymentDisplay => payment !== null)
        );
      }

      setItemsLoading(false);
      setItemsLoaded(true);
    };

    loadReceiptDetails();

    return () => {
      isCancelled = true;
    };
  }, [receipt?.id]);

  const handleDelete = async () => {
    if (!receipt) return;

    if (!confirm(`Delete receipt from ${receipt.merchant || 'Receipt (Seller Unknown)'}?`)) return;

    setIsDeleting(true);
    try {
      console.log('[Delete] Deleting receipt:', receipt.id);
      const { error: dbError } = await deleteReceiptRecord({
        receiptId: receipt.id,
        storagePath: receipt.storagePath,
        imageUrl: receipt.imageUrl,
      });

      if (dbError) {
        console.error('[Delete] Database deletion failed:', dbError);
        throw dbError;
      }

      console.log('[Delete] Receipt deleted successfully');
      onDelete?.();
      onClose();
    } catch (error) {
      console.error('[Delete] Error deleting receipt:', error);
      alert('Failed to delete receipt. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCurrencyConfirmation = async (currency: ReceiptCurrencyConfirmationOption) => {
    if (!receipt) return;
    const nextProcessingAttemptStartedAt = new Date().toISOString();
    const previousProcessingAttemptStartedAt = processingAttemptStartedAt;

    setCurrencyConfirmationState({ receiptId: receipt.id, currency });
    setProcessingAttemptStartedAt(nextProcessingAttemptStartedAt);

    try {
      const { error } = await confirmReceiptCurrency(receipt.id, currency);

      if (error) {
        console.error('[ReceiptModal] Error confirming receipt currency:', error);
        setProcessingAttemptStartedAt(previousProcessingAttemptStartedAt);
        showToast('Failed to confirm currency', receipt.merchant);
        return;
      }

      setShowOtherCurrencyOptions(false);
      showToast('Currency confirmed', `${receipt.merchant} - ${currency}`);
    } catch (error) {
      console.error('[ReceiptModal] Unexpected error confirming receipt currency:', error);
      setProcessingAttemptStartedAt(previousProcessingAttemptStartedAt);
      showToast('Failed to confirm currency', receipt.merchant);
    } finally {
      setCurrencyConfirmationState(null);
    }
  };

  const handleRetryReceipt = async () => {
    if (!receipt) return;

    const nextProcessingAttemptStartedAt = new Date().toISOString();
    const previousProcessingAttemptStartedAt = processingAttemptStartedAt;

    setCurrencyConfirmationState({
      receiptId: receipt.id,
      currency: RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION,
    });
    setProcessingAttemptStartedAt(nextProcessingAttemptStartedAt);

    try {
      const { error } = await retryReceiptProcessing(receipt.id);

      if (error) {
        console.error('[ReceiptModal] Error retrying receipt processing:', error);
        setProcessingAttemptStartedAt(previousProcessingAttemptStartedAt);
        showToast('Failed to retry upload', receipt.merchant);
        return;
      }

      showToast('Upload retry started', receipt.merchant);
    } catch (error) {
      console.error('[ReceiptModal] Unexpected error retrying receipt processing:', error);
      setProcessingAttemptStartedAt(previousProcessingAttemptStartedAt);
      showToast('Failed to retry upload', receipt.merchant);
    } finally {
      setCurrencyConfirmationState(null);
    }
  };

  const handleSaveMerchant = async () => {
    if (!receipt || isSavingMerchant) return;

    const nextMerchant = merchantDraft.trim();
    if (!nextMerchant || nextMerchant.length > 160) {
      showToast('Store name not saved', 'Use between 1 and 160 characters.');
      return;
    }

    setIsSavingMerchant(true);
    const { data, error } = await supabase
      .from('receipts')
      .update({ merchant: nextMerchant })
      .eq('id', receipt.id)
      .eq('user_id', receipt.userId)
      .select('merchant')
      .single();

    setIsSavingMerchant(false);
    if (error) {
      console.error('[ReceiptModal] Store name correction failed:', error);
      showToast('Store name not saved', 'Please try again.');
      return;
    }

    const savedMerchant = getNonEmptyString(data?.merchant) || nextMerchant;
    setDisplayMerchant(savedMerchant);
    setMerchantDraft(savedMerchant);
    setIsEditingMerchant(false);
    showToast('Store name updated');
  };

  const startEditingItem = (item: ReceiptModalItem) => {
    setEditingItemId(item.id);
    setItemDisplayNameDraft(
      item.displayName?.trim()
      || item.rawDescription?.trim()
      || item.description?.trim()
      || ''
    );
  };

  const handleSaveItemDisplayName = async (item: ReceiptModalItem) => {
    if (!receipt || !item.id || savingItemId) return;

    const nextDisplayName = itemDisplayNameDraft.trim();
    if (nextDisplayName.length > 160) {
      showToast('Item name not saved', 'Use no more than 160 characters.');
      return;
    }

    setSavingItemId(item.id);
    const { data, error } = await supabase
      .from('receipt_items')
      .update({ display_name: nextDisplayName || null })
      .eq('id', item.id)
      .eq('receipt_id', receipt.id)
      .select('id, display_name')
      .single();

    setSavingItemId(null);
    if (error) {
      console.error('[ReceiptModal] Item name correction failed:', error);
      showToast('Item name not saved', 'Please try again.');
      return;
    }

    const savedDisplayName = getNonEmptyString(data?.display_name);
    setReceiptItems((currentItems) => currentItems.map((currentItem) => (
      currentItem.id === item.id
        ? { ...currentItem, displayName: savedDisplayName }
        : currentItem
    )));
    setEditingItemId(null);
    setItemDisplayNameDraft('');
    showToast('Item name updated');
  };

  if (!receipt) return null;

  // --- LOGIC FIX: BETTER DATE HANDLING ---
  const getValidMoneyValue = (value?: number | null) => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
  );
  const formatMoney = (currencySymbol: string, value: number) => `${currencySymbol}${value.toFixed(2)}`;
  const formatOptionalMoney = (currencySymbol: string, value?: number | null) => (
    typeof value === 'number' && Number.isFinite(value) ? formatMoney(currencySymbol, value) : '—'
  );
  const formatOptionalDeductionMoney = (currencySymbol: string, value?: number | null) => (
    typeof value === 'number' && Number.isFinite(value) ? `-${formatMoney(currencySymbol, Math.abs(value))}` : '—'
  );
  const formatOptionalQuantity = (value?: number | null, quantityUnit?: string | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '—';
    }

    const formattedValue = new Intl.NumberFormat('en-GB', {
      maximumFractionDigits: 3,
      useGrouping: false,
    }).format(value);
    return quantityUnit ? `${formattedValue} ${quantityUnit}` : formattedValue;
  };
  const receiptCurrencyCode = receipt.currency?.toUpperCase() || 'GBP';
  const isStaleProcessing = isReceiptStaleProcessing(
    receipt.status,
    receipt.createdAt,
    processingAttemptStartedAt
  );
  const isProcessingReceipt = receipt.status === 'processing';
  const isFreshProcessing = isProcessingReceipt && !isStaleProcessing;
  const isNeedsInputReceipt = receipt.status === 'needs_input';
  const isNonFinalReceipt = isProcessingReceipt || isNeedsInputReceipt || receipt.status === 'needs_review' || receipt.status === 'rejected' || receipt.status === 'failed';
  const canEditStructuredReceipt = ['parsed', 'completed', 'needs_review'].includes(receipt.status || '');
  const requiresCurrencyConfirmation = needsCurrencyConfirmation(receipt.status, receipt.errorReason);
  const isConfirmingCurrency = currencyConfirmationState?.receiptId === receipt.id;
  const receiptCurrencySymbol = getCurrencySymbol(receipt.currency);
  const subtotal = getValidMoneyValue(receipt.subtotal);
  const vatAmount = getValidMoneyValue(receipt.vatAmount);
  const discountAmount = getValidMoneyValue(receipt.discountAmount);
  const originalTotal = getValidMoneyValue(receipt.amount);
  const gbpAmount = getValidMoneyValue(receipt.amount_gbp);
  const displayOriginalTotal = originalTotal ?? gbpAmount ?? 0;
  const displayOriginalCurrencySymbol = originalTotal !== null || receiptCurrencyCode === 'GBP' ? receiptCurrencySymbol : '£';
  const hasMeaningfulOriginalTotal = (originalTotal !== null && Math.abs(originalTotal) > 0)
    || (gbpAmount !== null && Math.abs(gbpAmount) > 0);
  const getReceiptItemGroup = (item: NonNullable<Receipt['items']>[number]) => {
    const normalizedType = item.itemType?.trim().toLowerCase();

    if (normalizedType === 'charge') return 'charge';
    if (normalizedType === 'discount') return 'discount';
    return 'product';
  };
  const getItemDisplayName = (item: ReceiptModalItem) => (
    item.displayName?.trim()
    || item.rawDescription?.trim()
    || item.description?.trim()
    || 'Unnamed item'
  );
  const isCurrentReceiptDetails = detailReceiptId === receipt.id;
  const activeReceiptItems = isCurrentReceiptDetails ? receiptItems : [];
  const activeReceiptPayments = isCurrentReceiptDetails ? receiptPayments : [];
  const normalizedReceiptItems = activeReceiptItems.filter((item) => {
    const hasDescription = [item.displayName, item.rawDescription, item.description, item.brandName]
      .some((value) => typeof value === 'string' && value.trim().length > 0);
    return hasDescription
      || getValidMoneyValue(item.quantity) !== null
      || getValidMoneyValue(item.unitPrice) !== null
      || getValidMoneyValue(item.lineTotal) !== null
      || getValidMoneyValue(item.vatAmount) !== null
      || getValidMoneyValue(item.vatRate) !== null;
  });
  const productItemsMissingPrices = normalizedReceiptItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (
      getReceiptItemGroup(item) === 'product'
      && getValidMoneyValue(item.unitPrice) === null
      && getValidMoneyValue(item.lineTotal) === null
    ));
  const fallbackProductItemIndex = (() => {
    if (productItemsMissingPrices.length !== 1 || subtotal === null) return null;

    const candidateIndex = productItemsMissingPrices[0].index;
    const explicitLineTotalSum = normalizedReceiptItems.reduce((sum, item, index) => {
      if (index === candidateIndex) return sum;

      const lineTotal = getValidMoneyValue(item.lineTotal);
      return lineTotal !== null ? sum + lineTotal : sum;
    }, 0);

    return Math.abs(subtotal - explicitLineTotalSum) < 0.01 ? candidateIndex : null;
  })();
  const displayReceiptItems = normalizedReceiptItems.map((item, index) => (
    index === fallbackProductItemIndex
      ? { ...item, unitPrice: 0, lineTotal: 0 }
      : item
  ));
  const purchaseDateDisplay = getReceiptPurchaseDateDisplay({
    status: receipt.status,
    date: receipt.date,
    format: 'long',
  });
  const receiptFailureDetails = getReceiptFailureDetails({
    status: receipt.status,
    errorReason: receipt.errorReason,
    date: receipt.date,
    createdAt: receipt.createdAt,
    processingAttemptStartedAt,
  });
  const isCompactFailedReceipt = Boolean(receiptFailureDetails) && !requiresCurrencyConfirmation && !isFreshProcessing;
  const hasReceiptItems = displayReceiptItems.length > 0;
  const showItemsLoadingState = !isCurrentReceiptDetails || itemsLoading || !itemsLoaded;
  const receiptItemSections = [
    {
      key: 'product',
      title: 'Items purchased',
      items: displayReceiptItems.filter((item) => getReceiptItemGroup(item) === 'product'),
    },
    {
      key: 'charge',
      title: 'Additional charges',
      items: displayReceiptItems.filter((item) => getReceiptItemGroup(item) === 'charge'),
    },
    {
      key: 'discount',
      title: 'Discounts',
      items: displayReceiptItems.filter((item) => getReceiptItemGroup(item) === 'discount'),
    },
  ].filter((section) => section.items.length > 0);
  const receiptBreakdownGridColumns = 'grid-cols-3 sm:grid-cols-[minmax(0,1.6fr)_70px_110px_110px]';
  const receiptBreakdownGridSpacing = 'gap-x-1.5 gap-y-2 px-3 sm:gap-x-3 sm:px-4';
  const heroMetadataChips = [
    receipt.orderNumber ? { label: `Order ${receipt.orderNumber}`, value: receipt.orderNumber, icon: FileText } : null,
    receipt.loyaltyMemberId ? { label: `Member ${receipt.loyaltyMemberId}`, value: receipt.loyaltyMemberId, icon: FileText } : null,
    receipt.cardLast4 ? { label: `**** ${receipt.cardLast4}`, icon: CreditCard } : null,
  ].filter((chip): chip is { label: string; value?: string; icon: typeof FileText } => chip !== null);
  // Build summary rows dynamically. Only include a discount row when a discount amount
  // exists (non-null and non-zero). This avoids showing an empty Discount line when
  // there is no discount on the receipt.
  const summaryRows = [
    { label: 'Subtotal', value: subtotal },
    // Conditionally include the discount entry. We check for a valid finite number
    // and ensure it's not zero before adding the row. If discountAmount is null
    // or zero, the row will be omitted entirely.
    ...(
      discountAmount !== null &&
      typeof discountAmount === 'number' &&
      Number.isFinite(discountAmount) &&
      discountAmount > 0
        ? [{ label: 'Discount', value: discountAmount, isDiscount: true }]
        : []
    ),
    { label: 'VAT', value: vatAmount },
  ];
  const visibleSummaryRows = summaryRows.filter((row) => (
    row.value !== null
    && (row.isDiscount || Math.abs(row.value) > 0)
  ));
  const moreDetails = [
    receipt.referenceNumber ? { label: 'Reference number', value: receipt.referenceNumber, icon: FileText } : null,
    receipt.invoiceNumber ? { label: 'Invoice number', value: receipt.invoiceNumber, icon: FileText } : null,
    receipt.customerNumber ? { label: 'Customer number', value: receipt.customerNumber, icon: FileText } : null,
    receipt.paymentMethod ? { label: 'Payment method', value: receipt.paymentMethod, icon: CreditCard } : null,
  ]
    .filter((detail): detail is { label: string; value: string; icon: typeof FileText } => detail !== null)
    .filter((detail, index, allDetails) => {
      const normalizedValue = detail.value.trim().toLowerCase();
      const duplicateInHero = heroMetadataChips.some((chip) => chip.value?.trim().toLowerCase() === normalizedValue);
      const firstMatchingIndex = allDetails.findIndex((candidate) => candidate.value.trim().toLowerCase() === normalizedValue);

      return !duplicateInHero && firstMatchingIndex === index;
    });
  const merchantCompanyName = receipt.merchant && receipt.merchant !== 'Receipt (Seller Unknown)'
    ? receipt.merchant
    : null;
  const primaryMerchantDetails = [
    merchantCompanyName ? { label: 'Store', value: merchantCompanyName } : null,
    receipt.merchantPhone ? { label: 'Phone', value: receipt.merchantPhone, href: `tel:${receipt.merchantPhone}` } : null,
    receipt.merchantEmail ? { label: 'Email', value: receipt.merchantEmail, href: `mailto:${receipt.merchantEmail}` } : null,
    receipt.merchantWebsite ? { label: 'Website', value: receipt.merchantWebsite, href: getWebsiteHref(receipt.merchantWebsite) } : null,
  ].filter((detail): detail is { label: string; value: string; href?: string } => detail !== null);
  const secondaryMerchantDetails = [
    receipt.merchantAddress ? { label: 'Address', value: receipt.merchantAddress } : null,
    receipt.merchantVatNumber ? { label: 'VAT number', value: receipt.merchantVatNumber } : null,
    receipt.merchantCompanyNumber ? { label: 'Company number', value: receipt.merchantCompanyNumber } : null,
  ].filter((detail): detail is { label: string; value: string; href?: string } => detail !== null);
  const hasCompanyDetails = primaryMerchantDetails.length > 0 || secondaryMerchantDetails.length > 0;
  const warrantyEndDate = receipt.warrantyDate ? new Date(receipt.warrantyDate) : null;
  const today = new Date();
  const isWarrantyActive = warrantyEndDate && warrantyEndDate > today;

  const returnWindowStatus = getReturnWindowStatus(receipt.returnDate);

  const hasOriginalReceipt = hasReceiptOriginal(receipt);
  const shouldHideBreakdownSection = isCompactFailedReceipt || (
    isNonFinalReceipt
    && !showItemsLoadingState
    && !hasReceiptItems
    && visibleSummaryRows.length === 0
    && activeReceiptPayments.length === 0
    && !hasMeaningfulOriginalTotal
  );
  const shouldShowReceiptBreakdown = !shouldHideBreakdownSection;
  const shouldShowHeroAmount = !isCompactFailedReceipt && (!isNonFinalReceipt || hasMeaningfulOriginalTotal);
  const heroAmountDisplay = shouldShowHeroAmount
    ? formatMoney(displayOriginalCurrencySymbol, displayOriginalTotal)
    : '—';

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    const openedUrl = await openReceiptOriginal(receipt);
    if (openedUrl) {
      void recordReceiptOriginalView(receipt.id);
      console.log('Opening original receipt in a signed viewer.');
    } else {
      console.warn('No download URL available for this receipt');
      showToast('We could not open the original receipt. Please try again.');
    }
  };

  const handleProofPack = async () => {
    if (!receipt) return;
    setIsGeneratingProofPack(true);
    try {
      const { data, error } = await generateProofPack(receipt.id);
      if (error || !data?.downloadUrl) throw error || new Error('Proof of purchase could not be generated');
      window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
      showToast('Proof of purchase ready', 'Opened in a new tab.');
    } catch (error) {
      console.error('[ReceiptModal] Proof of purchase error:', error);
      showToast('Proof of purchase unavailable', 'Please try again in a moment.');
    } finally {
      setIsGeneratingProofPack(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-2xl mx-4 mb-4 md:mb-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="backdrop-blur-xl bg-black/90 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(45,212,191,0.3)]">
            
            {/* --- HEADER --- */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Receipt</h2>
              <div className="flex items-center gap-2">
                {hasOriginalReceipt && isFinalizedReceiptStatus(receipt.status) && (
                  <motion.button
                    type="button"
                    onClick={() => void handleProofPack()}
                    disabled={isGeneratingProofPack}
                    whileTap={{ scale: 0.985 }}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition-colors hover:border-emerald-300/45 hover:text-white disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{isGeneratingProofPack ? 'Preparing...' : 'Proof of purchase'}</span>
                  </motion.button>
                )}
                {hasOriginalReceipt && (
                  <motion.button
                    type="button"
                    onClick={(event) => void handleDownloadClick(event)}
                    whileTap={{ scale: 0.985 }}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-gray-300 transition-colors hover:border-teal-400/30 hover:text-teal-300"
                    title="View receipt"
                  >
                    <Download className="w-4 h-4" />
                    <span>View receipt</span>
                  </motion.button>
                )}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10 px-3 text-red-300 transition-colors hover:border-red-400/40 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Delete receipt"
                  aria-label="Delete receipt"
                >
                  {isDeleting ? <Clock className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={onClose}
                  className="w-10 h-10 rounded-full backdrop-blur-md bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {isCompactFailedReceipt ? (
                <>
                  <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 flex-shrink-0 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                        {receipt.merchantIcon ? (
                          <receipt.merchantIcon className="w-8 h-8 text-red-300" strokeWidth={1.5} />
                        ) : (
                          <span className="text-2xl font-bold text-red-300">!</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-2xl font-bold text-white">{receiptFailureDetails?.title}</h3>
                        {receiptFailureDetails?.reason && (
                          <p className="mt-2 text-sm text-red-100/85">{receiptFailureDetails.reason}</p>
                        )}
                        {receiptFailureDetails?.advice && (
                          <p className="mt-1 text-sm text-red-100/60">{receiptFailureDetails.advice}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRetryReceipt()}
                        disabled={isDeleting || isConfirmingCurrency}
                        className="px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isConfirmingCurrency ? 'Retrying...' : 'Retry'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        disabled={isDeleting || isConfirmingCurrency}
                        className="px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReportProblemDialog(true)}
                        disabled={isDeleting || isConfirmingCurrency}
                        className="px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Report
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
              {/* --- MAIN CARD --- */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 flex-shrink-0 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                    {receipt.merchantIcon ? (
                       <receipt.merchantIcon className="w-8 h-8 text-teal-400" strokeWidth={1.5} />
                    ) : (
                       <span className="text-2xl font-bold text-teal-400">{(receipt.merchant || 'R').charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    {isEditingMerchant ? (
                      <div className="mb-2 flex max-w-xl items-center gap-2">
                        <input
                          value={merchantDraft}
                          onChange={(event) => setMerchantDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void handleSaveMerchant();
                            if (event.key === 'Escape') {
                              setMerchantDraft(displayMerchant);
                              setIsEditingMerchant(false);
                            }
                          }}
                          maxLength={160}
                          autoFocus
                          aria-label="Store name"
                          className="min-w-0 flex-1 rounded-lg border border-teal-400/40 bg-black/30 px-3 py-2 text-lg font-bold text-white outline-none focus:border-teal-300"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveMerchant()}
                          disabled={isSavingMerchant}
                          aria-label="Save store name"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-400/30 bg-teal-400/10 text-teal-300 transition-colors hover:bg-teal-400/15 disabled:opacity-50"
                        >
                          {isSavingMerchant ? <Clock className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMerchantDraft(displayMerchant);
                            setIsEditingMerchant(false);
                          }}
                          aria-label="Cancel store name edit"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition-colors hover:text-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="mb-1 flex items-start gap-2">
                        <h3 className="min-w-0 text-2xl font-bold text-white">{displayMerchant || 'Receipt (Seller Unknown)'}</h3>
                        {canEditStructuredReceipt && (
                          <button
                            type="button"
                            onClick={() => {
                              setMerchantDraft(displayMerchant);
                              setIsEditingMerchant(true);
                            }}
                            aria-label="Edit store name"
                            title="Edit store name"
                            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/5 hover:text-teal-300"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {receipt.status === 'needs_review' && receipt.summary && (
                      <p className="text-teal-400 text-sm mb-2">{receipt.summary}</p>
                    )}
                    {purchaseDateDisplay && (
                      <p className="text-gray-400 text-sm">{purchaseDateDisplay}</p>
                    )}
                    {receipt.location && (
                      <div className="flex items-center gap-1.5 mt-2 text-gray-400 text-xs">
                        <MapPin className="w-3 h-3" />
                        <span>{receipt.location}</span>
                      </div>
                    )}
                  </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-white">
                      {heroAmountDisplay}
                      </div>
                    {isNonFinalReceipt && !hasMeaningfulOriginalTotal && !isCompactFailedReceipt && (
                      <div className="text-sm pt-1 text-gray-500">
                        Still analyzing
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md ${receipt.tagColor || 'bg-white/5 border-white/10 text-gray-400'}`}>
                    <Tag className="w-4 h-4" />
                    {receipt.category || 'Receipt'}
                  </div>
                  {heroMetadataChips.map((chip) => {
                    const Icon = chip.icon;

                    return (
                      <div key={chip.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{chip.label}</span>
                      </div>
                    );
                  })}
                  {hasCompanyDetails && (
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowCompanyDetails((current) => !current)}
                      aria-expanded={showCompanyDetails}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20 transition-colors"
                    >
                      <span>Store details</span>
                      <motion.div
                        animate={{ rotate: showCompanyDetails ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </motion.div>
                    </motion.button>
                  )}
                  {moreDetails.length > 0 && (
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowMoreDetails((current) => !current)}
                      aria-expanded={showMoreDetails}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20 transition-colors"
                    >
                      <span>More</span>
                      <motion.div
                        animate={{ rotate: showMoreDetails ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </motion.div>
                    </motion.button>
                  )}
                </div>

                {receipt.status === 'needs_review' && (
                  <div className="mt-4 rounded-xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                    <p className="font-semibold">Document review</p>
                    <p className="mt-1 text-xs text-sky-100/75">This looks like a purchase document rather than a standard receipt. Keep it if it is useful to you.</p>
                  </div>
                )}

                <AnimatePresence>
                  {showCompanyDetails && hasCompanyDetails && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="space-y-2">
                          {primaryMerchantDetails.map((detail) => (
                            <div key={detail.label} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                {detail.label}
                              </div>
                              {detail.href ? (
                                <a
                                  href={detail.href}
                                  target={detail.label === 'Website' ? '_blank' : undefined}
                                  rel={detail.label === 'Website' ? 'noopener noreferrer' : undefined}
                                  className="text-sm font-semibold text-gray-200 break-all hover:text-white transition-colors sm:text-right"
                                >
                                  {detail.value}
                                </a>
                              ) : (
                                <div className="text-sm font-semibold text-gray-200 break-words sm:text-right">
                                  {detail.value}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {secondaryMerchantDetails.length > 0 && (
                          <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                            {secondaryMerchantDetails.map((detail) => (
                              <div key={detail.label} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  {detail.label}
                                </div>
                                <div className="text-sm font-semibold text-gray-200 break-words sm:text-right">
                                  {detail.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {showMoreDetails && moreDetails.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {moreDetails.map((detail) => {
                            const Icon = detail.icon;

                            return (
                              <div key={detail.label} className="rounded-xl bg-black/10 border border-white/10 px-4 py-3">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                                  <Icon className="w-3.5 h-3.5" />
                                  {detail.label}
                                </div>
                                <div className="text-sm font-semibold text-gray-200 break-all">{detail.value}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {requiresCurrencyConfirmation && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-200">Currency missing, please confirm</p>
                      <p className="text-xs text-amber-100/80">Choose the currency for this receipt to send it back into processing.</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCurrencyConfirmation(preferredReceiptCurrency)}
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
                          onClick={() => setShowOtherCurrencyOptions((currentValue) => !currentValue)}
                          disabled={isConfirmingCurrency}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            showOtherCurrencyOptions
                              ? 'border-amber-200/50 bg-amber-300/10 text-amber-50'
                              : 'border-amber-300/30 bg-black/20 text-amber-100 hover:bg-amber-300/10 hover:border-amber-200/50'
                          }`}
                        >
                          Other
                        </button>
                      </div>
                      {showOtherCurrencyOptions && (
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            const selectedCurrency = event.target.value;
                            if (isReceiptCurrencyConfirmationOption(selectedCurrency)) {
                              void handleCurrencyConfirmation(selectedCurrency);
                            }
                          }}
                          disabled={isConfirmingCurrency}
                          className="w-full min-w-[200px] rounded-lg border border-amber-300/30 bg-black/30 px-3 py-2 text-sm font-semibold text-amber-50 outline-none transition-colors hover:border-amber-200/50 focus:border-amber-200/60 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
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

              {(warrantyEndDate || receipt.returnDate) && (
                <section className="grid gap-3 sm:grid-cols-2">
                  {warrantyEndDate && <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-white"><Shield className="h-4 w-4 text-teal-300" />Warranty</div><p className="mt-2 text-sm text-gray-400">{isWarrantyActive ? `Ends ${warrantyEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : `Ended ${warrantyEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}</p></div>}
                  {receipt.returnDate && <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-white"><Undo2 className="h-4 w-4 text-teal-300" />Returns</div><p className="mt-2 text-sm text-gray-400">{returnWindowStatus.status === 'expired' ? `Ended ${new Date(receipt.returnDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : returnWindowStatus.message}</p></div>}
                </section>
              )}

              {/* --- BREAKDOWN SECTION --- */}
              {shouldShowReceiptBreakdown && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
                >
                  <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-teal-400" />
                    Items & payment
                  </h4>

                  {showItemsLoadingState ? (
                    <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="space-y-2 animate-pulse">
                        <div className="h-3 rounded bg-white/10" />
                        <div className="h-3 w-5/6 rounded bg-white/10" />
                        <div className="h-3 w-2/3 rounded bg-white/10" />
                      </div>
                      <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Items loading...
                      </div>
                    </div>
                  ) : hasReceiptItems ? (
                    <div className="mb-4 space-y-4">
                      {receiptItemSections.map((section) => (
                        <div key={section.key}>
                          <h5 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wide">{section.title}</h5>
                          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                            <div className={`hidden sm:grid ${receiptBreakdownGridColumns} ${receiptBreakdownGridSpacing} py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 border-b border-white/10`}>
                              <div>Description</div>
                              <div className="text-right">Qty</div>
                              <div className="text-right">Unit</div>
                              <div className="text-right">Total</div>
                            </div>
                            <div className="divide-y divide-white/10">
                              {section.items.map((item) => (
                                <div
                                  key={item.id || `${section.key}-${item.lineIndex}-${item.description ?? 'item'}`}
                                  className={`grid ${receiptBreakdownGridColumns} ${receiptBreakdownGridSpacing} items-start py-3`}
                                >
                                  <div className="col-span-3 min-w-0 sm:col-span-1">
                                    {editingItemId === item.id ? (
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          value={itemDisplayNameDraft}
                                          onChange={(event) => setItemDisplayNameDraft(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter') void handleSaveItemDisplayName(item);
                                            if (event.key === 'Escape') {
                                              setEditingItemId(null);
                                              setItemDisplayNameDraft('');
                                            }
                                          }}
                                          maxLength={160}
                                          autoFocus
                                          aria-label={`Item name for ${getItemDisplayName(item)}`}
                                          className="min-w-0 flex-1 rounded-md border border-teal-400/40 bg-black/30 px-2 py-1.5 text-sm font-semibold text-white outline-none focus:border-teal-300"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => void handleSaveItemDisplayName(item)}
                                          disabled={savingItemId === item.id}
                                          aria-label="Save item name"
                                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-teal-400/30 bg-teal-400/10 text-teal-300 disabled:opacity-50"
                                        >
                                          {savingItemId === item.id ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingItemId(null);
                                            setItemDisplayNameDraft('');
                                          }}
                                          aria-label="Cancel item name edit"
                                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-500 hover:text-white"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-start gap-1.5">
                                        <div className="min-w-0 flex-1">
                                          <div
                                            className="text-sm font-semibold leading-snug text-white break-words [word-break:normal] [overflow-wrap:break-word]"
                                            title={item.rawDescription?.trim() || item.description?.trim() || undefined}
                                          >
                                            {getItemDisplayName(item)}
                                          </div>
                                          {item.brandName?.trim() && (
                                            <div className="mt-0.5 text-xs text-gray-500">{item.brandName.trim()}</div>
                                          )}
                                        </div>
                                        {canEditStructuredReceipt && item.id && (
                                          <button
                                            type="button"
                                            onClick={() => startEditingItem(item)}
                                            aria-label={`Edit ${getItemDisplayName(item)}`}
                                            title="Edit item name"
                                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-white/5 hover:text-teal-300"
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    {(getValidMoneyValue(item.vatRate) !== null || getValidMoneyValue(item.vatAmount) !== null) && (
                                      <div className="text-xs text-gray-400 mt-1">
                                        {getValidMoneyValue(item.vatRate) !== null ? `VAT ${item.vatRate!.toFixed(2)}%` : 'VAT'}
                                        {getValidMoneyValue(item.vatAmount) !== null ? ` • ${formatMoney(receiptCurrencySymbol, item.vatAmount!)}` : ''}
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 self-start text-left text-xs text-gray-300 sm:text-right sm:text-sm whitespace-nowrap">
                                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:hidden">Qty</span>
                                    {formatOptionalQuantity(item.quantity, item.quantityUnit)}
                                  </div>
                                  <div className="min-w-0 self-start text-left text-xs text-gray-300 sm:text-right sm:text-sm whitespace-nowrap">
                                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:hidden">Unit</span>
                                    {section.key === 'discount'
                                      ? formatOptionalDeductionMoney(receiptCurrencySymbol, item.unitPrice)
                                      : formatOptionalMoney(receiptCurrencySymbol, item.unitPrice)}
                                  </div>
                                  <div className={`min-w-0 self-start text-right text-xs sm:text-sm font-semibold whitespace-nowrap ${section.key === 'discount' ? 'text-emerald-400' : 'text-white'}`}>
                                    <span className="mb-1 block text-left text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:hidden">Total</span>
                                    {section.key === 'discount'
                                      ? formatOptionalDeductionMoney(receiptCurrencySymbol, item.lineTotal)
                                      : formatOptionalMoney(receiptCurrencySymbol, item.lineTotal)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="h-px bg-white/10" />
                    </div>
                  ) : itemsLoaded && !isNonFinalReceipt ? (
                    <div className="mb-4 rounded-lg bg-white/5 p-4 text-sm text-gray-400">
                      Detailed items unavailable for this receipt
                    </div>
                  ) : null}

                  {(visibleSummaryRows.length > 0 || hasMeaningfulOriginalTotal) && (
                    <div className="space-y-2">
                      {visibleSummaryRows.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between text-gray-400 text-sm"
                        >
                          <span>{row.label}</span>
                          <span className={row.isDiscount ? 'text-emerald-400' : undefined}>
                            {row.isDiscount && row.value !== null
                              ? `-${formatMoney(receiptCurrencySymbol, Math.abs(row.value))}`
                              : formatOptionalMoney(receiptCurrencySymbol, row.value)}
                          </span>
                        </div>
                      ))}
                      {hasMeaningfulOriginalTotal && (
                        <div className="flex items-center justify-between text-white font-bold text-lg pt-2 border-t border-white/10">
                          <span>Total</span>
                          <span>{formatMoney(displayOriginalCurrencySymbol, displayOriginalTotal)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {activeReceiptPayments.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <h5 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wide">Payments</h5>
                      <div className="space-y-2">
                        {activeReceiptPayments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between text-sm text-gray-300"
                          >
                            <span>{payment.label}</span>
                            <span className="font-semibold text-white">
                              {formatMoney(getCurrencySymbol(payment.currencyCode || receipt.currency), payment.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

                </>
              )}

            </div>
          </div>

          <ReportProblemDialog
            isOpen={showReportProblemDialog}
            onClose={() => setShowReportProblemDialog(false)}
            receiptId={receipt.id}
            receiptMerchant={receipt.merchant}
            zIndexClassName="z-[80]"
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
