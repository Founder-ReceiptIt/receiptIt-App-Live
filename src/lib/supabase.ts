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
  currency: string;
  transaction_date: string;
  short_summary: string | null;
  status: string | null;
  category: string | null;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }> | null;
  payment_method: string | null;
  location: string | null;
  folder: 'work' | 'personal';
  created_at: string;
  storage_path: string | null;
  image_url: string | null;
  reference_number: string | null;
  warranty_date: string | null;
  return_date: string | null;
}

export interface Profile {
  id: string;
  user_id: string;
  email_alias: string;
  receipts_captured: number;
  spam_blocked: number;
  warranties_tracked: number;
  created_at: string;
}
