import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DeleteAccountRequest {
  userId: string;
}

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
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let body: DeleteAccountRequest;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[delete-account] Failed to parse request body:", e);
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const userId = body.userId;
    console.log("[delete-account] Request userId:", userId);

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId in request body" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
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
      return new Response(
        JSON.stringify({ error: "Server configuration error", details: configError, code: "CONFIG_ERROR" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("[delete-account] Verifying token...");
    const verifyTokenResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseServiceKey,
        },
      }
    );

    console.log("[delete-account] Token verification status:", verifyTokenResponse.status);

    if (!verifyTokenResponse.ok) {
      const errorText = await verifyTokenResponse.text();
      console.error("[delete-account] Token verification failed:", errorText);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const userData = await verifyTokenResponse.json();
    console.log("[delete-account] Token user ID:", userData.id);

    if (userData.id !== userId) {
      console.error("[delete-account] User ID mismatch:", userData.id, "!==", userId);
      return new Response(
        JSON.stringify({ error: "User ID mismatch" }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`[delete-account] CRITICAL ACTION: Deleting user with ID: ${userId}`);
    const adminDeleteUrl = `${supabaseUrl}/auth/v1/admin/users/${userId}`;
    console.log(`[delete-account] DELETE endpoint URL: ${adminDeleteUrl}`);
    console.log("[delete-account] Using SUPABASE_SERVICE_ROLE_KEY for admin authentication");

    const deleteUserResponse = await fetch(adminDeleteUrl, {
      method: "DELETE",
      headers: {
        "apikey": supabaseServiceKey,
        "Content-Type": "application/json",
      },
    });

    console.log(`[delete-account] RESPONSE: Admin delete returned status ${deleteUserResponse.status}`);

    if (!deleteUserResponse.ok) {
      const errorText = await deleteUserResponse.text();
      console.error(
        `[delete-account] FAILURE: Delete admin call failed`,
        `Status: ${deleteUserResponse.status}`,
        `Response: ${errorText}`
      );
      let errorDetails = "Unknown error";
      let parsedError = null;
      try {
        parsedError = JSON.parse(errorText);
        errorDetails = parsedError.message || parsedError.error || errorText;
      } catch {
        errorDetails = errorText || `HTTP ${deleteUserResponse.status}`;
      }
      return new Response(
        JSON.stringify({
          error: "Failed to delete account",
          details: errorDetails,
          code: "ADMIN_DELETE_FAILED",
          adminStatus: deleteUserResponse.status,
          rawResponse: errorText.substring(0, 200),
        }),
        {
          status: deleteUserResponse.status || 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("[delete-account] SUCCESS: User auth record deleted successfully");
    return new Response(
      JSON.stringify({
        success: true,
        message: "Account deleted successfully",
        code: "DELETE_SUCCESS",
        userId: userId,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    console.error(`[delete-account] EXCEPTION: ${errorMessage}`);
    console.error(`[delete-account] STACK: ${errorStack}`);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: errorMessage,
        code: "INTERNAL_ERROR",
        stack: errorStack.substring(0, 200),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
