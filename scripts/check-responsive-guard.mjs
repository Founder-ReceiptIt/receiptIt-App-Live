import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  'index.html',
  'src/index.css',
  'src/components/app/BottomNav.tsx',
  'src/components/app/AliasTab.tsx',
  'src/components/auth/AlphaGatekeeper.tsx',
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
