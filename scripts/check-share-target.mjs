import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const worker = await readFile(new URL('../public/share-target-sw.js', import.meta.url), 'utf8');
const scan = await readFile(new URL('../src/components/app/ScanTab.tsx', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');

assert.equal(manifest.share_target.action, '/share-target');
assert.equal(manifest.share_target.method, 'POST');
assert.equal(manifest.share_target.enctype, 'multipart/form-data');
assert.deepEqual(manifest.share_target.params.files[0].accept, [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

assert.match(worker, /event\.request\.method === 'POST'/);
assert.match(worker, /request\.formData\(\)/);
assert.match(worker, /MAX_FILE_BYTES = 10 \* 1024 \* 1024/);
assert.match(worker, /MAX_TOTAL_BYTES = 30 \* 1024 \* 1024/);
assert.match(worker, /PENDING_TTL_MS = 60 \* 60 \* 1000/);
assert.doesNotMatch(worker, /await\s+fetch\s*\(/i);
assert.doesNotMatch(worker, /console\.(?:log|info|warn|error)/);

assert.match(scan, /readPendingShareTarget/);
assert.match(scan, /validateReceiptUpload/);
assert.match(scan, /computeMultiImageHash/);
assert.match(scan, /completePendingShare\('duplicate_detected'\)/);
assert.match(scan, /completePendingShare\('processing_handoff'\)/);
assert.match(scan, /recordShareTargetEvent\(shareTargetId, 'ingestion_started'\)/);
assert.match(scan, /For now, save or screenshot the receipt/);
assert.match(main, /serviceWorker\.register\('\/share-target-sw\.js'/);

console.log('Share-target foundation checks passed.');
