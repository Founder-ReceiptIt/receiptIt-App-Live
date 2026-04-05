/*
  # Create Updates Table

  1. New Table
    - `updates`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `update_type` (text): 'order', 'shipping', 'delivery', 'return', 'refund', 'support', 'warranty'
      - `title` (text): Short title of the update
      - `description` (text, nullable): Full details
      - `merchant` (text, nullable): Merchant/sender name
      - `reference_id` (text, nullable): Link to receipt or order
      - `status` (text, default='unread'): 'unread', 'read', 'archived'
      - `created_at` (timestamp): When the update was created
      - `updated_at` (timestamp): Last modification

  2. Security
    - Enable RLS on `updates` table
    - Users can only read their own updates
    - Users can only update their own status
    - Users can only delete their own updates

  3. Indexes
    - Index on (user_id, status) for fast filtering
    - Index on (user_id, update_type) for categorization
    - Index on (user_id, created_at) for sorting
*/

CREATE TABLE IF NOT EXISTS updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  update_type text NOT NULL CHECK (update_type IN ('order', 'shipping', 'delivery', 'return', 'refund', 'support', 'warranty')),
  title text NOT NULL,
  description text,
  merchant text,
  reference_id text,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE updates ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_updates_user_status ON updates(user_id, status);
CREATE INDEX idx_updates_user_type ON updates(user_id, update_type);
CREATE INDEX idx_updates_user_created ON updates(user_id, created_at DESC);

CREATE POLICY "Users can read own updates"
  ON updates
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own update status"
  ON updates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own updates"
  ON updates
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
