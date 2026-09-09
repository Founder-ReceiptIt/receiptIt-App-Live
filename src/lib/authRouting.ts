export const SIGNUP_AUTHORIZATION_KEY = 'receiptit_signup_authorization';
export const EXISTING_USER_SIGN_IN_KEY = 'receiptit_existing_user_signin';
export const AUTHORISED_INTRO_COMPLETE_KEY = 'receiptit_authorised_intro_v2_complete';

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

export const openExistingUserSignIn = () => {
  sessionStorage.setItem(EXISTING_USER_SIGN_IN_KEY, 'true');
  sessionStorage.removeItem(SIGNUP_AUTHORIZATION_KEY);
  sessionStorage.removeItem(AUTHORISED_INTRO_COMPLETE_KEY);
  window.history.replaceState({ authRoute: 'sign-in' }, '', '/signin');
};

export const prepareSignedOutRoute = () => {
  sessionStorage.setItem(EXISTING_USER_SIGN_IN_KEY, 'true');
  sessionStorage.removeItem(SIGNUP_AUTHORIZATION_KEY);
  sessionStorage.removeItem(AUTHORISED_INTRO_COMPLETE_KEY);
  window.history.replaceState({ authRoute: 'sign-in' }, '', '/signin');
};

export const normaliseAuthenticatedRoute = () => {
  sessionStorage.removeItem(EXISTING_USER_SIGN_IN_KEY);
  if (window.location.pathname === '/signin' || window.location.pathname === '/signup') {
    window.history.replaceState({ authRoute: 'app' }, '', `/${window.location.hash || '#wallet'}`);
  }
};
