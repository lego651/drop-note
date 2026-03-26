-- Fix invite_codes UPDATE policy: add WITH CHECK to restrict which columns can be modified
DROP POLICY IF EXISTS "invite_codes: claim unclaimed" ON public.invite_codes;

CREATE POLICY "invite_codes: claim unclaimed"
  ON public.invite_codes FOR UPDATE
  USING (used_by IS NULL)
  WITH CHECK (
    used_by = auth.uid()
    AND code = (SELECT code FROM public.invite_codes WHERE id = invite_codes.id)
    AND created_by = (SELECT created_by FROM public.invite_codes WHERE id = invite_codes.id)
  );

-- Add explicit UNIQUE constraint on tags(user_id, name) for PostgREST upsert compatibility.
-- Tags are always stored lowercase (normalized before insert), so this is equivalent to
-- the existing functional index on (user_id, lower(name)).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tags_user_id_name_key'
  ) THEN
    ALTER TABLE public.tags ADD CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name);
  END IF;
END $$;

-- Add welcome_email_sent flag to track whether we've sent the welcome email.
-- Replaces the fragile 30-second window check in auth/callback.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS welcome_email_sent boolean NOT NULL DEFAULT false;
