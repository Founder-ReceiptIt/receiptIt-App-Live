import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, activity, wallet, scan, app, settings] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260904160000_add_possible_duplicates_and_activity_v0.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/app/ActivityTab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/app/WalletTab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/app/ScanTab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/app/SettingsTab.tsx', import.meta.url), 'utf8'),
]);

assert.match(migration, /confidence between 0\.950 and 1\.000/);
assert.match(migration, /decision in \('pending', 'saved_anyway'\)/);
assert.match(migration, /conflicting_reference/);
assert.match(migration, /transaction_date = current_receipt\.transaction_date/);
assert.match(migration, /capture_gap between interval '0 seconds' and interval '2 hours'/);
assert.match(migration, /r\.file_hash <> current_receipt\.file_hash/);
assert.match(migration, /receiptit_possible_duplicates_select_own/);
assert.match(migration, /user_id = auth\.uid\(\)/);
assert.match(migration, /record_exact_duplicate_activity/);

assert.match(wallet, /Possible duplicate/);
assert.match(wallet, /View existing/);
assert.match(wallet, /Save anyway/);
assert.match(wallet, /keepPossibleDuplicate/);
assert.match(wallet, /table: 'receipt_possible_duplicates'/);
assert.match(scan, /find_existing_receipt_by_file_hash/);
assert.match(scan, /recordExactDuplicateActivity/);

assert.match(app, /'activity'/);
assert.match(activity, /\.from\('inbound_messages'\)/);
assert.match(activity, /\.from\('inbound_attachments'\)/);
assert.match(activity, /\.from\('purchase_activity'\)/);
assert.match(activity, /\.from\('receipt_possible_duplicates'\)/);
assert.doesNotMatch(activity, /sender_address|reply_to_address|subject|body_sha256/);
assert.match(activity, /message\.classification === 'marketing' && message\.status === 'ignored'/);
assert.match(activity, /Email received and added/);
assert.match(activity, /Email needs review/);
assert.match(activity, /Couldn’t process purchase email/);
assert.match(activity, /Duplicate already saved/);
assert.match(activity, /last 90 days/);

assert.match(settings, /receipt_possible_duplicates/);
assert.match(settings, /purchase_activity/);
assert.match(settings, /inbound_messages/);

console.log('Possible duplicate and Activity v0 guard: PASS');
