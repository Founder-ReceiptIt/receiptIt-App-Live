/*
  # Add Return Date Column to Receipts

  1. Changes
    - Add `return_date` column to receipts table
      - Type: date (nullable)
      - Purpose: Track the last date when an item can be returned
      - Used for calculating "days left to return" countdown
  
  2. Notes
    - Column is optional (nullable) as not all receipts will have return policies
    - Works alongside warranty_date to track both warranty and return windows
    - No default value - must be set manually per receipt
*/

-- Add return_date column to receipts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'return_date'
  ) THEN
    ALTER TABLE receipts ADD COLUMN return_date date;
  END IF;
END $$;