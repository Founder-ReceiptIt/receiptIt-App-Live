/*
  # Add Duplicate Detection to Receipts

  1. New Columns
    - `file_hash` (text, nullable): SHA-256 hash of the file for exact duplicate detection
    - `duplicate_of` (uuid, nullable): References the original receipt ID if this is a duplicate
    - `is_duplicate` (boolean, default false): Flag to mark known duplicates
    - `original_receipt_id` (uuid, nullable): Points to the original if this was re-scanned

  2. Indexes
    - Index on (user_id, file_hash) for fast duplicate checking
    - Index on (user_id, duplicate_of) for finding related duplicates

  3. Purpose
    - Enable reliable duplicate detection across email, scan, and upload paths
    - Track which receipts are duplicates of others
    - Support re-upload/resend scenarios cleanly
    - Keep wallet state clean by avoiding ghost duplicates

  4. Behavior
    - Active receipts with status='completed' or 'processing' block re-addition
    - Archived/deleted receipts do not block re-addition
    - When duplicate detected, link to original rather than creating confusing multiples
    - System can later suggest linking or merging if needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'file_hash'
  ) THEN
    ALTER TABLE receipts ADD COLUMN file_hash text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'duplicate_of'
  ) THEN
    ALTER TABLE receipts ADD COLUMN duplicate_of uuid REFERENCES receipts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'is_duplicate'
  ) THEN
    ALTER TABLE receipts ADD COLUMN is_duplicate boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'original_receipt_id'
  ) THEN
    ALTER TABLE receipts ADD COLUMN original_receipt_id uuid REFERENCES receipts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receipts_user_file_hash_idx ON receipts(user_id, file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS receipts_user_duplicate_idx ON receipts(user_id, duplicate_of) WHERE duplicate_of IS NOT NULL;
