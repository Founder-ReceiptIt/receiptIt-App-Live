import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { corsHeadersFor, isTrustedOrigin } from "../_shared/security.ts";

type ReceiptRow = {
  id: string;
  user_id: string;
  merchant: string | null;
  amount: number | string | null;
  amount_gbp: number | string | null;
  subtotal: number | string | null;
  vat_amount: number | string | null;
  currency: string | null;
  transaction_date: string | null;
  category: string | null;
  source: string | null;
  storage_path: string | null;
  status: string | null;
  document_type: string | null;
  reference_number: string | null;
  order_number: string | null;
  invoice_number: string | null;
  customer_number: string | null;
  loyalty_member_id: string | null;
  card_last_4: string | null;
  return_date: string | null;
  warranty_date: string | null;
};

type ItemRow = { description: string | null; quantity: number | string | null; quantity_unit: string | null; unit_price: number | string | null; line_total: number | string | null };
type PaymentRow = { payment_method?: string | null; method?: string | null; amount?: number | string | null; currency?: string | null };

const json = (request: Request, body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeadersFor(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const money = (currency: string | null, value: unknown) => {
  const amount = toNumber(value);
  if (amount === null) return "Not recorded";
  const code = (currency || "GBP").toUpperCase();
  const symbol = code === "GBP" ? "£" : code === "EUR" ? "€" : code === "USD" ? "$" : `${code} `;
  return `${symbol}${amount.toFixed(2)}`;
};
const britishDate = (value: string | null) => {
  if (!value) return "Not recorded";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
};

const wrap = (value: string, width = 86) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > width && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
};

const createProofPdf = async (inputLines: Array<{ text: string; strong?: boolean }>, original: Uint8Array | null) => {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Courier);
  const bold = await document.embedFont(StandardFonts.CourierBold);
  const lines = inputLines.flatMap(({ text, strong }) => wrap(text, 80).map((line) => ({ text: line, strong })));
  const perPage = 42;
  for (let start = 0; start < lines.length; start += perPage) {
    const page = document.addPage([595, 842]);
    page.drawText("receipt", { x: 48, y: 790, size: 18, font: bold, color: rgb(0.08, 0.1, 0.1) });
    page.drawText("It", { x: 123, y: 790, size: 18, font: bold, color: rgb(0.176, 0.831, 0.749) });
    page.drawText("Proof of purchase", { x: 48, y: 766, size: 11, font: regular, color: rgb(0.36, 0.4, 0.45) });
    let y = 730;
    for (const line of lines.slice(start, start + perPage)) {
      page.drawText(line.text, { x: 48, y, size: line.strong ? 11 : 9.5, font: line.strong ? bold : regular, color: rgb(0.1, 0.12, 0.14) });
      y -= line.strong ? 18 : 15;
    }
  }

  if (original?.byteLength) {
    try {
      if (new TextDecoder().decode(original.slice(0, 5)) === "%PDF-") {
        const originalDocument = await PDFDocument.load(original, { ignoreEncryption: false });
        const copiedPages = await document.copyPages(originalDocument, originalDocument.getPageIndices());
        copiedPages.forEach((page) => document.addPage(page));
      } else {
        const image = original[0] === 0xff && original[1] === 0xd8
          ? await document.embedJpg(original)
          : await document.embedPng(original);
        const page = document.addPage([595, 842]);
        const scale = Math.min(499 / image.width, 746 / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        page.drawImage(image, { x: (595 - width) / 2, y: (842 - height) / 2, width, height });
      }
    } catch (error) {
      console.warn("[generate-proof-pack] Original could not be appended", { name: error instanceof Error ? error.name : "unknown" });
    }
  }
  return document.save();
};

Deno.serve(async (request) => {
  console.log("[generate-proof-pack] request", { method: request.method, hasOrigin: Boolean(request.headers.get("Origin")), hasAuthorization: Boolean(request.headers.get("Authorization")) });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeadersFor(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!isTrustedOrigin(request)) return json(request, { error: "Request origin is not allowed" }, 403);

  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!bearer) {
    console.error("[generate-proof-pack] missing authorization");
    return json(request, { error: "Authentication is required" }, 401);
  }
  if (!supabaseUrl || !serviceRoleKey) return json(request, { error: "Proof of purchase is temporarily unavailable" }, 503);

  let receiptId = "";
  try {
    const body = await request.json();
    receiptId = typeof body.receiptId === "string" ? body.receiptId.trim() : "";
  } catch { return json(request, { error: "Invalid request" }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(receiptId)) return json(request, { error: "Invalid receipt" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: verified, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !verified.user) {
    console.error("[generate-proof-pack] authentication failed", { message: authError?.message });
    return json(request, { error: "Authentication could not be verified" }, 403);
  }

  const { data: receipt, error: receiptError } = await admin.from("receipts").select("id,user_id,merchant,amount,amount_gbp,subtotal,vat_amount,currency,transaction_date,category,source,storage_path,status,document_type,reference_number,order_number,invoice_number,customer_number,loyalty_member_id,card_last_4,return_date,warranty_date").eq("id", receiptId).eq("user_id", verified.user.id).maybeSingle<ReceiptRow>();
  if (receiptError || !receipt) {
    console.error("[generate-proof-pack] purchase lookup failed", { message: receiptError?.message });
    return json(request, { error: "Purchase not found" }, 404);
  }
  if (!['parsed', 'completed'].includes(receipt.status || '')) return json(request, { error: "Proof of purchase is available once a receipt is ready" }, 409);
  if (!receipt.storage_path) return json(request, { error: "No original receipt is available for this receipt" }, 409);

  const [itemsResult, paymentsResult] = await Promise.all([
    admin.from("receipt_items").select("description,quantity,quantity_unit,unit_price,line_total").eq("receipt_id", receipt.id).order("line_index"),
    admin.from("receipt_payments").select("method,amount,currency").eq("receipt_id", receipt.id),
  ]);
  if (itemsResult.error || paymentsResult.error) {
    console.error("[generate-proof-pack] child lookup failed", { items: itemsResult.error?.message, payments: paymentsResult.error?.message });
    return json(request, { error: "Purchase details are temporarily unavailable" }, 503);
  }

  const referenceLines: Array<{ text: string }> = [
    ...(asText(receipt.order_number) ? [{ text: `Order number: ${receipt.order_number}` }] : []),
    ...(asText(receipt.invoice_number) ? [{ text: `Invoice number: ${receipt.invoice_number}` }] : []),
    ...(asText(receipt.reference_number) && !/^EMAIL-/i.test(asText(receipt.reference_number)) ? [{ text: `Reference: ${receipt.reference_number}` }] : []),
    ...(asText(receipt.customer_number) ? [{ text: `Customer number: ${receipt.customer_number}` }] : []),
    ...(asText(receipt.loyalty_member_id) ? [{ text: `Loyalty number: ${receipt.loyalty_member_id}` }] : []),
  ];
  const itemLines = ((itemsResult.data || []) as ItemRow[]).map((item) => ({ text: `${asText(item.description) || "Item"}${toNumber(item.quantity) !== null ? ` · ${item.quantity}${asText(item.quantity_unit) ? ` ${item.quantity_unit}` : ""}` : ""}${toNumber(item.line_total) !== null ? ` · ${money(receipt.currency, item.line_total)}` : toNumber(item.unit_price) !== null ? ` · ${money(receipt.currency, item.unit_price)}` : ""}` }));
  const paymentLines = ((paymentsResult.data || []) as PaymentRow[]).map((payment) => ({ text: `${asText(payment.payment_method) || asText(payment.method) || "Card"} · ${money(payment.currency || receipt.currency, payment.amount)}` }));
  const lines: Array<{ text: string; strong?: boolean }> = [
    { text: "PROOF OF PURCHASE", strong: true },
    { text: `Store: ${asText(receipt.merchant) || "Store unknown"}` },
    { text: `Date: ${britishDate(asText(receipt.transaction_date))}` },
    { text: `Amount: ${money(receipt.currency, receipt.amount)}` },
    ...(referenceLines.length ? [{ text: "" }, { text: "REFERENCES", strong: true }, ...referenceLines] : []),
    ...(itemLines.length ? [{ text: "" }, { text: "ITEMS", strong: true }, ...itemLines] : []),
    ...(paymentLines.length ? [{ text: "" }, { text: "PAYMENT", strong: true }, ...paymentLines] : []),
    ...(asText(receipt.return_date) || asText(receipt.warranty_date) ? [{ text: "" }, { text: "AFTERCARE", strong: true }] : []),
    ...(asText(receipt.return_date) ? [{ text: `Return by: ${britishDate(receipt.return_date)}` }] : []),
    ...(asText(receipt.warranty_date) ? [{ text: `Warranty until: ${britishDate(receipt.warranty_date)}` }] : []),
    { text: "" },
    { text: "Created for returns, warranties or insurance." },
  ];

  const { data: originalBlob, error: originalError } = await admin.storage.from("receipts").download(receipt.storage_path);
  if (originalError || !originalBlob) {
    console.error("[generate-proof-pack] original download failed", { message: originalError?.message });
    return json(request, { error: "The original receipt could not be included. Please try again." }, 503);
  }

  const packId = crypto.randomUUID();
  const storagePath = `${verified.user.id}/${receipt.id}/${packId}.pdf`;
  const pdf = await createProofPdf(lines, new Uint8Array(await originalBlob.arrayBuffer()));
  const { error: uploadError } = await admin.storage.from("proof-packs").upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[generate-proof-pack] storage upload failed", { message: uploadError.message });
    return json(request, { error: "We could not prepare proof of purchase. Please try again." }, 503);
  }

  const { error: recordError } = await admin.from("proof_packs").insert({ id: packId, user_id: verified.user.id, receipt_id: receipt.id, storage_path: storagePath, status: "ready" });
  if (recordError) {
    console.error("[generate-proof-pack] record insert failed", { message: recordError.message });
    await admin.storage.from("proof-packs").remove([storagePath]);
    return json(request, { error: "We could not save proof of purchase. Please try again." }, 503);
  }
  await admin.from("purchase_activity").insert({ user_id: verified.user.id, receipt_id: receipt.id, event_type: "proof_pack_generated" });
  const { data: signed, error: signedError } = await admin.storage.from("proof-packs").createSignedUrl(storagePath, 60);
  if (signedError || !signed?.signedUrl) {
    console.error("[generate-proof-pack] signed URL failed", { message: signedError?.message });
    return json(request, { error: "Proof of purchase was created but could not be opened. Please try again." }, 503);
  }

  return json(request, { packId, downloadUrl: signed.signedUrl, expiresInSeconds: 60 });
});
