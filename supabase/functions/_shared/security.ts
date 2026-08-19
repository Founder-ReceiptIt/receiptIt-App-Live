import { createClient } from "npm:@supabase/supabase-js@2";

const productionOrigins = new Set([
  "https://www.receiptit.app",
  "https://receiptit.app",
]);

const developmentOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export const isTrustedOrigin = (request: Request): boolean => {
  const origin = request.headers.get("Origin");
  if (!origin) return true;

  return productionOrigins.has(origin) || developmentOrigins.has(origin);
};

export const corsHeadersFor = (request: Request): HeadersInit => {
  const origin = request.headers.get("Origin");
  const allowedOrigin = origin && (productionOrigins.has(origin) || developmentOrigins.has(origin))
    ? origin
    : "https://www.receiptit.app";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
};

export const requestSubjectHash = async (request: Request, fallback: string): Promise<string> => {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const subject = forwardedFor || request.headers.get("cf-connecting-ip") || fallback;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subject));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
};

export const valueHash = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
};

export const isRateLimitAllowed = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  scope: string,
  subjectHash: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> => {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("consume_security_rate_limit", {
    p_scope: scope,
    p_subject_hash: subjectHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("[security] Rate-limit check failed", { scope, message: error.message });
    // A failed security dependency must never open a public abuse endpoint.
    return false;
  }

  return data === true;
};
