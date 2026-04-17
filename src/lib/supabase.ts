import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('[Supabase Config] URL:', supabaseUrl);
console.log('[Supabase Config] Key exists:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log('[Supabase] Client initialized successfully');

export const FINALIZED_RECEIPT_STATUSES = ['parsed', 'completed'] as const;

export const isFinalizedReceiptStatus = (
  status: unknown
): status is typeof FINALIZED_RECEIPT_STATUSES[number] =>
  typeof status === 'string' && FINALIZED_RECEIPT_STATUSES.includes(status as typeof FINALIZED_RECEIPT_STATUSES[number]);

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  line_index: number;
  description?: string | null;
  item_type?: 'product' | 'charge' | 'discount' | string | null;
  quantity?: number | null;
  quantity_unit?: string | null;
  unit_price: number | null;
  line_total: number | null;
  vat_amount: number | null;
  vat_rate: number | null;
  created_at?: string | null;
}

/**
 * Interface representing a single receipt row returned from Supabase.
 *
 * Note: The database schema has evolved to support duplicate detection via file
 * hashes. The legacy `receipt_hash` column has been replaced with
 * `file_hash`. To ensure type safety and forward compatibility, this
 * interface includes the new duplicate detection fields as optional
 * properties. Consumers of this interface should prefer `file_hash` over
 * `receipt_hash` going forward.
 */
export interface Receipt {
  id: string;
  user_id: string;
  merchant: string;
  merchant_phone: string | null;
  merchant_email: string | null;
  merchant_website: string | null;
  merchant_address: string | null;
  merchant_vat_number: string | null;
  merchant_company_number: string | null;
  amount: number;
  amount_gbp: number | null;
  subtotal: number;
  vat_amount: number;
  discount_amount: number | null;
  currency: string;
  transaction_date: string;
  category: string | null;
  reference_number: string;
  customer_number: string | null;
  order_number: string | null;
  invoice_number: string | null;
  loyalty_member_id: string | null;
  created_at: string;
  status: string | null;
  storage_path: string | null;
  image_url: string | null;
  warranty_date: string | null;
  card_last_4: string | null;
  short_summary: string | null;
  return_date: string | null;
  folder?: string | null;
  source: string | null;
  error_reason: string | null;
  processing_attempts: number | null;
  /**
   * Legacy field kept for backwards compatibility. New code should use
   * `file_hash` instead. May be null if not set.
   */
  receipt_hash?: string | null;
  /**
   * SHA‑256 hash of the uploaded file for exact duplicate detection. When
   * present, this value can be used to reliably identify exact
   * duplicates across uploads. It supersedes `receipt_hash`.
   */
  file_hash?: string | null;
  /**
   * The ID of the original receipt if this row is considered a duplicate
   * of another. Used in conjunction with `is_duplicate` to group
   * duplicates together.
   */
  duplicate_of?: string | null;
  /**
   * Flag indicating whether this receipt row is a duplicate of another. When
   * true, `duplicate_of` should reference the original receipt.
   */
  is_duplicate?: boolean | null;
  /**
   * If this receipt was rescanned from an earlier original (for example,
   * reprocessing the same physical receipt), this points to that
   * original receipt's ID.
   */
  original_receipt_id?: string | null;
  confidence_score: number | null;
  parsed_at: string | null;
  items?: ReceiptItem[] | null;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  email_alias: string | null;
  spam_blocked?: number | null;
  plan: string | null;
  created_at: string;
  username: string | null;
}
