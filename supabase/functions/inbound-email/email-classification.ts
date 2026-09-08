export type InboundEmailClassification =
  | "purchase_transactional"
  | "return_or_refund"
  | "delivery_or_fulfilment"
  | "warranty_or_service"
  | "marketing"
  | "uncertain";

export type EnvelopeClassification = {
  classification: InboundEmailClassification;
  ignoredReason: string | null;
};

const explicitPurchaseSubject = /\b(receipt|invoice|tax invoice|order confirmation|payment confirmation)\b/i;
const explicitPurchaseBody = /\b(invoice number|tax invoice|order confirmation|payment confirmation|receipt(?:\s+(?:from|for|number|no\.?|#))|thank you for your order)\b/i;

const marketingRules: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bunsubscribe\b/i, reason: "marketing_filter_unsubscribe" },
  { pattern: /\bview in browser\b/i, reason: "marketing_filter_view_in_browser" },
  { pattern: /\bsale ends\b/i, reason: "marketing_filter_sale_ends" },
  { pattern: /\bpromotional offer\b/i, reason: "marketing_filter_promotional_offer" },
  { pattern: /\bnewsletter\b/i, reason: "marketing_filter_newsletter" },
];

/**
 * Classify only the provider-supplied envelope/body text. The document itself
 * remains untrusted evidence and is classified later by the receipt processor.
 *
 * Transaction form signals deliberately outrank weak marketing-footer phrases.
 * Transactional senders commonly append "unsubscribe" or "view in browser" to
 * genuine invoices and receipts; those boilerplate phrases must not discard an
 * attached purchase document before the processor can inspect it.
 */
export const classifyEnvelope = (subject: string, body: string): EnvelopeClassification => {
  const safeSubject = subject.slice(0, 2_000);
  const safeBody = body.slice(0, 12_000);
  const sample = `${safeSubject}\n${safeBody}`;

  const strongMarketingSubjectRule = marketingRules
    .slice(2)
    .find(({ pattern }) => pattern.test(safeSubject));
  if (strongMarketingSubjectRule) {
    return { classification: "marketing", ignoredReason: strongMarketingSubjectRule.reason };
  }

  if (explicitPurchaseSubject.test(safeSubject) || explicitPurchaseBody.test(safeBody)) {
    return { classification: "purchase_transactional", ignoredReason: null };
  }

  const marketingRule = marketingRules.find(({ pattern }) => pattern.test(sample));
  if (marketingRule) {
    return { classification: "marketing", ignoredReason: marketingRule.reason };
  }

  if (/refund|returned|return accepted/i.test(sample)) {
    return { classification: "return_or_refund", ignoredReason: null };
  }
  if (/warranty|service booking|repair/i.test(sample)) {
    return { classification: "warranty_or_service", ignoredReason: null };
  }
  if (/delivered|out for delivery|tracking number|shipped/i.test(sample)) {
    return { classification: "delivery_or_fulfilment", ignoredReason: null };
  }
  if (/receipt|invoice|order confirmation|payment confirmation|thank you for your order|total/i.test(sample)) {
    return { classification: "purchase_transactional", ignoredReason: null };
  }
  return { classification: "uncertain", ignoredReason: null };
};
