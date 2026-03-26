-- users table (extends auth.users)
CREATE TYPE public.user_tier AS ENUM ('free', 'pro', 'power');

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  tier public.user_tier NOT NULL DEFAULT 'free',
  drop_token uuid UNIQUE,
  stripe_customer_id text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- items table
CREATE TYPE public.item_type AS ENUM ('email_body', 'attachment');
CREATE TYPE public.item_status AS ENUM ('pending', 'processing', 'done', 'failed');

CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type public.item_type NOT NULL,
  subject text,
  sender_email text NOT NULL,
  filename text,
  storage_path text,
  ai_summary text,
  status public.item_status NOT NULL DEFAULT 'pending',
  error_message text,
  pinned boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_user_id_created_at ON public.items(user_id, created_at DESC);

-- tags table
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_user_id_name_lower_idx ON public.tags(user_id, lower(name));

-- item_tags table
CREATE TABLE public.item_tags (
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

-- site_settings table
CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO public.site_settings (key, value) VALUES
  ('registration_mode', 'open'),
  ('open_slots', '50');

-- block_list table
CREATE TABLE public.block_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('email', 'ip')),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- invite_codes table
CREATE TABLE public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id),
  used_by uuid REFERENCES public.users(id),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- usage_log table
CREATE TABLE public.usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
