import fs from 'node:fs';
import path from 'node:path';

const imageSource = '/Users/nicholascave/Downloads/RECEIPTIT V2 - IMAGE PROCESSOR.blueprint (11).json';
const pdfSource = '/Users/nicholascave/Downloads/RECEIPTIT V2 - PDF PROCESSOR.blueprint (7).json';
const outputDirectory = path.resolve('tmp/calm-review-assist');

const image = JSON.parse(fs.readFileSync(imageSource, 'utf8'));
const pdf = JSON.parse(fs.readFileSync(pdfSource, 'utf8'));

const purchaseDocumentTypes = [
  'invoice',
  'order_confirmation',
  'payment_confirmation',
  'hotel_folio',
  'eftpos_slip',
  'other_purchase_proof',
];

const clone = (value) => JSON.parse(JSON.stringify(value));

const findModule = (flow, id) => {
  for (const module of flow || []) {
    if (module.id === id) return module;
    for (const route of module.routes || []) {
      const nested = findModule(route.flow, id);
      if (nested) return nested;
    }
  }
  return null;
};

const findRouter = (flow, id) => {
  const router = findModule(flow, id);
  if (!router?.routes) throw new Error(`Router ${id} not found`);
  return router;
};

const replaceReferences = (value, replacements) => {
  if (typeof value === 'string') {
    return Object.entries(replacements).reduce(
      (next, [from, to]) => next.replaceAll(`${from}.`, `${to}.`),
      value,
    );
  }
  if (Array.isArray(value)) return value.map((entry) => replaceReferences(entry, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceReferences(entry, replacements)]));
  }
  return value;
};

const textCondition = (a, b, o = 'text:equal') => ({ a, b, o });
const existsCondition = (a) => ({ a, o: 'exist' });
const missingCondition = (a) => ({ a, o: 'notexist' });

const completeDocumentGroups = ({ prefix, currencyExpression, currencyValue, includeItems }) => (
  purchaseDocumentTypes.map((documentType) => {
    const conditions = [
      textCondition(`{{${prefix}.document_type}}`, documentType),
      textCondition(`{{${prefix}.is_receipt}}`, 'true', 'boolean:equal'),
      existsCondition(`{{${prefix}.merchant_name}}`),
      existsCondition(`{{${prefix}.total_amount}}`),
      existsCondition(`{{${prefix}.transaction_date_iso}}`),
      textCondition(currencyExpression, currencyValue),
      textCondition(`{{${prefix}.confidence_score}}`, '0.85', 'number:greaterorequal'),
    ];
    if (includeItems && ['invoice', 'order_confirmation'].includes(documentType)) {
      conditions.push(textCondition(`{{length(${prefix}.items)}}`, '0', 'number:greater'));
    }
    return conditions;
  })
);

const reviewDocumentGroups = ({ prefix, currencyExpression, missingCurrencyValue }) => {
  const groups = [];
  for (const documentType of purchaseDocumentTypes) {
    const base = [
      textCondition(`{{${prefix}.document_type}}`, documentType),
      textCondition(currencyExpression, missingCurrencyValue, 'text:notequal'),
    ];
    for (const field of ['merchant_name', 'total_amount', 'transaction_date_iso']) {
      groups.push([...base, missingCondition(`{{${prefix}.${field}}`)]);
    }
    groups.push([...base, textCondition(`{{${prefix}.confidence_score}}`, '0.85', 'number:less')]);
    if (['invoice', 'order_confirmation'].includes(documentType)) {
      groups.push([...base, textCondition(`{{length(${prefix}.items)}}`, '0', 'number:equal')]);
    }
  }
  return groups;
};

const nonGbpDocumentGroups = ({ prefix, currencyExpression }) => (
  purchaseDocumentTypes.map((documentType) => [
    textCondition(`{{${prefix}.document_type}}`, documentType),
    existsCondition(currencyExpression),
    textCondition(currencyExpression, 'GBP', 'text:notequal'),
  ])
);

const reassessmentInstruction = [
  '',
  'REASSESSMENT: If the existing receipt context below says review_assist_requested, this is a targeted second pass over the same private evidence.',
  'Independently verify the unresolved merchant, amount, date, items, payment and reference fields against the source.',
  'Preserve a clearly supported existing fact unless the source provides stronger contradictory evidence.',
  'Never invent a value merely to complete the record. Return the same canonical schema.',
].join(' ');

