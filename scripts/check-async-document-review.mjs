import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const workspaceUrl = new URL('../', import.meta.url);
const amountStateSource = await readFile(new URL('src/lib/receiptAmountState.ts', workspaceUrl), 'utf8');
const transpiled = ts.transpileModule(amountStateSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const amountState = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(!amountState.isReceiptStatusActionable('processing'), 'processing must not be actionable');
assert(amountState.isReceiptStatusActionable('needs_review'), 'needs_review must be actionable');
assert(amountState.isReceiptStatusActionable('failed'), 'failed must be actionable');

assert(!amountState.isReceiptAmountKnown({ amount: null, status: 'needs_review', merchant: 'Transport for London' }), 'null must remain unknown');
assert(!amountState.isReceiptAmountKnown({ amount: 0, status: 'needs_review', merchant: 'Analyzing...' }), 'legacy zero placeholder must remain unknown');
assert(amountState.isReceiptAmountKnown({ amount: 0, status: 'parsed', merchant: 'Free Sample Counter' }), 'genuine parsed zero must remain visible');
assert(amountState.isReceiptAmountKnown({ amount: 0, status: 'needs_review', merchant: 'Transport for London' }), 'explicit review zero must remain visible');
assert(amountState.isReceiptAmountKnown({ amount: 50, status: 'needs_review', merchant: 'Transport for London' }), 'extracted review amount must remain visible');

const blueprint = JSON.parse(await readFile(
  new URL('tmp/async-document-review/RECEIPTIT V2 - IMAGE PROCESSOR.document-review-data.blueprint.json', workspaceUrl),
  'utf8',
));
const modules = [];
const visit = (value) => {
  if (Array.isArray(value)) return value.forEach(visit);
  if (!value || typeof value !== 'object') return;
  if (value.id === 76) modules.push(value);
  Object.values(value).forEach(visit);
};
visit(blueprint);

assert(modules.length === 1, 'blueprint must contain one module 76');
const [documentReview] = modules;
assert(documentReview.module === 'supabase:upsertARecord', 'Document Review must use the proven structured upsert module');
for (const field of ['merchant', 'amount', 'currency', 'transaction_date', 'document_type', 'status', 'error_reason']) {
  assert(Object.hasOwn(documentReview.mapper, field), `Document Review mapper must preserve ${field}`);
}

const migration = await readFile(
  new URL('supabase/migrations/20260902190000_allow_owner_purchase_document_confirmation.sql', workspaceUrl),
  'utf8',
);
assert(migration.includes("old.status = 'needs_review'"), 'confirmation must start from needs_review');
assert(migration.includes("new.status = 'parsed'"), 'confirmation must explicitly keep the purchase');
assert(migration.includes('new.amount >= 0'), 'confirmation must preserve genuine zero');
assert(migration.includes('new.amount is not null'), 'confirmation must reject unknown amounts');

console.log('Async processing and Document Review guard passed.');
