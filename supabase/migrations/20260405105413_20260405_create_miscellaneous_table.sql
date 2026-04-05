/*
  # Create Miscellaneous Proof Documents Table

  1. New Table
    - `miscellaneous`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `item_type` (text): 'bag_tag', 'travel_proof', 'item_tracking', 'service_record', 'proof_of_ownership', 'proof_of_handling', 'misc'
      - `title` (text): Short title of the document
      - `description` (text, nullable): Full details
      - `merchant` (text, nullable): Source/origin name
      - `reference_id` (text, nullable): Link to receipt or order
      - `storage_path` (text, nullable): Path to file in storage
      - `status` (text, default='active'): 'active', 'archived'
      - `created_at` (timestamp): When the document was added
      - `updated_at` (timestamp): Last modification

  2. Security
    - Enable RLS on `miscellaneous` table
    - Users can only read their own documents
    - Users can only update their own status
    - Users can only delete their own documents

  3. Indexes
    - Index on (user_id, status) for fast filtering
    - Index on (user_id, item_type) for categorization
    - Index on (user_id, created_at) for sorting

  4. Purpose
    - Non-financial proof documents (bag tags, tracking proofs, service records, etc.)
    - These do NOT represent financial spend
    - Separate from receipts and updates for clarity
    - Useful for proof, tracking, ownership, and logistics
*/

CREATE TABLE IF NOT EXISTS miscellaneous (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('bag_tag', 'travel_proof', 'item_tracking', 'service_record', 'proof_of_ownership', 'proof_of_handling', 'misc')),
  title text NOT NULL,
  description text,
  merchant text,
  reference_id text,
  storage_path text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE miscellaneous ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_miscellaneous_user_status ON miscellaneous(user_id, status);
CREATE INDEX idx_miscellaneous_user_type ON miscellaneous(user_id, item_type);
CREATE INDEX idx_miscellaneous_user_created ON miscellaneous(user_id, created_at DESC);

CREATE POLICY "Users can read own miscellaneous"
  ON miscellaneous
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own miscellaneous status"
  ON miscellaneous
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own miscellaneous"
  ON miscellaneous
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
