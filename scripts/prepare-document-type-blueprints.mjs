import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sources = {
  image: '/Users/nicholascave/Downloads/RECEIPTIT V2 - IMAGE PROCESSOR.blueprint (3).json',
  pdf: '/Users/nicholascave/Downloads/RECEIPTIT V2 - PDF PROCESSOR.blueprint (3).json',
};
const finaliseSource = '/Users/nicholascave/Downloads/RECEIPTIT V2 - FINALISE RECEIPT.blueprint (3).json';
const outDir = path.join(root, 'tmp', 'document-type-blueprints');
fs.mkdirSync(outDir, { recursive: true });

const types = ['invoice', 'order_confirmation', 'payment_confirmation', 'hotel_folio', 'eftpos_slip', 'other_purchase_proof'];
const instruction = ' Add document_type as a required top-level field. Set it exactly once: a completed conventional retail receipt is receipt; invoice is invoice; order confirmation is order_confirmation; payment confirmation is payment_confirmation; hotel folio is hotel_folio; EFTPOS/payment-terminal slip is eftpos_slip; other legitimate purchase evidence is other_purchase_proof; bank statements, screenshots, and unrelated documents are non_purchase_document. A merchant name, amount, card/account data, or transaction table alone never makes a document purchase evidence. Set is_receipt=true for receipt and valid purchase evidence, and false only for non_purchase_document.';
const pdfClassification = ' document_type describes the document form, independently of whether it is valid purchase evidence. receipt is only a conventional completed retail/POS receipt; never use it as a generic label for merchant plus items plus total. Prefer explicit form and the most specific non-receipt type: Invoice/Tax Invoice, invoice number, Bill To, due date, terms, amount due or balance due means invoice even if paid; order confirmation/order number/delivery information means order_confirmation; transfer or charge confirmation means payment_confirmation; terminal IDs, authorization code, card masking or approved status means eftpos_slip even if it says receipt; accommodation stay charges mean hotel_folio. Bank/account statements, arbitrary screenshots and unrelated documents are non_purchase_document even if they contain merchant names, dates and amounts.';

function walk(value, found = []) {
  if (Array.isArray(value)) value.forEach((item) => walk(item, found));
  else if (value && typeof value === 'object') {
    if (Number.isInteger(value.id) && typeof value.module === 'string') found.push(value);
    Object.values(value).forEach((item) => walk(item, found));
  }
  return found;
}
function modules(blueprint) { return walk(blueprint); }
function moduleById(blueprint, id) {
  const found = modules(blueprint).find((module) => module.id === id);
  if (!found) throw new Error(`Module ${id} missing`);
  return found;
}
function addInterfaceField(module) {
  const fields = module.metadata.interface;
  if (!fields.some((field) => field.name === 'document_type')) {
    fields.splice(3, 0, { name: 'document_type', type: 'text', label: 'Document type' });
  }
}
function addPromptField(module) {
  if (Array.isArray(module.mapper.messages)) {
    const message = module.mapper.messages.find((item) => item.role === 'system');
    if (!message || !message.content.includes('Return exactly one JSON object')) throw new Error(`Prompt missing on ${module.id}`);
    if (!message.content.includes('document_type')) message.content = message.content.replace('is_receipt, confidence_score, rejection_reason,', 'is_receipt, confidence_score, rejection_reason, document_type,') + instruction;
    return;
  }
  if (typeof module.mapper.body !== 'string' || !module.mapper.body.includes('is_receipt, confidence_score, rejection_reason,')) throw new Error(`Prompt body missing on ${module.id}`);
  if (!module.mapper.body.includes('document_type')) {
    module.mapper.body = module.mapper.body.replace('is_receipt, confidence_score, rejection_reason,', 'is_receipt, confidence_score, rejection_reason, document_type,');
    module.mapper.body = module.mapper.body.replace('Return JSON only.', `Return JSON only.${instruction}`);
  }
}
function appendReceiptCondition(filter, expression) {
  if (!filter?.conditions?.[0]) throw new Error('Expected router filter');
  const conditions = filter.conditions[0];
  if (!conditions.some((item) => item.a === expression && item.b === 'receipt')) {
    conditions.push({ a: expression, b: 'receipt', o: 'text:equal' });
  }
}
function reviewFilter(expression) {
  return {
    name: 'Document review',
    conditions: types.map((type) => [{ a: expression, b: type, o: 'text:equal' }]),
  };
}
function reviewModuleFrom(source, id, expression, bodyBuilder) {
  const copy = structuredClone(source);
  copy.id = id;
  copy.filter = reviewFilter(expression);
  copy.metadata = copy.metadata || {};
  copy.metadata.designer = { ...(copy.metadata.designer || {}), x: (copy.metadata.designer?.x ?? 0), y: 450, name: 'Document Review' };
  bodyBuilder(copy);
  return copy;
}
function nextId(blueprint) { return Math.max(...modules(blueprint).map((module) => module.id)) + 1; }

