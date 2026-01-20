/*
  # Enable Realtime on Receipts Table

  ## Overview
  Enables Supabase Realtime functionality on the receipts table so clients can receive
  real-time updates when receipts are inserted, updated, or deleted.

  ## Changes
  1. Enable Realtime publications for the receipts table
    - This allows subscribed clients to receive postgres_changes events
    - Works with Row Level Security - clients only receive events for rows they can access
    - Essential for auto-updating the wallet when receipts are added via Make.com or scan

  ## Security Notes
  - Realtime respects existing RLS policies
  - Users will only receive events for their own receipts
  - No additional security configuration needed
*/

-- Enable realtime for the receipts table
ALTER PUBLICATION supabase_realtime ADD TABLE receipts;
