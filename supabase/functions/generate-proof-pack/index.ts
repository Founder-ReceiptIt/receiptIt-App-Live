import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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
  return amount === null ? "Not recorded" : `${(currency || "GBP").toUpperCase()} ${amount.toFixed(2)}`;
};

const pdfText = (value: string) => value
  .replace(/[\\()]/g, "\\$&")
  .replace(/[^\x20-\x7e]/g, " ");

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

const createPdf = (inputLines: Array<{ text: string; strong?: boolean }>) => {
  const lines = inputLines.flatMap(({ text, strong }) => wrap(text).map((line) => ({ text: line, strong })));
  const perPage = 47;
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / perPage)) }, (_, index) => lines.slice(index * perPage, (index + 1) * perPage));
  const objects: string[] = ["", "", "", ""];
  const pageObjectIds: number[] = [];

  for (const pageLines of pages) {
    const content = [
      "BT",
      "/F1 17 Tf",
      "50 790 Td",
      "21 TL",
      `(ReceiptIt Proof Pack) Tj`,
      "0 -10 Td",
      "/F1 9 Tf",
      "14 TL",
      "(Private purchase-evidence summary) Tj",
      "0 -22 Td",
    ];
    for (const line of pageLines) {
      if (line.strong) content.push("/F1 11 Tf");
      else content.push("/F1 9.5 Tf");
      content.push(`(${pdfText(line.text)}) Tj`, "T*");
    }
    content.push("ET");
    const contentText = content.join("\n");
    const contentId = objects.length;
    objects.push(`<< /Length ${new TextEncoder().encode(contentText).length} >>\nstream\n${contentText}\nendstream`);
    const pageId = objects.length;
    pageObjectIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
  }

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let output = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = new TextEncoder().encode(output).length;
    output += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(output).length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(output);
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
  if (!supabaseUrl || !serviceRoleKey) return json(request, { error: "Proof Pack is temporarily unavailable" }, 503);

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
  if (!['parsed', 'completed'].includes(receipt.status || '')) return json(request, { error: "Proof Pack is available once a purchase is ready" }, 409);
  if (!receipt.storage_path) return json(request, { error: "No secured original is available for this purchase" }, 409);

  const [itemsResult, paymentsResult] = await Promise.all([
    admin.from("receipt_items").select("description,quantity,quantity_unit,unit_price,line_total").eq("receipt_id", receipt.id).order("line_index"),
    admin.from("receipt_payments").select("method,amount,currency").eq("receipt_id", receipt.id),
  ]);
  if (itemsResult.error || paymentsResult.error) {
    console.error("[generate-proof-pack] child lookup failed", { items: itemsResult.error?.message, payments: paymentsResult.error?.message });
    return json(request, { error: "Purchase details are temporarily unavailable" }, 503);
  }

  const lines: Array<{ text: string; strong?: boolean }> = [
    { text: "PURCHASE SUMMARY", strong: true },
    { text: `Merchant: ${asText(receipt.merchant) || "Seller unknown"}` },
    { text: `Purchase date: ${asText(receipt.transaction_date) || "Not recorded"}` },
    { text: `Amount: ${money(receipt.currency, receipt.amount)}` },
    { text: `Category: ${asText(receipt.category) || "Other"}` },
    { text: `Captured via: ${asText(receipt.source) || "Scan"}` },
    { text: "" },
    { text: "EVIDENCE & REFERENCES", strong: true },
    ...(asText(receipt.order_number) ? [{ text: `Order number: ${receipt.order_number}` }] : []),
    ...(asText(receipt.invoice_number) ? [{ text: `Invoice number: ${receipt.invoice_number}` }] : []),
    ...(asText(receipt.reference_number) ? [{ text: `Reference: ${receipt.reference_number}` }] : []),
    ...(asText(receipt.customer_number) ? [{ text: `Customer reference: ${receipt.customer_number}` }] : []),
    ...(asText(receipt.loyalty_member_id) ? [{ text: `Member reference: ${receipt.loyalty_member_id}` }] : []),
    ...(asText(receipt.card_last_4) ? [{ text: `Card: ending ${receipt.card_last_4}` }] : []),
    { text: "Original document: securely retained in ReceiptIt and available only to the account owner through a time-limited private link." },
    { text: "" },
    { text: "ITEMS", strong: true },
    ...((itemsResult.data || []) as ItemRow[]).map((item) => ({ text: `${asText(item.description) || "Item"}${toNumber(item.quantity) !== null ? ` · Qty ${item.quantity}${asText(item.quantity_unit) ? ` ${item.quantity_unit}` : ""}` : ""}${toNumber(item.line_total) !== null ? ` · ${money(receipt.currency, item.line_total)}` : toNumber(item.unit_price) !== null ? ` · ${money(receipt.currency, item.unit_price)}` : ""}` })),
    ...((itemsResult.data || []).length ? [] : [{ text: "Item-level detail was not supplied by the original document." }]),
    { text: "" },
    { text: "PAYMENT", strong: true },
    ...((paymentsResult.data || []) as PaymentRow[]).map((payment) => ({ text: `${asText(payment.payment_method) || asText(payment.method) || "Payment"}: ${money(payment.currency || receipt.currency, payment.amount)}` })),
    ...((paymentsResult.data || []).length ? [] : [{ text: "Payment detail was not supplied by the original document." }]),
    { text: "" },
    { text: "PROTECTION", strong: true },
    ...(asText(receipt.return_date) ? [{ text: `Return deadline: ${receipt.return_date}` }] : []),
    ...(asText(receipt.warranty_date) ? [{ text: `Warranty expiry: ${receipt.warranty_date}` }] : []),
    ...(!asText(receipt.return_date) && !asText(receipt.warranty_date) ? [{ text: "No explicit return or warranty date was recorded." }] : []),
    { text: "" },
    { text: `Generated by ReceiptIt on ${new Date().toISOString().slice(0, 10)}.` },
    { text: "ReceiptIt organizes user-held evidence. It does not certify legal validity or guarantee claim acceptance." },
  ];

  const packId = crypto.randomUUID();
  const storagePath = `${verified.user.id}/${receipt.id}/${packId}.pdf`;
  const pdf = createPdf(lines);
  const { error: uploadError } = await admin.storage.from("proof-packs").upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[generate-proof-pack] storage upload failed", { message: uploadError.message });
    return json(request, { error: "We could not secure the Proof Pack. Please try again." }, 503);
  }

  const { error: recordError } = await admin.from("proof_packs").insert({ id: packId, user_id: verified.user.id, receipt_id: receipt.id, storage_path: storagePath, status: "ready" });
  if (recordError) {
    console.error("[generate-proof-pack] record insert failed", { message: recordError.message });
    await admin.storage.from("proof-packs").remove([storagePath]);
    return json(request, { error: "We could not save the Proof Pack. Please try again." }, 503);
  }
  await admin.from("purchase_activity").insert({ user_id: verified.user.id, receipt_id: receipt.id, event_type: "proof_pack_generated" });
  const { data: signed, error: signedError } = await admin.storage.from("proof-packs").createSignedUrl(storagePath, 60);
  if (signedError || !signed?.signedUrl) {
    console.error("[generate-proof-pack] signed URL failed", { message: signedError?.message });
    return json(request, { error: "Proof Pack created but could not be opened. Please try again." }, 503);
  }

  return json(request, { packId, downloadUrl: signed.signedUrl, expiresInSeconds: 60 });
});
