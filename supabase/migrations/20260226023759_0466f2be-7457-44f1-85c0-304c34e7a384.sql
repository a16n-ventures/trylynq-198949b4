
-- Fix: Drop the foreign key constraint on transactions.wallet_id that causes errors on paid event RSVP
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_wallet_id_fkey;

-- Make wallet_id nullable (if not already) so transactions can be created without a wallet
ALTER TABLE public.transactions 
  ALTER COLUMN wallet_id DROP NOT NULL;

-- Add is_premium column to communities for premium paid communities
ALTER TABLE public.communities 
  ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS join_fee numeric DEFAULT 0;

-- Add recurrence_rule to events if missing (should already exist but ensure)
-- Already exists per schema, no action needed
