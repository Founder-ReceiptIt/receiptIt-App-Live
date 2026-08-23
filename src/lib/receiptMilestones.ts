export interface ReceiptMilestone {
  count: number;
  title: string;
  supportingText: string;
}

const RECEIPT_MILESTONES: ReceiptMilestone[] = [
  {
    count: 1,
    title: 'Receipt saved.',
    supportingText: 'Your first purchase is now stored privately in receiptIt.',
  },
  {
    count: 5,
    title: '5 purchases saved.',
    supportingText: 'Your purchase history is growing.',
  },
  {
    count: 10,
    title: '10 purchases saved.',
    supportingText: 'receiptIt is building your private purchase history.',
  },
  {
    count: 25,
    title: '25 purchases saved.',
    supportingText: 'Your purchases are becoming easier to find.',
  },
];

export const getReceiptMilestone = (successfulReceiptCount: number): ReceiptMilestone | undefined => (
  RECEIPT_MILESTONES.find((milestone) => milestone.count === successfulReceiptCount)
);
