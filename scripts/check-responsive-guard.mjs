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
check(topNav.includes('hidden border-b') && topNav.includes('lg:block') && bottomNav.includes('lg:hidden'), 'top and bottom navigation must share the tablet-safe desktop breakpoint');
check(/\.ri-app-content \{\s*padding-top: var\(--ri-safe-top\)/.test(css), 'mobile app content must start at the safe area without an empty header spacer');
check(/@media \(min-width: 1024px\)[\s\S]*\.ri-app-content \{\s*padding-top: calc\(5rem \+ var\(--ri-safe-top\)\)/.test(css), 'desktop app content must retain space for the desktop header at the tablet-safe breakpoint');

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
check(wallet.includes('onClick={onNavigateToScan}') && wallet.includes('Quick scan'), 'Wallet must retain an explicit one-tap camera action');
check(wallet.includes('onClick={onNavigateToScan}'), 'Wallet Quick Scan must reuse the existing Scan route');
check(wallet.includes('<span>Quick scan</span>') && !wallet.includes('<span className="hidden lg:inline">Scan receipt</span>'), 'Wallet must share the Quick scan label across desktop and mobile');
check(wallet.includes('{currentMonthLabel} spend') && !wallet.includes('} spent`'), 'Wallet must use the dynamic month heading without an amount suffix');
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
check(scan.includes('setCameraOpen(true)') && scan.includes("handleSelectedFiles([file], 'camera')"), 'Quick scan must open the shared camera and retain the existing photo intake');
check(!scan.includes("setAttribute('capture', 'environment')"), 'camera actions must not use the mixed PDF/image chooser');
check(scan.includes("? 'Ready to upload as one receipt.'"), 'one-image confirmation must use singular upload copy');
check(scan.includes(": 'We’ll read them together as one receipt.'"), 'multi-image confirmation must explain that pages form one receipt');
check(scan.indexOf('Upload receipt') < scan.indexOf('Add another page') && scan.indexOf('Add another page') < scan.indexOf('Choose a different image'), 'Scan review actions must keep the approved primary, secondary and tertiary order');
check(!scan.includes('>Add another image<') && !scan.includes('>Choose again<'), 'obsolete Scan review labels must not return');

const insights = files['src/components/app/InsightsTab.tsx'];
check(insights.includes('>Your spending</h1>'), 'the Insights page heading must use the approved Your spending title');
check(topNav.includes("label: 'Insights'"), 'the navigation tab must remain labelled Insights');

const productIntro = files['src/components/auth/ProductIntro.tsx'];
const gatekeeper = files['src/components/auth/AlphaGatekeeper.tsx'];
check(/<ReceiptItIntroAnimation\b/.test(productIntro) && !productIntro.includes('Everything after the purchase,'), 'first-open introduction must use the approved full animation instead of the old slogan');
check(!productIntro.includes('ReceiptItWordmark') && productIntro.includes('How receiptIt works'), 'first-open introduction must use the animation heading without a second wordmark');
check(!productIntro.includes('setTimeout') && !productIntro.includes('auto-advance'), 'first-open introduction must remain user-controlled');
check(gatekeeper.includes('AUTHORISED_INTRO_COMPLETE_KEY'), 'authorised intro completion must use a non-sensitive session preference');
check(gatekeeper.indexOf('if (session)') < gatekeeper.indexOf("if (gateState === 'authorised' && !hasCompletedAuthorisedIntro"), 'existing users must bypass the new-user introduction');
check(!gatekeeper.includes('Already have an account? Sign in'), 'public access gate must not expose sign in before device approval');
check(!productIntro.includes('Already have an account? Sign in'), 'existing-user sign in must remain outside the authorised new-user introduction');

const alias = files['src/components/app/AliasTab.tsx'];
check(alias.includes('Your new private email'), 'Alias page must use the approved private email heading');
check(!alias.includes('Use this when a shop asks'), 'Alias page must not restore the removed explanatory subheading');
check(alias.includes('Copy email'), 'Alias page must use the approved Copy email action');
check(!alias.includes('Why use this?'), 'the repetitive private-email callout must stay removed');
check(alias.includes('Stop the spam') && alias.includes('Send receipts here') && (alias.match(/<h2 /g) || []).length === 2 && !alias.includes('Keeps your main inbox'), 'the private-email page must contain exactly the two current supporting sections without a redundant footer');
check(topNav.includes("label: 'Receipt email'"), 'desktop navigation must use consumer-facing Receipt email terminology');
check(bottomNav.includes("label: 'Email'"), 'mobile navigation must use the concise Email label');

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
