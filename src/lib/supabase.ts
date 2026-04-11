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

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  line_index: number;
  description: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  vat_amount: number | null;
  vat_rate: number | null;
  created_at?: string | null;
}

export interface Receipt {
  id: string;
  user_id: string;
  merchant: string;
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
  source: string | null;
  error_reason: string | null;
  processing_attempts: number | null;
  receipt_hash: string | null;
  confidence_score: number | null;
  parsed_at: string | null;
  items?: ReceiptItem[] | null;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  email_alias: string | null;
  plan: string | null;
  created_at: string;
  username: string | null;
}
