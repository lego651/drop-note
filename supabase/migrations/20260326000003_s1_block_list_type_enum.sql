-- S1-R013: Replace text+CHECK with a proper ENUM for block_list.type.
-- Must drop the CHECK constraint first — PostgreSQL cannot resolve the equality
-- operator between the new ENUM and the text literals in the constraint during
-- the ALTER COLUMN, causing "operator does not exist: block_list_entry_type = text".
ALTER TABLE public.block_list
  DROP CONSTRAINT IF EXISTS block_list_type_check;

CREATE TYPE public.block_list_entry_type AS ENUM ('email', 'ip');

ALTER TABLE public.block_list
  ALTER COLUMN type TYPE public.block_list_entry_type
  USING type::public.block_list_entry_type;
