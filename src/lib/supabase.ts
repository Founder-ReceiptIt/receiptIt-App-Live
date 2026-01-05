import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Receipt {
  id: string;
  user_id: string;
  merchant: string;
  amount: number;
  subtotal: number;
  vat: number;
  vat_rate: number;
  currency: string;
  date: string;
  tag: string;
  has_warranty: boolean;
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
  folder: 'work' | 'personal';
  created_at: string;
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
