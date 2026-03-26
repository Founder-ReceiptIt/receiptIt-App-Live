/*
  # Add missing columns to receipts table

  ## Changes
  - Adds `warranty_date` column to store the actual warranty expiration date
  - Adds `category` column to store receipt category (Tech, Food, etc.)
  - Adds `currency_symbol` column to store the currency symbol (£, $, €, etc.)
  - Adds `card_last_4` column to store last 4 digits of payment card
  - Adds `summary` column to store receipt summary text

  ## Notes
  - All columns are nullable for backward compatibility
  - Existing receipts can be updated to populate these fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'warranty_date'
  ) THEN
    ALTER TABLE receipts ADD COLUMN warranty_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'category'
  ) THEN
    ALTER TABLE receipts ADD COLUMN category text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'currency_symbol'
  ) THEN
    ALTER TABLE receipts ADD COLUMN currency_symbol text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'card_last_4'
  ) THEN
    ALTER TABLE receipts ADD COLUMN card_last_4 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'summary'
  ) THEN
    ALTER TABLE receipts ADD COLUMN summary text;
  END IF;
END $$;
