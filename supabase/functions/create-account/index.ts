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
  mode?: unknown;
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  signupAuthorization?: unknown;
  aliasLocalPart?: unknown;
}

const jsonResponse = (request: Request, body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(request), "Content-Type": "application/json" },
  });

const optionalText = (value: unknown, maximumLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maximumLength) : "";

const normaliseAlias = (value: unknown): string =>
  optionalText(value, 30).toLowerCase();

const aliasLooksValid = (value: string): boolean =>
  value.length >= 3 &&
  value.length <= 30 &&
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(value) &&
  !value.includes("--");

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
  const fullName = optionalText(body.fullName, 120);
  const signupAuthorization = optionalText(body.signupAuthorization, 256);
  const aliasLocalPart = normaliseAlias(body.aliasLocalPart);
  const mode = body.mode === "check-alias" ? "check-alias" : "create";

  if (!signupAuthorization) {
    return jsonResponse(request, { error: "A current access-key verification is required to create an account." }, 403);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authorizationHash = await valueHash(signupAuthorization);
  const { data: authorizationValid, error: authorizationError } = await supabaseAdmin.rpc(
    "signup_authorization_is_valid",
    { p_token_hash: authorizationHash },
  );

  if (authorizationError || authorizationValid !== true) {
    return jsonResponse(request, { error: "A current access-key verification is required to create an account." }, 403);
  }

  if (!aliasLooksValid(aliasLocalPart)) {
    return jsonResponse(request, {
      available: false,
      error: "Use 3–30 lowercase letters, numbers or single hyphens.",
    }, 400);
  }

  const requestHash = await requestSubjectHash(request, "unknown-client");
  const aliasHash = await valueHash(aliasLocalPart);
  if (mode === "check-alias") {
    const [ipAllowed, aliasAllowed] = await Promise.all([
      isRateLimitAllowed(supabaseUrl, serviceRoleKey, "signup-alias-check-ip", requestHash, 30, 900),
      isRateLimitAllowed(supabaseUrl, serviceRoleKey, "signup-alias-check-value", aliasHash, 10, 900),
    ]);
    if (!ipAllowed || !aliasAllowed) {
      return jsonResponse(request, { error: "Too many checks. Please try again shortly." }, 429);
    }

    const { data: available, error: availabilityError } = await supabaseAdmin.rpc(
      "friendly_alias_is_available",
      { p_local_part: aliasLocalPart },
    );
    if (availabilityError) {
      console.error("[create-account] Alias availability check failed", { code: availabilityError.code });
      return jsonResponse(request, { error: "Address availability is temporarily unavailable." }, 503);
    }
    return jsonResponse(request, { available: available === true }, 200);
  }

  if (!email || !password || password.length < 8) {
    return jsonResponse(request, { error: "Enter a valid email and password of at least 8 characters." }, 400);
  }
  const emailHash = await valueHash(email);
  const [ipAllowed, emailAllowed] = await Promise.all([
    isRateLimitAllowed(supabaseUrl, serviceRoleKey, "signup-ip", requestHash, 5, 3600),
    isRateLimitAllowed(supabaseUrl, serviceRoleKey, "signup-email", emailHash, 3, 3600),
  ]);

  if (!ipAllowed || !emailAllowed) {
    return jsonResponse(request, { error: "Too many signup attempts. Please try again later." }, 429);
  }

  const { data: aliasAvailable, error: availabilityError } = await supabaseAdmin.rpc(
    "friendly_alias_is_available",
    { p_local_part: aliasLocalPart },
  );
  if (availabilityError) {
    console.error("[create-account] Alias availability check failed", { code: availabilityError.code });
    return jsonResponse(request, { error: "Could not check that private address." }, 503);
  }
  if (aliasAvailable !== true) {
    return jsonResponse(request, { error: "That private address is unavailable. Choose another." }, 409);
  }

  const { data: createdAccount, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
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
  const { data: friendlyAddress, error: signupError } = await supabaseAdmin.rpc("complete_beta_signup", {
    p_user_id: userId,
    p_token_hash: authorizationHash,
    p_email: email,
    p_full_name: fullName,
    p_alias_local_part: aliasLocalPart,
  });

  if (signupError || typeof friendlyAddress !== "string") {
    console.error("[create-account] Transactional account setup failed", { code: signupError?.code });
    await supabaseAdmin.auth.admin.deleteUser(userId, false);
    const aliasUnavailable = /signup_input_invalid|unique/i.test(signupError?.message ?? "") || signupError?.code === "23505";
    const accessExpired = /signup_authorization_invalid/i.test(signupError?.message ?? "");
    return jsonResponse(
      request,
      {
        error: aliasUnavailable
          ? "That private address is unavailable. Choose another."
          : accessExpired
            ? "Your beta access has expired. Return to the access page and try again."
            : "Could not finish account setup.",
      },
      aliasUnavailable ? 409 : accessExpired ? 403 : 500,
    );
  }

  return jsonResponse(request, { success: true, email, friendlyAddress }, 200);
});
