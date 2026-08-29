import fs from 'node:fs';
import path from 'node:path';

const source = '/Users/nicholascave/Downloads/RECEIPTIT V2 - IMAGE PROCESSOR.blueprint (8).json';
const outputDirectory = path.resolve('tmp/capture-recovery-tests');
const destination = path.join(outputDirectory, 'RECEIPTIT V2 - IMAGE PROCESSOR.capture-recovery.blueprint.json');

const qualityReasonInstruction = ' If image quality prevents reliable validation or extraction, rejection_reason must be exactly one of image_blurry, image_too_dark, text_too_small, cropped_or_incomplete, long_receipt, or unreadable. Use a specific reason only when the visible evidence strongly supports it; otherwise use unreadable. Use not_purchase_document only when the visible content is clearly unrelated to a purchase, never merely because the image is illegible. Do not guess a quality reason.';
const incompleteReceiptInstruction = ' If a receipt image is cropped so the final total/payment/footer needed to establish one completed transaction is missing, set is_receipt to false and rejection_reason to cropped_or_incomplete, even when merchant or item fragments are visible. Never route an incomplete capture as a valid receipt with a missing total.';
const rejectionMarker = 'If not valid proof of purchase, set is_receipt to false and provide rejection_reason.';

const blueprint = JSON.parse(fs.readFileSync(source, 'utf8'));
const changedModuleIds = [];

const walkModules = (value) => {
  if (Array.isArray(value)) {
    value.forEach(walkModules);
    return;
  }
  if (!value || typeof value !== 'object') return;

  if ([13, 44].includes(value.id) && value.module === 'openai-gpt-3:makeApiCall') {
    const body = value.mapper?.body;
    if (typeof body !== 'string' || !body.includes(rejectionMarker)) {
      throw new Error(`Image extraction module ${value.id} did not match the expected live prompt`);
    }
    if (!body.includes('rejection_reason must be exactly one of image_blurry')) {
      value.mapper.body = body.replace(
        rejectionMarker,
        `${qualityReasonInstruction.trim()} ${incompleteReceiptInstruction.trim()} ${rejectionMarker}`,
      );
      changedModuleIds.push(value.id);
    }
  }

  if (value.id === 10 && value.module === 'builtin:BasicRouter') {
    const rejectionRoute = value.routes?.find((route) => route.flow?.[0]?.id === 50);
    const conditions = rejectionRoute?.flow?.[0]?.filter?.conditions;
    if (!Array.isArray(conditions) || conditions.length !== 1) {
      throw new Error('Receipt Validity rejection route did not match the expected live filter');
    }
    conditions.push([
      {
        a: '{{14.is_receipt}}',
        b: 'false',
        o: 'boolean:equal',
      },
    ]);
    changedModuleIds.push(value.id);
  }

  if (value.id === 50 && value.module === 'supabase:makeAnApiCall') {
    const body = value.mapper?.body;
    const expectedBody = '{"status":"rejected","error_reason":"not_purchase_document","document_type":"non_purchase_document"}';
    if (body !== expectedBody) {
      throw new Error('Reject Receipt Safely did not match the expected live request body');
    }
    value.mapper.body = '{"status":"rejected","error_reason":"{{14.rejection_reason}}","document_type":"{{14.document_type}}"}';
    changedModuleIds.push(value.id);
  }

  Object.values(value).forEach(walkModules);
};

walkModules(blueprint);

const expectedChangedModules = [10, 13, 44, 50];
if (JSON.stringify([...changedModuleIds].sort((a, b) => a - b)) !== JSON.stringify(expectedChangedModules)) {
  throw new Error(`Expected only modules ${expectedChangedModules.join(', ')}, changed ${changedModuleIds.join(', ')}`);
}

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(blueprint, null, 2)}\n`);
console.log(JSON.stringify({ destination, changedModuleIds }, null, 2));
