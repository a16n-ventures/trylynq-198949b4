-- Create post_comments table
CREATE TABLE public.post_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view comments" 
ON public.post_comments 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create comments" 
ON public.post_comments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments" 
ON public.post_comments 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments" 
ON public.post_comments 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to increment comments count
CREATE OR REPLACE FUNCTION public.increment_post_comments(post_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.social_posts 
  SET comments_count = COALESCE(comments_count, 0) + 1 
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to decrement comments count
CREATE OR REPLACE FUNCTION public.decrement_post_comments(post_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.social_posts 
  SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) 
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for performance
CREATE INDEX idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX idx_post_comments_user_id ON public.post_comments(user_id);