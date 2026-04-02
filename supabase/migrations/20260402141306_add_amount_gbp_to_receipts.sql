/*
  # Add amount_gbp column to receipts table

  1. Changes to receipts table
    - Add `amount_gbp` column (numeric) to store GBP converted amounts
    - This will be used to display all amounts in GBP for consistency in the UI
    - The original `amount` column remains for reference/history

  2. Notes
    - amount_gbp will be populated with amount value initially
    - This allows storing original currency amounts while displaying GBP equivalents
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'amount_gbp'
  ) THEN
    ALTER TABLE receipts ADD COLUMN amount_gbp numeric;
  END IF;
END $$;

-- Update existing receipts to have amount_gbp equal to amount
UPDATE receipts SET amount_gbp = amount WHERE amount_gbp IS NULL;