/* Legacy demo keys were seeded in an early prototype migration. They are
   public source history, so they must never authorize a beta account. */

begin;

update public.access_codes
set is_active = false
where code in ('ALPHA2026', 'RECEIPTIT-ALPHA', 'PARTNER-ACCESS')
  and coalesce(is_active, true) is distinct from false;

commit;
