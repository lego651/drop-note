-- Function: create public.users row on new auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, drop_token)
  VALUES (
    NEW.id,
    NEW.email,
    gen_random_uuid()
  );
  RETURN NEW;
END;
$$;

-- Trigger: fire after every new auth user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
