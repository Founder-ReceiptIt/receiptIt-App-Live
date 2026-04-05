/*
  # Add Needs Review Status Support

  1. Changes
    - The receipts table already has a `status` column that can hold 'needs_review'
    - This migration documents that 'needs_review' is a valid status value
    - Receipts with status='needs_review' should appear in the Review section
    - Receipts with status='completed' or 'processing' appear in the main wallet

  2. Status Values
    - 'processing': Receipt being uploaded/processed
    - 'completed': Receipt fully parsed and ready
    - 'needs_review': Receipt that needs user attention/clarification
*/

-- No schema changes needed, status column already supports all required values
-- This is a documentation/convention migration

SELECT 1;
