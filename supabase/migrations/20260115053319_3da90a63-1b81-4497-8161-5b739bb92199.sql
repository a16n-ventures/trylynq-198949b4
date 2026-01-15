-- Create user_ads table for user-submitted advertisements
CREATE TABLE public.user_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  post_id UUID REFERENCES public.social_posts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  link_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'paused', 'completed', 'expired')),
  goal TEXT DEFAULT 'profile_visits' CHECK (goal IN ('profile_visits', 'website_clicks', 'engagement', 'brand_awareness')),
  target_audience TEXT DEFAULT 'all',
  target_location TEXT,
  daily_budget NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_budget NUMERIC(10, 2) NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 1,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  payment_reference TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  amount_paid NUMERIC(10, 2) DEFAULT 0,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_ads ENABLE ROW LEVEL SECURITY;

-- Users can view their own ads
CREATE POLICY "Users can view their own ads"
ON public.user_ads
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own ads
CREATE POLICY "Users can create their own ads"
ON public.user_ads
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own ads
CREATE POLICY "Users can update their own ads"
ON public.user_ads
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own pending ads
CREATE POLICY "Users can delete their own pending ads"
ON public.user_ads
FOR DELETE
USING (auth.uid() = user_id AND status = 'pending');

-- Create index for better query performance
CREATE INDEX idx_user_ads_user_id ON public.user_ads(user_id);
CREATE INDEX idx_user_ads_status ON public.user_ads(status);
CREATE INDEX idx_user_ads_active ON public.user_ads(status, start_date, end_date) WHERE status = 'active';

-- Create trigger for updated_at
CREATE TRIGGER update_user_ads_updated_at
BEFORE UPDATE ON public.user_ads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();