-- Create message_reactions table for storing emoji reactions
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Create community_message_reactions table for community message reactions
CREATE TABLE public.community_message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.community_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_reactions
CREATE POLICY "Users can view reactions on messages they're part of"
ON public.message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.messages m 
    WHERE m.id = message_id 
    AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

CREATE POLICY "Users can add reactions to messages they're part of"
ON public.message_reactions FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.messages m 
    WHERE m.id = message_id 
    AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

CREATE POLICY "Users can remove their own reactions"
ON public.message_reactions FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for community_message_reactions
CREATE POLICY "Community members can view reactions"
ON public.community_message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.community_messages cm
    JOIN public.community_members mem ON mem.community_id = cm.community_id
    WHERE cm.id = message_id AND mem.user_id = auth.uid()
  )
);

CREATE POLICY "Community members can add reactions"
ON public.community_message_reactions FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.community_messages cm
    JOIN public.community_members mem ON mem.community_id = cm.community_id
    WHERE cm.id = message_id AND mem.user_id = auth.uid()
  )
);

CREATE POLICY "Users can remove their own community reactions"
ON public.community_message_reactions FOR DELETE
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_message_reactions_message_id ON public.message_reactions(message_id);
CREATE INDEX idx_community_message_reactions_message_id ON public.community_message_reactions(message_id);