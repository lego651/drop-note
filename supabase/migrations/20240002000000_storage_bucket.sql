-- Create private attachments bucket for file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: users can only read their own attachments (path starts with their user_id)
DROP POLICY IF EXISTS "Users can read own attachments" ON storage.objects;
CREATE POLICY "Users can read own attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role handles all writes (worker uses service role key)
