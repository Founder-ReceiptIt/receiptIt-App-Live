export interface ReceiptAmountStateInput {
  amount: unknown;
  status?: string | null;
  merchant?: string | null;
}

const getFiniteAmount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const isReceiptAmountKnown = ({ amount, status, merchant }: ReceiptAmountStateInput): boolean => {
  const numericAmount = getFiniteAmount(amount);
  if (numericAmount === null) return false;

  // Before this distinction existed, upload placeholders were stored as zero.
  // Keep those rows unknown while preserving a genuine extracted or reviewed 0.
  return !(
    numericAmount === 0
    && !['parsed', 'completed'].includes(status || '')
    && (!merchant || merchant.trim().toLowerCase() === 'analyzing...')
  );
};

export const isReceiptStatusActionable = (status?: string | null): boolean => {
  if (status === 'processing') return false;
  return ['needs_review', 'needs_input', 'failed', 'error', 'rejected'].includes(status || '');
};
