// Tab-scoped, best-effort telemetry. Never a source of access/auth authority.
const KEY = 'receiptit_access_journey_v1';
type State = { id: string; token?: string; sent: string[] };
let memory: State | null = null;
const pending = new Set<string>();
function load(): State | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return value && typeof value.id === 'string' && Array.isArray(value.sent)
      && (!value.token || typeof value.token === 'string') ? value as State : memory;
  }
  catch { return memory; }
}
function save(state: State) {
  memory = state;
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Storage denial must not block entry. */ }
}
export function startAccessJourney(): string {
  try {
    const id = crypto.randomUUID();
    save({ id, sent: [] });
    return id;
  } catch { return ''; }
}
export function acceptAccessJourney(id: string, token: unknown) {
  const current = load();
  if (current?.id === id && typeof token === 'string') save({ ...current, token });
}
export function accessJourneyToken(): string | undefined { return load()?.token; }
export function clearAccessJourney() {
  memory = null;
  try { sessionStorage.removeItem(KEY); } catch { /* Optional telemetry only. */ }
}
export function trackAccessJourney(event: 'intro_completed' | 'wallet_reached', accessToken?: string, completionMethod: 'completed' | 'skipped' = 'completed') {
  try { sendAccessJourney(event, accessToken, completionMethod); }
  catch { /* Unsupported browser APIs must never interrupt navigation. */ }
}
function sendAccessJourney(event: 'intro_completed' | 'wallet_reached', accessToken?: string, completionMethod: 'completed' | 'skipped' = 'completed') {
  const state = load();
  if (!state?.token || !Array.isArray(state.sent) || state.sent.includes(event)) return;
  const key = `${state.id}:${event}`;
  if (pending.has(key)) return;
  const signal = AbortSignal.timeout(4000);
  pending.add(key);
  // Keepalive lets the event survive normal navigation without delaying it.
  void Promise.resolve().then(() => fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/access-code-event`, {
    method: 'POST', keepalive: true, signal,
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken || import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ journeyToken: state.token, event, ...(event === 'intro_completed' ? { completionMethod } : {}) }),
  })).then(response => {
    const current = load();
    if (response.ok && current?.id === state.id) save({ ...current, sent: [...new Set([...current.sent, event])] });
  }).catch(() => { /* Telemetry failure is never a user-facing failure. */ }).finally(() => pending.delete(key));
}
