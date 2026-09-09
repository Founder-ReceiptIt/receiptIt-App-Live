// Abort the actual request, rather than hiding a stuck request behind a UI timer.
// Evidence uploads and processor requests deliberately keep their own budgets.
export async function startupFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const bounded = url.pathname.startsWith('/auth/v1/') || url.pathname === '/rest/v1/profiles'
    || /\/rest\/v1\/rpc\/ensure_(active_email_alias|friendly_email_alias)$/.test(url.pathname)
    || url.pathname === '/functions/v1/verify-access-code';
  if (!bounded) return fetch(input, init);
  const controller = new AbortController();
  const originalSignal = init?.signal || (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(originalSignal?.reason);
  if (originalSignal?.aborted) abort();
  originalSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Startup request deadline exceeded', 'TimeoutError')), 15000);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if ([204, 205, 304].includes(response.status)) return response;
    const body = await response.arrayBuffer();
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally {
    clearTimeout(timer);
    originalSignal?.removeEventListener('abort', abort);
  }
}
