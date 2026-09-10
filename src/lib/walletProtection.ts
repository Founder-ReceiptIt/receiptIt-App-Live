import { getReturnWindowStatus } from './returnWindowUtils.ts';

interface ProtectionReceipt {
  id: string;
  userId: string;
  status?: string;
  documentType?: string;
  errorReason?: string | null;
  warrantyDate?: string;
  returnDate?: string;
}

/** Called on the deduplicated Wallet data, before any search/category filtering. */
export function getWalletProtection(receipts: ProtectionReceipt[], ownerId: string | undefined, now: number) {
  const warranty = new Set<string>();
  const returns = new Set<string>();
  for (const receipt of receipts) {
    if (!ownerId || receipt.userId !== ownerId || !['parsed', 'completed'].includes(receipt.status || '')
      || receipt.documentType === 'non_purchase_document' || receipt.errorReason) continue;
    if (receipt.warrantyDate && new Date(receipt.warrantyDate).getTime() > now) warranty.add(receipt.id);
    const status = getReturnWindowStatus(receipt.returnDate, new Date(now)).status;
    if (status === 'active' || status === 'urgent') returns.add(receipt.id);
  }
  return { warranty, returns };
}
