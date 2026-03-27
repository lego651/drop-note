-- Sprint 4: Add notes and group_id columns to items
-- notes: user-authored free-text annotation per item (not AI-generated, nullable)
-- group_id: links all items from the same email ingest (body + attachments), set by worker

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS group_id uuid;

CREATE INDEX IF NOT EXISTS idx_items_group_id ON public.items(group_id);