const purchaseStubInstruction = [
  '',
  'A vendor-issued voucher, ticket stock, validation copy, customer copy, or similar stub can still be purchase evidence when it visibly records one completed SALE, PAID, or CHARGED amount.',
  'Wording such as NOT FOR TRAVEL, VOID FOR TRAVEL, NOT FOR RESALE, or CUSTOMER COPY describes how the paper may be used; it does not cancel an adjacent completed-transaction label and amount.',
  'Classify that form as other_purchase_proof (or eftpos_slip when terminal-led), preserve the clearly adjacent amount, and leave genuinely unreadable date or reference fields null for review.',
].join(' ');

// Image: expose the existing structured baseline to the retry extraction without
// changing the normal first-pass path.
const imageOwnership = findModule(image.flow, 69);
const selectParameter = imageOwnership.mapper.qs.find((entry) => entry.key === 'select');
selectParameter.value = 'id,status,error_reason,merchant,amount,currency,transaction_date,document_type,confidence_score';

const imageExtractor = findModule(image.flow, 13);
const imageRequest = JSON.parse(imageExtractor.mapper.body);
const imagePrompt = imageRequest.messages[0].content[0];
imagePrompt.text += purchaseStubInstruction + reassessmentInstruction
  + ' Existing receipt context: status={{69.body[1].status}}; reason={{69.body[1].error_reason}}; merchant={{69.body[1].merchant}}; amount={{69.body[1].amount}}; currency={{69.body[1].currency}}; purchase_date={{69.body[1].transaction_date}}; document_type={{69.body[1].document_type}}; prior_confidence={{69.body[1].confidence_score}}.';
imageExtractor.mapper.body = JSON.stringify(imageRequest);

const imageRouter = findRouter(image.flow, 10);
const imageReviewRouteIndex = imageRouter.routes.findIndex((route) => route.flow[0]?.id === 76);
const imageGbpRoute = imageRouter.routes.find((route) => route.flow[0]?.id === 27);
const imageNonGbpRoute = imageRouter.routes.find((route) => route.flow[0]?.id === 11);
const imageReviewRoute = imageRouter.routes[imageReviewRouteIndex];

let completeImageGbp = replaceReferences(clone(imageGbpRoute), { 27: 78, 74: 79 });
completeImageGbp.flow[0].id = 78;
completeImageGbp.flow[1].id = 79;
completeImageGbp.flow[0].filter = {
  name: 'Complete purchase evidence - GBP',
  conditions: completeDocumentGroups({ prefix: 14, currencyExpression: '{{15.result}}', currencyValue: 'GBP', includeItems: true }),
};
completeImageGbp.flow[1].metadata.designer.x += 100;
completeImageGbp.flow[1].metadata.designer.y += 100;

let completeImageNonGbp = replaceReferences(clone(imageNonGbpRoute), { 11: 80, 16: 81, 72: 82 });
completeImageNonGbp.flow[0].id = 80;
completeImageNonGbp.flow[1].id = 81;
completeImageNonGbp.flow[2].id = 82;
// Make module IDs are scenario-global, including error-handler modules. The
// converted purchase-evidence route is cloned from the receipt conversion
// route, so its copied error handler must receive fresh IDs as well.
completeImageNonGbp.flow[0].onerror = replaceReferences(
  completeImageNonGbp.flow[0].onerror,
  { 66: 83, 67: 84, 68: 85 },
);
for (const errorModule of completeImageNonGbp.flow[0].onerror || []) {
  if (errorModule.id === 66) errorModule.id = 83;
  if (errorModule.id === 67) errorModule.id = 84;
  if (errorModule.id === 68) errorModule.id = 85;
}
completeImageNonGbp.flow[0].filter = {
  name: 'Complete purchase evidence - converted',
  conditions: purchaseDocumentTypes.map((documentType) => {
    const conditions = [
      textCondition('{{14.document_type}}', documentType),
      textCondition('{{14.is_receipt}}', 'true', 'boolean:equal'),
      existsCondition('{{14.merchant_name}}'),
      existsCondition('{{14.total_amount}}'),
      existsCondition('{{14.transaction_date_iso}}'),
      existsCondition('{{15.result}}'),
      textCondition('{{15.result}}', 'GBP', 'text:notequal'),
      textCondition('{{15.result}}', '__MISSING_CURRENCY__', 'text:notequal'),
      textCondition('{{14.confidence_score}}', '0.85', 'number:greaterorequal'),
    ];
    if (['invoice', 'order_confirmation'].includes(documentType)) {
      conditions.push(textCondition('{{length(14.items)}}', '0', 'number:greater'));
    }
    return conditions;
  }),
};
completeImageNonGbp.flow.forEach((module, index) => {
  module.metadata.designer.x += 140 + index * 20;
  module.metadata.designer.y += 140;
});

