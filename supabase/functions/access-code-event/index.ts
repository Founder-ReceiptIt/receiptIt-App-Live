import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor, isTrustedOrigin } from '../_shared/security.ts';
import { readJourney, writeJourneyEvent } from '../_shared/access-code-telemetry.ts';

Deno.serve(async (request: Request) => {
  const reply = (status: number) => new Response(null, { status, headers: corsHeadersFor(request) });
  if (!isTrustedOrigin(request)) return reply(403);
  if (request.method === 'OPTIONS') return reply(204);
  if (request.method !== 'POST') return reply(405);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply(400);
    const body = JSON.parse(raw);
    const url = Deno.env.get('SUPABASE_URL')!;
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const journey = await readJourney(body.journeyToken, secret);
    if (!journey || !['intro_completed', 'wallet_reached'].includes(body.event)) return reply(400);
    let userId: string | null = null;
    if (body.event === 'intro_completed' && !['completed', 'skipped'].includes(body.completionMethod)) return reply(400);
    if (body.event === 'wallet_reached') {
      const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(2000) }) } });
      const { data, error } = await admin.auth.getUser(request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '');
      if (error || !data.user) return reply(401);
      userId = data.user.id;
      // Do not attribute a different account's restored session to a new signup.
      const { data: owners, error: lookupError } = await admin.from('access_code_events').select('user_id')
        .eq('session_id', journey.session_id).in('event_type', ['signup_completed', 'wallet_reached']);
      if (lookupError) return reply(503);
      if (owners?.some(row => row.user_id && row.user_id !== userId)) return reply(403);
    }
    await writeJourneyEvent(url, secret, journey, body.event, userId, body.completionMethod);
    return reply(204);
  } catch { return reply(503); }
});
