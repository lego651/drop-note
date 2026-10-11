-- DRO-16: /api/ingest trusted the unverified SMTP `From` header as user
-- identity with no SPF/DKIM check. This column records whether SendGrid
-- Inbound Parse's SPF/dkim fields confirmed the claimed sender domain at
-- ingest time, so spoofed items can be flagged in the UI.
--
-- NULL = ingested before this check existed (not retroactively flagged).
-- New ingests always write true or false explicitly.
alter table public.items
  add column sender_verified boolean;

comment on column public.items.sender_verified is
  'True if SPF or DKIM passed for the From domain at ingest time (SendGrid Inbound Parse). NULL for items ingested before this check existed (DRO-16).';