imageReviewRoute.flow[0].filter.conditions = reviewDocumentGroups({
  prefix: 14,
  currencyExpression: '{{15.result}}',
  missingCurrencyValue: '__MISSING_CURRENCY__',
});

const imageCurrencyRoute = imageRouter.routes.find((route) => route.flow[0]?.id === 51);
const imageCurrencyTypeCondition = imageCurrencyRoute.flow[0].filter.conditions[0]
  .find((condition) => condition.a === '{{14.document_type}}');
imageCurrencyTypeCondition.b = '^(receipt|invoice|order_confirmation|payment_confirmation|hotel_folio|eftpos_slip|other_purchase_proof)$';
imageCurrencyTypeCondition.o = 'text:pattern';

imageRouter.routes.splice(imageReviewRouteIndex, 0, completeImageNonGbp, completeImageGbp);

// PDF: the original extraction already contains all Bayview items/payment data.
// Complete, high-confidence evidence now reaches the same canonical Finalise
// contract; only incomplete evidence remains in Document Review.
const pdfPrompt = findModule(pdf.flow, 32);
pdfPrompt.mapper.messages[0].content += reassessmentInstruction;
pdfPrompt.mapper.messages[1].content += '\nExisting receipt context: status={{3.status}}; reason={{3.error_reason}}; merchant={{3.merchant}}; amount={{3.amount}}; currency={{3.currency}}; purchase_date={{3.transaction_date}}; document_type={{3.document_type}}; prior_confidence={{3.confidence_score}}.';

const pdfRouter = findRouter(pdf.flow, 8);
const pdfReviewRouteIndex = pdfRouter.routes.findIndex((route) => route.flow[0]?.id === 34);
const pdfStandardRoute = pdfRouter.routes.find((route) => route.flow[0]?.id === 27);
const pdfReviewRoute = pdfRouter.routes[pdfReviewRouteIndex];
const completePdfRoute = replaceReferences(clone(pdfStandardRoute), { 27: 35 });
completePdfRoute.flow[0].id = 35;
completePdfRoute.flow[0].filter = {
  name: 'Complete purchase evidence',
  conditions: completeDocumentGroups({ prefix: 26, currencyExpression: '{{26.currency_code}}', currencyValue: 'GBP', includeItems: true }),
};
completePdfRoute.flow[0].metadata.designer.x += 120;
completePdfRoute.flow[0].metadata.designer.y += 120;
pdfReviewRoute.flow[0].filter.conditions = reviewDocumentGroups({
  prefix: 26,
  currencyExpression: '{{26.currency_code}}',
  missingCurrencyValue: '',
}).concat(nonGbpDocumentGroups({
  prefix: 26,
  currencyExpression: '{{26.currency_code}}',
}));

const pdfCurrencyRoute = pdfRouter.routes.find((route) => route.flow[0]?.id === 14);
const pdfCurrencyTypeCondition = pdfCurrencyRoute.flow[0].filter.conditions[0]
  .find((condition) => condition.a === '{{26.document_type}}');
pdfCurrencyTypeCondition.b = '^(receipt|invoice|order_confirmation|payment_confirmation|hotel_folio|eftpos_slip|other_purchase_proof)$';
pdfCurrencyTypeCondition.o = 'text:pattern';

pdfRouter.routes.splice(pdfReviewRouteIndex, 0, completePdfRoute);

const assertUniqueIds = (blueprint, label) => {
  const ids = [];
  const visit = (flow) => {
    for (const module of flow || []) {
      ids.push(module.id);
      visit(module.onerror);
      for (const route of module.routes || []) visit(route.flow);
    }
  };
  visit(blueprint.flow);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) throw new Error(`${label} contains duplicate module IDs: ${duplicates.join(', ')}`);
};

assertUniqueIds(image, 'Image blueprint');
assertUniqueIds(pdf, 'PDF blueprint');

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'RECEIPTIT V2 - IMAGE PROCESSOR.calm-review.blueprint.json'), JSON.stringify(image, null, 2));
fs.writeFileSync(path.join(outputDirectory, 'RECEIPTIT V2 - PDF PROCESSOR.calm-review.blueprint.json'), JSON.stringify(pdf, null, 2));

console.log(JSON.stringify({
  imageRoutes: imageRouter.routes.map((route) => ({ id: route.flow[0]?.id, name: route.flow[0]?.filter?.name || null })),
  pdfRoutes: pdfRouter.routes.map((route) => ({ id: route.flow[0]?.id, name: route.flow[0]?.filter?.name || null })),
  outputDirectory,
}, null, 2));
