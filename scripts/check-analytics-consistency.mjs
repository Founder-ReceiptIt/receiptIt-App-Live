import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getAnalyticsEligibleAmount,
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

for (const source of [wallet, insights]) {
  assert.match(source, /getAnalyticsEligibleAmount/);
  assert.match(source, /getAnalyticsMonthKey/);
}
assert.doesNotMatch(insights, /amount:\s*asNumber\(row\.amount\)\s*\?\?\s*0/);
assert.match(wallet, /Not receipts/);
assert.doesNotMatch(wallet, />Files to revisit</);
assert.doesNotMatch(wallet, />Purchase type</);
assert.match(wallet, /•••• \{receipt\.cardLast4\}/);

console.log('Analytics consistency guard: PASS');
