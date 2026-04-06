import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DeleteAccountRequest {
  userId: string;
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
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [delete-account] START - Incoming request: ${req.method} ${req.url}`);

  if (req.method === "OPTIONS") {
    console.log("[delete-account] OPTIONS preflight - returning 200 with CORS headers");
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      const errorMsg = `Invalid method: ${req.method}`;
      console.error(`[delete-account] ${errorMsg}`);
      return new Response(
        JSON.stringify({ error: errorMsg, code: "INVALID_METHOD" }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const authHeader = req.headers.get("Authorization");
    console.log("[delete-account] Authorization header present:", !!authHeader);
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    let body: DeleteAccountRequest;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[delete-account] Failed to parse request body:", e);
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const userId = body.userId;
    console.log("[delete-account] Request userId:", userId);

    if (!userId) {
      return jsonResponse({ error: "Missing userId in request body" }, 400);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.log("[delete-account] VERIFICATION: Supabase URL exists:", !!supabaseUrl);
    console.log("[delete-account] VERIFICATION: Service key exists:", !!supabaseServiceKey);

    if (supabaseServiceKey) {
      const keyPreview = supabaseServiceKey.substring(0, 20) + "...";
      console.log("[delete-account] VERIFICATION: Service key format valid:", keyPreview);
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      const configError = `Missing config - URL: ${!!supabaseUrl}, KEY: ${!!supabaseServiceKey}`;
      console.error(`[delete-account] CRITICAL: ${configError}`);
      return jsonResponse({ error: "Server configuration error", details: configError, code: "CONFIG_ERROR" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log("[delete-account] Verifying token...");
    const { data: userLookup, error: userLookupError } = await supabaseAdmin.auth.getUser(token);

    if (userLookupError || !userLookup.user) {
      console.error("[delete-account] Token verification failed:", userLookupError);
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const userData = userLookup.user;
    console.log("[delete-account] Token user ID:", userData.id);

    if (userData.id !== userId) {
      console.error("[delete-account] User ID mismatch:", userData.id, "!==", userId);
      return jsonResponse({ error: "User ID mismatch" }, 403);
    }

    console.log(`[delete-account] CRITICAL ACTION: Deleting user with ID: ${userId}`);
    console.log("[delete-account] Using SUPABASE_SERVICE_ROLE_KEY for admin deletion");
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error("[delete-account] FAILURE: deleteUser failed", deleteUserError);
      return jsonResponse({
        error: "Failed to delete account",
        details: deleteUserError.message || "Auth user deletion failed",
        code: "ADMIN_DELETE_FAILED",
      }, 500);
    }

    console.log("[delete-account] SUCCESS: User auth record deleted successfully");
    const cleanupAttempts = [
      { label: "profiles.id", query: ["id", `eq.${userId}`] as const },
      { label: "profiles.user_id", query: ["user_id", `eq.${userId}`] as const },
    ];

    const cleanupResults: Array<{ label: string; status: number; body: string }> = [];

    for (const attempt of cleanupAttempts) {
      const cleanupUrl = new URL(`${supabaseUrl}/rest/v1/profiles`);
      cleanupUrl.searchParams.set(attempt.query[0], attempt.query[1]);
      cleanupUrl.searchParams.set("select", "id");

      const cleanupResponse = await fetch(cleanupUrl, {
        method: "DELETE",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
      });

      const cleanupBody = await cleanupResponse.text();
      cleanupResults.push({
        label: attempt.label,
        status: cleanupResponse.status,
        body: cleanupBody.substring(0, 200),
      });

      if (!cleanupResponse.ok) {
        console.warn(
          `[delete-account] Profile cleanup attempt failed for ${attempt.label}:`,
          cleanupResponse.status,
          cleanupBody,
        );
      }
    }

    return jsonResponse({
      success: true,
      message: "Account deleted successfully",
      code: "DELETE_SUCCESS",
      userId: userId,
      profileCleanup: cleanupResults,
    }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    console.error(`[delete-account] EXCEPTION: ${errorMessage}`);
    console.error(`[delete-account] STACK: ${errorStack}`);
    return jsonResponse({
      error: "Internal server error",
      details: errorMessage,
      code: "INTERNAL_ERROR",
      stack: errorStack.substring(0, 200),
    }, 500);
  }
});
