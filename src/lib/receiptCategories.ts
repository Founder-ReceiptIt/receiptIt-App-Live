export const RECEIPT_CATEGORIES = [
  'Groceries',
  'Tech',
  'Transport',
  'Meals',
  'Utility',
  'Fashion',
  'Toys',
  'Other',
] as const;

export type ReceiptCategory = typeof RECEIPT_CATEGORIES[number];

export const isReceiptCategory = (value: unknown): value is ReceiptCategory => (
  typeof value === 'string' && RECEIPT_CATEGORIES.includes(value as ReceiptCategory)
);
