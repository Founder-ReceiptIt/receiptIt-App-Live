import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Clock, Trash2, Tag, MapPin, CreditCard, FileText, Undo2, ChevronDown, MoreHorizontal } from 'lucide-react';
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
  onCaptureAgain?: (inSections: boolean) => void;
}

export function ReceiptModal({ receipt, onClose, onDelete, onCaptureAgain }: ReceiptModalProps) {
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
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [displayMerchant, setDisplayMerchant] = useState(receipt?.merchant || '');
  const [merchantDraft, setMerchantDraft] = useState(receipt?.merchant || '');
  const [displayAmount, setDisplayAmount] = useState<number | null>(receipt?.amountKnown ? receipt.amount : null);
  const [amountDraft, setAmountDraft] = useState(receipt?.amountKnown ? receipt.amount.toFixed(2) : '');
  const [itemDisplayNameDrafts, setItemDisplayNameDrafts] = useState<Record<string, string>>({});
  const [isSavingReceiptEdits, setIsSavingReceiptEdits] = useState(false);

  useEffect(() => {
    setShowMoreDetails(false);
    setShowCompanyDetails(false);
    setShowOtherCurrencyOptions(false);
    setShowReportProblemDialog(false);
    setIsActionMenuOpen(false);
    setIsEditMode(false);
    setDisplayMerchant(receipt?.merchant || '');
    setMerchantDraft(receipt?.merchant || '');
    setDisplayAmount(receipt?.amountKnown ? receipt.amount : null);
    setAmountDraft(receipt?.amountKnown ? receipt.amount.toFixed(2) : '');
    setItemDisplayNameDrafts({});
  }, [receipt?.id, receipt?.merchant, receipt?.amount, receipt?.amountKnown]);

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
      console.log('[Delete] Deleting receipt');
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
        showToast('Couldn’t try again', receipt.merchant);
        return;
      }

      showToast('Trying receipt again', receipt.merchant);
    } catch (error) {
      console.error('[ReceiptModal] Unexpected error retrying receipt processing:', error);
      setProcessingAttemptStartedAt(previousProcessingAttemptStartedAt);
      showToast('Couldn’t try again', receipt.merchant);
    } finally {
      setCurrencyConfirmationState(null);
    }
  };

  const getEditableItemName = (item: ReceiptModalItem) => (
    item.displayName?.trim()
    || item.rawDescription?.trim()
    || item.description?.trim()
    || ''
  );

  const startEditingReceipt = () => {
    setMerchantDraft(displayMerchant);
    setAmountDraft(displayAmount !== null ? displayAmount.toFixed(2) : '');
    setItemDisplayNameDrafts(Object.fromEntries(
      receiptItems
        .filter((item) => item.id)
        .map((item) => [item.id, getEditableItemName(item)])
    ));
    setIsActionMenuOpen(false);
    setIsEditMode(true);
  };

  const cancelEditingReceipt = () => {
    setMerchantDraft(displayMerchant);
    setAmountDraft(displayAmount !== null ? displayAmount.toFixed(2) : '');
    setItemDisplayNameDrafts({});
    setIsEditMode(false);
  };

  const handleSaveReceiptEdits = async () => {
    if (!receipt || isSavingReceiptEdits) return;

    const nextMerchant = merchantDraft.trim();
    if (!nextMerchant || nextMerchant.length > 160) {
      showToast('Receipt not updated', 'Use a store name between 1 and 160 characters.');
      return;
    }

    const isDocumentReview = receipt.status === 'needs_review';
    const nextAmount = isDocumentReview && amountDraft.trim() !== '' ? Number(amountDraft) : displayAmount;
    if (isDocumentReview && (nextAmount === null || !Number.isFinite(nextAmount) || nextAmount < 0 || nextAmount > 1_000_000)) {
      showToast('Purchase not kept', 'Enter the amount shown on the original purchase document.');
      return;
    }

    const changedItems = receiptItems
      .filter((item) => item.id)
      .map((item) => ({
        item,
        nextDisplayName: (itemDisplayNameDrafts[item.id] ?? getEditableItemName(item)).trim(),
      }))
      .filter(({ item, nextDisplayName }) => nextDisplayName !== getEditableItemName(item));

    if (changedItems.some(({ nextDisplayName }) => nextDisplayName.length > 160)) {
      showToast('Receipt not updated', 'Use item names of no more than 160 characters.');
      return;
    }

    setIsSavingReceiptEdits(true);
    const merchantChanged = nextMerchant !== displayMerchant;
    const amountChanged = isDocumentReview && nextAmount !== displayAmount;
    const receiptResult = merchantChanged || amountChanged || isDocumentReview
      ? await supabase
          .from('receipts')
          .update({
            merchant: nextMerchant,
            ...(isDocumentReview ? {
              amount: nextAmount,
              status: 'parsed',
              error_reason: null,
            } : {}),
          })
          .eq('id', receipt.id)
          .eq('user_id', receipt.userId)
          .select('merchant, amount, status')
          .single()
      : { data: { merchant: displayMerchant, amount: displayAmount, status: receipt.status }, error: null };

    const itemResults = await Promise.all(changedItems.map(async ({ item, nextDisplayName }) => {
      const result = await supabase
        .from('receipt_items')
        .update({ display_name: nextDisplayName || null })
        .eq('id', item.id)
        .eq('receipt_id', receipt.id)
        .select('id, display_name')
        .single();

      return { itemId: item.id, nextDisplayName, ...result };
    }));

    setIsSavingReceiptEdits(false);

    if (receiptResult.error || itemResults.some((result) => result.error)) {
      console.error('[ReceiptModal] Receipt correction failed:', {
        receiptError: receiptResult.error,
        itemErrors: itemResults.filter((result) => result.error).map((result) => result.error),
      });
      showToast('Receipt not fully updated', 'Please check your changes and try again.');
      return;
    }

    const savedMerchant = getNonEmptyString(receiptResult.data?.merchant) || nextMerchant;
    const savedAmount = getNullableNumber(receiptResult.data?.amount) ?? nextAmount;
    const savedItemNames = new Map(itemResults.map((result) => [
      result.itemId,
      getNonEmptyString(result.data?.display_name),
    ]));

    setDisplayMerchant(savedMerchant);
    setMerchantDraft(savedMerchant);
    setDisplayAmount(savedAmount);
    setAmountDraft(savedAmount !== null ? savedAmount.toFixed(2) : '');
    setReceiptItems((currentItems) => currentItems.map((item) => (
      savedItemNames.has(item.id)
        ? { ...item, displayName: savedItemNames.get(item.id) || null }
        : item
    )));
    setItemDisplayNameDrafts({});
    setIsEditMode(false);
    showToast(isDocumentReview ? 'Purchase kept' : 'Receipt updated');
    if (isDocumentReview) onClose();
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
  const originalTotal = getValidMoneyValue(displayAmount);
  const displayOriginalTotal = originalTotal ?? 0;
  const displayOriginalCurrencySymbol = originalTotal !== null || receiptCurrencyCode === 'GBP' ? receiptCurrencySymbol : '£';
  const hasKnownOriginalTotal = originalTotal !== null;
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
  const shouldRetryExistingReceipt = receiptFailureDetails?.primaryAction === 'retry';
  const failurePrimaryActionLabel = receiptFailureDetails?.primaryAction === 'scan_sections'
    ? 'Scan in sections'
    : receiptFailureDetails?.primaryAction === 'replace'
      ? 'Choose another file'
      : 'Try again';
  const isDocumentReview = receipt.status === 'needs_review';
  const isCompactFailedReceipt = Boolean(receiptFailureDetails) && !requiresCurrencyConfirmation && !isFreshProcessing && !isDocumentReview;
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
  const receiptBreakdownGridColumns = 'grid-cols-[repeat(3,minmax(0,1fr))] sm:grid-cols-[minmax(0,1.6fr)_70px_110px_110px]';
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
  const originalActionLabel = isDocumentReview ? 'View original' : 'View receipt';
  const shouldHideBreakdownSection = isCompactFailedReceipt || (
    isNonFinalReceipt
    && !showItemsLoadingState
    && !hasReceiptItems
    && visibleSummaryRows.length === 0
    && activeReceiptPayments.length === 0
    && !hasKnownOriginalTotal
  );
  const shouldShowReceiptBreakdown = !shouldHideBreakdownSection;
  const shouldShowHeroAmount = !isCompactFailedReceipt && (!isNonFinalReceipt || hasKnownOriginalTotal || isDocumentReview);
  const heroAmountDisplay = shouldShowHeroAmount
    ? hasKnownOriginalTotal
      ? formatMoney(displayOriginalCurrencySymbol, displayOriginalTotal)
      : 'Amount not found'
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
        className="fixed inset-0 z-50 flex min-w-0 items-end justify-center overflow-x-hidden md:items-center"
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
          className="relative mb-[max(0.5rem,var(--ri-safe-bottom))] mx-1 w-full min-w-0 max-w-[calc(100vw-0.5rem)] sm:mx-4 sm:max-w-2xl md:mb-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0 rounded-3xl border border-white/10 bg-black/90 shadow-[0_0_60px_rgba(45,212,191,0.3)] backdrop-blur-xl">
            
            {/* --- HEADER --- */}
            <div className="relative flex min-w-0 flex-wrap items-center gap-1.5 border-b border-white/10 p-3 sm:gap-2 sm:p-6">
              <h2 className="mr-auto shrink-0 text-xl font-bold text-white sm:text-2xl">Receipt</h2>
              <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
                {hasOriginalReceipt && (
                  <motion.button
                    type="button"
                    onClick={(event) => void handleDownloadClick(event)}
                    whileTap={{ scale: 0.985 }}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 text-xs font-semibold text-gray-200 transition-colors hover:border-teal-400/30 hover:text-teal-300 sm:gap-2 sm:px-4 sm:text-sm"
                    title={originalActionLabel}
                    aria-label={originalActionLabel}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span>{originalActionLabel}</span>
                  </motion.button>
                )}
                <div className="shrink-0">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setIsActionMenuOpen((current) => !current)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300 transition-colors hover:border-white/20 hover:text-white"
                    title="Receipt actions"
                    aria-label="Receipt actions"
                    aria-haspopup="menu"
                    aria-expanded={isActionMenuOpen}
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </motion.button>

                </div>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={onClose}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-400 backdrop-blur-md transition-colors hover:border-white/20 hover:text-white"
                  title="Close receipt"
                  aria-label="Close receipt"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
              <AnimatePresence>
                {isActionMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.14 }}
                    role="menu"
                    className="absolute right-3 top-full z-30 mt-2 w-56 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-white/10 bg-neutral-950/95 p-1.5 shadow-2xl backdrop-blur-xl sm:right-6"
                  >
                    {hasOriginalReceipt && isFinalizedReceiptStatus(receipt.status) && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsActionMenuOpen(false);
                          void handleProofPack();
                        }}
                        disabled={isGeneratingProofPack}
                        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-200 transition-colors hover:bg-white/5 disabled:opacity-50"
                      >
                        <FileText className="h-4 w-4 text-emerald-300" />
                        {isGeneratingProofPack ? 'Preparing...' : 'Proof of purchase'}
                      </button>
                    )}
                    {canEditStructuredReceipt && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={startEditingReceipt}
                        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-200 transition-colors hover:bg-white/5"
                      >
                        <FileText className="h-4 w-4 text-teal-300" />
                        {isDocumentReview ? 'Review details' : 'Edit receipt'}
                      </button>
                    )}
                    {isDocumentReview && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsActionMenuOpen(false);
                          setShowReportProblemDialog(true);
                        }}
                        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5"
                      >
                        <FileText className="h-4 w-4 text-gray-400" />
                        Report a problem
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsActionMenuOpen(false);
                        void handleDelete();
                      }}
                      disabled={isDeleting}
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-300 transition-colors hover:bg-red-400/10 disabled:opacity-50"
                    >
                      {isDeleting ? <Clock className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      {isDeleting ? 'Deleting...' : 'Delete receipt'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="ri-dialog-body-height min-w-0 space-y-6 overflow-x-hidden overflow-y-auto p-3 sm:p-6">
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
                        onClick={() => {
                          if (shouldRetryExistingReceipt) {
                            void handleRetryReceipt();
                            return;
                          }

                          onCaptureAgain?.(receiptFailureDetails?.primaryAction === 'scan_sections');
                        }}
                        disabled={isDeleting || isConfirmingCurrency}
                        className="px-3 py-1.5 rounded-lg border border-red-300/30 bg-black/20 text-sm font-semibold text-red-100 hover:bg-red-300/10 hover:border-red-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isConfirmingCurrency ? 'Trying again...' : failurePrimaryActionLabel}
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
              {isEditMode && (
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-400/25 bg-teal-400/10 px-3 py-3 sm:px-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-teal-100">{isDocumentReview ? 'Review purchase details' : 'Edit receipt'}</p>
                    <p className="mt-0.5 text-xs text-teal-100/65">Changes update your saved details, not the original.</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelEditingReceipt}
                      disabled={isSavingReceiptEdits}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 px-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveReceiptEdits()}
                      disabled={isSavingReceiptEdits}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-teal-400 px-3 text-sm font-bold text-black transition-colors hover:bg-teal-300 disabled:opacity-50"
                    >
                      {isSavingReceiptEdits ? 'Saving...' : isDocumentReview ? 'Keep purchase' : 'Save changes'}
                    </button>
                  </div>
                </div>
              )}

              {/* --- MAIN CARD --- */}
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
                <div className="mb-6 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 sm:h-16 sm:w-16">
                    {receipt.merchantIcon ? (
                       <receipt.merchantIcon className="w-8 h-8 text-teal-400" strokeWidth={1.5} />
                    ) : (
                       <span className="text-2xl font-bold text-teal-400">{(receipt.merchant || 'R').charAt(0)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {isEditMode ? (
                      <div className="mb-2 min-w-0 max-w-xl">
                        <label htmlFor={`receipt-merchant-${receipt.id}`} className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          Store name
                        </label>
                        <input
                          id={`receipt-merchant-${receipt.id}`}
                          value={merchantDraft}
                          onChange={(event) => setMerchantDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void handleSaveReceiptEdits();
                            if (event.key === 'Escape') cancelEditingReceipt();
                          }}
                          maxLength={160}
                          aria-label="Store name"
                          className="w-full min-w-0 rounded-lg border border-teal-400/40 bg-black/30 px-3 py-2 text-lg font-bold text-white outline-none focus:border-teal-300"
                        />
                      </div>
                    ) : (
                      <h3 className="mb-1 min-w-0 break-words text-2xl font-bold text-white [overflow-wrap:anywhere]">
                        {displayMerchant || 'Receipt (Seller Unknown)'}
                      </h3>
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
                    <div className="col-span-2 min-w-0 justify-self-end text-right sm:col-span-1 sm:row-start-1">
                    {isEditMode && isDocumentReview ? (
                      <div className="ml-auto w-full max-w-52 text-left sm:text-right">
                        <label htmlFor={`receipt-amount-${receipt.id}`} className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          Purchase amount ({receiptCurrencyCode})
                        </label>
                        <input
                          id={`receipt-amount-${receipt.id}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="1000000"
                          step="0.01"
                          value={amountDraft}
                          onChange={(event) => setAmountDraft(event.target.value)}
                          aria-label="Purchase amount"
                          className="w-full min-w-0 rounded-lg border border-teal-400/40 bg-black/30 px-3 py-2 text-right text-xl font-bold text-white outline-none focus:border-teal-300"
                        />
                      </div>
                    ) : (
                      <div className={`break-words font-bold text-white [overflow-wrap:anywhere] ${hasKnownOriginalTotal ? 'text-3xl' : 'max-w-48 text-base leading-tight'}`}>
                        {heroAmountDisplay}
                      </div>
                    )}
                    {['AUD', 'USD', 'CAD', 'NZD'].includes(receiptCurrencyCode) ? (
                      <div className="pt-1 text-xs font-semibold text-gray-500">{receiptCurrencyCode}</div>
                    ) : null}
                    {isNonFinalReceipt && !hasKnownOriginalTotal && !isCompactFailedReceipt && !isDocumentReview && (
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
                    <p className="mt-1 text-xs text-sky-100/75">This looks like purchase evidence rather than a standard receipt. Check the details, then keep it if it is useful to you.</p>
                    {!isEditMode && (
                      <button
                        type="button"
                        onClick={startEditingReceipt}
                        className="mt-3 rounded-lg bg-sky-200 px-3 py-1.5 text-sm font-bold text-slate-950 transition-colors hover:bg-white"
                      >
                        Review details
                      </button>
                    )}
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
                          <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
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
                                    {isEditMode && item.id ? (
                                      <div className="min-w-0">
                                        <label htmlFor={`receipt-item-${item.id}`} className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                                          Item name
                                        </label>
                                        <input
                                          id={`receipt-item-${item.id}`}
                                          value={itemDisplayNameDrafts[item.id] ?? getItemDisplayName(item)}
                                          onChange={(event) => setItemDisplayNameDrafts((currentDrafts) => ({
                                            ...currentDrafts,
                                            [item.id]: event.target.value,
                                          }))}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Escape') cancelEditingReceipt();
                                          }}
                                          maxLength={160}
                                          aria-label={`Item name for ${getItemDisplayName(item)}`}
                                          className="w-full min-w-0 rounded-md border border-teal-400/40 bg-black/30 px-2 py-1.5 text-sm font-semibold text-white outline-none focus:border-teal-300"
                                        />
                                      </div>
                                    ) : (
                                      <div className="min-w-0">
                                        <div
                                          className="break-words text-sm font-semibold leading-snug text-white [overflow-wrap:anywhere] [word-break:normal]"
                                          title={item.rawDescription?.trim() || item.description?.trim() || undefined}
                                        >
                                          {getItemDisplayName(item)}
                                        </div>
                                        {item.displayName?.trim() && item.brandName?.trim() && (
                                          <div className="mt-0.5 break-words text-xs text-gray-500 [overflow-wrap:anywhere]">{item.brandName.trim()}</div>
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
                                  <div className="min-w-0 self-start break-words text-left text-[11px] text-gray-300 [overflow-wrap:anywhere] sm:text-right sm:text-sm">
                                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:hidden">Qty</span>
                                    {formatOptionalQuantity(item.quantity, item.quantityUnit)}
                                  </div>
                                  <div className="min-w-0 self-start break-words text-left text-[11px] text-gray-300 [overflow-wrap:anywhere] sm:text-right sm:text-sm">
                                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:hidden">Unit</span>
                                    {section.key === 'discount'
                                      ? formatOptionalDeductionMoney(receiptCurrencySymbol, item.unitPrice)
                                      : formatOptionalMoney(receiptCurrencySymbol, item.unitPrice)}
                                  </div>
                                  <div className={`min-w-0 self-start break-words text-right text-[11px] font-semibold [overflow-wrap:anywhere] sm:text-sm ${section.key === 'discount' ? 'text-emerald-400' : 'text-white'}`}>
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

                  {(visibleSummaryRows.length > 0 || hasKnownOriginalTotal) && (
                    <div className="space-y-2">
                      {visibleSummaryRows.map((row) => (
                        <div
                          key={row.label}
                          className="flex min-w-0 items-start justify-between gap-3 text-sm text-gray-400"
                        >
                          <span className="min-w-0 break-words">{row.label}</span>
                          <span className={`min-w-0 shrink-0 break-words text-right [overflow-wrap:anywhere] ${row.isDiscount ? 'text-emerald-400' : ''}`}>
                            {row.isDiscount && row.value !== null
                              ? `-${formatMoney(receiptCurrencySymbol, Math.abs(row.value))}`
                              : formatOptionalMoney(receiptCurrencySymbol, row.value)}
                          </span>
                        </div>
                      ))}
                      {hasKnownOriginalTotal && (
                        <div className="flex min-w-0 items-start justify-between gap-3 border-t border-white/10 pt-2 text-lg font-bold text-white">
                          <span>Total</span>
                          <span className="min-w-0 break-words text-right [overflow-wrap:anywhere]">{formatMoney(displayOriginalCurrencySymbol, displayOriginalTotal)}</span>
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
                            className="flex min-w-0 items-start justify-between gap-3 text-sm text-gray-300"
                          >
                            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{payment.label}</span>
                            <span className="min-w-0 shrink-0 break-words text-right font-semibold text-white [overflow-wrap:anywhere]">
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
