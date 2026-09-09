import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scan = await readFile(new URL('../src/components/app/ScanTab.tsx', import.meta.url), 'utf8');

assert.match(scan, /if \(files\.some\(isPdfSelection\)\) \{/);
assert.match(scan, /if \(files\.length !== 1\) \{/);
assert.match(scan, /setSelectedImageFiles\(\[\]\);/);
assert.ok(
  scan.indexOf('if (files.some(isPdfSelection)) {') < scan.indexOf("} else if (pickerMode === 'camera') {"),
  'PDF handling must outrank stale camera recovery state',
);

assert.match(scan, /type="file"[\s\S]*multiple/);
assert.match(scan, /selectedImageFiles\.length === 1[\s\S]*Ready to upload as one receipt\./);
assert.match(scan, /We’ll read them together as one receipt\./);
assert.match(scan, /aria-label=\{`\$\{selectedImageFiles\.length\} images in selection order`\}/);
assert.match(scan, /selectedImageFiles\.map\(\(file, index\)/);
assert.match(scan, /handleContinueMultiImageReceipt/);
assert.match(scan, /if \(isScanningRef\.current \|\| selectedImageFiles\.length < 1\)/);

const uploadIndex = scan.indexOf('Upload receipt');
const addPageIndex = scan.indexOf('Add another page');
const reselectIndex = scan.indexOf('Choose a different image');
assert.ok(uploadIndex > -1 && uploadIndex < addPageIndex && addPageIndex < reselectIndex);
assert.doesNotMatch(scan, />Add another image</);
assert.doesNotMatch(scan, />Continue<\/button>/);
assert.doesNotMatch(scan, />Choose again<\/button>/);

console.log('Scan review and multi-image guard: PASS');
