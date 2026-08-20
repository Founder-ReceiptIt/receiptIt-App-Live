export type PurchaseProtectionState = 'protected' | 'action_soon' | 'review_needed' | 'unprotected';

export interface PurchaseProtectionInput {
  status?: string | null;
  errorReason?: string | null;
  storagePath?: string | null;
  imageUrl?: string | null;
  returnDate?: string | null;
  warrantyDate?: string | null;
}

export interface PurchaseProtection {
  state: PurchaseProtectionState;
  label: string;
  detail: string;
}

const getFutureDays = (value?: string | null): number | null => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const today = new Date();
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
};

const deadlineDetail = (label: string, days: number) => (
  days <= 0 ? `${label} is today` : `${label} in ${days} ${days === 1 ? 'day' : 'days'}`
);

export const getPurchaseProtection = (purchase: PurchaseProtectionInput): PurchaseProtection => {
  const status = purchase.status || '';
  const hasOriginal = Boolean(purchase.storagePath || purchase.imageUrl);

  if (status === 'needs_review' || status === 'needs_input') {
    return { state: 'review_needed', label: 'Review needed', detail: 'This purchase needs one quick check before it can be protected.' };
  }
  if (!['parsed', 'completed'].includes(status)) {
    return { state: 'unprotected', label: 'Not protected', detail: 'Protection becomes available when processing is complete.' };
  }
  if (!hasOriginal) {
    return { state: 'review_needed', label: 'Review needed', detail: 'The original proof is missing from secure storage.' };
  }

  const returnDays = getFutureDays(purchase.returnDate);
  const warrantyDays = getFutureDays(purchase.warrantyDate);
  if (returnDays !== null && returnDays >= 0 && returnDays <= 7) {
    return { state: 'action_soon', label: 'Action soon', detail: deadlineDetail('Return window ends', returnDays) };
  }
  if (warrantyDays !== null && warrantyDays >= 0 && warrantyDays <= 30) {
    return { state: 'action_soon', label: 'Action soon', detail: deadlineDetail('Warranty expires', warrantyDays) };
  }
  return { state: 'protected', label: 'Protected', detail: 'Your proof of purchase is securely stored.' };
};

export const getProtectionClasses = (state: PurchaseProtectionState) => {
  if (state === 'protected') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (state === 'action_soon') return 'border-amber-400/30 bg-amber-400/10 text-amber-100';
  if (state === 'review_needed') return 'border-sky-400/30 bg-sky-400/10 text-sky-100';
  return 'border-white/10 bg-white/5 text-gray-300';
};

export const isProtectedValueEligible = (purchase: {
  status?: string | null;
  amountGbp?: number | null;
  storagePath?: string | null;
  imageUrl?: string | null;
}) => (
  ['parsed', 'completed'].includes(purchase.status || '')
  && typeof purchase.amountGbp === 'number'
  && Number.isFinite(purchase.amountGbp)
  && purchase.amountGbp > 0
  && Boolean(purchase.storagePath || purchase.imageUrl)
);
