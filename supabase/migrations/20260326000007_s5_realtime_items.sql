-- S501: Enable Realtime replication for items table
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
