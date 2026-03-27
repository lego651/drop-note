-- S506: Add unique constraint to block_list(type, value) for upsert support
ALTER TABLE public.block_list ADD CONSTRAINT block_list_type_value_unique UNIQUE (type, value);
