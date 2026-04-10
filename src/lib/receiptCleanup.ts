import { supabase } from './supabase';

type ReceiptCleanupTarget = {
  amount: number;
  amount_gbp: number | null;
  date: string;
};

export async function deleteMatchingProcessingLogs(userId: string, receipts: ReceiptCleanupTarget[]) {
  const uniqueReceipts = receipts.filter((receipt, index, allReceipts) => {
    const receiptDate = String(receipt.date).split('T')[0];
    return allReceipts.findIndex((candidate) =>
      String(candidate.date).split('T')[0] === receiptDate &&
      candidate.amount === receipt.amount &&
      candidate.amount_gbp === receipt.amount_gbp
    ) === index;
  });

  const deletePromises = uniqueReceipts.map((receipt) => {
    const matchingAmountFilters = [
      Number.isFinite(receipt.amount) ? `original_amount.eq.${receipt.amount}` : null,
      Number.isFinite(receipt.amount_gbp) ? `amount_gbp.eq.${receipt.amount_gbp}` : null,
    ].filter(Boolean).join(',');

    if (!matchingAmountFilters) {
      return Promise.resolve({ error: null });
    }

    return supabase
      .from('processing_logs')
      .delete()
      .eq('user_id', userId)
      .eq('transaction_date', String(receipt.date).split('T')[0])
      .or(matchingAmountFilters);
  });

  const results = await Promise.all(deletePromises);
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw failedResult.error;
  }
}
