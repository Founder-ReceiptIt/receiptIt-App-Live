import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyEnvelope } from '../supabase/functions/inbound-email/email-classification.ts';

const workspaceUrl = new URL('../', import.meta.url);
const handler = await readFile(new URL('supabase/functions/inbound-email/index.ts', workspaceUrl), 'utf8');

const invoiceWithFooter = classifyEnvelope(
  'Fwd: Google Workspace: Your invoice is available for receiptit.co.uk',
  'Your Google Workspace monthly invoice is available. Invoice number 5665092027. To stop receiving emails, unsubscribe.',
);
assert.equal(invoiceWithFooter.classification, 'purchase_transactional');
assert.equal(invoiceWithFooter.ignoredReason, null);

const attachmentReceiptWithFooter = classifyEnvelope(
  'Receipt from Harbour Market',
  'Your purchase total was GBP 5.80. View in browser or unsubscribe.',
);
assert.equal(attachmentReceiptWithFooter.classification, 'purchase_transactional');

const bodyOnlyPurchaseWithFooter = classifyEnvelope(
  'Your recent purchase',
  'Receipt number HM-10001\nTOTAL GBP 5.80\nPaid by card\nUnsubscribe',
);
assert.equal(bodyOnlyPurchaseWithFooter.classification, 'purchase_transactional');

const forwardedOrder = classifyEnvelope(
  'Fwd: Order confirmation 10001',
  'Thank you for your order. View in browser.',
);
assert.equal(forwardedOrder.classification, 'purchase_transactional');

const marketing = classifyEnvelope(
  'September offers',
  'Our latest collection is here. View in browser. Unsubscribe.',
);
assert.equal(marketing.classification, 'marketing');
assert.equal(marketing.ignoredReason, 'marketing_filter_unsubscribe');

const newsletter = classifyEnvelope('Monthly newsletter', 'News from our team');
assert.equal(newsletter.classification, 'marketing');
assert.equal(newsletter.ignoredReason, 'marketing_filter_newsletter');

assert.equal(classifyEnvelope('Your parcel shipped', 'Tracking number 123').classification, 'delivery_or_fulfilment');
assert.equal(classifyEnvelope('Hello', 'A short personal message').classification, 'uncertain');

assert.match(handler, /ignored_reason: envelope\.ignoredReason/);
assert.match(handler, /\.eq\("provider_message_id", providerMessageId\)/);
assert.match(handler, /wasPreviouslyIgnored/);
assert.match(handler, /classification === "marketing" \? envelope\.ignoredReason : null/);
assert.match(handler, /MAX_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/);
assert.match(handler, /attachment_audit_failed/);
assert.match(handler, /providerByteSize !== null && providerByteSize > MAX_ATTACHMENT_BYTES/);
assert.equal([...handler.matchAll(/ignored:\s*true/g)].length, 1);

console.log('Inbound email classification guard: PASS');
