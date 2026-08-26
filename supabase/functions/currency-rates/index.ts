import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeadersFor,
  isRateLimitAllowed,
  isTrustedOrigin,
  requestSubjectHash,
} from "../_shared/security.ts";

type RateRequest = {
  source?: unknown;
  target?: unknown;
  date?: unknown;
};

type CachedRate = {
  source_currency: string;
  target_currency: string;
  requested_date: string;
  rate_date: string;
  rate: number | string;
  approximate: boolean;
};

const MAX_RATE_REQUESTS = 40;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(request),
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });

const today = () => new Date().toISOString().slice(0, 10);

const normalizeCurrency = (value: unknown): string =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

const normalizeDate = (value: unknown): { requestedDate: string; approximate: boolean } => {
  if (typeof value === "string" && ISO_DATE.test(value.trim())) {
    const candidate = value.trim();
    const parsed = new Date(`${candidate}T12:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate) {
      return { requestedDate: candidate, approximate: false };
    }
  }

  return { requestedDate: today(), approximate: true };
};

const rateKey = (source: string, target: string, date: string) =>
  `${source}:${target}:${date}`;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeadersFor(request) });
  }

  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!isTrustedOrigin(request)) return json(request, { error: "Request origin is not allowed" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!supabaseUrl || !serviceRoleKey) return json(request, { error: "Currency conversion is temporarily unavailable" }, 503);
  if (!bearer) return json(request, { error: "Authentication is required" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verified, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !verified.user) return json(request, { error: "Authentication could not be verified" }, 403);

  const requestHash = await requestSubjectHash(request, verified.user.id);
  if (!await isRateLimitAllowed(supabaseUrl, serviceRoleKey, "currency-rates", requestHash, 120, 3600)) {
    return json(request, { error: "Too many currency requests. Please try again shortly." }, 429);
  }

  let rawRates: unknown;
  try {
    rawRates = (await request.json())?.rates;
  } catch {
    return json(request, { error: "Invalid currency request" }, 400);
  }

  if (!Array.isArray(rawRates) || rawRates.length === 0 || rawRates.length > MAX_RATE_REQUESTS) {
    return json(request, { error: "Invalid currency request" }, 400);
  }

  const normalized = rawRates.map((entry: RateRequest) => {
    const source = normalizeCurrency(entry?.source);
    const target = normalizeCurrency(entry?.target);
    const { requestedDate, approximate } = normalizeDate(entry?.date);
    return { source, target, requestedDate, approximate };
  });

  if (normalized.some(({ source, target }) => !ISO_CURRENCY.test(source) || !ISO_CURRENCY.test(target))) {
    return json(request, { error: "Invalid currency code" }, 400);
  }

  const unique = Array.from(new Map(
    normalized.map((entry) => [rateKey(entry.source, entry.target, entry.requestedDate), entry]),
  ).values());
  const results = new Map<string, Record<string, unknown>>();

  for (const entry of unique.filter(({ source, target }) => source === target)) {
    results.set(rateKey(entry.source, entry.target, entry.requestedDate), {
      source: entry.source,
      target: entry.target,
      requestedDate: entry.requestedDate,
      rateDate: entry.requestedDate,
      rate: 1,
      approximate: entry.approximate,
      provider: "identity",
    });
  }

  const remoteEntries = unique.filter(({ source, target }) => source !== target);
  if (remoteEntries.length > 0) {
    const cachedRows = await Promise.all(remoteEntries.map(async (entry) => {
      const { data } = await admin
        .from("fx_rate_cache")
        .select("source_currency,target_currency,requested_date,rate_date,rate,approximate")
        .eq("source_currency", entry.source)
        .eq("target_currency", entry.target)
        .eq("requested_date", entry.requestedDate)
        .maybeSingle<CachedRate>();
      return { entry, data };
    }));

    for (const { entry, data } of cachedRows) {
      if (!data) continue;
      const rate = Number(data.rate);
      if (!Number.isFinite(rate) || rate <= 0) continue;
      results.set(rateKey(entry.source, entry.target, entry.requestedDate), {
        source: entry.source,
        target: entry.target,
        requestedDate: entry.requestedDate,
        rateDate: data.rate_date,
        rate,
        approximate: entry.approximate || data.approximate,
        provider: "frankfurter",
      });
    }

    const misses = remoteEntries.filter((entry) => !results.has(rateKey(entry.source, entry.target, entry.requestedDate)));
    const fetched = await Promise.all(misses.map(async (entry) => {
      const endpoint = new URL(`https://api.frankfurter.dev/v2/rate/${entry.source}/${entry.target}`);
      endpoint.searchParams.set("date", entry.requestedDate);

      try {
        const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
        if (!response.ok) return { entry, error: true as const };
        const body = await response.json();
        const rate = Number(body?.rate);
        const rateDate = typeof body?.date === "string" && ISO_DATE.test(body.date)
          ? body.date
          : entry.requestedDate;
        if (!Number.isFinite(rate) || rate <= 0) return { entry, error: true as const };
        return { entry, rate, rateDate, error: false as const };
      } catch {
        return { entry, error: true as const };
      }
    }));

    const cacheWrites = [];
    for (const fetchedRate of fetched) {
      if (fetchedRate.error) continue;
      const { entry, rate, rateDate } = fetchedRate;
      results.set(rateKey(entry.source, entry.target, entry.requestedDate), {
        source: entry.source,
        target: entry.target,
        requestedDate: entry.requestedDate,
        rateDate,
        rate,
        approximate: entry.approximate,
        provider: "frankfurter",
      });
      cacheWrites.push({
        source_currency: entry.source,
        target_currency: entry.target,
        requested_date: entry.requestedDate,
        rate_date: rateDate,
        rate,
        provider: "frankfurter",
        approximate: entry.approximate,
        fetched_at: new Date().toISOString(),
      });
    }

    if (cacheWrites.length > 0) {
      const { error: cacheError } = await admin
        .from("fx_rate_cache")
        .upsert(cacheWrites, { onConflict: "source_currency,target_currency,requested_date" });
      if (cacheError) console.warn("[currency-rates] cache write failed", { code: cacheError.code });
    }
  }

  const rates = normalized.map((entry) => (
    results.get(rateKey(entry.source, entry.target, entry.requestedDate)) ?? {
      source: entry.source,
      target: entry.target,
      requestedDate: entry.requestedDate,
      error: "rate_unavailable",
    }
  ));

  return json(request, { rates });
});
