import { supabase } from './supabase';

export const BETA_CURRENCIES = [
  { code: 'GBP', name: 'British pound', symbol: '£', locale: 'en-GB' },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$', locale: 'en-AU' },
  { code: 'USD', name: 'US dollar', symbol: 'US$', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'en-IE' },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'C$', locale: 'en-CA' },
  { code: 'NZD', name: 'New Zealand dollar', symbol: 'NZ$', locale: 'en-NZ' },
] as const;

export type SupportedCurrencyCode = typeof BETA_CURRENCIES[number]['code'];

export interface AccountCurrencySettings {
  preferredCurrency: SupportedCurrencyCode;
  monthlyBudgetAmount: number | null;
  monthlyBudgetCurrency: SupportedCurrencyCode;
  currencySetupCompleted: boolean;
}

export interface CurrencyReceiptInput {
  id: string;
  amount: number;
  currency: string;
  transactionDate?: string | null;
}

export interface ConvertedReceiptAmounts {
  amounts: Map<string, number>;
  excludedReceiptIds: string[];
  approximateReceiptIds: string[];
}

interface CurrencyRateResponse {
  source?: unknown;
  target?: unknown;
  requestedDate?: unknown;
  rateDate?: unknown;
  rate?: unknown;
  approximate?: unknown;
  error?: unknown;
}

const DEFAULT_CURRENCY: SupportedCurrencyCode = 'GBP';
export const DEFAULT_MONTHLY_BUDGET = 2500;
export const BUDGET_INCREMENT = 10;
export const LEGACY_MONTHLY_BUDGET_KEY = 'receiptit_monthly_budget_gbp';

const EURO_REGION_PREFIXES = new Set([
  'at', 'be', 'cy', 'de', 'ee', 'es', 'fi', 'fr', 'gr', 'hr', 'ie', 'it',
  'lt', 'lu', 'lv', 'mt', 'nl', 'pt', 'si', 'sk',
]);

const currencyByCode = new Map(BETA_CURRENCIES.map((currency) => [currency.code, currency]));
const memoryRateCache = new Map<string, { rate: number; approximate: boolean }>();

export const isSupportedCurrency = (value: unknown): value is SupportedCurrencyCode => (
  typeof value === 'string' && currencyByCode.has(value.toUpperCase() as SupportedCurrencyCode)
);

export const normalizeSupportedCurrency = (value: unknown): SupportedCurrencyCode => (
  isSupportedCurrency(value) ? value.toUpperCase() as SupportedCurrencyCode : DEFAULT_CURRENCY
);

export const getCurrencyConfig = (currencyCode: string) => (
  currencyByCode.get(currencyCode.toUpperCase() as SupportedCurrencyCode) ?? {
    code: currencyCode.toUpperCase(),
    name: currencyCode.toUpperCase(),
    symbol: currencyCode.toUpperCase(),
    locale: 'en-GB',
  }
);

export const suggestPreferredCurrency = (locale = navigator.language): SupportedCurrencyCode => {
  const normalized = locale.toLowerCase().replace('_', '-');
  if (normalized === 'en-au' || normalized.endsWith('-au')) return 'AUD';
  if (normalized === 'en-us' || normalized.endsWith('-us')) return 'USD';
  if (normalized === 'en-ca' || normalized.endsWith('-ca')) return 'CAD';
  if (normalized === 'en-nz' || normalized.endsWith('-nz')) return 'NZD';

  const parts = normalized.split('-');
  const region = parts.length > 1 ? parts[parts.length - 1] : '';
  if (EURO_REGION_PREFIXES.has(region) || normalized.startsWith('de-') || normalized.startsWith('fr-')) return 'EUR';
  return 'GBP';
};

const getFractionDigits = (currencyCode: string): number => {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
};

