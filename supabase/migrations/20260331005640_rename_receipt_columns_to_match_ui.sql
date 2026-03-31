/*
  # Rename receipt columns to match UI schema

  1. Changes to receipts table
    - Rename `date` to `transaction_date`
    - Rename `summary` to `short_summary`
    - Rename `vat` to `vat_amount`
    
  2. Notes
    - These changes align the database schema with the Supabase UI configuration
    - All existing data will be preserved during the column renames
*/

-- Rename date to transaction_date
ALTER TABLE receipts RENAME COLUMN date TO transaction_date;

-- Rename summary to short_summary
ALTER TABLE receipts RENAME COLUMN summary TO short_summary;

-- Rename vat to vat_amount
ALTER TABLE receipts RENAME COLUMN vat TO vat_amount;