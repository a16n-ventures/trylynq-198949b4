-- Create notifications table for persistent notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'nearby_user', 'friend_request', 'event_invite', 'location_share', 'story_reply', 'message'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  sender_id UUID,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own notifications" 
ON public.notifications 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" 
ON public.notifications 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications" 
ON public.notifications 
FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Service can create notifications for users"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Create indexes for efficient queries
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read) WHERE is_read = false;

-- Function to clean up old read notifications (older than 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM public.notifications 
  WHERE is_read = true AND created_at < (now() - interval '30 days');
  
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL AND expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;