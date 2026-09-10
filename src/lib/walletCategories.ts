import { RECEIPT_CATEGORIES } from './receiptCategories.ts';

// Keep the Wallet's priority categories first without changing stored category values.
const order: string[] = ['Tech', 'Technology', 'Groceries', ...RECEIPT_CATEGORIES.filter(category => category !== 'Tech' && category !== 'Groceries' && category !== 'Other')];

export function getWalletCategories(categories: string[]): string[] {
  const rank = (category: string) => {
    if (category.toLowerCase() === 'other') return Number.MAX_SAFE_INTEGER;
    const index = order.findIndex(value => value.toLowerCase() === category.toLowerCase());
    return index < 0 ? order.length : index;
  };
  return ['All', ...Array.from(new Set(categories)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en-GB'))];
}
