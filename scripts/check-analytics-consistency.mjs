import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getAnalyticsEligibleAmount,
  getAnalyticsMoneySummary,
  getAnalyticsMonthKey,
  getCurrentCalendarMonthKey,
  isAnalyticsPurchaseCandidate,
} from '../src/lib/receiptAnalytics.ts';

const workspaceUrl = new URL('../', import.meta.url);
const wallet = await readFile(new URL('src/components/app/WalletTab.tsx', workspaceUrl), 'utf8');
const insights = await readFile(new URL('src/components/app/InsightsTab.tsx', workspaceUrl), 'utf8');

assert.equal(getAnalyticsEligibleAmount({ amount: 12.5, status: 'parsed', documentType: 'receipt' }), 12.5);
assert.equal(getAnalyticsEligibleAmount({ amount: 0, status: 'parsed', documentType: 'receipt' }), 0);
assert.equal(getAnalyticsEligibleAmount({ amount: null, status: 'parsed', documentType: 'receipt' }), null);
assert.equal(getAnalyticsEligibleAmount({ amount: 37, status: 'needs_review', documentType: 'other_purchase_proof' }), null);
assert.equal(getAnalyticsEligibleAmount({ amount: 37, status: 'rejected', documentType: 'non_purchase_document' }), null);
assert.equal(getAnalyticsEligibleAmount({ amount: 37, status: 'parsed', documentType: 'non_purchase_document' }), null);
assert.equal(getAnalyticsEligibleAmount({ amount: 37, status: 'parsed', documentType: 'order_confirmation' }), 37);
assert.equal(getAnalyticsEligibleAmount({ amount: 37, status: 'parsed', documentType: 'receipt', errorReason: 'review_assist_requested' }), null);
assert.equal(getAnalyticsMonthKey('2026-09-08'), '2026-09');
assert.equal(getAnalyticsMonthKey(null), null);
assert.equal(getAnalyticsMonthKey('not-a-date'), null);
assert.equal(getCurrentCalendarMonthKey(new Date(2026, 8, 8)), '2026-09');
assert.equal(isAnalyticsPurchaseCandidate({ status: 'needs_review', documentType: 'invoice' }), true);
assert.equal(isAnalyticsPurchaseCandidate({ status: 'rejected', documentType: 'non_purchase_document' }), false);

const septemberReceipts = [
  { id: 'city-bakery', amount: 11.5, status: 'parsed', documentType: 'receipt', merchant: 'CITY BAKERY', transactionDate: '2026-09-01' },
  { id: 'tesco', amount: 99.33, status: 'completed', documentType: 'receipt', merchant: 'Tesco', transactionDate: '2026-09-08' },
  { id: 'review', amount: 50, status: 'needs_review', documentType: 'other_purchase_proof', merchant: 'Review', transactionDate: '2026-09-05' },
  { id: 'unknown', amount: null, status: 'parsed', documentType: 'receipt', merchant: 'Unknown', transactionDate: '2026-09-03' },
  { id: 'august', amount: 10, status: 'parsed', documentType: 'receipt', merchant: 'August', transactionDate: '2026-08-31' },
  { id: 'rejected', amount: 100, status: 'rejected', documentType: 'non_purchase_document', merchant: 'Rejected', transactionDate: '2026-09-02' },
  { id: 'genuine-zero', amount: 0, status: 'parsed', documentType: 'receipt', merchant: 'Zero', transactionDate: '2026-09-04' },
];
const convertedSeptemberAmounts = new Map([
  ['city-bakery', 11.5],
  ['tesco', 99.33],
  ['review', 50],
  ['august', 10],
  ['rejected', 100],
  ['genuine-zero', 0],
]);
const septemberSummary = getAnalyticsMoneySummary(septemberReceipts, convertedSeptemberAmounts, '2026-09');
assert.equal(septemberSummary.total, 110.83);
assert.equal(septemberSummary.includedCount, 3);
assert.equal(septemberSummary.excludedCount, 2);
assert.equal(septemberSummary.average, 110.83 / 3);
assert.equal(getAnalyticsMoneySummary(septemberReceipts, new Map(), '2026-09').total, 0);

for (const source of [wallet, insights]) {
  assert.match(source, /getAnalyticsEligibleAmount/);
  assert.match(source, /getAnalyticsMoneySummary/);
}
assert.doesNotMatch(insights, /amount:\s*asNumber\(row\.amount\)\s*\?\?\s*0/);
assert.match(wallet, /Not receipts/);
assert.doesNotMatch(wallet, />Files to revisit</);
assert.doesNotMatch(wallet, />Purchase type</);
assert.match(wallet, /•••• \{receipt\.cardLast4\}/);
assert.match(wallet, /getAnalyticsMoneySummary/);
assert.match(insights, /getAnalyticsMoneySummary/);
assert.match(wallet, /const analyticsAmountsReady = !loading && convertedAmountsKey === analyticsConversionKey/);
assert.match(wallet, /analyticsAmountsReady \? `\$\{formatCurrency\(spentThisMonth/);
assert.match(wallet, /'Calculating…'/);

console.log('Analytics consistency guard: PASS');
