// Telemetry capability only: NEVER accepted by access validation or signup.
export type Journey = { purpose: 'access-telemetry'; session_id: string; code_label: string; expires: number };
export type JourneyEvent = 'code_submitted' | 'code_accepted' | 'signup_started' | 'signup_completed' | 'intro_completed' | 'wallet_reached';
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const keyFor = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(`receiptit:access-telemetry:v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
export const validJourneyId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function issueJourney(sessionId: string, codeLabel: string, secret: string) {
  const journey: Journey = { purpose: 'access-telemetry', session_id: sessionId, code_label: codeLabel, expires: Math.floor(Date.now() / 1000) + 86400 };
  const payload = encode(encoder.encode(JSON.stringify(journey)));
  const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', await keyFor(secret), encoder.encode(payload))));
  return { journey, token: `${payload}.${signature}` };
}

export async function readJourney(token: unknown, secret: string): Promise<Journey | null> {
  try {
    if (typeof token !== 'string' || token.length > 1024) return null;
    const [payload, signature, extra] = token.split('.');
    if (!signature || extra || !await crypto.subtle.verify('HMAC', await keyFor(secret), decode(signature), encoder.encode(payload))) return null;
    const value = JSON.parse(new TextDecoder().decode(decode(payload)));
    return value.purpose === 'access-telemetry' && validJourneyId(value.session_id)
      && typeof value.code_label === 'string' && value.code_label.length <= 128 && value.code_label !== 'unknown_code'
      && Number.isFinite(value.expires) && value.expires > Date.now() / 1000 ? value : null;
  } catch { return null; }
}

export function bestEffort(work: Promise<unknown>) {
  const safe = work.catch(() => { console.warn('[access-telemetry] unavailable'); });
  // Edge Functions keep this bounded work alive after the main response returns.
  const runtime = (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } }).EdgeRuntime;
  try { if (runtime) runtime.waitUntil(safe); } catch { /* Never affect the primary operation. */ }
}

export async function writeJourneyEvent(url: string, secret: string, journey: Pick<Journey, 'session_id' | 'code_label'>,
  event: JourneyEvent, userId: string | null = null, completionMethod?: 'completed' | 'skipped') {
  const response = await fetch(`${url}/rest/v1/access_code_events?on_conflict=session_id,event_type`, {
    method: 'POST', signal: AbortSignal.timeout(2000),
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ session_id: journey.session_id, code_label: journey.code_label, event_type: event,
      user_id: userId, metadata: event === 'intro_completed' ? { completion_method: completionMethod || 'completed' } : null }),
  });
  if (!response.ok) throw new Error('Telemetry write unavailable');
}
