import fs from 'node:fs';

const files = {
  app: fs.readFileSync('src/App.tsx', 'utf8'),
  auth: fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8'),
  wallet: fs.readFileSync('src/components/app/WalletTab.tsx', 'utf8'),
  shareTarget: fs.readFileSync('src/lib/shareTargetInbox.ts', 'utf8'),
};

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(/key=\{`app-\$\{user\.id\}`\}/.test(files.app), 'authenticated app shell must remount for a new user identity');
check(/selectedReceipt\?\.userId === user\.id/.test(files.app), 'receipt modal must be gated to the current owner');
check(/profileLoading/.test(files.app), 'app shell must wait for the current profile');
check(/setSelectedReceipt\(null\)[\s\S]*\[user\?\.id\]/.test(files.app), 'selected receipt must clear when the auth identity changes');

check(/activeIdentityRef/.test(files.auth), 'auth provider must track identity transitions');
check(/prepareForIdentity\(session\?\.user\?\.id \?\? null\)/.test(files.auth), 'auth events must clear prior identity state before loading the next identity');
check(/clearShareTargetInbox/.test(files.auth), 'auth identity changes must clear unowned share-target payloads');
check(/removeItem\('isScanning'\)/.test(files.auth), 'auth identity changes must clear scan state');

check(/setReceipts\(\[\]\);[\s\S]*setLoading\(true\);/.test(files.wallet), 'Wallet must clear old rows synchronously before loading the next user');
check(/let active = true/.test(files.wallet) && /if \(!active\) return/.test(files.wallet), 'Wallet must ignore stale asynchronous query results');
check(/channel\(`receipts-changes-\$\{userId\}`\)/.test(files.wallet), 'realtime channel must be scoped per user identity');
check(/filter: `user_id=eq\.\$\{userId\}`/.test(files.wallet), 'realtime events must be server-filtered to the current user');

check(/transaction\.objectStore\(PENDING_STORE\)\.clear\(\)/.test(files.shareTarget), 'pending share payloads must be cleared');
check(/transaction\.objectStore\(EVENT_STORE\)\.clear\(\)/.test(files.shareTarget), 'share event state must be cleared');

if (failures.length) {
  console.error(`Account/session isolation guard failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Account/session isolation guard passed.');
