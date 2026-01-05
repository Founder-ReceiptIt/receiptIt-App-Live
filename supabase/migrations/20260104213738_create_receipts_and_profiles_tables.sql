/*
  # Create receiptIt Database Schema

  ## Overview
  Creates the core database schema for the receiptIt application including user profiles and receipt storage.

  ## Tables Created

  ### 1. profiles
  Stores user profile information and statistics
  - `id` (uuid, primary key) - Unique profile identifier
  - `user_id` (uuid, references auth.users) - Link to authenticated user
  - `email_alias` (text) - User's privacy-protected email alias (e.g., steve@receiptIt.app)
  - `receipts_captured` (integer, default 0) - Count of total receipts captured
  - `spam_blocked` (integer, default 0) - Count of spam emails blocked
  - `warranties_tracked` (integer, default 0) - Count of active warranties
  - `created_at` (timestamptz, default now()) - Profile creation timestamp

  ### 2. receipts
  Stores all receipt data captured from users
  - `id` (uuid, primary key) - Unique receipt identifier
  - `user_id` (uuid, references auth.users) - Owner of the receipt
  - `merchant` (text) - Store/merchant name
  - `amount` (numeric) - Total amount including tax
  - `subtotal` (numeric) - Amount before tax
  - `vat` (numeric) - Tax/VAT amount
  - `vat_rate` (numeric, default 20) - Tax rate percentage
  - `currency` (text, default '£') - Currency symbol
  - `date` (date) - Receipt/purchase date
  - `tag` (text) - Category tag (Tech, Food, Clothing, etc.)
  - `has_warranty` (boolean, default false) - Whether item has warranty
  - `warranty_months` (integer, nullable) - Warranty duration in months
  - `reference_number` (text) - Receipt reference/order number
  - `email_alias` (text) - Email alias used for this purchase
  - `items` (jsonb, nullable) - Array of purchased items with name, quantity, price
  - `payment_method` (text, nullable) - Payment method used
  - `location` (text, nullable) - Store location
  - `folder` (text, default 'personal') - Organization folder (work/personal)
  - `created_at` (timestamptz, default now()) - Record creation timestamp

  ## Security

  ### Row Level Security (RLS)
  - RLS is enabled on both tables
  - Users can only access their own data
  - All policies check `auth.uid()` to ensure data isolation

  ### Policies Created

  #### profiles table:
  1. "Users can view own profile" - SELECT access to own profile
  2. "Users can insert own profile" - INSERT access for profile creation
  3. "Users can update own profile" - UPDATE access to own profile

  #### receipts table:
  1. "Users can view own receipts" - SELECT access to own receipts
  2. "Users can insert own receipts" - INSERT access for new receipts
  3. "Users can update own receipts" - UPDATE access to own receipts
  4. "Users can delete own receipts" - DELETE access to own receipts

  ## Important Notes
  - All tables use UUID primary keys for security and scalability
  - Timestamps use `timestamptz` for timezone awareness
  - JSONB used for flexible item storage
  - Foreign key constraints maintain referential integrity
  - Numeric type used for precise financial calculations
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email_alias text NOT NULL,
  receipts_captured integer DEFAULT 0,
  spam_blocked integer DEFAULT 0,
  warranties_tracked integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  merchant text NOT NULL,
  amount numeric NOT NULL,
  subtotal numeric NOT NULL,
  vat numeric NOT NULL,
  vat_rate numeric DEFAULT 20,
  currency text DEFAULT '£',
  date date NOT NULL,
  tag text NOT NULL,
  has_warranty boolean DEFAULT false,
  warranty_months integer,
  reference_number text NOT NULL,
  email_alias text NOT NULL,
  items jsonb,
  payment_method text,
  location text,
  folder text DEFAULT 'personal',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own receipts"
  ON receipts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own receipts"
  ON receipts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own receipts"
  ON receipts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own receipts"
  ON receipts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS receipts_user_id_idx ON receipts(user_id);
CREATE INDEX IF NOT EXISTS receipts_date_idx ON receipts(date DESC);
CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles(user_id);
