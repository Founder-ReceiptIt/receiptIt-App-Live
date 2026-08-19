-- Enforce the same upload contract at the private Storage boundary as the
-- client-side preflight. Client validation improves the experience, but must
-- not be the only protection before an object is stored or sent to processing.
--
-- This updates only the existing private `receipts` bucket. It does not move
-- objects, alter paths, or change Storage policies.
update storage.buckets
set
  file_size_limit = 10485760, -- 10 MiB
  allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']::text[]
where id = 'receipts';
