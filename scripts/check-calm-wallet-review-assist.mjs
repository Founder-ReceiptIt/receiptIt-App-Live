import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workspaceUrl = new URL('../', import.meta.url);
const [wallet, modal, supabaseClient, reassessment, reassessmentCleanup, imageBlueprint, pdfBlueprint] = await Promise.all([
  readFile(new URL('src/components/app/WalletTab.tsx', workspaceUrl), 'utf8'),
  readFile(new URL('src/components/app/ReceiptModal.tsx', workspaceUrl), 'utf8'),
  readFile(new URL('src/lib/supabase.ts', workspaceUrl), 'utf8'),
  readFile(new URL('supabase/migrations/20260908193000_add_safe_receipt_reassessment.sql', workspaceUrl), 'utf8'),
  readFile(new URL('supabase/migrations/20260908194500_clear_successful_reassessment_reason.sql', workspaceUrl), 'utf8'),
  readFile(new URL('tmp/calm-review-assist/RECEIPTIT V2 - IMAGE PROCESSOR.calm-review.blueprint.json', workspaceUrl), 'utf8'),
  readFile(new URL('tmp/calm-review-assist/RECEIPTIT V2 - PDF PROCESSOR.calm-review.blueprint.json', workspaceUrl), 'utf8'),
]);

assert.match(wallet, /type WalletReceiptSection = 'purchases' \| 'attention' \| 'not_receipts'/);
assert.match(wallet, /Needs attention/);
assert.match(wallet, /Not receipts/);
assert.match(wallet, /showNonReceipts/);
assert.doesNotMatch(wallet, /Files to revisit/);
assert.doesNotMatch(wallet, /Purchase type/);
assert.match(wallet, /•••• \{receipt\.cardLast4\}/);
assert.match(wallet, /Amount not found/);
assert.match(wallet, /Add amount/);
assert.match(wallet, /Review details/);
assert.match(wallet, /showNeedsAttention/);
assert.match(wallet, /setSelectedCategory\(null\)/);
assert.match(wallet, /min-\[540px\]:grid-cols-2/);
assert.doesNotMatch(wallet, /THINGS NEED YOU|THING NEEDS YOU/i);
assert.match(wallet, /flex max-w-full flex-wrap items-center justify-end gap-2/);

assert.match(modal, /startInEditMode/);
assert.match(modal, /setIsEditMode\(Boolean\(receipt\?\.startInEditMode/);
assert.match(modal, /isFocusedAmountReview/);
assert.match(modal, /Add purchase amount/);
assert.match(modal, /Save amount/);
assert.match(modal, /Enter the amount shown on the original/);
assert.match(supabaseClient, /request_receipt_reassessment/);

assert.match(reassessment, /create table if not exists public\.receipt_reassessments/);
assert.match(reassessment, /auth\.uid\(\) = user_id/);
assert.match(reassessment, /where id = p_receipt_id and user_id = caller_id/);
assert.match(reassessment, /current_receipt\.status not in \('failed', 'error', 'needs_input', 'needs_review', 'rejected'\)/);
assert.match(reassessment, /processing_attempts, 1\) >= 5/);
assert.match(reassessment, /receipt_snapshot jsonb not null/);
assert.match(reassessment, /items_snapshot jsonb not null/);
assert.match(reassessment, /payments_snapshot jsonb not null/);
assert.match(reassessment, /preserve_receipt_reassessment_baseline/);
assert.match(reassessment, /finish_receipt_reassessment/);
assert.match(reassessmentCleanup, /new\.status in \('parsed', 'completed'\)/);
assert.match(reassessmentCleanup, /new\.error_reason := null/);

const collectModules = (blueprint) => {
  const modules = [];
  const visit = (flow) => {
    for (const module of flow || []) {
      modules.push(module);
      visit(module.onerror);
      for (const route of module.routes || []) visit(route.flow);
    }
  };
  visit(blueprint.flow);
  return modules;
};

for (const [label, raw] of [['Image', imageBlueprint], ['PDF', pdfBlueprint]]) {
  const blueprint = JSON.parse(raw);
  const modules = collectModules(blueprint);
  const ids = modules.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length, `${label} blueprint module IDs must be scenario-global and unique`);
}

const image = JSON.parse(imageBlueprint);
const imageModules = collectModules(image);
const imagePrompt = JSON.parse(imageModules.find(({ id }) => id === 13).mapper.body).messages[0].content[0].text;
assert.match(imagePrompt, /REASSESSMENT:/);
assert.match(imagePrompt, /Existing receipt context:/);
assert.match(imagePrompt, /vendor-issued voucher, ticket stock, validation copy/i);
assert.match(imagePrompt, /NOT FOR TRAVEL/);
assert.match(imagePrompt, /Never invent a value/i);
assert.ok(imageModules.some(({ id, filter }) => id === 78 && filter?.name === 'Complete purchase evidence - GBP'));
assert.ok(imageModules.some(({ id, filter }) => id === 80 && filter?.name === 'Complete purchase evidence - converted'));

const pdf = JSON.parse(pdfBlueprint);
const pdfModules = collectModules(pdf);
const pdfPrompt = pdfModules.find(({ id }) => id === 32).mapper.messages[0].content;
assert.match(pdfPrompt, /REASSESSMENT:/);
assert.ok(pdfModules.some(({ id, filter }) => id === 35 && filter?.name === 'Complete purchase evidence'));

console.log('Calm Wallet and AI Review Assist guard: PASS');
