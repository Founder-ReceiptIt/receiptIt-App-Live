import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getProofImagePlacement, readJpegExifOrientation } from '../supabase/functions/generate-proof-pack/image-orientation.ts';

const makeExifJpeg = (orientation) => {
  const bytes = new Uint8Array(40);
  bytes.set([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22], 0);
  bytes.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6);
  bytes.set([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08], 12);
  bytes.set([0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01], 20);
  bytes[30] = 0;
  bytes[31] = orientation;
  bytes.set([0xff, 0xd9], 38);
  return bytes;
};

for (const orientation of [1, 3, 6, 8]) {
  assert.equal(readJpegExifOrientation(makeExifJpeg(orientation)), orientation);
}
assert.equal(readJpegExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 1);

const portraitPhone = getProofImagePlacement({
  sourceWidth: 4032,
  sourceHeight: 3024,
  orientation: 6,
  pageWidth: 595,
  pageHeight: 842,
  maxWidth: 499,
  maxHeight: 746,
});
assert.equal(portraitPhone.rotation, 270);
assert.ok(Math.abs(portraitPhone.width) > Math.abs(portraitPhone.height));
assert.ok(Math.abs(portraitPhone.height) <= 499 && Math.abs(portraitPhone.width) <= 746);

const landscape = getProofImagePlacement({
  sourceWidth: 1600,
  sourceHeight: 900,
  orientation: 1,
  pageWidth: 595,
  pageHeight: 842,
  maxWidth: 499,
  maxHeight: 746,
});
assert.equal(landscape.rotation, 0);
assert.ok(landscape.width > landscape.height);

const [insights, modal, migration, proofPack] = await Promise.all([
  readFile(new URL('../src/components/app/InsightsTab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/app/ReceiptModal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260904120000_add_category_and_receipt_evidence_recovery.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/generate-proof-pack/index.ts', import.meta.url), 'utf8'),
]);

assert.match(insights, /relative h-36 w-full/);
assert.match(insights, /absolute inset-x-0 bottom-0/);
assert.match(insights, /month\.amount > 0/);
assert.match(modal, /aria-label="Receipt category"/);
assert.match(modal, /Add a clearer photo/);
assert.match(modal, /addClearerReceiptPhoto/);
assert.doesNotMatch(modal, /Still analyzing/);
assert.match(migration, /receipt_evidence_versions/);
assert.match(migration, /receiptit_receipt_evidence_versions_select_own/);
assert.match(migration, /add_clearer_receipt_photo/);
assert.match(migration, /preserve_known_receipt_fields_after_clearer_photo/);
assert.match(proofPack, /readJpegExifOrientation/);
assert.match(proofPack, /getProofImagePlacement/);

console.log('Lewis beta UX guard passed.');
