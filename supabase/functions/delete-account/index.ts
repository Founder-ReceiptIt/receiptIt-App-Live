import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, isTrustedOrigin } from "../_shared/security.ts";

interface DeleteAccountRequest {
  userId?: unknown;
}

const jsonResponse = (request: Request, body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(request), "Content-Type": "application/json" },
  });

const listUserObjects = async (
  storage: SupabaseClient["storage"],
  userId: string,
): Promise<string[]> => {
  const objects: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.from("receipts").list(userId, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const entry of data) {
      // ReceiptIt's enforced bucket convention is <auth.uid()>/<random-file>.
      // Storage list returns direct file names for that prefix.
      if (entry.name) objects.push(`${userId}/${entry.name}`);
    }

    if (data.length < 1000) break;
    offset += data.length;
  }

  return objects;
};

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

  let body: DeleteAccountRequest;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { error: "Invalid request" }, 400);
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const bearerToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!userId || !bearerToken) {
    return jsonResponse(request, { error: "Authentication is required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[delete-account] Server configuration unavailable");
    return jsonResponse(request, { error: "Account deletion is temporarily unavailable" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verifiedUser, error: authError } = await admin.auth.getUser(bearerToken);
  if (authError || !verifiedUser.user || verifiedUser.user.id !== userId) {
    return jsonResponse(request, { error: "Authentication could not be verified" }, 403);
  }

  try {
    const storagePaths = await listUserObjects(admin.storage, userId);
    if (storagePaths.length > 0) {
      const { error: storageDeleteError } = await admin.storage.from("receipts").remove(storagePaths);
      if (storageDeleteError) {
        console.error("[delete-account] Storage cleanup failed", { code: storageDeleteError.name });
        return jsonResponse(request, { error: "We could not safely complete account deletion. Please try again." }, 503);
      }
    }

    // These tables are not all guaranteed to have an auth-user foreign key in
    // historic deployments. Clean them explicitly before the auth cascade.
    const cleanupResults = await Promise.all([
      admin.from("bug_reports").delete().eq("user_id", userId),
      admin.from("processing_logs").delete().eq("user_id", userId),
    ]);
    if (cleanupResults.some(({ error }) => error)) {
      console.error("[delete-account] Supporting-record cleanup failed");
      return jsonResponse(request, { error: "We could not safely complete account deletion. Please try again." }, 503);
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId, false);
    if (deleteUserError) {
      console.error("[delete-account] Auth deletion failed", { code: deleteUserError.status });
      return jsonResponse(request, { error: "We could not safely complete account deletion. Please try again." }, 503);
    }

    return jsonResponse(request, { success: true }, 200);
  } catch (error) {
    console.error("[delete-account] Unexpected cleanup failure", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(request, { error: "We could not safely complete account deletion. Please try again." }, 503);
  }
});