const image = JSON.parse(fs.readFileSync(sources.image, 'utf8'));
for (const id of [13, 44]) addPromptField(moduleById(image, id));
for (const id of [14, 45]) addInterfaceField(moduleById(image, id));
const imageRouter = moduleById(image, 10);
const imageReject = imageRouter.routes[1].flow[0];
imageReject.filter = { name: 'Not a purchase document', conditions: [[{ a: '{{14.document_type}}', b: 'non_purchase_document', o: 'text:equal' }]] };
imageReject.mapper.body = '{"status":"rejected","error_reason":"not_purchase_document","document_type":"non_purchase_document"}';
for (const route of [imageRouter.routes[0], imageRouter.routes[2], imageRouter.routes[3]]) appendReceiptCondition(route.flow[0].filter, '{{14.document_type}}');
const imageReviewId = nextId(image);
imageRouter.routes.splice(2, 0, { flow: [reviewModuleFrom(imageReject, imageReviewId, '{{14.document_type}}', (module) => {
  module.mapper.body = '{"status":"needs_review","error_reason":"non_standard_purchase_document","document_type":"{{14.document_type}}"}';
})] });

const pdf = JSON.parse(fs.readFileSync(sources.pdf, 'utf8'));
addPromptField(moduleById(pdf, 32));
const pdfSystem = moduleById(pdf, 32).mapper.messages.find((message) => message.role === 'system');
if (!pdfSystem.content.includes('document_type describes the document form')) pdfSystem.content += pdfClassification;
addInterfaceField(moduleById(pdf, 26));
const pdfRouter = moduleById(pdf, 8);
const pdfReject = pdfRouter.routes[0].flow[0];
pdfReject.filter = { name: 'Not a purchase document', conditions: [[{ a: '{{26.document_type}}', b: 'non_purchase_document', o: 'text:equal' }]] };
pdfReject.mapper.status = 'rejected';
pdfReject.mapper.error_reason = 'not_purchase_document';
pdfReject.mapper.document_type = 'non_purchase_document';
if (!pdfReject.metadata.expect.some((field) => field.name === 'document_type')) pdfReject.metadata.expect.push({ name: 'document_type', type: 'text', label: 'document_type', required: false });
appendReceiptCondition(pdfRouter.routes[1].flow[0].filter, '{{26.document_type}}');
pdfRouter.routes[2].flow[0].filter = {
  name: 'Standard receipt',
  conditions: [[
    { a: '{{26.document_type}}', b: 'receipt', o: 'text:equal' },
    { a: '{{26.is_receipt}}', b: 'true', o: 'boolean:equal' }
  ]]
};
const pdfReviewId = nextId(pdf);
pdfRouter.routes.splice(1, 0, { flow: [reviewModuleFrom(pdfReject, pdfReviewId, '{{26.document_type}}', (module) => {
  module.mapper.status = 'needs_review';
  module.mapper.error_reason = 'non_standard_purchase_document';
  module.mapper.document_type = '{{26.document_type}}';
  module.mapper.merchant = '{{26.merchant_name}}';
  module.mapper.amount = '{{26.total_amount}}';
  module.mapper.currency = '{{26.currency_code}}';
  module.mapper.transaction_date = '{{26.transaction_date_iso}}';
  module.mapper.short_summary = '{{26.short_summary}}';
})] });

for (const [name, blueprint] of Object.entries({ image, pdf })) {
  const file = path.join(outDir, `RECEIPTIT V2 - ${name.toUpperCase()} PROCESSOR.document-type.blueprint.json`);
  fs.writeFileSync(file, JSON.stringify(blueprint, null, 2) + '\n');
  JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(file);
}

const finalise = JSON.parse(fs.readFileSync(finaliseSource, 'utf8'));
const finaliseParse = moduleById(finalise, 3);
addInterfaceField(finaliseParse);
const finaliseParsed = moduleById(finalise, 11);
if (!finaliseParsed.mapper.body.includes('document_type')) {
  finaliseParsed.mapper.body = finaliseParsed.mapper.body.replace('"parsed_at":"{{now}}"', '"parsed_at":"{{now}}","document_type":"{{3.document_type}}"');
}
const finaliseFile = path.join(outDir, 'RECEIPTIT V2 - FINALISE RECEIPT.document-type.blueprint.json');
fs.writeFileSync(finaliseFile, JSON.stringify(finalise, null, 2) + '\n');
JSON.parse(fs.readFileSync(finaliseFile, 'utf8'));
console.log(finaliseFile);
