import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateAccountRequest {
  email?: string;
  password?: string;
  alias?: string;
  fullName?: string;
}

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const body = await req.json() as CreateAccountRequest;
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const alias = body.alias?.trim().toLowerCase();
    const fullName = body.fullName?.trim() || "";

    if (!email || !password || !alias) {
      return jsonResponse({ error: "Missing required signup fields" }, 400);
    }

    const username = fullName || email.split("@")[0] || "user";

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        username,
        email_alias: alias,
      },
    });

    if (createUserError || !createdUser.user) {
      const message = createUserError?.message || "Failed to create auth user";
      const lowered = message.toLowerCase();

      if (lowered.includes("already") || lowered.includes("registered") || lowered.includes("exists")) {
        return jsonResponse({ error: "This email is already registered. Please sign in instead." }, 409);
      }

      return jsonResponse({ error: message }, 400);
    }

    const userId = createdUser.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        email,
        full_name: fullName,
        username,
        email_alias: alias,
        plan: "free",
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId, false);

      const message = `${profileError.message || ""} ${profileError.details || ""}`.toLowerCase();
      if (
        profileError.code === "23505" &&
        (message.includes("email_alias") || message.includes("profiles_email_alias_unique"))
      ) {
        return jsonResponse({ error: "This alias is already taken. Please choose another one." }, 409);
      }

      return jsonResponse({ error: "Failed to create account profile", details: profileError.message }, 500);
    }

    return jsonResponse({
      success: true,
      userId,
      email,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: "Internal server error", details: message }, 500);
  }
});
