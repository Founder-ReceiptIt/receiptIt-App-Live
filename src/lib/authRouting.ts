export const SIGNUP_AUTHORIZATION_KEY = 'receiptit_signup_authorization';
export const EXISTING_USER_SIGN_IN_KEY = 'receiptit_existing_user_signin';
export const AUTHORISED_INTRO_COMPLETE_KEY = 'receiptit_authorised_intro_v2_complete';
export const BETA_DEVICE_GRANT_KEY = 'receiptit_beta_device_grant_v1';

export const migrateStartupState = () => {
  if (localStorage.getItem('receiptit_startup_version') === '3') return;
  // The previous boolean was a routing preference, never proof of beta access.
  sessionStorage.removeItem(EXISTING_USER_SIGN_IN_KEY);
  localStorage.removeItem('receiptit_product_intro_v1_complete');
  // Preserve the existing real signup token so the server can exchange it.
  // Supabase sessions, share payloads and unrelated preferences are untouched.
  localStorage.setItem('receiptit_startup_version', '3');
};

const PROTECTED_APP_HASHES = new Set([
  '#wallet',
  '#alias',
  '#scan',
  '#insights',
  '#activity',
  '#settings',
]);

export const hasProtectedAppHash = () => PROTECTED_APP_HASHES.has(window.location.hash.toLowerCase());

export const clearProtectedAppRoute = () => {
  if (!hasProtectedAppHash()) return;
  window.history.replaceState({ authRoute: 'public' }, '', `${window.location.pathname}${window.location.search}`);
};

export const prepareSignedOutRoute = () => {
  sessionStorage.removeItem(EXISTING_USER_SIGN_IN_KEY);
  sessionStorage.removeItem(SIGNUP_AUTHORIZATION_KEY);
  localStorage.setItem(AUTHORISED_INTRO_COMPLETE_KEY, 'true');
  window.history.replaceState({ authRoute: 'sign-in' }, '', '/signin');
};

export const normaliseAuthenticatedRoute = () => {
  sessionStorage.removeItem(EXISTING_USER_SIGN_IN_KEY);
  if (window.location.pathname === '/signin' || window.location.pathname === '/signup') {
    window.history.replaceState({ authRoute: 'app' }, '', `/${window.location.hash || '#wallet'}`);
  }
};
