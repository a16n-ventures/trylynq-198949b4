-- Add parent_id column to post_comments for threaded discussions
ALTER TABLE public.post_comments 
ADD COLUMN parent_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE;

-- Add index for faster queries on parent_id
CREATE INDEX idx_post_comments_parent_id ON public.post_comments(parent_id);
