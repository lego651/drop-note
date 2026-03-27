-- S3-R002: Enforce uniqueness of Stripe customer IDs at the DB level.
-- Prevents two users from ever sharing a Stripe customer, which would cause
-- webhook events to update the wrong user's tier.
ALTER TABLE public.users
  ADD CONSTRAINT users_stripe_customer_id_unique UNIQUE (stripe_customer_id);
