import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeadersFor,
  isRateLimitAllowed,
  isTrustedOrigin,
  requestSubjectHash,
  valueHash,
} from "../_shared/security.ts";

const jsonResponse = (request: Request, body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(request), "Content-Type": "application/json" },
  });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeadersFor(request) });
  }

  if (!isTrustedOrigin(request)) {
    return jsonResponse(request, { error: "Request origin is not allowed" }, 403);
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[verify-access-code] Server configuration unavailable");
    return jsonResponse(request, { error: "Verification is temporarily unavailable" }, 503);
  }

  let accessCode = "";
  try {
    const body = await request.json() as { accessCode?: unknown };
    accessCode = typeof body.accessCode === "string" ? body.accessCode.trim().toUpperCase() : "";
  } catch {
    return jsonResponse(request, { valid: false }, 400);
  }

  if (!accessCode || accessCode.length > 128) {
    return jsonResponse(request, { valid: false }, 400);
  }

  const requestHash = await requestSubjectHash(request, "unknown-client");
  const codeHash = await valueHash(accessCode);
  const [ipAllowed, codeAllowed] = await Promise.all([
    isRateLimitAllowed(supabaseUrl, serviceRoleKey, "access-code-ip", requestHash, 10, 900),
    isRateLimitAllowed(supabaseUrl, serviceRoleKey, "access-code-value", codeHash, 5, 900),
  ]);

  if (!ipAllowed || !codeAllowed) {
    return jsonResponse(request, { error: "Too many attempts. Please try again later." }, 429);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin
    .from("access_codes")
    .select("id")
    .eq("code", accessCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[verify-access-code] Lookup failed", { message: error.message });
    return jsonResponse(request, { error: "Verification is temporarily unavailable" }, 503);
  }

  return jsonResponse(request, { valid: Boolean(data) }, 200);
});
