/* A shared invoice reference plus exact total/currency remains a very strong
   signal. Permit common legal-suffix variants such as Limited/Ltd while still
   requiring recognisable merchant similarity and all other strong signals. */

do $$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef('public.refresh_receipt_possible_duplicate(uuid)'::regprocedure)
    into function_definition;
  updated_definition := replace(
    function_definition,
    'same_reference and merchant_similarity >= 0.70',
    'same_reference and merchant_similarity >= 0.55'
  );

  if updated_definition = function_definition then
    raise exception 'Expected possible-duplicate reference threshold was not found';
  end if;

  execute updated_definition;
end;
$$;
