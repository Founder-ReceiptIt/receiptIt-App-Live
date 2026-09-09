import { BETA_DEVICE_GRANT_KEY, SIGNUP_AUTHORIZATION_KEY } from './authRouting';
import { startupFetch } from './startupNetwork';

export async function verifyBetaAccess(body: Record<string, string>, accessToken?: string) {
  // Independent of Supabase's session lock: the public gate must remain usable
  // while an old session is being restored or a user is signed out.
  const response = await startupFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-access-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken || import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Beta access verification unavailable');
  const result = await response.json();
  if (result.valid === true && typeof result.deviceAuthorization === 'string') {
    localStorage.setItem(BETA_DEVICE_GRANT_KEY, result.deviceAuthorization);
    if (typeof result.signupAuthorization === 'string') sessionStorage.setItem(SIGNUP_AUTHORIZATION_KEY, result.signupAuthorization);
    return true;
  }
  return false;
}

export function restoreBetaDevice(accessToken: string) {
  return verifyBetaAccess({ mode: 'restore-device' }, accessToken);
}
