import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Calendar, Clock, Trash2, Tag, MapPin, CreditCard, FileText, Download, MoreVertical, Undo2, CreditCard as Edit2, Save, ChevronDown } from 'lucide-react';
import { Receipt } from './WalletTab';
import { ReportProblemDialog } from './ReportProblemDialog';
import { useState, useEffect } from 'react';
import {
  confirmReceiptCurrency,
  deleteReceiptRecord,
  isReceiptCurrencyConfirmationOption,
  isReceiptStaleProcessing,
  needsCurrencyConfirmation,
  RECEIPT_CURRENCY_CONFIRMATION_OPTIONS,
  RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION,
  retryReceiptProcessing,
  supabase,
} from '../../lib/supabase';
import type { ReceiptCurrencyConfirmationOption } from '../../lib/supabase';
import { formatReceiptDate, getPurchaseDateDisplay, PURCHASE_DATE_PENDING_LABEL } from '../../lib/receiptDateUtils';
import { getReceiptOriginalUrl, openReceiptOriginal } from '../../lib/receiptOriginalUtils';
import { getReturnWindowStatus } from '../../lib/returnWindowUtils';
import { useToast } from '../../contexts/ToastContext';

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
  lineIndex: getNullableNumber(row.line_index) ?? 0,
  description: getNonEmptyString(row.description),
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

  if (amount === null) return null;

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showCompanyDetails, setShowCompanyDetails] = useState(false);
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [editWarrantyDate, setEditWarrantyDate] = useState('');
  const [editReturnDate, setEditReturnDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
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

  useEffect(() => {
    setShowDeleteMenu(false);
    setShowMoreDetails(false);
    setShowCompanyDetails(false);
    setIsEditingDates(false);
    setShowOtherCurrencyOptions(false);
    setShowReportProblemDialog(false);
  }, [receipt?.id]);

  useEffect(() => {
    if (receipt) {
      setEditWarrantyDate(receipt.warrantyDate || '');
      setEditReturnDate(receipt.returnDate || '');
    } else {
      setEditWarrantyDate('');
      setEditReturnDate('');
    }
    setProcessingAttemptStartedAt(receipt?.processingAttemptStartedAt || null);
  }, [receipt?.id, receipt?.warrantyDate, receipt?.returnDate, receipt?.processingAttemptStartedAt]);

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

  const hasWarrantyInfo = Boolean(receipt?.warrantyDate?.trim() || receipt?.hasWarranty);

  // --- LOGIC FIX: ROBUST DELETE HANDLING ---
  const handleDelete = async (deleteOption: 'now' | '30days' | 'warranty') => {
    if (!receipt) return;
    if (deleteOption === 'warranty' && !hasWarrantyInfo) return;

    if (deleteOption === 'now') {
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
    } else {
      // Placeholder for future logic
      alert(`This receipt will be deleted: ${deleteOption === '30days' ? 'In 30 Days' : 'When Warranty Expires'}`);
      setShowDeleteMenu(false);
    }
  };

  const handleSaveDates = async () => {
    if (!receipt) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('receipts')
        .update({
          warranty_date: editWarrantyDate || null,
          return_date: editReturnDate || null,
        })
        .eq('id', receipt.id);

      if (error) {
        console.error('[SaveDates] Error updating dates:', error);
        alert('Failed to save dates. Please try again.');
        return;
      }

      console.log('[SaveDates] Dates updated successfully');
      setIsEditingDates(false);

      // Update local receipt object
      if (receipt.warrantyDate !== editWarrantyDate || receipt.returnDate !== editReturnDate) {
        window.location.reload();
      }
    } catch (error) {
      console.error('[SaveDates] Unexpected error:', error);
      alert('Failed to save dates. Please try again.');
    } finally {
      setIsSaving(false);
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

    const formattedValue = value.toFixed(Number.isInteger(value) ? 0 : 2);
    return quantityUnit ? `${formattedValue} ${quantityUnit}` : formattedValue;
  };
  const receiptCurrencyCode = receipt.currency?.toUpperCase() || 'GBP';
  const isStaleProcessing = isReceiptStaleProcessing(
    receipt.status,
    receipt.createdAt,
    processingAttemptStartedAt
  );
  const isProcessingReceipt = receipt.status === 'processing';
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
  const getReceiptItemGroup = (item: NonNullable<Receipt['items']>[number]) => {
    const normalizedType = item.itemType?.trim().toLowerCase();

    if (normalizedType === 'charge') return 'charge';
    if (normalizedType === 'discount') return 'discount';
    return 'product';
  };
  const isCurrentReceiptDetails = detailReceiptId === receipt.id;
  const activeReceiptItems = isCurrentReceiptDetails ? receiptItems : [];
  const activeReceiptPayments = isCurrentReceiptDetails ? receiptPayments : [];
  const normalizedReceiptItems = activeReceiptItems.filter((item) => {
    const hasDescription = typeof item.description === 'string' && item.description.trim().length > 0;
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
  const formattedPurchaseDate = formatReceiptDate(receipt.date, 'long');
  const purchaseDateDisplay = getPurchaseDateDisplay(
    receipt.date,
    'long',
    isProcessingReceipt ? PURCHASE_DATE_PENDING_LABEL : undefined
  );
  const importedOnDisplay = !formattedPurchaseDate ? formatReceiptDate(receipt.createdAt, 'long') : null;
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
  const moreDetails = [
    receipt.referenceNumber ? { label: 'Reference number', value: receipt.referenceNumber, icon: FileText } : null,
    receipt.invoiceNumber ? { label: 'Invoice number', value: receipt.invoiceNumber, icon: FileText } : null,
    receipt.customerNumber ? { label: 'Customer number', value: receipt.customerNumber, icon: FileText } : null,
    receipt.paymentMethod ? { label: 'Payment method', value: receipt.paymentMethod, icon: CreditCard } : null,
    importedOnDisplay ? { label: 'Imported on', value: importedOnDisplay, icon: Calendar } : null,
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
    merchantCompanyName ? { label: 'Company', value: merchantCompanyName } : null,
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

  // Calculate specific remaining time for the display
  const daysRemaining = warrantyEndDate ? Math.floor((warrantyEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const yearsRemaining = Math.floor(daysRemaining / 365);
  const monthsRemaining = Math.floor((daysRemaining % 365) / 30);

  // Return window status
  const returnWindowStatus = getReturnWindowStatus(receipt.returnDate);

  const downloadUrl = getReceiptOriginalUrl(receipt);

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const openedUrl = openReceiptOriginal(receipt);
    if (openedUrl) {
      console.log('Opening receipt image:', openedUrl);
      console.log('Receipt image_url field:', receipt.imageUrl);
      console.log('Is external URL:', receipt.imageUrl?.startsWith('http'));
    } else {
      console.warn('No download URL available for this receipt');
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
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="relative w-full max-w-2xl mx-4 mb-4 md:mb-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="backdrop-blur-xl bg-black/90 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(45,212,191,0.3)]">
            
            {/* --- HEADER --- */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Receipt Details</h2>
              <div className="flex items-center gap-2">
                {!isEditingDates ? (
                  <motion.button
                    onClick={() => setIsEditingDates(true)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 rounded-full backdrop-blur-md bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-teal-400 hover:border-teal-400/30 transition-colors"
                    title="Edit Receipt"
                  >
                    <Edit2 className="w-5 h-5" />
                  </motion.button>
                ) : (
                  <>
                    <motion.button
                      onClick={() => {
                        setIsEditingDates(false);
                        setEditWarrantyDate(receipt.warrantyDate || '');
                        setEditReturnDate(receipt.returnDate || '');
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-10 h-10 rounded-full backdrop-blur-md bg-gray-400/10 border border-gray-400/30 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                      title="Cancel"
                      disabled={isSaving}
                    >
                      <X className="w-5 h-5" />
                    </motion.button>
                    <motion.button
                      onClick={handleSaveDates}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-10 h-10 rounded-full backdrop-blur-md bg-teal-400/10 border border-teal-400/30 flex items-center justify-center text-teal-400 hover:text-teal-300 hover:border-teal-400/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Save Changes"
                      disabled={isSaving}
                    >
                      <Save className="w-5 h-5" />
                    </motion.button>
                  </>
                )}
                {downloadUrl && (
                  <motion.button
                    onClick={handleDownloadClick}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 rounded-full backdrop-blur-md bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-teal-400 hover:border-teal-400/30 transition-colors"
                    title="View Original Receipt"
                  >
                    <Download className="w-5 h-5" />
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="w-10 h-10 rounded-full backdrop-blur-md bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
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
                    <h3 className="text-2xl font-bold text-white mb-1">{receipt.merchant || 'Receipt (Seller Unknown)'}</h3>
                    {receipt.summary && (
                      <p className="text-teal-400 text-sm mb-2">{receipt.summary}</p>
                    )}
                    <p className="text-gray-400 text-sm">{purchaseDateDisplay}</p>
                    {downloadUrl && (
                      <button
                        type="button"
                        onClick={handleDownloadClick}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-400 transition-colors hover:text-teal-300"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Open original receipt
                      </button>
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
                      {formatMoney(displayOriginalCurrencySymbol, displayOriginalTotal)}
                      </div>
                    {receiptCurrencyCode !== 'GBP' && gbpAmount !== null && originalTotal !== null && (
                      <div className="text-sm pt-1 text-gray-400">
                        Approx. {formatMoney('£', gbpAmount)}
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
                      <span>Company</span>
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

              {isStaleProcessing && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-red-300">Upload failed</p>
                      <p className="text-xs text-red-100/80">This receipt has been processing for more than 5 minutes.</p>
                    </div>
                    <div className="flex items-center gap-2">
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
                        onClick={() => void handleDelete('now')}
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
                        Report a problem
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                          onClick={() => void handleCurrencyConfirmation(RECEIPT_PRIMARY_CURRENCY_CONFIRMATION_OPTION)}
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

              {/* --- WARRANTY SECTION (Animated & Glowing) --- */}
              {isWarrantyActive && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="relative"
                >
                  <div className="absolute -inset-4 bg-gradient-to-r from-teal-400/20 to-cyan-400/20 blur-3xl" />
                  <div className="relative backdrop-blur-xl bg-gradient-to-br from-teal-400/10 to-cyan-400/10 border-2 border-teal-400/30 rounded-2xl p-6">
                    <div className="flex items-center gap-4">
                      <motion.div
                        animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="relative"
                      >
                         <Shield className="w-12 h-12 text-teal-400 relative z-10" strokeWidth={1.5} />
                      </motion.div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
                          <span className="text-teal-400 font-bold text-xs uppercase tracking-widest">Warranty Active</span>
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">
                          {yearsRemaining > 0 && <span>{yearsRemaining} {yearsRemaining === 1 ? 'Year' : 'Years'}{monthsRemaining > 0 ? ', ' : ''}</span>}
                          {monthsRemaining > 0 && <span>{monthsRemaining} {monthsRemaining === 1 ? 'Month' : 'Months'}</span>}
                          {yearsRemaining === 0 && monthsRemaining === 0 && <span>{daysRemaining} {daysRemaining === 1 ? 'Day' : 'Days'}</span>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                           <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" />
                              <span>{warrantyEndDate?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                           </div>
                           <div className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              <span>{daysRemaining} days remaining</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* --- EXPIRED WARRANTY SECTION --- */}
              {!isWarrantyActive && warrantyEndDate && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-red-400/10 to-red-900/10 border-2 border-red-400/30 rounded-2xl p-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-red-400/10 border border-red-400/30 flex items-center justify-center">
                      <Shield className="w-8 h-8 text-red-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-red-400 font-bold text-xs uppercase tracking-widest">Warranty Expired</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Calendar className="w-4 h-4" />
                        <span>Expired on {warrantyEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* --- RETURN WINDOW SECTION --- */}
              {returnWindowStatus.status === 'active' && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-red-400/10 to-orange-900/10 border-2 border-red-400/30 rounded-2xl p-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-red-400/10 border border-red-400/30 flex items-center justify-center">
                      <Undo2 className="w-7 h-7 text-red-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-red-400 font-bold text-xs uppercase tracking-widest">Return Window Active</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span>{returnWindowStatus.daysLeft} days remaining</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {returnWindowStatus.status === 'urgent' && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-red-500/20 to-orange-900/20 border-2 border-red-500/50 rounded-2xl p-6 animate-pulse"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                      <Undo2 className="w-7 h-7 text-red-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-red-400 font-bold text-xs uppercase tracking-widest">⚠️ Return Window Ending Soon</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-red-300">
                        <Clock className="w-4 h-4" />
                        <span className="font-bold">{returnWindowStatus.message}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {returnWindowStatus.status === 'expired' && receipt.returnDate && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-gray-400/10 to-gray-900/10 border-2 border-gray-400/30 rounded-2xl p-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-gray-400/10 border border-gray-400/30 flex items-center justify-center">
                      <Undo2 className="w-7 h-7 text-gray-500" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-gray-500 font-bold text-xs uppercase tracking-widest">Return Window Expired</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Calendar className="w-4 h-4" />
                        <span>Expired on {new Date(receipt.returnDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* --- EDIT DATES FORM (SHOWN WHEN EDITING) --- */}
              {isEditingDates && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="backdrop-blur-xl bg-teal-400/10 border-2 border-teal-400/30 rounded-2xl p-6"
                >
                  <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Edit2 className="w-5 h-5 text-teal-400" />
                    Edit Receipt Dates
                  </h4>

                  <div className="space-y-4">
                    {/* Warranty Date Input */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        Warranty Expiry Date
                      </label>
                      <input
                        type="date"
                        value={editWarrantyDate}
                        onChange={(e) => setEditWarrantyDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-teal-400/50 focus:ring-2 focus:ring-teal-400/20 transition-all"
                      />
                    </div>

                    {/* Return Date Input */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                        <Undo2 className="w-4 h-4 text-red-400" />
                        Return Window End Date
                      </label>
                      <input
                        type="date"
                        value={editReturnDate}
                        onChange={(e) => setEditReturnDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-teal-400/50 focus:ring-2 focus:ring-teal-400/20 transition-all"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* --- BREAKDOWN SECTION --- */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
              >
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-400" />
                  Receipt Breakdown
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
                          <div className="grid grid-cols-[minmax(0,1.6fr)_70px_110px_110px] gap-3 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 border-b border-white/10">
                            <div>Description</div>
                            <div className="text-right">Qty</div>
                            <div className="text-right">Unit</div>
                            <div className="text-right">Total</div>
                          </div>
                          <div className="divide-y divide-white/10">
                            {section.items.map((item) => (
                              <div
                                key={`${section.key}-${item.lineIndex}-${item.description ?? 'item'}`}
                                className="grid grid-cols-[minmax(0,1.6fr)_70px_110px_110px] gap-3 px-4 py-3 items-start"
                              >
                                <div className="min-w-0">
                                  <div className="text-white font-semibold break-words">
                                    {item.description?.trim() || 'Unnamed item'}
                                  </div>
                                  {(getValidMoneyValue(item.vatRate) !== null || getValidMoneyValue(item.vatAmount) !== null) && (
                                    <div className="text-xs text-gray-400 mt-1">
                                      {getValidMoneyValue(item.vatRate) !== null ? `VAT ${item.vatRate!.toFixed(2)}%` : 'VAT'}
                                      {getValidMoneyValue(item.vatAmount) !== null ? ` • ${formatMoney(receiptCurrencySymbol, item.vatAmount!)}` : ''}
                                    </div>
                                  )}
                                </div>
                                <div className="text-sm text-right text-gray-300">
                                  {formatOptionalQuantity(item.quantity, item.quantityUnit)}
                                </div>
                                <div className="text-sm text-right text-gray-300">
                                  {section.key === 'discount'
                                    ? formatOptionalDeductionMoney(receiptCurrencySymbol, item.unitPrice)
                                    : formatOptionalMoney(receiptCurrencySymbol, item.unitPrice)}
                                </div>
                                <div className={`text-sm text-right font-semibold ${section.key === 'discount' ? 'text-emerald-400' : 'text-white'}`}>
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
                ) : itemsLoaded ? (
                  <div className="mb-4 rounded-lg bg-white/5 p-4 text-sm text-gray-400">
                    Detailed items unavailable for this receipt
                  </div>
                ) : null}

                <div className="space-y-2">
                  {summaryRows.map((row) => (
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
                  <div className="flex items-center justify-between text-white font-bold text-lg pt-2 border-t border-white/10">
                    <span>Total</span>
                    <span>{formatMoney(displayOriginalCurrencySymbol, displayOriginalTotal)}</span>
                  </div>
                </div>

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

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="relative"
              >
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                  disabled={isDeleting}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all backdrop-blur-md border bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Clock className="w-5 h-5" />
                      </motion.div>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <MoreVertical className="w-5 h-5" />
                      <span>Manage Receipt</span>
                    </>
                  )}
                </motion.button>

                {showDeleteMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-full left-0 right-0 mb-2 backdrop-blur-xl bg-black/95 border border-white/10 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] z-20"
                  >
                    <button
                      type="button"
                      onClick={() => handleDelete('now')}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-red-500/10 transition-colors text-left text-red-400 hover:text-red-300 border-b border-white/10 group"
                    >
                      <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span className="font-semibold">Delete Now</span>
                    </button>
                    {hasWarrantyInfo && (
                      <button
                        type="button"
                        onClick={() => handleDelete('warranty')}
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-gray-400 hover:text-white group"
                      >
                        <Shield className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="font-semibold">Delete when Warranty Expires</span>
                      </button>
                    )}
                  </motion.div>
                )}
              </motion.div>

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
