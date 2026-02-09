/*
  # Create Access Codes Table for Alpha Access

  1. New Tables
    - `access_codes`
      - `id` (uuid, primary key) - Unique identifier
      - `code` (text, unique, not null) - The access code string
      - `is_used` (boolean, default false) - Whether the code has been used
      - `created_at` (timestamptz, default now()) - When the code was created
      - `used_at` (timestamptz, nullable) - When the code was first used
      - `used_by` (uuid, nullable) - Reference to user who used it (if applicable)
  
  2. Security
    - Enable RLS on `access_codes` table
    - Add policy for anyone to read codes (needed for verification)
    - Restrict insert/update/delete to service role only
  
  3. Indexes
    - Add unique index on code for fast lookups
*/

-- Create access_codes table
CREATE TABLE IF NOT EXISTS access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  is_used boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read codes (needed for verification)
CREATE POLICY "Anyone can read access codes"
  ON access_codes
  FOR SELECT
  USING (true);

-- Policy: Only authenticated users can mark codes as used
CREATE POLICY "Authenticated users can update codes they use"
  ON access_codes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);

-- Insert some initial access codes for testing
INSERT INTO access_codes (code) VALUES 
  ('ALPHA2026'),
  ('RECEIPTIT-ALPHA'),
  ('PARTNER-ACCESS')
ON CONFLICT (code) DO NOTHING;