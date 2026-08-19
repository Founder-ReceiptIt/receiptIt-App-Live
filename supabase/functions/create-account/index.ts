import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeadersFor,
  isRateLimitAllowed,
  isTrustedOrigin,
  requestSubjectHash,
  valueHash,
} from "../_shared/security.ts";

interface CreateAccountRequest {
  email?: unknown;
  password?: unknown;
  alias?: unknown;
  fullName?: unknown;
  signupAuthorization?: unknown;
}

const jsonResponse = (request: Request, body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(request), "Content-Type": "application/json" },
  });

const optionalText = (value: unknown, maximumLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maximumLength) : "";

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
    console.error("[create-account] Server configuration unavailable");
    return jsonResponse(request, { error: "Account creation is temporarily unavailable" }, 503);
  }

  let body: CreateAccountRequest;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { error: "Invalid signup request" }, 400);
  }

  const email = optionalText(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const alias = optionalText(body.alias, 128).toLowerCase();
  const fullName = optionalText(body.fullName, 120);
  const signupAuthorization = optionalText(body.signupAuthorization, 256);

  if (!email || !password || !alias || password.length < 8) {
    return jsonResponse(request, { error: "Enter a valid email, alias, and password of at least 8 characters." }, 400);
  }

  if (!signupAuthorization) {
    return jsonResponse(request, { error: "A current access-key verification is required to create an account." }, 403);
  }

  const requestHash = await requestSubjectHash(request, "unknown-client");
  const emailHash = await valueHash(email);
  const [ipAllowed, emailAllowed] = await Promise.all([
    isRateLimitAllowed(supabaseUrl, serviceRoleKey, "signup-ip", requestHash, 5, 3600),
    isRateLimitAllowed(supabaseUrl, serviceRoleKey, "signup-email", emailHash, 3, 3600),
  ]);

  if (!ipAllowed || !emailAllowed) {
    return jsonResponse(request, { error: "Too many signup attempts. Please try again later." }, 429);
  }

  const username = fullName || email.split("@")[0] || "user";
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authorizationHash = await valueHash(signupAuthorization);
  const { data: authorizationConsumed, error: authorizationError } = await supabaseAdmin.rpc(
    "consume_signup_authorization",
    { p_token_hash: authorizationHash },
  );

  if (authorizationError || authorizationConsumed !== true) {
    return jsonResponse(request, { error: "A current access-key verification is required to create an account." }, 403);
  }

  const { data: createdAccount, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username, email_alias: alias },
  });

  if (createUserError || !createdAccount.user) {
    const knownExistingAccount = /already|registered|exists/i.test(createUserError?.message ?? "");
    return jsonResponse(
      request,
      { error: knownExistingAccount ? "This email is already registered. Please sign in instead." : "Could not create this account." },
      knownExistingAccount ? 409 : 400,
    );
  }

  const userId = createdAccount.user.id;
  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    email,
    full_name: fullName,
    username,
    email_alias: alias,
    plan: "free",
  });

  if (profileError) {
    console.error("[create-account] Profile creation failed", { code: profileError.code });
    await supabaseAdmin.auth.admin.deleteUser(userId, false);
    return jsonResponse(request, { error: "Could not finish account setup." }, 500);
  }

  return jsonResponse(request, { success: true, userId, email }, 200);
});
