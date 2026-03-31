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

export interface Receipt {
  id: string;
  user_id: string;
  merchant: string;
  amount: number;
  subtotal: number;
  vat_amount: number;
  vat_rate: number | null;
  currency: string;
  transaction_date: string;
  tag: string;
  has_warranty: boolean | null;
  warranty_months: number | null;
  reference_number: string;
  email_alias: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }> | null;
  payment_method: string | null;
  location: string | null;
  folder: string | null;
  created_at: string;
  status: string | null;
  storage_path: string | null;
  image_url: string | null;
  warranty_date: string | null;
  category: string | null;
  currency_symbol: string | null;
  card_last_4: string | null;
  short_summary: string | null;
  return_window_days: number | null;
  return_window_end_date: string | null;
  return_date: string | null;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  email_alias: string | null;
  username: string | null;
  receipts_captured: number | null;
  spam_blocked: number | null;
  warranties_tracked: number | null;
  created_at: string;
}
