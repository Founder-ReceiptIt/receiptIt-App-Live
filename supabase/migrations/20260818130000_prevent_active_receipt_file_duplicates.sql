/*
  Prevent duplicate active receipt jobs for the exact same uploaded file.

  The front end checks first for a friendly experience, but two tabs (or two
  devices) can still upload simultaneously. This trigger is the authoritative
  final guard: a failed receipt remains re-uploadable, while an active or
  completed one is never sent through the processor twice.
*/

CREATE OR REPLACE FUNCTION public.prevent_active_receipt_file_duplicate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  existing_receipt_id uuid;
BEGIN
  IF NEW.file_hash IS NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize only identical user/file pairs. This closes the race between
  -- the friendly client-side check and the actual insert.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || ':' || NEW.file_hash, 0)
  );

  SELECT id
  INTO existing_receipt_id
  FROM public.receipts
  WHERE user_id = NEW.user_id
    AND file_hash = NEW.file_hash
    AND status IN ('processing', 'parsed', 'completed', 'needs_review', 'needs_input', 'duplicate')
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'This exact receipt file is already active or saved',
      DETAIL = 'existing_receipt_id=' || existing_receipt_id::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_active_receipt_file_duplicate ON public.receipts;

CREATE TRIGGER prevent_active_receipt_file_duplicate
BEFORE INSERT ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_active_receipt_file_duplicate();
