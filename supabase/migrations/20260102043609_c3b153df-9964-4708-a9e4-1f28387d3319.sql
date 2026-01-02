-- Add muted_until column to community_members table for mute moderation feature
ALTER TABLE public.community_members 
ADD COLUMN IF NOT EXISTS muted_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;