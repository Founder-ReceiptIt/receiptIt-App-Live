const MONTHLY_BUDGET_KEY = 'receiptit_monthly_budget_gbp';

export const MONTHLY_BUDGET_EVENT = 'receiptit:monthly-budget-updated';

export const getMonthlyBudget = (): number | null => {
  const rawValue = window.localStorage.getItem(MONTHLY_BUDGET_KEY);
  if (!rawValue) return null;

  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export const saveMonthlyBudget = (value: number | null) => {
  if (value === null) {
    window.localStorage.removeItem(MONTHLY_BUDGET_KEY);
  } else {
    window.localStorage.setItem(MONTHLY_BUDGET_KEY, value.toFixed(2));
  }

  window.dispatchEvent(new Event(MONTHLY_BUDGET_EVENT));
};
