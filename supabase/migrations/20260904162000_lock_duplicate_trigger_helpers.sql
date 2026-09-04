/* Trigger helpers are internal database plumbing, never browser RPCs. */

revoke all on function public.receiptit_refresh_possible_duplicate_from_receipt()
  from public, anon, authenticated;
revoke all on function public.receiptit_refresh_possible_duplicate_from_item()
  from public, anon, authenticated;
