import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/*
 * ReceiptIt inbound mail endpoint (Resend Receiving).
 *
 * This endpoint intentionally stores metadata, not a raw mailbox. Resend's
 * signed event is verified before any alias lookup or provider API request.
 * Receipt attachments become ordinary private receipt objects, so Scanner
 * Dispatch can send them through the proven image/PDF paths.
 */

const MAX_WEBHOOK_BYTES = 256 * 1024;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const MAX_BODY_BYTES = 500 * 1024;

type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    attachments?: Array<{
      id?: string;
      filename?: string;
      content_type?: string;
      content_disposition?: string;
    }>;
  };
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");

const sha256 = async (value: ArrayBuffer | string) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
};

const base64Bytes = (value: string) => {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const safeEquals = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
};

const verifyResendWebhook = async (rawBody: string, headers: Headers, secret: string) => {
  const eventId = headers.get("svix-id") || "";
  const timestamp = headers.get("svix-timestamp") || "";
  const signatures = headers.get("svix-signature") || "";
  const timestampNumber = Number(timestamp);
  if (!eventId || !Number.isFinite(timestampNumber) || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > 5 * 60) return false;

  let secretBytes: Uint8Array;
  try {
    secretBytes = base64Bytes(secret.replace(/^whsec_/, ""));
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${eventId}.${timestamp}.${rawBody}`),
  ));

  return signatures.split(" ").some((entry) => {
    const [, encoded] = entry.split(",", 2);
    if (!encoded) return false;
    try { return safeEquals(expected, base64Bytes(encoded)); } catch { return false; }
  });
};

const normaliseRecipient = (value: string) => value.trim().toLowerCase().match(/<?([^\s<>@]+@[^\s<>@]+)>?/)?.[1] || "";
const senderDomain = (value: string | undefined) => normaliseRecipient(value || "").split("@")[1] || null;

const sanitizeFilename = (filename: string | undefined) => {
  const basename = (filename || "attachment").split(/[\\/]/).pop() || "attachment";
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
};

const inferredAttachmentType = (bytes: Uint8Array) => {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return { extension: "pdf", contentType: "application/pdf" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", contentType: "image/jpeg" };
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return { extension: "png", contentType: "image/png" };
  return null;
};

const classifyEnvelope = (subject: string, body: string) => {
  const sample = `${subject}\n${body}`.slice(0, 12_000).toLowerCase();
  if (/unsubscribe|view in browser|sale ends|promotional offer|newsletter/.test(sample)) return "marketing";
  if (/refund|returned|return accepted/.test(sample)) return "return_or_refund";
  if (/warranty|service booking|repair/.test(sample)) return "warranty_or_service";
  if (/delivered|out for delivery|tracking number|shipped/.test(sample)) return "delivery_or_fulfilment";
  if (/receipt|invoice|order confirmation|payment confirmation|thank you for your order|total/.test(sample)) return "purchase_transactional";
  return "uncertain";
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Not found" }, 404);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(contentLength) || contentLength > MAX_WEBHOOK_BYTES) return json({ error: "Invalid request" }, 400);

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) return json({ error: "Invalid request" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !webhookSecret) {
    console.error("[inbound-email] Required configuration is missing");
    return json({ error: "Unavailable" }, 503);
  }

  if (!(await verifyResendWebhook(rawBody, request.headers, webhookSecret))) {
    return json({ error: "Invalid request" }, 401);
  }

  let event: ResendEvent;
  try { event = JSON.parse(rawBody); } catch { return json({ error: "Invalid request" }, 400); }
  if (event.type !== "email.received" || !event.data?.email_id) return json({ accepted: true });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const providerEventId = request.headers.get("svix-id")!;
  const recipient = normaliseRecipient(event.data.to?.[0] || "");
  const recipientHash = recipient ? await sha256(recipient) : null;
  if (!recipient) {
    await admin.from("inbound_webhook_rejections").upsert({ provider_event_id: providerEventId, recipient_hash: recipientHash, reason: "malformed_recipient" }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
    return json({ accepted: true });
  }

  const { data: alias } = await admin.from("email_aliases")
    .select("id,user_id,email_address")
    .eq("email_address", recipient).eq("state", "active").maybeSingle();
  if (!alias) {
    await admin.from("inbound_webhook_rejections").upsert({ provider_event_id: providerEventId, recipient_hash: recipientHash, reason: "unknown_or_disabled_alias" }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
    // A generic success prevents alias enumeration and provider retry storms.
    return json({ accepted: true });
  }

  const { data: existing } = await admin.from("inbound_messages")
    .select("id").eq("provider", "resend").eq("provider_event_id", providerEventId).maybeSingle();
  if (existing) return json({ accepted: true, duplicate: true });

  const contentResponse = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(event.data.email_id)}`, {
    headers: { Authorization: `Bearer ${resendApiKey}` },
  });
  if (!contentResponse.ok) {
    console.error("[inbound-email] Provider content retrieval failed", { status: contentResponse.status });
    return json({ error: "Temporary failure" }, 503);
  }

  const content = await contentResponse.json() as Record<string, unknown>;
  const bodyText = typeof content.text === "string" ? content.text.slice(0, MAX_BODY_BYTES) : "";
  const headers = content.headers && typeof content.headers === "object" ? content.headers as Record<string, unknown> : {};
  const classification = classifyEnvelope(String(content.subject || event.data.subject || ""), bodyText);
  const attachments = (event.data.attachments || []).filter((attachment) => attachment.content_disposition !== "inline").slice(0, MAX_ATTACHMENTS);

  const { data: message, error: messageError } = await admin.from("inbound_messages").insert({
    user_id: alias.user_id,
    alias_id: alias.id,
    provider: "resend",
    provider_event_id: providerEventId,
    provider_message_id: typeof content.message_id === "string" ? content.message_id.slice(0, 998) : event.data.message_id || null,
    recipient_address: recipient,
    sender_address: typeof content.from === "string" ? content.from.slice(0, 998) : event.data.from || null,
    reply_to_address: typeof content.reply_to === "string" ? content.reply_to.slice(0, 998) : null,
    sender_domain: senderDomain(typeof content.from === "string" ? content.from : event.data.from),
    subject: String(content.subject || event.data.subject || "").slice(0, 998) || null,
    authentication_results: {
      spf: headers["spf"] || headers["received-spf"] || null,
      dkim: headers["dkim"] || null,
      dmarc: headers["dmarc"] || null,
    },
    classification,
    attachment_count: attachments.length,
    body_sha256: bodyText ? await sha256(bodyText) : null,
    status: classification === "marketing" ? "ignored" : "processing",
  }).select("id").single();
  if (messageError || !message) {
    if (messageError?.code === "23505") return json({ accepted: true, duplicate: true });
    console.error("[inbound-email] Could not create inbound message", { code: messageError?.code });
    return json({ error: "Temporary failure" }, 503);
  }

  await admin.from("email_aliases").update({ last_received_at: new Date().toISOString() }).eq("id", alias.id);
  if (classification === "marketing") return json({ accepted: true, ignored: true });

  for (const attachment of attachments) {
    if (!attachment.id) continue;
    const attachmentResponse = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(event.data.email_id)}/attachments/${encodeURIComponent(attachment.id)}`, {
      headers: { Authorization: `Bearer ${resendApiKey}` },
    });
    if (!attachmentResponse.ok) {
      await admin.from("inbound_attachments").insert({ inbound_message_id: message.id, user_id: alias.user_id, provider_attachment_id: attachment.id, safe_filename: sanitizeFilename(attachment.filename), content_type: attachment.content_type || "application/octet-stream", byte_size: 0, sha256: "0".repeat(64), storage_path: `${alias.user_id}/email-unavailable/${crypto.randomUUID()}`, status: "failed", error_reason: "provider_attachment_unavailable" });
      continue;
    }
    const bytes = new Uint8Array(await attachmentResponse.arrayBuffer());
    const detected = bytes.byteLength <= MAX_ATTACHMENT_BYTES ? inferredAttachmentType(bytes) : null;
    if (!detected) {
      await admin.from("inbound_attachments").insert({ inbound_message_id: message.id, user_id: alias.user_id, provider_attachment_id: attachment.id, safe_filename: sanitizeFilename(attachment.filename), content_type: attachment.content_type || "application/octet-stream", byte_size: bytes.byteLength, sha256: await sha256(bytes.buffer), storage_path: `${alias.user_id}/email-rejected/${crypto.randomUUID()}`, status: "rejected", error_reason: bytes.byteLength > MAX_ATTACHMENT_BYTES ? "attachment_too_large" : "unsupported_or_invalid_attachment" });
      continue;
    }

    const fileHash = await sha256(bytes.buffer);
    const storagePath = `${alias.user_id}/email/${message.id}/${crypto.randomUUID()}.${detected.extension}`;
    const { error: uploadError } = await admin.storage.from("receipts").upload(storagePath, bytes, { contentType: detected.contentType, upsert: false });
    if (uploadError) {
      await admin.from("inbound_attachments").insert({ inbound_message_id: message.id, user_id: alias.user_id, provider_attachment_id: attachment.id, safe_filename: sanitizeFilename(attachment.filename), content_type: detected.contentType, byte_size: bytes.byteLength, sha256: fileHash, storage_path: storagePath, status: "failed", error_reason: "private_storage_upload_failed" });
      continue;
    }

    const { data: receipt, error: receiptError } = await admin.from("receipts").insert({
      user_id: alias.user_id, source: "email", storage_path: storagePath, image_url: storagePath,
      file_hash: fileHash, status: "processing", processing_attempt_started_at: new Date().toISOString(),
      merchant: "Analyzing...", amount: 0, subtotal: 0, vat_amount: 0, currency: "GBP", category: "Other",
      reference_number: `EMAIL-${message.id.slice(0, 8)}`,
    }).select("id").single();
    if (receiptError || !receipt) {
      await admin.storage.from("receipts").remove([storagePath]);
      await admin.from("inbound_attachments").insert({ inbound_message_id: message.id, user_id: alias.user_id, provider_attachment_id: attachment.id, safe_filename: sanitizeFilename(attachment.filename), content_type: detected.contentType, byte_size: bytes.byteLength, sha256: fileHash, storage_path: storagePath, status: receiptError?.code === "23505" ? "duplicate" : "failed", error_reason: receiptError?.code === "23505" ? "exact_duplicate" : "receipt_queue_failed" });
      continue;
    }
    await admin.from("inbound_attachments").insert({ inbound_message_id: message.id, user_id: alias.user_id, provider_attachment_id: attachment.id, safe_filename: sanitizeFilename(attachment.filename), content_type: detected.contentType, byte_size: bytes.byteLength, sha256: fileHash, storage_path: storagePath, receipt_id: receipt.id, status: "queued" });
  }

  await admin.from("inbound_messages").update({ status: attachments.length ? "processed" : "received", processed_at: attachments.length ? new Date().toISOString() : null }).eq("id", message.id);
  return json({ accepted: true });
});
