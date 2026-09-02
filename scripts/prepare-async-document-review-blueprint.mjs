import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const workspace = resolve(import.meta.dirname, '..');
const [imageSourceArgument, pdfReferenceArgument, outputArgument] = process.argv.slice(2);
const imageBlueprintPath = imageSourceArgument
  ? resolve(imageSourceArgument)
  : resolve(workspace, 'tmp/capture-recovery-tests/RECEIPTIT V2 - IMAGE PROCESSOR.capture-recovery.blueprint.json');
const pdfBlueprintPath = pdfReferenceArgument
  ? resolve(pdfReferenceArgument)
  : resolve(workspace, 'tmp/real-world-quality-blueprints/RECEIPTIT V2 - PDF PROCESSOR.real-world-quality.blueprint.json');
const outputPath = outputArgument
  ? resolve(outputArgument)
  : resolve(workspace, 'tmp/async-document-review/RECEIPTIT V2 - IMAGE PROCESSOR.document-review-data.blueprint.json');

const imageBlueprint = JSON.parse(await readFile(imageBlueprintPath, 'utf8'));
const pdfBlueprint = JSON.parse(await readFile(pdfBlueprintPath, 'utf8'));

const findModules = (value, predicate, matches = []) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => findModules(entry, predicate, matches));
    return matches;
  }

  if (!value || typeof value !== 'object') return matches;
  if (predicate(value)) matches.push(value);
  Object.values(value).forEach((entry) => findModules(entry, predicate, matches));
  return matches;
};

const [imageDocumentReview] = findModules(
  imageBlueprint,
  (module) => module.id === 76 && module.metadata?.designer?.name === 'Document Review',
);
const [pdfDocumentReview] = findModules(
  pdfBlueprint,
  (module) => module.metadata?.designer?.name === 'Document Review' && module.module === 'supabase:upsertARecord',
);

if (!imageDocumentReview || !pdfDocumentReview) {
  throw new Error('Could not locate the Image and PDF Document Review modules.');
}

if (imageDocumentReview.module !== 'supabase:makeAnApiCall') {
  throw new Error(`Image Document Review module has unexpected type: ${imageDocumentReview.module}`);
}

const preservedFilter = structuredClone(imageDocumentReview.filter);
const preservedDesigner = structuredClone(imageDocumentReview.metadata.designer);
const replacement = structuredClone(pdfDocumentReview);

replacement.id = 76;
replacement.filter = preservedFilter;
replacement.parameters = { __IMTCONN__: 4459175 };
replacement.mapper = {
  id: '{{3.receipt_id}}',
  table: 'receipts',
  amount: '{{14.total_amount}}',
  status: 'needs_review',
  user_id: '{{3.user_id}}',
  currency: '{{14.currency_code}}',
  merchant: '{{14.merchant_name}}',
  vat_amount: '{{14.vat_amount}}',
  category: '{{14.category}}',
  image_url: '{{3.image_url}}',
  subtotal: '{{14.subtotal_amount}}',
  source: '{{3.source}}',
  error_reason: 'non_standard_purchase_document',
  storage_path: '{{3.storage_path}}',
  card_last_4: '{{14.card_last_4}}',
  document_type: '{{14.document_type}}',
  short_summary: '{{14.short_summary}}',
  confidence_score: '{{14.confidence_score}}',
  transaction_date: '{{14.transaction_date_iso}}',
  discount_amount: '{{14.discount_amount}}',
  customer_number: '{{14.customer_number}}',
  order_number: '{{14.order_number}}',
  invoice_number: '{{14.invoice_number}}',
  loyalty_member_id: '{{14.loyalty_member_id}}',
  merchant_phone: '{{14.merchant_phone}}',
  merchant_email: '{{14.merchant_email}}',
  merchant_website: '{{14.merchant_website}}',
  merchant_address: '{{14.merchant_address}}',
  merchant_vat_number: '{{14.merchant_vat_number}}',
  merchant_company_number: '{{14.merchant_company_number}}',
};
replacement.metadata.designer = preservedDesigner;
replacement.metadata.designer.name = 'Document Review';

for (const key of Object.keys(imageDocumentReview)) delete imageDocumentReview[key];
Object.assign(imageDocumentReview, replacement);

const changedModules = findModules(
  imageBlueprint,
  (module) => module.id === 76,
);
if (changedModules.length !== 1 || changedModules[0].module !== 'supabase:upsertARecord') {
  throw new Error('Prepared blueprint did not contain exactly one repaired module 76.');
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(imageBlueprint, null, 2)}\n`);

console.log(outputPath);
console.log('Module 76 now preserves Document Review fields without changing the proven Image extraction prompts.');
