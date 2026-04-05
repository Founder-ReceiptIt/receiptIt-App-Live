/*
  # Add Admin Review System Tables

  1. New Tables
    - `admin_review_queue`
      - Tracks items flagged for internal review/debugging
      - Links to receipts, updates, or miscellaneous items
      - Allows filtering by status, type, and severity
      - Stores internal notes and debugging context
    - `admin_actions_log`
      - Audit trail of admin actions taken
      - Tracks what was changed, when, and why
      - Helps with debugging and understanding system state

  2. Purpose
    - Lightweight internal admin interface for inspecting problematic items
    - Faster debugging without constant backend tool access
    - Support for manual correction of edge cases
    - Clear visibility into failed/review/odd records
    - Internal-only tools, not user-facing

  3. Behavior
    - Items can be reviewed, corrected, approved, or rejected
    - Actions create audit trail for debugging
    - Linked to user records but kept internal
    - No impact on user-facing experience
    - RLS prevents public access
*/

CREATE TABLE IF NOT EXISTS admin_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  item_type text CHECK (item_type IN ('receipt', 'update', 'miscellaneous', 'duplicate_case', 'system_error')),
  item_id uuid,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'rejected', 'archived')),
  severity text DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high', 'critical')),
  category text CHECK (category IN ('failed', 'needs_review', 'duplicate_issue', 'classification_error', 'data_quality', 'edge_case', 'other')),
  
  reason text,
  internal_notes text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  
  merchant text,
  amount numeric,
  transaction_date date,
  reference_id text,
  source_context jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id),
  action_type text CHECK (action_type IN ('review_item', 'reclassify', 'approve', 'reject', 'merge_duplicate', 'update_status', 'add_note', 'resolve')),
  item_type text,
  item_id uuid,
  review_queue_id uuid REFERENCES admin_review_queue(id),
  
  change_details jsonb,
  reason text,
  
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admin users can access review queue"
  ON admin_review_queue FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.plan IN ('admin', 'internal')
    )
  );

CREATE POLICY "Only admin users can update review queue"
  ON admin_review_queue FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.plan IN ('admin', 'internal')
    )
  );

CREATE POLICY "Only admin users can insert to review queue"
  ON admin_review_queue FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.plan IN ('admin', 'internal')
    )
  );

CREATE POLICY "Only admin users can view actions log"
  ON admin_actions_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.plan IN ('admin', 'internal')
    )
  );

CREATE POLICY "Only admin users can insert actions log"
  ON admin_actions_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.plan IN ('admin', 'internal')
    )
  );

CREATE INDEX IF NOT EXISTS admin_review_queue_status_idx ON admin_review_queue(status, category);
CREATE INDEX IF NOT EXISTS admin_review_queue_user_idx ON admin_review_queue(user_id);
CREATE INDEX IF NOT EXISTS admin_review_queue_severity_idx ON admin_review_queue(severity);
CREATE INDEX IF NOT EXISTS admin_actions_log_user_idx ON admin_actions_log(admin_id);
CREATE INDEX IF NOT EXISTS admin_actions_log_review_queue_idx ON admin_actions_log(review_queue_id);
