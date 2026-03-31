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
  currency: string;
  transaction_date: string;
  category: string | null;
  reference_number: string;
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
