-- Create profile_links table to store user links in the database
CREATE TABLE public.profile_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_profile_links_user_id ON public.profile_links(user_id);
CREATE INDEX idx_profile_links_sort_order ON public.profile_links(user_id, sort_order);

-- Enable RLS
ALTER TABLE public.profile_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view anyone's links (public profile info)
CREATE POLICY "Profile links are viewable by everyone"
ON public.profile_links
FOR SELECT
USING (true);

-- Users can only manage their own links
CREATE POLICY "Users can create their own links"
ON public.profile_links
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own links"
ON public.profile_links
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own links"
ON public.profile_links
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_profile_links_updated_at
BEFORE UPDATE ON public.profile_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();