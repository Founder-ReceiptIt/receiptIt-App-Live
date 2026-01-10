/*
  # Add status and storage tracking to receipts table

  ## Changes
  - Adds `status` column to track receipt processing state (pending, processing, completed, error)
  - Adds `storage_path` column to store the internal Supabase Storage path
  - Adds `image_url` column to store the public URL of the uploaded receipt image

  ## Migration Details
  - `status`: text with default 'completed' for existing records
  - `storage_path`: text, nullable
  - `image_url`: text, nullable
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'status'
  ) THEN
    ALTER TABLE receipts ADD COLUMN status text DEFAULT 'completed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE receipts ADD COLUMN storage_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE receipts ADD COLUMN image_url text;
  END IF;
END $$;