export const formatCurrency = (
  amount: number,
  currencyCode: string,
  options: { maximumFractionDigits?: number; minimumFractionDigits?: number } = {},
): string => {
  const code = currencyCode.toUpperCase();
  const config = getCurrencyConfig(code);
  const defaultDigits = getFractionDigits(code);

  try {
    const formatter = new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: options.minimumFractionDigits ?? defaultDigits,
      maximumFractionDigits: options.maximumFractionDigits ?? defaultDigits,
    });
    return formatter.formatToParts(amount).map((part) => (
      part.type === 'currency' ? config.symbol : part.value
    )).join('');
  } catch {
    return `${config.symbol}${amount.toFixed(options.maximumFractionDigits ?? defaultDigits)}`;
  }
};

export const formatCurrencyInputSymbol = (currencyCode: string): string => (
  getCurrencyConfig(currencyCode).symbol
);

export const getLegacyMonthlyBudget = (): number | null => {
  try {
    const raw = window.localStorage.getItem(LEGACY_MONTHLY_BUDGET_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

export const clearLegacyMonthlyBudget = (): void => {
  try {
    window.localStorage.removeItem(LEGACY_MONTHLY_BUDGET_KEY);
  } catch {
    // Server settings remain authoritative when browser storage is unavailable.
  }
};

const requestKey = (source: string, target: string, date: string | null | undefined) => (
  `${source.toUpperCase()}:${target.toUpperCase()}:${date?.slice(0, 10) || 'latest'}`
);

const fetchRates = async (requests: Array<{ source: string; target: string; date?: string | null }>) => {
  const missingRequests = requests.filter((request) => !memoryRateCache.has(
    requestKey(request.source, request.target, request.date),
  ));

  if (missingRequests.length === 0) return;

  const { data, error } = await supabase.functions.invoke('currency-rates', {
    body: { rates: missingRequests },
  });
  if (error || !Array.isArray(data?.rates)) return;

  data.rates.forEach((rateResult: CurrencyRateResponse, index: number) => {
    const request = missingRequests[index];
    const rate = Number(rateResult?.rate);
    if (!request || !Number.isFinite(rate) || rate <= 0 || rateResult?.error) return;
    memoryRateCache.set(requestKey(request.source, request.target, request.date), {
      rate,
      approximate: rateResult.approximate === true,
    });
  });
};

export const convertReceiptAmounts = async (
  receipts: CurrencyReceiptInput[],
  targetCurrency: SupportedCurrencyCode,
): Promise<ConvertedReceiptAmounts> => {
  const amounts = new Map<string, number>();
  const approximateReceiptIds: string[] = [];
  const validReceipts = receipts.filter((receipt) => (
    Number.isFinite(receipt.amount) && receipt.amount >= 0 && /^[A-Z]{3}$/.test(receipt.currency.toUpperCase())
  ));
  const requests = validReceipts
    .filter((receipt) => receipt.currency.toUpperCase() !== targetCurrency)
    .map((receipt) => ({
      source: receipt.currency.toUpperCase(),
      target: targetCurrency,
      date: receipt.transactionDate?.slice(0, 10) || null,
    }));

  await fetchRates(Array.from(new Map(requests.map((request) => [
    requestKey(request.source, request.target, request.date),
    request,
  ])).values()));

  validReceipts.forEach((receipt) => {
    const source = receipt.currency.toUpperCase();
    if (source === targetCurrency) {
      amounts.set(receipt.id, receipt.amount);
      return;
    }

    const cached = memoryRateCache.get(requestKey(source, targetCurrency, receipt.transactionDate));
    if (!cached) return;
    amounts.set(receipt.id, receipt.amount * cached.rate);
    if (cached.approximate || !receipt.transactionDate) approximateReceiptIds.push(receipt.id);
  });

  return {
    amounts,
    excludedReceiptIds: receipts.filter((receipt) => !amounts.has(receipt.id)).map((receipt) => receipt.id),
    approximateReceiptIds,
  };
};

export const convertCurrencyAmount = async (
  amount: number,
  sourceCurrency: SupportedCurrencyCode,
  targetCurrency: SupportedCurrencyCode,
): Promise<number | null> => {
  if (sourceCurrency === targetCurrency) return amount;
  await fetchRates([{ source: sourceCurrency, target: targetCurrency, date: null }]);
  const cached = memoryRateCache.get(requestKey(sourceCurrency, targetCurrency, null));
  return cached ? amount * cached.rate : null;
};
