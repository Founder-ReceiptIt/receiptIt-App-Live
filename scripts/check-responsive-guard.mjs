import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  'index.html',
  'src/index.css',
  'src/components/app/BottomNav.tsx',
  'src/components/app/TopNav.tsx',
  'src/components/app/AliasTab.tsx',
  'src/components/app/InsightsTab.tsx',
  'src/components/app/ReceiptModal.tsx',
  'src/components/app/ScanTab.tsx',
  'src/components/app/WalletTab.tsx',
  'src/lib/receiptAmountState.ts',
  'public/manifest.webmanifest',
  'src/components/auth/AlphaGatekeeper.tsx',
  'src/components/auth/ProductIntro.tsx',
  'src/components/auth/AuthForm.tsx',
  'src/components/auth/AliasSetupModal.tsx',
  'src/components/auth/CurrencySetupModal.tsx',
  'src/components/auth/ProfileRecoveryModal.tsx',
  'src/components/auth/ResetPasswordForm.tsx',
].map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), 'utf8')])));

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const viewportTags = files['index.html'].match(/<meta\s+name=["']viewport["'][^>]*>/gi) || [];
check(viewportTags.length === 1, 'index.html must contain exactly one viewport meta tag');
const viewport = viewportTags[0] || '';
check(/width=device-width/i.test(viewport), 'viewport must use the device width');
check(/initial-scale=1(?:["',\s]|$)/i.test(viewport), 'viewport must start at scale 1');
check(/viewport-fit=cover/i.test(viewport), 'viewport must cover safe-area devices');
check(!/maximum-scale|user-scalable/i.test(viewport), 'viewport must not disable accessible zoom');
check(/rel=["']manifest["']/.test(files['index.html']), 'PWA manifest must be linked');

const css = files['src/index.css'];
check(css.includes('100dvh'), 'dynamic viewport height support must remain enabled');
check(css.includes('100svh'), 'small viewport height fallback must remain enabled');
check(css.includes('safe-area-inset-top') && css.includes('safe-area-inset-bottom'), 'safe areas must be respected');
check(css.includes('-webkit-text-size-adjust: 100%'), 'Android/iOS text scaling normalisation must remain enabled');
check(/@media \(max-width: 767px\)[\s\S]*font-size: 16px !important/.test(css), 'mobile form controls must remain at least 16px');

const bottomNav = files['src/components/app/BottomNav.tsx'];
check(bottomNav.includes('min-w-0 flex-1'), 'each bottom navigation item must be allowed to shrink');
check(!bottomNav.includes('gap-1 px-4 py-2 group'), 'desktop-width bottom navigation padding must not return');
check(bottomNav.includes('ri-bottom-safe'), 'bottom navigation must respect the device safe area');

const topNav = files['src/components/app/TopNav.tsx'];
check(topNav.includes('hidden border-b') && topNav.includes('md:block'), 'top navigation chrome must be removed only below the desktop breakpoint');
check(/\.ri-app-content \{\s*padding-top: var\(--ri-safe-top\)/.test(css), 'mobile app content must start at the safe area without an empty header spacer');
check(/@media \(min-width: 768px\)[\s\S]*\.ri-app-content \{\s*padding-top: calc\(5rem \+ var\(--ri-safe-top\)\)/.test(css), 'desktop app content must retain space for the desktop header');

const receiptModal = files['src/components/app/ReceiptModal.tsx'];
check(receiptModal.includes('overflow-x-hidden overflow-y-auto'), 'receipt details must never require horizontal scrolling');
check(receiptModal.includes("const originalActionLabel = isNotReceiptDocument ? 'View document' : isDocumentReview ? 'View original' : 'View receipt'"), 'the signed-original action must use an explicit document-appropriate label');
check(receiptModal.includes('grid-cols-1') && receiptModal.includes('min-[380px]:grid-cols-[minmax(0,1fr)_auto]'), 'receipt details header must stack safely before reserving a shrinkable title column');
check(receiptModal.includes('sm:col-start-3 sm:row-start-1'), 'receipt amount must occupy the explicit desktop amount column');
check(receiptModal.includes('Receipt actions'), 'secondary receipt actions must remain in the compact action menu');
check(receiptModal.includes('absolute right-3 top-full'), 'the receipt action menu must anchor to the modal edge on narrow screens');
check(receiptModal.includes('isEditMode'), 'receipt details must retain a single receipt-wide edit mode');
check(!receiptModal.includes('<Pencil'), 'scattered receipt-field pencil actions must not return');

const wallet = files['src/components/app/WalletTab.tsx'];
const receiptAmountState = files['src/lib/receiptAmountState.ts'];
check(wallet.includes('aria-label="Open receipt camera"'), 'Wallet must retain an explicit one-tap camera action');
check(wallet.includes('onClick={onNavigateToScan}'), 'Wallet Quick Scan must reuse the existing Scan route');
check(wallet.includes('<span className="md:hidden">Quick scan</span>'), 'Wallet must label the mobile camera shortcut Quick scan');
check(wallet.includes('<span className="hidden md:inline">Scan receipt</span>'), 'Wallet must retain the desktop Scan receipt label');
check(wallet.includes('placeholder="Search receipts"'), 'Wallet must retain the concise receipt search control');
check(wallet.includes('grid-cols-[minmax(0,1fr)_auto]'), 'Wallet Search and Scan controls must share a compact responsive row');
check(!wallet.includes('Your purchases, in one place.'), 'the obsolete Wallet subtitle must not return');
check(!wallet.includes('>Purchases</h2>'), 'the redundant Purchases list label must not return');
check(receiptAmountState.includes("if (status === 'processing') return false"), 'active processing must remain excluded from actionable Wallet counts');
check(wallet.includes('Amount not found'), 'unknown receipt amounts must not be rendered as zero');
check(wallet.includes('Review details'), 'purchase documents must retain a clear review action');
check(!wallet.includes('<ReceiptIcon className="hidden h-5 w-5 text-gray-400 sm:block"'), 'Wallet select controls must not include a stray decorative icon');

const scan = files['src/components/app/ScanTab.tsx'];
check(scan.includes("showToast('Receipt added', 'Processing in the background.')"), 'Scan must release the user after the durable processing handoff');
check(!scan.includes('receipt-status-'), 'Scan must not wait for AI extraction after the durable handoff');
check(scan.includes("status: 'processing'"), 'Scan must commit a processing receipt before confirming it was added');
check(scan.includes("setAttribute('capture', 'environment')") && scan.includes("pickerModeRef.current = 'camera'"), 'mobile Quick scan must request the environment camera directly');
check(scan.includes('fileInputRef.current.click()'), 'mobile Quick scan must activate the native capture input without a receiptIt chooser');
check(scan.includes("? 'Ready to upload as one receipt.'"), 'one-image confirmation must use singular upload copy');
check(scan.includes(": 'We’ll read them together as one receipt.'"), 'multi-image confirmation must explain that pages form one receipt');
check(scan.indexOf('Upload receipt') < scan.indexOf('Add another page') && scan.indexOf('Add another page') < scan.indexOf('Choose a different image'), 'Scan review actions must keep the approved primary, secondary and tertiary order');
check(!scan.includes('>Add another image<') && !scan.includes('>Choose again<'), 'obsolete Scan review labels must not return');

const insights = files['src/components/app/InsightsTab.tsx'];
check(insights.includes('>Your spending</h1>'), 'the Insights page heading must use the approved Your spending title');
check(topNav.includes("label: 'Insights'"), 'the navigation tab must remain labelled Insights');

const productIntro = files['src/components/auth/ProductIntro.tsx'];
const gatekeeper = files['src/components/auth/AlphaGatekeeper.tsx'];
check(productIntro.includes('Everything after the purchase,') && productIntro.includes('handled.'), 'first-open introduction must retain the approved headline');
check(productIntro.includes('Private by design.'), 'first-open introduction must retain the measured privacy statement');
check(!productIntro.includes('setTimeout') && !productIntro.includes('auto-advance'), 'first-open introduction must remain user-controlled');
check(gatekeeper.includes("receiptit_product_intro_v1_complete"), 'first-open completion must use a non-sensitive local preference');
check(gatekeeper.includes('sessionStorage.setItem(existingSignInKey'), 'existing users must retain the direct sign-in path');

const alias = files['src/components/app/AliasTab.tsx'];
check(alias.includes('Your private receipt email'), 'Alias page must lead with plain-English private receipt email terminology');
check(alias.includes('Copy email'), 'Alias page must use the approved Copy email action');
check(alias.includes('receiptit_private_email_intro_seen:'), 'Alias education callout must be account-scoped and one-time');

const manifest = JSON.parse(files['public/manifest.webmanifest']);
check(manifest.shortcuts?.some((shortcut) => shortcut.name === 'Scan receipt' && shortcut.url === '/#scan'), 'PWA manifest must expose the Scan receipt shortcut');

check(!files['src/components/app/AliasTab.tsx'].includes('whitespace-nowrap'), 'long purchase addresses must be allowed to wrap');
check(files['src/components/auth/AuthForm.tsx'].includes('ri-auth-page'), 'authentication must use the scroll-safe page layout');
check(files['src/components/auth/ResetPasswordForm.tsx'].includes('ri-auth-page'), 'password recovery must use the scroll-safe page layout');

for (const path of [
  'src/components/auth/AlphaGatekeeper.tsx',
  'src/components/auth/AliasSetupModal.tsx',
  'src/components/auth/CurrencySetupModal.tsx',
  'src/components/auth/ProfileRecoveryModal.tsx',
]) {
  check(files[path].includes('ri-scroll-viewport'), `${path} must remain vertically scrollable on short devices`);
}

if (failures.length) {
  console.error(`Responsive guard failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Responsive guard passed.');
}
